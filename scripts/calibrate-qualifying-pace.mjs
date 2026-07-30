/**
 * Solves the timed-session controller scale (`simulation.qualifyingPaceScale`)
 * for every calibrated circuit of a series.
 *
 * Qualifying pace used to ride on `simulation.raceModelCorrectionSeconds`, an
 * additive term that the race controller also consumed. Splitting the race
 * scale out left qualifying uncalibrated, so each session family now owns a
 * dimensionless scale and this script measures the one for timed sessions:
 * it runs full Q1 sessions through the production engine, compares the top-3
 * median against the circuit's 2026 reference and converges on the scale.
 */
import { readFile, writeFile } from 'node:fs/promises'
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
const SERIES_ID = argument('series', 'f1-custom')
const TRACK_FILTER = argument('track')
const SEED_COUNT = positiveInteger('seeds', 3)
const MAX_ITERATIONS = positiveInteger('iterations', 5)
const TOLERANCE_SECONDS = positiveNumber('tolerance', 0.3)
const STEP_SECONDS = positiveNumber('step-seconds', 3)
/** Measured lap-time response to a unit change in the controller scale. */
const RESPONSE_GAIN = positiveNumber('gain', 0.55)
const WRITE = process.argv.includes('--write')

/** Matches the runtime guard in src/data/paceCalibration.ts. */
const SCALE_MINIMUM = 0.75
const SCALE_MAXIMUM = 1.25

const CALIBRATION_FILE_BY_SERIES = {
  'f1-custom': 'src/data/calibration/f1PaceCalibration2026.json',
  'super-formula': 'src/data/calibration/superFormulaPaceCalibration2026.json',
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)

  if (sorted.length === 0) {
    return null
  }

  const middle = (sorted.length - 1) / 2
  const lower = Math.floor(middle)
  const upper = Math.ceil(middle)
  return (sorted[lower] + sorted[upper]) / 2
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
  const qualifying = await server.ssrLoadModule('/src/simulation/qualifying.ts')
  const timedSessionPlan = await server.ssrLoadModule(
    '/src/simulation/timedSessionPlan.ts',
  )

  return {
    advanceRace: race.advanceRace,
    buildTimedSessionPlan: timedSessionPlan.buildTimedSessionPlan,
    close: () => server.close(),
    createInitialRace: race.createInitialRace,
    runSeriesQualifying: qualifying.runSeriesQualifying,
    seriesPackageById: registry.seriesPackageById,
  }
}

/** Applies a candidate scale without touching the calibration file. */
function trackWithScale(track, scale) {
  const reference = track.paceReference2026

  return {
    ...track,
    rainProbability: 0,
    paceReference2026: {
      ...reference,
      calibration: {
        ...reference.calibration,
        simulation: {
          ...reference.calibration.simulation,
          qualifyingPaceScale: scale,
        },
      },
    },
  }
}

/**
 * One full Q1 through the production engine. Mirrors the live qualifying
 * measurement in src/simulation/timedSessionPlan.test.ts so the calibration and
 * the regression test observe the same quantity.
 */
function measureQualifyingPace(runtime, series, track, seed) {
  const sessionTrack = track
  const qualifyingResult = runtime.runSeriesQualifying(
    {
      drivers: series.drivers,
      qualifyingDryCompound: series.rules.tires.qualifyingDryCompound,
      seed,
      seriesId: series.id,
      teams: series.teams,
      tireAllocation: series.rules.tires.standardAllocation,
      track: sessionTrack,
      weekendStage: 'qualifying',
    },
    series.rules,
  )
  const config = {
    categoryRaceFormat: series.rules.race,
    drivers: series.drivers,
    overtakeActivation: series.rules.overtakeActivation,
    overtakeSystem: series.rules.overtakeSystem,
    qualifyingDryCompound: series.rules.tires.qualifyingDryCompound,
    seed,
    seriesId: series.id,
    teams: series.teams,
    timedSessionPlan: runtime.buildTimedSessionPlan(
      qualifyingResult,
      series.rules.qualifying.breakSeconds,
      series.rules.qualifying.format,
    ),
    tireAllocation: series.rules.tires.standardAllocation,
    tireSupplier: series.rules.tireSupplier,
    track: sessionTrack,
    weekendStage: 'qualifying',
  }
  let snapshot = runtime.createInitialRace(config)
  const q1EndsAtSeconds =
    config.timedSessionPlan?.segments[0]?.endsAtSeconds ?? 18 * 60
  const measurementEndsAtSeconds =
    q1EndsAtSeconds + Math.max(120, sessionTrack.baseLapTime * 1.8)

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
        .filter((lap) => lap.isValid && (lap.segment === 'Q1' || lap.segment === null))
        .map((lap) => lap.lapTimeSeconds)

      return valid.length === 0 ? [] : [Math.min(...valid)]
    })
    .sort((left, right) => left - right)

  return {
    fastestSeconds: bestByDriver[0] ?? null,
    top3MedianSeconds: bestByDriver[1] ?? null,
  }
}

