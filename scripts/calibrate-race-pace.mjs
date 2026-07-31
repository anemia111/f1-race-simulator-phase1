import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = resolve(import.meta.dirname, '..')
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const CALIBRATION_DIRECTORY = resolve(ROOT, 'src', 'data', 'calibration')
const FILES = {
  'f1-custom': resolve(
    CALIBRATION_DIRECTORY,
    'f1PaceCalibration2026.json',
  ),
  'super-formula': resolve(
    CALIBRATION_DIRECTORY,
    'superFormulaPaceCalibration2026.json',
  ),
}
const argumentValue = (name, fallback) => {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))
  const parsed = Number.parseInt(value?.slice(prefix.length) ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
const stringArgumentValue = (name) => {
  const prefix = `--${name}=`
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
    .trim()
}
const floatArgumentValue = (name) => {
  const raw = stringArgumentValue(name)

  if (raw === undefined || raw === '') {
    return null
  }

  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}
/**
 * Worker fan-out for the race seed loop.
 *
 * A race seed costs a full race distance, and a complete calibration runs over
 * a thousand of them, so this is the whole cost of the script. One worker is
 * held back for the parent process and the operating system.
 */
const WORKERS = argumentValue(
  'workers',
  Math.max(1, Math.min(12, availableParallelism() - 1)),
)
const PARALLEL_RACE_SEED_THRESHOLD = argumentValue(
  'parallel-race-seed-threshold',
  8,
)
const WORKER_SERIES = stringArgumentValue('worker-series')
const WORKER_TRACK = stringArgumentValue('worker-track')
const WORKER_SEED_FROM = Number.parseInt(
  stringArgumentValue('worker-seed-from') ?? '0',
  10,
)
const WORKER_SEED_COUNT = argumentValue('worker-seed-count', 0)
const WORKER_RACE_PACE_SCALE = floatArgumentValue('worker-race-pace-scale')
const WORKER_SEARCH_SERIES = stringArgumentValue('worker-search-series')
const WORKER_SEARCH_TRACKS = stringArgumentValue('worker-search-tracks')
const RESULT_FILE = stringArgumentValue('result-file')
const IS_WORKER = WORKER_TRACK !== undefined && RESULT_FILE !== undefined
const IS_SEARCH_WORKER =
  WORKER_SEARCH_SERIES !== undefined && RESULT_FILE !== undefined
const QUALIFYING_SEEDS = argumentValue('qualifying-seeds', 100)
const LIVE_QUALIFYING_SEEDS = argumentValue('live-qualifying-seeds', 3)
const LIVE_QUALIFYING_ITERATIONS = argumentValue(
  'live-qualifying-iterations',
  3,
)
// The search now solves against the representative green lap, a median over
// mid-race laps rather than one fastest lap, so it needs more seeds per step to
// see through seed noise and more steps to settle. Track-level parallelism pays
// for both.
const RACE_CALIBRATION_SEEDS = argumentValue('race-calibration-seeds', 6)
const RACE_VALIDATION_SEEDS = argumentValue('race-validation-seeds', 100)
const RACE_SEARCH_ITERATIONS = argumentValue('race-search-iterations', 4)
const MAX_QUALIFYING_ITERATIONS = argumentValue(
  'qualifying-iterations',
  2,
)
const DRY_RUN = process.argv.includes('--dry-run')
const QUALIFYING_ONLY = process.argv.includes('--qualifying-only')
const LIVE_QUALIFYING_ONLY = process.argv.includes('--live-qualifying-only')
const VALIDATE_LIVE_QUALIFYING_ONLY = process.argv.includes(
  '--validate-live-qualifying-only',
)
const RACE_ONLY = process.argv.includes('--race-only')
const SKIP_FINAL_VALIDATION = process.argv.includes('--skip-final-validation')
const VALIDATE_ONLY = process.argv.includes('--validate-only')
const TRACK_FILTER = stringArgumentValue('track')
const SERIES_FILTER = stringArgumentValue('series')

const round = (value, digits = 3) =>
  value === null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits))

