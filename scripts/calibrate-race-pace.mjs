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
const QUALIFYING_SEEDS = argumentValue('qualifying-seeds', 100)
const RACE_CALIBRATION_SEEDS = argumentValue('race-calibration-seeds', 8)
const RACE_VALIDATION_SEEDS = argumentValue('race-validation-seeds', 100)
const RACE_SEARCH_ITERATIONS = argumentValue('race-search-iterations', 8)
const MAX_QUALIFYING_ITERATIONS = argumentValue(
  'qualifying-iterations',
  2,
)
const DRY_RUN = process.argv.includes('--dry-run')
const QUALIFYING_ONLY = process.argv.includes('--qualifying-only')
const RACE_ONLY = process.argv.includes('--race-only')
const VALIDATE_ONLY = process.argv.includes('--validate-only')

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

  return {
    close: () => server.close(),
    createInitialRace: raceModule.createInitialRace,
    advanceRace: raceModule.advanceRace,
    runKnockoutQualifying: qualifyingModule.runKnockoutQualifying,
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

function representativeDriver(runtime, series, track) {
  const result = runtime.runKnockoutQualifying(
    configFor(
      series,
      track,
      `pace-race-representative:${series.id}:${track.id}`,
    ),
  )
  const fifth = result.classification[Math.min(4, result.classification.length - 1)]
  const driver = series.drivers.find(
    (candidate) => candidate.id === fifth.driverId,
  )
  const team = series.teams.find(
    (candidate) => candidate.id === driver?.teamId,
  )

  return driver && team ? { driver, team } : null
}

function raceGreenDistribution(runtime, series, track, seedCount) {
  const dryTrack =
    track.rainProbability === 0
      ? track
      : { ...track, rainProbability: 0 }
  const representative = representativeDriver(runtime, series, dryTrack)

  if (!representative) {
    return null
  }

  const lapTimes = []

  for (let index = 0; index < seedCount; index += 1) {
    const config = configFor(
      series,
      dryTrack,
      `race-pace-calibration:${series.id}:${track.id}:${index}`,
      [representative.driver],
      [representative.team],
    )
    let snapshot = runtime.createInitialRace(config)
    const formationSeconds =
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

    snapshot = runtime.advanceRace(snapshot, formationSeconds, config)
    snapshot = runtime.advanceRace(snapshot, 8, config)
    snapshot = runtime.advanceRace(snapshot, 5, config)
    snapshot = {
      ...snapshot,
      cars: snapshot.cars.map((car) => ({
        ...car,
        fuelLoadKg: car.fuelLoadKg * 0.52,
        tireAgeLaps: Math.max(car.tireAgeLaps, 8),
        tireWearPercent: Math.max(car.tireWearPercent, 18),
      })),
    }

    for (
      let step = 0;
      step < 3_000 &&
      snapshot.cars[0]?.status === 'running' &&
      snapshot.cars[0].lapHistory.length < 3;
      step += 1
    ) {
      snapshot = runtime.advanceRace(snapshot, 0.25, config)
    }

    const stable = snapshot.cars[0]?.lapHistory
      .slice(1)
      .map((lap) => lap.lapTimeSeconds)
      .filter(
        (lapTime) =>
          Number.isFinite(lapTime) &&
          lapTime > dryTrack.baseLapTime * 0.82 &&
          lapTime < dryTrack.baseLapTime * 1.25,
      )

    if (stable?.length) {
      lapTimes.push(...stable)
    }
  }

  return median(lapTimes)
}

function trackWithRaceCorrection(track, correction) {
  return {
    ...track,
    paceReference2026: track.paceReference2026
      ? {
          ...track.paceReference2026,
          calibration: {
            ...track.paceReference2026.calibration,
            simulation: {
              ...track.paceReference2026.calibration.simulation,
              raceModelCorrectionSeconds: correction,
            },
          },
        }
      : undefined,
  }
}

function recordForTrack(records, seriesId, trackId) {
  return records[seriesId].find((record) => record.trackId === trackId)
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
      const series = runtime.seriesPackageById.get(seriesId)

      if (!series) {
        throw new Error(`Missing series package ${seriesId}`)
      }

      for (const track of series.tracks) {
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

async function calibrateRaceResidual() {
  const records = await readCalibration()
  const runtime = await loadRuntime()

  for (const seriesId of Object.keys(FILES)) {
    const series = runtime.seriesPackageById.get(seriesId)

    if (!series) {
      continue
    }

    for (const track of series.tracks) {
      const record = recordForTrack(records, seriesId, track.id)

      if (
        !record ||
        record.race.status !== 'observed' ||
        record.race.cleanLapReferenceSeconds === null
      ) {
        continue
      }

      let fasterBound = -30
      let slowerBound = 10
      let correction = 0
      let observed = null

      for (
        let iteration = 0;
        iteration < RACE_SEARCH_ITERATIONS;
        iteration += 1
      ) {
        correction = (fasterBound + slowerBound) / 2
        observed = raceGreenDistribution(
          runtime,
          series,
          trackWithRaceCorrection(track, correction),
          RACE_CALIBRATION_SEEDS,
        )

        if (observed === null) {
          break
        }

        if (observed > record.race.cleanLapReferenceSeconds) {
          slowerBound = correction
        } else {
          fasterBound = correction
        }
      }

      if (observed === null) {
        continue
      }

      correction = (fasterBound + slowerBound) / 2
      record.simulation.raceModelCorrectionSeconds = round(correction)
      process.stdout.write(
        `${record.eventName}: race model correction ${correction >= 0 ? '+' : ''}${correction.toFixed(3)}s (search median ${observed.toFixed(3)}s)\n`,
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
    const series = runtime.seriesPackageById.get(seriesId)

    if (!series) {
      continue
    }

    for (const track of series.tracks) {
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
      const raceGreen = shouldValidateRace
        ? raceGreenDistribution(
            runtime,
            series,
            track,
            RACE_VALIDATION_SEEDS,
          )
        : null
      const qualifyingError =
        (qualifying.top3MedianSeconds ?? 0) -
        record.qualifying.selectedReferenceSeconds
      const raceError =
        raceGreen === null ||
        record.race.cleanLapReferenceSeconds === null
          ? null
          : raceGreen - record.race.cleanLapReferenceSeconds

      record.simulation.validation = {
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
} else if (RACE_ONLY) {
  await calibrateRaceResidual()
  await validateFinalCalibration()
} else {
  await calibrateQualifying()
  await calibrateRaceResidual()
  await validateFinalCalibration()
}
