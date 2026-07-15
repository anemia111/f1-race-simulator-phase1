import { describe, expect, it } from 'vitest'
import performanceCsv from './f1Performance.csv?raw'
import {
  PERFORMANCE_CSV_FILE,
  initialDrivers,
  initialTeams,
  loadPerformanceCsv,
  normalizeCsvAbility,
  performanceCsvAudit,
} from './performanceCsv'

describe('CSV performance source of truth', () => {
  it('CSV-1/2/3: loads the audited 15-team, 30-driver field', () => {
    expect(performanceCsvAudit.fileName).toBe(PERFORMANCE_CSV_FILE)
    expect(initialTeams).toHaveLength(15)
    expect(initialDrivers).toHaveLength(30)
    expect(performanceCsvAudit.teamIds).toEqual(
      initialTeams.map((team) => team.id),
    )
    expect(performanceCsvAudit.driverIds).toEqual(
      initialDrivers.map((driver) => driver.id),
    )
    expect(performanceCsvAudit.machineColumns).toContain('ERS recovery')
    expect(performanceCsvAudit.driverColumns).toContain('ERS management')
    expect(Object.values(performanceCsvAudit.teamDriverCounts)).toEqual(
      Array.from({ length: 15 }, () => 2),
    )
  })

  it('keeps NAK source data intact while applying only car number 31', () => {
    const yuki = initialDrivers.find((driver) => driver.code === 'NAK')

    expect(yuki).toBeDefined()
    expect(yuki).toMatchObject({
      carNumber: 31,
      name: '中山裕樹',
      teamId: 'ferrari',
    })
    expect(yuki?.performanceSource?.overall).toBe(150)
    expect(yuki?.performanceSource?.rawRatings['Raw pace']).toBe(150)
    expect(yuki?.skills.rawPace).toBe(1.5)
  })

  it('CSV-4: preserves raw ratings and uses one monotonic normalization', () => {
    const ferrari = initialTeams.find((team) => team.id === 'ferrari')
    const hyundai = initialTeams.find((team) => team.id === 'hyundai')

    expect(normalizeCsvAbility(150)).toBe(1.5)
    expect(normalizeCsvAbility(96)).toBe(0.96)
    expect(ferrari?.performanceSource?.rawRatings['Top speed']).toBe(96)
    expect(ferrari?.machine.dragEfficiency).toBe(0.96)
    expect(ferrari?.machine.qualifyingPace).toBe(0.94)
    expect(ferrari?.machine.racePace).toBe(0.93)
    expect(hyundai?.performanceSource?.rawRatings['Top speed']).toBe(70)
    expect(hyundai?.machine.dragEfficiency).toBe(0.7)
    expect(ferrari!.machine.dragEfficiency).toBeGreaterThan(
      hyundai!.machine.dragEfficiency,
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
      'Ferrari,中山裕樹,NAK,31',
      'Unknown Team,中山裕樹,NAK,31',
    )

    expect(() => loadPerformanceCsv(malformed, 'unknown-team.csv')).toThrow(
      /unknown-team\.csv row 2, column "Team".*machine section/u,
    )
  })

  it('rejects duplicate driver IDs and invalid numeric ratings', () => {
    const duplicate = performanceCsv.replace(
      'Ferrari,Charles Leclerc,LEC,16',
      'Ferrari,Charles Leclerc,NAK,16',
    )
    const invalid = performanceCsv.replace(
      'Ferrari,中山裕樹,NAK,31,150.0',
      'Ferrari,中山裕樹,NAK,31,not-a-number',
    )

    expect(() => loadPerformanceCsv(duplicate, 'duplicate.csv')).toThrow(
      /duplicate\.csv row 3, column "Code".*unique driver code/u,
    )
    expect(() => loadPerformanceCsv(invalid, 'invalid.csv')).toThrow(
      /invalid\.csv row 2, column "Overall".*finite number/u,
    )
  })

  it('rejects incomplete fields and non-two-car teams', () => {
    const missingDriverRow = performanceCsv.replace(
      /Ferrari,Charles Leclerc,LEC,16[^\r\n]*(?:\r?\n)/u,
      '',
    )

    expect(() =>
      loadPerformanceCsv(missingDriverRow, 'incomplete-grid.csv'),
    ).toThrow(/incomplete-grid\.csv row 1, column "<driver count>".*30/u)
  })
})