const median = (values) => {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

async function readCalibration() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(FILES).map(async ([series, path]) => [
        series,
        JSON.parse(await readFile(path, 'utf8')),
      ]),
    ),
  )
}

async function writeCalibration(records) {
  if (DRY_RUN) {
    return
  }

  for (const seriesRecords of Object.values(records)) {
    for (const record of seriesRecords) {
      delete record.simulation.liveTimingProgressScale
    }
  }

  await Promise.all(
    Object.entries(FILES).map(([series, path]) =>
      writeFile(
        path,
        `${JSON.stringify(records[series], null, 2)}\n`,
        'utf8',
      ),
    ),
  )
}

async function loadRuntime() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const seriesModule = await server.ssrLoadModule(
    '/src/series/seriesRegistry.ts',
  )
  const qualifyingModule = await server.ssrLoadModule(
    '/src/simulation/qualifying.ts',
  )
  const raceModule = await server.ssrLoadModule('/src/simulation/race.ts')
  const timedSessionModule = await server.ssrLoadModule(
    '/src/simulation/timedSessionPlan.ts',
  )

  return {
    close: () => server.close(),
    createInitialRace: raceModule.createInitialRace,
    advanceRace: raceModule.advanceRace,
    buildTimedSessionPlan: timedSessionModule.buildTimedSessionPlan,
    runKnockoutQualifying: qualifyingModule.runKnockoutQualifying,
    runSeriesQualifying: qualifyingModule.runSeriesQualifying,
    seriesPackageById: seriesModule.seriesPackageById,
  }
}

function configFor(series, track, seed, drivers = series.drivers, teams = series.teams) {
  return {
    categoryRaceFormat: series.rules.race,
    drivers,
    featureRaceMandatoryPitStop: series.rules.featureRaceMandatoryPitStop,
    featureRaceTwoDryCompounds: series.rules.featureRaceTwoDryCompounds,
    overtakeActivation: series.rules.overtakeActivation,
    overtakeSystem: series.rules.overtakeSystem,
    qualifyingDryCompound: series.rules.tires.qualifyingDryCompound,
    seed,
    seriesId: series.id,
    teams,
    tireSupplier: series.rules.tireSupplier,
    track:
      track.rainProbability === 0
        ? track
        : { ...track, rainProbability: 0 },
    weekendStage: 'race',
  }
}

function qualifyingDistribution(runtime, series, track, seedCount) {
  const poles = []
  const top3Medians = []
  const fieldMedianDeltas = []
  const dryTrack =
    track.rainProbability === 0
      ? track
      : { ...track, rainProbability: 0 }

  for (let index = 0; index < seedCount; index += 1) {
    const result = runtime.runKnockoutQualifying(
      configFor(
        series,
        dryTrack,
        `pace-calibration:${series.id}:${track.id}:${index}`,
      ),
    )
    const final = result.classification.filter(
      (entry) => entry.classificationStatus === 'classified',
    )
    const firstSegment = result.segments[0].results.filter(
      (entry) => entry.classificationStatus === 'classified',
    )
    const pole = final[0]?.lapTimeSeconds
    const top3 = median(
      final.slice(0, 3).map((entry) => entry.lapTimeSeconds),
    )
    const q1Leader = firstSegment[0]?.lapTimeSeconds
    const fieldMedian =
      q1Leader === undefined
        ? null
        : median(
            firstSegment.map(
              (entry) => entry.lapTimeSeconds - q1Leader,
            ),
          )

    if (Number.isFinite(pole)) poles.push(pole)
    if (top3 !== null) top3Medians.push(top3)
    if (fieldMedian !== null) fieldMedianDeltas.push(fieldMedian)
  }

  return {
    poleMedianSeconds: median(poles),
    top3MedianSeconds: median(top3Medians),
    fieldMedianDeltaSeconds: median(fieldMedianDeltas),
  }
}

