/**
 * Validates the F1 category on the four Super Formula circuits of the 2026
 * calendar, plus Autopolis as Free Mode reference material.
 *
 * The pace baselines are keyed by category x course, never by round: Motegi
 * hosts rounds 1-2, Suzuka 4/5/11/12 and Fuji 3/6/7/9/10, and every round of a
 * circuit shares the one course record. Autopolis is cancelled on the 2026
 * calendar, so it is measured for reference only and never gates the run.
 *
 * Per course the run reports twelve families: free-practice light-fuel attack,
 * free-practice high-fuel long run, qualifying attack, race fastest lap, normal
 * long run, sector times, top speed, average speed, fuel-burn improvement,
 * track evolution, tire wear and same-stint lap variation. Out laps, in laps
 * and post-chequered cool-down laps never enter a measured population.
 *
 *   node scripts/validate-f1-support-circuits.mjs --calibrate
 *   node scripts/validate-f1-support-circuits.mjs --enforce
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer } from 'vite'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), '..')

function argument(name, fallback = undefined) {
  const prefix = `--${name}=`
  return (
    process.argv
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? fallback
  )
}

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(argument(name, ''), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function positiveNumber(name, fallback) {
  const parsed = Number.parseFloat(argument(name, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const ROOT = resolve(argument('root', DEFAULT_ROOT))
const OUTPUT_DIRECTORY = resolve(
  ROOT,
  argument('output-dir', 'docs/validation/f1-support-circuits-2026'),
)
const LABEL = argument('label', 'after')
const COURSE_FILTER = argument('course')
const SEED_OVERRIDE = positiveInteger('seeds', 0)
const CALIBRATION_SEEDS = positiveInteger('calibration-seeds', 6)
const CALIBRATION_ITERATIONS = positiveInteger('calibration-iterations', 5)
const STEP_SECONDS = Math.min(3, positiveNumber('step-seconds', 3))
const WORKERS = positiveInteger(
  'workers',
  Math.max(
    1,
    Math.min(
      6,
      Math.floor((Number(process.env.NUMBER_OF_PROCESSORS) || 4) / 2),
    ),
  ),
)
const CALIBRATE = process.argv.includes('--calibrate')
const ACCEPTANCE = process.argv.includes('--acceptance')
const ACCEPTANCE_SEEDS = positiveInteger('acceptance-seeds', 100)
const ENFORCE = process.argv.includes('--enforce')
const WRITE_VALIDATION = process.argv.includes('--write-validation')
const WORKER_COURSE = argument('worker-course')
const WORKER_SEED_FROM = Number.parseInt(argument('worker-seed-from', ''), 10)
const WORKER_SEED_COUNT = positiveInteger('worker-seed-count', 0)
const RESULT_FILE = argument('result-file')

const CALIBRATION_FILE = 'src/data/calibration/f1PaceCalibration2026.json'
/** Matches the runtime guard in src/data/paceCalibration.ts. */
const SCALE_MINIMUM = 0.75
const SCALE_MAXIMUM = 1.25
/** Measured lap-time response to a unit change in a controller scale. */
const SCALE_RESPONSE_GAIN = 0.55

/**
 * Target windows are the project specification for the F1 category on these
 * courses. `mandatory: false` marks a course that is measured for reference
 * only, so a deviation is reported but never fails the run.
 */
const COURSES = [
  {
    id: 'motegi-sf',
    mandatory: true,
    name: 'Mobility Resort Motegi',
    rounds: 'SF rounds 1-2',
    seeds: 30,
    windows: {
      practiceLightFuel: [86, 90],
      qualifying: [84, 88],
      raceFastest: [88, 92],
      longRun: [90, 95],
    },
  },
  {
    // Suzuka is on the F1 calendar, so its controller scales come from the
    // calendar-wide calibration and are only verified here.
    calibrate: false,
    id: 'suzuka-approx',
    mandatory: true,
    name: 'Suzuka',
    rounds: 'SF rounds 4/5/11/12, F1 calendar round 3',
    seeds: 50,
    windows: {
      practiceLightFuel: [89, 92],
      qualifying: [88, 90],
      raceFastest: [91, 94],
      longRun: [93, 97],
    },
  },
  {
    id: 'fuji-sf',
    mandatory: true,
    name: 'Fuji Speedway',
    rounds: 'SF rounds 3/6/7/9/10',
    seeds: 100,
    windows: {
      practiceLightFuel: [77, 80],
      qualifying: [75.5, 78.5],
      raceFastest: [79, 82],
      longRun: [81, 85],
    },
  },
  {
    id: 'sugo-sf',
    mandatory: true,
    name: 'Sportsland SUGO',
    rounds: 'SF round 8',
    seeds: 50,
    windows: {
      practiceLightFuel: [61, 64],
      qualifying: [59, 62],
      raceFastest: [63, 66],
      longRun: [65, 69],
    },
  },
  {
    id: 'autopolis-sf',
    mandatory: false,
    name: 'Autopolis',
    rounds: 'SF round 3 (cancelled) - Free Mode reference only',
    seeds: 20,
    // Same shape the specified courses use: the free-practice window opens at
    // the qualifying reference and runs four seconds behind it.
    windows: {
      practiceLightFuel: [80.4, 84.4],
      qualifying: [78.4, 82.4],
      raceFastest: [83.4, 87.4],
      longRun: [84.6, 88.6],
    },
  },
]

const round = (value, digits = 3) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits))

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

function quantile(values, probability) {
  const finite = values
    .filter(Number.isFinite)
    .sort((left, right) => left - right)

  if (finite.length === 0) {
    return null
  }

  const index = Math.min(
    finite.length - 1,
    Math.max(0, (finite.length - 1) * probability),
  )
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return finite[lower] * (1 - weight) + finite[upper] * weight
}

const median = (values) => quantile(values, 0.5)

function standardDeviation(values) {
  const finite = values.filter(Number.isFinite)

  if (finite.length < 2) {
    return null
  }

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (finite.length - 1)
  return Math.sqrt(variance)
}

