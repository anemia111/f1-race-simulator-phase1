import type {
  Driver,
  CarSnapshot,
  TireNomination,
  TireSet,
  TireSetAllocation,
  TrackDefinition,
  TireCompound,
  WeekendContext,
  WeekendStage,
} from '../types'
import type {
  PracticeSessionResult,
  QualifyingResult,
  QualifyingSegment,
} from './qualifying'
import { weekendTireAllocation } from './weekendTires'
import { baselineSetupForTrack } from './engineering'
import { createCarComponents } from './components'
import {
  isFeatureRaceStage,
  isStandardQualifyingStage,
} from './sessionRules'

const allCompounds: TireCompound[] = ['S', 'M', 'H', 'I', 'W']

export function createWeekendContext(
  drivers: Driver[],
  isSprintWeekend = false,
  track?: TrackDefinition,
  categoryTireAllocation?: TireSetAllocation,
): WeekendContext {
  const tireSetsByDriver: WeekendContext['tireSetsByDriver'] = {}
  const tireSetInventoryByDriver: WeekendContext['tireSetInventoryByDriver'] = {}
  const setupByDriver: WeekendContext['setupByDriver'] = {}
  const setupConfidenceByDriver: WeekendContext['setupConfidenceByDriver'] = {}
  const parcFermeLockedByDriver: WeekendContext['parcFermeLockedByDriver'] = {}
  const componentConditionByDriver: WeekendContext['componentConditionByDriver'] = {}
  const pitLaneStartByDriver: WeekendContext['pitLaneStartByDriver'] = {}
  const qualificationStatusByDriver: WeekendContext['qualificationStatusByDriver'] = {}
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
    componentConditionByDriver[driver.id] = createCarComponents()
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
    completed: [],
    componentConditionByDriver,
    gridByStage: {},
    gridPenaltyByDriver: {},
    notes: [],
    pitLaneStartByDriver,
    qualificationStatusByDriver,
    parcFermeLockedByDriver,
    setupBonusByDriver: {},
    setupByDriver,
    setupConfidenceByDriver,
    tireSetInventoryByDriver,
    tireSetsByDriver,
  }
}

function recordDetailedTireSets(
  inventoryByDriver: WeekendContext['tireSetInventoryByDriver'],
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
  context: WeekendContext,
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
  let tireSetsByDriver = previous.tireSetsByDriver
  let tireSetInventoryByDriver = previous.tireSetInventoryByDriver

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
    const compoundCounts = result.runCompounds.reduce<Partial<Record<TireCompound, number>>>(
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
      result.runCompounds,
      result.lapsCompleted,
    )
  }

  return {
    ...previous,
    componentConditionByDriver: cars
      ? Object.fromEntries(
          cars.map((car) => [car.driverId, car.components]),
        )
      : previous.componentConditionByDriver,
    completed: previous.completed.includes(stage)
      ? previous.completed
      : [...previous.completed, stage],
    notes: [...previous.notes, `${stage.toUpperCase()} setup data locked`].slice(-8),
    setupBonusByDriver,
    setupByDriver,
    setupConfidenceByDriver,
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
): WeekendContext {
  if (previous.completed.includes(stage)) {
    return previous
  }

  let tireSetsByDriver = previous.tireSetsByDriver
  let tireSetInventoryByDriver = previous.tireSetInventoryByDriver
  const parcFermeLockedByDriver = { ...previous.parcFermeLockedByDriver }
  const gridPenaltyByDriver = { ...previous.gridPenaltyByDriver }
  const qualificationStatusByDriver = {
    ...previous.qualificationStatusByDriver,
  }

  const usageResults = segments
    ? segments.flatMap((segment) => segment.results)
    : results

  for (const result of usageResults) {
    tireSetsByDriver = consumeCompound(
      { ...previous, tireSetsByDriver },
      result.driverId,
      result.compound,
      result.setsUsed,
    )
    tireSetInventoryByDriver = recordDetailedTireSets(
      tireSetInventoryByDriver,
      result.driverId,
      Array.from({ length: result.setsUsed }, () => result.compound),
      Math.max(1, result.validRunCount),
    )
  }

  for (const result of results) {
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
  const measuredClassificationAvailable =
    cars?.some((car) => car.bestLapTimeSeconds !== null) ?? false
  const orderedIds = measuredClassificationAvailable
    ? cars!
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((car) => car.driverId)
    : results
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((result) => result.driverId)

  return {
    ...previous,
    componentConditionByDriver: cars
      ? Object.fromEntries(
          cars.map((car) => [car.driverId, car.components]),
        )
      : previous.componentConditionByDriver,
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

  return {
    ...previous,
    componentConditionByDriver: cars
      ? Object.fromEntries(
          cars.map((car) => [car.driverId, car.components]),
        )
      : previous.componentConditionByDriver,
    completed: [...previous.completed, stage],
    notes: [
      ...previous.notes,
      `${stage === 'sprint' ? 'Sprint' : stage === 'race2' ? 'Race 2' : 'Race'} classification recorded`,
    ].slice(-8),
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
  return context?.tireSetsByDriver[driverId]?.[compound] ?? null
}

export function emptyCompoundInventory() {
  return allCompounds.reduce<Partial<Record<TireCompound, number>>>((inventory, compound) => {
    inventory[compound] = 0
    return inventory
  }, {})
}
