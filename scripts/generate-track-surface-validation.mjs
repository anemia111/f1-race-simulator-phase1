import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const repoRoot = resolve(import.meta.dirname, '..')
const enforce = process.argv.includes('--enforce')
const noReport = process.argv.includes('--no-report')
const outputDirectory = join(repoRoot, 'artifacts', 'track-surface-validation')

const TRACKS = Object.freeze([
  { id: 'monaco-approx', name: 'Monaco' },
  { id: 'monza-approx', name: 'Monza' },
  { id: 'singapore-approx', name: 'Singapore' },
  { id: 'spa-approx', name: 'Spa' },
  { id: 'suzuka-approx', name: 'Suzuka' },
  { id: 'zandvoort-approx', name: 'Zandvoort' },
])

const SCENARIOS = Object.freeze([
  {
    id: 'green',
    rainfallMmH: 0,
    seed: {
      bondedRubber: [0.02, 0.01],
      dryness: [1, 1],
      marbles: [0.005, 0.015],
      surfaceTemperatureC: [31, 30],
      waterFilmMm: [0, 0],
    },
    targetSurfaceTemperatureC: 36,
    traversalLaneMode: 'mixed',
  },
  {
    id: 'rubbered',
    rainfallMmH: 0,
    seed: {
      bondedRubber: [0.62, 0.25],
      dryness: [1, 1],
      marbles: [0.03, 0.18],
      surfaceTemperatureC: [35, 33],
      waterFilmMm: [0, 0],
    },
    targetSurfaceTemperatureC: 39,
    traversalLaneMode: 'mixed',
  },
  {
    id: 'light-rain',
    rainfallMmH: 2,
    seed: {
      bondedRubber: [0.52, 0.22],
      dryness: [0.84, 0.8],
      marbles: [0.035, 0.2],
      surfaceTemperatureC: [27, 26],
      waterFilmMm: [0.12, 0.18],
    },
    targetSurfaceTemperatureC: 25,
    traversalLaneMode: 'mixed',
  },
  {
    id: 'heavy-rain',
    rainfallMmH: 10,
    seed: {
      bondedRubber: [0.52, 0.22],
      dryness: [0.84, 0.8],
      marbles: [0.035, 0.2],
      surfaceTemperatureC: [27, 26],
      waterFilmMm: [0.12, 0.18],
    },
    targetSurfaceTemperatureC: 25,
    traversalLaneMode: 'mixed',
  },
  {
    id: 'drying',
    rainfallMmH: 0,
    seed: {
      bondedRubber: [0.34, 0.14],
      dryness: [0.22, 0.14],
      marbles: [0.025, 0.16],
      surfaceTemperatureC: [24, 23],
      waterFilmMm: [1.4, 1.7],
    },
    targetSurfaceTemperatureC: 35,
    traversalLaneMode: 'mixed',
  },
  {
    id: 'off-line',
    rainfallMmH: 0,
    seed: {
      bondedRubber: [0.35, 0.12],
      dryness: [0.98, 0.94],
      marbles: [0.06, 0.25],
      surfaceTemperatureC: [32, 29],
      waterFilmMm: [0.03, 0.08],
    },
    targetSurfaceTemperatureC: 36,
    traversalLaneMode: 'off-line',
  },
])

const DELTA_SECONDS = 12
const WATER_CLOSURE_TOLERANCE = 1e-9
const RUBBER_CLOSURE_TOLERANCE = 1e-9
const METAMORPHIC_TOLERANCE = 1e-11

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  root: repoRoot,
  server: { middlewareMode: true },
})

const sum = (values) => values.reduce((total, value) => total + value, 0)

const maximumAbsoluteDifference = (left, right) => {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY

  return left.reduce(
    (maximum, value, index) =>
      Math.max(maximum, Math.abs(value - right[index])),
    0,
  )
}

