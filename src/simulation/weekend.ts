import type {
  Driver,
  CarSnapshot,
  F1WeekendContext,
  SuperFormulaWeekendContext,
  TireNomination,
  TireSet,
  TireSetAllocation,
  TrackDefinition,
  TireCompound,
  WeekendContext,
  WeekendContextBase,
  WeekendStage,
} from '../types'
import type {
  PracticeSessionResult,
  QualifyingResult,
  QualifyingSegment,
} from './qualifying'
import { weekendTireAllocation } from './weekendTires'
import { baselineSetupForTrack } from './engineering'
import { createF1CarComponents } from './components'
import {
  isFeatureRaceStage,
  isStandardQualifyingStage,
} from './sessionRules'
import {
  createSuperFormulaControlTireInventory,
} from './superFormulaControlTires2026'
import { createSuperFormula2026EngineLedger } from './superFormulaEngineLedger'
import {
  isF1RuntimeSystems,
  isSuperFormulaRuntimeSystems,
} from './runtimeSystems'

const allCompounds: TireCompound[] = ['S', 'M', 'H', 'I', 'W']

export function createWeekendContext(
  drivers: Driver[],
  isSprintWeekend?: boolean,
  track?: TrackDefinition,
  categoryTireAllocation?: TireSetAllocation,
  seriesId?: 'f1-custom',
): F1WeekendContext
export function createWeekendContext(
  drivers: Driver[],
  isSprintWeekend: boolean | undefined,
  track: TrackDefinition | undefined,
  categoryTireAllocation: TireSetAllocation | undefined,
  seriesId: 'super-formula',
): SuperFormulaWeekendContext
export function createWeekendContext(
  drivers: Driver[],
  isSprintWeekend: boolean | undefined,
  track: TrackDefinition | undefined,
  categoryTireAllocation: TireSetAllocation | undefined,
  seriesId: WeekendContext['seriesId'],
): WeekendContext
export function createWeekendContext(
  drivers: Driver[],
  isSprintWeekend = false,
  track?: TrackDefinition,
  categoryTireAllocation?: TireSetAllocation,
  seriesId: WeekendContext['seriesId'] = 'f1-custom',
): WeekendContext {
  const setupByDriver: WeekendContext['setupByDriver'] = {}
  const setupConfidenceByDriver: WeekendContext['setupConfidenceByDriver'] = {}
  const parcFermeLockedByDriver: WeekendContext['parcFermeLockedByDriver'] = {}
  const pitLaneStartByDriver: WeekendContext['pitLaneStartByDriver'] = {}
  const qualificationStatusByDriver: WeekendContext['qualificationStatusByDriver'] = {}
  const shared = {
    completed: [],
    gridByStage: {},
    gridPenaltyByDriver: {},
    notes: [],
    pitLaneStartByDriver,
    qualificationStatusByDriver,
    parcFermeLockedByDriver,
    setupBonusByDriver: {},
    setupByDriver,
    setupConfidenceByDriver,
  } satisfies WeekendContextBase

  if (seriesId === 'super-formula') {
    const controlTireInventoryByDriver: SuperFormulaWeekendContext['controlTireInventoryByDriver'] = {}
    const engineLedgerByEntrant: SuperFormulaWeekendContext['engineLedgerByEntrant'] = {}

    for (const driver of drivers) {
      setupByDriver[driver.id] = baselineSetupForTrack(track)
      setupConfidenceByDriver[driver.id] = 0
      parcFermeLockedByDriver[driver.id] = false
      pitLaneStartByDriver[driver.id] = false
      qualificationStatusByDriver[driver.id] = 'qualified'
      controlTireInventoryByDriver[driver.id] =
        createSuperFormulaControlTireInventory()
      if (!engineLedgerByEntrant[driver.teamId]) {
        engineLedgerByEntrant[driver.teamId] =
          createSuperFormula2026EngineLedger({ entrantId: driver.teamId })
      }
    }

    return {
      ...shared,
      controlTireInventoryByDriver,
      engineLedgerByEntrant,
      seriesId,
    }
  }

  const tireSetsByDriver: F1WeekendContext['tireSetsByDriver'] = {}
  const tireSetInventoryByDriver: F1WeekendContext['tireSetInventoryByDriver'] = {}
  const componentConditionByDriver: F1WeekendContext['componentConditionByDriver'] = {}
  const allocation = weekendTireAllocation(
    isSprintWeekend,
    categoryTireAllocation,
  )
  const nomination: TireNomination =
    track?.tireNomination ?? {
      H: 'C2',
      M: 'C3',
      S: 'C4',
      source: 'estimated',
      sourceUrl: null,
    }

  for (const driver of drivers) {
    tireSetsByDriver[driver.id] = { ...allocation }
    setupByDriver[driver.id] = baselineSetupForTrack(track)
    setupConfidenceByDriver[driver.id] = 0
    parcFermeLockedByDriver[driver.id] = false
    componentConditionByDriver[driver.id] = createF1CarComponents()
    pitLaneStartByDriver[driver.id] = false
    qualificationStatusByDriver[driver.id] = 'qualified'
    tireSetInventoryByDriver[driver.id] = allCompounds.flatMap((compound) =>
      Array.from({ length: allocation[compound] }, (_, index): TireSet => ({
        id: `${driver.id}-${compound}-${index + 1}`,
        compound,
        family:
          compound === 'H' || compound === 'M' || compound === 'S'
            ? nomination[compound]
            : null,
        heatCycles: 0,
        laps: 0,
        status: 'available',
      })),
    )
  }

  return {
    ...shared,
    componentConditionByDriver,
    seriesId,
    tireSetInventoryByDriver,
    tireSetsByDriver,
  }
}

