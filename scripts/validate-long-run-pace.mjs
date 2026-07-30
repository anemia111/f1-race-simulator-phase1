import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
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
  argument('output-dir', 'docs/validation/long-run-pace-2026'),
)
const LABEL = argument('label', 'after')
const TRACK_FILTER = argument('track')
const SEED_OVERRIDE = positiveInteger('seeds', 0)
const AUSTRALIA_SEEDS = positiveInteger('australia-seeds', 100)
const COURSE_SEEDS = positiveInteger('course-seeds', 20)
const WORKERS = positiveInteger(
  'workers',
  Math.max(1, Math.min(6, Math.floor((Number(process.env.NUMBER_OF_PROCESSORS) || 4) / 2))),
)
const STEP_SECONDS = Math.min(3, positiveNumber('step-seconds', 3))
const ENFORCE = process.argv.includes('--enforce')
const WORKER_TRACK = argument('worker-track')
const WORKER_SEEDS = positiveInteger('worker-seeds', 0)
const RESULT_FILE = argument('result-file')

const round = (value, digits = 3) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits))

function quantile(values, probability) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right)

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

function ratio(count, total) {
  return total <= 0 ? 0 : count / total
}

function sectorForProgress(progress, sectorMarks) {
  const normalized = ((progress % 1) + 1) % 1
  if (normalized < (sectorMarks[1] ?? 1 / 3)) return 0
  if (normalized < (sectorMarks[2] ?? 2 / 3)) return 1
  return 2
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
  const series = await server.ssrLoadModule('/src/series/seriesRegistry.ts')
  const vehicleDynamics = await server.ssrLoadModule(
    '/src/simulation/vehicleDynamics.ts',
  )
  const trackEvolution = await server.ssrLoadModule(
    '/src/simulation/trackEvolution.ts',
  )
  const weather = await server.ssrLoadModule('/src/simulation/weather.ts')

  return {
    advanceRace: race.advanceRace,
    close: () => server.close(),
    createInitialRace: race.createInitialRace,
    fuelMassEffects: vehicleDynamics.fuelMassEffects,
    seriesPackageById: series.seriesPackageById,
    simulatedTemperaturesFor: weather.simulatedTemperaturesFor,
    trackEvolutionGainSecondsFor:
      trackEvolution.trackEvolutionGainSecondsFor,
    trackLoadProfileFor: vehicleDynamics.trackLoadProfileFor,
  }
}

function configFor(series, track, seed) {
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
    track: track.rainProbability === 0 ? track : { ...track, rainProbability: 0 },
    weekendStage: 'race',
  }
}

function emptyBucket(car, snapshot) {
  return {
    battleSeconds: 0,
    blueFlagSeconds: 0,
    closeTrafficSeconds: 0,
    controlExposureSeconds: 0,
    damageStart: car.damage,
    endDamage: car.damage,
    endFuelLoadKg: car.fuelLoadKg,
    endRubberLevel: snapshot.trackEvolutionLevel,
    endTireGrainingPercent: car.tireGrainingPercent,
    endTireOverheatingPercent: car.tireOverheatingPercent,
    endTirePerformanceState: car.tirePerformanceState,
    endTireThermalStressPercent: car.tireThermalStressPercent ?? 0,
    endTireWearPercent: car.tireWearPercent,
    flagKinds: new Set(),
    lowSocSeconds: 0,
    modeSeconds: { defend: 0, push: 0, save: 0, standard: 0 },
    modeSwitches: 0,
    offTrackSeconds: 0,
    pitSeconds: 0,
    startFuelLoadKg: car.fuelLoadKg,
    startRubberLevel: snapshot.trackEvolutionLevel,
    startTireWearPercent: car.tireWearPercent,
    statusIssue: false,
    superClippingSeconds: 0,
    trafficSeconds: 0,
  }
}

function updateBucket(
  bucket,
  previousCar,
  car,
  snapshot,
  sectorMarks,
  seconds,
) {
  if (seconds <= 0) return

  bucket.endDamage = car.damage
  bucket.endFuelLoadKg = car.fuelLoadKg
  bucket.endRubberLevel = snapshot.trackEvolutionLevel
  bucket.endTireGrainingPercent = car.tireGrainingPercent
  bucket.endTireOverheatingPercent = car.tireOverheatingPercent
  bucket.endTirePerformanceState = car.tirePerformanceState
  bucket.endTireThermalStressPercent = car.tireThermalStressPercent ?? 0
  bucket.endTireWearPercent = car.tireWearPercent
  bucket.modeSeconds[car.racePaceMode] += seconds

  if (previousCar && previousCar.racePaceMode !== car.racePaceMode) {
    bucket.modeSwitches += 1
  }

  const sector = sectorForProgress(car.progress, sectorMarks)
  const sectorFlag = snapshot.sectorFlags[sector]
  const underControl =
    snapshot.flag !== 'clear' ||
    sectorFlag === 'yellow' ||
    sectorFlag === 'double-yellow' ||
    sectorFlag === 'sc' ||
    sectorFlag === 'vsc' ||
    sectorFlag === 'red'

  if (underControl) {
    bucket.controlExposureSeconds += seconds
    bucket.flagKinds.add(snapshot.flag === 'clear' ? sectorFlag : snapshot.flag)
  }

  if (car.position > 1 && car.gapToAhead > 0 && car.gapToAhead < 2.5) {
    bucket.trafficSeconds += seconds
  }
  if (car.position > 1 && car.gapToAhead > 0 && car.gapToAhead < 1) {
    bucket.closeTrafficSeconds += seconds
  }
  if (
    car.battlePhase === 'attacking' ||
    car.battlePhase === 'defending' ||
    car.battlePhase === 'side-by-side'
  ) {
    bucket.battleSeconds += seconds
  }
  if (car.blueFlag) {
    bucket.blueFlagSeconds += seconds
  }
  if (car.status === 'pit' || car.pitPhase !== 'none') {
    bucket.pitSeconds += seconds
  }
  if (car.offTrackSinceSeconds !== null && car.offTrackSinceSeconds !== undefined) {
    bucket.offTrackSeconds += seconds
  }
  if (car.superClippingIntensity >= 0.16) {
    bucket.superClippingSeconds += seconds
  }
  if (car.ersBatteryPercent < 18 || car.ersMode === 'harvest') {
    bucket.lowSocSeconds += seconds
  }
  if (
    car.status === 'retired' ||
    car.status === 'disqualified' ||
    car.status === 'dns'
  ) {
    bucket.statusIssue = true
  }
}