async function loadRuntime(root) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const race = await server.ssrLoadModule('/src/simulation/race.ts')
  const registry = await server.ssrLoadModule('/src/series/seriesRegistry.ts')
  const support = await server.ssrLoadModule('/src/data/supportSeriesTracks.ts')
  const references = await server.ssrLoadModule(
    '/src/data/paceReferences2026.ts',
  )
  const freeMode = await server.ssrLoadModule(
    '/src/freeMode/freeModeRegistry.ts',
  )
  const qualifying = await server.ssrLoadModule('/src/simulation/qualifying.ts')
  const timedSessionPlan = await server.ssrLoadModule(
    '/src/simulation/timedSessionPlan.ts',
  )
  const vehicleDynamics = await server.ssrLoadModule(
    '/src/simulation/vehicleDynamics.ts',
  )
  const trackEvolution = await server.ssrLoadModule(
    '/src/simulation/trackEvolution.ts',
  )

  return {
    advanceRace: race.advanceRace,
    buildTimedSessionPlan: timedSessionPlan.buildTimedSessionPlan,
    close: () => server.close(),
    createInitialRace: race.createInitialRace,
    fuelMassEffects: vehicleDynamics.fuelMassEffects,
    paceReference2026For: references.paceReference2026For,
    runSeriesQualifying: qualifying.runSeriesQualifying,
    seriesPackageById: registry.seriesPackageById,
    simulationBaseLapTimeForPaceReference:
      references.simulationBaseLapTimeForPaceReference,
    suggestFreeModeRaceLaps: freeMode.suggestFreeModeRaceLaps,
    supportSeriesTracks: support.supportSeriesTracks,
    trackEvolutionGainSecondsFor: trackEvolution.trackEvolutionGainSecondsFor,
  }
}

/**
 * Builds the F1 view of a course. A circuit on the F1 calendar keeps its native
 * definition; a Super Formula circuit is assembled exactly as Free Mode does,
 * from the physical layout plus the F1 category x course baseline, so the
 * Super Formula base lap time is never reused for F1.
 */
function trackFor(runtime, series, courseId) {
  const native = series.tracks.find((track) => track.id === courseId)

  if (native) {
    return {
      paceSource: 'native',
      track: native.rainProbability === 0 ? native : { ...native, rainProbability: 0 },
    }
  }

  const physical = runtime.supportSeriesTracks.find(
    (track) => track.id === courseId,
  )

  if (!physical) {
    throw new Error(`Unknown course ${courseId}`)
  }

  const reference = runtime.paceReference2026For(series.id, courseId)

  if (!reference) {
    throw new Error(
      `${courseId} has no ${series.id} course baseline; add one to ${CALIBRATION_FILE}`,
    )
  }

  return {
    paceSource: 'category-reference',
    track: {
      ...physical,
      baseLapTime: runtime.simulationBaseLapTimeForPaceReference(
        reference,
        physical.baseLapTime,
      ),
      baseLapTimeSource: '2026-reference',
      paceReference2026: reference,
      rainProbability: 0,
      raceLaps: runtime.suggestFreeModeRaceLaps(series, physical),
      raceLapsSource: 'estimated',
    },
  }
}

function withScales(track, { qualifyingPaceScale, racePaceScale }) {
  const reference = track.paceReference2026
  const simulation = { ...reference.calibration.simulation }

  if (qualifyingPaceScale !== undefined) {
    simulation.qualifyingPaceScale = qualifyingPaceScale
  }

  if (racePaceScale !== undefined) {
    simulation.racePaceScale = racePaceScale
  }

  return {
    ...track,
    paceReference2026: {
      ...reference,
      calibration: { ...reference.calibration, simulation },
    },
  }
}

function raceConfigFor(series, track, seed) {
  return {
    categoryRaceFormat: series.rules.race,
    drivers: series.drivers,
    featureRaceMandatoryPitStop: series.rules.featureRaceMandatoryPitStop,
    featureRaceTwoDryCompounds: series.rules.featureRaceTwoDryCompounds,
    overtakeActivation: series.rules.overtakeActivation,
    overtakeSystem: series.rules.overtakeSystem,
    qualifyingDryCompound: series.rules.tires.qualifyingDryCompound,
    seed,
    seriesId: series.id,
    teams: series.teams,
    tireAllocation: series.rules.tires.standardAllocation,
    tireSupplier: series.rules.tireSupplier,
    track,
    weekendStage: 'race',
  }
}

/**
 * A measured lap is a green, valid, full-throttle racing lap. The opening lap
 * carries the standing start, a pit lap is an in lap, the lap after it is the
 * out lap, and anything past the chequered flag is a cool-down lap.
 */
function isMeasuredLap(lap, raceLaps) {
  return (
    lap.isValid &&
    !lap.pitStop &&
    !lap.afterPitStop &&
    lap.lap > 1 &&
    lap.lap <= raceLaps &&
    lap.weather === 'clear' &&
    lap.flagged === false &&
    Number.isFinite(lap.lapTimeSeconds)
  )
}

/** A measured lap run without following or fighting another car. */
function isClearAirLap(lap) {
  return lap.trafficSeconds <= 0.01 && lap.battleSeconds <= 0.01
}

