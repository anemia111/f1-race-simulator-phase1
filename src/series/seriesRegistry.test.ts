import { describe, expect, it } from 'vitest'
import {
  historicalDriverPool2026,
  materializeAssignedDriver,
  replaceSeriesSeat,
  type DriverPoolRecord,
} from './driverPool'
import {
  driverAssignments2026,
  driverPool2026,
  seriesPackageById,
  seriesPackages,
  seriesRegistryAudit,
} from './seriesRegistry'

function provenanceCount(pool: readonly DriverPoolRecord[]) {
  return pool.reduce(
    (count, driver) => count + driver.provenance.length,
    0,
  )
}

describe('Phase 1 series registry boundary', () => {
  it('exposes exactly F1 and SUPER FORMULA as executable packages', () => {
    expect(seriesPackages.map((series) => series.id)).toEqual([
      'f1-custom',
      'super-formula',
    ])
    expect([...seriesPackageById.keys()]).toEqual([
      'f1-custom',
      'super-formula',
    ])

    const f1 = seriesPackageById.get('f1-custom')!
    const superFormula = seriesPackageById.get('super-formula')!
    expect([f1.teamCount, f1.carCount]).toEqual([11, 22])
    expect([superFormula.teamCount, superFormula.carCount]).toEqual([16, 24])
    expect(f1.rules.overtakeSystem).toBe('active-aero')
    expect(superFormula.rules.overtakeSystem).toBe('ots')
    expect(f1.vehicleEraId).toBe('f1-2026-current')
    expect(superFormula.vehicleEraId).toBe('sf-2026')
  })

  it('has no baseLapTimeMultiplier runtime contract', () => {
    for (const series of seriesPackages) {
      expect(series.rules).not.toHaveProperty('baseLapTimeMultiplier')
    }
  })

  it('builds the canonical 110-identity, 111-provenance pool', () => {
    expect(driverPool2026).toHaveLength(110)
    expect(new Set(driverPool2026.map((driver) => driver.id)).size).toBe(110)
    expect(provenanceCount(driverPool2026)).toBe(111)
    expect(
      driverPool2026.every(
        (driver) =>
          driver.provenance.length > 0 &&
          driver.careerHistory.length > 0 &&
          driver.provenance.some(
            (source) => source.id === driver.ratingSourceProvenanceId,
          ),
      ),
    ).toBe(true)
    expect(seriesRegistryAudit).toMatchObject({
      driverPoolCount: 110,
      provenanceCount: 111,
      f2HistoricalDriverCount: 22,
      f3HistoricalDriverCount: 30,
    })
  })

  it('retains 22 F2 and 30 F3 drivers as history without live team keys', () => {
    const f2Drivers = historicalDriverPool2026.filter(
      (driver) => driver.provenance[0].sourceSeriesId === 'f2',
    )
    const f3Drivers = historicalDriverPool2026.filter(
      (driver) => driver.provenance[0].sourceSeriesId === 'f3',
    )

    expect(f2Drivers).toHaveLength(22)
    expect(f3Drivers).toHaveLength(30)

    for (const driver of historicalDriverPool2026) {
      expect(driver).not.toHaveProperty('teamId')
      expect(driver).not.toHaveProperty('carNumber')
      expect(driver.provenance).toHaveLength(1)
      expect(driver.careerHistory).toHaveLength(1)

      const source = driver.provenance[0]
      const career = driver.careerHistory[0]
      expect(source).not.toHaveProperty('teamId')
      expect(career).not.toHaveProperty('teamId')
      expect(source.sourceTeam).toEqual({
        sourceId: career.sourceTeamId,
        name: career.sourceTeamName,
      })
      expect(source.sourceCarNumber).toBe(career.sourceCarNumber)
    }
  })

  it('has no assignment pointing to a missing pool identity, package, or team', () => {
    const poolIds = new Set(driverPool2026.map((driver) => driver.id))

    expect(seriesRegistryAudit.danglingAssignmentCount).toBe(0)
    for (const assignment of driverAssignments2026) {
      const series = seriesPackageById.get(assignment.seriesId)
      expect(poolIds.has(assignment.driverId)).toBe(true)
      expect(series).toBeDefined()
      expect(
        series?.teams.some((team) => team.id === assignment.teamId),
      ).toBe(true)
      if (
        assignment.active &&
        (assignment.role === 'regular' || assignment.role === 'substitute')
      ) {
        expect(assignment.carNumber).not.toBeNull()
      }
    }
  })
})

