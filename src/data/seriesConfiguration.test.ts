import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
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

const f2 = seriesPackageById.get('f2')!

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

    expect(imported[0].name).toBe('Driver, "One"')
    expect(imported[0].skills.qualifyingPace).toBeCloseTo(
      Math.round(edited[0].skills.qualifyingPace * 100) / 100,
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
})
