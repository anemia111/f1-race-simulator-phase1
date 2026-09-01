import type {
  CarSnapshot,
  LapRecord,
  LapTireRun,
  RaceSnapshot,
  TireCompound,
} from '../types'
import type { SuperFormulaControlTireSurface } from './superFormulaControlTires2026'

export type F1LapTireDisplay = {
  ageLaps: number
  compound: TireCompound
  kind: 'f1-pirelli'
  label: string
}

/**
 * Presentation-safe SUPER FORMULA tyre state.  `physicalModelAvailability`
 * is deliberately carried through to the UI so a dry/wet control surface is
 * never styled or treated as a Pirelli S/M/H/I/W compound.
 */
export type SuperFormulaLapTireDisplay = {
  kind: 'super-formula-control-tire'
  label: string
  lapsOnCurrentSet: number
  physicalModelAvailability: 'unavailable'
  surface: SuperFormulaControlTireSurface
}

export type LapTireDisplay = F1LapTireDisplay | SuperFormulaLapTireDisplay

export type F1ClassificationTireDisplay = F1LapTireDisplay & {
  history: readonly TireCompound[]
}

export type SuperFormulaClassificationTireDisplay =
  SuperFormulaLapTireDisplay & {
    /**
     * Source-bound control-set usage is useful operational context, but it is
     * not a synthetic compound history or a physical tyre model.
     */
    setUsage: Readonly<
      Record<
        SuperFormulaControlTireSurface,
        Readonly<{ remainingSets: number; usedSets: number }>
      >
    >
  }

export type ClassificationTireDisplay =
  | F1ClassificationTireDisplay
  | SuperFormulaClassificationTireDisplay

export type RaceClassificationEntry = {
  bestLapLap: number | null
  bestLapTimeSeconds: number | null
  code: string
  driverId: string
  gapLabel: string
  gridPosition: number
  penaltyLabel: string | null
  pitStops: number
  position: number
  positionChange: number
  statusLabel: 'FIN' | 'DNF' | 'PIT' | 'RUN' | 'DSQ' | 'DNS'
  teamColor: string
  tireDisplay: ClassificationTireDisplay
  trackLimitWarnings: number
}

/** Classified lap count: completed laps net of any lap penalties. */
const classifiedLaps = (car: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>) =>
  car.lap - car.penaltyLaps

/**
 * Converts the persisted, category-owned lap tyre payload into a display
 * model.  This is intentionally a discriminated union rather than a string
 * alias: callers must handle a SUPER FORMULA control surface as its own
 * thing, including its unavailable physical model.
 */
export function tireDisplayForLapRecord(
  lap: Pick<LapRecord, 'tireRun'>,
): LapTireDisplay {
  return tireDisplayForRun(lap.tireRun)
}

function tireDisplayForRun(tireRun: LapTireRun): LapTireDisplay {
  if (tireRun.kind === 'f1-pirelli') {
    return {
      ageLaps: tireRun.ageLaps,
      compound: tireRun.compound,
      kind: 'f1-pirelli',
      label: `${tireRun.compound} / ${tireRun.ageLaps} laps`,
    }
  }

  return {
    kind: 'super-formula-control-tire',
    label: `${tireRun.surface} control / ${tireRun.lapsOnCurrentSet} laps`,
    lapsOnCurrentSet: tireRun.lapsOnCurrentSet,
    physicalModelAvailability: tireRun.physicalModelAvailability,
    surface: tireRun.surface,
  }
}

/**
 * Builds a category-safe live tyre display for classification.  F1's
 * compound history stays in the F1 runtime branch; SUPER FORMULA presents
 * only its active dry/wet control surface, set usage, and explicit lack of a
 * physical tyre coefficient model.
 */