function recordDetailedTireSets(
  inventoryByDriver: F1WeekendContext['tireSetInventoryByDriver'],
  driverId: string,
  compounds: TireCompound[],
  lapsCompleted: number,
) {
  const inventory = [...(inventoryByDriver[driverId] ?? [])]
  const lapsPerRun = Math.max(1, Math.round(lapsCompleted / Math.max(1, compounds.length)))

  for (const compound of compounds) {
    const index = inventory.findIndex(
      (set) => set.compound === compound && set.status === 'available',
    )

    if (index < 0) {
      continue
    }

    inventory[index] = {
      ...inventory[index],
      heatCycles: inventory[index].heatCycles + 1,
      laps: inventory[index].laps + lapsPerRun,
      status: 'used',
    }
  }

  return { ...inventoryByDriver, [driverId]: inventory }
}

function consumeCompound(
  context: F1WeekendContext,
  driverId: string,
  compound: TireCompound,
  sets = 1,
) {
  const inventory = context.tireSetsByDriver[driverId] ?? {}

  return {
    ...context.tireSetsByDriver,
    [driverId]: {
      ...inventory,
      [compound]: Math.max(0, (inventory[compound] ?? 0) - sets),
    },
  }
}

function f1ComponentsFromCars(
  previous: F1WeekendContext['componentConditionByDriver'],
  cars: CarSnapshot[] | undefined,
): F1WeekendContext['componentConditionByDriver'] {
  if (!cars) {
    return previous
  }

  return cars.reduce<F1WeekendContext['componentConditionByDriver']>(
    (componentsByDriver, car) =>
      isF1RuntimeSystems(car.runtimeSystems)
        ? {
            ...componentsByDriver,
            [car.driverId]: car.runtimeSystems.components,
          }
        : componentsByDriver,
    { ...previous },
  )
}

function superFormulaLifecycleFromCars(
  previous: SuperFormulaWeekendContext,
  cars: CarSnapshot[] | undefined,
): Pick<
  SuperFormulaWeekendContext,
  'controlTireInventoryByDriver' | 'engineLedgerByEntrant'
> {
  if (!cars) {
    return {
      controlTireInventoryByDriver: previous.controlTireInventoryByDriver,
      engineLedgerByEntrant: previous.engineLedgerByEntrant,
    }
  }

  return cars.reduce<
    Pick<
      SuperFormulaWeekendContext,
      'controlTireInventoryByDriver' | 'engineLedgerByEntrant'
    >
  >(
    (lifecycle, car) => {
      if (!isSuperFormulaRuntimeSystems(car.runtimeSystems)) {
        return lifecycle
      }

      return {
        controlTireInventoryByDriver: {
          ...lifecycle.controlTireInventoryByDriver,
          [car.driverId]: car.runtimeSystems.controlTires,
        },
        engineLedgerByEntrant: {
          ...lifecycle.engineLedgerByEntrant,
          [car.runtimeSystems.engineLedger.entrantId]:
            car.runtimeSystems.engineLedger,
        },
      }
    },
    {
      controlTireInventoryByDriver: {
        ...previous.controlTireInventoryByDriver,
      },
      engineLedgerByEntrant: { ...previous.engineLedgerByEntrant },
    },
  )
}