function finalizeLap(record, bucket, car, seed) {
  const modeTotal = Object.values(bucket.modeSeconds).reduce(
    (sum, seconds) => sum + seconds,
    0,
  )
  return {
    battleSeconds: bucket.battleSeconds,
    blueFlagSeconds: bucket.blueFlagSeconds,
    closeTrafficSeconds: bucket.closeTrafficSeconds,
    compound: record.tire,
    controlExposureSeconds: bucket.controlExposureSeconds,
    damageDelta: Math.max(0, bucket.endDamage - bucket.damageStart),
    driverId: car.driverId,
    endDamage: bucket.endDamage,
    endFuelLoadKg: bucket.endFuelLoadKg,
    endRubberLevel: bucket.endRubberLevel,
    endTireGrainingPercent: bucket.endTireGrainingPercent,
    endTireOverheatingPercent: bucket.endTireOverheatingPercent,
    endTirePerformanceState: bucket.endTirePerformanceState,
    endTireThermalStressPercent: bucket.endTireThermalStressPercent,
    endTireWearPercent: bucket.endTireWearPercent,
    flagKinds: [...bucket.flagKinds],
    isValid: record.isValid,
    lap: record.lap,
    lapTimeSeconds: record.lapTimeSeconds,
    lowSocSeconds: bucket.lowSocSeconds,
    modeShares: Object.fromEntries(
      Object.entries(bucket.modeSeconds).map(([mode, seconds]) => [
        mode,
        modeTotal <= 0 ? 0 : seconds / modeTotal,
      ]),
    ),
    modeSwitches: bucket.modeSwitches,
    offTrackSeconds: bucket.offTrackSeconds,
    pitSeconds: bucket.pitSeconds,
    pitStop: record.pitStop,
    position: record.position,
    seed,
    sectors: record.sectors,
    startFuelLoadKg: bucket.startFuelLoadKg,
    startRubberLevel: bucket.startRubberLevel,
    startTireWearPercent: bucket.startTireWearPercent,
    statusIssue: bucket.statusIssue,
    superClippingSeconds: bucket.superClippingSeconds,
    teamId: car.teamId,
    tireAgeLaps: record.tireAgeLaps,
    trackGrip: record.trackGrip,
    trafficSeconds: bucket.trafficSeconds,
    weather: record.weather,
  }
}

function baseClean(lap, qualifyingReferenceSeconds) {
  return (
    lap.isValid &&
    lap.lap > 1 &&
    lap.weather === 'clear' &&
    lap.controlExposureSeconds <= 0.01 &&
    lap.pitSeconds <= 0.01 &&
    !lap.pitStop &&
    lap.offTrackSeconds <= 0.01 &&
    lap.damageDelta < 0.005 &&
    lap.endDamage < 0.12 &&
    !lap.statusIssue &&
    lap.endTireWearPercent < 88 &&
    lap.endTirePerformanceState !== 'degraded' &&
    lap.lapTimeSeconds > qualifyingReferenceSeconds * 0.9 &&
    lap.lapTimeSeconds < qualifyingReferenceSeconds * 1.45
  )
}

function strictClean(lap, qualifyingReferenceSeconds) {
  return (
    baseClean(lap, qualifyingReferenceSeconds) &&
    lap.blueFlagSeconds <= 0.01 &&
    lap.trafficSeconds <= 0.01 &&
    lap.closeTrafficSeconds <= 0.01 &&
    lap.battleSeconds <= 0.01 &&
    lap.tireAgeLaps >= 2
  )
}

function phaseWindows(raceLaps) {
  return {
    early: [
      Math.max(3, Math.floor(raceLaps * 0.09)),
      Math.max(6, Math.floor(raceLaps * 0.18)),
    ],
    middle: [
      Math.max(8, Math.floor(raceLaps * 0.35)),
      Math.max(12, Math.ceil(raceLaps * 0.6)),
    ],
    late: [
      Math.max(12, Math.floor(raceLaps * 0.78)),
      raceLaps,
    ],
  }
}

function lapsInWindow(laps, [start, end]) {
  return laps.filter((lap) => lap.lap >= start && lap.lap <= end)
}

function sameStintPairs(laps) {
  const pairs = []
  const byDriver = Map.groupBy(
    laps,
    (lap) => `${lap.seed}:${lap.driverId}`,
  )

  for (const driverLaps of byDriver.values()) {
    const sorted = [...driverLaps].sort((left, right) => left.lap - right.lap)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (
        current.lap === previous.lap + 1 &&
        current.compound === previous.compound &&
        current.tireAgeLaps === previous.tireAgeLaps + 1
      ) {
        pairs.push({ current, previous })
      }
    }
  }

  return pairs
}

function reasonForPair(pair) {
  const laps = [pair.previous, pair.current]
  if (laps.some((lap) => lap.weather !== 'clear')) return 'weather'
  if (laps.some((lap) => lap.controlExposureSeconds > 0)) return 'flag'
  if (laps.some((lap) => lap.pitSeconds > 0 || lap.pitStop)) return 'pit'
  if (laps.some((lap) => lap.damageDelta > 0 || lap.endDamage >= 0.12)) {
    return 'damage'
  }
  if (laps.some((lap) => lap.offTrackSeconds > 0)) return 'off-track'
  if (
    laps.some(
      (lap) =>
        lap.endTirePerformanceState === 'degraded' ||
        lap.endTireWearPercent >= 88 ||
        lap.endTireOverheatingPercent >= 72,
    )
  ) {
    return 'tire-cliff'
  }
  if (
    laps.some(
      (lap) =>
        lap.trafficSeconds > 0 ||
        lap.closeTrafficSeconds > 0 ||
        lap.battleSeconds > 0 ||
        lap.blueFlagSeconds > 0,
    )
  ) {
    return 'traffic'
  }
  if (
    laps.some(
      (lap) =>
        lap.superClippingSeconds > 3 ||
        lap.lowSocSeconds > 12 ||
        lap.modeShares.save > 0.5,
    )
  ) {
    return 'energy-recovery'
  }
  const dominantMode = (lap) =>
    Object.entries(lap.modeShares).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0]
  const maximumModeShareChange = Math.max(
    ...Object.keys(pair.current.modeShares).map((mode) =>
      Math.abs(
        pair.current.modeShares[mode] - pair.previous.modeShares[mode],
      ),
    ),
  )
  if (
    laps.some((lap) => lap.modeSwitches > 0) ||
    dominantMode(pair.current) !== dominantMode(pair.previous) ||
    maximumModeShareChange >= 0.35
  ) {
    return 'pace-mode'
  }
  return 'unexplained'
}

