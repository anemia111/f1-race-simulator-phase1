import type { AeroActivationZone, TrackDefinition } from '../types'

export const GEOMETRY_DERIVED_AERO_ZONE_PROVENANCE =
  'geometry-derived-estimate' as const

export type GeometryDerivedAeroZoneScope = 'f1-current' | 'f1-free-mode'

export type GeometryDerivedAeroZoneBasis = {
  continuousLowCurvatureMeters: number
  humanReadable: string[]
  maximumEstimatedLateralLoadG: number | null
  nextBrakingPointProgress: number
  physicalScaleAvailable: boolean
  pitEntryConflict: boolean
  pitExitConflict: boolean
  precedingCornerExitProgress: number
  remainingStraightMeters: number
  startFinishOperation:
    | 'clear-of-start-finish'
    | 'crosses-start-finish'
  trackWidthModelUnits: number | null
  transitionMarginMeters: number
  transitionSeconds: number
  transitionSpeedAssumptionKph: number
  peakCurvatureRadPerMeter: number | null
  usableZoneMeters: number
}

export type GeometryDerivedAeroActivationZone = AeroActivationZone & {
  basis: GeometryDerivedAeroZoneBasis
  confidence: number
  provenance: typeof GEOMETRY_DERIVED_AERO_ZONE_PROVENANCE
  runtimeScope: GeometryDerivedAeroZoneScope
  source: 'geometry-derived-estimate'
}

/**
 * Straight detection over a surveyed centerline. It lives apart from the F1
 * track pool so domestic circuits can expose F1 Free Mode estimates from their
 * own geometry rather than carrying hand-written progress values.
 */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const wrapIndex = (index: number, length: number) =>
  ((index % length) + length) % length
const wrapProgress = (value: number) => ((value % 1) + 1) % 1

export const pointDistance = (
  a: TrackDefinition['centerline'][number],
  b: TrackDefinition['centerline'][number],
) => Math.hypot(b[0] - a[0], b[2] - a[2])

const headingChangeRadiansAt = (
  centerline: TrackDefinition['centerline'],
  index: number,
) => {
  const length = centerline.length

  if (length < 5) {
    return Math.PI
  }

  const pointAt = (offset: number) =>
    centerline[wrapIndex(index + offset, length)]
  const previous = pointAt(-2)
  const center = pointAt(0)
  const next = pointAt(2)
  const inVector = { x: center[0] - previous[0], z: center[2] - previous[2] }
  const outVector = { x: next[0] - center[0], z: next[2] - center[2] }
  const inLength = Math.hypot(inVector.x, inVector.z) || 1
  const outLength = Math.hypot(outVector.x, outVector.z) || 1
  const dot =
    (inVector.x * outVector.x + inVector.z * outVector.z) /
    (inLength * outLength)

  return Math.acos(Math.min(1, Math.max(-1, dot)))
}

/** 1 means the road holds its heading; 0 means it turns hard. */
export const straightnessAt = (
  centerline: TrackDefinition['centerline'],
  index: number,
) => clamp01(1 - headingChangeRadiansAt(centerline, index) / 1.15)

/**
 * Distance along an unwrapped index interval. `endIndex` may exceed the point
 * count when a run crosses start/finish.
 */
export const runDistance = (
  centerline: TrackDefinition['centerline'],
  startIndex: number,
  endIndex: number,
) => {
  if (centerline.length === 0) {
    return 0
  }

  let distance = 0
  let normalizedEnd = endIndex

  while (normalizedEnd < startIndex) {
    normalizedEnd += centerline.length
  }

  for (let index = startIndex; index < normalizedEnd; index += 1) {
    distance += pointDistance(
      centerline[wrapIndex(index, centerline.length)],
      centerline[wrapIndex(index + 1, centerline.length)],
    )
  }

  return distance
}

export type AeroZoneDerivationOptions = {
  /** Conservative speed used only to reserve the 400 ms transition distance. */
  expectedTransitionSpeedKph?: number
  /** Label for each estimate, so it reads like the circuit's other markers. */
  label?: (index: number) => string
  /** Published lap distance makes every geometry threshold a physical metre. */
  lapMeters?: number
  lowGripMode?: AeroActivationZone['lowGripMode']
  maximumEstimatedLateralLoadG?: number
  minimumStraightMeters?: number
  minimumTrackWidthModelUnits?: number
  pitEntryProgress?: number
  pitExitProgress?: number
  runtimeScope?: GeometryDerivedAeroZoneScope
  targetCount?: number
  threshold?: number
  trackWidthModelUnits?: number
  transitionSeconds?: number
}

