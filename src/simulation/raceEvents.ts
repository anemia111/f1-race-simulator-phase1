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
} from '../types'
import { hashChance } from './random'

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
  trackLimitBaseChance: 0.045,
  trackLimitConsistencyWeight: 0.12,
  trackLimitPenaltyThreshold: 4,
  /** Warnings between each additional 5s penalty after the threshold. */
  trackLimitPenaltyStep: 2,
  trackLimitPenaltySeconds: 5,
  // Flag pace multipliers.
  yellowSectorPace: 0.88,
  vscPace: 0.62,
  vscDeltaGain: 0.58,
  vscMinimumPace: 0.18,
  vscMaximumPace: 0.9,
  scPace: 0.5,
  /** Pace for cars still catching the SC queue (bunching). */
  scCatchUpPace: 0.74,
  /** Gap to the car ahead below which a car is considered "in the queue". */
  scQueueGapSeconds: 1.2,
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

function trackLimitChance(consistency: number): number {
  const chance =
    phaseThreeTuning.trackLimitBaseChance +
    (1 - clamp01(consistency)) * phaseThreeTuning.trackLimitConsistencyWeight

  return Math.min(0.2, Math.max(0.02, chance))
}

/** Whether a driver picks up a track-limit warning on a specific lap. */
export function lapHasTrackLimitWarning(
  seed: string,
  driverId: string,
  consistency: number,
  lap: number,
): boolean {
  if (lap < 2) {
    return false
  }

  return hashChance(`${seed}:track-limit:${driverId}:${lap}`) < trackLimitChance(consistency)
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
 * Time penalty owed for a warning count: 5s at the threshold, +5s for every
 * `trackLimitPenaltyStep` warnings beyond it.
 */
export function penaltyFromWarnings(warnings: number): number {
  const {
    trackLimitPenaltyThreshold: threshold,
    trackLimitPenaltyStep: step,
    trackLimitPenaltySeconds: unit,
  } = phaseThreeTuning

  if (warnings < threshold) {
    return 0
  }

  return unit * (1 + Math.floor((warnings - threshold) / step))
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

/**
 * Pace multiplier applied to a car's advance rate under the current flag.
 * Local yellows only slow cars inside the affected sector. Under the SC the
 * queue runs at SC pace while cars with a gap ahead run faster until they
 * catch the queue; this is what compresses the field. Red stops the session.
 */
export function flagPaceMultiplier(
  phase: ActiveFlagPhase | null,
  carSector: number,
  options: { isLeader: boolean; gapToAheadSeconds: number },
): number {
  if (!phase) {
    return 1
  }

  switch (phase.flag) {
    case 'yellow':
      return carSector === phase.sector ? phaseThreeTuning.yellowSectorPace : 1
    case 'vsc':
      return phaseThreeTuning.vscPace
    case 'sc':
      if (options.isLeader) {
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

/** Local yellows only govern cars that are inside the affected sector. */
export function flagPhaseForSector(
  phase: ActiveFlagPhase | null,
  carSector: number,
): ActiveFlagPhase | null {
  return phase?.flag === 'yellow' && phase.sector !== carSector ? null : phase
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
export function vscPaceScaleForDelta(deltaSeconds: number): number {
  return Math.min(
    phaseThreeTuning.vscMaximumPace,
    Math.max(
      phaseThreeTuning.vscMinimumPace,
      phaseThreeTuning.vscPace +
        deltaSeconds * phaseThreeTuning.vscDeltaGain,
    ),
  )
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
      return `YELLOW S${phase.sector + 1}`
    case 'vsc':
      return 'VSC'
    case 'sc':
      return 'SC'
    case 'red':
      return 'RED'
    default:
      return 'CLEAR'
  }
}