function runRaceSeed(runtime, series, track, seed) {
  const config = raceConfigFor(series, track, seed)
  let snapshot = runtime.createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = runtime.advanceRace(snapshot, formationSeconds, config)
  snapshot = runtime.advanceRace(snapshot, 8, config)
  snapshot = runtime.advanceRace(snapshot, 5, config)

  const raceLaps = snapshot.raceLaps
  const laps = []
  const historyLengths = new Map(
    snapshot.cars.map((car) => [car.driverId, car.lapHistory.length]),
  )
  const lapState = new Map(
    snapshot.cars.map((car) => [
      car.driverId,
      {
        battleSeconds: 0,
        flagged: snapshot.flag !== 'clear',
        previousPitStop: false,
        startFuelLoadKg: car.fuelLoadKg,
        startRubberLevel: snapshot.trackEvolutionLevel,
        trafficSeconds: 0,
      },
    ]),
  )
  let topSpeedKph = 0
  let startRubberLevel = snapshot.trackEvolutionLevel
  let endRubberLevel = snapshot.trackEvolutionLevel
  const maximumSteps = Math.ceil(
    (track.baseLapTime * raceLaps * 2.2 + 1_800) / STEP_SECONDS,
  )

  for (
    let step = 0;
    step < maximumSteps && snapshot.sessionStatus !== 'finished';
    step += 1
  ) {
    snapshot = runtime.advanceRace(snapshot, STEP_SECONDS, config)
    endRubberLevel = snapshot.trackEvolutionLevel

    for (const car of snapshot.cars) {
      const state = lapState.get(car.driverId)

      if (!state) {
        continue
      }

      topSpeedKph = Math.max(topSpeedKph, car.speedKph)

      if (snapshot.flag !== 'clear') {
        state.flagged = true
      }

      // Clear air, measured the same way as the calendar-wide long-run
      // validation: a lap spent following or fighting another car is not a
      // sample of the circuit's pace.
      if (car.position > 1 && car.gapToAhead > 0 && car.gapToAhead < 2.5) {
        state.trafficSeconds += STEP_SECONDS
      }

      if (
        car.battlePhase === 'attacking' ||
        car.battlePhase === 'defending' ||
        car.battlePhase === 'side-by-side'
      ) {
        state.battleSeconds += STEP_SECONDS
      }

      const previousLength = historyLengths.get(car.driverId) ?? 0

      if (car.lapHistory.length > previousLength) {
        for (const record of car.lapHistory.slice(previousLength)) {
          laps.push({
            afterPitStop: state.previousPitStop,
            battleSeconds: state.battleSeconds,
            compound: record.tire,
            driverId: car.driverId,
            endFuelLoadKg: car.fuelLoadKg,
            endTireWearPercent: car.tireWearPercent,
            flagged: state.flagged,
            isValid: record.isValid,
            lap: record.lap,
            lapTimeSeconds: record.lapTimeSeconds,
            pitStop: record.pitStop,
            position: record.position,
            sectors: record.sectors,
            seed,
            startFuelLoadKg: state.startFuelLoadKg,
            startRubberLevel: state.startRubberLevel,
            tireAgeLaps: record.tireAgeLaps,
            trafficSeconds: state.trafficSeconds,
            weather: record.weather,
          })
          state.previousPitStop = record.pitStop
          state.flagged = snapshot.flag !== 'clear'
          state.startFuelLoadKg = car.fuelLoadKg
          state.startRubberLevel = snapshot.trackEvolutionLevel
          state.battleSeconds = 0
          state.trafficSeconds = 0
        }
        historyLengths.set(car.driverId, car.lapHistory.length)
      }
    }
  }

  return {
    endRubberLevel,
    finished: snapshot.sessionStatus === 'finished',
    laps,
    raceLaps,
    retiredCount: snapshot.cars.filter((car) => car.status === 'retired').length,
    seed,
    startRubberLevel,
    topSpeedKph,
  }
}

/** One full Q1 through the production engine, as the regression test measures. */
function runQualifyingSeed(runtime, series, track, seed) {
  const baseConfig = {
    ...raceConfigFor(series, track, seed),
    weekendStage: 'qualifying',
  }
  const qualifyingResult = runtime.runSeriesQualifying(baseConfig, series.rules)
  const config = {
    ...baseConfig,
    timedSessionPlan: runtime.buildTimedSessionPlan(
      qualifyingResult,
      series.rules.qualifying.breakSeconds,
      series.rules.qualifying.format,
    ),
  }
  let snapshot = runtime.createInitialRace(config)
  const q1EndsAtSeconds =
    config.timedSessionPlan?.segments[0]?.endsAtSeconds ?? 18 * 60
  const measurementEndsAtSeconds =
    q1EndsAtSeconds + Math.max(120, track.baseLapTime * 1.8)

  for (
    let elapsed = 0;
    elapsed < measurementEndsAtSeconds;
    elapsed += STEP_SECONDS
  ) {
    snapshot = runtime.advanceRace(snapshot, STEP_SECONDS, config)
  }

  const bestByDriver = snapshot.cars
    .flatMap((car) => {
      const valid = car.lapHistory
        .filter(
          (lap) => lap.isValid && (lap.segment === 'Q1' || lap.segment === null),
        )
        .map((lap) => lap.lapTimeSeconds)

      return valid.length === 0 ? [] : [Math.min(...valid)]
    })
    .sort((left, right) => left - right)
  const sectorLaps = snapshot.cars.flatMap((car) =>
    car.lapHistory.filter(
      (lap) =>
        lap.isValid &&
        Array.isArray(lap.sectors) &&
        lap.sectors.every((sector) => Number.isFinite(sector) && sector > 0),
    ),
  )

  return {
    poleSeconds: bestByDriver[0] ?? null,
    sectors: sectorLaps
      .slice()
      .sort((left, right) => left.lapTimeSeconds - right.lapTimeSeconds)
      .slice(0, 3)
      .map((lap) => lap.sectors),
    seed,
    top3MedianSeconds: bestByDriver[1] ?? null,
  }
}

/**
 * A free practice session. The light-fuel attack is the best measured lap of
 * the session; the high-fuel long run is the median of measured laps run on the
 * heavier half of the session's fuel loads.
 */
function runPracticeSeed(runtime, series, track, seed) {
  const config = {
    ...raceConfigFor(series, track, seed),
    weekendStage: 'fp3',
  }
  let snapshot = runtime.createInitialRace(config)
  const sessionSeconds = series.rules.freePracticeDurationSeconds ?? 60 * 60
  const laps = []
  const historyLengths = new Map(
    snapshot.cars.map((car) => [car.driverId, car.lapHistory.length]),
  )
  const lapState = new Map(
    snapshot.cars.map((car) => [
      car.driverId,
      { previousPitStop: false, startFuelLoadKg: car.fuelLoadKg },
    ]),
  )

  for (let elapsed = 0; elapsed < sessionSeconds; elapsed += STEP_SECONDS) {
    snapshot = runtime.advanceRace(snapshot, STEP_SECONDS, config)

    for (const car of snapshot.cars) {
      const state = lapState.get(car.driverId)
      const previousLength = historyLengths.get(car.driverId) ?? 0

      if (!state || car.lapHistory.length <= previousLength) {
        continue
      }

      for (const record of car.lapHistory.slice(previousLength)) {
        laps.push({
          afterPitStop: state.previousPitStop,
          fuelLoadKg: state.startFuelLoadKg,
          isValid: record.isValid,
          lapTimeSeconds: record.lapTimeSeconds,
          pitStop: record.pitStop,
          tireAgeLaps: record.tireAgeLaps,
          weather: record.weather,
        })
        state.previousPitStop = record.pitStop
        state.startFuelLoadKg = car.fuelLoadKg
      }

      historyLengths.set(car.driverId, car.lapHistory.length)
    }
  }

  const measured = laps.filter(
    (lap) =>
      lap.isValid &&
      !lap.pitStop &&
      !lap.afterPitStop &&
      lap.weather === 'clear' &&
      Number.isFinite(lap.lapTimeSeconds) &&
      Number.isFinite(lap.fuelLoadKg),
  )
  const fuelSplit = median(measured.map((lap) => lap.fuelLoadKg))
  const lightFuel = measured.filter(
    (lap) => fuelSplit === null || lap.fuelLoadKg <= fuelSplit,
  )
  const highFuel = measured.filter(
    (lap) => fuelSplit !== null && lap.fuelLoadKg > fuelSplit,
  )

  return {
    highFuelMedianSeconds: median(highFuel.map((lap) => lap.lapTimeSeconds)),
    lightFuelBestSeconds:
      lightFuel.length === 0
        ? null
        : Math.min(...lightFuel.map((lap) => lap.lapTimeSeconds)),
    measuredLapCount: measured.length,
    seed,
  }
}