async function runSeed(runtime, series, track, seed) {
  const config = configFor(series, track, seed)
  let snapshot = runtime.createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = runtime.advanceRace(snapshot, formationSeconds, config)
  snapshot = runtime.advanceRace(snapshot, 8, config)
  snapshot = runtime.advanceRace(snapshot, 5, config)

  const historyLengths = new Map(
    snapshot.cars.map((car) => [car.driverId, car.lapHistory.length]),
  )
  const buckets = new Map(
    snapshot.cars.map((car) => [car.driverId, emptyBucket(car, snapshot)]),
  )
  const laps = []
  const modeSeconds = { defend: 0, push: 0, save: 0, standard: 0 }
  let modeSwitches = 0
  let unexplainedIntraLapModeSwitches = 0
  let temperatureObservationSeconds = 0
  let weightedAirTemperatureC = 0
  let weightedTrackTemperatureC = 0
  const maximumSteps = Math.ceil(
    (track.baseLapTime * snapshot.raceLaps * 2.2 + 1_800) / STEP_SECONDS,
  )

  for (
    let step = 0;
    step < maximumSteps && snapshot.sessionStatus !== 'finished';
    step += 1
  ) {
    const previous = snapshot
    const previousCars = new Map(
      previous.cars.map((car) => [car.driverId, car]),
    )
    snapshot = runtime.advanceRace(snapshot, STEP_SECONDS, config)
    const elapsed = snapshot.elapsedSeconds - previous.elapsedSeconds
    const temperatures = runtime.simulatedTemperaturesFor(
      config.seed,
      config.track,
      snapshot.weather,
    )
    temperatureObservationSeconds += elapsed
    weightedAirTemperatureC += temperatures.airTemperatureC * elapsed
    weightedTrackTemperatureC +=
      (config.track.observedCalibration?.trackTemperatureC ??
        temperatures.trackTemperatureC) * elapsed

    for (const car of snapshot.cars) {
      const previousCar = previousCars.get(car.driverId)
      let bucket = buckets.get(car.driverId) ?? emptyBucket(car, snapshot)
      updateBucket(
        bucket,
        previousCar,
        car,
        snapshot,
        config.track.sectorMarks,
        elapsed,
      )
      modeSeconds[car.racePaceMode] += elapsed

      if (previousCar && previousCar.racePaceMode !== car.racePaceMode) {
        modeSwitches += 1
        if (
          snapshot.flag === 'clear' &&
          previous.flag === 'clear' &&
          Math.floor(previousCar.totalDistance) ===
            Math.floor(car.totalDistance) &&
          previousCar.racePaceModeDecisionLap ===
            car.racePaceModeDecisionLap
        ) {
          unexplainedIntraLapModeSwitches += 1
        }
      }

      const previousLength = historyLengths.get(car.driverId) ?? 0
      const nextLength = car.lapHistory.length

      if (nextLength > previousLength) {
        for (const record of car.lapHistory.slice(previousLength)) {
          laps.push(finalizeLap(record, bucket, car, seed))
          bucket = emptyBucket(car, snapshot)
        }
        historyLengths.set(car.driverId, nextLength)
      }
      buckets.set(car.driverId, bucket)
    }
  }

  return {
    finished: snapshot.sessionStatus === 'finished',
    carCount: snapshot.cars.length,
    laps,
    modeSeconds,
    modeSwitches,
    raceLaps: snapshot.raceLaps,
    retiredCount: snapshot.cars.filter((car) => car.status === 'retired').length,
    seed,
    meanAirTemperatureC:
      temperatureObservationSeconds <= 0
        ? null
        : weightedAirTemperatureC / temperatureObservationSeconds,
    meanTrackTemperatureC:
      temperatureObservationSeconds <= 0
        ? null
        : weightedTrackTemperatureC / temperatureObservationSeconds,
    unexplainedIntraLapModeSwitches,
  }
}