try {
  const surface = await server.ssrLoadModule(
    '/src/simulation/trackSurface.ts',
  )

  const invariantFailures = []
  const requireInvariant = (condition, id) => {
    if (!condition) invariantFailures.push(id)
  }

  const createSeededState = (scenario) => {
    const state = surface.createTrackSurfaceState({ cellCount: 72 })

    for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
      for (let laneIndex = 0; laneIndex < state.laneCount; laneIndex += 1) {
        const index = cellIndex * state.laneCount + laneIndex
        state.bondedRubber[index] = scenario.seed.bondedRubber[laneIndex]
        state.dryness[index] = scenario.seed.dryness[laneIndex]
        state.marbles[index] = scenario.seed.marbles[laneIndex]
        state.surfaceTemperatureC[index] =
          scenario.seed.surfaceTemperatureC[laneIndex]
        state.waterFilmMm[index] = scenario.seed.waterFilmMm[laneIndex]
      }
    }

    return state
  }

  const createTraversals = (scenario) =>
    Array.from({ length: 20 }, (_, index) => ({
      distanceLaps: 0.01 + (index % 4) * 0.002,
      lane:
        scenario.traversalLaneMode === 'off-line' || index >= 16
          ? 'off-line'
          : 'racing-line',
      startProgress: (0.03 + index * 0.047) % 1,
    }))

  const advance = (scenario, traversalTransform = (value) => value) => {
    const traversals = traversalTransform(createTraversals(scenario))

    return surface.advanceTrackSurface({
      ambientTemperatureC: 23,
      deltaSeconds: DELTA_SECONDS,
      previous: createSeededState(scenario),
      rainfallMmH: scenario.rainfallMmH,
      targetSurfaceTemperatureC: scenario.targetSurfaceTemperatureC,
      traversals,
    })
  }

  const outputVector = (result) => {
    const snapshot = surface.serializeTrackSurfaceState(result.state)
    const water = result.flux.water
    const rubber = result.flux.rubber

    return [
      ...snapshot.baseFriction,
      ...snapshot.bondedRubber,
      ...snapshot.dryness,
      ...snapshot.marbles,
      ...snapshot.surfaceTemperatureC,
      ...snapshot.waterFilmMm,
      water.afterFilmDepthSumMm,
      water.beforeFilmDepthSumMm,
      water.drainageFilmDepthSumMm,
      water.evaporationFilmDepthSumMm,
      water.overflowRemovedFilmDepthSumMm,
      water.rainfallFilmDepthSumMm,
      water.tyreSprayDisplacementFilmDepthSumMm,
      rubber.afterCoverageSum,
      rubber.beforeCoverageSum,
      rubber.marbleMigrationCoverageSum,
      rubber.removedCoverageSum,
      rubber.tyreDepositCoverageSum,
      rubber.washedCoverageSum,
    ]
  }

  const laneMean = (values, laneIndex) => {
    const selected = []

    for (let index = laneIndex; index < values.length; index += 2) {
      selected.push(values[index])
    }

    return sum(selected) / selected.length
  }

  const validateBounds = (snapshot) =>
    snapshot.baseFriction.every(
      (value) => Number.isFinite(value) && value >= 0.82 && value <= 1.05,
    ) &&
    [snapshot.bondedRubber, snapshot.dryness, snapshot.marbles].every(
      (values) =>
        values.every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
    ) &&
    snapshot.surfaceTemperatureC.every(
      (value) => Number.isFinite(value) && value >= -20 && value <= 90,
    ) &&
    snapshot.waterFilmMm.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 6,
    )

  const scenarioResults = []

  for (const track of TRACKS) {
    for (const scenario of SCENARIOS) {
      const before = createSeededState(scenario)
      const result = advance(scenario)
      const repeated = advance(scenario)
      const reversed = advance(scenario, (traversals) =>
        [...traversals].reverse(),
      )
      const withStationaryTraversal = advance(scenario, (traversals) => [
        ...traversals,
        { distanceLaps: 0, lane: 'off-line', startProgress: 0.723 },
      ])
      const snapshot = surface.serializeTrackSurfaceState(result.state)
      const roundTrip = surface.deserializeTrackSurfaceState(snapshot)
      const water = result.flux.water
      const rubber = result.flux.rubber
      const waterClosureResidual =
        water.afterFilmDepthSumMm -
        (water.beforeFilmDepthSumMm +
          water.rainfallFilmDepthSumMm -
          water.drainageFilmDepthSumMm -
          water.evaporationFilmDepthSumMm -
          water.tyreSprayDisplacementFilmDepthSumMm -
          water.overflowRemovedFilmDepthSumMm)
      const rubberClosureResidual =
        rubber.afterCoverageSum -
        (rubber.beforeCoverageSum +
          rubber.tyreDepositCoverageSum -
          rubber.washedCoverageSum -
          rubber.removedCoverageSum)
      const beforeRacingRubber = laneMean(before.bondedRubber, 0)
      const beforeOffLineRubber = laneMean(before.bondedRubber, 1)
      const afterRacingRubber = laneMean(result.state.bondedRubber, 0)
      const afterOffLineRubber = laneMean(result.state.bondedRubber, 1)
      const repeatedIdentical =
        JSON.stringify({ flux: result.flux, snapshot }) ===
        JSON.stringify({
          flux: repeated.flux,
          snapshot: surface.serializeTrackSurfaceState(repeated.state),
        })
      const reversedOrderMaximumDifference = maximumAbsoluteDifference(
        outputVector(result),
        outputVector(reversed),
      )
      const stationaryTraversalMaximumDifference = maximumAbsoluteDifference(
        outputVector(result),
        outputVector(withStationaryTraversal),
      )
      const roundTripIdentical =
        roundTrip !== null &&
        JSON.stringify(surface.serializeTrackSurfaceState(roundTrip)) ===
          JSON.stringify(snapshot)
      const prefix = `${track.id}/${scenario.id}`

      requireInvariant(validateBounds(snapshot), `${prefix}/finite-bounds`)
      requireInvariant(
        Math.abs(waterClosureResidual) <= WATER_CLOSURE_TOLERANCE,
        `${prefix}/water-flux-closure`,
      )
      requireInvariant(
        Math.abs(rubberClosureResidual) <= RUBBER_CLOSURE_TOLERANCE,
        `${prefix}/rubber-flux-closure`,
      )
      requireInvariant(repeatedIdentical, `${prefix}/deterministic-repeat`)
      requireInvariant(
        roundTripIdentical,
        `${prefix}/surface-serialization-round-trip`,
      )
      requireInvariant(
        reversedOrderMaximumDifference <= METAMORPHIC_TOLERANCE,
        `${prefix}/traversal-order-metamorphism`,
      )
      requireInvariant(
        stationaryTraversalMaximumDifference <= METAMORPHIC_TOLERANCE,
        `${prefix}/stationary-traversal-metamorphism`,
      )

      if (scenario.id === 'green') {
        requireInvariant(
          afterRacingRubber - beforeRacingRubber >
            afterOffLineRubber - beforeOffLineRubber,
          `${prefix}/racing-line-work-locality`,
        )
      }

      if (scenario.id === 'off-line') {
        requireInvariant(
          afterOffLineRubber - beforeOffLineRubber >
            afterRacingRubber - beforeRacingRubber,
          `${prefix}/off-line-work-locality`,
        )
      }

      if (scenario.id === 'light-rain' || scenario.id === 'heavy-rain') {
        requireInvariant(
          water.afterFilmDepthSumMm > water.beforeFilmDepthSumMm,
          `${prefix}/rain-adds-water`,
        )
        requireInvariant(
          rubber.washedCoverageSum > 0,
          `${prefix}/rain-washes-rubber-gradually`,
        )
      }

      if (scenario.id === 'drying') {
        requireInvariant(
          water.afterFilmDepthSumMm < water.beforeFilmDepthSumMm,
          `${prefix}/drying-removes-water`,
        )
      }

      scenarioResults.push({
        track,
        scenario: scenario.id,
        deterministicRepeat: repeatedIdentical,
        laneRubberDelta: {
          offLine: afterOffLineRubber - beforeOffLineRubber,
          racingLine: afterRacingRubber - beforeRacingRubber,
        },
        maximumTraversalOrderDifference: reversedOrderMaximumDifference,
        roundTripIdentical,
        rubberClosureResidual,
        rubberFlux: rubber,
        stationaryTraversalMaximumDifference,
        waterClosureResidual,
        waterFlux: water,
      })
    }
  }

  for (const scenario of SCENARIOS) {
    const matching = scenarioResults.filter(
      (result) => result.scenario === scenario.id,
    )
    const reference = JSON.stringify({ ...matching[0], track: undefined })

    requireInvariant(
      matching.every(
        (result) =>
          JSON.stringify({ ...result, track: undefined }) === reference,
      ),
      `${scenario.id}/track-label-policy-equivalence`,
    )
  }

  for (const track of TRACKS) {
    const lightRain = scenarioResults.find(
      (result) =>
        result.track.id === track.id && result.scenario === 'light-rain',
    )
    const heavyRain = scenarioResults.find(
      (result) =>
        result.track.id === track.id && result.scenario === 'heavy-rain',
    )

    requireInvariant(
      heavyRain.waterFlux.afterFilmDepthSumMm >
        lightRain.waterFlux.afterFilmDepthSumMm &&
        heavyRain.rubberFlux.washedCoverageSum >
          lightRain.rubberFlux.washedCoverageSum,
      `${track.id}/rain-intensity-monotonicity`,
    )
  }

  const frozenScenario = SCENARIOS.find(
    (scenario) => scenario.id === 'heavy-rain',
  )
  const frozenBefore = createSeededState(frozenScenario)
  const frozen = surface.advanceTrackSurface({
    ambientTemperatureC: 23,
    deltaSeconds: DELTA_SECONDS,
    previous: frozenBefore,
    rainfallMmH: frozenScenario.rainfallMmH,
    rubberEvolutionEnabled: false,
    targetSurfaceTemperatureC: frozenScenario.targetSurfaceTemperatureC,
    traversals: createTraversals(frozenScenario),
  })
  requireInvariant(
    maximumAbsoluteDifference(
      frozenBefore.bondedRubber,
      frozen.state.bondedRubber,
    ) === 0 &&
      maximumAbsoluteDifference(frozenBefore.marbles, frozen.state.marbles) ===
        0 &&
      frozen.flux.rubber.tyreDepositCoverageSum === 0 &&
      frozen.flux.rubber.washedCoverageSum === 0,
    'rubber-evolution-disabled-freezes-rubber-stock',
  )

  const deterministicTrace = JSON.stringify(scenarioResults)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    sourceCutoffDate: '2026-08-08',
    command: 'npm run validate:track-surface',
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    scope: ['src/simulation/trackSurface.ts'],
    calibrationPolicy: {
      fitPerformed: false,
      holdoutConsulted: false,
      trackSpecificMultiplierCount: 0,
    },
    policyBoundary: {
      circuitNamesAreCoverageLabelsOnly: true,
      physicalRoadWidthAvailable: false,
      rubberInventoryUnit: 'dimensionless-coverage-cell-lane',
      sourceLabel: 'simulator-policy',
      waterInventoryUnit: 'mm-cell-lane',
    },
    matrix: {
      scenarioCount: scenarioResults.length,
      scenarios: SCENARIOS.map((scenario) => scenario.id),
      tracks: TRACKS,
    },
    tolerances: {
      metamorphic: METAMORPHIC_TOLERANCE,
      rubberClosure: RUBBER_CLOSURE_TOLERANCE,
      waterClosure: WATER_CLOSURE_TOLERANCE,
    },
    determinism: {
      traceSha256: createHash('sha256')
        .update(deterministicTrace)
        .digest('hex'),
    },
    scenarioResults,
    invariantFailures,
  }

  if (!noReport) {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(
      join(outputDirectory, 'summary.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }

  console.log(
    JSON.stringify(
      {
        artifact: noReport
          ? null
          : 'artifacts/track-surface-validation/summary.json',
        invariantFailures,
        scenarioCount: scenarioResults.length,
        traceSha256: report.determinism.traceSha256,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  )

  if (enforce && invariantFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await server.close()
}
