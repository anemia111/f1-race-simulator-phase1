import type { TrackDefinition } from '../types'
import type { OpenF1Bundle, OpenF1Location } from './openF1'

/**
 * Projects factual OpenF1 location samples onto the generated real track
 * layout. Placement uses centerline progress only: OpenF1 location data has
 * no reliable lateral accuracy at this map scale, so the local racing-line /
 * attack-defense lane model stays authoritative for lateral presentation.
 */

export type OpenF1ProgressSample = {
  /** Sample time in epoch milliseconds. */
  tMs: number
  /**
   * Lap-unwrapped centerline progress. Consecutive samples increase across
   * the start/finish line (1.02 = 2% into the following lap), so playback can
   * interpolate without snapping backwards at the line.
   */
  progress: number
}

export type OpenF1TrackCar = {
  driverNumber: number
  code: string
  teamColor: string
  samples: OpenF1ProgressSample[]
  latestDate: string
}

export type OpenF1TrackProgress = {
  cars: OpenF1TrackCar[]
  windowStartMs: number
  windowEndMs: number
  latestSampleDate: string | null
  /** Samples dropped for sitting too far off the centerline (garage, noise). */
  rejectedSamples: number
  /** Fixed synchronized HIST instant; null keeps the live-window animation. */
  targetMs: number | null
}

type CenterlineModel = {
  points: Array<{ x: number; z: number }>
  cumulative: number[]
  total: number
}

/**
 * Samples farther than this from the centerline (in local units, where the
 * whole track spans 48) are treated as garage/pit-building noise rather than
 * on-track running. Roughly 3% of the track's bounding span.
 */
const MAX_LATERAL_DISTANCE = 1.5

export function buildCenterlineModel(
  centerline: TrackDefinition['centerline'],
): CenterlineModel {
  const points = centerline.map((point) => ({ x: point[0], z: point[2] }))
  const cumulative = [0]

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]

    cumulative.push(
      cumulative[index] + Math.hypot(next.x - current.x, next.z - current.z),
    )
  }

  return { points, cumulative, total: cumulative[cumulative.length - 1] || 1 }
}

export function projectPointToProgress(
  model: CenterlineModel,
  x: number,
  z: number,
): { progress: number; lateralDistance: number } {
  let bestDistanceSq = Infinity
  let bestArcLength = 0

  for (let index = 0; index < model.points.length; index += 1) {
    const start = model.points[index]
    const end = model.points[(index + 1) % model.points.length]
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const lengthSq = segmentX * segmentX + segmentZ * segmentZ
    const t =
      lengthSq === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((x - start.x) * segmentX + (z - start.z) * segmentZ) / lengthSq,
            ),
          )
    const closestX = start.x + segmentX * t
    const closestZ = start.z + segmentZ * t
    const dx = x - closestX
    const dz = z - closestZ
    const distanceSq = dx * dx + dz * dz

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq
      bestArcLength =
        model.cumulative[index] + Math.sqrt(lengthSq) * t
    }
  }

  return {
    progress: (bestArcLength / model.total) % 1,
    lateralDistance: Math.sqrt(bestDistanceSq),
  }
}

export function projectLocationSample(
  projection: NonNullable<TrackDefinition['locationProjection']>,
  sample: Pick<OpenF1Location, 'x' | 'y'>,
): { x: number; z: number } {
  const radians = (projection.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const rotatedX = sample.x * cos - sample.y * sin
  const rotatedY = sample.x * sin + sample.y * cos

  return {
    x: (rotatedX - projection.centerX) * projection.scale,
    z: -(rotatedY - projection.centerY) * projection.scale,
  }
}

function unwrapProgress(samples: OpenF1ProgressSample[]) {
  let lapOffset = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].progress
    const current = samples[index].progress + lapOffset

    // A large backwards jump means the car crossed the start/finish line.
    if (current < previous - 0.5) {
      lapOffset += 1
      samples[index].progress += 1
    } else {
      samples[index].progress = current
    }
  }
}

