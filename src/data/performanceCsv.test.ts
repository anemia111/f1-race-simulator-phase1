import { describe, expect, it } from 'vitest'
import performanceCsv from './f1Performance.csv?raw'
import { f1PitCrewSpeedForTeam } from './f1PitCrewCalibration'
import {
  DRIVER_ABILITY_LIMIT_BREAK_MAX,
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
  reserveDrivers,
} from './performanceCsv'

describe('CSV performance source of truth', () => {
  it('CSV-1/2/3: loads the specified 11-team, 22-car field', () => {
    expect(performanceCsvAudit.fileName).toBe(PERFORMANCE_CSV_FILE)
    expect(initialTeams).toHaveLength(11)
    expect(initialDrivers).toHaveLength(22)
    expect(performanceCsvAudit.teamIds).toEqual(
      initialTeams.map((team) => team.id),
    )
    expect(performanceCsvAudit.driverIds).toEqual(
      initialDrivers.map((driver) => driver.id),
    )
    expect(performanceCsvAudit.machineColumns).toContain('ERS recovery')
    expect(performanceCsvAudit.driverColumns).toContain('Technical feedback')
    expect(Object.values(performanceCsvAudit.teamDriverCounts)).toEqual(
      Array.from({ length: 11 }, () => 2),
    )
  })

  it('keeps reserves out of the field while retaining their authored axes', () => {
    expect(reserveDrivers.length).toBeGreaterThan(0)
    expect(performanceCsvAudit.reserveIds).toEqual(
      reserveDrivers.map((driver) => driver.id),
    )

    for (const reserve of reserveDrivers) {
      expect(reserve.seatRole).toBe('reserve')
      expect(initialDrivers.some((driver) => driver.id === reserve.id)).toBe(
        false,
      )
      expect(
        reserve.performanceSource?.rawRatings['Qualifying pace'],
      ).toBeGreaterThan(0)
    }
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
      seatRole: 'regular',
      teamId: 'ferrari',
    })
    expect(tsunoda?.id).not.toBe(nakayama?.id)
    // 中山裕樹 is the one profile deliberately placed past the published
    // scale; see DRIVER_ABILITY_LIMIT_BREAK_MAX. Every other driver stays
    // within 0-100, which the scale test below still checks.
    expect(nakayama?.performanceSource?.overall).toBe(120)
    expect(nakayama?.potential).toBe(1.2)
    expect(
      Object.values(nakayama?.performanceSource?.rawRatings ?? {}).every(
        (rating) => rating === 120,
      ),
    ).toBe(true)
    expect(
      Object.values(nakayama?.skills ?? {}).every((skill) => skill === 1.2),
    ).toBe(true)
  })

  it('uses the common 0-100 scale without a hidden category subtraction', () => {
    const nakayama = initialDrivers.find((driver) => driver.code === 'NAK')!
    const verstappen = initialDrivers.find((driver) => driver.code === 'VER')!

    // 中山裕樹 is deliberately placed past the published scale; see
    // DRIVER_ABILITY_LIMIT_BREAK_MAX. Everyone else stays on 0-100.
    expect(driverOverallAbilityPoints(nakayama)).toBe(120)
    expect(driverConfiguredOverallAbilityPoints(nakayama)).toBe(120)
    expect(driverOverallAbilityPoints(verstappen)).toBe(95)
    expect(driverConfiguredOverallAbilityPoints(verstappen)).toBe(95)
    expect(
      initialDrivers.every(
        (driver) =>
          driver.performanceSource?.overall ===
          driverConfiguredOverallAbilityPoints(driver),
      ),
    ).toBe(true)
    // The scale still holds for the field. Exactly one profile is authored
    // past it, and even that one is bounded by the limit-break ceiling, so a
    // typo cannot ride in behind the exception.
    const beyondScale = initialDrivers.filter((driver) =>
      Object.values(driver.performanceSource?.rawRatings ?? {}).some(
        (rating) => rating > 100,
      ),
    )

    expect(beyondScale.map((driver) => driver.id)).toEqual(['yuki_nakayama'])
    expect(
      initialDrivers.every((driver) =>
        Object.values(driver.performanceSource?.rawRatings ?? {}).every(
          (rating) =>
            rating >= 0 && rating <= DRIVER_ABILITY_LIMIT_BREAK_MAX,
        ),
      ),
    ).toBe(true)
  })

  it('matches the authored 2026 F1 driver hierarchy in source and simulation', () => {
    const expected = {
      alexander_albon: 86,
      arvid_lindblad: 82,
      carlos_sainz: 88,
      charles_leclerc: 92,
      esteban_ocon: 84,
      fernando_alonso: 89,
      franco_colapinto: 81,
      gabriel_bortoleto: 83,
      george_russell: 91,
      isack_hadjar: 85,
      kimi_antonelli: 88,
      lance_stroll: 80,
      lando_norris: 92,
      lewis_hamilton: 89,
      liam_lawson: 81,
      max_verstappen: 95,
      nico_hulkenberg: 85,
      oliver_bearman: 83,
      oscar_piastri: 90,
      pierre_gasly: 86,
      sergio_perez: 82,
      valtteri_bottas: 83,
      yuki_tsunoda: 84,
    }
    const driversById = new Map(
      [...initialDrivers, ...reserveDrivers].map((driver) => [
        driver.id,
        driver,
      ]),
    )

    for (const [id, overall] of Object.entries(expected)) {
      const driver = driversById.get(id)
      expect(driver, id).toBeDefined()
      expect(driverConfiguredOverallAbilityPoints(driver!), id).toBe(overall)
      expect(driverOverallAbilityPoints(driver!), id).toBe(overall)
    }
  })

  it('loads the eleven specified constructors and their machine hierarchy', () => {
    expect(initialTeams.map((team) => team.id)).toEqual([
      'mercedes',
      'ferrari',
      'mclaren',
      'red-bull-racing',
      'racing-bulls',
      'alpine',
      'audi',
      'haas-f1-team',
      'williams',
      'aston-martin',
      'cadillac',
    ])
    expect(
      initialTeams.map((team) => team.performanceSource?.overall),
    ).toEqual([97, 94, 92, 90, 84, 82, 79, 77, 74, 71, 68])
    expect(initialTeams.some((team) => team.id === 'cadillac')).toBe(true)
    expect(initialDrivers.find((driver) => driver.code === 'OCO')?.carNumber).toBe(
      67,
    )
  })

  it('calibrates pit crews by team instead of giving every team one value', () => {
    const pitCrewByTeam = Object.fromEntries(
      initialTeams.map((team) => [team.name, team.pitCrewSpeed]),
    )

    expect(new Set(Object.values(pitCrewByTeam)).size).toBeGreaterThan(5)
    expect(pitCrewByTeam.Ferrari).toBeGreaterThan(
      pitCrewByTeam['Aston Martin'],
    )
    // Every team carries the rating its own observation produces. This used
    // to be a bare 0.75 to 0.97 band, which described the compressed spread of
    // the award-derived ratings rather than anything about a pit crew, and it
    // rejected the measured ones.
    for (const [name, rating] of Object.entries(pitCrewByTeam)) {
      expect(rating).toBe(f1PitCrewSpeedForTeam(name))
      // 1 is a crew whose normal stop is the modelled floor, so nothing may
      // exceed it; the scale has no meaning at or below 0.
      expect(rating).toBeGreaterThan(0)
      expect(rating).toBeLessThanOrEqual(1)
    }
  })

  it('CSV-4: preserves raw ratings and uses one monotonic normalization', () => {
    const ferrari = initialTeams.find((team) => team.id === 'ferrari')!
    const astonMartin = initialTeams.find((team) => team.id === 'aston-martin')!

    expect(normalizeCsvAbility(100)).toBe(1)
    expect(normalizeCsvAbility(96)).toBe(0.96)
    expect(ferrari.performanceSource?.rawRatings['Top speed']).toBe(91)
    expect(ferrari.machine.dragEfficiency).toBe(0.91)
    expect(ferrari.machine.qualifyingPace).toBe(0.95)
    expect(ferrari.machine.racePace).toBe(0.95)
    expect(astonMartin.performanceSource?.rawRatings['Top speed']).toBe(86)
    expect(astonMartin.machine.dragEfficiency).toBe(0.86)
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
      'charles_leclerc,Aston Martin,',
      'yuki_nakayama,Aston Martin,',
    )
    const duplicateCode = performanceCsv.replace(',LEC,16,', ',NAK,16,')
    const duplicateNumber = performanceCsv.replace(',LEC,16,', ',LEC,31,')
    const invalid = performanceCsv.replace(
      /^(yuki_nakayama,[^\r\n]*?,regular,)\d+,/mu,
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

  it('rejects a team left short of its two fielded seats', () => {
    const missingDriverRow = performanceCsv.replace(
      /^charles_leclerc,[^\r\n]*(?:\r?\n)/mu,
      '',
    )

    expect(() =>
      loadPerformanceCsv(missingDriverRow, 'incomplete-grid.csv'),
    ).toThrow(/incomplete-grid\.csv row \d+, column "Team".*2 fielded drivers/u)
  })

  it('rejects a field that cannot fill the grid at all', () => {
    const lines = performanceCsv.split(/\r?\n/u)
    const sectionIndex = lines.findIndex((line) =>
      line.startsWith('TEAM MACHINE ABILITIES'),
    )
    // Header, five driver rows, then the untouched machine section.
    const truncated = [
      lines[0],
      ...lines.slice(1, 6),
      ...lines.slice(sectionIndex - 1),
    ].join('\n')

    expect(() => loadPerformanceCsv(truncated, 'tiny-grid.csv')).toThrow(
      /tiny-grid\.csv row 1, column "<driver count>".*at least 22 driver rows/u,
    )
  })
})