type StraightRun = {
  distanceGeometryUnits: number
  endIndex: number
  startIndex: number
}

type Candidate = {
  basis: GeometryDerivedAeroZoneBasis
  confidence: number
  end: number
  lowGripMode: AeroActivationZone['lowGripMode']
  runtimeScope: GeometryDerivedAeroZoneScope
  start: number
}

const rounded = (value: number, digits = 3) => Number(value.toFixed(digits))

const progressAtDistance = (options: {
  centerline: TrackDefinition['centerline']
  distanceGeometryUnits: number
  endIndex: number
  startIndex: number
}) => {
  const { centerline, endIndex, startIndex } = options
  let remaining = Math.max(0, options.distanceGeometryUnits)

  for (let index = startIndex; index < endIndex; index += 1) {
    const segment = pointDistance(
      centerline[wrapIndex(index, centerline.length)],
      centerline[wrapIndex(index + 1, centerline.length)],
    )

    if (remaining <= segment) {
      const fraction = segment <= 1e-9 ? 0 : remaining / segment
      return wrapProgress((index + fraction) / centerline.length)
    }

    remaining -= segment
  }

  return wrapProgress(endIndex / centerline.length)
}

const curvatureRadPerMeterAt = (options: {
  centerline: TrackDefinition['centerline']
  index: number
  metersPerGeometryUnit: number
}) => {
  const { centerline, index, metersPerGeometryUnit } = options
  const length = centerline.length
  const previous = centerline[wrapIndex(index - 2, length)]
  const center = centerline[wrapIndex(index, length)]
  const next = centerline[wrapIndex(index + 2, length)]
  const smoothingDistanceMeters =
    ((pointDistance(previous, center) + pointDistance(center, next)) / 2) *
    metersPerGeometryUnit

  return (
    headingChangeRadiansAt(centerline, index) /
    Math.max(0.001, smoothingDistanceMeters)
  )
}

const collectStraightRuns = (options: {
  centerline: TrackDefinition['centerline']
  enforcePhysicalLateralLoad: boolean
  maximumEstimatedLateralLoadG: number
  metersPerGeometryUnit: number
  minimumSpan: number
  threshold: number
  transitionSpeedMps: number
}) => {
  const {
    centerline,
    enforcePhysicalLateralLoad,
    maximumEstimatedLateralLoadG,
    metersPerGeometryUnit,
    minimumSpan,
    threshold,
    transitionSpeedMps,
  } = options
  const straight = centerline.map((_, index) => {
    const estimatedLateralLoadG = enforcePhysicalLateralLoad
      ? (transitionSpeedMps ** 2 *
          curvatureRadPerMeterAt({
            centerline,
            index,
            metersPerGeometryUnit,
          })) /
        9.81
      : 0

    return (
      straightnessAt(centerline, index) >= threshold &&
      estimatedLateralLoadG <= maximumEstimatedLateralLoadG
    )
  })
  const runs: StraightRun[] = []
  let startIndex: number | null = null

  for (let index = 0; index <= centerline.length; index += 1) {
    const isStraight = index < centerline.length && straight[index]

    if (isStraight && startIndex === null) {
      startIndex = index
    }

    if (!isStraight && startIndex !== null) {
      const endIndex = index

      if ((endIndex - startIndex) / centerline.length >= minimumSpan) {
        runs.push({
          distanceGeometryUnits: runDistance(
            centerline,
            startIndex,
            endIndex,
          ),
          endIndex,
          startIndex,
        })
      }

      startIndex = null
    }
  }

  const firstRun = runs[0]
  const lastRun = runs[runs.length - 1]

  if (
    runs.length > 1 &&
    firstRun.startIndex === 0 &&
    lastRun.endIndex === centerline.length
  ) {
    runs.shift()
    runs.pop()
    runs.push({
      distanceGeometryUnits:
        lastRun.distanceGeometryUnits + firstRun.distanceGeometryUnits,
      endIndex: firstRun.endIndex + centerline.length,
      startIndex: lastRun.startIndex,
    })
  }

  return runs
}

