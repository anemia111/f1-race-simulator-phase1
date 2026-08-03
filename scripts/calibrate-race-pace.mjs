import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const ROOT = resolve(import.meta.dirname, '..')
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
const QUALIFYING_SEEDS = argumentValue('qualifying-seeds', 100)
const LIVE_QUALIFYING_SEEDS = argumentValue('live-qualifying-seeds', 3)
const LIVE_QUALIFYING_ITERATIONS = argumentValue(
  'live-qualifying-iterations',
  3,
)
const RACE_CALIBRATION_SEEDS = argumentValue('race-calibration-seeds', 3)
const RACE_VALIDATION_SEEDS = argumentValue('race-validation-seeds', 100)
const RACE_SEARCH_ITERATIONS = argumentValue('race-search-iterations', 3)
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

function raceGreenDistribution(runtime, series, track, seedCount) {
  const dryTrack =
    track.rainProbability === 0
      ? track
      : { ...track, rainProbability: 0 }
  const fastestBySeed = []
  const representativeBySeed = []

  for (let index = 0; index < seedCount; index += 1) {
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
      fastestBySeed.push(
        Math.min(...cleanRaceLaps.map((lap) => lap.lapTimeSeconds)),
      )
      const middleWindow = cleanRaceLaps
        .filter(
          (lap) =>
            lap.position <= 5 &&
            lap.lap >= Math.floor(snapshot.raceLaps * 0.35) &&
            lap.lap <= Math.floor(snapshot.raceLaps * 0.6),
        )
        .map((lap) => lap.lapTimeSeconds)
      const representative = median(middleWindow)
      if (representative !== null) {
        representativeBySeed.push(representative)
      }
    }
  }

  return {
    fastestMedianSeconds: median(fastestBySeed),
    representativeMedianSeconds: median(representativeBySeed),
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

/**
 * Reports how far simulated qualifying pace sits from the reference.
 *
 * This used to adjust `neutralBaseLapSeconds` by that error every iteration
 * and stop once the error fell below 0.015 s. It cannot work. Qualifying lap
 * times are produced from forces and do not read `baseLapTime` at all - the
 * doc comment on `timedPhysicalLap` says so, and `qualifying.test.ts` now
 * holds it to that - so the loop was moving a number that has no influence on
 * the quantity it measured. The error never changed, the break never fired,
 * and every pass added the same error again.
 *
 * The errors today run from -4.8 s to +7.9 s. With two iterations per call and
 * two calls per run, running this script would have moved every base lap time
 * by up to 31 s.
 *
 * So it reports instead of adjusting. The spread it prints is a real finding
 * about the pace model, not something a base lap time can absorb: the
 * simulation is fast at Baku, Monza, Spa and Silverstone and slow at Shanghai,
 * Madrid and Lusail, which is the same straight-against-corner axis the
 * physics calibration holdout shows.
 */
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

        if (Math.abs(error) >= 0.5) {
          process.stdout.write(
            `  ${seriesId} ${track.id}: simulated top-three ${(
              distribution.top3MedianSeconds ?? target
            ).toFixed(3)}s against reference ${target.toFixed(3)}s (${
              error > 0 ? '+' : ''
            }${error.toFixed(3)}s)\n`,
          )
        }

        record.simulation.calibrationSeedCount = QUALIFYING_SEEDS
        record.simulation.raceModelCorrectionSeconds ??= 0
      }
    }

    await runtime.close()
    await writeCalibration(records)
    process.stdout.write(
      `Qualifying pace check: worst top-three error ${maximumError.toFixed(3)}s\n`,
    )

    // Nothing here changes between passes now that the error is only reported,
    // so one is enough.
    break
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

async function calibrateRaceResidual() {
  const records = await readCalibration()
  const runtime = await loadRuntime()

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

      const target = targetRaceFastestSeconds(record)
      let racePaceScale =
        record.simulation.racePaceScale ??
        1.04
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
        const distribution = raceGreenDistribution(
          runtime,
          series,
          trackWithRacePaceScale(track, racePaceScale),
          RACE_CALIBRATION_SEEDS,
        )
        const observed = distribution.fastestMedianSeconds

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

      if (best.observed === null) {
        continue
      }

      record.simulation.racePaceScale = round(best.scale, 6)
      record.simulation.raceModelCorrectionSeconds = 0
      process.stdout.write(
        `${record.eventName}: race pace scale ${best.scale.toFixed(6)} (${best.observed.toFixed(3)}s vs fastest target ${target.toFixed(3)}s, error ${best.absoluteError.toFixed(3)}s)\n`,
      )
    }
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
        ? raceGreenDistribution(
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

if (VALIDATE_ONLY) {
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