function liveQualifyingDistribution(runtime, series, track, seedCount) {
  const top3Medians = []
  const dryTrack =
    track.rainProbability === 0
      ? track
      : { ...track, rainProbability: 0 }

  for (let index = 0; index < seedCount; index += 1) {
    const seed = `live-pace-calibration:${series.id}:${track.id}:${index}`
    const qualifyingConfig = {
      ...configFor(series, dryTrack, seed),
      tireAllocation: series.rules.tires.standardAllocation,
      weekendStage: 'qualifying',
    }
    const qualifying = runtime.runSeriesQualifying(
      qualifyingConfig,
      series.rules,
    )
    const config = {
      ...qualifyingConfig,
      timedSessionPlan: runtime.buildTimedSessionPlan(
        qualifying,
        series.rules.qualifying.breakSeconds,
        series.rules.qualifying.format,
      ),
    }
    let snapshot = runtime.createInitialRace(config)
    const q1EndsAtSeconds =
      config.timedSessionPlan.segments[0]?.endsAtSeconds ?? 18 * 60
    const measurementEndsAtSeconds =
      q1EndsAtSeconds + Math.max(120, dryTrack.baseLapTime * 1.8)

    for (
      let elapsed = 0;
      elapsed < measurementEndsAtSeconds;
      elapsed += 3
    ) {
      snapshot = runtime.advanceRace(snapshot, 3, config)
    }

    const bestByDriver = snapshot.cars
      .flatMap((car) => {
        const valid = car.lapHistory
          .filter(
            (lap) =>
              lap.isValid &&
              (lap.segment === 'Q1' || lap.segment === null),
          )
          .map((lap) => lap.lapTimeSeconds)
        return valid.length === 0 ? [] : [Math.min(...valid)]
      })
      .sort((left, right) => left - right)
    const top3 = median(bestByDriver.slice(0, 3))

    if (top3 !== null) {
      top3Medians.push(top3)
    }
  }

  return median(top3Medians)
}

/**
 * Runs a contiguous range of race seeds and returns one sample per seed.
 *
 * The seed string is built from the series, track, and absolute seed index, so
 * a seed produces the same race wherever it runs. That is what makes the shard
 * split below safe: splitting 100 seeds across workers gives the same set of
 * samples as running them in one process, only sooner.
 */
function raceGreenSeedSamples(runtime, series, track, seedFrom, seedCount) {
  const dryTrack =
    track.rainProbability === 0
      ? track
      : { ...track, rainProbability: 0 }
  const samples = []

  for (
    let index = seedFrom;
    index < seedFrom + seedCount;
    index += 1
  ) {
    const config = configFor(
      series,
      dryTrack,
      `race-pace-calibration:${series.id}:${track.id}:${index}`,
    )
    let snapshot = runtime.createInitialRace(config)
    const formationSeconds =
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

    snapshot = runtime.advanceRace(snapshot, formationSeconds, config)
    snapshot = runtime.advanceRace(snapshot, 8, config)
    snapshot = runtime.advanceRace(snapshot, 5, config)
    const maximumSteps = Math.ceil(
      (dryTrack.baseLapTime * snapshot.raceLaps * 2.2 + 1_800) / 3,
    )

    for (
      let step = 0;
      step < maximumSteps && snapshot.sessionStatus !== 'finished';
      step += 1
    ) {
      snapshot = runtime.advanceRace(snapshot, 3, config)
    }

    const cleanRaceLaps = snapshot.cars
      .flatMap((car) => car.lapHistory)
      .filter(
        (lap) =>
          lap.isValid &&
          !lap.pitStop &&
          lap.lap > 1 &&
          lap.tireAgeLaps >= 2 &&
          lap.weather === 'clear' &&
          Number.isFinite(lap.lapTimeSeconds) &&
          lap.lapTimeSeconds > dryTrack.baseLapTime * 0.82 &&
          lap.lapTimeSeconds < dryTrack.baseLapTime * 1.35,
      )

    if (cleanRaceLaps.length > 0) {
      const middleWindow = cleanRaceLaps
        .filter(
          (lap) =>
            lap.position <= 5 &&
            lap.lap >= Math.floor(snapshot.raceLaps * 0.35) &&
            lap.lap <= Math.floor(snapshot.raceLaps * 0.6),
        )
        .map((lap) => lap.lapTimeSeconds)

      samples.push({
        fastestSeconds: Math.min(
          ...cleanRaceLaps.map((lap) => lap.lapTimeSeconds),
        ),
        representativeSeconds: median(middleWindow),
      })
    }
  }

  return samples
}