function seedsFor(track) {
  // The canonical seed is the one the regression test asserts; the extra seeds
  // keep the solution from fitting a single session's driver luck.
  const canonical = `live-qualifying-pace:${track.id}`
  return [
    canonical,
    ...Array.from(
      { length: Math.max(0, SEED_COUNT - 1) },
      (_, index) => `qualifying-pace-calibration:${track.id}:${index + 1}`,
    ),
  ]
}

function measureAcrossSeeds(runtime, series, track, scale) {
  const scaled = trackWithScale(track, scale)
  const perSeed = seedsFor(track).map((seed) => ({
    seed,
    ...measureQualifyingPace(runtime, series, scaled, seed),
  }))
  const canonical = perSeed[0]?.top3MedianSeconds ?? null

  return {
    canonicalSeconds: canonical,
    medianSeconds: median(perSeed.map((entry) => entry.top3MedianSeconds)),
    perSeed,
  }
}

async function main() {
  const runtime = await loadRuntime(ROOT)

  try {
    const series = runtime.seriesPackageById.get(SERIES_ID)

    if (!series) {
      throw new Error(`Unknown series ${SERIES_ID}`)
    }

    const tracks = series.tracks
      .filter((track) => track.paceReference2026 !== undefined)
      .filter(
        (track) =>
          !TRACK_FILTER ||
          track.id === TRACK_FILTER ||
          track.id.includes(TRACK_FILTER),
      )

    if (tracks.length === 0) {
      throw new Error(`No calibrated ${SERIES_ID} track matches ${TRACK_FILTER}`)
    }

    const results = []

    for (const track of tracks) {
      const reference =
        track.paceReference2026.calibration.qualifying.selectedReferenceSeconds
      let scale = clamp(
        track.paceReference2026.calibration.simulation.qualifyingPaceScale ?? 1,
        SCALE_MINIMUM,
        SCALE_MAXIMUM,
      )
      let measurement = null
      let iterations = 0

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
        iterations = iteration + 1
        measurement = measureAcrossSeeds(runtime, series, track, scale)

        if (measurement.medianSeconds === null) {
          throw new Error(`${track.id}: no valid Q1 lap was measured`)
        }

        const error = measurement.medianSeconds - reference

        if (Math.abs(error) <= TOLERANCE_SECONDS) {
          break
        }

        // Lap time responds to roughly half of a scale change, so a plain
        // ratio step converges slowly. RESPONSE_GAIN divides the measured
        // error by that observed sensitivity.
        const next = clamp(
          scale *
            (1 + (measurement.medianSeconds / reference - 1) / RESPONSE_GAIN),
          SCALE_MINIMUM,
          SCALE_MAXIMUM,
        )

        if (next === scale) {
          break
        }

        scale = next
      }

      const solved = Number(scale.toFixed(6))
      results.push({
        canonicalSeconds: measurement.canonicalSeconds,
        deviationSeconds: Number(
          (measurement.medianSeconds - reference).toFixed(3),
        ),
        iterations,
        measuredSeconds: Number(measurement.medianSeconds.toFixed(3)),
        referenceSeconds: reference,
        scale: solved,
        trackId: track.id,
      })

      console.log(
        `${track.id.padEnd(22)} reference=${reference.toFixed(3)}s ` +
          `measured=${measurement.medianSeconds.toFixed(3)}s ` +
          `deviation=${(measurement.medianSeconds - reference).toFixed(3)}s ` +
          `scale=${solved} iterations=${iterations}`,
      )
    }

    const worst = results.reduce(
      (peak, entry) => Math.max(peak, Math.abs(entry.deviationSeconds)),
      0,
    )
    console.log(`\nworst absolute deviation: ${worst.toFixed(3)}s`)

    if (!WRITE) {
      console.log('re-run with --write to store the solved scales')
      return
    }

    const filePath = resolve(ROOT, CALIBRATION_FILE_BY_SERIES[SERIES_ID])
    const records = JSON.parse(await readFile(filePath, 'utf8'))
    const scaleByTrack = new Map(
      results.map((entry) => [entry.trackId, entry.scale]),
    )
    let updated = 0

    for (const record of records) {
      const scale = scaleByTrack.get(record.trackId)

      if (scale === undefined) {
        continue
      }

      record.simulation.qualifyingPaceScale = scale
      updated += 1
    }

    await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
    console.log(`wrote ${updated} qualifying pace scales to ${filePath}`)
  } finally {
    await runtime.close()
  }
}

await main()
