import { describe, expect, it } from 'vitest'
import type {
  DriverPoolProvenance,
  DriverPoolRecord,
} from './driverPool'
import type { DriverSourceSeriesId } from './seriesIds'
import {
  DRIVER_POOL_SCHEMA_VERSION,
  createPersistedDriverPool,
  parseDriverPool,
  serializeDriverPool,
} from './driverPoolPersistence'

const ratings = {
  adaptability: 0.8,
  consistency: 0.8,
  defending: 0.8,
  errorControl: 0.8,
  experience: 0.8,
  overtaking: 0.8,
  qualifyingPace: 0.8,
  racePace: 0.8,
  raceStart: 0.8,
  technicalFeedback: 0.8,
  tyreManagement: 0.8,
  wetSkill: 0.8,
}

function provenanceFor(
  id: string,
  sourceSeriesId: DriverSourceSeriesId,
): DriverPoolProvenance {
  return {
    confidence: 'medium',
    id,
    sourceDate: '2026-08-08',
    sourceFile: 'driver-pool-test-fixture.json',
    sourceIds: [`fixture:${id}`],
    sourceSeason: 2026,
    sourceSeriesId,
    sourceType: 'editorial',
  }
}

function driverFor(
  index: number,
  sourceSeriesId: DriverSourceSeriesId = 'external',
): DriverPoolRecord {
  const provenance = provenanceFor(`provenance-${index}`, sourceSeriesId)

  return {
    careerHistory: [
      {
        role: 'regular',
        season: 2026,
        seriesId: sourceSeriesId,
        sourceIds: [`fixture:career-${index}`],
      },
    ],
    code: `D${index.toString().padStart(3, '0')}`,
    id: `driver-${index}`,
    name: `Driver ${index}`,
    nationality: 'JPN',
    overall: 80,
    potential: 90,
    provenance: [provenance],
    ratingSourceProvenanceId: provenance.id,
    ratings: { ...ratings },
  }
}

function canonicalPoolFixture() {
  const records = Array.from({ length: 110 }, (_, index) =>
    driverFor(
      index,
      index < 22
        ? 'f2'
        : index < 52
          ? 'f3'
          : index < 80
            ? 'f1-custom'
            : 'super-formula',
    ),
  )
  records.at(-1)!.provenance.push(
    provenanceFor('provenance-109-external', 'external'),
  )

  return records
}