function distributionFromSamples(samples) {
  return {
    fastestMedianSeconds: median(
      samples.map((sample) => sample.fastestSeconds),
    ),
    representativeMedianSeconds: median(
      samples
        .map((sample) => sample.representativeSeconds)
        .filter((value) => value !== null),
    ),
  }
}

function spawnRaceWorker(options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT_PATH,
        `--worker-series=${options.seriesId}`,
        `--worker-track=${options.trackId}`,
        `--worker-seed-from=${options.seedFrom}`,
        `--worker-seed-count=${options.seedCount}`,
        `--worker-race-pace-scale=${options.racePaceScale ?? ''}`,
        `--result-file=${options.resultFile}`,
      ],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
    )

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(
        new Error(
          `${options.trackId} race worker exited with code ${code}`,
        ),
      )
    })
  })
}

/**
 * A full race distance costs seconds of wall clock, and the calibration needs
 * over a thousand of them, so the seed loop is split across processes. Below the
 * threshold the shard overhead - a Vite SSR start per worker - costs more than
 * it saves, so short runs stay in process.
 */
async function raceGreenDistribution(
  runtime,
  series,
  track,
  seedCount,
  racePaceScale,
) {
  if (WORKERS <= 1 || seedCount < PARALLEL_RACE_SEED_THRESHOLD || IS_WORKER) {
    return distributionFromSamples(
      raceGreenSeedSamples(runtime, series, track, 0, seedCount),
    )
  }

  const shardCount = Math.max(1, Math.min(WORKERS, seedCount))
  const perShard = Math.ceil(seedCount / shardCount)
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), 'f1-race-pace-calibration-'),
  )
  const shards = []

  for (let index = 0; index < shardCount; index += 1) {
    const seedFrom = index * perShard
    const shardSeeds = Math.min(perShard, seedCount - seedFrom)

    if (shardSeeds <= 0) {
      break
    }

    shards.push({
      resultFile: resolve(temporaryDirectory, `shard-${index}.json`),
      seedCount: shardSeeds,
      seedFrom,
    })
  }

  try {
    await Promise.all(
      shards.map((shard) =>
        spawnRaceWorker({
          racePaceScale,
          resultFile: shard.resultFile,
          seedCount: shard.seedCount,
          seedFrom: shard.seedFrom,
          seriesId: series.id,
          trackId: track.id,
        }),
      ),
    )

    const samples = []

    for (const shard of shards) {
      samples.push(
        ...JSON.parse(await readFile(shard.resultFile, 'utf8')),
      )
    }

    return distributionFromSamples(samples)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

async function runRaceWorkerShard() {
  const runtime = await loadRuntime()

  try {
    const series = runtime.seriesPackageById.get(WORKER_SERIES)

    if (!series) {
      throw new Error(`Unknown series ${WORKER_SERIES}`)
    }

    const track = series.tracks.find(
      (candidate) => candidate.id === WORKER_TRACK,
    )

    if (!track) {
      throw new Error(`Unknown track ${WORKER_TRACK}`)
    }

    const samples = raceGreenSeedSamples(
      runtime,
      series,
      WORKER_RACE_PACE_SCALE === null
        ? track
        : trackWithRacePaceScale(track, WORKER_RACE_PACE_SCALE),
      WORKER_SEED_FROM,
      WORKER_SEED_COUNT,
    )

    await writeFile(RESULT_FILE, JSON.stringify(samples), 'utf8')
  } finally {
    await runtime.close()
  }
}

function targetRaceFastestSeconds(record) {
  const qualifyingReference =
    record.qualifying.poleSeconds ??
    record.qualifying.selectedReferenceSeconds
  const expectedGreenDelta =
    record.simulation.expectedGreenRaceDeltaSeconds ??
    Math.max(
      2.2,
      (record.race.cleanLapReferenceSeconds ?? qualifyingReference + 4) -
        qualifyingReference,
    )

  // The fastest race lap is normally set with low fuel and a prepared tire,
  // so it should beat the representative green-race lap while retaining a
  // robust gap to qualifying trim.
  return (
    qualifyingReference +
    Math.min(5.8, Math.max(2.2, expectedGreenDelta * 0.78))
  )
}

function trackWithRacePaceScale(track, racePaceScale) {
  return {
    ...track,
    paceReference2026: track.paceReference2026
      ? {
          ...track.paceReference2026,
          calibration: {
            ...track.paceReference2026.calibration,
            simulation: {
              ...track.paceReference2026.calibration.simulation,
              racePaceScale,
            },
          },
        }
      : undefined,
  }
}

function trackWithLiveTimingScale(track, scale) {
  return {
    ...track,
    paceReference2026: track.paceReference2026
      ? {
          ...track.paceReference2026,
          calibration: {
            ...track.paceReference2026.calibration,
            simulation: {
              ...track.paceReference2026.calibration.simulation,
              liveTimingPaceScale: scale,
            },
          },
        }
      : undefined,
  }
}

function recordForTrack(records, seriesId, trackId) {
  return records[seriesId].find((record) => record.trackId === trackId)
}

function isSelectedTrack(track) {
  return TRACK_FILTER === undefined || track.id === TRACK_FILTER
}

function isSelectedSeries(seriesId) {
  return SERIES_FILTER === undefined || seriesId === SERIES_FILTER
}

async function calibrateQualifying() {
  for (
    let iteration = 0;
    iteration < MAX_QUALIFYING_ITERATIONS;
    iteration += 1
  ) {
    const records = await readCalibration()
    const runtime = await loadRuntime()
    let maximumError = 0

    for (const seriesId of Object.keys(FILES)) {
      if (!isSelectedSeries(seriesId)) {
        continue
      }
      const series = runtime.seriesPackageById.get(seriesId)

      if (!series) {
        throw new Error(`Missing series package ${seriesId}`)
      }

      for (const track of series.tracks) {
        if (!isSelectedTrack(track)) {
          continue
        }
        const record = recordForTrack(records, seriesId, track.id)

        if (!record) {
          continue
        }

        const distribution = qualifyingDistribution(
          runtime,
          series,
          track,
          QUALIFYING_SEEDS,
        )
        const target = record.qualifying.selectedReferenceSeconds
        const error =
          target - (distribution.top3MedianSeconds ?? target)
        maximumError = Math.max(maximumError, Math.abs(error))
        record.simulation.neutralBaseLapSeconds = round(
          record.simulation.neutralBaseLapSeconds + error,
        )
        record.simulation.qualifyingOffsetSeconds = round(
          record.simulation.neutralBaseLapSeconds - target,
        )
        record.simulation.calibrationSeedCount = QUALIFYING_SEEDS
        record.simulation.raceModelCorrectionSeconds ??= 0
      }
    }

    await runtime.close()
    await writeCalibration(records)
    process.stdout.write(
      `Qualifying iteration ${iteration + 1}: maximum top-three error before adjustment ${maximumError.toFixed(3)}s\n`,
    )

    if (maximumError < 0.015) {
      break
    }
  }
}

async function calibrateLiveTiming() {
  const records = await readCalibration()
  const runtime = await loadRuntime()

  for (const seriesId of ['f1-custom']) {
    const series = runtime.seriesPackageById.get(seriesId)

    if (!series) {
      continue
    }

    for (const track of series.tracks) {
      if (!isSelectedTrack(track)) {
        continue
      }

      const record = recordForTrack(records, seriesId, track.id)

      if (!record) {
        continue
      }

      const target = record.qualifying.selectedReferenceSeconds
      let scale = record.simulation.liveTimingPaceScale ?? 1
      let best = {
        absoluteError: Number.POSITIVE_INFINITY,
        observed: null,
        scale,
      }

      for (
        let iteration = 0;
        iteration < LIVE_QUALIFYING_ITERATIONS;
        iteration += 1
      ) {
        const observed = liveQualifyingDistribution(
          runtime,
          series,
          trackWithLiveTimingScale(track, scale),
          LIVE_QUALIFYING_SEEDS,
        )

        if (observed === null) {
          break
        }

        const absoluteError = Math.abs(observed - target)

        if (absoluteError < best.absoluteError) {
          best = { absoluteError, observed, scale }
        }

        scale = Math.min(1.3, Math.max(0.7, scale * (observed / target)))
      }

      record.simulation.liveTimingPaceScale = round(best.scale, 6)
      delete record.simulation.liveTimingProgressScale
      process.stdout.write(
        `${record.eventName}: live timing pace scale ${best.scale.toFixed(6)} (${best.observed?.toFixed(3) ?? 'no time'}s, error ${best.absoluteError.toFixed(3)}s)\n`,
      )
    }
  }

  await runtime.close()
  await writeCalibration(records)
}

async function validateLiveTimingCalibration() {
  const records = await readCalibration()
  const runtime = await loadRuntime()
  const validatedAt = new Date().toISOString()
  const report = []
  const series = runtime.seriesPackageById.get('f1-custom')

  if (series) {
    for (const track of series.tracks) {
      if (!isSelectedTrack(track)) {
        continue
      }

      const record = recordForTrack(records, series.id, track.id)

      if (!record) {
        continue
      }

      const observed = liveQualifyingDistribution(
        runtime,
        series,
        track,
        LIVE_QUALIFYING_SEEDS,
      )
      const error =
        observed === null
          ? null
          : observed - record.qualifying.selectedReferenceSeconds

      record.simulation.validation = {
        ...(record.simulation.validation ?? {}),
        validatedAt,
        liveQualifyingSeedCount: LIVE_QUALIFYING_SEEDS,
        liveQualifyingTop3MedianSeconds: round(observed),
        liveQualifyingReferenceErrorSeconds: round(error),
      }
      report.push({
        error: round(error),
        scale: record.simulation.liveTimingPaceScale,
        track: track.id,
      })
    }
  }

  await runtime.close()
  await writeCalibration(records)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

/**
 * Solves one track's race pace scale.
 *
 * The search is sequential by nature: each step picks the next scale from the
 * lap time the previous one produced. Tracks are independent of each other,
 * though, so the parallel axis for this phase is the track, not the seed.
 *
 * An event with an observed clean-lap reference is solved against the
 * representative green-flag lap, which is the value the acceptance limit is
 * measured on. Solving against the fastest lap instead leaves the scale
 * optimising one statistic while being graded on another: the two only agree
 * while the model's own fastest-to-representative spread matches the real one,
 * and a change to the drag or energy model moves that spread. The fastest-lap
 * target remains the fallback for an event with no observed race sample.
 */
async function solveRacePaceScale(runtime, series, track, record) {
  const representativeTarget =
    record.race.status === 'observed' &&
    Number.isFinite(record.race.cleanLapReferenceSeconds)
      ? record.race.cleanLapReferenceSeconds
      : null
  const target = representativeTarget ?? targetRaceFastestSeconds(record)
  let racePaceScale = record.simulation.racePaceScale ?? 1.04
  let best = {
    absoluteError: Number.POSITIVE_INFINITY,
    observed: null,
    scale: racePaceScale,
  }

  for (
    let iteration = 0;
    iteration < RACE_SEARCH_ITERATIONS;
    iteration += 1
  ) {
    const distribution = await raceGreenDistribution(
      runtime,
      series,
      trackWithRacePaceScale(track, racePaceScale),
      RACE_CALIBRATION_SEEDS,
      racePaceScale,
    )
    const observed =
      representativeTarget === null
        ? distribution.fastestMedianSeconds
        : (distribution.representativeMedianSeconds ??
          distribution.fastestMedianSeconds)

    if (observed === null) {
      break
    }

    const absoluteError = Math.abs(observed - target)
    if (absoluteError < best.absoluteError) {
      best = {
        absoluteError,
        observed,
        scale: racePaceScale,
      }
    }
    if (absoluteError < 0.05) {
      break
    }

    racePaceScale = Math.min(
      1.2,
      Math.max(0.88, racePaceScale * (observed / target)),
    )
  }

  return { best, target }
}

function selectedTrackJobs(runtime, records) {
  const jobs = []

  for (const seriesId of Object.keys(FILES)) {
    if (!isSelectedSeries(seriesId)) {
      continue
    }
    const series = runtime.seriesPackageById.get(seriesId)

    if (!series) {
      continue
    }

    for (const track of series.tracks) {
      if (!isSelectedTrack(track)) {
        continue
      }
      const record = recordForTrack(records, seriesId, track.id)

      if (record) {
        jobs.push({ record, series, seriesId, track })
      }
    }
  }

  return jobs
}

function spawnSearchWorker(seriesId, trackIds, resultFile) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT_PATH,
        `--worker-search-series=${seriesId}`,
        `--worker-search-tracks=${trackIds.join(',')}`,
        `--result-file=${resultFile}`,
        `--race-calibration-seeds=${RACE_CALIBRATION_SEEDS}`,
        `--race-search-iterations=${RACE_SEARCH_ITERATIONS}`,
        '--workers=1',
      ],
      { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
    )

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(new Error(`race search worker exited with code ${code}`))
    })
  })
}

