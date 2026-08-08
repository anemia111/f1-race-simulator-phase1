import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const regulations = await server.ssrLoadModule(
    '/src/simulation/regulations.ts',
  )
  const categoryPhysics = await server.ssrLoadModule(
    '/src/simulation/categoryPhysics.ts',
  )
  const activeAero = await server.ssrLoadModule(
    '/src/simulation/activeAero.ts',
  )
  const standingStart = await server.ssrLoadModule(
    '/src/simulation/f1StandingStart.ts',
  )
  const eras = await server.ssrLoadModule(
    '/src/series/vehicleEraRegistry.ts',
  )

  const expectedPowerBoundaries = [
    { normal: 255, overtake: 350, powerLimited: 250, speedKph: 309 },
    { normal: 250, overtake: 350, powerLimited: 250, speedKph: 310 },
    { normal: 105, overtake: 320, powerLimited: 105, speedKph: 339 },
    { normal: 100, overtake: 300, powerLimited: 100, speedKph: 340 },
    {
      normal: 0.02,
      overtake: 200.02,
      powerLimited: 0.02,
      speedKph: 344.999,
    },
    { normal: 0, overtake: 200, powerLimited: 0, speedKph: 345 },
    {
      normal: 0,
      overtake: 0.02,
      powerLimited: 0,
      speedKph: 354.999,
    },
    { normal: 0, overtake: 0, powerLimited: 0, speedKph: 355 },
  ]
  const powerBoundaries = expectedPowerBoundaries.map((boundary) => ({
    ...boundary,
    observed: {
      normal: regulations.permittedMguKDcPowerKwForSpeed({
        curve: 'normal',
        speedKph: boundary.speedKph,
      }),
      overtake: regulations.permittedMguKDcPowerKwForSpeed({
        curve: 'overtake',
        speedKph: boundary.speedKph,
      }),
      powerLimited: regulations.permittedMguKDcPowerKwForSpeed({
        curve: 'race-sprint-power-limited',
        speedKph: boundary.speedKph,
      }),
    },
  }))

  const powerBoundaryPass = powerBoundaries.every((boundary) =>
    ['normal', 'overtake', 'powerLimited'].every(
      (key) => Math.abs(boundary[key] - boundary.observed[key]) <= 1e-9,
    ),
  )
  const f1Physics = categoryPhysics.categoryPhysicsFor('f1-custom')
  const massUnavailable = categoryPhysics.resolveMinimumVehicleMass({
    heatHazardAddedMassKg: 5,
    nominalTyreMassKg: null,
    seriesId: 'f1-custom',
    weekendStage: 'qualifying',
  })
  // A one-kilogram arithmetic probe verifies composition without asserting a
  // real FIA Nominal Tyre Mass that is absent from the frozen public inputs.
  const massCompositionProbe = categoryPhysics.resolveMinimumVehicleMass({
    heatHazardAddedMassKg: 5,
    nominalTyreMassKg: 1,
    seriesId: 'f1-custom',
    weekendStage: 'qualifying',
  })
  const currentEra = eras.vehicleEraRegistry.find(
    (era) => era.eraId === 'f1-2026-current',
  )

  const track = {
    aeroActivationZones: [
      {
        end: 0.3,
        label: 'regulatory-gate-zone',
        lowGripMode: 'partial',
        lowGripStart: 0.12,
        start: 0.1,
      },
    ],
  }
  const inZoneCar = { progress: 0.2, speedKph: 200, status: 'running' }
  const transitionStarted = activeAero.advanceActiveAeroState({
    car: inZoneCar,
    deltaSeconds: 0,
    elapsedSeconds: 10,
    lowGripConditions: false,
    requestedMode: 'straight',
    track,
  })
  const transitionCompleted = activeAero.advanceActiveAeroState({
    car: inZoneCar,
    deltaSeconds: 0.4,
    elapsedSeconds: 10.4,
    lowGripConditions: false,
    previous: transitionStarted,
    requestedMode: 'straight',
    track,
  })
  const outsideZone = activeAero.advanceActiveAeroState({
    car: { ...inZoneCar, progress: 0.5 },
    deltaSeconds: 0.4,
    elapsedSeconds: 11,
    lowGripConditions: false,
    previous: transitionCompleted,
    requestedMode: 'straight',
    track,
  })
  const failed = activeAero.advanceActiveAeroState({
    car: inZoneCar,
    deltaSeconds: 0,
    elapsedSeconds: 12,
    failureDetected: true,
    lowGripConditions: false,
    previous: transitionCompleted,
    requestedMode: 'straight',
    track,
  })
  const lowGripStarted = activeAero.advanceActiveAeroState({
    car: inZoneCar,
    deltaSeconds: 0,
    elapsedSeconds: 13,
    lowGripConditions: true,
    requestedMode: 'partial-straight',
    track,
  })
  const lowGripCompleted = activeAero.advanceActiveAeroState({
    car: inZoneCar,
    deltaSeconds: 0.4,
    elapsedSeconds: 13.4,
    lowGripConditions: true,
    previous: lowGripStarted,
    requestedMode: 'partial-straight',
    track,
  })

  const belowStartThreshold =
    standingStart.f1StandingStartMguKDecision({
      releaseLatched: false,
      secuSafetyExceptionActive: false,
      speedKph: 49.999,
      standingStartActive: true,
    })
  const atStartThreshold = standingStart.f1StandingStartMguKDecision({
    releaseLatched: false,
    secuSafetyExceptionActive: false,
    speedKph: 50,
    standingStartActive: true,
  })
  const startSafetyException =
    standingStart.f1StandingStartMguKDecision({
      releaseLatched: false,
      secuSafetyExceptionActive: true,
      speedKph: 0,
      standingStartActive: true,
    })

  const invariantFailures = [
    regulations.FIA_2026_REGULATION_PROFILE.sporting.issue === '08'
      ? null
      : 'sporting-authority',
    regulations.FIA_2026_REGULATION_PROFILE.technical.issue === '20'
      ? null
      : 'technical-authority',
    regulations.FIA_2026_REGULATION_PROFILE.operational.issue === '10'
      ? null
      : 'operational-authority',
    currentEra?.availability === 'runtime' &&
    currentEra.aeroSystemId === 'f1-2026-active-aero' &&
    !currentEra.aeroSystemId.toLowerCase().includes('drs')
      ? null
      : 'current-era-aero-boundary',
    f1Physics.wheelbaseM <= 3.4 ? null : 'wheelbase',
    massUnavailable.status === 'unavailable' &&
    massUnavailable.regulationBaseMassKg === 726 &&
    massUnavailable.heatHazardAddedMassKg === 5
      ? null
      : 'missing-nominal-tyre-mass-boundary',
    massCompositionProbe.status === 'resolved' &&
    massCompositionProbe.minimumMassKg === 732
      ? null
      : 'minimum-mass-composition',
    powerBoundaryPass ? null : 'mgu-k-boundaries',
    regulations.FIA_2026_REGULATION_PROFILE.energy
      .usableStateOfChargeWindowMj === 4
      ? null
      : 'soc-window',
    regulations.FIA_2026_REGULATION_PROFILE.energy
      .qualifyingMinimumLimitMj === 4
      ? null
      : 'qualifying-recharge-floor',
    regulations.FIA_2026_REGULATION_PROFILE.lowGripPowerCurve
      .permittedPowerCurve === null
      ? null
      : 'invented-low-grip-curve',
    transitionStarted.transition?.durationSeconds <= 0.4 &&
    transitionCompleted.command === 'straight' &&
    transitionCompleted.frontStraightFraction === 1 &&
    transitionCompleted.rearStraightFraction === 1
      ? null
      : 'active-aero-transition',
    outsideZone.command === 'corner' &&
    outsideZone.frontStraightFraction === 0 &&
    outsideZone.rearStraightFraction === 0
      ? null
      : 'straight-outside-zone',
    failed.command === 'corner' &&
    failed.failureState === 'failed-corner-safe' &&
    failed.frontStraightFraction === 0 &&
    failed.rearStraightFraction === 0
      ? null
      : 'active-aero-failure',
    lowGripCompleted.command === 'partial-straight' &&
    lowGripCompleted.frontStraightFraction === 1 &&
    lowGripCompleted.rearStraightFraction === 0
      ? null
      : 'low-grip-partial-aero',
    !belowStartThreshold.positiveTorqueAllowed &&
    atStartThreshold.positiveTorqueAllowed &&
    atStartThreshold.releaseLatched &&
    startSafetyException.positiveTorqueAllowed &&
    !startSafetyException.releaseLatched
      ? null
      : 'standing-start-mgu-k',
  ].filter(Boolean)

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    command: 'npm run validate:f1-current-generation',
    sourceCutoffDate: '2026-08-08',
    relatedArtifacts: [
      'artifacts/f1-current-generation-physics-summary.json',
      'artifacts/regulation-authority-audit.json',
      'artifacts/source-manifest.json',
    ],
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    calibrationPolicy: {
      fitPerformed: false,
      trackSpecificMultiplierCount: 0,
    },
    authority: {
      operational: regulations.FIA_2026_REGULATION_PROFILE.operational,
      sporting: regulations.FIA_2026_REGULATION_PROFILE.sporting,
      technical: regulations.FIA_2026_REGULATION_PROFILE.technical,
    },
    vehicleEra: currentEra,
    chassis: {
      wheelbaseM: f1Physics.wheelbaseM,
      maximumWheelbaseM: 3.4,
      massCompositionProbeInput: {
        heatHazardAddedMassKg: 5,
        nominalTyreMassKg: 1,
        purpose: 'unit-arithmetic-probe-not-a-physical-observation',
        weekendStage: 'qualifying',
      },
      massCompositionProbe,
      missingNominalTyreMass: massUnavailable,
    },
    energy: {
      absolutePowerLimitKw:
        regulations.FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
      powerBoundaries,
      qualifyingRechargeFloorMj:
        regulations.FIA_2026_REGULATION_PROFILE.energy
          .qualifyingMinimumLimitMj,
      rechargeLimitMj:
        regulations.FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
      socWindowMj:
        regulations.FIA_2026_REGULATION_PROFILE.energy
          .usableStateOfChargeWindowMj,
      lowGripCurve:
        regulations.FIA_2026_REGULATION_PROFILE.lowGripPowerCurve,
    },
    activeAero: {
      runtimeIntegration: {
        continuousStatePersistedInRaceSnapshot: false,
        decomposedFrontRearForceMapActive: false,
        status: 'phase-3-required',
      },
      maximumTransitionSeconds:
        activeAero.ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      transitionStarted,
      transitionCompleted,
      outsideZone,
      failure: failed,
      lowGripPartial: lowGripCompleted,
      overtakeStateIsSeparateInput: true,
    },
    standingStart: {
      belowThreshold: belowStartThreshold,
      atThreshold: atStartThreshold,
      secuSafetyException: startSafetyException,
    },
    invariantFailures,
  }

  mkdirSync(join(root, 'artifacts'), { recursive: true })
  writeFileSync(
    join(root, 'artifacts/f1-current-generation-gate.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(
    JSON.stringify(
      {
        invariantFailures,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  )

  if (process.argv.includes('--enforce') && invariantFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await server.close()
}