describe('driver pool persistence', () => {
  it('round-trips every identity, rating and provenance field', () => {
    const record = driverFor(1, 'f2')
    record.provenance.push({
      ...provenanceFor('provenance-1-secondary', 'external'),
      confidence: 'high',
      methodVersion: 'test-v2',
      sourceCarNumber: 12,
      sourceRole: 'reserve',
      sourceTeam: { name: 'Historical Team', sourceId: 'historical-team' },
    })
    record.careerHistory.push({
      role: 'reserve',
      season: 2025,
      seriesId: 'external',
      sourceCarNumber: 12,
      sourceIds: ['fixture:career-secondary'],
      sourceTeamId: 'historical-team',
      sourceTeamName: 'Historical Team',
    })

    const serialized = serializeDriverPool([record], '2026-08-08')
    const parsed = parseDriverPool(serialized)

    expect(parsed.status).toBe('ready')
    if (parsed.status !== 'ready') return

    expect(parsed.schemaVersion).toBe(DRIVER_POOL_SCHEMA_VERSION)
    expect(parsed.sourceManifestVersion).toBe('2026-08-08')
    expect(parsed.records).toEqual([record])
    expect(parsed.records[0]).not.toBe(record)
    expect(parsed.records[0].ratings).not.toBe(record.ratings)
    expect(parsed.records[0].careerHistory).not.toBe(record.careerHistory)
    expect(parsed.records[0].careerHistory[1].sourceIds).not.toBe(
      record.careerHistory[1].sourceIds,
    )
    expect(parsed.records[0].provenance).not.toBe(record.provenance)
    expect(parsed.records[0].provenance[1].sourceTeam).not.toBe(
      record.provenance[1].sourceTeam,
    )
  })

  it('creates a versioned, independently cloned persistence object', () => {
    const record = driverFor(2, 'f3')
    const persisted = createPersistedDriverPool([record], 'manifest-sha-123')

    expect(persisted).toEqual({
      drivers: [record],
      schemaVersion: 1,
      sourceManifestVersion: 'manifest-sha-123',
    })

    persisted.drivers[0].ratings.racePace = 0.5
    expect(record.ratings.racePace).toBe(0.8)
  })

  it('distinguishes missing, incompatible and corrupt payloads', () => {
    expect(parseDriverPool(null)).toEqual({ status: 'missing' })
    expect(parseDriverPool('{bad json').status).toBe('corrupt')
    expect(parseDriverPool({ drivers: [] }).status).toBe('corrupt')
    expect(
      parseDriverPool({
        drivers: [],
        schemaVersion: '1',
        sourceManifestVersion: 'wrong-version-type',
      }).status,
    ).toBe('corrupt')
    expect(
      parseDriverPool({
        drivers: [],
        schemaVersion: 2,
        sourceManifestVersion: 'future',
      }),
    ).toEqual({ schemaVersion: 2, status: 'incompatible' })
  })

  it('does not replace a removed-series payload with a default pool', () => {
    const result = parseDriverPool(
      JSON.stringify({
        schemaVersion: 1,
        series: [{ drivers: [], id: 'f2' }],
        sourceManifestVersion: 'legacy-series-save',
      }),
    )

    expect(result.status).toBe('corrupt')
    expect(result).not.toHaveProperty('records')
  })

  it('rejects bad rating bounds and incomplete provenance relations', () => {
    const badRating = driverFor(3)
    badRating.ratings.wetSkill = 2
    expect(
      parseDriverPool(
        createUncheckedPayload([badRating]),
      ).status,
    ).toBe('corrupt')

    const noProvenance = driverFor(4)
    noProvenance.provenance = [] as unknown as DriverPoolRecord['provenance']
    expect(
      parseDriverPool(
        createUncheckedPayload([noProvenance]),
      ).status,
    ).toBe('corrupt')

    const danglingCanonicalSource = driverFor(5)
    danglingCanonicalSource.ratingSourceProvenanceId = 'missing-source'
    expect(
      parseDriverPool(
        createUncheckedPayload([danglingCanonicalSource]),
      ).status,
    ).toBe('corrupt')

    const noCareerHistory = driverFor(8)
    noCareerHistory.careerHistory = [] as unknown as DriverPoolRecord['careerHistory']
    expect(
      parseDriverPool(
        createUncheckedPayload([noCareerHistory]),
      ).status,
    ).toBe('corrupt')
  })

  it('enforces exact canonical totals only when requested', () => {
    const single = createUncheckedPayload([driverFor(6)])
    expect(parseDriverPool(single).status).toBe('ready')
    expect(
      parseDriverPool(single, { strictCanonical: true }).status,
    ).toBe('corrupt')

    const canonical = canonicalPoolFixture()
    expect(
      parseDriverPool(createUncheckedPayload(canonical), {
        strictCanonical: true,
      }).status,
    ).toBe('ready')
  })

  it('checks canonical provenance totals and exact F2/F3 source counts', () => {
    const duplicateIdentity = canonicalPoolFixture()
    duplicateIdentity[109].id = duplicateIdentity[108].id
    expect(
      parseDriverPool(createUncheckedPayload(duplicateIdentity), {
        strictCanonical: true,
      }).status,
    ).toBe('corrupt')

    const wrongTotal = canonicalPoolFixture()
    wrongTotal.at(-1)!.provenance.pop()
    expect(
      parseDriverPool(createUncheckedPayload(wrongTotal), {
        strictCanonical: true,
      }).status,
    ).toBe('corrupt')

    const wrongF2 = canonicalPoolFixture()
    wrongF2[0].provenance[0].sourceSeriesId = 'external'
    expect(
      parseDriverPool(createUncheckedPayload(wrongF2), {
        strictCanonical: true,
      }).status,
    ).toBe('corrupt')

    const wrongF3 = canonicalPoolFixture()
    wrongF3[22].provenance[0].sourceSeriesId = 'external'
    expect(
      parseDriverPool(createUncheckedPayload(wrongF3), {
        strictCanonical: true,
      }).status,
    ).toBe('corrupt')
  })

  it('rejects an invalid source manifest version', () => {
    expect(() => createPersistedDriverPool([driverFor(7)], ' ')).toThrow(
      /sourceManifestVersion/,
    )
    expect(
      parseDriverPool({
        drivers: [driverFor(7)],
        schemaVersion: 1,
        sourceManifestVersion: '',
      }).status,
    ).toBe('corrupt')
  })
})

function createUncheckedPayload(records: DriverPoolRecord[]) {
  return {
    drivers: records,
    schemaVersion: 1,
    sourceManifestVersion: 'test-manifest',
  }
}