function summarizeTrack(track, seedRuns, loadProfile, conditionModel) {
  const calibration = track.paceReference2026?.calibration
  const qualifyingReferenceSeconds =
    calibration?.qualifying.poleSeconds ??
    calibration?.qualifying.selectedReferenceSeconds ??
    track.paceReference2026?.qualifyingSeconds ??
    track.baseLapTime
  const raceLaps =
    median(seedRuns.map((run) => run.raceLaps)) ?? track.raceLaps ?? 1
  const windows = phaseWindows(raceLaps)
  const seedMetrics = seedRuns.map((run) => {
    const clean = run.laps.filter((lap) =>
      baseClean(lap, qualifyingReferenceSeconds),
    )
    const strict = clean.filter((lap) =>
      strictClean(lap, qualifyingReferenceSeconds),
    )
    const front = strict.filter((lap) => lap.position <= 5)
    const phaseMedian = (window) =>
      median(lapsInWindow(front, window).map((lap) => lap.lapTimeSeconds))
    return {
      early: phaseMedian(windows.early),
      fastest: clean.length === 0
        ? null
        : Math.min(...clean.map((lap) => lap.lapTimeSeconds)),
      late: phaseMedian(windows.late),
      middle: phaseMedian(windows.middle),
    }
  })
  const allLaps = seedRuns.flatMap((run) => run.laps)
  const cleanLaps = allLaps.filter((lap) =>
    baseClean(lap, qualifyingReferenceSeconds),
  )
  const strictLaps = cleanLaps.filter((lap) =>
    strictClean(lap, qualifyingReferenceSeconds),
  )
  const pairs = sameStintPairs(allLaps)
  const strictPairs = pairs.filter(
    ({ current, previous }) =>
      strictClean(current, qualifyingReferenceSeconds) &&
      strictClean(previous, qualifyingReferenceSeconds),
  )
  const absoluteChanges = strictPairs.map(({ current, previous }) =>
    Math.abs(current.lapTimeSeconds - previous.lapTimeSeconds),
  )
  const strictLargePairs = strictPairs
    .map((pair) => ({
      ...pair,
      changeSeconds: Math.abs(
        pair.current.lapTimeSeconds - pair.previous.lapTimeSeconds,
      ),
      reason: reasonForPair(pair),
    }))
    .filter((pair) => pair.changeSeconds >= 1)
  const allLargePairs = pairs
    .map((pair) => ({
      ...pair,
      changeSeconds: Math.abs(
        pair.current.lapTimeSeconds - pair.previous.lapTimeSeconds,
      ),
      reason: reasonForPair(pair),
    }))
    .filter((pair) => pair.changeSeconds >= 2)
  const unexplainedLargePairs = allLargePairs.filter(
    (pair) => pair.reason === 'unexplained',
  )
  const summarizeOutlierPair = (pair) => ({
    changeSeconds: round(pair.changeSeconds),
    current: {
      fuelLoadKg: round(pair.current.endFuelLoadKg, 2),
      lap: pair.current.lap,
      modeShares: pair.current.modeShares,
      timeSeconds: round(pair.current.lapTimeSeconds),
      tire: `${pair.current.compound}${pair.current.tireAgeLaps}`,
      wearPercent: round(pair.current.endTireWearPercent, 1),
    },
    driverId: pair.current.driverId,
    previous: {
      fuelLoadKg: round(pair.previous.endFuelLoadKg, 2),
      lap: pair.previous.lap,
      modeShares: pair.previous.modeShares,
      timeSeconds: round(pair.previous.lapTimeSeconds),
      tire: `${pair.previous.compound}${pair.previous.tireAgeLaps}`,
      wearPercent: round(pair.previous.endTireWearPercent, 1),
    },
    reason: pair.reason,
    seed: pair.current.seed,
  })
  const compoundDeltas = {}

  for (const compound of ['S', 'M', 'H', 'I', 'W']) {
    const values = strictPairs
      .filter(({ current }) => current.compound === compound)
      .map(
        ({ current, previous }) =>
          current.lapTimeSeconds - previous.lapTimeSeconds,
      )
    compoundDeltas[compound] = {
      medianSecondsPerLap: round(median(values)),
      sampleCount: values.length,
    }
  }

  const freshGains = []
  const byCar = Map.groupBy(allLaps, (lap) => `${lap.seed}:${lap.driverId}`)
  for (const laps of byCar.values()) {
    const sorted = [...laps].sort((left, right) => left.lap - right.lap)
    for (let index = 1; index < sorted.length; index += 1) {
      const current = sorted[index]
      if (
        current.tireAgeLaps === 2 &&
        strictClean(current, qualifyingReferenceSeconds)
      ) {
        const oldTireLap = sorted
          .slice(0, index)
          .findLast(
            (lap) =>
              lap.tireAgeLaps >= 6 &&
              strictClean(lap, qualifyingReferenceSeconds),
          )
        if (oldTireLap) {
          freshGains.push(oldTireLap.lapTimeSeconds - current.lapTimeSeconds)
        }
      }
    }
  }

  const fuelRanges = [...byCar.values()]
    .map((laps) => {
      const clean = laps.filter((lap) =>
        strictClean(lap, qualifyingReferenceSeconds),
      )
      return clean.length < 2
        ? null
        : {
            highKg: Math.max(...clean.map((lap) => lap.endFuelLoadKg)),
            lowKg: Math.min(...clean.map((lap) => lap.endFuelLoadKg)),
          }
    })
    .filter((value) => value !== null)
  const rubberRanges = seedRuns.map((run) => {
    const laps = run.laps.filter((lap) =>
      strictClean(lap, qualifyingReferenceSeconds),
    )
    return laps.length < 2
      ? null
      : {
          high: Math.max(...laps.map((lap) => lap.endRubberLevel)),
          low: Math.min(...laps.map((lap) => lap.endRubberLevel)),
        }
  }).filter((value) => value !== null)
  const fuelGainEstimates = fuelRanges.map(
    ({ highKg, lowKg }) =>
      conditionModel.fuelMassEffects({
        fuelLoadKg: highKg,
        track,
      }).lapTimeDeltaSeconds -
      conditionModel.fuelMassEffects({
        fuelLoadKg: lowKg,
        track,
      }).lapTimeDeltaSeconds,
  )
  const rubberGainEstimates = rubberRanges.map(
    ({ high, low }) =>
      conditionModel.trackEvolutionGainSecondsFor(high, track) -
      conditionModel.trackEvolutionGainSecondsFor(low, track),
  )
  const totalModeSeconds = seedRuns.reduce(
    (sum, run) =>
      sum + Object.values(run.modeSeconds).reduce((total, value) => total + value, 0),
    0,
  )
  const modeUsage = Object.fromEntries(
    ['defend', 'push', 'save', 'standard'].map((mode) => [
      mode,
      totalModeSeconds <= 0
        ? 0
        : seedRuns.reduce((sum, run) => sum + run.modeSeconds[mode], 0) /
          totalModeSeconds,
    ]),
  )
  const fastestBySeed = seedMetrics
    .map((metric) => metric.fastest)
    .filter((value) => value !== null)
  const earlyMedian = median(
    seedMetrics.map((metric) => metric.early).filter((value) => value !== null),
  )
  const middleMedian = median(
    seedMetrics.map((metric) => metric.middle).filter((value) => value !== null),
  )
  const lateMedian = median(
    seedMetrics.map((metric) => metric.late).filter((value) => value !== null),
  )
  const fastestMedian = median(fastestBySeed)
  const qualifyingGap =
    fastestMedian === null ? null : fastestMedian - qualifyingReferenceSeconds
  const expectedGreenRaceDeltaSeconds =
    calibration?.simulation.expectedGreenRaceDeltaSeconds ??
    Math.min(
      8,
      Math.max(
        2.2,
        track.baseLapTime * 0.041 +
          (track.kind === 'street' ? 1.15 : track.kind === 'hybrid' ? 0.55 : 0.2),
      ),
    )
  const expectedFastestGapSeconds = Math.min(
    5.8,
    Math.max(2.2, expectedGreenRaceDeltaSeconds * 0.78),
  )
  const frontPace = median(
    strictLaps
      .filter((lap) => lap.position <= 5)
      .map((lap) => lap.lapTimeSeconds),
  )
  const midfieldPace = median(
    strictLaps
      .filter((lap) => lap.position >= 9 && lap.position <= 14)
      .map((lap) => lap.lapTimeSeconds),
  )
  const reasons = []
  let verdict = 'PASS'
  const fail = (reason) => {
    verdict = 'FAIL'
    reasons.push(reason)
  }
  const warn = (reason) => {
    if (verdict === 'PASS') verdict = 'WARN'
    reasons.push(reason)
  }

  if (seedRuns.some((run) => !run.finished)) fail('one or more races did not finish')
  if (fastestMedian === null) {
    fail('no clean fastest-lap sample')
  } else if (qualifyingGap < 1.5) {
    fail('race fastest is less than 1.5s behind qualifying')
  } else if (qualifyingGap < 2) {
    warn('race fastest is less than 2.0s behind qualifying')
  } else if (qualifyingGap > expectedFastestGapSeconds + 3) {
    fail('race fastest is more than 3.0s slower than its calibrated target')
  } else if (qualifyingGap > expectedFastestGapSeconds + 1.5) {
    warn('race fastest is more than 1.5s slower than its calibrated target')
  }
  const p95Change = quantile(absoluteChanges, 0.95)
  const overOneRate = ratio(
    absoluteChanges.filter((value) => value >= 1).length,
    absoluteChanges.length,
  )
  if (p95Change !== null && p95Change > 2) {
    fail('clean same-stint P95 change exceeds 2.0s')
  } else if (p95Change !== null && p95Change > 1) {
    warn('clean same-stint P95 change exceeds 1.0s')
  }
  if (overOneRate > 0.12) {
    fail('more than 12% of clean same-stint changes exceed 1.0s')
  } else if (overOneRate > 0.06) {
    warn('more than 6% of clean same-stint changes exceed 1.0s')
  }
  if (unexplainedLargePairs.length > 0) {
    fail('unexplained 2.0s+ same-stint changes remain')
  }
  if (
    earlyMedian !== null &&
    lateMedian !== null &&
    lateMedian - earlyMedian > 1
  ) {
    fail('late clean pace is more than 1.0s slower than early pace')
  }
  if (!track.paceReference2026) {
    warn('qualifying and race references are estimated')
  }
  const unexplainedSwitches = seedRuns.reduce(
    (sum, run) => sum + run.unexplainedIntraLapModeSwitches,
    0,
  )
  if (unexplainedSwitches > 0) {
    fail('automatic pace mode changed within a green lap')
  }
  if (track.id === 'albert-park-approx' && seedRuns.length >= 20) {
    const outside = (value, minimum, maximum) =>
      value === null || value < minimum || value > maximum
    if (outside(fastestMedian, 81.9, 82.8)) {
      fail('Australia race fastest median is outside 1:21.9-1:22.8')
    }
    if (outside(earlyMedian, 84.5, 85.8)) {
      fail('Australia laps 5-10 median is outside 1:24.5-1:25.8')
    }
    if (outside(middleMedian, 82.8, 84.2)) {
      fail('Australia laps 20-35 median is outside 1:22.8-1:24.2')
    }
    if (outside(lateMedian, 82.1, 83.4)) {
      fail('Australia laps 45-58 median is outside 1:22.1-1:23.4')
    }
  }

  return {
    characteristicInputs: {
      accelerationShare: round(loadProfile.accelerationShare, 5),
      altitudeMeters: track.altitudeMeters ?? null,
      brakingShare: round(loadProfile.brakingShare, 5),
      corneringShare: round(loadProfile.corneringShare, 5),
      degradationDemandIndex: round(
        (track.surfaceRoughness ?? 1) *
          (0.45 +
            loadProfile.corneringShare * 0.35 +
            loadProfile.brakingShare * 0.2),
        5,
      ),
      highSpeedShare: round(loadProfile.highSpeedShare, 5),
      lowSpeedShare: round(loadProfile.lowSpeedShare, 5),
      trackKind: track.kind,
    },
    classification: {
      reasons,
      verdict,
    },
    compoundDegradation: compoundDeltas,
    cleanLapCount: cleanLaps.length,
    cleanVariation: {
      changeMedianSeconds: round(median(absoluteChanges)),
      changeP90Seconds: round(quantile(absoluteChanges, 0.9)),
      changeP95Seconds: round(p95Change),
      maximumSeconds: round(
        absoluteChanges.length === 0 ? null : Math.max(...absoluteChanges),
      ),
      overOneSecondRate: round(overOneRate, 5),
      overTwoSecondsRate: round(
        ratio(
          absoluteChanges.filter((value) => value >= 2).length,
          absoluteChanges.length,
        ),
        5,
      ),
      overThreeSecondsRate: round(
        ratio(
          absoluteChanges.filter((value) => value >= 3).length,
          absoluteChanges.length,
        ),
        5,
      ),
      reasonCountsOverOneSecond: Object.fromEntries(
        Object.entries(
          Object.groupBy(strictLargePairs, (pair) => pair.reason),
        ).map(([reason, values]) => [reason, values.length]),
      ),
      sampleCount: absoluteChanges.length,
    },
    conditionEstimates: {
      fuelGainSeconds: round(median(fuelGainEstimates)),
      fuelSpanKg: round(
        median(fuelRanges.map(({ highKg, lowKg }) => highKg - lowKg)),
        2,
      ),
      method:
        'signed fuel-mass analytic and controller-residual rubber estimate over each clean-run span; net physical rubber response is included in the phase trend',
      rubberControllerGainSeconds: round(median(rubberGainEstimates)),
      rubberGainSeconds: round(median(rubberGainEstimates)),
      rubberSpan: round(
        median(rubberRanges.map(({ high, low }) => high - low)),
        4,
      ),
    },
    eventName: calibration?.eventName ?? track.name,
    fastestLap: {
      medianSeconds: round(fastestMedian),
      p10Seconds: round(quantile(fastestBySeed, 0.1)),
      p90Seconds: round(quantile(fastestBySeed, 0.9)),
      qualifyingGapSeconds: round(qualifyingGap),
      seedDistributionSeconds: fastestBySeed.map((value) => round(value)),
      samples: [...cleanLaps]
        .sort(
          (left, right) => left.lapTimeSeconds - right.lapTimeSeconds,
        )
        .slice(0, 12)
        .map((lap) => ({
          battleSeconds: round(lap.battleSeconds),
          driverId: lap.driverId,
          fuelLoadKg: round(lap.endFuelLoadKg, 2),
          lap: lap.lap,
          modeShares: lap.modeShares,
          position: lap.position,
          rubberLevel: round(lap.endRubberLevel, 3),
          seed: lap.seed,
          superClippingSeconds: round(lap.superClippingSeconds),
          timeSeconds: round(lap.lapTimeSeconds),
          tire: `${lap.compound}${lap.tireAgeLaps}`,
          tireGrainingPercent: round(lap.endTireGrainingPercent, 1),
          tireOverheatingPercent: round(
            lap.endTireOverheatingPercent,
            1,
          ),
          tireWearPercent: round(lap.endTireWearPercent, 1),
          trafficSeconds: round(lap.trafficSeconds),
        })),
    },
    freshTireGainSeconds: round(median(freshGains)),
    modeUsage: {
      ...Object.fromEntries(
        Object.entries(modeUsage).map(([mode, value]) => [mode, round(value, 5)]),
      ),
      switchesPerCarRace: round(
        seedRuns.reduce((sum, run) => sum + run.modeSwitches, 0) /
          Math.max(
            1,
            seedRuns.reduce((sum, run) => sum + run.carCount, 0),
          ),
      ),
      unexplainedIntraLapSwitches: unexplainedSwitches,
    },
    outliers: {
      explainedTwoSecondCount:
        allLargePairs.length - unexplainedLargePairs.length,
      reasonCounts: Object.fromEntries(
        Object.entries(
          Object.groupBy(allLargePairs, (pair) => pair.reason),
        ).map(([reason, values]) => [reason, values.length]),
      ),
      samples: allLargePairs
        .sort((left, right) => right.changeSeconds - left.changeSeconds)
        .slice(0, 12)
        .map(summarizeOutlierPair),
      unexplainedSamples: unexplainedLargePairs
        .sort((left, right) => right.changeSeconds - left.changeSeconds)
        .slice(0, 12)
        .map(summarizeOutlierPair),
      unexplainedTwoSecondCount: unexplainedLargePairs.length,
    },
    paceByPhase: {
      earlyMedianSeconds: round(earlyMedian),
      improvementSeconds: round(
        earlyMedian === null || lateMedian === null
          ? null
          : earlyMedian - lateMedian,
      ),
      lateMedianSeconds: round(lateMedian),
      middleMedianSeconds: round(middleMedian),
      windows,
    },
    qualifyingReference: {
      basis: calibration?.qualifying.status ?? 'estimated-track-base',
      expectedFastestGapSeconds: round(expectedFastestGapSeconds),
      seconds: round(qualifyingReferenceSeconds),
    },
    seedCount: seedRuns.length,
    strictCleanLapCount: strictLaps.length,
    temperatureConditions: {
      meanAirTemperatureC: round(
        median(
          seedRuns
            .map((run) => run.meanAirTemperatureC)
            .filter((value) => value !== null),
        ),
      ),
      meanTrackTemperatureC: round(
        median(
          seedRuns
            .map((run) => run.meanTrackTemperatureC)
            .filter((value) => value !== null),
        ),
      ),
    },
    topToMidfieldCleanAirDeltaSeconds: round(
      frontPace === null || midfieldPace === null
        ? null
        : midfieldPace - frontPace,
    ),
    trackId: track.id,
  }
}