async function runSearchWorkerShard() {
  const records = await readCalibration()
  const runtime = await loadRuntime()

  try {
    const series = runtime.seriesPackageById.get(WORKER_SEARCH_SERIES)

    if (!series) {
      throw new Error(`Unknown series ${WORKER_SEARCH_SERIES}`)
    }

    const trackIds = (WORKER_SEARCH_TRACKS ?? '')
      .split(',')
      .filter((value) => value.length > 0)
    const solved = []

    for (const trackId of trackIds) {
      const track = series.tracks.find(
        (candidate) => candidate.id === trackId,
      )
      const record = recordForTrack(records, WORKER_SEARCH_SERIES, trackId)

      if (!track || !record) {
        continue
      }

      const { best, target } = await solveRacePaceScale(
        runtime,
        series,
        track,
        record,
      )

      if (best.observed === null) {
        continue
      }

      solved.push({
        absoluteError: best.absoluteError,
        eventName: record.eventName,
        observed: best.observed,
        scale: best.scale,
        target,
        trackId,
      })
    }

    await writeFile(RESULT_FILE, JSON.stringify(solved), 'utf8')
  } finally {
    await runtime.close()
  }
}

async function calibrateRaceResidual() {
  const records = await readCalibration()
  const runtime = await loadRuntime()
  const jobs = selectedTrackJobs(runtime, records)

  // Each worker pays a Vite SSR start, so tracks are dealt out round-robin and a
  // worker keeps its runtime for every track it owns rather than starting one
  // per track.
  if (WORKERS > 1 && jobs.length > 1) {
    await runtime.close()

    const temporaryDirectory = await mkdtemp(
      resolve(tmpdir(), 'f1-race-pace-search-'),
    )

    try {
      const bySeries = new Map()

      for (const job of jobs) {
        const list = bySeries.get(job.seriesId) ?? []
        list.push(job.track.id)
        bySeries.set(job.seriesId, list)
      }

      const shards = []

      for (const [seriesId, trackIds] of bySeries) {
        const shardCount = Math.max(1, Math.min(WORKERS, trackIds.length))
        const buckets = Array.from({ length: shardCount }, () => [])

        trackIds.forEach((trackId, index) => {
          buckets[index % shardCount].push(trackId)
        })

        buckets.forEach((bucket, index) => {
          if (bucket.length > 0) {
            shards.push({
              resultFile: resolve(
                temporaryDirectory,
                `${seriesId}-${index}.json`,
              ),
              seriesId,
              trackIds: bucket,
            })
          }
        })
      }

      await Promise.all(
        shards.map((shard) =>
          spawnSearchWorker(shard.seriesId, shard.trackIds, shard.resultFile),
        ),
      )

      for (const shard of shards) {
        const solved = JSON.parse(await readFile(shard.resultFile, 'utf8'))

        for (const entry of solved) {
          const record = recordForTrack(
            records,
            shard.seriesId,
            entry.trackId,
          )

          if (!record) {
            continue
          }

          record.simulation.racePaceScale = round(entry.scale, 6)
          record.simulation.raceModelCorrectionSeconds = 0
          process.stdout.write(
            `${entry.eventName}: race pace scale ${entry.scale.toFixed(6)} (${entry.observed.toFixed(3)}s vs fastest target ${entry.target.toFixed(3)}s, error ${entry.absoluteError.toFixed(3)}s)\n`,
          )
        }
      }
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true })
    }

    await writeCalibration(records)
    return
  }

  for (const job of jobs) {
    const { best, target } = await solveRacePaceScale(
      runtime,
      job.series,
      job.track,
      job.record,
    )

    if (best.observed === null) {
      continue
    }

    job.record.simulation.racePaceScale = round(best.scale, 6)
    job.record.simulation.raceModelCorrectionSeconds = 0
    process.stdout.write(
      `${job.record.eventName}: race pace scale ${best.scale.toFixed(6)} (${best.observed.toFixed(3)}s vs fastest target ${target.toFixed(3)}s, error ${best.absoluteError.toFixed(3)}s)\n`,
    )
  }

  await runtime.close()
  await writeCalibration(records)
}