describe('driver pool assignment into executable series', () => {
  it('can place Kush Maini into a legal F1 or SUPER FORMULA target seat', () => {
    const kush = driverPool2026.find((driver) => driver.id === 'kush_maini')!
    const sourceNumbers = new Set(
      kush.provenance.flatMap((source) =>
        source.sourceCarNumber === undefined ? [] : [source.sourceCarNumber],
      ),
    )

    for (const seriesId of ['f1-custom', 'super-formula'] as const) {
      const series = seriesPackageById.get(seriesId)!
      const target = series.drivers.find(
        (driver) => !sourceNumbers.has(driver.carNumber),
      )!
      const nextField = replaceSeriesSeat(
        series.drivers,
        target.id,
        kush,
        { seriesId, season: 2026 },
      )
      const replacement = nextField.find((driver) => driver.id === kush.id)!

      expect(nextField).toHaveLength(series.carCount)
      expect(replacement.teamId).toBe(target.teamId)
      expect(replacement.carNumber).toBe(target.carNumber)
      expect(replacement.carNumber).not.toBe(
        kush.provenance[0].sourceCarNumber,
      )
      expect(replacement.skills).toEqual(
        materializeAssignedDriver(kush, {
          seriesId,
          season: 2026,
          teamId: target.teamId,
          carNumber: target.carNumber,
          seatRole: target.seatRole,
          startOffset: target.startOffset,
          tire: target.tire,
        }).skills,
      )
    }
  })

  it('does not let source provenance alter physics-facing driver skills', () => {
    const kush = driverPool2026.find((driver) => driver.id === 'kush_maini')!
    const changedHistory = structuredClone(kush)

    for (const source of changedHistory.provenance) {
      source.sourceSeriesId = 'external'
      source.sourceTeam = {
        sourceId: 'historical-only-team',
        name: 'Historical Only Team',
      }
      source.sourceCarNumber = 999
    }
    for (const career of changedHistory.careerHistory) {
      career.seriesId = 'external'
      career.sourceTeamId = 'historical-only-team'
      career.sourceTeamName = 'Historical Only Team'
      career.sourceCarNumber = 999
    }

    const seat = {
      seriesId: 'f1-custom' as const,
      season: 2026,
      teamId: 'ferrari',
      carNumber: 44,
    }
    const originalMaterialized = materializeAssignedDriver(kush, seat)
    const changedMaterialized = materializeAssignedDriver(changedHistory, seat)

    expect(changedMaterialized.skills).toEqual(originalMaterialized.skills)
    expect(changedMaterialized.performanceSource?.rawRatings).toEqual(
      originalMaterialized.performanceSource?.rawRatings,
    )
    expect(changedMaterialized.teamId).toBe(seat.teamId)
    expect(changedMaterialized.carNumber).toBe(seat.carNumber)
  })
})

describe('SUPER FORMULA one-make boundary', () => {
  it('keeps every physical machine axis identical while operations may affect pit crew', () => {
    const superFormula = seriesPackageById.get('super-formula')!
    const referenceMachine = superFormula.teams[0].machine

    expect(superFormula.teams).toHaveLength(16)
    for (const team of superFormula.teams) {
      expect(team.machine).toEqual(referenceMachine)
    }
    expect(
      new Set(superFormula.teams.map((team) => team.pitCrewSpeed)).size,
    ).toBeGreaterThan(1)
  })
})