async function runTrackWorker(trackId, seedCount) {
  const runtime = await loadRuntime(ROOT)

  try {
    const series = runtime.seriesPackageById.get('f1-custom')
    if (!series) throw new Error('Missing f1-custom series package')
    const track = series.tracks.find((candidate) => candidate.id === trackId)
    if (!track) throw new Error(`Missing F1 track ${trackId}`)
    const runs = []

    for (let index = 0; index < seedCount; index += 1) {
      const seed = `long-run:${track.id}:${index}`
      runs.push(await runSeed(runtime, series, track, seed))
      if ((index + 1) % 5 === 0 || index + 1 === seedCount) {
        process.stdout.write(
          `[${track.id}] ${index + 1}/${seedCount} races complete\n`,
        )
      }
    }

    return summarizeTrack(
      track,
      runs,
      runtime.trackLoadProfileFor(track),
      runtime,
    )
  } finally {
    await runtime.close()
  }
}

function childArguments(trackId, seedCount, resultFile) {
  return [
    SCRIPT_PATH,
    `--worker-track=${trackId}`,
    `--worker-seeds=${seedCount}`,
    `--result-file=${resultFile}`,
    `--root=${ROOT}`,
    `--label=${LABEL}`,
    `--step-seconds=${STEP_SECONDS}`,
  ]
}