function seedLabel(kind, courseId, index) {
  return `f1-support-${kind}:${courseId}:${index}`
}

function summarize(course, track, runs, runtime) {
  const { practiceRuns, qualifyingRuns, raceRuns } = runs
  const measuredByRun = raceRuns.map((run) =>
    run.laps.filter((lap) => isMeasuredLap(lap, run.raceLaps)),
  )
  const measured = measuredByRun.flat()
  const frontRunning = measured.filter((lap) => lap.position <= 5)
  const fastestByRun = measuredByRun
    .map((laps) =>
      laps.length === 0
        ? null
        : Math.min(...laps.map((lap) => lap.lapTimeSeconds)),
    )
    .filter((value) => value !== null)
  const longRunByRun = raceRuns
    .map((run, index) => {
      const middle = measuredByRun[index].filter(
        (lap) =>
          lap.position <= 5 &&
          lap.lap >= Math.floor(run.raceLaps * 0.35) &&
          lap.lap <= Math.floor(run.raceLaps * 0.6),
      )
      return median(middle.map((lap) => lap.lapTimeSeconds))
    })
    .filter((value) => value !== null)

  // Same-stint variation: consecutive measured laps on the same tire, so a
  // stop, a flag or a compound change never counts as lap-to-lap noise.
  const stintDeltas = []

  for (const laps of measuredByRun) {
    const byDriver = new Map()

    for (const lap of laps) {
      const list = byDriver.get(lap.driverId) ?? []
      list.push(lap)
      byDriver.set(lap.driverId, list)
    }

    for (const list of byDriver.values()) {
      list.sort((left, right) => left.lap - right.lap)

      for (let index = 1; index < list.length; index += 1) {
        const previous = list[index - 1]
        const current = list[index]

        if (
          current.lap === previous.lap + 1 &&
          current.compound === previous.compound &&
          current.tireAgeLaps === previous.tireAgeLaps + 1 &&
          isClearAirLap(previous) &&
          isClearAirLap(current)
        ) {
          stintDeltas.push(
            Math.abs(current.lapTimeSeconds - previous.lapTimeSeconds),
          )
        }
      }
    }
  }

  // Fuel-burn improvement: lap-time gain per kilogram burned, taken from the
  // model rather than from a raw lap-time slope so tire degradation cannot be
  // mistaken for a fuel gain.
  const fuelPerLapKg = median(
    measured
      .map((lap) => lap.startFuelLoadKg - lap.endFuelLoadKg)
      .filter((value) => Number.isFinite(value) && value > 0),
  )
  const fuelGainPerLapSeconds =
    fuelPerLapKg === null
      ? null
      : runtime.fuelMassEffects({ fuelLoadKg: fuelPerLapKg, track })
          .lapTimeDeltaSeconds
  const rubberGainSeconds = median(
    raceRuns.map(
      (run) =>
        runtime.trackEvolutionGainSecondsFor(run.endRubberLevel, track) -
        runtime.trackEvolutionGainSecondsFor(run.startRubberLevel, track),
    ),
  )
  const tireWearPerLapPercent = median(
    measured
      .map((lap) =>
        lap.tireAgeLaps > 0 ? lap.endTireWearPercent / lap.tireAgeLaps : null,
      )
      .filter((value) => value !== null),
  )
  const sectorMedians = [0, 1, 2].map((index) =>
    median(
      frontRunning
        .map((lap) => lap.sectors?.[index])
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  )
  const longRunSeconds = median(longRunByRun)
  const averageSpeedKph =
    longRunSeconds === null || longRunSeconds <= 0
      ? null
      : (track.lengthKm / longRunSeconds) * 3_600
  const metrics = {
    averageSpeedKph: round(averageSpeedKph, 2),
    fuelBurnPerLapKg: round(fuelPerLapKg),
    fuelGainPerLapSeconds: round(fuelGainPerLapSeconds),
    longRunSeconds: round(longRunSeconds),
    measuredLapCount: measured.length,
    practiceHighFuelSeconds: round(
      median(practiceRuns.map((run) => run.highFuelMedianSeconds)),
    ),
    practiceLightFuelSeconds: round(
      median(practiceRuns.map((run) => run.lightFuelBestSeconds)),
    ),
    qualifyingPoleSeconds: round(
      median(qualifyingRuns.map((run) => run.poleSeconds)),
    ),
    qualifyingTop3MedianSeconds: round(
      median(qualifyingRuns.map((run) => run.top3MedianSeconds)),
    ),
    raceFastestSeconds: round(median(fastestByRun)),
    sameStintP90DeltaSeconds: round(quantile(stintDeltas, 0.9)),
    sameStintStdDevSeconds: round(standardDeviation(stintDeltas)),
    sectorMediansSeconds: sectorMedians.map((value) => round(value)),
    tireWearPerLapPercent: round(tireWearPerLapPercent),
    topSpeedKph: round(median(raceRuns.map((run) => run.topSpeedKph)), 2),
    trackEvolutionGainSeconds: round(rubberGainSeconds),
  }

  const failures = []
  const notes = []
  const checkWindow = (label, value, window) => {
    if (value === null) {
      failures.push(`${label}: no sample`)
      return
    }

    const [low, high] = window

    if (value < low || value > high) {
      failures.push(
        `${label} ${value.toFixed(3)}s outside ${low}-${high}s`,
      )
    }
  }

  checkWindow(
    'qualifying',
    metrics.qualifyingTop3MedianSeconds,
    course.windows.qualifying,
  )
  checkWindow(
    'practice light fuel',
    metrics.practiceLightFuelSeconds,
    course.windows.practiceLightFuel,
  )
  checkWindow(
    'race fastest',
    metrics.raceFastestSeconds,
    course.windows.raceFastest,
  )
  checkWindow('long run', metrics.longRunSeconds, course.windows.longRun)

  if (raceRuns.some((run) => !run.finished)) {
    failures.push('one or more races did not finish')
  }

  if (metrics.practiceHighFuelSeconds === null) {
    failures.push('free practice produced no high-fuel long-run sample')
  } else if (
    metrics.practiceLightFuelSeconds !== null &&
    metrics.practiceHighFuelSeconds <= metrics.practiceLightFuelSeconds
  ) {
    failures.push('free practice high-fuel pace is not slower than light fuel')
  }

  if (metrics.fuelGainPerLapSeconds === null || metrics.fuelGainPerLapSeconds <= 0) {
    failures.push('no lap-time gain from fuel burn')
  }

  if (metrics.trackEvolutionGainSeconds === null) {
    failures.push('no track evolution sample')
  }

  if (metrics.tireWearPerLapPercent === null || metrics.tireWearPerLapPercent <= 0) {
    failures.push('no tire wear accumulation')
  }

  if (metrics.sectorMediansSeconds.some((value) => value === null)) {
    failures.push('missing sector time sample')
  }

  if (metrics.topSpeedKph === null || metrics.topSpeedKph < 250) {
    failures.push('implausible top speed')
  }

  if (
    metrics.sameStintP90DeltaSeconds === null ||
    metrics.sameStintP90DeltaSeconds > 1.6
  ) {
    failures.push(
      `same-stint clear-air lap-to-lap p90 delta ${
        metrics.sameStintP90DeltaSeconds ?? 'n/a'
      }s exceeds 1.6s`,
    )
  }

  if (!course.mandatory) {
    notes.push(
      'Reference only: this circuit is cancelled on the 2026 calendar, so deviations are reported without gating the run.',
    )
  }

  return {
    courseId: course.id,
    mandatory: course.mandatory,
    metrics,
    name: course.name,
    notes,
    paceSource: runs.paceSource,
    raceLaps: median(raceRuns.map((run) => run.raceLaps)),
    reasons: failures,
    rounds: course.rounds,
    seedCounts: {
      practice: practiceRuns.length,
      qualifying: qualifyingRuns.length,
      race: raceRuns.length,
    },
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    windows: course.windows,
    writeValidation: course.calibrate !== false,
  }
}

function runCourseSeeds(runtime, series, course, seedFrom, seedCount) {
  const { paceSource, track } = trackFor(runtime, series, course.id)
  const practiceRuns = []
  const qualifyingRuns = []
  const raceRuns = []

  for (let offset = 0; offset < seedCount; offset += 1) {
    const index = seedFrom + offset
    raceRuns.push(
      runRaceSeed(runtime, series, track, seedLabel('race', course.id, index)),
    )
    qualifyingRuns.push(
      runQualifyingSeed(
        runtime,
        series,
        track,
        seedLabel('qualifying', course.id, index),
      ),
    )
    practiceRuns.push(
      runPracticeSeed(
        runtime,
        series,
        track,
        seedLabel('practice', course.id, index),
      ),
    )
  }

  return { paceSource, practiceRuns, qualifyingRuns, raceRuns, track }
}

async function runWorkerShard() {
  const runtime = await loadRuntime(ROOT)

  try {
    const series = runtime.seriesPackageById.get('f1-custom')
    const course = COURSES.find((entry) => entry.id === WORKER_COURSE)

    if (!course) {
      throw new Error(`Unknown course ${WORKER_COURSE}`)
    }

    const runs = runCourseSeeds(
      runtime,
      series,
      course,
      WORKER_SEED_FROM,
      WORKER_SEED_COUNT,
    )
    await writeFile(
      RESULT_FILE,
      JSON.stringify({
        paceSource: runs.paceSource,
        practiceRuns: runs.practiceRuns,
        qualifyingRuns: runs.qualifyingRuns,
        raceRuns: runs.raceRuns,
      }),
      'utf8',
    )
  } finally {
    await runtime.close()
  }
}

function spawnWorker(course, seedFrom, seedCount, resultFile) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT_PATH,
        `--root=${ROOT}`,
        `--worker-course=${course.id}`,
        `--worker-seed-from=${seedFrom}`,
        `--worker-seed-count=${seedCount}`,
        `--result-file=${resultFile}`,
        `--step-seconds=${STEP_SECONDS}`,
      ],
      { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
    )

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(new Error(`${course.id} worker exited with code ${code}`))
    })
  })
}

