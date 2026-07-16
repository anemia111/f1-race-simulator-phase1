// Race-event primitives. Pure TypeScript only: no React, no Three.js.
// Every function is deterministic for a given seed so races replay
// identically. Tuning values live in `phaseThreeTuning` so later phases can
// expose or rebalance them without touching the formulas.
//
// Phase 3-B: flags are incident-driven (see incidents.ts) and carried in the
// snapshot as an ActiveFlagPhase; the Phase 3-A precomputed timeline is gone.

import type {
  ActiveFlagPhase,
  FlagState,
  SectorFlagState,
  TrackDefinition,
  WeatherState,
} from '../types'
import { hashChance } from './random'
import { trackLimitPenaltyFromWarnings } from './stewarding'

export const phaseThreeTuning = {
  // Fuel effect: cars start heavy and gain pace as fuel burns off.
  fuelMaxPenaltySeconds: 2.6,
  // Race length target in seconds; laps are derived per track.
  raceDurationTargetSeconds: 3600,
  // Track evolution: rubbering-in lowers lap times as the session ages.
  evolutionFullSeconds: 600,
  evolutionMaxGainSeconds: 1.8,
  // Dirty air / slipstream, applied from the live gap to the car ahead.
  dirtyAirMaxLossSeconds: 0.6,
  dirtyAirOuterGapSeconds: 2.0,
  dirtyAirInnerGapSeconds: 0.3,
  slipstreamMaxGainSeconds: 0.35,
  slipstreamRangeSeconds: 1.0,
  // Track limits: per-lap warning chance scaled by driver consistency.
  trackLimitBaseChance: 0.026,
  trackLimitConsistencyWeight: 0.075,
  // Flag pace multipliers.
  singleYellowMarshallingPace: 0.88,
  /** Double yellow requires a significant reduction and readiness to stop. */
  doubleYellowMarshallingPace: 0.68,
  /** Small ordering gap while overtaking is prohibited in a local-yellow zone. */
  localYellowMinimumGapSeconds: 0.08,
  /** FIA minimum-time reference; drivers target slightly below this pace. */
  vscMinimumTimePace: 0.63,
  /** Initial target creates about 0.05s of positive delta before feedback settles. */
  vscPace: 0.6,
  vscDeltaGain: 0.58,
  vscMinimumPace: 0.18,
  vscMaximumPace: 0.9,
  scPace: 0.5,
  /** Steady leader pace after the SC lights are extinguished. */
  scRestartLeaderPace: 0.46,
  /** Pace for cars still catching the SC queue (bunching). */
  scCatchUpPace: 0.86,
  /** Gap to the car ahead below which a car is considered "in the queue". */
  scQueueGapSeconds: 0.38,
  // Restart window after SC/VSC/red: cold tires and brakes.
  restartWindowSeconds: 8,
  restartMaxLossSeconds: 1.4,
  restartRiskMultiplier: 2.5,
  // Damage: lap-time cost at damage = 1.
  damageLapCostSeconds: 3,
} as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// --- Race length -----------------------------------------------------------

/** Number of laps for a race on this track (~1 hour target). */
export function raceLapsFor(track: TrackDefinition): number {
  if (track.raceLaps !== undefined) {
    return track.raceLaps
  }

  return Math.max(
    15,
    Math.round(phaseThreeTuning.raceDurationTargetSeconds / track.baseLapTime),
  )
}

// --- Fuel effect -----------------------------------------------------------

/**
 * Lap-time penalty in seconds from fuel load, per car, based on how many
 * laps of fuel it has burned. Max at lights-out, zero at the flag.
 */
export function fuelEffectSeconds(lapsCompleted: number, raceLaps: number): number {
  if (raceLaps <= 0) {
    return 0
  }

  const remaining = 1 - clamp01(lapsCompleted / raceLaps)
  return phaseThreeTuning.fuelMaxPenaltySeconds * remaining
}

// --- Track evolution -------------------------------------------------------

/** 0..1 grip level: rubber laid on the racing line as the session ages. */
export function trackEvolutionLevel(elapsedSeconds: number): number {
  return clamp01(elapsedSeconds / phaseThreeTuning.evolutionFullSeconds)
}