function runChild(trackId, seedCount, resultFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, childArguments(trackId, seedCount, resultFile), {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`${trackId} worker exited with code ${code}`))
    })
  })
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const CHARACTERISTIC_LABELS = {
  'high-speed-low-downforce': 'High speed / low downforce',
  'high-speed-high-downforce': 'High speed / high downforce',
  'low-speed-high-downforce': 'Low speed / high downforce',
  street: 'Street circuit',
  'stop-and-go': 'Stop and go',
  'high-degradation': 'High degradation',
  'low-degradation': 'Low degradation',
  'high-temperature': 'High temperature',
  'low-temperature': 'Low temperature',
  'high-altitude': 'High altitude',
}

function addTopRankedCharacteristic(summaries, id, score, count) {
  for (const summary of [...summaries]
    .sort((left, right) => score(right) - score(left))
    .slice(0, Math.min(count, summaries.length))) {
    summary.characteristics.push(id)
  }
}

function assignCharacteristics(summaries) {
  for (const summary of summaries) {
    summary.characteristics = []
    if (summary.characteristicInputs.trackKind === 'street') {
      summary.characteristics.push('street')
    }
    if ((summary.characteristicInputs.altitudeMeters ?? 0) >= 1_000) {
      summary.characteristics.push('high-altitude')
    }
  }

  const groupSize = Math.max(1, Math.ceil(summaries.length * 0.25))
  addTopRankedCharacteristic(
    summaries,
    'high-speed-low-downforce',
    (summary) =>
      summary.characteristicInputs.accelerationShare +
      summary.characteristicInputs.highSpeedShare -
      summary.characteristicInputs.corneringShare * 0.55,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'high-speed-high-downforce',
    (summary) =>
      summary.characteristicInputs.highSpeedShare +
      summary.characteristicInputs.corneringShare * 0.75,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'low-speed-high-downforce',
    (summary) =>
      summary.characteristicInputs.lowSpeedShare +
      summary.characteristicInputs.corneringShare * 0.75,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'stop-and-go',
    (summary) =>
      summary.characteristicInputs.accelerationShare +
      summary.characteristicInputs.brakingShare,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'high-degradation',
    (summary) => summary.characteristicInputs.degradationDemandIndex,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'low-degradation',
    (summary) => -summary.characteristicInputs.degradationDemandIndex,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'high-temperature',
    (summary) => summary.temperatureConditions.meanTrackTemperatureC ?? 0,
    groupSize,
  )
  addTopRankedCharacteristic(
    summaries,
    'low-temperature',
    (summary) => -(summary.temperatureConditions.meanTrackTemperatureC ?? 0),
    groupSize,
  )

  for (const summary of summaries) {
    summary.characteristics = [...new Set(summary.characteristics)]
  }
}