async function runCourseWithWorkers(course, seedCount, temporaryDirectory) {
  const shardCount = Math.max(1, Math.min(WORKERS, seedCount))
  const perShard = Math.ceil(seedCount / shardCount)
  const shards = []

  for (let index = 0; index < shardCount; index += 1) {
    const seedFrom = index * perShard
    const shardSeeds = Math.min(perShard, seedCount - seedFrom)

    if (shardSeeds <= 0) {
      break
    }

    const resultFile = resolve(
      temporaryDirectory,
      `${course.id}-${index}.json`,
    )
    shards.push({ resultFile, seedFrom, shardSeeds })
  }

  await Promise.all(
    shards.map((shard) =>
      spawnWorker(course, shard.seedFrom, shard.shardSeeds, shard.resultFile),
    ),
  )

  const merged = {
    paceSource: 'native',
    practiceRuns: [],
    qualifyingRuns: [],
    raceRuns: [],
  }

  for (const shard of shards) {
    const payload = JSON.parse(await readFile(shard.resultFile, 'utf8'))
    merged.paceSource = payload.paceSource
    merged.practiceRuns.push(...payload.practiceRuns)
    merged.qualifyingRuns.push(...payload.qualifyingRuns)
    merged.raceRuns.push(...payload.raceRuns)
  }

  return merged
}

/**
 * Solves both controller scales for a course against its calibration record:
 * the timed-session scale against the qualifying reference, and the race scale
 * against the fastest-race-lap target the race calibration script uses.
 */