/** Lap-time gain in seconds contributed by track evolution. */
export function trackEvolutionGainSeconds(elapsedSeconds: number): number {
  return trackEvolutionLevel(elapsedSeconds) * phaseThreeTuning.evolutionMaxGainSeconds
}

// --- Dirty air / slipstream ------------------------------------------------

/**
 * Net lap-time delta in seconds from running behind another car.
 * Positive means net loss (turbulent air through corners), reduced by the
 * slipstream gain on the straights when the gap is inside tow range.
 * A gap of zero or less means open air (the leader) and returns 0.
 */
export function dirtyAirDeltaSeconds(gapToAheadSeconds: number): number {
  const {
    dirtyAirInnerGapSeconds: inner,
    dirtyAirMaxLossSeconds: maxLoss,
    dirtyAirOuterGapSeconds: outer,
    slipstreamMaxGainSeconds: maxGain,
    slipstreamRangeSeconds: slipRange,
  } = phaseThreeTuning

  if (gapToAheadSeconds <= 0 || gapToAheadSeconds >= outer) {
    return 0
  }

  const gap = Math.max(gapToAheadSeconds, inner)
  const lossRamp = clamp01((outer - gap) / (outer - inner))
  const cornerLoss = maxLoss * lossRamp ** 1.4
  const slipstreamGain = maxGain * clamp01((slipRange - gap) / slipRange)

  return cornerLoss - slipstreamGain
}

// --- Track limits ----------------------------------------------------------

function trackLimitChance(
  consistency: number,
  context: {
    pressure?: number
    tireWearPercent?: number
    trackGrip?: number
    weather?: WeatherState
  },
): number {
  const pressureRisk = Math.max(0, Math.min(1, context.pressure ?? 0)) * 0.018
  const tireRisk =
    Math.max(0, (context.tireWearPercent ?? 0) - 72) / 28 * 0.025
  const gripRisk = Math.max(0, 1 - (context.trackGrip ?? 1)) * 0.035
  const rainRisk =
    context.weather === 'heavy-rain'
      ? 0.012
      : context.weather === 'light-rain'
        ? 0.006
        : 0
  const chance =
    phaseThreeTuning.trackLimitBaseChance +
    (1 - clamp01(consistency)) * phaseThreeTuning.trackLimitConsistencyWeight +
    pressureRisk +
    tireRisk +
    gripRisk +
    rainRisk

  return Math.min(0.16, Math.max(0.012, chance))
}

/** Whether a driver picks up a track-limit warning on a specific lap. */
export function lapHasTrackLimitWarning(
  seed: string,
  driverId: string,
  consistency: number,
  lap: number,
  context: {
    pressure?: number
    tireWearPercent?: number
    trackGrip?: number
    weather?: WeatherState
  } = {},
): boolean {
  if (lap < 2) {
    return false
  }

  return (
    hashChance(`${seed}:track-limit:${driverId}:${lap}`) <
    trackLimitChance(consistency, context)
  )
}

/** Cumulative track-limit warnings for a driver up to and including a lap. */
export function trackLimitWarningsUpTo(
  seed: string,
  driverId: string,
  consistency: number,
  lap: number,
): number {
  let warnings = 0

  for (let pastLap = 2; pastLap <= lap; pastLap += 1) {
    if (lapHasTrackLimitWarning(seed, driverId, consistency, pastLap)) {
      warnings += 1
    }
  }

  return warnings
}

/**
 * Cumulative 2026 track-limit penalty: black-and-white flag on offence three,
 * then 5s for offence four and every further offence.
 */
export function penaltyFromWarnings(warnings: number): number {
  return trackLimitPenaltyFromWarnings(warnings)
}

/** Remaining penalty owed after any seconds already served at pit stops. */
export function owedPenaltySeconds(
  warnings: number,
  servedPenaltySeconds: number,
): number {
  return Math.max(0, penaltyFromWarnings(warnings) - servedPenaltySeconds)
}

// --- Flag helpers ----------------------------------------------------------

/** Which sector (0-based) a lap-progress fraction falls in. */
export function sectorIndexForProgress(
  progress: number,
  sectorMarks: number[],
): number {
  let sector = 0

  for (let index = 0; index < sectorMarks.length; index += 1) {
    if (progress >= sectorMarks[index]) {
      sector = index
    }
  }

  return sector
}