const progressFallsWithinRun = (
  progress: number | undefined,
  run: StraightRun,
  pointCount: number,
) => {
  if (progress === undefined || !Number.isFinite(progress)) {
    return false
  }

  let pointIndex = wrapProgress(progress) * pointCount

  while (pointIndex < run.startIndex) {
    pointIndex += pointCount
  }

  return pointIndex <= run.endIndex
}

const confidenceFor = (options: {
  maximumEstimatedLateralLoadG: number | null
  maximumPermittedLateralLoadG: number
  minimumStraightMeters: number
  pitConflictCount: number
  startFinishOperation: GeometryDerivedAeroZoneBasis['startFinishOperation']
  trackWidthModelUnits: number | null
  minimumTrackWidthModelUnits: number
  usableZoneMeters: number
}) => {
  const lengthScore = clamp01(
    (options.usableZoneMeters - options.minimumStraightMeters) / 700,
  )
  const curvatureScore =
    options.maximumEstimatedLateralLoadG === null
      ? 0.5
      : clamp01(
          1 -
            options.maximumEstimatedLateralLoadG /
              Math.max(0.01, options.maximumPermittedLateralLoadG),
        )
  const widthScore =
    options.trackWidthModelUnits === null
      ? 0.5
      : clamp01(
          (options.trackWidthModelUnits - options.minimumTrackWidthModelUnits) /
            2,
        )
  const operationalPenalty =
    options.pitConflictCount * 0.045 +
    (options.startFinishOperation === 'crosses-start-finish' ? 0.035 : 0)

  return rounded(
    clamp01(
      0.48 +
        lengthScore * 0.2 +
        curvatureScore * 0.2 +
        widthScore * 0.12 -
        operationalPenalty,
    ),
    2,
  )
}

/**
 * Rank continuous low-curvature runs and produce explicitly estimated zones.
 * No single-segment fallback exists: an unsafe or too-short circuit returns no
 * estimate instead of inventing an activation section.
 */