function calibrateCourse(runtime, series, course) {
  const { track } = trackFor(runtime, series, course.id)
  const calibration = track.paceReference2026.calibration
  const qualifyingReference =
    calibration.qualifying.selectedReferenceSeconds
  const expectedGreenDelta =
    calibration.simulation.expectedGreenRaceDeltaSeconds
  const raceFastestTarget =
    qualifyingReference +
    Math.min(5.8, Math.max(2.2, expectedGreenDelta * 0.78))
  let qualifyingPaceScale = clamp(
    calibration.simulation.qualifyingPaceScale ?? 1,
    SCALE_MINIMUM,
    SCALE_MAXIMUM,
  )
  let racePaceScale = clamp(
    calibration.simulation.racePaceScale ?? 1,
    SCALE_MINIMUM,
    SCALE_MAXIMUM,
  )
  let qualifyingMeasured = null
  let raceMeasured = null
  // Keep the best-scoring scale rather than the last update: an unconverged
  // course would otherwise store a value no iteration ever measured.
  let bestQualifying = { error: Number.POSITIVE_INFINITY, measured: null, scale: qualifyingPaceScale }
  let bestRace = { error: Number.POSITIVE_INFINITY, measured: null, scale: racePaceScale }

  for (
    let iteration = 0;
    iteration < CALIBRATION_ITERATIONS;
    iteration += 1
  ) {
    const scaled = withScales(track, { qualifyingPaceScale, racePaceScale })
    const qualifyingSamples = []
    const raceSamples = []

    for (let index = 0; index < CALIBRATION_SEEDS; index += 1) {
      qualifyingSamples.push(
        runQualifyingSeed(
          runtime,
          series,
          scaled,
          seedLabel('calibrate-qualifying', course.id, index),
        ).top3MedianSeconds,
      )
      const run = runRaceSeed(
        runtime,
        series,
        scaled,
        seedLabel('calibrate-race', course.id, index),
      )
      const measured = run.laps.filter((lap) => isMeasuredLap(lap, run.raceLaps))

      if (measured.length > 0) {
        raceSamples.push(
          Math.min(...measured.map((lap) => lap.lapTimeSeconds)),
        )
      }
    }

    qualifyingMeasured = median(qualifyingSamples)
    raceMeasured = median(raceSamples)
    const qualifyingError =
      qualifyingMeasured === null ? 0 : qualifyingMeasured - qualifyingReference
    const raceError = raceMeasured === null ? 0 : raceMeasured - raceFastestTarget

    if (
      qualifyingMeasured !== null &&
      Math.abs(qualifyingError) < bestQualifying.error
    ) {
      bestQualifying = {
        error: Math.abs(qualifyingError),
        measured: qualifyingMeasured,
        scale: qualifyingPaceScale,
      }
    }

    if (raceMeasured !== null && Math.abs(raceError) < bestRace.error) {
      bestRace = {
        error: Math.abs(raceError),
        measured: raceMeasured,
        scale: racePaceScale,
      }
    }

    console.log(
      `${course.id} iteration ${iteration + 1}: ` +
        `qualifying ${qualifyingMeasured?.toFixed(3) ?? 'n/a'}s ` +
        `(target ${qualifyingReference.toFixed(3)}s, error ${qualifyingError.toFixed(3)}s, scale ${qualifyingPaceScale.toFixed(6)}) ` +
        `race fastest ${raceMeasured?.toFixed(3) ?? 'n/a'}s ` +
        `(target ${raceFastestTarget.toFixed(3)}s, error ${raceError.toFixed(3)}s, scale ${racePaceScale.toFixed(6)})`,
    )

    if (Math.abs(qualifyingError) <= 0.3 && Math.abs(raceError) <= 0.3) {
      break
    }

    if (Math.abs(qualifyingError) > 0.3 && qualifyingMeasured !== null) {
      qualifyingPaceScale = clamp(
        qualifyingPaceScale *
          (1 +
            (qualifyingMeasured / qualifyingReference - 1) /
              SCALE_RESPONSE_GAIN),
        SCALE_MINIMUM,
        SCALE_MAXIMUM,
      )
    }

    if (Math.abs(raceError) > 0.3 && raceMeasured !== null) {
      racePaceScale = clamp(
        racePaceScale *
          (1 + (raceMeasured / raceFastestTarget - 1) / SCALE_RESPONSE_GAIN),
        SCALE_MINIMUM,
        SCALE_MAXIMUM,
      )
    }
  }

  return {
    courseId: course.id,
    qualifyingMeasuredSeconds: round(bestQualifying.measured),
    qualifyingPaceScale: Number(bestQualifying.scale.toFixed(6)),
    qualifyingReferenceSeconds: qualifyingReference,
    raceFastestMeasuredSeconds: round(bestRace.measured),
    raceFastestTargetSeconds: round(raceFastestTarget),
    racePaceScale: Number(bestRace.scale.toFixed(6)),
  }
}

async function writeSolvedScales(results) {
  const filePath = resolve(ROOT, CALIBRATION_FILE)
  const records = JSON.parse(await readFile(filePath, 'utf8'))
  const byTrack = new Map(results.map((entry) => [entry.courseId, entry]))
  let updated = 0

  for (const record of records) {
    const solved = byTrack.get(record.trackId)

    if (!solved) {
      continue
    }

    record.simulation.qualifyingPaceScale = solved.qualifyingPaceScale
    record.simulation.racePaceScale = solved.racePaceScale
    updated += 1
  }

  await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  console.log(`wrote ${updated} course scales to ${CALIBRATION_FILE}`)
}

/**
 * Records what this run measured in the calibration file, so a course baseline
 * carries its own validation evidence instead of an empty block. Only courses
 * this script calibrates are touched; a calendar circuit keeps the numbers the
 * calendar-wide calibration wrote.
 */