function hasMeasuredQualifyingEvidence(cars: CarSnapshot[] | undefined) {
  return (
    cars?.some(
      (car) =>
        car.lapHistory.some((lap) => lap.segment !== undefined) ||
        Object.values(car.timedSegmentAttemptStatus ?? {}).some(
          (status) => status !== 'garage',
        ),
    ) ?? false
  )
}

export function completedQualifyingClassification(
  results: QualifyingResult[],
  cars?: CarSnapshot[],
  preferMeasuredCars = false,
): Array<Pick<QualifyingResult, 'driverId' | 'teamId' | 'position'>> {
  const useMeasuredCars =
    Boolean(cars && cars.length > 0) &&
    (preferMeasuredCars || hasMeasuredQualifyingEvidence(cars))

  return useMeasuredCars
    ? cars!
        .slice()
        .sort(
          (left, right) =>
            left.position - right.position ||
            left.gridPosition - right.gridPosition,
        )
        .map((car, index) => ({
          driverId: car.driverId,
          position: index + 1,
          teamId: car.teamId,
        }))
    : results
        .slice()
        .sort((left, right) => left.position - right.position)
        .map(({ driverId, position, teamId }) => ({
          driverId,
          position,
          teamId,
        }))
}

export function completePracticeSession(
  previous: WeekendContext,
  stage: Extract<WeekendStage, 'fp1' | 'fp2' | 'fp3'>,
  results: PracticeSessionResult[],
  cars?: CarSnapshot[],
): WeekendContext {
  if (previous.completed.includes(stage)) {
    return previous
  }

  const setupBonusByDriver = { ...previous.setupBonusByDriver }
  const setupByDriver = { ...previous.setupByDriver }
  const setupConfidenceByDriver = { ...previous.setupConfidenceByDriver }
  for (const result of results) {
    // A 0..0.35s race-pace improvement, capped across the weekend.
    setupBonusByDriver[result.driverId] = Math.min(
      0.35,
      (setupBonusByDriver[result.driverId] ?? 0) + result.setupScore / 900,
    )
    setupByDriver[result.driverId] = result.setupRecommendation
    setupConfidenceByDriver[result.driverId] = Math.max(
      setupConfidenceByDriver[result.driverId] ?? 0,
      result.setupConfidence,
    )
  }

  const common = {
    completed: previous.completed.includes(stage)
      ? previous.completed
      : [...previous.completed, stage],
    notes: [...previous.notes, `${stage.toUpperCase()} setup data locked`].slice(-8),
    setupBonusByDriver,
    setupByDriver,
    setupConfidenceByDriver,
  }

  if (previous.seriesId === 'super-formula') {
    // No sourced SF dry/wet set-selection evidence is available, so we
    // deliberately do not translate timed-session tyres into a control-tyre
    // consumption record.
    return {
      ...previous,
      ...common,
      ...superFormulaLifecycleFromCars(previous, cars),
    }
  }

  let tireSetsByDriver = previous.tireSetsByDriver
  let tireSetInventoryByDriver = previous.tireSetInventoryByDriver

  for (const result of results) {
    const f1RunCompounds = result.runTires.flatMap((tire) =>
      tire.kind === 'f1-pirelli-session-tire' ? [tire.compound] : [],
    )
    const compoundCounts = f1RunCompounds.reduce<Partial<Record<TireCompound, number>>>(
      (counts, compound) => ({ ...counts, [compound]: (counts[compound] ?? 0) + 1 }),
      {},
    )

    for (const [compound, count] of Object.entries(compoundCounts)) {
      tireSetsByDriver = consumeCompound(
        { ...previous, tireSetsByDriver },
        result.driverId,
        compound as TireCompound,
        count,
      )
    }

    tireSetInventoryByDriver = recordDetailedTireSets(
      tireSetInventoryByDriver,
      result.driverId,
      f1RunCompounds,
      result.lapsCompleted,
    )
  }

  return {
    ...previous,
    ...common,
    componentConditionByDriver: f1ComponentsFromCars(
      previous.componentConditionByDriver,
      cars,
    ),
    tireSetInventoryByDriver,
    tireSetsByDriver,
  }
}

