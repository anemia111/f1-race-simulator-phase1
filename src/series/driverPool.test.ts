import { expandedDriverSkills } from '../data/driverProfiles'
import { describe, expect, it } from 'vitest'
import { DRIVER_ABILITY_GROUPS } from '../simulation/driverAbility'
import type { Driver } from '../types'
import {
  HISTORICAL_DRIVER_POOL_METHOD_VERSION,
  HISTORICAL_DRIVER_POOL_SOURCE_FILE,
  historicalDriverPool2026,
  historicalDriverPool2026Audit,
  materializeAssignedDriver,
  replaceSeriesSeat,
  validateDriverAssignments,
  validateDriverPool,
  validateHistoricalDriverPoolDocument,
  type DriverAssignmentValidationContext,
  type DriverPoolRecord,
} from './driverPool'

type LegacyCompactRatingInput = {
  id: string
  overall: number
  potential: number
}

const SOURCE_DATE = '2026-07-29'
const EXPECTED_F2_DRIVER_IDS = [
  'rafael_camara',
  'joshua_duerksen',
  'ritomo_miyata',
  'colton_herta',
  'noel_leon',
  'nikola_tsolov',
  'dino_beganovic',
  'roman_bilinski',
  'gabriele_mini',
  'oliver_goethe',
  'sebastian_montoya',
  'mari_boya',
  'martinius_stenshorne',
  'alexander_dunne',
  'kush_maini',
  'tasanapol_inthraphuvasak',
  'enzo_fittipaldi',
  'cian_shields',
  'nicolas_varrone',
  'rafael_villagomez',
  'laurens_van_hoepen',
  'john_bennett',
] as const
const EXPECTED_F3_DRIVER_IDS = [
  'theophile_nael',
  'ugo_ugochukwu',
  'ernesto_rivera',
  'noah_stromsted',
  'freddie_slater',
  'matteo_de_palo',
  'mattia_colnaghi',
  'tuukka_taponen',
  'alessandro_giusti',
  'taito_kato',
  'tim_tramnitz_gladysz',
  'kanato_le',
  'hiyu_yamakoshi',
  'enzo_deligny',
  'bruno_del_pino',
  'pedro_clerot',
  'brando_badoer',
  'christian_ho',
  'louis_sharp',
  'james_wharton',
  'jose_garfias',
  'woohyun_shin',
  'fionn_mclaughlin',
  'jin_nakamura',
  'ricardo_escotto',
  'yevan_david',
  'fernando_barrichello',
  'nicola_lacorte',
  'nandhavud_bhirombhakdi',
  'gerrard_xie',
] as const

function cloneRecord(driver = historicalDriverPool2026[0]): DriverPoolRecord {
  return structuredClone(driver)
}

function runtimeDriver(
  id: string,
  teamId: string,
  carNumber: number,
): Driver {
  const source = materializeAssignedDriver(historicalDriverPool2026[0], {
    seriesId: 'f1-custom',
    season: 2026,
    teamId,
    carNumber,
  })

  return {
    ...source,
    id,
    code: id.slice(0, 3).toUpperCase(),
    name: id,
    teamId,
    carNumber,
  }
}

const compactRatingKeys = [
  'adaptability',
  'consistency',
  'defending',
  'errorControl',
  'experience',
  'overtaking',
  'qualifyingPace',
  'racePace',
  'raceStart',
  'technicalFeedback',
  'tyreManagement',
  'wetSkill',
] as const

