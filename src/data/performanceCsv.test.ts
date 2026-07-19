import { describe, expect, it } from 'vitest'
import performanceCsv from './f1Performance.csv?raw'
import {
  driverConfiguredOverallAbilityPoints,
  driverOverallAbilityPoints,
} from '../simulation/driverAbility'
import {
  PERFORMANCE_CSV_FILE,
  initialDrivers,
  initialTeams,
  loadPerformanceCsv,
  normalizeCsvAbility,
  performanceCsvAudit,
} from './performanceCsv'

describe('CSV performance source of truth', () => {
  it('CSV-1/2/3: loads the specified 10-team, 30-car field', () => {
    expect(performanceCsvAudit.fileName).toBe(PERFORMANCE_CSV_FILE)
    expect(initialTeams).toHaveLength(10)
    expect(initialDrivers).toHaveLength(30)
    expect(performanceCsvAudit.teamIds).toEqual(
      initialTeams.map((team) => team.id),
    )
    expect(performanceCsvAudit.driverIds).toEqual(
      initialDrivers.map((driver) => driver.id),
    )
    expect(performanceCsvAudit.machineColumns).toContain('ERS recovery')
    expect(performanceCsvAudit.driverColumns).toContain('Technical feedback')
    expect(Object.values(performanceCsvAudit.teamDriverCounts)).toEqual(
      Array.from({ length: 10 }, () => 3),
    )
  })

  it('keeps Nakayama distinct from Tsunoda and fixed to Ferrari number 31', () => {
    const nakayama = initialDrivers.find(
      (driver) => driver.id === 'yuki_nakayama',
    )
    const tsunoda = initialDrivers.find(
      (driver) => driver.id === 'yuki_tsunoda',
    )

    expect(nakayama).toMatchObject({
      carNumber: 31,
      code: 'NAK',
      name: '\u4e2d\u5c71 \u88d5\u6a39',
      seatRole: 'third_car',
      teamId: 'ferrari',
    })
    expect(tsunoda?.id).not.toBe(nakayama?.id)
    expect(nakayama?.performanceSource?.overall).toBe(100)
    expect(nakayama?.potential).toBe(1)
    expect(
      Object.values(nakayama?.performanceSource?.rawRatings ?? {}).every(
        (rating) => rating === 100,
      ),
    ).toBe(true)
    expect(Object.values(nakayama?.skills ?? {}).every((skill) => skill === 1)).toBe(
      true,
    )
  })

  it('uses the common 0-100 scale without a hidden category subtraction', () => {
    const nakayama = initialDrivers.find((driver) => driver.code === 'NAK')!
    const verstappen = initialDrivers.find((driver) => driver.code === 'VER')!

    expect(driverOverallAbilityPoints(nakayama)).toBe(100)
    expect(driverConfiguredOverallAbilityPoints(nakayama)).toBe(100)
    expect(driverOverallAbilityPoints(verstappen)).toBe(99)
    expect(driverConfiguredOverallAbilityPoints(verstappen)).toBe(98)
    expect(
      initialDrivers.every(
        (driver) =>
          driver.performanceSource?.overall ===
          driverConfiguredOverallAbilityPoints(driver),
      ),
    ).toBe(true)
    expect(
      initialDrivers.every((driver) =>
        Object.values(driver.performanceSource?.rawRatings ?? {}).every(
          (rating) => rating >= 0 && rating <= 100,
        ),
      ),
    ).toBe(true)
  })

  it('loads the ten specified constructors and their machine hierarchy', () => {
    expect(initialTeams.map((team) => team.id)).toEqual([
      'mercedes',
      'ferrari',
      'mclaren',
      'red-bull-racing',
      'alpine',
      'racing-bulls',
      'haas-f1-team',
      'williams',
      'audi',
      'aston-martin',
    ])
    expect(
      initialTeams.map((team) => team.performanceSource?.overall),
    ).toEqual([96, 94, 91, 89, 82, 81, 75, 72, 69, 66])
    expect(initialTeams.some((team) => team.id === 'cadillac')).toBe(false)
    expect(initialDrivers.find((driver) => driver.code === 'OCO')?.carNumber).toBe(
      67,
    )
  })

  it('CSV-4: preserves raw ratings and uses one monotonic normalization', () => {
    const ferrari = initialTeams.find((team) => team.id === 'ferrari')!
    const astonMartin = initialTeams.find((team) => team.id === 'aston-martin')!

    expect(normalizeCsvAbility(100)).toBe(1)
    expect(normalizeCsvAbility(96)).toBe(0.96)
    expect(ferrari.performanceSource?.rawRatings['Top speed']).toBe(95)
    expect(ferrari.machine.dragEfficiency).toBe(0.95)
    expect(ferrari.machine.qualifyingPace).toBe(0.95)
    expect(ferrari.machine.racePace).toBe(0.95)
    expect(astonMartin.performanceSource?.rawRatings['Top speed']).toBe(82)
    expect(astonMartin.machine.dragEfficiency).toBe(0.82)
    expect(ferrari.machine.dragEfficiency).toBeGreaterThan(
      astonMartin.machine.dragEfficiency,
    )
  })

  it('reports missing columns with file, row, and column context', () => {
    const malformed = performanceCsv.replace('Race pace,', 'Race pace missing,')

    expect(() => loadPerformanceCsv(malformed, 'bad-performance.csv')).toThrow(
      /bad-performance\.csv row 1, column "Race pace"/u,
    )
  })

  it('rejects unknown teams instead of inventing a fallback machine', () => {
    const malformed = performanceCsv.replace(
      'yuki_nakayama,Ferrari,',
      'yuki_nakayama,Unknown Team,',
    )

    expect(() => loadPerformanceCsv(malformed, 'unknown-team.csv')).toThrow(
      /unknown-team\.csv row \d+, column "Team".*machine section/u,
    )
  })

  it('rejects duplicate IDs, codes, car numbers, and invalid ratings', () => {
    const duplicateId = performanceCsv.replace(
      'charles_leclerc,Ferrari,',
      'yuki_nakayama,Ferrari,',
    )
    const duplicateCode = performanceCsv.replace(',LEC,16,', ',NAK,16,')
    const duplicateNumber = performanceCsv.replace(',LEC,16,', ',LEC,31,')
    const invalid = performanceCsv.replace(
      /^(yuki_nakayama,[^\r\n]*?,third_car,)100,/mu,
      '$1not-a-number,',
    )

    expect(() => loadPerformanceCsv(duplicateId, 'duplicate-id.csv')).toThrow(
      /duplicate-id\.csv row \d+, column "Driver ID".*unique driver ID/u,
    )
    expect(() => loadPerformanceCsv(duplicateCode, 'duplicate-code.csv')).toThrow(
      /duplicate-code\.csv row \d+, column "Code".*unique driver code/u,
    )
    expect(() =>
      loadPerformanceCsv(duplicateNumber, 'duplicate-number.csv'),
    ).toThrow(
      /duplicate-number\.csv row \d+, column "Car Number".*unique car number/u,
    )
    expect(() => loadPerformanceCsv(invalid, 'invalid.csv')).toThrow(
      /invalid\.csv row \d+, column "Overall".*finite number/u,
    )
  })

  it('rejects incomplete 30-car fields', () => {
    const missingDriverRow = performanceCsv.replace(
      /^charles_leclerc,[^\r\n]*(?:\r?\n)/mu,
      '',
    )

    expect(() =>
      loadPerformanceCsv(missingDriverRow, 'incomplete-grid.csv'),
    ).toThrow(/incomplete-grid\.csv row 1, column "<driver count>".*30/u)
  })
})