const normalizedTrackProgress = (progress: number) =>
  ((progress % 1) + 1) % 1

function progressForTracksidePoint(
  track: TrackDefinition,
  point: TrackDefinition['centerline'][number],
) {
  if (track.centerline.length < 2) {
    return 0
  }

  const segmentLengths = track.centerline.map((start, index) => {
    const end = track.centerline[(index + 1) % track.centerline.length]
    return Math.hypot(end[0] - start[0], end[2] - start[2])
  })
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)

  if (totalLength <= 0) {
    return 0
  }

  let bestDistanceSquared = Number.POSITIVE_INFINITY
  let bestProgress = 0
  let distanceBeforeSegment = 0

  track.centerline.forEach((start, index) => {
    const end = track.centerline[(index + 1) % track.centerline.length]
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const lengthSquared = dx * dx + dz * dz
    const projection =
      lengthSquared > 0
        ? clamp01(
            ((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) /
              lengthSquared,
          )
        : 0
    const projectedX = start[0] + dx * projection
    const projectedZ = start[2] + dz * projection
    const distanceSquared =
      (point[0] - projectedX) ** 2 + (point[2] - projectedZ) ** 2

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared
      bestProgress =
        (distanceBeforeSegment + segmentLengths[index] * projection) /
        totalLength
    }

    distanceBeforeSegment += segmentLengths[index]
  })

  return normalizedTrackProgress(bestProgress)
}

/** Track progress of FIA light/flag posts, ordered in the racing direction. */
export function marshalPostProgressesForTrack(track: TrackDefinition): number[] {
  const measured = (track.marshalPosts ?? [])
    .map((post) => progressForTracksidePoint(track, post))
    .sort((left, right) => left - right)
    .filter(
      (progress, index, values) =>
        index === 0 || progress - values[index - 1] > 0.001,
    )

  if (
    measured.length > 2 &&
    1 - measured[measured.length - 1] + measured[0] <= 0.001
  ) {
    measured.pop()
  }

  if (measured.length >= 2) {
    return measured
  }

  // Appendix H recommends no more than 500 m between consecutive posts.
  const fallbackPostCount = Math.max(8, Math.ceil(track.lengthKm / 0.5))
  return Array.from(
    { length: fallbackPostCount },
    (_, index) => index / fallbackPostCount,
  )
}

/**
 * Local-yellow control zone: yellow at the post before the incident and green
 * at the first post after it, including a wrap across the control line.
 */
export function yellowFlagZoneForIncident(
  track: TrackDefinition,
  incidentProgress: number,
): NonNullable<ActiveFlagPhase['yellowZone']> {
  const progress = normalizedTrackProgress(incidentProgress)
  const posts = marshalPostProgressesForTrack(track)
  const epsilon = 0.0001
  let startProgress = posts[posts.length - 1]
  let endProgress = posts[0]

  for (const postProgress of posts) {
    if (postProgress < progress - epsilon) {
      startProgress = postProgress
      continue
    }

    if (postProgress > progress + epsilon) {
      endProgress = postProgress
      break
    }
  }

  if (endProgress <= progress + epsilon && progress >= posts[posts.length - 1]) {
    endProgress = posts[0]
  }

  return { endProgress, incidentProgress: progress, startProgress }
}

export function progressIsInYellowFlagZone(
  progress: number,
  zone: NonNullable<ActiveFlagPhase['yellowZone']>,
): boolean {
  const current = normalizedTrackProgress(progress)
  const start = normalizedTrackProgress(zone.startProgress)
  const end = normalizedTrackProgress(zone.endProgress)

  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}

/** Preserve the on-track order from the yellow flag to the following green. */
export function distanceRespectingLocalYellowOrder(options: {
  aheadProjectedDistance: number
  currentDistance: number
  projectedDistance: number
  referenceLapTimeSeconds: number
}): number {
  const minimumGapDistance =
    phaseThreeTuning.localYellowMinimumGapSeconds /
    Math.max(40, options.referenceLapTimeSeconds)

  return Math.min(
    options.projectedDistance,
    Math.max(
      options.currentDistance,
      options.aheadProjectedDistance - minimumGapDistance,
    ),
  )
}