export function completeQualifyingSession(
  previous: WeekendContext,
  stage: Extract<
    WeekendStage,
    'qualifying' | 'qualifying2' | 'sprintQualifying'
  >,
  results: QualifyingResult[],
  segments?: QualifyingSegment[],
  cars?: CarSnapshot[],
  preferMeasuredCars = false,
): WeekendContext {
  if (previous.completed.includes(stage)) {
    return previous
  }

  const parcFermeLockedByDriver = { ...previous.parcFermeLockedByDriver }
  const gridPenaltyByDriver = { ...previous.gridPenaltyByDriver }
  const qualificationStatusByDriver = {
    ...previous.qualificationStatusByDriver,
  }
  const useMeasuredCars =
    Boolean(cars && cars.length > 0) &&
    (preferMeasuredCars || hasMeasuredQualifyingEvidence(cars))
  const completedClassification = completedQualifyingClassification(
    results,
    cars,
    preferMeasuredCars,
  )
  let tireSetsByDriver: F1WeekendContext['tireSetsByDriver'] =
    previous.seriesId === 'f1-custom' ? previous.tireSetsByDriver : {}
  let tireSetInventoryByDriver: F1WeekendContext['tireSetInventoryByDriver'] =
    previous.seriesId === 'f1-custom'
      ? previous.tireSetInventoryByDriver
      : {}

  if (previous.seriesId === 'f1-custom' && useMeasuredCars) {
    for (const car of cars!) {
      if (car.runtimeSystems.kind !== 'f1') {
        continue
      }
      const f1Runtime = car.runtimeSystems
      const previousSets = previous.tireSetsByDriver[car.driverId] ?? {}
      const consumedCompounds = allCompounds.flatMap((compound) =>
        Array.from(
          {
            length: Math.max(
              0,
              (previousSets[compound] ?? 0) -
                (f1Runtime.tires.tireSetsRemaining[compound] ?? 0),
            ),
          },
          () => compound,
        ),
      )

      tireSetsByDriver = {
        ...tireSetsByDriver,
        [car.driverId]: { ...f1Runtime.tires.tireSetsRemaining },
      }
      tireSetInventoryByDriver = recordDetailedTireSets(
        tireSetInventoryByDriver,
        car.driverId,
        consumedCompounds,
        car.lapHistory.length,
      )
    }
  } else if (previous.seriesId === 'f1-custom') {
    const usageResults = segments
      ? segments.flatMap((segment) => segment.results)
      : results

    for (const result of usageResults) {
      if (result.tire.kind !== 'f1-pirelli-session-tire') {
        continue
      }
      const compound = result.tire.compound
      tireSetsByDriver = consumeCompound(
        { ...previous, tireSetsByDriver },
        result.driverId,
        compound,
        result.setsUsed,
      )
      tireSetInventoryByDriver = recordDetailedTireSets(
        tireSetInventoryByDriver,
        result.driverId,
        Array.from({ length: result.setsUsed }, () => compound),
        Math.max(1, result.validRunCount),
      )
    }
  }

  for (const result of completedClassification) {
    parcFermeLockedByDriver[result.driverId] = true
  }

  for (const car of cars ?? []) {
    const gridDrop = car.penalties
      .filter((penalty) => penalty.kind === 'grid-drop')
      .reduce((total, penalty) => total + penalty.seconds, 0)

    if (gridDrop > 0) {
      gridPenaltyByDriver[car.driverId] =
        (gridPenaltyByDriver[car.driverId] ?? 0) + gridDrop
    }

    if (isStandardQualifyingStage(stage)) {
      const requiresPermission =
        car.qualifyingClassificationStatus === 'no-time' ||
        car.qualifyingClassificationStatus === 'deleted'

      qualificationStatusByDriver[car.driverId] = requiresPermission
        ? car.stewardsGrantedStart
          ? 'exempt'
          : 'not-qualified'
        : 'qualified'
    }
  }

  const gridKey =
    stage === 'sprintQualifying'
      ? 'sprint'
      : stage === 'qualifying2'
        ? 'race2'
        : 'race'
  const orderedIds = completedClassification.map((result) => result.driverId)

  const common = {
    completed: previous.completed.includes(stage)
      ? previous.completed
      : [...previous.completed, stage],
    gridByStage: { ...previous.gridByStage, [gridKey]: orderedIds },
    gridPenaltyByDriver,
    qualificationStatusByDriver,
    notes: [
      ...previous.notes,
      `${stage === 'sprintQualifying' ? 'Sprint Shootout' : stage === 'qualifying2' ? 'Qualifying 2' : 'Qualifying'} grid locked`,
    ].slice(-8),
    parcFermeLockedByDriver,
  }

  if (previous.seriesId === 'super-formula') {
    return {
      ...previous,
      ...common,
      ...superFormulaLifecycleFromCars(previous, cars),
    }
  }

  return {
    ...previous,
    ...common,
    componentConditionByDriver: f1ComponentsFromCars(
      previous.componentConditionByDriver,
      cars,
    ),
    tireSetInventoryByDriver,
    tireSetsByDriver,
  }
}

