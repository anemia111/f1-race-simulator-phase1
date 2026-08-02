/**
 * Measures the modeled peak on-track speed per circuit and compares it with the
 * observed 2026 speed-trap reference stored in the pace calibration records.
 *
 * The comparison target is deliberately per session family. A qualifying peak is
 * the cleanest drag observable: low fuel, an attack setup, and almost no tow. A
 * race peak adds fuel, tow, and Overtake trains, so the two are reported and
 * enforced separately instead of against one blended number.
 *
 * This script measures. It never writes a calibration value.
 */
import { createServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), '..')

function argument(name, fallback = undefined) {
  const prefix = `--${name}=`
  const match = process.argv.find((value) => value.startsWith(prefix))

  return match ? match.slice(prefix.length) : fallback
}

const ROOT = resolve(argument('root', DEFAULT_ROOT))
const OUTPUT_DIRECTORY = resolve(
  ROOT,
  argument('output', 'qa/speed-trap-2026'),
)
const LABEL = argument('label', 'after')
const TRACK_FILTER = argument('track')
const ENFORCE = process.argv.includes('--enforce')
const WRITE_REPORT = !process.argv.includes('--no-report')

/**
 * Acceptance for the straight-line speed model.
 *
 * Two statistics are compared. The median is the median of the cars' own peaks,
 * modeled against observed; the peak is the field maximum. A field maximum is a
 * single draw from the tail of an extreme-value distribution, so it is much
 * noisier than the typical car and is also sensitive to how many cars a session
 * put into the sample.
 *
 * Acceptance is on the aggregate rather than a tight per-circuit band, because
 * this is one physical drag model fitted to every circuit at once, not a
 * per-circuit correction. A tight per-circuit band would only be satisfiable by
 * adding per-circuit factors, which is the modelling fault this calibration
 * exists to remove. The outer bound still catches any single circuit going
 * structurally wrong.
 */
const MEAN_ABSOLUTE_ERROR_LIMIT_KPH = 8
const BIAS_LIMIT_KPH = 5
const CIRCUIT_OUTER_BOUND_KPH = 18

function quantile(values, probability) {
  const finite = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)

  if (finite.length === 0) {
    return null
  }

  const index = Math.min(
    finite.length - 1,
    Math.max(0, Math.floor(probability * finite.length)),
  )

  return finite[index]
}

const median = (values) => quantile(values, 0.5)
const round = (value, digits = 2) =>
  value === null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits))

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
  const telemetry = await server.ssrLoadModule('/src/simulation/telemetry.ts')
  const trackDynamics = await server.ssrLoadModule(
    '/src/simulation/trackDynamics.ts',
  )
  const engineering = await server.ssrLoadModule('/src/simulation/engineering.ts')
  const calibration = await server.ssrLoadModule('/src/data/paceCalibration.ts')

  return {
    advanceRace: race.advanceRace,
    baselineSetupForTrack: engineering.baselineSetupForTrack,
    calculateCarTelemetry: telemetry.calculateCarTelemetry,
    close: () => server.close(),
    createInitialRace: race.createInitialRace,
    idealSetupForTrack: engineering.idealSetupForTrack,
    paceCalibrationFor: calibration.paceCalibrationFor,
    progressForProfileSpeed: trackDynamics.progressForProfileSpeed,
    seriesPackageById: registry.seriesPackageById,
    trackDynamicsAt: trackDynamics.trackDynamicsAt,
  }
}

/**
 * Drives one car around a full lap with the production longitudinal model and
 * returns the peak speed it reaches. `sessionType: 'limited-time'` selects the
 * qualifying performance axes and an attack run; `race-distance` uses race axes.
 */