export function buildOpenF1TrackProgress(
  bundle: Pick<OpenF1Bundle, 'location' | 'drivers'> | null | undefined,
  track: Pick<TrackDefinition, 'centerline' | 'locationProjection'>,
  targetMs: number | null = null,
): OpenF1TrackProgress {
  const empty: OpenF1TrackProgress = {
    cars: [],
    windowStartMs: 0,
    windowEndMs: 0,
    latestSampleDate: null,
    rejectedSamples: 0,
    targetMs: null,
  }
  const projection = track.locationProjection

  if (!bundle || !projection || bundle.location.length === 0) {
    return empty
  }

  const model = buildCenterlineModel(track.centerline)
  const driversByNumber = new Map(
    bundle.drivers.map((driver) => [driver.driver_number, driver]),
  )
  const samplesByDriver = new Map<number, OpenF1Location[]>()
  let rejectedSamples = 0

  for (const sample of bundle.location) {
    if (
      typeof sample.x !== 'number' ||
      typeof sample.y !== 'number' ||
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      // OpenF1 reports (0, 0) when position data is not available.
      (sample.x === 0 && sample.y === 0)
    ) {
      continue
    }

    const existing = samplesByDriver.get(sample.driver_number)

    if (existing) {
      existing.push(sample)
    } else {
      samplesByDriver.set(sample.driver_number, [sample])
    }
  }

  const cars: OpenF1TrackCar[] = []
  let windowStartMs = Infinity
  let windowEndMs = -Infinity
  let latestSampleDate: string | null = null

  for (const [driverNumber, rawSamples] of samplesByDriver) {
    rawSamples.sort((a, b) => a.date.localeCompare(b.date))

    const samples: OpenF1ProgressSample[] = []

    for (const raw of rawSamples) {
      const tMs = new Date(raw.date).getTime()

      if (!Number.isFinite(tMs)) {
        continue
      }

      const local = projectLocationSample(projection, raw)
      const projected = projectPointToProgress(model, local.x, local.z)

      if (projected.lateralDistance > MAX_LATERAL_DISTANCE) {
        rejectedSamples += 1
        continue
      }

      samples.push({ tMs, progress: projected.progress })
    }

    if (samples.length === 0) {
      continue
    }

    unwrapProgress(samples)

    const driver = driversByNumber.get(driverNumber)
    const latestRaw = rawSamples[rawSamples.length - 1]

    windowStartMs = Math.min(windowStartMs, samples[0].tMs)
    windowEndMs = Math.max(windowEndMs, samples[samples.length - 1].tMs)

    if (!latestSampleDate || latestRaw.date.localeCompare(latestSampleDate) > 0) {
      latestSampleDate = latestRaw.date
    }

    cars.push({
      driverNumber,
      code: driver?.name_acronym ?? `#${driverNumber}`,
      teamColor: driver?.team_colour ? `#${driver.team_colour}` : '#8a949c',
      samples,
      latestDate: latestRaw.date,
    })
  }

  if (cars.length === 0) {
    return { ...empty, rejectedSamples }
  }

  cars.sort((a, b) => a.driverNumber - b.driverNumber)

  return {
    cars,
    windowStartMs,
    windowEndMs,
    latestSampleDate,
    rejectedSamples,
    targetMs:
      targetMs === null
        ? null
        : Math.min(windowEndMs, Math.max(windowStartMs, targetMs)),
  }
}

/**
 * Lap-wrapped progress of one car at a window time, interpolating between the
 * two nearest factual samples. Times outside the sampled range clamp to the
 * first/last sample instead of extrapolating beyond the data.
 */
export function progressAtTime(car: OpenF1TrackCar, tMs: number): number {
  const samples = car.samples

  if (tMs <= samples[0].tMs) {
    return samples[0].progress % 1
  }

  if (tMs >= samples[samples.length - 1].tMs) {
    return samples[samples.length - 1].progress % 1
  }

  let low = 0
  let high = samples.length - 1

  while (high - low > 1) {
    const mid = (low + high) >> 1

    if (samples[mid].tMs <= tMs) {
      low = mid
    } else {
      high = mid
    }
  }

  const start = samples[low]
  const end = samples[high]
  const span = end.tMs - start.tMs
  const mix = span === 0 ? 0 : (tMs - start.tMs) / span

  return (start.progress + (end.progress - start.progress) * mix) % 1
}
