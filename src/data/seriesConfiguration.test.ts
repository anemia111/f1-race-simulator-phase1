import { describe, expect, it } from 'vitest'
import {
  expandedDriverSkills,
  type CompactDriverRatings,
} from './driverProfiles'
import { seriesPackageById } from '../series/seriesRegistry'
import {
  DRIVER_ABILITY_GROUPS,
  driverAbilityGroupValue,
} from '../simulation/driverAbility'
import {
  SeriesConfigurationValidationError,
  equalizeMachinePerformance,
  exportDriverCsv,
  exportSeriesConfigurationBackup,
  exportTeamCsv,
  importDriverCsv,
  importSeriesConfigurationBackup,
  importTeamCsv,
  parsePersistedSeriesConfiguration,
  serializeSeriesConfiguration,
} from './seriesConfiguration'
import type { Driver, MachinePerformanceProfile } from '../types'

const f2 = seriesPackageById.get('f2')!
const f1 = seriesPackageById.get('f1-custom')!
const superFormula = seriesPackageById.get('super-formula')!
const legacySuperFormulaDriverSource: Readonly<
  Record<string, { id?: string; overall: number }>
> = {
  ayumu_iwasa: { overall: 78 },
  charlie_wurz: { overall: 67 },
  igor_fraga: { overall: 71 },
  juju_noda: { overall: 66 },
  kakunoshin_ohta: { overall: 79 },
  kamui_kobayashi: { overall: 75 },
  kenta_yamashita: { overall: 74 },
  luke_browning: { overall: 72 },
  nirei_fukuzumi: { overall: 76 },
  nobuharu_matsushita: { overall: 72 },
  ren_sato: { overall: 72 },
  rikuto_kobayashi: { overall: 68 },
  roman_stanek: { overall: 70 },
  sacha_fenestraz: { overall: 75 },
  seita_nonaka: { id: 'giuliano_alesi', overall: 70 },
  sena_sakaguchi: { overall: 75 },
  sho_tsuboi: { overall: 78 },
  syun_koide: { overall: 68 },
  tadasuke_makino: { overall: 77 },
  tomoki_nojiri: { overall: 77 },
  toshiki_oyu: { overall: 74 },
  ukyo_sasahara: { overall: 72 },
  yuto_nomura: { overall: 67 },
  zak_osullivan: { overall: 70 },
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

function legacyHashUnit(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

function legacySupportDriverSkills(driver: Driver) {
  const legacySource = legacySuperFormulaDriverSource[driver.id]!
  const overall = legacySource.overall
  const driverId = legacySource.id ?? driver.id
  const potential = Math.round((driver.potential ?? 0) * 100)
  const youthGap = Math.max(0, potential - overall)
  const rating = (
    axis: keyof CompactDriverRatings,
    adjustment = 0,
  ) =>
    clamp(
      (overall +
        (legacyHashUnit(`${driverId}:${axis}`) - 0.5) * 4 +
        adjustment) /
        100,
    )

  return expandedDriverSkills({
    adaptability: rating('adaptability', youthGap * 0.08),
    consistency: rating('consistency', -youthGap * 0.08),
    defending: rating('defending'),
    errorControl: rating('errorControl', -youthGap * 0.1),
    experience: rating('experience', -youthGap * 0.22),
    overtaking: rating('overtaking'),
    qualifyingPace: rating('qualifyingPace', 1),
    racePace: rating('racePace'),
    raceStart: rating('raceStart'),
    technicalFeedback: rating('technicalFeedback', -youthGap * 0.08),
    tyreManagement: rating('tyreManagement'),
    wetSkill: rating('wetSkill'),
  })
}

function legacyMachineProfile(
  baseRating: number,
  operations: number,
): MachinePerformanceProfile {
  const base = baseRating / 100
  const operationalPace = base + (operations - 85) * 0.0008
  const reliability = base + (operations - 82) * 0.0015

  return {
    activeAeroEfficiency: base,
    aerodynamicEfficiency: base,
    brakeCooling: reliability,
    brakingPerformance: operationalPace,
    brakingStability: operationalPace,
    bumpTolerance: base,
    coolingEfficiency: reliability,
    dirtyAirTolerance: base,
    downforceGeneration: base,
    dragEfficiency: base,
    electricalDeploymentEfficiency: base,
    energyRecoveryEfficiency: base,
    frontTireManagement: operationalPace,
    fuelEfficiency: base,
    highSpeedCornerPerformance: operationalPace,
    intermediatePerformance: operationalPace,
    kerbHandling: operationalPace,
    lowSpeedCornerPerformance: operationalPace,
    mechanicalGrip: base,
    mediumSpeedCornerPerformance: operationalPace,
    puOutput: base,
    qualifyingPace: operationalPace,
    racePace: operationalPace,
    rearTireManagement: operationalPace,
    reliability,
    rideCompliance: base,
    straightLineEfficiency: base,
    tireDegManagement: operationalPace,
    tireWarmup: operationalPace,
    towSensitivity: base,
    traction: operationalPace,
    wetPerformance: operationalPace,
  }
}

const legacyVerstappenSkills = expandedDriverSkills({
  adaptability: 0.99,
  consistency: 0.98,
  defending: 0.99,
  errorControl: 0.99,
  experience: 0.98,
  overtaking: 0.99,
  qualifyingPace: 0.99,
  racePace: 0.99,
  raceStart: 0.99,
  technicalFeedback: 0.96,
  tyreManagement: 0.98,
  wetSkill: 0.99,
})

describe('series configuration import and export', () => {
  it('round-trips a validated versioned JSON backup', () => {
    const teams = f2.teams.map((team, index) => ({
      ...team,
      machine: { ...team.machine },
      name: index === 0 ? 'Edited Team' : team.name,
    }))
    const drivers = f2.drivers.map((driver, index) => ({
      ...driver,
      carNumber: index === 0 ? 99 : driver.carNumber,
      skills: { ...driver.skills },
      style: { ...driver.style },
    }))
    const source = exportSeriesConfigurationBackup(
      f2,
      teams,
      drivers,
      '2026-07-19T00:00:00.000Z',
      ['legacy-150-to-100'],
    )
    const restored = importSeriesConfigurationBackup(source, f2)

    expect(restored.teams[0].name).toBe('Edited Team')
    expect(restored.drivers[0].carNumber).toBe(99)
    expect(restored.migrationHistory).toEqual(['legacy-150-to-100'])
    expect(restored.rules).toEqual(f2.rules)
    expect(restored.calendar).toEqual(f2.calendar)
  })

  it('rejects a backup for a different category', () => {
    const f3 = seriesPackageById.get('f3')!
    const source = exportSeriesConfigurationBackup(
      f3,
      f3.teams,
      f3.drivers,
      '2026-07-19T00:00:00.000Z',
    )

    expect(() => importSeriesConfigurationBackup(source, f2)).toThrow(
      SeriesConfigurationValidationError,
    )
  })

  it('imports validated rule edits and rejects broken event relations', () => {
    const backup = JSON.parse(
      exportSeriesConfigurationBackup(
        f2,
        f2.teams,
        f2.drivers,
        '2026-07-19T00:00:00.000Z',
      ),
    )
    backup.rules.freePracticeDurationSeconds = 3_000
    const imported = importSeriesConfigurationBackup(
      JSON.stringify(backup),
      f2,
    )
    expect(imported.rules.freePracticeDurationSeconds).toBe(3_000)

    backup.calendar.pop()
    expect(() =>
      importSeriesConfigurationBackup(JSON.stringify(backup), f2),
    ).toThrow(/calendar is missing ids/i)
  })

  it('fails closed for corrupted browser storage', () => {
    expect(parsePersistedSeriesConfiguration('{bad json', f2)).toBeNull()
    expect(
      parsePersistedSeriesConfiguration(
        JSON.stringify({ saveVersion: 99, seriesId: 'f2' }),
        f2,
      ),
    ).toBeNull()
  })

  it('round-trips driver CSV including quoted text and grouped abilities', () => {
    const edited = f2.drivers.map((driver, index) => ({
      ...driver,
      name: index === 0 ? 'Driver, "One"' : driver.name,
      skills: { ...driver.skills },
      style: { ...driver.style },
    }))
    const csv = exportDriverCsv(edited)
    const imported = importDriverCsv(csv, f2, f2.drivers, f2.teams)
    const paceGroup = DRIVER_ABILITY_GROUPS.find(
      (group) => group.key === 'pace',
    )!

    expect(imported[0].name).toBe('Driver, "One"')
    expect(imported[0].skills.qualifyingPace).toBeCloseTo(
      Math.round(
        driverAbilityGroupValue(edited[0], paceGroup.stats) * 100,
      ) / 100,
      5,
    )
    expect(imported).toHaveLength(f2.carCount)
  })

  it('rejects duplicate car numbers in driver CSV', () => {
    const rows = exportDriverCsv(f2.drivers).trim().split(/\r?\n/)
    const headers = rows[0].split(',')
    const numberIndex = headers.indexOf('car_number')
    const first = rows[1].split(',')
    const second = rows[2].split(',')
    second[numberIndex] = first[numberIndex]
    rows[2] = second.join(',')

    expect(() =>
      importDriverCsv(rows.join('\n'), f2, f2.drivers, f2.teams),
    ).toThrow(/duplicate car numbers/i)
  })

  it('round-trips machine CSV and preserves exact team ids', () => {
    const csv = exportTeamCsv(f2.teams)
    const imported = importTeamCsv(csv, f2, f2.teams)

    expect(imported.map((team) => team.id)).toEqual(
      f2.teams.map((team) => team.id),
    )
    expect(imported[0].machine.puOutput).toBeCloseTo(
      f2.teams[0].machine.puOutput,
      4,
    )
  })

  it('equalises performance without changing team identity', () => {
    const equalised = equalizeMachinePerformance(f2.teams)

    expect(equalised.map((team) => team.id)).toEqual(
      f2.teams.map((team) => team.id),
    )
    expect(new Set(equalised.map((team) => team.machine.racePace)).size).toBe(1)
    expect(new Set(equalised.map((team) => team.pitCrewSpeed)).size).toBe(1)
  })

  it('serializes storage without transient simulation state', () => {
    const stored = serializeSeriesConfiguration('f2', f2.teams, f2.drivers)

    expect(stored.saveVersion).toBe(1)
    expect(stored.drivers[0]).not.toHaveProperty('startOffset')
    expect(stored.teams[0]).not.toHaveProperty('performanceSource')
  })

  it('migrates the old uniform F1 pit-crew default to calibrated team values', () => {
    const stored = serializeSeriesConfiguration(
      'f1-custom',
      f1.teams.map((team) => ({ ...team, pitCrewSpeed: 0.82 })),
      f1.drivers,
    )
    const restored = parsePersistedSeriesConfiguration(
      JSON.stringify(stored),
      f1,
    )

    expect(restored).not.toBeNull()
    expect(restored!.teams.map((team) => team.pitCrewSpeed)).toEqual(
      f1.teams.map((team) => team.pitCrewSpeed),
    )
    expect(
      new Set(restored!.teams.map((team) => team.pitCrewSpeed)).size,
    ).toBe(10)
  })

  it('updates untouched legacy F1 driver ratings and preserves edited ones', () => {
    const verstappenIndex = f1.drivers.findIndex(
      (driver) => driver.id === 'max_verstappen',
    )
    const untouched = serializeSeriesConfiguration(
      'f1-custom',
      f1.teams,
      f1.drivers,
    )
    untouched.drivers[verstappenIndex].skills = {
      ...legacyVerstappenSkills,
    }

    const migrated = parsePersistedSeriesConfiguration(
      JSON.stringify(untouched),
      f1,
    )

    expect(migrated).not.toBeNull()
    expect(migrated!.drivers[verstappenIndex].skills).toEqual(
      f1.drivers[verstappenIndex].skills,
    )

    const edited = structuredClone(untouched)
    edited.drivers[verstappenIndex].skills.qualifyingPace -= 0.01
    const preserved = parsePersistedSeriesConfiguration(
      JSON.stringify(edited),
      f1,
    )

    expect(preserved).not.toBeNull()
    expect(preserved!.drivers[verstappenIndex].skills.qualifyingPace).toBe(
      edited.drivers[verstappenIndex].skills.qualifyingPace,
    )
  })

  it('migrates untouched support-series machine and driver defaults', () => {
    const stored = serializeSeriesConfiguration(
      'super-formula',
      superFormula.teams,
      superFormula.drivers,
    )
    stored.teams = stored.teams.map((team) => {
      const source = superFormula.teams.find(
        (candidate) => candidate.id === team.id,
      )!
      return {
        ...team,
        machine: legacyMachineProfile(
          superFormula.rules.vehicleBaseRating!,
          source.performanceSource?.overall ?? 0,
        ),
      }
    })
    stored.drivers = stored.drivers.map((driver) => {
      const source = superFormula.drivers.find(
        (candidate) => candidate.id === driver.id,
      )!
      const legacySkills = legacySupportDriverSkills(source)

      return source.id === 'seita_nonaka'
        ? {
            ...driver,
            code: 'ALE',
            id: 'giuliano_alesi',
            name: 'Giuliano Alesi',
            nationality: 'FRA',
            skills: legacySkills,
          }
        : { ...driver, skills: legacySkills }
    })

    const restored = parsePersistedSeriesConfiguration(
      JSON.stringify(stored),
      superFormula,
    )

    expect(restored).not.toBeNull()
    expect(restored!.teams.map((team) => team.machine)).toEqual(
      superFormula.teams.map((team) => team.machine),
    )
    expect(restored!.drivers.map((driver) => driver.skills)).toEqual(
      superFormula.drivers.map((driver) => driver.skills),
    )
  })

  it('preserves manually edited legacy support-series performance', () => {
    const stored = serializeSeriesConfiguration(
      'super-formula',
      superFormula.teams,
      superFormula.drivers,
    )
    const firstTeam = superFormula.teams[0]
    const firstDriver = superFormula.drivers[0]
    stored.teams[0].machine = legacyMachineProfile(
      superFormula.rules.vehicleBaseRating!,
      firstTeam.performanceSource?.overall ?? 0,
    )
    stored.teams[0].machine.racePace += 0.01
    stored.drivers[0].skills = legacySupportDriverSkills(firstDriver)
    stored.drivers[0].skills.qualifyingPace += 0.01

    const restored = parsePersistedSeriesConfiguration(
      JSON.stringify(stored),
      superFormula,
    )

    expect(restored).not.toBeNull()
    expect(restored!.teams[0].machine.racePace).toBe(
      stored.teams[0].machine.racePace,
    )
    expect(restored!.drivers[0].skills.qualifyingPace).toBe(
      stored.drivers[0].skills.qualifyingPace,
    )
  })
})