/**
 * Pace multiplier applied to a car's advance rate under the current flag.
 * Local yellows only slow cars inside the affected marshalling sector. Under the SC the
 * queue runs at SC pace while cars with a gap ahead run faster until they
 * catch the queue; this is what compresses the field. Red stops the session.
 */
export function flagPaceMultiplier(
  phase: ActiveFlagPhase | null,
  carSector: number,
  options: {
    carProgress?: number
    isLeader: boolean
    gapToAheadSeconds: number
  },
): number {
  if (!phase) {
    return 1
  }

  switch (phase.flag) {
    case 'yellow': {
      const isInsideControlledZone = phase.yellowZone
        ? options.carProgress === undefined ||
          progressIsInYellowFlagZone(options.carProgress, phase.yellowZone)
        : carSector === phase.sector

      if (!isInsideControlledZone) {
        return 1
      }

      return phase.yellowSeverity === 'double'
        ? phaseThreeTuning.doubleYellowMarshallingPace
        : phaseThreeTuning.singleYellowMarshallingPace
    }
    case 'vsc':
      return phaseThreeTuning.vscPace
    case 'sc':
      if (options.isLeader) {
        const procedure = phase.neutralisation

        if (
          procedure?.kind === 'safety-car' &&
          (procedure.stage === 'in-this-lap' ||
            procedure.stage === 'pit-entry')
        ) {
          return phaseThreeTuning.scRestartLeaderPace
        }

        if (
          procedure?.kind === 'safety-car' &&
          procedure.leaderCollectedAtSeconds === null
        ) {
          return phaseThreeTuning.scCatchUpPace
        }

        return phaseThreeTuning.scPace
      }
      return options.gapToAheadSeconds > phaseThreeTuning.scQueueGapSeconds
        ? phaseThreeTuning.scCatchUpPace
        : phaseThreeTuning.scPace
    case 'red':
      return 0
    default:
      return 1
  }
}

/** Local yellows only govern cars between the yellow and following green post. */
export function flagPhaseForProgress(
  phase: ActiveFlagPhase | null,
  carProgress: number,
  carSector: number,
): ActiveFlagPhase | null {
  if (phase?.flag !== 'yellow') {
    return phase
  }

  if (phase.yellowZone) {
    return progressIsInYellowFlagZone(carProgress, phase.yellowZone)
      ? phase
      : null
  }

  // Saved races from older versions did not carry a marshalling-zone range.
  return phase.sector === carSector ? phase : null
}

export function wearScaleForControlPhase(
  phase: ActiveFlagPhase | null,
): { component: number; tire: number } {
  switch (phase?.flag) {
    case 'red':
      return { component: 0, tire: 0 }
    case 'sc':
      return { component: 0.42, tire: 0.24 }
    case 'vsc':
      return { component: 0.62, tire: 0.5 }
    case 'yellow':
      return { component: 0.9, tire: 0.82 }
    default:
      return { component: 1, tire: 1 }
  }
}

export function sectorFlagStatesFor(
  flag: FlagState,
  localYellowSector: number | null,
  timedDoubleYellowSector: number | null = null,
): [SectorFlagState, SectorFlagState, SectorFlagState] {
  if (flag === 'vsc' || flag === 'sc' || flag === 'red') {
    return [flag, flag, flag]
  }

  const states: [SectorFlagState, SectorFlagState, SectorFlagState] = [
    'clear',
    'clear',
    'clear',
  ]

  if (flag === 'yellow') {
    if (
      timedDoubleYellowSector !== null &&
      timedDoubleYellowSector >= 0 &&
      timedDoubleYellowSector <= 2
    ) {
      states[timedDoubleYellowSector] = 'double-yellow'
      return states
    }

    if (localYellowSector === null || localYellowSector < 0 || localYellowSector > 2) {
      return ['yellow', 'yellow', 'yellow']
    }

    states[localYellowSector] = 'yellow'
    return states
  }

  if (
    timedDoubleYellowSector !== null &&
    timedDoubleYellowSector >= 0 &&
    timedDoubleYellowSector <= 2
  ) {
    states[timedDoubleYellowSector] = 'double-yellow'
  }

  return states
}