export function classificationTireDisplayFor(
  car: Pick<CarSnapshot, 'runtimeSystems'>,
): ClassificationTireDisplay {
  if (car.runtimeSystems.kind === 'f1') {
    const tires = car.runtimeSystems.tires
    const current = tireDisplayForRun({
      ageLaps: tires.tireAgeLaps,
      compound: tires.tire,
      kind: 'f1-pirelli',
    })

    if (current.kind !== 'f1-pirelli') {
      throw new Error('Expected an F1 Pirelli display payload.')
    }

    return {
      ...current,
      history: tires.compoundsUsed,
    }
  }

  const { controlTires, liveTires } = car.runtimeSystems
  const current = tireDisplayForRun({
    kind: 'super-formula-control-tire',
    lapsOnCurrentSet: liveTires.lapsOnCurrentSet,
    physicalModelAvailability: liveTires.physicalModel.availability,
    surface: liveTires.activeSurface,
  })

  if (current.kind !== 'super-formula-control-tire') {
    throw new Error('Expected a SUPER FORMULA control-tyre display payload.')
  }

  return {
    ...current,
    setUsage: {
      dry: {
        remainingSets: controlTires.sets.dry.remainingSets,
        usedSets: controlTires.sets.dry.usedSets,
      },
      wet: {
        remainingSets: controlTires.sets.wet.remainingSets,
        usedSets: controlTires.sets.wet.usedSets,
      },
    },
  }
}

/**
 * "+N lap(s)" when a finisher ends short of the reference car's classified
 * laps; null when both finished the same distance and a time gap applies. A
 * lapped car takes the flag seconds behind the winner, so its raw crossing-time
 * difference must never be shown as the result gap.
 */
export function lapDeficitLabel(
  reference: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>,
  car: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>,
): string | null {
  const deficit = classifiedLaps(reference) - classifiedLaps(car)

  return deficit > 0 ? `+${deficit} lap${deficit === 1 ? '' : 's'}` : null
}

export function buildRaceClassification(
  snapshot: Pick<RaceSnapshot, 'cars' | 'sessionStatus'>,
): RaceClassificationEntry[] {
  const winner = snapshot.cars.find((car) => car.position === 1) ?? null

  return snapshot.cars.map((car) => {
    const servedPenalty = car.servedPenaltySeconds
    const pendingPenalty = car.penaltySeconds
    // A penalty still unserved when the car takes the flag is added to its
    // race time, so the final board reports it as applied, not pending.
    const penaltyLabel =
      pendingPenalty > 0
        ? car.status === 'finished'
          ? `+${pendingPenalty.toFixed(0)}s applied`
          : `+${pendingPenalty.toFixed(0)}s pending`
        : servedPenalty > 0
          ? `${servedPenalty.toFixed(0)}s served`
          : null
    const statusLabel =
      car.status === 'disqualified'
        ? 'DSQ'
        : car.status === 'dns'
          ? 'DNS'
          : car.status === 'retired'
        ? 'DNF'
        : car.status === 'finished'
          ? 'FIN'
          : car.status === 'pit'
            ? 'PIT'
            : 'RUN'
    const lappedGap =
      car.status === 'finished' && winner !== null && winner.status === 'finished'
        ? lapDeficitLabel(winner, car)
        : null
    const gapLabel =
      car.status === 'disqualified'
        ? 'DSQ'
        : car.status === 'dns'
          ? 'DNS'
          : car.status === 'retired'
        ? car.retiredReason ? `DNF ${car.retiredReason}` : 'DNF'
        : car.position === 1
          ? snapshot.sessionStatus === 'finished'
            ? 'Winner'
            : 'Leader'
          : lappedGap ??
            (car.gapToLeaderLabel || '--')

    return {
      bestLapLap: car.bestLapLap,
      bestLapTimeSeconds: car.bestLapTimeSeconds,
      code: car.code,
      driverId: car.driverId,
      gapLabel,
      gridPosition: car.gridPosition,
      penaltyLabel,
      pitStops: car.pitStops,
      position: car.position,
      positionChange: car.gridPosition - car.position,
      statusLabel,
      teamColor: car.teamColor,
      tireDisplay: classificationTireDisplayFor(car),
      trackLimitWarnings: car.trackLimitWarnings,
    }
  })
}

export function fastestLapFromClassification(entries: RaceClassificationEntry[]) {
  return entries
    .filter(
      (entry) =>
        entry.statusLabel !== 'DSQ' &&
        entry.statusLabel !== 'DNS' &&
        entry.bestLapTimeSeconds !== null,
    )
    .sort(
      (left, right) =>
        (left.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) -
        (right.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY),
    )[0] ?? null
}