function legacyHashUnit(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

function legacyCompactRatingsFor(driver: LegacyCompactRatingInput) {
  const youthGap = Math.max(0, driver.potential - driver.overall)
  const rating = (axis: (typeof compactRatingKeys)[number], adjustment = 0) => {
    const variation = (legacyHashUnit(`${driver.id}:${axis}`) - 0.5) * 4
    return Math.min(1, Math.max(0, (driver.overall + variation + adjustment) / 100))
  }
  const ratings = {
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
  }
  const skills = expandedDriverSkills(ratings)
  const compactOverall =
    DRIVER_ABILITY_GROUPS.reduce(
      (total, group) =>
        total +
        group.stats.reduce((sum, stat) => sum + skills[stat], 0) /
          group.stats.length,
      0,
    ) / DRIVER_ABILITY_GROUPS.length
  const correction = driver.overall / 100 - compactOverall

  return Object.fromEntries(
    compactRatingKeys.map((key) => [
      key,
      Math.min(1, Math.max(0, ratings[key] + correction)),
    ]),
  )
}

describe('historical 2026 driver pool', () => {
  it('preserves all 22 F2 and 30 F3 source identities', () => {
    expect(historicalDriverPool2026Audit).toMatchObject({
      identityCount: 52,
      provenanceCount: 52,
      f2Count: 22,
      f3Count: 30,
      sourceFile: HISTORICAL_DRIVER_POOL_SOURCE_FILE,
      sourceDate: SOURCE_DATE,
      methodVersion: HISTORICAL_DRIVER_POOL_METHOD_VERSION,
      ratingSourceType: 'synthetic',
    })
    const f2Ids = historicalDriverPool2026
      .filter((driver) => driver.provenance[0].sourceSeriesId === 'f2')
      .map((driver) => driver.id)
    const f3Ids = historicalDriverPool2026
      .filter((driver) => driver.provenance[0].sourceSeriesId === 'f3')
      .map((driver) => driver.id)

    expect(f2Ids).toEqual(EXPECTED_F2_DRIVER_IDS)
    expect(f3Ids).toEqual(EXPECTED_F3_DRIVER_IDS)
    expect(new Set(historicalDriverPool2026.map((driver) => driver.id)).size).toBe(
      52,
    )
  })

  it('keeps an explicit historical snapshot without a live team foreign key', () => {
    for (const poolDriver of historicalDriverPool2026) {
      const provenance = poolDriver.provenance[0]
      const career = poolDriver.careerHistory[0]

      expect(poolDriver).not.toHaveProperty('teamId')
      expect(poolDriver).not.toHaveProperty('carNumber')
      expect(provenance).not.toHaveProperty('teamId')
      expect(provenance).toMatchObject({
        id: poolDriver.ratingSourceProvenanceId,
        sourceType: 'synthetic',
        sourceSeason: 2026,
        sourceRole: 'regular',
        sourceFile: HISTORICAL_DRIVER_POOL_SOURCE_FILE,
        sourceDate: SOURCE_DATE,
        methodVersion: HISTORICAL_DRIVER_POOL_METHOD_VERSION,
        confidence: 'low',
      })
      expect(provenance.sourceIds).toHaveLength(1)
      expect(provenance.sourceIds[0]).toContain(poolDriver.id)
      expect(poolDriver.careerHistory).toHaveLength(1)
      expect(career).not.toHaveProperty('teamId')
      expect(career).not.toHaveProperty('carNumber')
      expect(career).toEqual({
        season: 2026,
        seriesId: provenance.sourceSeriesId,
        sourceTeamId: provenance.sourceTeam?.sourceId,
        sourceTeamName: provenance.sourceTeam?.name,
        sourceCarNumber: provenance.sourceCarNumber,
        role: 'regular',
        sourceIds: provenance.sourceIds,
      })
      expect(provenance.sourceTeam?.sourceId).toBeTruthy()
      expect(provenance.sourceTeam?.name).toBeTruthy()
      expect(provenance.sourceCarNumber).toEqual(expect.any(Number))
    }
  })

  it('matches the exact compact-rating algorithm used by the current registry', () => {
    for (const poolDriver of historicalDriverPool2026) {
      expect(poolDriver.ratings).toEqual(legacyCompactRatingsFor(poolDriver))
    }
  })

  it('labels the mechanically derived document and synthetic ratings honestly', () => {
    const document = validateHistoricalDriverPoolDocument(
      structuredClone(sourceHistoricalDocument()),
    )

    expect(document.generationType).toBe('derived')
    expect(document.ratingSourceType).toBe('synthetic')
    expect(
      document.drivers.every(
        (driver) => driver.provenance[0].sourceType !== 'observed',
      ),
    ).toBe(true)

    const mislabeled = sourceHistoricalDocument()
    mislabeled.drivers[0].provenance[0].sourceType = 'observed'
    expect(() => validateHistoricalDriverPoolDocument(mislabeled)).toThrow(
      /explicit F2\/F3 source snapshot/,
    )
  })
})

function sourceHistoricalDocument() {
  return {
    schemaVersion: 1 as const,
    generationType: 'derived' as const,
    ratingSourceType: 'synthetic' as const,
    sourceFile: HISTORICAL_DRIVER_POOL_SOURCE_FILE,
    sourceDate: SOURCE_DATE,
    methodVersion: HISTORICAL_DRIVER_POOL_METHOD_VERSION,
    drivers: structuredClone(historicalDriverPool2026),
  }
}

describe('driver-pool validation', () => {
  it('supports strict aggregate count options without mutating records', () => {
    const input = structuredClone(historicalDriverPool2026)
    const before = JSON.stringify(input)

    expect(
      validateDriverPool(input, {
        expectedIdentityCount: 52,
        expectedProvenanceCount: 52,
        expectedProvenanceBySourceSeries: { f2: 22, f3: 30 },
      }),
    ).toBe(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(() =>
      validateDriverPool(input, { expectedIdentityCount: 110 }),
    ).toThrow(/expected 110 identities/)
  })

  it('rejects invalid ratings, duplicate identities, and dangling rating sources', () => {
    const invalidRating = cloneRecord()
    invalidRating.ratings.racePace = 1.21
    expect(() => validateDriverPool([invalidRating])).toThrow(/compact ratings/)

    const danglingSource = cloneRecord()
    danglingSource.ratingSourceProvenanceId = 'missing'
    expect(() => validateDriverPool([danglingSource])).toThrow(
      /does not reference this driver/,
    )

    const duplicate = cloneRecord()
    expect(() => validateDriverPool([duplicate, cloneRecord(duplicate)])).toThrow(
      /duplicate driver id/,
    )
  })

  it('rejects live seat keys and dishonest synthetic provenance', () => {
    const liveSeat = cloneRecord() as DriverPoolRecord & { teamId: string }
    liveSeat.teamId = 'f2-invicta'
    expect(() => validateDriverPool([liveSeat])).toThrow(/live seat data/)

    const missingMethod = cloneRecord()
    delete missingMethod.provenance[0].methodVersion
    expect(() => validateDriverPool([missingMethod])).toThrow(
      /synthetic ratings require methodVersion/,
    )

    const missingHistory = cloneRecord()
    missingHistory.careerHistory = [] as unknown as DriverPoolRecord['careerHistory']
    expect(() => validateDriverPool([missingHistory])).toThrow(
      /careerHistory must be nonempty/,
    )

    const liveHistoricalTeam = cloneRecord()
    const careerWithLiveTeam = liveHistoricalTeam.careerHistory[0] as unknown as {
      teamId: string
    }
    careerWithLiveTeam.teamId = 'f2-invicta'
    expect(() => validateDriverPool([liveHistoricalTeam])).toThrow(
      /careerHistory 0: identity or live seat data/,
    )
  })
})

describe('driver-pool seat materialization', () => {
  it('takes runtime team and number from the target seat', () => {
    const poolDriver = historicalDriverPool2026[0]
    const assigned = materializeAssignedDriver(poolDriver, {
      seriesId: 'f1-custom',
      season: 2026,
      teamId: 'ferrari',
      carNumber: 44,
      startOffset: -0.25,
      tire: 'S',
    })

    expect(assigned).toMatchObject({
      id: poolDriver.id,
      teamId: 'ferrari',
      carNumber: 44,
      startOffset: -0.25,
      tire: 'S',
      skills: expandedDriverSkills(poolDriver.ratings),
    })
    expect(assigned.teamId).not.toBe(poolDriver.provenance[0].sourceTeam?.sourceId)
    expect(assigned.carNumber).not.toBe(
      poolDriver.provenance[0].sourceCarNumber,
    )
  })

  it('does not let source series, team, or number affect physics-facing skills', () => {
    const original = cloneRecord()
    const changedHistory = cloneRecord(original)
    changedHistory.provenance[0].sourceSeriesId = 'external'
    changedHistory.provenance[0].sourceTeam = {
      sourceId: 'unrelated-history',
      name: 'Unrelated History',
    }
    changedHistory.provenance[0].sourceCarNumber = 999
    changedHistory.provenance[0].sourceFile = 'historical-only.json'

    const seat = {
      seriesId: 'super-formula' as const,
      season: 2026,
      teamId: 'sf-mugen',
      carNumber: 16,
    }
    expect(materializeAssignedDriver(changedHistory, seat).skills).toEqual(
      materializeAssignedDriver(original, seat).skills,
    )
  })

  it('immutably replaces a field entry while preserving the target seat', () => {
    const originalField = [
      runtimeDriver('outgoing', 'ferrari', 16),
      runtimeDriver('other', 'mercedes', 63),
    ]
    originalField[0].startOffset = -0.18
    originalField[0].tire = 'H'
    const replacement = historicalDriverPool2026[0]
    const result = replaceSeriesSeat(
      originalField,
      'outgoing',
      replacement,
      { seriesId: 'f1-custom', season: 2026 },
    )

    expect(result).not.toBe(originalField)
    expect(originalField[0].id).toBe('outgoing')
    expect(result[0]).toMatchObject({
      id: replacement.id,
      teamId: 'ferrari',
      carNumber: 16,
      startOffset: -0.18,
      tire: 'H',
    })
    expect(result[1]).toBe(originalField[1])
  })

  it('rejects missing, ambiguous, or already occupied replacement targets', () => {
    const target = runtimeDriver('outgoing', 'ferrari', 16)
    const incoming = historicalDriverPool2026[0]
    const context = { seriesId: 'f1-custom' as const, season: 2026 }

    expect(() => replaceSeriesSeat([target], 'missing', incoming, context)).toThrow(
      /missing series seat/,
    )
    expect(() =>
      replaceSeriesSeat([target, { ...target }], 'outgoing', incoming, context),
    ).toThrow(/ambiguous series seat/)
    expect(() =>
      replaceSeriesSeat(
        [target, runtimeDriver(incoming.id, 'mercedes', 63)],
        'outgoing',
        incoming,
        context,
      ),
    ).toThrow(/already occupies another series seat/)
  })
})

describe('driver assignment validation', () => {
  const pool = historicalDriverPool2026.slice(0, 3)
  const context: DriverAssignmentValidationContext = {
    driverPool: pool,
    expectedSeason: 2026,
    seriesCarCapacity: { 'f1-custom': 2, 'super-formula': 1 },
    teams: [
      { id: 'ferrari', seriesId: 'f1-custom', seatCapacity: 2 },
      { id: 'sf-mugen', seriesId: 'super-formula', seatCapacity: 1 },
    ],
  }
  const assignments = [
    {
      active: true,
      carNumber: 16,
      driverId: pool[0].id,
      role: 'regular',
      season: 2026,
      seriesId: 'f1-custom',
      teamId: 'ferrari',
    },
    {
      active: true,
      carNumber: null,
      driverId: pool[1].id,
      role: 'reserve',
      season: 2026,
      seriesId: 'f1-custom',
      teamId: 'ferrari',
    },
  ]

  it('accepts legal executable-series assignments', () => {
    expect(validateDriverAssignments(assignments, context)).toBe(assignments)
  })

  it('rejects support-series runtime assignments and missing teams', () => {
    expect(() =>
      validateDriverAssignments(
        [{ ...assignments[0], seriesId: 'f2' }],
        context,
      ),
    ).toThrow(/Invalid driver assignment 0/)
    expect(() =>
      validateDriverAssignments(
        [{ ...assignments[0], teamId: 'historical-f2-team' }],
        context,
      ),
    ).toThrow(/target team does not exist/)
  })

  it('rejects duplicate active drivers, car numbers, and excess capacity', () => {
    expect(() =>
      validateDriverAssignments(
        [assignments[0], { ...assignments[0], carNumber: 17 }],
        context,
      ),
    ).toThrow(/duplicate active driver\/series/)

    expect(() =>
      validateDriverAssignments(
        [
          assignments[0],
          {
            ...assignments[0],
            driverId: pool[1].id,
          },
        ],
        context,
      ),
    ).toThrow(/duplicate active car number/)

    expect(() =>
      validateDriverAssignments(
        [
          assignments[0],
          {
            ...assignments[0],
            driverId: pool[1].id,
            carNumber: 55,
          },
          {
            ...assignments[0],
            driverId: pool[2].id,
            carNumber: 44,
          },
        ],
        context,
      ),
    ).toThrow(/target team exceeds seat capacity/)
  })

  it('requires a car number for an active race seat', () => {
    expect(() =>
      validateDriverAssignments(
        [{ ...assignments[0], carNumber: null }],
        context,
      ),
    ).toThrow(/active race seat needs a car number/)
  })
})