export const deriveAeroActivationZones = (
  centerline: TrackDefinition['centerline'],
  kind: TrackDefinition['kind'],
  options: AeroZoneDerivationOptions = {},
): GeometryDerivedAeroActivationZone[] => {
  if (centerline.length < 5) {
    return []
  }

  const threshold = options.threshold ?? (kind === 'street' ? 0.82 : 0.78)
  const minimumSpan = kind === 'street' ? 0.035 : 0.045
  const targetCount = options.targetCount ?? (kind === 'street' ? 2 : 3)
  const label = options.label ?? ((index: number) => `SM A${index + 1}`)
  const lowGripMode = options.lowGripMode ?? 'partial'
  const minimumStraightMeters = Math.max(
    0,
    options.minimumStraightMeters ?? 250,
  )
  const expectedTransitionSpeedKph = Math.max(
    0,
    options.expectedTransitionSpeedKph ?? 300,
  )
  const transitionSeconds = Math.max(0.4, options.transitionSeconds ?? 0.4)
  const transitionSpeedMps = expectedTransitionSpeedKph / 3.6
  const transitionMarginMeters = transitionSpeedMps * transitionSeconds
  const maximumEstimatedLateralLoadG = Math.max(
    0.05,
    options.maximumEstimatedLateralLoadG ?? 0.85,
  )
  const minimumTrackWidthModelUnits = Math.max(
    0,
    options.minimumTrackWidthModelUnits ?? 2.1,
  )
  const trackWidthModelUnits =
    options.trackWidthModelUnits !== undefined &&
    Number.isFinite(options.trackWidthModelUnits)
      ? Math.max(0, options.trackWidthModelUnits)
      : null
  const perimeter = runDistance(centerline, 0, centerline.length)
  const physicalScaleAvailable =
    options.lapMeters !== undefined &&
    Number.isFinite(options.lapMeters) &&
    options.lapMeters > 0 &&
    perimeter > 0
  const metersPerGeometryUnit = physicalScaleAvailable
    ? options.lapMeters! / perimeter
    : 1
  // Without a published lap length there is no honest metre or lateral-g
  // conversion. Keep the legacy geometry-only helper useful for synthetic
  // layouts, but do not claim a physical safety screen in its audit basis.
  const physicalTransitionMarginMeters = physicalScaleAvailable
    ? transitionMarginMeters
    : 0
  const physicalMinimumStraightMeters = physicalScaleAvailable
    ? minimumStraightMeters
    : 0
  const runs = collectStraightRuns({
    centerline,
    enforcePhysicalLateralLoad: physicalScaleAvailable,
    maximumEstimatedLateralLoadG,
    metersPerGeometryUnit,
    minimumSpan,
    threshold,
    transitionSpeedMps,
  })

  const candidates = runs.flatMap((run): Candidate[] => {
    const continuousLowCurvatureMeters =
      run.distanceGeometryUnits * metersPerGeometryUnit
    const usableZoneMeters =
      continuousLowCurvatureMeters - physicalTransitionMarginMeters * 2

    if (usableZoneMeters < physicalMinimumStraightMeters) {
      return []
    }

    if (
      trackWidthModelUnits !== null &&
      trackWidthModelUnits < minimumTrackWidthModelUnits
    ) {
      return []
    }

    const runIndices = Array.from(
      // `endIndex` is the first rejected point and is intentionally excluded;
      // including it made every otherwise-safe run fail its own curvature gate.
      { length: run.endIndex - run.startIndex },
      (_, offset) => run.startIndex + offset,
    )
    const curvatureSamples = physicalScaleAvailable
      ? runIndices.map((index) =>
          curvatureRadPerMeterAt({
            centerline,
            index,
            metersPerGeometryUnit,
          }),
        )
      : []
    const peakCurvatureRadPerMeter = physicalScaleAvailable
      ? Math.max(...curvatureSamples)
      : null
    const peakLateralLoadG =
      peakCurvatureRadPerMeter === null
        ? null
        : (transitionSpeedMps ** 2 * peakCurvatureRadPerMeter) / 9.81

    if (
      peakLateralLoadG !== null &&
      peakLateralLoadG > maximumEstimatedLateralLoadG + 1e-9
    ) {
      return []
    }

    const pitEntryConflict = progressFallsWithinRun(
      options.pitEntryProgress,
      run,
      centerline.length,
    )
    const pitExitConflict = progressFallsWithinRun(
      options.pitExitProgress,
      run,
      centerline.length,
    )
    const pitConflictCount = Number(pitEntryConflict) + Number(pitExitConflict)
    // A pit merge in the middle of a narrow candidate is rejected. Wider
    // estimates remain possible but carry the conflict and a confidence cost.
    const narrowPitConflict =
      pitConflictCount > 0 &&
      trackWidthModelUnits !== null &&
      trackWidthModelUnits < minimumTrackWidthModelUnits + 0.5

    if (narrowPitConflict) {
      return []
    }

    const marginGeometryUnits =
      physicalTransitionMarginMeters / Math.max(1e-9, metersPerGeometryUnit)
    const start = progressAtDistance({
      centerline,
      distanceGeometryUnits: marginGeometryUnits,
      endIndex: run.endIndex,
      startIndex: run.startIndex,
    })
    const end = progressAtDistance({
      centerline,
      distanceGeometryUnits:
        run.distanceGeometryUnits - marginGeometryUnits,
      endIndex: run.endIndex,
      startIndex: run.startIndex,
    })
    const precedingCornerExitProgress = wrapProgress(
      run.startIndex / centerline.length,
    )
    const nextBrakingPointProgress = wrapProgress(
      run.endIndex / centerline.length,
    )
    const startFinishOperation =
      start > end
        ? ('crosses-start-finish' as const)
        : ('clear-of-start-finish' as const)
    const remainingStraightMeters =
      continuousLowCurvatureMeters - physicalTransitionMarginMeters
    const distanceUnit = physicalScaleAvailable ? 'm' : 'geometry units'
    const basis: GeometryDerivedAeroZoneBasis = {
      continuousLowCurvatureMeters: rounded(continuousLowCurvatureMeters, 1),
      humanReadable: [
        `Continuous low-curvature run ${rounded(continuousLowCurvatureMeters, 1)} ${distanceUnit}; usable zone ${rounded(usableZoneMeters, 1)} ${distanceUnit}.`,
        peakCurvatureRadPerMeter === null || peakLateralLoadG === null
          ? 'Physical lap scale unavailable; curvature-per-metre and lateral-g screening are unavailable.'
          : `Peak curvature ${rounded(peakCurvatureRadPerMeter, 6)} rad/m implies ${rounded(peakLateralLoadG, 2)} g at the ${rounded(expectedTransitionSpeedKph, 1)} km/h screening assumption.`,
        `Preceding corner exit ${rounded(precedingCornerExitProgress, 4)}; next braking point ${rounded(nextBrakingPointProgress, 4)}; ${rounded(remainingStraightMeters, 1)} ${distanceUnit} remains from activation to braking.`,
        physicalScaleAvailable
          ? `${rounded(transitionSeconds, 3)} s transition margin reserves ${rounded(physicalTransitionMarginMeters, 1)} m at each end.`
          : 'Transition distance margin is unavailable without a physical lap scale.',
        trackWidthModelUnits === null
          ? 'Track-width input unavailable; confidence is reduced.'
          : `Track-width input ${rounded(trackWidthModelUnits, 2)} model units passes the ${rounded(minimumTrackWidthModelUnits, 2)} safety floor.`,
        `Pit conflict: entry=${pitEntryConflict ? 'yes' : 'no'}, exit=${pitExitConflict ? 'yes' : 'no'}; start/finish=${startFinishOperation}.`,
      ],
      maximumEstimatedLateralLoadG:
        peakLateralLoadG === null ? null : rounded(peakLateralLoadG, 3),
      nextBrakingPointProgress: rounded(nextBrakingPointProgress, 6),
      physicalScaleAvailable,
      pitEntryConflict,
      pitExitConflict,
      precedingCornerExitProgress: rounded(precedingCornerExitProgress, 6),
      remainingStraightMeters: rounded(remainingStraightMeters, 1),
      startFinishOperation,
      trackWidthModelUnits:
        trackWidthModelUnits === null ? null : rounded(trackWidthModelUnits, 3),
      transitionMarginMeters: rounded(physicalTransitionMarginMeters, 1),
      transitionSeconds: rounded(transitionSeconds, 3),
      transitionSpeedAssumptionKph: rounded(expectedTransitionSpeedKph, 1),
      peakCurvatureRadPerMeter:
        peakCurvatureRadPerMeter === null
          ? null
          : rounded(peakCurvatureRadPerMeter, 7),
      usableZoneMeters: rounded(usableZoneMeters, 1),
    }

    return [
      {
        basis,
        confidence: confidenceFor({
          maximumEstimatedLateralLoadG: peakLateralLoadG,
          maximumPermittedLateralLoadG: maximumEstimatedLateralLoadG,
          minimumStraightMeters: physicalMinimumStraightMeters,
          minimumTrackWidthModelUnits,
          pitConflictCount,
          startFinishOperation,
          trackWidthModelUnits,
          usableZoneMeters,
        }),
        end: rounded(end),
        lowGripMode,
        runtimeScope: options.runtimeScope ?? 'f1-current',
        start: rounded(start),
      },
    ]
  })

  return candidates
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.basis.usableZoneMeters - left.basis.usableZoneMeters,
    )
    .slice(0, targetCount)
    .sort((left, right) => left.start - right.start)
    .map((candidate, index) => ({
      ...candidate,
      label: label(index),
      provenance: GEOMETRY_DERIVED_AERO_ZONE_PROVENANCE,
      source: 'geometry-derived-estimate',
    }))
}

export const isGeometryDerivedAeroActivationZone = (
  zone: AeroActivationZone,
): zone is GeometryDerivedAeroActivationZone =>
  (zone as Partial<GeometryDerivedAeroActivationZone>).provenance ===
  GEOMETRY_DERIVED_AERO_ZONE_PROVENANCE

/** An official empty list is authoritative too (for example Monaco). */
export const aeroActivationZonesWithOfficialOverride = (
  officialZones: readonly AeroActivationZone[] | null | undefined,
  estimatedZones: readonly GeometryDerivedAeroActivationZone[],
): AeroActivationZone[] =>
  officialZones === null || officialZones === undefined
    ? [...estimatedZones]
    : [...officialZones]