function characteristicGroupsFor(summaries) {
  const rank = { FAIL: 2, WARN: 1, PASS: 0 }

  return Object.entries(CHARACTERISTIC_LABELS).map(([id, label]) => {
    const members = summaries.filter((summary) =>
      summary.characteristics.includes(id),
    )
    const verdict = members.reduce(
      (worst, member) =>
        rank[member.classification.verdict] > rank[worst]
          ? member.classification.verdict
          : worst,
      'PASS',
    )

    return {
      fastestQualifyingGapMedianSeconds: round(
        median(
          members
            .map((member) => member.fastestLap.qualifyingGapSeconds)
            .filter((value) => value !== null),
        ),
      ),
      id,
      label,
      medianCleanChangeP95Seconds: round(
        median(
          members
            .map((member) => member.cleanVariation.changeP95Seconds)
            .filter((value) => value !== null),
        ),
      ),
      overOneSecondRateMedian: round(
        median(
          members
            .map((member) => member.cleanVariation.overOneSecondRate)
            .filter((value) => value !== null),
        ),
        5,
      ),
      trackCount: members.length,
      trackIds: members.map((member) => member.trackId),
      verdict,
    }
  })
}

function csvFor(summaries) {
  const columns = [
    ['trackId', (row) => row.trackId],
    ['eventName', (row) => row.eventName],
    ['verdict', (row) => row.classification.verdict],
    ['seedCount', (row) => row.seedCount],
    ['qualifyingReferenceSeconds', (row) => row.qualifyingReference.seconds],
    ['fastestMedianSeconds', (row) => row.fastestLap.medianSeconds],
    ['fastestP10Seconds', (row) => row.fastestLap.p10Seconds],
    ['fastestP90Seconds', (row) => row.fastestLap.p90Seconds],
    ['qualifyingGapSeconds', (row) => row.fastestLap.qualifyingGapSeconds],
    ['earlyMedianSeconds', (row) => row.paceByPhase.earlyMedianSeconds],
    ['middleMedianSeconds', (row) => row.paceByPhase.middleMedianSeconds],
    ['lateMedianSeconds', (row) => row.paceByPhase.lateMedianSeconds],
    ['paceImprovementSeconds', (row) => row.paceByPhase.improvementSeconds],
    ['cleanChangeMedianSeconds', (row) => row.cleanVariation.changeMedianSeconds],
    ['cleanChangeP90Seconds', (row) => row.cleanVariation.changeP90Seconds],
    ['cleanChangeP95Seconds', (row) => row.cleanVariation.changeP95Seconds],
    ['cleanChangeMaximumSeconds', (row) => row.cleanVariation.maximumSeconds],
    ['cleanChangeOverOneRate', (row) => row.cleanVariation.overOneSecondRate],
    ['cleanChangeOverTwoRate', (row) => row.cleanVariation.overTwoSecondsRate],
    ['cleanChangeOverThreeRate', (row) => row.cleanVariation.overThreeSecondsRate],
    ['softDegradationSecondsPerLap', (row) => row.compoundDegradation.S.medianSecondsPerLap],
    ['mediumDegradationSecondsPerLap', (row) => row.compoundDegradation.M.medianSecondsPerLap],
    ['hardDegradationSecondsPerLap', (row) => row.compoundDegradation.H.medianSecondsPerLap],
    ['fuelGainSeconds', (row) => row.conditionEstimates.fuelGainSeconds],
    ['fuelSpanKg', (row) => row.conditionEstimates.fuelSpanKg],
    ['rubberGainSeconds', (row) => row.conditionEstimates.rubberGainSeconds],
    ['rubberSpan', (row) => row.conditionEstimates.rubberSpan],
    ['freshTireGainSeconds', (row) => row.freshTireGainSeconds],
    ['topToMidfieldDeltaSeconds', (row) => row.topToMidfieldCleanAirDeltaSeconds],
    ['pushShare', (row) => row.modeUsage.push],
    ['standardShare', (row) => row.modeUsage.standard],
    ['saveShare', (row) => row.modeUsage.save],
    ['defendShare', (row) => row.modeUsage.defend],
    ['paceModeSwitchesPerCarRace', (row) => row.modeUsage.switchesPerCarRace],
    ['unexplainedTwoSecondCount', (row) => row.outliers.unexplainedTwoSecondCount],
    ['outlierReasonCounts', (row) => JSON.stringify(row.outliers.reasonCounts)],
    ['characteristics', (row) => row.characteristics.join('; ')],
    ['meanAirTemperatureC', (row) => row.temperatureConditions.meanAirTemperatureC],
    ['meanTrackTemperatureC', (row) => row.temperatureConditions.meanTrackTemperatureC],
    ['reasons', (row) => row.classification.reasons.join('; ')],
  ]
  return [
    columns.map(([name]) => csvCell(name)).join(','),
    ...summaries.map((summary) =>
      columns.map(([, getter]) => csvCell(getter(summary))).join(','),
    ),
  ].join('\n') + '\n'
}

