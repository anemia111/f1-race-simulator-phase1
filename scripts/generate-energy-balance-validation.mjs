import { execFileSync } from 'node:child_process'
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

const maximumAbsolute = (values) =>
  values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)

try {
  const energy = await server.ssrLoadModule('/src/simulation/energySystem.ts')
  const regulations = await server.ssrLoadModule('/src/simulation/regulations.ts')
  const { initialDrivers, initialTeams } = await server.ssrLoadModule(
    '/src/data/grid2026.ts',
  )
  const team = initialTeams.find((candidate) => candidate.id === 'ferrari')
  const driver = initialDrivers.find((candidate) => candidate.teamId === team.id)
  const raceRule = regulations.resolveF1RechargeRule({ stage: 'race' })
  const baseOptions = (state, overrides = {}) => ({
    ambientTemperatureC: 25,
    brakePercent: 0,
    combustionWheelPowerKw: 520,
    deltaSeconds: 0.05,
    deploymentDcPowerLimitKw:
      regulations.permittedMguKDcPowerKwForSpeed({
        curve: 'normal',
        speedKph: 300,
      }),
    deploymentRequest: 0,
    driverErsManagement: driver.skills.ersManagement,
    driverWetSkill: driver.skills.wetSkill,
    gripMultiplier: 1,
    rechargeRule: raceRule,
    speedKph: 300,
    state,
    surfaceWaterMm: 0,
    team,
    throttlePercent: 100,
    tire: 'M',
    vehicleMassKg: 840,
    ...overrides,
  })

  const runTrace = (capture) => {
    let state = energy.createInitialEnergyStore(team, 0.48, raceRule)
    const audits = []
    const modes = []
    let maximumDcPowerKw = 0
    let maximumRequestedLimitKw = 0

    for (let tick = 0; tick < 320; tick += 1) {
      const phase = tick % 4
      const overrides =
        phase === 0
          ? { deploymentRequest: 0.82 }
          : phase === 1
            ? {
                brakePercent: 72,
                combustionWheelPowerKw: 0,
                deploymentDcPowerLimitKw: 0,
                speedKph: 285,
                throttlePercent: 0,
              }
            : phase === 2
              ? {
                  combustionWheelPowerKw: 0,
                  deploymentDcPowerLimitKw: 0,
                  speedKph: 165,
                  throttlePercent: 18,
                }
              : {
                  deploymentDcPowerLimitKw: 100,
                  deploymentRequest: 1,
                  speedKph: 340,
                  superclipGeneratorRequestKw: 80,
                  throttlePercent: 100,
                }
      const input = baseOptions(state, overrides)
      const step = energy.advanceEnergyStore(input)
      state = step.state
      maximumDcPowerKw = Math.max(
        maximumDcPowerKw,
        state.actualDeploymentDcPowerKw,
      )
      maximumRequestedLimitKw = Math.max(
        maximumRequestedLimitKw,
        input.deploymentDcPowerLimitKw,
      )
      audits.push(step.audit)
      modes.push(state.operatingMode)
      if (capture) {
        JSON.stringify({ audit: step.audit, mode: state.operatingMode, tick })
      }
    }

    return { audits, maximumDcPowerKw, maximumRequestedLimitKw, modes, state }
  }

  const captured = runTrace(true)
  const silent = runTrace(false)
  const runFleet = (order) => {
    const states = new Map([
      ['car-a', energy.createInitialEnergyStore(team, 0.42, raceRule)],
      ['car-b', energy.createInitialEnergyStore(team, 0.63, raceRule)],
    ])

    for (let tick = 0; tick < 120; tick += 1) {
      for (const id of order) {
        const state = states.get(id)
        states.set(
          id,
          energy.advanceEnergyStore(
            baseOptions(state, {
              brakePercent: tick % 3 === 1 ? 62 : 0,
              combustionWheelPowerKw: tick % 3 === 1 ? 0 : 520,
              deploymentDcPowerLimitKw: tick % 3 === 1 ? 0 : 280,
              deploymentRequest: tick % 3 === 0 ? 0.7 : 0,
              speedKph: id === 'car-a' ? 275 : 295,
              throttlePercent: tick % 3 === 1 ? 0 : 100,
            }),
          ).state,
        )
      }
    }

    return [...states.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, state]) => ({ id, state }))
  }
  const forwardFleet = runFleet(['car-a', 'car-b'])
  const reversedFleet = runFleet(['car-b', 'car-a'])
  const finiteRule = {
    additionalAllowanceMJ: 0,
    baseLimitMJ: 0.1,
    limit: { kind: 'finite', maxCuKBusRechargeMj: 0.1 },
    measuredAt: 'CU-K-HV-DC-bus',
    resolution: 'verified-event',
    ruleId: 'validation-finite-0.1-mj',
    sourceId: 'phase-4-validation-fixture',
  }
  let cappedState = energy.createInitialEnergyStore(team, 0.1, finiteRule)
  for (let tick = 0; tick < 100; tick += 1) {
    cappedState = energy.advanceEnergyStore(
      baseOptions(cappedState, {
        brakePercent: 100,
        combustionWheelPowerKw: 0,
        deploymentDcPowerLimitKw: 0,
        rechargeRule: finiteRule,
        speedKph: 320,
        throttlePercent: 0,
      }),
    ).state
  }
  const crossingOldRule = {
    ...finiteRule,
    baseLimitMJ: 2,
    limit: { kind: 'finite', maxCuKBusRechargeMj: 2 },
    ruleId: 'validation-crossing-old-2-mj',
  }
  const crossingNewRule = {
    ...finiteRule,
    baseLimitMJ: 0.001,
    limit: { kind: 'finite', maxCuKBusRechargeMj: 0.001 },
    ruleId: 'validation-crossing-new-0.001-mj',
  }
  const crossingFrameStart = energy.createInitialEnergyStore(
    team,
    0.2,
    crossingOldRule,
  )
  const crossingIntegrated = energy.advanceEnergyStore(
    baseOptions(crossingFrameStart, {
      brakePercent: 100,
      combustionWheelPowerKw: 0,
      deltaSeconds: 8,
      deploymentDcPowerLimitKw: 0,
      rechargeRule: crossingOldRule,
      speedKph: 330,
      throttlePercent: 0,
    }),
  ).state
  const crossingPostLineFraction = 0.75
  const crossingRebased = energy.rebaseEnergyStoreAtLapCrossing({
    frameStartState: crossingFrameStart,
    integratedState: crossingIntegrated,
    postLineFraction: crossingPostLineFraction,
    rechargeRule: crossingNewRule,
  })
  const expectedCrossingLapStartEnergyMJ =
    crossingFrameStart.currentEnergyMJ +
    (crossingIntegrated.currentEnergyMJ -
      crossingFrameStart.currentEnergyMJ) *
      (1 - crossingPostLineFraction)

  const storeResiduals = captured.audits.map(
    (audit) => audit.storeBalanceErrorMJ,
  )
  const chainResiduals = captured.audits.map(
    (audit) => audit.conversionChainErrorMJ,
  )
  const invariantFailures = []
  const requireInvariant = (condition, id) => {
    if (!condition) invariantFailures.push(id)
  }

  requireInvariant(
    captured.state.usableEnergyMJ === 4,
    'four-megajoule-soc-window',
  )
  requireInvariant(
    captured.state.currentEnergyMJ >= captured.state.minimumUsableEnergyMJ &&
      captured.state.currentEnergyMJ <= captured.state.maximumUsableEnergyMJ,
    'stored-energy-bounds',
  )
  requireInvariant(
    maximumAbsolute(storeResiduals) <= 1e-10,
    'tick-store-balance',
  )
  requireInvariant(
    maximumAbsolute(chainResiduals) <= 1e-10,
    'tick-conversion-chain-balance',
  )
  requireInvariant(
    Math.abs(energy.energyBalanceErrorMJ(captured.state)) <= 1e-8,
    'lap-store-balance',
  )
  requireInvariant(
    captured.maximumDcPowerKw <= captured.maximumRequestedLimitKw + 1e-9 &&
      captured.maximumDcPowerKw <= 350 + 1e-9,
    'dc-before-mechanical-cap',
  )
  requireInvariant(
    captured.state.rechargedAtCuKBusThisLapMJ >=
      captured.state.storedEnergyThisLapMJ,
    'cu-k-bus-before-battery-loss',
  )
  requireInvariant(
    cappedState.rechargeRule.usedMJ <= 0.1 + 1e-10 &&
      cappedState.rechargedAtCuKBusThisLapMJ <= 0.1 + 1e-10 &&
      cappedState.storedEnergyThisLapMJ <
        cappedState.rechargedAtCuKBusThisLapMJ,
    'finite-cu-k-recharge-ledger',
  )
  requireInvariant(
    Math.abs(energy.energyBalanceErrorMJ(crossingIntegrated)) <= 1e-10,
    'line-crossing-old-ledger-closure',
  )
  requireInvariant(
    crossingRebased.rechargeAcceptanceScale < 1 &&
      crossingRebased.state.rechargedAtCuKBusThisLapMJ <= 0.001 + 1e-12 &&
      crossingRebased.state.rechargeRule.usedMJ ===
        crossingRebased.state.rechargedAtCuKBusThisLapMJ,
    'line-crossing-new-ledger-cap',
  )
  requireInvariant(
    Math.abs(
      crossingRebased.state.lapStartEnergyMJ -
        expectedCrossingLapStartEnergyMJ,
    ) <= 1e-10 &&
      Math.abs(energy.energyBalanceErrorMJ(crossingRebased.state)) <= 1e-10,
    'line-crossing-post-line-rebase-closure',
  )
  requireInvariant(
    captured.modes.includes('propulsion') &&
      captured.modes.includes('braking-regeneration') &&
      captured.modes.includes('lift-coast-regeneration') &&
      captured.modes.includes('full-throttle-superclip'),
    'operating-mode-coverage',
  )
  requireInvariant(
    JSON.stringify(captured.state) === JSON.stringify(silent.state),
    'logging-independent-energy-trace',
  )
  requireInvariant(
    JSON.stringify(forwardFleet) === JSON.stringify(reversedFleet),
    'car-order-independent-energy-trace',
  )

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    sourceCutoffDate: '2026-08-08',
    command: 'npm run validate:energy-balance',
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    calibrationPolicy: {
      fitPerformed: false,
      trackSpecificMultiplierCount: 0,
    },
    measurementBoundary: 'CU-K-HV-DC-bus',
    summary: {
      maximumTickStoreBalanceErrorMJ: maximumAbsolute(storeResiduals),
      maximumTickConversionChainErrorMJ: maximumAbsolute(chainResiduals),
      lapStoreBalanceErrorMJ: Math.abs(
        energy.energyBalanceErrorMJ(captured.state),
      ),
      maximumDeploymentDcPowerKw: captured.maximumDcPowerKw,
      rechargeAtCuKBusThisLapMJ:
        captured.state.rechargedAtCuKBusThisLapMJ,
      storedEnergyThisLapMJ: captured.state.storedEnergyThisLapMJ,
      conversionLossThisLapMJ: captured.state.conversionLossThisLapMJ,
      finiteLedgerUsedMJ: cappedState.rechargeRule.usedMJ,
      finiteLedgerStoredMJ: cappedState.storedEnergyThisLapMJ,
      lapCrossing: {
        postLineFraction: crossingPostLineFraction,
        oldLedgerBalanceErrorMJ: Math.abs(
          energy.energyBalanceErrorMJ(crossingIntegrated),
        ),
        newLedgerLimitMJ: 0.001,
        newLedgerUsedMJ:
          crossingRebased.state.rechargedAtCuKBusThisLapMJ,
        rechargeAcceptanceScale: crossingRebased.rechargeAcceptanceScale,
        interpolatedLapStartEnergyMJ:
          crossingRebased.state.lapStartEnergyMJ,
        expectedLapStartEnergyMJ: expectedCrossingLapStartEnergyMJ,
        newLedgerBalanceErrorMJ: Math.abs(
          energy.energyBalanceErrorMJ(crossingRebased.state),
        ),
      },
      deterministicWithLogging:
        JSON.stringify(captured.state) === JSON.stringify(silent.state),
      deterministicWithReversedCarOrder:
        JSON.stringify(forwardFleet) === JSON.stringify(reversedFleet),
    },
    invariantFailures,
  }

  if (!noReport) {
    const outputDirectory = join(
      repoRoot,
      'artifacts',
      'energy-balance-validation',
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
