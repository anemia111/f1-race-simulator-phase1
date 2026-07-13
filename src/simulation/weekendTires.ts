import type { Driver, RaceConfig, TireCompound } from '../types'
import type { KnockoutQualifying, QualifyingResult } from './qualifying'
import { hashChance } from './random'
import { trackGripForWeather, weatherFor } from './weather'

export type DrySetInventory = {
  H: number
  M: number
  S: number
}

export type DriverTirePlan = {
  code: string
  driverId: string
  qualifyingUsed: DrySetInventory
  remaining: DrySetInventory
  raceStartCompound: TireCompound
  sprintStartCompound: TireCompound
}

export type WeekendTirePlan = {
  driverPlans: DriverTirePlan[]
}

export type WeekendTireAllocation = Record<TireCompound, number>

// FIA 2026 F1 Sporting Regulations Issue 07, Article B6.2.4.
const standardWeekendAllocation: WeekendTireAllocation = {
  H: 2,
  I: 5,
  M: 3,
  S: 8,
  W: 2,
}

const sprintWeekendAllocation: WeekendTireAllocation = {
  H: 2,
  I: 6,
  M: 4,
  S: 6,
  W: 2,
}

export function weekendTireAllocation(
  isSprintWeekend: boolean,
): WeekendTireAllocation {
  return {
    ...(isSprintWeekend ? sprintWeekendAllocation : standardWeekendAllocation),
  }
}

const cloneInventory = (source: DrySetInventory): DrySetInventory => ({ ...source })

const dryCompounds = new Set<TireCompound>(['S', 'M', 'H'])

function emptyInventory(): DrySetInventory {
  return { H: 0, M: 0, S: 0 }
}

function addQualifyingUsage(
  usage: Map<string, DrySetInventory>,
  results: QualifyingResult[],
) {
  for (const result of results) {
    if (!dryCompounds.has(result.compound)) {
      continue
    }

    const current = usage.get(result.driverId) ?? emptyInventory()
    const compound = result.compound as keyof DrySetInventory

    current[compound] += result.setsUsed
    usage.set(result.driverId, current)
  }
}

function weatherStartCompound(config: RaceConfig): TireCompound | null {
  const weather = weatherFor(config.seed, config.track, 0)
  const trackGrip = trackGripForWeather(config.seed, config.track, 0)

  if (weather === 'heavy-rain' || trackGrip < 0.76) {
    return 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return 'I'
  }

  return null
}

function raceStartCompoundFor(
  config: RaceConfig,
  driver: Driver,
  gridPosition: number,
  remaining: DrySetInventory,
) {
  const wet = weatherStartCompound(config)

  if (wet) {
    return wet
  }

  const roll = hashChance(`${config.seed}:race-start-tire:${driver.id}`)
  const longRace = config.track.baseLapTime > 92 || config.track.kind === 'street'

  if (gridPosition <= 6) {
    return remaining.M > 0 ? 'M' : remaining.H > 0 ? 'H' : 'S'
  }

  if (gridPosition >= 15 && (longRace || roll > 0.58) && remaining.H > 0) {
    return 'H'
  }

  if (driver.tireManagement > 0.86 && remaining.M > 0) {
    return 'M'
  }

  return remaining.M > 0 ? 'M' : remaining.H > 0 ? 'H' : 'S'
}

function sprintStartCompoundFor(
  config: RaceConfig,
  driver: Driver,
  gridPosition: number,
  remaining: DrySetInventory,
) {
  const wet = weatherStartCompound(config)

  if (wet) {
    return wet
  }

  const roll = hashChance(`${config.seed}:sprint-start-tire:${driver.id}`)

  if (gridPosition <= 8 && remaining.M > 0) {
    return 'M'
  }

  if (roll > 0.72 && remaining.S > 0) {
    return 'S'
  }

  return remaining.M > 0 ? 'M' : 'S'
}

function gridPositions(results: QualifyingResult[]) {
  return new Map(results.map((result) => [result.driverId, result.position]))
}

export function buildWeekendTirePlan(
  config: RaceConfig,
  qualifying: KnockoutQualifying,
  sprintShootout: KnockoutQualifying | null = null,
): WeekendTirePlan {
  const usage = new Map<string, DrySetInventory>()

  for (const segment of qualifying.segments) {
    addQualifyingUsage(usage, segment.results)
  }

  if (sprintShootout) {
    for (const segment of sprintShootout.segments) {
      addQualifyingUsage(usage, segment.results)
    }
  }

  const raceGrid = gridPositions(qualifying.classification)
  const sprintGrid = gridPositions(
    sprintShootout?.classification ?? qualifying.classification,
  )
  const allocation = weekendTireAllocation(sprintShootout !== null)
  const baseDrySets: DrySetInventory = {
    H: allocation.H,
    M: allocation.M,
    S: allocation.S,
  }

  return {
    driverPlans: config.drivers.map((driver) => {
      const qualifyingUsed = usage.get(driver.id) ?? emptyInventory()
      const remaining = cloneInventory(baseDrySets)

      remaining.S = Math.max(0, remaining.S - qualifyingUsed.S)
      remaining.M = Math.max(0, remaining.M - qualifyingUsed.M)
      remaining.H = Math.max(0, remaining.H - qualifyingUsed.H)

      return {
        code: driver.code,
        driverId: driver.id,
        qualifyingUsed,
        remaining,
        raceStartCompound: raceStartCompoundFor(
          config,
          driver,
          raceGrid.get(driver.id) ?? 99,
          remaining,
        ),
        sprintStartCompound: sprintStartCompoundFor(
          config,
          driver,
          sprintGrid.get(driver.id) ?? 99,
          remaining,
        ),
      }
    }),
  }
}
