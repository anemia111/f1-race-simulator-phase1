import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const repoRoot = resolve(import.meta.dirname, '..')
const enforce = process.argv.includes('--enforce')
const noReport = process.argv.includes('--no-report')
const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  root: repoRoot,
  server: { middlewareMode: true },
})

const DELTA_SECONDS = 0.1
const TRACE_TICKS = 30
const EVALUATION_SPEED_KPH = 340
const POWER_TOLERANCE_KW = 1e-8
const ENERGY_TOLERANCE_MJ = 1e-10

const maximumAbsolute = (values) =>
  values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)

try {
  const energy = await server.ssrLoadModule('/src/simulation/energySystem.ts')
  const superClipping = await server.ssrLoadModule(
    '/src/simulation/superClipping.ts',
  )
  const vehicle = await server.ssrLoadModule(
    '/src/simulation/vehicleDynamics.ts',
  )
  const regulations = await server.ssrLoadModule(
    '/src/simulation/regulations.ts',
  )
  const { initialDrivers, initialTeams } = await server.ssrLoadModule(
    '/src/data/grid2026.ts',
  )

  const team = initialTeams.find((candidate) => candidate.id === 'ferrari')
  const driver = initialDrivers.find((candidate) => candidate.teamId === team.id)
  const rechargeRule = regulations.resolveF1RechargeRule({ stage: 'race' })
  const setup = {
    brakeBiasPercent: 56.5,
    coolingPercent: 55,
    differentialPercent: 58,
    frontWing: 2,
    rearWing: 2,
    rideHeightMm: 26,
  }
  const energyIntent = {
    propulsionAggression: 0.2,
    harvestPreference: 1,
    liftCoastPreference: 0.9,
    superclipAcceptance: 1,
    defendEnergyReserve: 0.2,
    attackEnergyReserve: 0.18,
  }

  const rechargeRemainingMJ = (state) =>
    state.rechargeRule.limit.kind === 'finite'
      ? state.rechargeRule.remainingMJ
      : state.rechargeRule.limit.kind === 'unlimited'
        ? Number.POSITIVE_INFINITY
        : 0

  const energyStepFor = (state, options) =>
    energy.advanceEnergyStore({
      ambientTemperatureC: 25,
      brakePercent: 0,
      combustionWheelPowerKw: options.combustionWheelPowerKw,
      deltaSeconds: options.deltaSeconds,
      deploymentDcPowerLimitKw:
        regulations.permittedMguKDcPowerKwForSpeed({
          curve: 'normal',
          speedKph: options.speedKph,
        }),
      deploymentRequest: options.deploymentRequest ?? 0,
      driverErsManagement: driver.skills.ersManagement,
      driverWetSkill: driver.skills.wetSkill,
      gripMultiplier: 1,
      rechargeRule: state.rechargeRule,
      speedKph: options.speedKph,
      state,
      superclipGeneratorRequestKw: options.generatorRequestKw,
      surfaceWaterMm: 0,
      team,
      throttlePercent: options.throttlePercent,
      tire: 'M',
      vehicleMassKg: 840,
    })

  const longitudinalAt = (generatorMechanicalPowerKw) =>
    vehicle.integrateVehicleLongitudinalStep({
      activeAeroMode: 'straight',
      airDensityKgM3: 1.1,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      currentSpeedKph: EVALUATION_SPEED_KPH,
      deltaSeconds: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      regenerativeResistancePowerKw: generatorMechanicalPowerKw,
      setup,
      team,
      throttlePercent: 100,
      towDragReduction: 0.07,
      turboSpoolFraction: 1,
    })

  const runTrace = () => {
    let state = energy.createInitialEnergyStore(team, 0.07, rechargeRule)
    let intensity = 0
    const initialStoredEnergyMJ = state.currentEnergyMJ
    const initialCuKBusRechargeMJ = state.rechargedAtCuKBusThisLapMJ
    const samples = []

    for (let tick = 0; tick < TRACE_TICKS; tick += 1) {
      const combustionWheelPowerKw = vehicle.combustionWheelPowerKwAt({
        clutchEngagementFraction: 1,
        currentSpeedKph: EVALUATION_SPEED_KPH,
        team,
        throttlePercent: 100,
        turboSpoolFraction: 1,
      })
      const request = superClipping.advanceSuperClipping({
        battlePhase: 'single-file',
        batteryPercent: state.stateOfCharge * 100,
        brakePercent: 0,
        currentIntensity: intensity,
        deltaSeconds: DELTA_SECONDS,
        deployedAtCuKBusThisLapMj: state.deployedAtCuKBusThisLapMJ,
        driver,
        energyIntent,
        fuelLoadKg: 70,
        gapToAheadSeconds: 3,
        lap: 8,
        lowGripConditions: false,
        phaseActive: false,
        racePaceMode: 'save',
        rechargeRemainingAtCuKBusMj: rechargeRemainingMJ(state),
        rechargedAtCuKBusThisLapMj: state.rechargedAtCuKBusThisLapMJ,
        sessionType: 'race-distance',
        speedKph: EVALUATION_SPEED_KPH,
        straightLengthAheadMeters: 900,
        straightness: 1,
        team,
        throttlePercent: 100,
      })
      const energyStep = energyStepFor(state, {
        combustionWheelPowerKw,
        deltaSeconds: DELTA_SECONDS,
        generatorRequestKw: request.requestedGeneratorMechanicalPowerKw,
        speedKph: EVALUATION_SPEED_KPH,
        throttlePercent: 100,
      })
      const actualSuperclipGeneratorMechanicalPowerKw =
        energyStep.actualRecoverySourcePowerKw.superclip
      const baseline = longitudinalAt(0)
      const clipped = longitudinalAt(
        actualSuperclipGeneratorMechanicalPowerKw,
      )

      samples.push({
        accelerationLossMps2:
          baseline.accelerationMps2 - clipped.accelerationMps2,
        actualDeploymentDcPowerKw:
          energyStep.state.actualDeploymentDcPowerKw,
        actualGeneratorMechanicalPowerKw:
          actualSuperclipGeneratorMechanicalPowerKw,
        actualTotalRecoveryMechanicalPowerKw:
          energyStep.state.actualRecoveryPowerKw,
        auditConversionChainErrorMJ:
          energyStep.audit.conversionChainErrorMJ,
        auditStoreBalanceErrorMJ: energyStep.audit.storeBalanceErrorMJ,
        baselineAccelerationMps2: baseline.accelerationMps2,
        baselineWheelDrivePowerKw: baseline.wheelDrivePowerKw,
        clippedAccelerationMps2: clipped.accelerationMps2,
        clippedGeneratorMechanicalPowerKw:
          clipped.generatorMechanicalPowerKw,
        clippedNetWheelPowerKw: clipped.netPowerUnitWheelPowerKw,
        clippedWheelDrivePowerKw: clipped.wheelDrivePowerKw,
        combustionWheelPowerKw,
        cuKBusRechargeThisLapMJ:
          energyStep.state.rechargedAtCuKBusThisLapMJ,
        intensity: request.intensity,
        operatingMode: energyStep.state.operatingMode,
        requestedGeneratorMechanicalPowerKw:
          request.requestedGeneratorMechanicalPowerKw,
        stateOfCharge: energyStep.state.stateOfCharge,
        storedEnergyThisLapMJ: energyStep.state.storedEnergyThisLapMJ,
        superclipCuKBusRechargeThisTickMJ:
          energyStep.audit.superclipRechargedAtCuKBusMJ,
        throttlePercent: 100,
        tick,
      })

      intensity = request.intensity
      state = energyStep.state
    }

    return {
      finalState: state,
      initialCuKBusRechargeMJ,
      initialStoredEnergyMJ,
      samples,
    }
  }

  const thresholdProbe = (generatorRequestKw) => {
    const state = energy.createInitialEnergyStore(team, 0.3, rechargeRule)
    const combustionWheelPowerKw = vehicle.combustionWheelPowerKwAt({
      clutchEngagementFraction: 1,
      currentSpeedKph: EVALUATION_SPEED_KPH,
      team,
      throttlePercent: 100,
      turboSpoolFraction: 1,
    })
    const result = energyStepFor(state, {
      combustionWheelPowerKw,
      deltaSeconds: DELTA_SECONDS,
      generatorRequestKw,
      speedKph: EVALUATION_SPEED_KPH,
      throttlePercent: 100,
    })

    return {
      actualGeneratorMechanicalPowerKw:
        result.actualRecoverySourcePowerKw.superclip,
      cuKBusRechargeMJ: result.audit.superclipRechargedAtCuKBusMJ,
      operatingMode: result.state.operatingMode,
      requestedGeneratorMechanicalPowerKw: generatorRequestKw,
    }
  }

  const first = runTrace()
  const second = runTrace()
  const firstTraceJson = JSON.stringify(first)
  const secondTraceJson = JSON.stringify(second)
  const belowEightKw = thresholdProbe(7.99)
  const aboveEightKw = thresholdProbe(8.01)
  const activeSamples = first.samples.filter(
    (sample) => sample.operatingMode === 'full-throttle-superclip',
  )
  const wheelDrivePowerResidualsKw = first.samples.map(
    (sample) =>
      sample.clippedWheelDrivePowerKw - sample.baselineWheelDrivePowerKw,
  )
  const generatorAgreementResidualsKw = first.samples.map(
    (sample) =>
      sample.clippedGeneratorMechanicalPowerKw -
      sample.actualGeneratorMechanicalPowerKw,
  )
  const netPowerTradeoffResidualsKw = first.samples.map(
    (sample) =>
      sample.baselineWheelDrivePowerKw -
      sample.clippedNetWheelPowerKw -
      sample.clippedGeneratorMechanicalPowerKw,
  )
  const storeResidualsMJ = first.samples.map(
    (sample) => sample.auditStoreBalanceErrorMJ,
  )
  const conversionResidualsMJ = first.samples.map(
    (sample) => sample.auditConversionChainErrorMJ,
  )
  const superclipCuKBusRechargeMJ = first.samples.reduce(
    (total, sample) =>
      total + sample.superclipCuKBusRechargeThisTickMJ,
    0,
  )
  const invariantFailures = []
  const requireInvariant = (condition, id) => {
    if (!condition) invariantFailures.push(id)
  }

  requireInvariant(
    activeSamples.length === TRACE_TICKS &&
      activeSamples.every(
        (sample) =>
          sample.throttlePercent >= 95 &&
          sample.combustionWheelPowerKw > 0 &&
          sample.actualGeneratorMechanicalPowerKw > 0,
      ),
    'actual-high-throttle-positive-ice-superclip',
  )
  requireInvariant(
    first.finalState.rechargedAtCuKBusThisLapMJ >
      first.initialCuKBusRechargeMJ &&
      first.finalState.storedEnergyThisLapMJ > 0 &&
      first.finalState.rechargedAtCuKBusThisLapMJ >
        first.finalState.storedEnergyThisLapMJ &&
      superclipCuKBusRechargeMJ > 0 &&
      Math.abs(
        superclipCuKBusRechargeMJ -
          (first.finalState.rechargedAtCuKBusThisLapMJ -
            first.initialCuKBusRechargeMJ),
      ) <= ENERGY_TOLERANCE_MJ,
    'cu-k-recharge-and-battery-loss',
  )
  requireInvariant(
    maximumAbsolute(wheelDrivePowerResidualsKw) <= POWER_TOLERANCE_KW,
    'no-parallel-drive-scale',
  )
  requireInvariant(
    maximumAbsolute(generatorAgreementResidualsKw) <= POWER_TOLERANCE_KW,
    'energy-to-wheel-generator-power-agreement',
  )
  requireInvariant(
    maximumAbsolute(netPowerTradeoffResidualsKw) <= POWER_TOLERANCE_KW &&
      activeSamples.every(
        (sample) =>
          sample.clippedNetWheelPowerKw <
            sample.baselineWheelDrivePowerKw &&
          sample.clippedAccelerationMps2 < sample.baselineAccelerationMps2,
      ),
    'generator-is-exact-wheel-power-and-acceleration-sacrifice',
  )
  requireInvariant(
    belowEightKw.requestedGeneratorMechanicalPowerKw < 8 &&
      aboveEightKw.requestedGeneratorMechanicalPowerKw > 8 &&
      belowEightKw.actualGeneratorMechanicalPowerKw > 0 &&
      aboveEightKw.actualGeneratorMechanicalPowerKw > 0 &&
      belowEightKw.operatingMode === 'full-throttle-superclip' &&
      aboveEightKw.operatingMode === 'full-throttle-superclip',
    'no-eight-kilowatt-label-threshold',
  )
  requireInvariant(
      first.samples.every(
      (sample) =>
        sample.actualGeneratorMechanicalPowerKw <=
          sample.requestedGeneratorMechanicalPowerKw + POWER_TOLERANCE_KW &&
        Math.abs(
          sample.actualGeneratorMechanicalPowerKw -
            sample.actualTotalRecoveryMechanicalPowerKw,
        ) <= POWER_TOLERANCE_KW &&
        sample.actualDeploymentDcPowerKw === 0,
    ) &&
      first.finalState.currentEnergyMJ >=
        first.finalState.minimumUsableEnergyMJ &&
      first.finalState.currentEnergyMJ <=
        first.finalState.maximumUsableEnergyMJ &&
      (first.finalState.rechargeRule.limit.kind !== 'finite' ||
        first.finalState.rechargeRule.usedMJ <=
          first.finalState.rechargeRule.limit.maxCuKBusRechargeMj +
            ENERGY_TOLERANCE_MJ),
    'physical-and-regulatory-constraints',
  )
  requireInvariant(
    maximumAbsolute(storeResidualsMJ) <= ENERGY_TOLERANCE_MJ &&
      maximumAbsolute(conversionResidualsMJ) <= ENERGY_TOLERANCE_MJ,
    'energy-audit-closure',
  )
  requireInvariant(
    firstTraceJson === secondTraceJson,
    'deterministic-repeat',
  )

  const activeDurationSeconds = activeSamples.length * DELTA_SECONDS
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    sourceCutoffDate: '2026-08-08',
    command: 'npm run validate:superclip',
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    fitPerformed: false,
    trackSpecificMultiplierCount: 0,
    authority: {
      technicalRegulation: {
        article: 'C5.2.8-C5.2.10',
        sourceId: 'fia-f1-2026-technical-c20',
        url: regulations.FIA_2026_REGULATION_PROFILE.technical.url,
      },
      observationalContext: {
        sourceId: 'fia-f1-2026-energy-refinement-2026-04-20',
        url: 'https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders',
        publishedAt: '2026-04-20',
        communicatedApproximateDurationSecondsPerLap: {
          minimum: 2,
          maximum: 4,
        },
        enforcement: 'metadata-only',
        hardCapApplied: false,
        usedForParameterFit: false,
        validationScenarioActiveDurationSeconds: activeDurationSeconds,
        validationScenarioDurationIsNotALapPrediction: true,
        lapLevelComparison: {
          status: 'unavailable',
          modeledSecondsPerLap: null,
          reason:
            'This invariant probe is a fixed-duration straight trace, not a complete simulated lap.',
        },
      },
    },
    policy: {
      generatorMechanicalPowerIsSolePropulsiveSacrifice: true,
      parallelDriveScaleApplied: false,
      eightKilowattClassificationThresholdApplied: false,
      durationObservationIsAnEnforcedGate: false,
      trackSpecificRuntimeCorrectionApplied: false,
    },
    scenario: {
      id: 'steady-high-throttle-340-kph-superclip',
      deltaSeconds: DELTA_SECONDS,
      tickCount: TRACE_TICKS,
      evaluationSpeedKph: EVALUATION_SPEED_KPH,
      throttlePercent: 100,
      activeSampleCount: activeSamples.length,
      activeDurationSeconds,
      initialStoredEnergyMJ: first.initialStoredEnergyMJ,
      finalStoredEnergyMJ: first.finalState.currentEnergyMJ,
      cuKBusRechargeIncreaseMJ:
        first.finalState.rechargedAtCuKBusThisLapMJ -
        first.initialCuKBusRechargeMJ,
      superclipAttributedCuKBusRechargeMJ: superclipCuKBusRechargeMJ,
      storedEnergyIncreaseMJ:
        first.finalState.currentEnergyMJ - first.initialStoredEnergyMJ,
      minimumCombustionWheelPowerKw: Math.min(
        ...first.samples.map((sample) => sample.combustionWheelPowerKw),
      ),
      maximumActualGeneratorMechanicalPowerKw: Math.max(
        ...first.samples.map(
          (sample) => sample.actualGeneratorMechanicalPowerKw,
        ),
      ),
      maximumWheelDrivePowerResidualKw: maximumAbsolute(
        wheelDrivePowerResidualsKw,
      ),
      maximumGeneratorPowerAgreementResidualKw: maximumAbsolute(
        generatorAgreementResidualsKw,
      ),
      maximumNetPowerTradeoffResidualKw: maximumAbsolute(
        netPowerTradeoffResidualsKw,
      ),
      minimumAccelerationLossMps2: Math.min(
        ...activeSamples.map((sample) => sample.accelerationLossMps2),
      ),
      maximumTickStoreBalanceErrorMJ: maximumAbsolute(storeResidualsMJ),
      maximumTickConversionChainErrorMJ:
        maximumAbsolute(conversionResidualsMJ),
      representativeSamples: [
        first.samples[0],
        first.samples[Math.floor(first.samples.length / 2)],
        first.samples.at(-1),
      ],
    },
    eightKilowattThresholdProbe: {
      below: belowEightKw,
      above: aboveEightKw,
      classificationDependsOnActualFlowNotEightKilowatts: true,
    },
    determinism: {
      repeatedTraceIdentical: firstTraceJson === secondTraceJson,
      traceSha256: createHash('sha256').update(firstTraceJson).digest('hex'),
    },
    invariantFailures,
  }

  if (!noReport) {
    const outputDirectory = join(
      repoRoot,
      'artifacts',
      'superclip-validation',
    )
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(
      join(outputDirectory, 'summary.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }

  console.log(JSON.stringify(report, null, 2))

  if (enforce && invariantFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await server.close()
}