/**
 * Records a finished race-distance session (sprint or race) so weekend
 * progression reflects it. Idempotent: re-running a finished session or a
 * lingering finished snapshot never duplicates the entry.
 */
export function completeRaceSession(
  previous: WeekendContext,
  stage: Extract<WeekendStage, 'sprint' | 'race' | 'race2'>,
  cars?: CarSnapshot[],
): WeekendContext {
  if (previous.completed.includes(stage)) {
    return previous
  }

  const common = {
    completed: [...previous.completed, stage],
    notes: [
      ...previous.notes,
      `${stage === 'sprint' ? 'Sprint' : stage === 'race2' ? 'Race 2' : 'Race'} classification recorded`,
    ].slice(-8),
  }

  if (previous.seriesId === 'super-formula') {
    return {
      ...previous,
      ...common,
      ...superFormulaLifecycleFromCars(previous, cars),
    }
  }

  return {
    ...previous,
    ...common,
    componentConditionByDriver: f1ComponentsFromCars(
      previous.componentConditionByDriver,
      cars,
    ),
  }
}

export function applyWeekendGrid(
  drivers: Driver[],
  context: WeekendContext | undefined,
  stage: 'sprint' | 'race' | 'race2',
): Driver[] | null {
  const grid = context?.gridByStage[stage]

  if (!grid || grid.length !== drivers.length) {
    return null
  }

  const byId = new Map(drivers.map((driver) => [driver.id, driver]))
  const orderedDrivers = grid
    .map((driverId) => byId.get(driverId) ?? null)
    .filter((driver): driver is Driver => driver !== null)
  const penalizedDrivers = applyGridPenalties(orderedDrivers, context, stage)

  return penalizedDrivers.map((driver, index) => ({
    ...driver,
    startOffset: index === 0 ? 0 : -index * 0.018,
  }))
}

export function applyGridPenalties(
  drivers: Driver[],
  context: WeekendContext | undefined,
  stage: 'sprint' | 'race' | 'race2',
) {
  const orderedDrivers = [...drivers]

  if (isFeatureRaceStage(stage)) {
    for (const driver of drivers) {
      const penalty = Math.max(
        0,
        Math.floor(context?.gridPenaltyByDriver[driver.id] ?? 0),
      )

      if (penalty === 0) {
        continue
      }

      const currentIndex = orderedDrivers.findIndex(
        (candidate) => candidate.id === driver.id,
      )

      if (currentIndex < 0) {
        continue
      }

      const [penalizedDriver] = orderedDrivers.splice(currentIndex, 1)
      orderedDrivers.splice(
        Math.min(orderedDrivers.length, currentIndex + penalty),
        0,
        penalizedDriver,
      )
    }
  }

  return orderedDrivers
}

export function weekendTireAvailability(
  context: WeekendContext | undefined,
  driverId: string,
  compound: TireCompound,
) {
  return context?.seriesId === 'f1-custom'
    ? context.tireSetsByDriver[driverId]?.[compound] ?? null
    : null
}

export function emptyCompoundInventory() {
  return allCompounds.reduce<Partial<Record<TireCompound, number>>>((inventory, compound) => {
    inventory[compound] = 0
    return inventory
  }, {})
}
