import { describe, expect, it } from 'vitest'
import {
  f1PaceCalibration2026,
  superFormulaPaceCalibration2026,
} from '../data/paceCalibration'
import {
  simulationBaseLapTimeForPaceReference,
} from '../data/paceReferences2026'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { runKnockoutQualifying } from './qualifying'

describe('2026 pace references', () => {
  it('stores fixed-seed qualifying acceptance for every calibrated circuit', () => {
    const records = [
      ...f1PaceCalibration2026,
      ...superFormulaPaceCalibration2026,
    ]

    // 22 calendar events plus four category x course baselines for the Super
    // Formula circuits Free Mode can run in the F1 category.
    expect(f1PaceCalibration2026).toHaveLength(26)
    expect(superFormulaPaceCalibration2026).toHaveLength(5)
    expect(
      records.every(
        (record) =>
          record.simulation.validation?.qualifyingSeedCount === 100 &&
          Math.abs(
            record.simulation.validation
              .qualifyingReferenceErrorSeconds,
          ) <= 0.3,
      ),
    ).toBe(true)
  })

  it('matches observed poles and Q1 field spread without collapsing the field', () => {
    const observed = f1PaceCalibration2026.filter(
      (record) =>
        record.qualifying.status === 'official' &&
        record.qualifying.poleSeconds !== null &&
        record.qualifying.fieldMedianDeltaSeconds !== null,
    )

    expect(observed.length).toBeGreaterThanOrEqual(10)

    for (const record of observed) {
      const validation = record.simulation.validation!

      expect(
        Math.abs(
          validation.poleMedianSeconds -
            record.qualifying.poleSeconds!,
        ),
      ).toBeLessThanOrEqual(0.351)
      expect(
        Math.abs(
          validation.fieldMedianDeltaSeconds -
            record.qualifying.fieldMedianDeltaSeconds!,
        ),
      ).toBeLessThanOrEqual(0.6)
      expect(validation.fieldMedianDeltaSeconds).toBeGreaterThan(0.25)
    }
  })

  it('keeps 100-seed clean race validation separate from event average', () => {
    const observed = f1PaceCalibration2026.filter(
      (record) => record.race.status === 'observed',
    )

    expect(observed).toHaveLength(10)

    for (const record of observed) {
      const validation = record.simulation.validation!

      expect(validation.raceSeedCount).toBe(100)
      expect(
        Math.abs(validation.raceReferenceErrorSeconds ?? Infinity),
      ).toBeLessThanOrEqual(0.7)
      expect(record.race.cleanLapCount).toBeGreaterThanOrEqual(30)
    }
  })

  it('does not use winner average as Monaco green-lap pace', () => {
    const monaco = f1PaceCalibration2026.find(
      (record) => record.trackId === 'monaco-approx',
    )!

    expect(monaco.race.cleanLapReferenceSeconds).not.toBeNull()
    expect(monaco.race.winnerAverageSeconds).not.toBeNull()
    expect(
      monaco.race.winnerAverageSeconds! -
        monaco.race.cleanLapReferenceSeconds!,
    ).toBeGreaterThan(20)
    expect(
      monaco.simulation.expectedGreenRaceDeltaSeconds,
    ).toBeLessThan(10)
  })

  it('keeps F1 and SUPER FORMULA Suzuka calibration independent', () => {
    const f1 = f1PaceCalibration2026.find(
      (record) => record.trackId === 'suzuka-approx',
    )!
    const sf = superFormulaPaceCalibration2026.find(
      (record) => record.trackId === 'suzuka-approx',
    )!

    expect(sf.qualifying.selectedReferenceSeconds).toBeGreaterThan(
      f1.qualifying.selectedReferenceSeconds,
    )
    expect(sf.simulation.neutralBaseLapSeconds).not.toBe(
      f1.simulation.neutralBaseLapSeconds,
    )
    expect(sf.simulation.qualifyingOffsetSeconds).not.toBeCloseTo(
      f1.simulation.qualifyingOffsetSeconds,
      2,
    )
  })

  it('labels future estimates and MADRING uncertainty honestly', () => {
    // Course references are a different species of estimate: the category has
    // never raced there, so no OpenF1 history of its own exists. They are
    // covered by their own expectation below.
    const future = f1PaceCalibration2026.filter(
      (record) =>
        record.qualifying.status === 'estimated' && !record.courseReference,
    )
    const madrid = future.find(
      (record) => record.trackId === 'madrid-approx',
    )!

    expect(future.length).toBeGreaterThan(0)
    expect(future.every((record) => record.qualifying.poleSeconds === null)).toBe(
      true,
    )
    expect(madrid.qualifying.referenceRangeSeconds).toEqual([90, 94])
    expect(madrid.qualifying.confidence).toBeLessThan(0.5)

    const comparableFuture = future.filter(
      (record) => record.trackId !== 'madrid-approx',
    )

    expect(
      comparableFuture.every(
        (record) =>
          record.qualifying.referenceRangeSeconds !== undefined &&
          record.sources.some(
            (source) =>
              source.provider === 'OpenF1' &&
              source.label.includes('historical forecast input'),
          ),
      ),
    ).toBe(true)
  })

  it('labels category x course baselines as estimates with a cross-category source', () => {
    const courseReferences = f1PaceCalibration2026.filter(
      (record) => record.courseReference,
    )

    expect(courseReferences.map((record) => record.trackId).sort()).toEqual([
      'autopolis-sf',
      'fuji-sf',
      'motegi-sf',
      'sugo-sf',
    ])

    for (const record of courseReferences) {
      // No F1 timing exists at these circuits, so nothing may be presented as
      // observed: no pole, an explicit range, low confidence, and the Super
      // Formula reference for the same course as the cross-check.
      expect(record.qualifying.status).toBe('estimated')
      expect(record.qualifying.poleSeconds).toBeNull()
      expect(record.qualifying.referenceRangeSeconds).toBeDefined()
      expect(record.qualifying.confidence).toBeLessThan(0.5)
      expect(record.race.status).toBe('estimated')
      expect(record.race.confidence).toBeLessThan(0.5)
      expect(
        record.sources.some((source) => source.provider === 'SUPER FORMULA'),
      ).toBe(true)
      expect(
        record.notes?.some((note) => note.includes('SUPER FORMULA')),
      ).toBe(true)
      // The legacy additive correction must stay retired on these too.
      expect(record.simulation.raceModelCorrectionSeconds).toBe(0)
    }
  })

  it('retains the official Autopolis qualifying result without inventing a cancelled race', () => {
    const autopolis = superFormulaPaceCalibration2026.find(
      (record) => record.trackId === 'autopolis-sf',
    )!

    expect(autopolis.qualifying.status).toBe('official')
    expect(autopolis.qualifying.poleSeconds).toBe(85.866)
    expect(autopolis.qualifying.selectedReferenceSeconds).toBe(86.139)
    expect(autopolis.race.status).toBe('unverified')
    expect(autopolis.race.cleanLapReferenceSeconds).toBeNull()
    expect(
      autopolis.sources.some((source) =>
        source.url.includes('/release/27021/'),
      ),
    ).toBe(true)
  })

  it('uses an event-specific neutral base instead of the legacy multiplier', () => {
    const legacyMatches = f1PaceCalibration2026.filter(
      (record) =>
        Math.abs(
          record.simulation.neutralBaseLapSeconds -
            record.qualifying.selectedReferenceSeconds * 1.046,
        ) < 0.01,
    )
    const offsets = new Set(
      f1PaceCalibration2026.map((record) =>
        record.simulation.qualifyingOffsetSeconds.toFixed(3),
      ),
    )

    expect(legacyMatches).toHaveLength(0)
    expect(offsets.size).toBeGreaterThan(12)
  })

  it('falls back safely when no calibration exists', () => {
    expect(
      simulationBaseLapTimeForPaceReference(undefined, 91.234),
    ).toBe(91.234)
  })

  it('keeps fixed-seed qualifying exactly reproducible for both series', () => {
    const f1Track = tracks.find(
      (track) => track.id === 'albert-park-approx',
    )!
    const f1Config = {
      drivers: initialDrivers,
      seed: 'pace-reproducibility-f1',
      seriesId: 'f1-custom' as const,
      teams: initialTeams,
      track: { ...f1Track, rainProbability: 0 },
    }
    const sf = seriesPackageById.get('super-formula')!
    const sfTrack = sf.tracks.find(
      (track) => track.id === 'suzuka-approx',
    )!
    const sfConfig = {
      drivers: sf.drivers,
      seed: 'pace-reproducibility-sf',
      seriesId: 'super-formula' as const,
      teams: sf.teams,
      track: { ...sfTrack, rainProbability: 0 },
    }

    expect(runKnockoutQualifying(f1Config)).toEqual(
      runKnockoutQualifying(f1Config),
    )
    expect(runKnockoutQualifying(sfConfig)).toEqual(
      runKnockoutQualifying(sfConfig),
    )
  })

  it('produces qualifying lap times that baseLapTime cannot move', () => {
    // `timedPhysicalLap` says baseLapTime is deliberately absent from the
    // force-derived lap. Until this test existed that was only a comment, and
    // the pace calibration script was adjusting baseLapTime by the qualifying
    // error every iteration - moving a number that could not affect the
    // quantity it was measuring, so it never converged and each pass added the
    // same error again.
    const track = tracks.find((entry) => entry.id === 'suzuka-approx')!
    const lapTimesFor = (baseLapTime: number) =>
      runKnockoutQualifying({
        drivers: initialDrivers,
        seed: 'base-lap-time-independence',
        seriesId: 'f1-custom' as const,
        teams: initialTeams,
        track: { ...track, baseLapTime, rainProbability: 0 },
      }).classification.map((entry) => entry.lapTimeSeconds)

    expect(lapTimesFor(60)).toEqual(lapTimesFor(track.baseLapTime))
    expect(lapTimesFor(120)).toEqual(lapTimesFor(track.baseLapTime))
  })
})