function peakSpeedForRun(runtime, options) {
  const { driver, fuelLoadKg, sessionType, setup, team, track } = options
  const snapshot = runtime.createInitialRace({
    drivers: [driver],
    seed: `speed-trap:${track.id}:${sessionType}:${driver.id}`,
    seriesId: 'f1-custom',
    teams: [team],
    track,
  })
  let car = {
    ...snapshot.cars[0],
    fuelLoadKg,
    gapToAhead: options.gapToAheadSeconds ?? 12,
    position: 1,
    progress: 0,
    speedKph: 110,
    status: 'running',
    timedRunPhase: sessionType === 'limited-time' ? 'attack-lap' : null,
    totalDistance: 1,
  }
  const deltaSeconds = 0.05
  const steps = Math.ceil((track.baseLapTime * 2.4) / deltaSeconds)
  let peakSpeedKph = 0

  for (let step = 0; step < steps; step += 1) {
    const telemetry = runtime.calculateCarTelemetry({
      car,
      deltaSeconds,
      driver,
      elapsedSeconds: step * deltaSeconds,
      lowGripConditions: false,
      phase: null,
      raceLap: Math.max(1, Math.floor(car.totalDistance)),
      sessionType,
      setup,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })
    const progressDelta = runtime.progressForProfileSpeed(
      track,
      car.progress,
      telemetry.speedKph,
      deltaSeconds,
    )

    // The first lap is a build-up from the pit-lane speed. Only measure once the
    // car has completed a lap, so the peak is a flying-lap peak.
    if (car.totalDistance >= 2) {
      peakSpeedKph = Math.max(peakSpeedKph, telemetry.speedKph)
    }

    car = {
      ...car,
      ...telemetry,
      progress: (car.progress + progressDelta) % 1,
      totalDistance: car.totalDistance + progressDelta,
    }
  }

  return peakSpeedKph
}

/**
 * Peak speed reached by a complete field through the production race loop. This
 * is the observable that includes tow, Overtake trains, and fuel burn.
 */