/** Closed-loop VSC pace: recover positive time credit, slow for a negative delta. */
export function vscPaceScaleForDelta(
  deltaSeconds: number,
  managementPrecision = 0.85,
  controlPulse = 0,
): number {
  const precision = clamp01(managementPrecision)
  const correctionGain =
    phaseThreeTuning.vscDeltaGain * (0.72 + precision * 0.38)
  const managementError =
    Math.max(-1, Math.min(1, controlPulse)) * (1 - precision) * 0.055

  return Math.min(
    phaseThreeTuning.vscMaximumPace,
    Math.max(
      phaseThreeTuning.vscMinimumPace,
      phaseThreeTuning.vscPace +
        deltaSeconds * correctionGain +
        managementError,
    ),
  )
}

export function advanceVscMarshallingSectorTracking(options: {
  lastMeasuredSector: number | null
  nextDeltaSeconds: number
  nextTotalDistance: number
  previousDeltaSeconds: number
  previousTotalDistance: number
  redSectorCount: number
  sectorsPerLap: number
}): { lastMeasuredSector: number; redSectorCount: number } {
  const sectorsPerLap = Math.max(1, Math.floor(options.sectorsPerLap))
  const previousDistance = Math.max(0, options.previousTotalDistance)
  const nextDistance = Math.max(previousDistance, options.nextTotalDistance)
  const firstSector = Math.floor(previousDistance * sectorsPerLap)
  const lastMeasuredSector = options.lastMeasuredSector ?? firstSector
  const finalSector = Math.floor(nextDistance * sectorsPerLap)
  let redSectorCount = Math.max(0, Math.floor(options.redSectorCount))

  if (finalSector <= lastMeasuredSector || nextDistance <= previousDistance) {
    return { lastMeasuredSector, redSectorCount }
  }

  const travel = nextDistance - previousDistance

  for (let sector = lastMeasuredSector + 1; sector <= finalSector; sector += 1) {
    const crossingDistance = sector / sectorsPerLap
    const crossingFraction = Math.min(
      1,
      Math.max(0, (crossingDistance - previousDistance) / travel),
    )
    const crossingDelta =
      options.previousDeltaSeconds +
      (options.nextDeltaSeconds - options.previousDeltaSeconds) *
        crossingFraction

    if (crossingDelta < 0) {
      redSectorCount += 1
    }
  }

  return { lastMeasuredSector: finalSector, redSectorCount }
}

/** Lap-time loss from cold tires/brakes right after a restart. */
export function restartGripLossSeconds(
  elapsedSeconds: number,
  restartUntilSeconds: number | null,
): number {
  if (restartUntilSeconds === null || elapsedSeconds >= restartUntilSeconds) {
    return 0
  }

  const remaining =
    (restartUntilSeconds - elapsedSeconds) / phaseThreeTuning.restartWindowSeconds

  return phaseThreeTuning.restartMaxLossSeconds * clamp01(remaining)
}

/** HUD label for the current flag phase. */
export function flagLabelFor(phase: ActiveFlagPhase | null): string {
  if (!phase) {
    return 'CLEAR'
  }

  switch (phase.flag) {
    case 'yellow':
      return `${phase.yellowSeverity === 'double' ? 'DOUBLE YELLOW' : 'YELLOW'} ZONE S${phase.sector + 1}`
    case 'vsc':
      return phase.neutralisation?.kind === 'vsc' &&
        phase.neutralisation.stage === 'ending'
        ? 'VSC ENDING'
        : 'VSC'
    case 'sc':
      if (phase.neutralisation?.kind !== 'safety-car') {
        return 'SC'
      }

      switch (phase.neutralisation.stage) {
        case 'collecting-field':
          return 'SC - FORMING'
        case 'queue-formed':
          return 'SC - QUEUED'
        case 'unlapping':
          return 'SC - UNLAPPING'
        case 'in-this-lap':
          return 'SC IN THIS LAP'
        case 'pit-entry':
          return 'SC PIT ENTRY'
        default:
          return 'SC'
      }
    case 'red':
      return 'RED'
    default:
      return 'CLEAR'
  }
}