function markdownFor(report) {
  const lines = [
    '# 2026 F1 Long-run Pace Validation',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Source commit: \`${report.sourceCommit}\``,
    `- Physics step: ${report.stepSeconds}s maximum`,
    `- Australia seeds: ${report.configuration.australiaSeeds}`,
    `- Other F1 circuit seeds: ${report.configuration.courseSeeds}`,
    `- Result: **${report.overallVerdict}**`,
    '',
    'Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.',
    '',
    '| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|',
  ]

  for (const row of report.tracks) {
    lines.push(
      `| ${row.eventName} | ${row.classification.verdict} | ${row.seedCount} | ${row.qualifyingReference.seconds ?? '-'} | ${row.fastestLap.medianSeconds ?? '-'} | ${row.fastestLap.qualifyingGapSeconds ?? '-'} | ${row.paceByPhase.earlyMedianSeconds ?? '-'} | ${row.paceByPhase.middleMedianSeconds ?? '-'} | ${row.paceByPhase.lateMedianSeconds ?? '-'} | ${row.cleanVariation.changeP95Seconds ?? '-'} | ${((row.cleanVariation.overOneSecondRate ?? 0) * 100).toFixed(2)}% | ${row.characteristics.join(', ')} | ${row.classification.reasons.join('; ') || 'Within acceptance'} |`,
    )
  }

  lines.push(
    '',
    '## Characteristic Coverage',
    '',
    '| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |',
    '|---|---:|---:|---:|---:|---:|',
  )

  for (const group of report.characteristicGroups) {
    lines.push(
      `| ${group.label} | ${group.verdict} | ${group.trackCount} | ${group.fastestQualifyingGapMedianSeconds ?? '-'} | ${group.medianCleanChangeP95Seconds ?? '-'} | ${((group.overOneSecondRateMedian ?? 0) * 100).toFixed(2)}% |`,
    )
  }

  lines.push(
    '',
    '## Method',
    '',
    'Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.',
    '',
    'The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.',
    '',
  )

  return `${lines.join('\n')}\n`
}

async function sourceCommit(root) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    return dirty ? `${commit}+working-tree` : commit
  } catch {
    return 'unknown'
  }
}

async function main() {
  const runtime = await loadRuntime(ROOT)
  let tracks
  try {
    const series = runtime.seriesPackageById.get('f1-custom')
    if (!series) throw new Error('Missing f1-custom series package')
    tracks = TRACK_FILTER
      ? series.tracks.filter(
          (track) => track.id === TRACK_FILTER || track.id.includes(TRACK_FILTER),
        )
      : series.tracks
  } finally {
    await runtime.close()
  }

  if (tracks.length === 0) {
    throw new Error(`No F1 track matches ${TRACK_FILTER}`)
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  const shardDirectory = resolve(OUTPUT_DIRECTORY, `.tmp-${LABEL}`)
  await rm(shardDirectory, { recursive: true, force: true })
  await mkdir(shardDirectory, { recursive: true })
  const jobs = tracks.map((track) => ({
    resultFile: resolve(shardDirectory, `${track.id}.json`),
    seedCount:
      SEED_OVERRIDE > 0
        ? SEED_OVERRIDE
        : track.id === 'albert-park-approx'
          ? AUSTRALIA_SEEDS
          : COURSE_SEEDS,
    trackId: track.id,
  }))
  let cursor = 0

  async function workerSlot() {
    while (cursor < jobs.length) {
      const job = jobs[cursor]
      cursor += 1
      await runChild(job.trackId, job.seedCount, job.resultFile)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(WORKERS, jobs.length) }, () => workerSlot()),
  )
  const summaries = []
  for (const job of jobs) {
    summaries.push(JSON.parse(await readFile(job.resultFile, 'utf8')))
  }
  await rm(shardDirectory, { recursive: true, force: true })

  if (SEED_OVERRIDE === 0) {
    for (const summary of summaries) {
      const requiredSeeds =
        summary.trackId === 'albert-park-approx'
          ? AUSTRALIA_SEEDS
          : COURSE_SEEDS
      if (summary.seedCount < requiredSeeds) {
        summary.classification.verdict = 'FAIL'
        summary.classification.reasons.push(
          `seed coverage ${summary.seedCount}/${requiredSeeds}`,
        )
      }
    }
  }
  assignCharacteristics(summaries)

  const overallVerdict = summaries.some(
    (summary) => summary.classification.verdict === 'FAIL',
  )
    ? 'FAIL'
    : summaries.some((summary) => summary.classification.verdict === 'WARN')
      ? 'WARN'
      : 'PASS'
  const report = {
    characteristicGroups: characteristicGroupsFor(summaries),
    configuration: {
      australiaSeeds: AUSTRALIA_SEEDS,
      courseSeeds: COURSE_SEEDS,
      registeredF1TrackCount: tracks.length,
      seedOverride: SEED_OVERRIDE || null,
      workers: WORKERS,
    },
    generatedAt: new Date().toISOString(),
    label: LABEL,
    overallVerdict,
    sourceCommit: await sourceCommit(ROOT),
    stepSeconds: STEP_SECONDS,
    tracks: summaries,
  }
  const baseName = `${LABEL}-long-run-pace`
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${baseName}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${baseName}.csv`),
    csvFor(summaries),
    'utf8',
  )
  await writeFile(
    resolve(OUTPUT_DIRECTORY, `${baseName}.md`),
    markdownFor(report),
    'utf8',
  )
  process.stdout.write(
    `Long-run validation ${overallVerdict}: ${summaries.length} track(s), reports in ${OUTPUT_DIRECTORY}\n`,
  )

  if (ENFORCE && overallVerdict === 'FAIL') {
    process.exitCode = 1
  }
}

if (WORKER_TRACK) {
  if (!RESULT_FILE || WORKER_SEEDS <= 0) {
    throw new Error('Worker requires --result-file and --worker-seeds')
  }
  const summary = await runTrackWorker(WORKER_TRACK, WORKER_SEEDS)
  await mkdir(dirname(resolve(RESULT_FILE)), { recursive: true })
  await writeFile(
    resolve(RESULT_FILE),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  )
} else {
  await main()
}