function fieldRacePeakSpeedKph(runtime, series, track, seed) {
  const config = {
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
  let snapshot = runtime.createInitialRace(config)

  snapshot = runtime.advanceRace(
    snapshot,
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned,
    config,
  )
  snapshot = runtime.advanceRace(snapshot, 8, config)
  snapshot = runtime.advanceRace(snapshot, 5, config)

  const peakByDriver = new Map()
  // Six laps of green running is enough for the field to spread into tow trains
  // without paying for a whole race distance on every circuit.
  const totalSeconds = track.baseLapTime * 6
  const stepSeconds = 0.25

  for (let step = 0; step * stepSeconds < totalSeconds; step += 1) {
    snapshot = runtime.advanceRace(snapshot, stepSeconds, config)

    if (snapshot.flag !== 'clear' || snapshot.sessionStatus === 'finished') {
      continue
    }

    for (const car of snapshot.cars) {
      if (car.status === 'running') {
        peakByDriver.set(
          car.driverId,
          Math.max(peakByDriver.get(car.driverId) ?? 0, car.speedKph),
        )
      }
    }
  }

  const driverPeaks = [...peakByDriver.values()]

  return {
    driverPeakMedianKph: median(driverPeaks) ?? 0,
    fieldPeakKph: driverPeaks.length ? Math.max(...driverPeaks) : 0,
  }
}

function referenceFor(runtime, track) {
  const calibration = runtime.paceCalibrationFor('f1-custom', track.id)

  return calibration?.speed ?? null
}

async function main() {
  const runtime = await loadRuntime(ROOT)

  try {
    const series = runtime.seriesPackageById.get('f1-custom')
    const tracks = series.tracks.filter(
      (track) => !TRACK_FILTER || track.id === TRACK_FILTER,
    )
    const summaries = []

    for (const track of tracks) {
      const reference = referenceFor(runtime, track)
      const raceTrack =
        track.rainProbability === 0 ? track : { ...track, rainProbability: 0 }
      const qualifyingPeaks = []
      const racePeaks = []

      // One car per team, so the sampled spread reflects the machine field
      // rather than repeating each team's pair of similar cars.
      const sampledDrivers = series.teams.flatMap((team) => {
        const driver = series.drivers.find(
          (candidate) => candidate.teamId === team.id,
        )

        return driver ? [driver] : []
      })

      for (const driver of sampledDrivers) {
        const team = series.teams.find(
          (candidate) => candidate.id === driver.teamId,
        )

        if (!team) {
          continue
        }

        qualifyingPeaks.push(
          peakSpeedForRun(runtime, {
            driver,
            fuelLoadKg: 9,
            sessionType: 'limited-time',
            setup: runtime.idealSetupForTrack(raceTrack),
            team,
            track: raceTrack,
          }),
        )
        racePeaks.push(
          peakSpeedForRun(runtime, {
            driver,
            fuelLoadKg: 55,
            sessionType: 'race-distance',
            setup: runtime.baselineSetupForTrack(raceTrack),
            team,
            track: raceTrack,
          }),
        )
      }

      const fieldRuns = [1, 2, 3].map((index) =>
        fieldRacePeakSpeedKph(
          runtime,
          series,
          raceTrack,
          `speed-trap-field:${track.id}:${index}`,
        ),
      )
      const modeledQualifyingMedianKph = median(qualifyingPeaks)
      const modeledQualifyingPeakKph = Math.max(...qualifyingPeaks)
      const modeledRaceMedianKph = median(
        fieldRuns.map((run) => run.driverPeakMedianKph),
      )
      const modeledRacePeakKph = Math.max(
        ...fieldRuns.map((run) => run.fieldPeakKph),
      )
      const delta = (modeled, observed) =>
        observed == null || modeled == null
          ? null
          : round(modeled - observed)
      const summary = {
        trackId: track.id,
        trackName: track.name,
        modeledQualifyingMedianKph: round(modeledQualifyingMedianKph),
        modeledQualifyingPeakKph: round(modeledQualifyingPeakKph),
        modeledSoloRacePeakKph: round(Math.max(...racePeaks)),
        modeledRaceMedianKph: round(modeledRaceMedianKph),
        modeledRacePeakKph: round(modeledRacePeakKph),
        observedQualifyingMedianKph:
          reference?.qualifyingDriverPeakMedianKph ?? null,
        observedQualifyingPeakKph: reference?.qualifyingFieldPeakKph ?? null,
        observedRaceMedianKph: reference?.raceDriverPeakMedianKph ?? null,
        observedRacePeakKph: reference?.raceFieldPeakKph ?? null,
        observedTrapKph: reference?.raceTrapMaxKph ?? null,
        observedStatus: reference?.status ?? null,
        qualifyingMedianErrorKph: delta(
          modeledQualifyingMedianKph,
          reference?.qualifyingDriverPeakMedianKph,
        ),
        qualifyingPeakErrorKph: delta(
          modeledQualifyingPeakKph,
          reference?.qualifyingFieldPeakKph,
        ),
        raceMedianErrorKph: delta(
          modeledRaceMedianKph,
          reference?.raceDriverPeakMedianKph,
        ),
        racePeakErrorKph: delta(
          modeledRacePeakKph,
          reference?.raceFieldPeakKph,
        ),
      }

      summaries.push(summary)
      const signed = (value) =>
        value === null ? '  n/a' : `${value > 0 ? '+' : ''}${value}`
      console.log(
        `${track.id.padEnd(24)} ` +
          `Q ${String(summary.modeledQualifyingMedianKph).padStart(6)}/${String(summary.modeledQualifyingPeakKph).padStart(6)} ` +
          `vs ${String(summary.observedQualifyingMedianKph ?? 'n/a').padStart(4)}/${String(summary.observedQualifyingPeakKph ?? 'n/a').padStart(4)} ` +
          `(${signed(summary.qualifyingMedianErrorKph)}/${signed(summary.qualifyingPeakErrorKph)}) | ` +
          `R ${String(summary.modeledRaceMedianKph).padStart(6)}/${String(summary.modeledRacePeakKph).padStart(6)} ` +
          `vs ${String(summary.observedRaceMedianKph ?? 'n/a').padStart(4)}/${String(summary.observedRacePeakKph ?? 'n/a').padStart(4)} ` +
          `(${signed(summary.raceMedianErrorKph)}/${signed(summary.racePeakErrorKph)})`,
      )
    }

    if (WRITE_REPORT) {
      await mkdir(OUTPUT_DIRECTORY, { recursive: true })
      await writeFile(
        resolve(OUTPUT_DIRECTORY, `${LABEL}-speed-trap.json`),
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            meanAbsoluteErrorLimitKph: MEAN_ABSOLUTE_ERROR_LIMIT_KPH,
            biasLimitKph: BIAS_LIMIT_KPH,
            circuitOuterBoundKph: CIRCUIT_OUTER_BOUND_KPH,
            summaries,
          },
          null,
          2,
        )}\n`,
      )
    }

    const errorFields = [
      ['qualifying median', 'qualifyingMedianErrorKph'],
      ['qualifying peak', 'qualifyingPeakErrorKph'],
      ['race median', 'raceMedianErrorKph'],
      ['race peak', 'racePeakErrorKph'],
    ]
    const referenced = summaries.filter(
      (summary) => summary.observedQualifyingMedianKph !== null,
    )
    const failures = summaries.flatMap((summary) =>
      errorFields.flatMap(([label, field]) => {
        const error = summary[field]

        return error !== null && Math.abs(error) > CIRCUIT_OUTER_BOUND_KPH
          ? [
              `${summary.trackId}: ${label} off by ${error > 0 ? '+' : ''}${error} km/h, past the ${CIRCUIT_OUTER_BOUND_KPH} km/h outer bound`,
            ]
          : []
      }),
    )
    const statisticFor = (fields) => {
      const errors = referenced
        .flatMap((summary) => fields.map((field) => summary[field]))
        .filter((value) => value !== null)

      return {
        count: errors.length,
        meanAbsolute: round(
          errors.reduce((total, value) => total + Math.abs(value), 0) /
            Math.max(1, errors.length),
          2,
        ),
        bias: round(
          errors.reduce((total, value) => total + value, 0) /
            Math.max(1, errors.length),
          2,
        ),
        worst: round(
          errors.reduce(
            (worst, value) => (Math.abs(value) > Math.abs(worst) ? value : worst),
            0,
          ),
          2,
        ),
      }
    }
    const groups = [
      ['median', ['qualifyingMedianErrorKph', 'raceMedianErrorKph']],
      ['peak', ['qualifyingPeakErrorKph', 'racePeakErrorKph']],
    ]

    console.log(
      `\n${summaries.length} circuits measured, ${referenced.length} with an observed reference`,
    )

    for (const [label, fields] of groups) {
      const statistic = statisticFor(fields)

      console.log(
        `  ${label.padEnd(7)} n=${statistic.count} mean absolute ${statistic.meanAbsolute} km/h, bias ${statistic.bias > 0 ? '+' : ''}${statistic.bias} km/h, worst ${statistic.worst > 0 ? '+' : ''}${statistic.worst} km/h`,
      )

      if (statistic.meanAbsolute > MEAN_ABSOLUTE_ERROR_LIMIT_KPH) {
        failures.push(
          `${label} mean absolute error ${statistic.meanAbsolute} km/h exceeds ${MEAN_ABSOLUTE_ERROR_LIMIT_KPH}`,
        )
      }

      if (Math.abs(statistic.bias) > BIAS_LIMIT_KPH) {
        failures.push(
          `${label} bias ${statistic.bias} km/h exceeds +/-${BIAS_LIMIT_KPH}`,
        )
      }
    }

    for (const failure of failures) {
      console.log(`  FAIL ${failure}`)
    }

    if (ENFORCE && failures.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await runtime.close()
  }
}

await main()
