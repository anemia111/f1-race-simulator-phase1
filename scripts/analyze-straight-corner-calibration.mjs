/**
 * Calibration-split-only inspection for the straight-versus-corner model.
 *
 * This script deliberately never evaluates a holdout circuit. It exists so a
 * physical parameter can be selected from the fixed calibration split before
 * the read-only holdout is opened once by validate-physics-calibration.mjs.
 */
import { createServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SCRIPT_PATH), '..')
const liftAreaArgument = process.argv
  .find((argument) => argument.startsWith('--lift-area='))
  ?.slice('--lift-area='.length)

const average = (values) =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
const round = (value, digits = 3) => Number(value.toFixed(digits))

const server = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'silent',
  root: ROOT,
  server: { middlewareMode: true },
})

try {
  const [calibration, categories, physicalLap, trackData, paceData] =
    await Promise.all([
      server.ssrLoadModule('/src/simulation/physicsCalibration.ts'),
      server.ssrLoadModule('/src/simulation/categoryPhysics.ts'),
      server.ssrLoadModule('/src/simulation/physicalLap.ts'),
      server.ssrLoadModule('/src/data/tracks.ts'),
      server.ssrLoadModule('/src/data/paceCalibration.ts'),
    ])
  const calibrationIds = new Set(
    calibration.F1_PHYSICS_VALIDATION_SPLIT.calibration,
  )
  const trackById = new Map(trackData.tracks.map((track) => [track.id, track]))
  const recordByTrack = new Map(
    paceData.f1PaceCalibration2026
      .filter((record) => calibrationIds.has(record.trackId))
      .map((record) => [record.trackId, record]),
  )
  const speedByTrack = new Map(
    calibration
      .f1QualifyingSpeedObservations(paceData.f1PaceCalibration2026)
      .filter((observation) => calibrationIds.has(observation.trackId))
      .map((observation) => [observation.trackId, observation]),
  )
  const baselinePhysics = categories.categoryPhysicsFor('f1-custom')
  const liftAreaM2 = liftAreaArgument
    ? Number(liftAreaArgument)
    : baselinePhysics.liftAreaM2

  if (!Number.isFinite(liftAreaM2) || liftAreaM2 < 1 || liftAreaM2 > 8) {
    throw new Error(`Invalid --lift-area value: ${liftAreaArgument}`)
  }

  const physics = { ...baselinePhysics, liftAreaM2 }
  const rows = [...calibrationIds].map((trackId) => {
    const track = trackById.get(trackId)
    const record = recordByTrack.get(trackId)

    if (!track || !record) {
      throw new Error(`Missing calibration input for ${trackId}`)
    }

    const lap = physicalLap.simulatePhysicalLap(track, {
      fiaPuEventInput: null,
      physics,
    })
    const speed = speedByTrack.get(trackId)
    const zoneLengthsM = (track.aeroActivationZones ?? []).map((zone) => {
      const fraction =
        zone.end >= zone.start
          ? zone.end - zone.start
          : 1 - zone.start + zone.end
      return fraction * track.lengthKm * 1000
    })
    const activeAeroLengthM = zoneLengthsM.reduce(
      (total, zone) => {
        return total + zone
      },
      0,
    )
    const maximumSpeedIndex = lap.speedsMps.indexOf(
      Math.max(...lap.speedsMps),
    )
    const maximumSpeedProgress = maximumSpeedIndex / lap.points.length
    const maximumInsideActiveAero = (track.aeroActivationZones ?? []).some(
      (zone) =>
        zone.end >= zone.start
          ? maximumSpeedProgress >= zone.start &&
            maximumSpeedProgress <= zone.end
          : maximumSpeedProgress >= zone.start ||
            maximumSpeedProgress <= zone.end,
    )
    const longestAccelerationRunM = lap.points.reduce(
      (longest, point, index) => {
        let run = 0

        for (let step = 0; step < lap.points.length; step += 1) {
          const current = lap.points[(index + step) % lap.points.length]
          const next = lap.points[(index + step + 1) % lap.points.length]

          if (next.referenceSpeedMps <= current.referenceSpeedMps + 1e-6) break
          run += current.segmentLengthMeters
        }

        return Math.max(longest, run)
      },
      0,
    )

    return {
      activeAeroLengthM: round(activeAeroLengthM, 1),
      lapErrorSeconds: round(
        lap.lapTimeSeconds - record.qualifying.selectedReferenceSeconds,
      ),
      longestActiveAeroZoneM: round(Math.max(0, ...zoneLengthsM), 1),
      longestAccelerationRunM: round(longestAccelerationRunM, 1),
      maximumInsideActiveAero,
      maximumSpeedProgress: round(maximumSpeedProgress, 4),
      modeledLapSeconds: round(lap.lapTimeSeconds),
      modeledPeakKph: round(lap.maximumSpeedKph, 1),
      observedLapSeconds: round(record.qualifying.selectedReferenceSeconds),
      observedPeakKph: speed ? round(speed.observedFieldPeakKph, 1) : null,
      peakErrorKph: speed
        ? round(lap.maximumSpeedKph - speed.observedFieldPeakKph, 1)
        : null,
      trackId,
    }
  })
  const lapErrors = rows.map((row) => row.lapErrorSeconds)
  const peakRows = rows.filter((row) => row.peakErrorKph !== null)
  const result = {
    calibrationOnly: true,
    candidate: { liftAreaM2 },
    summary: {
      lapBiasSeconds: round(average(lapErrors)),
      lapMaeSeconds: round(average(lapErrors.map(Math.abs))),
      modeledPeakRangeKph: peakRows.length
        ? round(
            Math.max(...peakRows.map((row) => row.modeledPeakKph)) -
              Math.min(...peakRows.map((row) => row.modeledPeakKph)),
            1,
          )
        : null,
      observedPeakRangeKph: peakRows.length
        ? round(
            Math.max(...peakRows.map((row) => row.observedPeakKph)) -
              Math.min(...peakRows.map((row) => row.observedPeakKph)),
            1,
          )
        : null,
      peakBiasKph: peakRows.length
        ? round(average(peakRows.map((row) => row.peakErrorKph)), 1)
        : null,
      peakMaeKph: peakRows.length
        ? round(average(peakRows.map((row) => Math.abs(row.peakErrorKph))), 1)
        : null,
    },
    tracks: rows,
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  await server.close()
}