async function writeValidationEvidence(summaries) {
  const filePath = resolve(ROOT, CALIBRATION_FILE)
  const records = JSON.parse(await readFile(filePath, 'utf8'))
  const validatedAt = new Date().toISOString()
  const bySummary = new Map(
    summaries
      .filter((summary) => summary.writeValidation)
      .map((summary) => [summary.courseId, summary]),
  )
  let updated = 0

  for (const record of records) {
    const summary = bySummary.get(record.trackId)

    if (!summary) {
      continue
    }

    const metrics = summary.metrics
    const qualifyingReference =
      record.qualifying.selectedReferenceSeconds
    const raceReference = record.race.cleanLapReferenceSeconds

    record.simulation.calibrationSeedCount = summary.seedCounts.race
    record.simulation.validation = {
      validatedAt,
      qualifyingSeedCount: summary.seedCounts.qualifying,
      raceSeedCount: summary.seedCounts.race,
      poleMedianSeconds: metrics.qualifyingPoleSeconds,
      top3MedianSeconds: metrics.qualifyingTop3MedianSeconds,
      fieldMedianDeltaSeconds: null,
      raceGreenMedianSeconds: metrics.longRunSeconds,
      qualifyingReferenceErrorSeconds:
        metrics.qualifyingTop3MedianSeconds === null
          ? null
          : round(metrics.qualifyingTop3MedianSeconds - qualifyingReference),
      raceReferenceErrorSeconds:
        metrics.longRunSeconds === null || raceReference === null
          ? null
          : round(metrics.longRunSeconds - raceReference),
      liveQualifyingSeedCount: summary.seedCounts.qualifying,
      liveQualifyingTop3MedianSeconds: metrics.qualifyingTop3MedianSeconds,
      liveQualifyingReferenceErrorSeconds:
        metrics.qualifyingTop3MedianSeconds === null
          ? null
          : round(metrics.qualifyingTop3MedianSeconds - qualifyingReference),
    }
    updated += 1
  }

  await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  console.log(`wrote validation evidence for ${updated} course records`)
}