async function validateFinalCalibration() {
  const records = await readCalibration()
  const runtime = await loadRuntime()
  const validatedAt = new Date().toISOString()
  const report = []

  for (const seriesId of Object.keys(FILES)) {
    if (!isSelectedSeries(seriesId)) {
      continue
    }
    const series = runtime.seriesPackageById.get(seriesId)

    if (!series) {
      continue
    }

    for (const track of series.tracks) {
      if (!isSelectedTrack(track)) {
        continue
      }
      const record = recordForTrack(records, seriesId, track.id)

      if (!record) {
        continue
      }

      const qualifying = qualifyingDistribution(
        runtime,
        series,
        track,
        QUALIFYING_SEEDS,
      )
      const shouldValidateRace =
        record.race.status === 'observed' &&
        record.race.cleanLapReferenceSeconds !== null
      const raceDistribution = shouldValidateRace
        ? await raceGreenDistribution(
            runtime,
            series,
            track,
            RACE_VALIDATION_SEEDS,
          )
        : null
      const raceGreen = raceDistribution?.representativeMedianSeconds ?? null
      const qualifyingError =
        (qualifying.top3MedianSeconds ?? 0) -
        record.qualifying.selectedReferenceSeconds
      const raceError =
        raceGreen === null ||
        record.race.cleanLapReferenceSeconds === null
          ? null
          : raceGreen - record.race.cleanLapReferenceSeconds

      record.simulation.validation = {
        ...(record.simulation.validation ?? {}),
        validatedAt,
        qualifyingSeedCount: QUALIFYING_SEEDS,
        raceSeedCount: shouldValidateRace ? RACE_VALIDATION_SEEDS : 0,
        poleMedianSeconds: round(qualifying.poleMedianSeconds),
        top3MedianSeconds: round(qualifying.top3MedianSeconds),
        fieldMedianDeltaSeconds: round(
          qualifying.fieldMedianDeltaSeconds,
        ),
        raceGreenMedianSeconds: round(raceGreen),
        qualifyingReferenceErrorSeconds: round(qualifyingError),
        raceReferenceErrorSeconds: round(raceError),
      }
      report.push({
        series: seriesId,
        track: track.id,
        qError: round(qualifyingError),
        raceError: round(raceError),
      })
    }
  }

  await runtime.close()
  await writeCalibration(records)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

if (IS_SEARCH_WORKER) {
  await runSearchWorkerShard()
} else if (IS_WORKER) {
  await runRaceWorkerShard()
} else if (VALIDATE_ONLY) {
  await validateFinalCalibration()
} else if (QUALIFYING_ONLY) {
  await calibrateQualifying()
} else if (VALIDATE_LIVE_QUALIFYING_ONLY) {
  await validateLiveTimingCalibration()
} else if (LIVE_QUALIFYING_ONLY) {
  await calibrateLiveTiming()
  await validateLiveTimingCalibration()
} else if (RACE_ONLY) {
  await calibrateRaceResidual()
  if (!SKIP_FINAL_VALIDATION) {
    await validateFinalCalibration()
  }
} else {
  await calibrateQualifying()
  await calibrateLiveTiming()
  await calibrateRaceResidual()
  await validateFinalCalibration()
}
