import type { Driver, RaceConfig, TireCompound } from '../types'
import { tireNominationForTrack } from '../data/tireNominations2026'
import { driverAbilityValue } from './driverAbility'
import type { KnockoutQualifying, QualifyingResult } from './qualifying'
import { hashChance } from './random'
import { effectiveCliffLaps } from './tires'
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
const dryCompoundOrder = ['S', 'M', 'H'] as const
type DryCompound = (typeof dryCompoundOrder)[number]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

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
  const compound = legalStartCompoundForConditions('M', weather, trackGrip)

  return dryCompounds.has(compound) ? null : compound
}

export function legalStartCompoundForConditions(
  planned: TireCompound,
  weather: ReturnType<typeof weatherFor>,
  trackGrip: number,
  wetWeatherTyresMandatory = false,
): TireCompound {
  if (wetWeatherTyresMandatory || weather === 'heavy-rain' || trackGrip < 0.76) {
    return 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return 'I'
  }

  return dryCompounds.has(planned) ? planned : 'M'
}

function weightedDryStartCompound(
  config: RaceConfig,
  driver: Driver,
  remaining: DrySetInventory,
  session: 'race' | 'sprint',
): DryCompound {
  const team = config.teams.find((candidate) => candidate.id === driver.teamId)
  const driverManagement = driverAbilityValue(driver, 'tireManagement')
  const machineManagement = team?.machine.tireDegManagement ?? 0.82
  const combinedManagement = driverManagement * 0.65 + machineManagement * 0.35
  const normalizedManagement = clamp01((combinedManagement - 0.55) / 0.95)
  const nomination = config.track.tireNomination ?? tireNominationForTrack(config.track)
  const grandPrixLaps =
    config.track.raceLaps ?? Math.max(35, Math.round(305 / config.track.lengthKm))
  const distanceLaps =
    session === 'sprint' ? Math.max(15, Math.round(grandPrixLaps * 0.33)) : grandPrixLaps
  const targetOpeningStint = distanceLaps * (session === 'sprint' ? 0.9 : 0.36)
  const softCliff = effectiveCliffLaps('S', combinedManagement, nomination)
  const tireStress = clamp01(1 - softCliff / Math.max(1, targetOpeningStint))
  const pitLossPressure =
    config.track.kind === 'street' ? 0.78 : config.track.kind === 'hybrid' ? 0.56 : 0.38
  const teamAggression = hashChance(
    `${config.seed}:${session}-start-strategy:${driver.teamId}`,
  )
  const driverAggression = hashChance(
    `${config.seed}:${session}-start-aggression:${driver.id}`,
  )
  const aggression = teamAggression * 0.62 + driverAggression * 0.38
  const weights: Record<DryCompound, number> =
    session === 'sprint'
      ? {
          S:
            0.3 +
            aggression * 0.24 +
            normalizedManagement * 0.12 +
            (1 - tireStress) * 0.1,
          M: 0.5 + tireStress * 0.12,
          H: 0.025 + tireStress * 0.05 + (1 - aggression) * 0.03,
        }
      : {
          S:
            0.16 +
            aggression * 0.22 +
            normalizedManagement * 0.1 +
            (1 - tireStress) * 0.1 -
            pitLossPressure * 0.05,
          M:
            0.42 +
            (1 - Math.abs(aggression - 0.5) * 2) * 0.12 +
            tireStress * 0.08,
          H:
            0.14 +
            (1 - aggression) * 0.18 +
            tireStress * 0.22 +
            pitLossPressure * 0.08 +
            (1 - normalizedManagement) * 0.06,
        }
  const available = dryCompoundOrder.filter((compound) => remaining[compound] > 0)

  if (available.length === 0) {
    return 'M'
  }

  const weighted = available.map((compound) => ({
    compound,
    weight: Math.max(0.01, weights[compound]) *
      (0.65 + Math.min(3, remaining[compound]) * 0.12),
  }))
  const totalWeight = weighted.reduce((total, candidate) => total + candidate.weight, 0)
  let choice =
    hashChance(`${config.seed}:${session}-start-choice:${driver.id}`) * totalWeight

  for (const candidate of weighted) {
    choice -= candidate.weight

    if (choice <= 0) {
      return candidate.compound
    }
  }

  return weighted.at(-1)!.compound
}

function raceStartCompoundFor(
  config: RaceConfig,
  driver: Driver,
  remaining: DrySetInventory,
) {
  const wet = weatherStartCompound(config)

  if (wet) {
    return wet
  }

  return weightedDryStartCompound(config, driver, remaining, 'race')
}

function sprintStartCompoundFor(
  config: RaceConfig,
  driver: Driver,
  remaining: DrySetInventory,
) {
  const wet = weatherStartCompound(config)

  if (wet) {
    return wet
  }

  return weightedDryStartCompound(config, driver, remaining, 'sprint')
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
          remaining,
        ),
        sprintStartCompound: sprintStartCompoundFor(
          config,
          driver,
          remaining,
        ),
      }
    }),
  }
}