function markdownReport(summaries) {
  const lines = [
    '# F1 category on the 2026 Super Formula circuits',
    '',
    `Label: \`${LABEL}\`  `,
    `Generated: ${new Date().toISOString()}  `,
    `Step: ${STEP_SECONDS}s`,
    '',
    'Pace baselines are keyed by category x course. Rounds at the same circuit',
    'share one record, and the Super Formula baseline for the same circuit stays',
    'separate. Out laps, in laps and post-chequered cool-down laps are excluded',
    'from every measured population.',
    '',
    '| Course | Rounds | Pace source | Seeds (race/quali/FP) | Verdict |',
    '| --- | --- | --- | --- | --- |',
    ...summaries.map(
      (summary) =>
        `| ${summary.name} | ${summary.rounds} | ${summary.paceSource} | ` +
        `${summary.seedCounts.race}/${summary.seedCounts.qualifying}/${summary.seedCounts.practice} | ` +
        `${summary.verdict}${summary.mandatory ? '' : ' (reference)'} |`,
    ),
    '',
    '## Target windows',
    '',
    '| Course | Qualifying | FP light fuel | Race fastest | Normal long run |',
    '| --- | --- | --- | --- | --- |',
    ...summaries.map((summary) => {
      const window = (name) => {
        const [low, high] = summary.windows[name]
        return `${low}-${high}s`
      }
      const measured = (value, name) =>
        `${value ?? 'n/a'} (${window(name)})`

      return (
        `| ${summary.name} | ` +
        `${measured(summary.metrics.qualifyingTop3MedianSeconds, 'qualifying')} | ` +
        `${measured(summary.metrics.practiceLightFuelSeconds, 'practiceLightFuel')} | ` +
        `${measured(summary.metrics.raceFastestSeconds, 'raceFastest')} | ` +
        `${measured(summary.metrics.longRunSeconds, 'longRun')} |`
      )
    }),
    '',
    '## Twelve measured families',
    '',
    '| Course | FP light | FP high fuel | Quali attack | Race fastest | Long run | Sectors | Top speed | Average speed | Fuel gain/lap | Evolution gain | Tire wear/lap | Same-stint p90 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((summary) => {
      const metrics = summary.metrics
      return (
        `| ${summary.name} | ${metrics.practiceLightFuelSeconds ?? 'n/a'}s | ` +
        `${metrics.practiceHighFuelSeconds ?? 'n/a'}s | ` +
        `${metrics.qualifyingTop3MedianSeconds ?? 'n/a'}s | ` +
        `${metrics.raceFastestSeconds ?? 'n/a'}s | ` +
        `${metrics.longRunSeconds ?? 'n/a'}s | ` +
        `${metrics.sectorMediansSeconds.map((value) => value ?? 'n/a').join(' / ')} | ` +
        `${metrics.topSpeedKph ?? 'n/a'} km/h | ` +
        `${metrics.averageSpeedKph ?? 'n/a'} km/h | ` +
        `${metrics.fuelGainPerLapSeconds ?? 'n/a'}s | ` +
        `${metrics.trackEvolutionGainSeconds ?? 'n/a'}s | ` +
        `${metrics.tireWearPerLapPercent ?? 'n/a'}% | ` +
        `${metrics.sameStintP90DeltaSeconds ?? 'n/a'}s |`
      )
    }),
    '',
  ]

  for (const summary of summaries) {
    if (summary.reasons.length === 0 && summary.notes.length === 0) {
      continue
    }

    lines.push(`### ${summary.name}`, '')

    for (const note of summary.notes) {
      lines.push(`- ${note}`)
    }

    for (const reason of summary.reasons) {
      lines.push(`- ${summary.mandatory ? 'FAIL' : 'reference deviation'}: ${reason}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

function csvReport(summaries) {
  const header = [
    'courseId',
    'name',
    'paceSource',
    'raceSeeds',
    'qualifyingSeeds',
    'practiceSeeds',
    'practiceLightFuelSeconds',
    'practiceHighFuelSeconds',
    'qualifyingTop3MedianSeconds',
    'raceFastestSeconds',
    'longRunSeconds',
    'sector1Seconds',
    'sector2Seconds',
    'sector3Seconds',
    'topSpeedKph',
    'averageSpeedKph',
    'fuelGainPerLapSeconds',
    'trackEvolutionGainSeconds',
    'tireWearPerLapPercent',
    'sameStintP90DeltaSeconds',
    'verdict',
  ].join(',')
  const rows = summaries.map((summary) =>
    [
      summary.courseId,
      `"${summary.name}"`,
      summary.paceSource,
      summary.seedCounts.race,
      summary.seedCounts.qualifying,
      summary.seedCounts.practice,
      summary.metrics.practiceLightFuelSeconds ?? '',
      summary.metrics.practiceHighFuelSeconds ?? '',
      summary.metrics.qualifyingTop3MedianSeconds ?? '',
      summary.metrics.raceFastestSeconds ?? '',
      summary.metrics.longRunSeconds ?? '',
      summary.metrics.sectorMediansSeconds[0] ?? '',
      summary.metrics.sectorMediansSeconds[1] ?? '',
      summary.metrics.sectorMediansSeconds[2] ?? '',
      summary.metrics.topSpeedKph ?? '',
      summary.metrics.averageSpeedKph ?? '',
      summary.metrics.fuelGainPerLapSeconds ?? '',
      summary.metrics.trackEvolutionGainSeconds ?? '',
      summary.metrics.tireWearPerLapPercent ?? '',
      summary.metrics.sameStintP90DeltaSeconds ?? '',
      summary.verdict,
    ].join(','),
  )

  return [header, ...rows].join('\n')
}

/**
 * Records the project's fixed-seed qualifying acceptance for a course baseline:
 * 100 deterministic Q1 sessions, the same standard every calendar record is
 * held to in src/simulation/paceReference2026.test.ts.
 */
async function runAcceptance(courses) {
  const runtime = await loadRuntime(ROOT)
  const results = []

  try {
    const series = runtime.seriesPackageById.get('f1-custom')

    for (const course of courses.filter((entry) => entry.calibrate !== false)) {
      const { track } = trackFor(runtime, series, course.id)
      const reference =
        track.paceReference2026.calibration.qualifying.selectedReferenceSeconds
      const samples = []
      const poles = []

      for (let index = 0; index < ACCEPTANCE_SEEDS; index += 1) {
        const measured = runQualifyingSeed(
          runtime,
          series,
          track,
          seedLabel('acceptance-qualifying', course.id, index),
        )

        if (measured.top3MedianSeconds !== null) {
          samples.push(measured.top3MedianSeconds)
        }

        if (measured.poleSeconds !== null) {
          poles.push(measured.poleSeconds)
        }
      }

      const top3 = median(samples)
      const error = top3 === null ? null : top3 - reference
      results.push({
        courseId: course.id,
        errorSeconds: round(error),
        poleMedianSeconds: round(median(poles)),
        seedCount: samples.length,
        top3MedianSeconds: round(top3),
      })
      console.log(
        `${course.id}: ${samples.length} seeds, top3 median ${top3?.toFixed(3) ?? 'n/a'}s ` +
          `vs reference ${reference.toFixed(3)}s (error ${error?.toFixed(3) ?? 'n/a'}s)`,
      )
    }
  } finally {
    await runtime.close()
  }

  const filePath = resolve(ROOT, CALIBRATION_FILE)
  const records = JSON.parse(await readFile(filePath, 'utf8'))
  const byTrack = new Map(results.map((entry) => [entry.courseId, entry]))
  const validatedAt = new Date().toISOString()

  for (const record of records) {
    const solved = byTrack.get(record.trackId)

    if (!solved) {
      continue
    }

    record.simulation.validation = {
      ...record.simulation.validation,
      validatedAt,
      qualifyingSeedCount: solved.seedCount,
      poleMedianSeconds: solved.poleMedianSeconds,
      top3MedianSeconds: solved.top3MedianSeconds,
      qualifyingReferenceErrorSeconds: solved.errorSeconds,
      liveQualifyingSeedCount: solved.seedCount,
      liveQualifyingTop3MedianSeconds: solved.top3MedianSeconds,
      liveQualifyingReferenceErrorSeconds: solved.errorSeconds,
    }
  }

  await writeFile(filePath, `${JSON.stringify(records, null, 2)}
`, 'utf8')
  console.log(`wrote qualifying acceptance for ${results.length} course records`)

  const worst = results.reduce(
    (peak, entry) => Math.max(peak, Math.abs(entry.errorSeconds ?? 0)),
    0,
  )
  console.log(`worst qualifying acceptance error: ${worst.toFixed(3)}s`)

  if (worst > 0.3) {
    console.log('ABOVE the 0.30s acceptance limit: re-run --calibrate')
    process.exitCode = 1
  }
}

async function main() {
  if (WORKER_COURSE) {
    await runWorkerShard()
    return
  }

  const courses = COURSES.filter(
    (course) =>
      !COURSE_FILTER ||
      course.id === COURSE_FILTER ||
      course.id.includes(COURSE_FILTER),
  )

  if (courses.length === 0) {
    throw new Error(`No course matches ${COURSE_FILTER}`)
  }

  if (ACCEPTANCE) {
    await runAcceptance(courses)
    return
  }

  if (CALIBRATE) {
    const runtime = await loadRuntime(ROOT)

    try {
      const series = runtime.seriesPackageById.get('f1-custom')
      const results = courses
        .filter((course) => course.calibrate !== false)
        .map((course) => calibrateCourse(runtime, series, course))
      await writeSolvedScales(results)
    } finally {
      await runtime.close()
    }

    return
  }

  const temporaryDirectory = resolve(OUTPUT_DIRECTORY, `.workers-${LABEL}`)
  await mkdir(temporaryDirectory, { recursive: true })
  const summaries = []

  try {
    const runtime = await loadRuntime(ROOT)
    const series = runtime.seriesPackageById.get('f1-custom')

    try {
      for (const course of courses) {
        const seedCount = SEED_OVERRIDE || course.seeds
        const started = Date.now()
        const runs = await runCourseWithWorkers(
          course,
          seedCount,
          temporaryDirectory,
        )
        const { track } = trackFor(runtime, series, course.id)
        const summary = summarize(course, track, runs, runtime)
        summaries.push(summary)
        console.log(
          `${course.id}: ${summary.verdict} in ${(
            (Date.now() - started) /
            1_000
          ).toFixed(1)}s`,
        )

        for (const reason of summary.reasons) {
          console.log(`  - ${reason}`)
        }
      }
    } finally {
      await runtime.close()
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${LABEL}-f1-support-circuits.md`),
    `${markdownReport(summaries)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${LABEL}-f1-support-circuits.csv`),
    `${csvReport(summaries)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${LABEL}-f1-support-circuits.json`),
    `${JSON.stringify(summaries, null, 2)}\n`,
    'utf8',
  )

  const blocking = summaries.filter(
    (summary) => summary.mandatory && summary.verdict !== 'PASS',
  )

  if (WRITE_VALIDATION) {
    if (blocking.length > 0) {
      console.log(
        'skipped writing validation evidence: a mandatory course failed',
      )
    } else {
      await writeValidationEvidence(summaries)
    }
  }

  console.log(
    `\n${summaries.length} courses measured, ${blocking.length} blocking failures`,
  )

  if (ENFORCE && blocking.length > 0) {
    process.exitCode = 1
  }
}

await main()
