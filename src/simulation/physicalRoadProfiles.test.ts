import { describe, expect, it } from 'vitest'
import { measuredRoadProfiles } from '../data/measuredRoadProfiles'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { tracks } from '../data/tracks'
import { lateralBoundsForTrack } from './lateralDynamics'
import { resolvePhysicalTrack } from './physicalTrack'
import {
  MADRING_OFFICIAL_CORNER_ROAD_INPUTS,
  sourcedPhysicalRoadInputsAt,
} from './physicalRoadProfiles'

const trackById = (id: string) => tracks.find((track) => track.id === id)!

describe('source-labelled physical road profiles', () => {
  it('ships bounded public-geodata samples for all seven acquired circuits', () => {
    const expectedTrackIds = [
      'autopolis-sf',
      'fuji-sf',
      'motegi-sf',
      'silverstone-approx',
      'sugo-sf',
      'suzuka-approx',
      'zandvoort-approx',
    ]
    expect(Object.keys(measuredRoadProfiles).sort()).toEqual(expectedTrackIds)

    const trackByMeasuredId = new Map(
      [...tracks, ...supportSeriesTracks].map((track) => [track.id, track]),
    )
    for (const trackId of expectedTrackIds) {
      const profile = measuredRoadProfiles[trackId]
      const track = trackByMeasuredId.get(trackId)
      expect(track, trackId).toBeDefined()
      expect(profile.samples, trackId).toHaveLength(96)
      expect(profile.geometry.attribution, trackId).toContain(
        'OpenStreetMap contributors',
      )
      expect(profile.geometry.measuredKm, trackId).toBeGreaterThan(3.5)
      expect(profile.sampleSpacingMeters, trackId).toBeGreaterThan(30)
      expect(
        profile.samples.every(
          ([progress, elevation, grade, bank, width], index) =>
            progress === Number((index / 96).toFixed(8)) &&
            Number.isFinite(elevation) &&
            Number.isFinite(grade) &&
            Math.abs(grade) <= 0.2 &&
            (bank === null || (Math.abs(bank) >= 2 && Math.abs(bank) <= 25)) &&
            (width === null || (width >= 5 && width <= 30)),
        ),
        trackId,
      ).toBe(true)

      const resolution = resolvePhysicalTrack(track!)
      expect(resolution.status, trackId).toBe('available')
      if (resolution.status !== 'available') continue
      expect(
        resolution.track.stations.every(
          ({ elevationMeters, gradeFraction }) =>
            elevationMeters !== null &&
            Number.isFinite(elevationMeters) &&
            gradeFraction !== null &&
            Number.isFinite(gradeFraction),
        ),
        trackId,
      ).toBe(true)
      expect(
        resolution.track.stations.some(
          ({ gradeFraction }) => Math.abs(gradeFraction ?? 0) > 0.005,
        ),
        trackId,
      ).toBe(true)
    }
  })

  it('transcribes all 22 official MADRING corner records without duplicates', () => {
    expect(MADRING_OFFICIAL_CORNER_ROAD_INPUTS).toHaveLength(22)
    expect(
      new Set(
        MADRING_OFFICIAL_CORNER_ROAD_INPUTS.map(({ cornerNumber }) =>
          cornerNumber,
        ),
      ).size,
    ).toBe(22)
    expect(
      MADRING_OFFICIAL_CORNER_ROAD_INPUTS.every(
        ({ bankingPercent, lengthMeters, widthEntryMeters, widthExitMeters }) =>
          bankingPercent >= 0 &&
          bankingPercent <= 24 &&
          lengthMeters > 0 &&
          widthEntryMeters >= 11 &&
          widthExitMeters >= 11,
      ),
    ).toBe(true)
  })

  it('maps La Monumental to official Turn 12 and converts percent slope to degrees', () => {
    const madrid = trackById('madrid-approx')
    const samples = Array.from({ length: 2_000 }, (_, index) => ({
      input: sourcedPhysicalRoadInputsAt(madrid, index / 2_000),
      progress: index / 2_000,
    }))
    const maximum = samples.reduce((best, sample) =>
      Math.abs(sample.input?.bankingDegrees?.value ?? 0) >
      Math.abs(best.input?.bankingDegrees?.value ?? 0)
        ? sample
        : best,
    )

    expect(maximum.progress).toBeGreaterThan(0.35)
    expect(maximum.progress).toBeLessThan(0.55)
    expect(maximum.input?.bankingDegrees?.value).toBeCloseTo(
      Math.atan(0.24) * (180 / Math.PI),
      8,
    )
    expect(maximum.input?.bankingDegrees?.provenance).toMatchObject({
      method: 'corner-marker-mapped-profile',
      source: 'derived',
      sourceUrl: 'https://www.madring.com/en/circuit',
    })
  })

  it('retains official MADRING width variation and signed grades', () => {
    const madrid = trackById('madrid-approx')
    const samples = Array.from({ length: 2_000 }, (_, index) => ({
      input: sourcedPhysicalRoadInputsAt(madrid, index / 2_000),
      progress: index / 2_000,
    }))
    const inputs = samples
      .map(({ input }) => input)
      .filter((input) => input !== null)
    const widthSamples = samples.flatMap(({ input, progress }) =>
      input?.usableWidthMeters
        ? [{ progress, value: input.usableWidthMeters.value }]
        : [],
    )
    const widths = widthSamples.map(({ value }) => value)
    const grades = new Set(
      inputs.flatMap((input) =>
        input.gradeFraction ? [input.gradeFraction.value] : [],
      ),
    )
    const banks = inputs.flatMap((input) =>
      input.bankingDegrees ? [input.bankingDegrees.value] : [],
    )

    expect(Math.min(...widths)).toBeLessThan(11.1)
    expect(Math.max(...widths)).toBe(25)
    expect(grades).toContain(0.08)
    expect(grades).toContain(-0.05)
    expect(banks.some((value) => value < 0)).toBe(true)

    const narrowest = widthSamples.reduce((best, sample) =>
      sample.value < best.value ? sample : best,
    )
    const widest = widthSamples.reduce((best, sample) =>
      sample.value > best.value ? sample : best,
    )
    expect(
      lateralBoundsForTrack(madrid, {
        trackProgress: widest.progress,
      }).maxOffsetM,
    ).toBeGreaterThan(
      lateralBoundsForTrack(madrid, {
        trackProgress: narrowest.progress,
      }).maxOffsetM,
    )
  })

  it('publishes partial elevation, grade, banking and width on metric stations', () => {
    const resolution = resolvePhysicalTrack(trackById('madrid-approx'))
    if (resolution.status !== 'available') {
      throw new Error('Expected the official MADRING layout to resolve')
    }

    expect(resolution.track.version).toBe(3)
    expect(resolution.track.fieldProvenance.usableWidthMeters).toMatchObject({
      method: 'corner-marker-mapped-profile',
      source: 'derived',
    })
    expect(resolution.track.fieldProvenance.grade).toMatchObject({
      method: 'official-gradient-section',
      source: 'derived',
    })
    expect(
      resolution.track.stations.some(
        ({ elevationMeters }) => elevationMeters !== null,
      ),
    ).toBe(true)
    expect(
      resolution.track.stations.some(
        ({ gradeFraction }) => gradeFraction === 0.08,
      ),
    ).toBe(true)
    expect(
      resolution.track.stations.some(
        ({ usableWidthMeters }) => usableWidthMeters === 25,
      ),
    ).toBe(true)
  })

  it('combines official Zandvoort banks with public elevation and mapped width', () => {
    const zandvoort = trackById('zandvoort-approx')
    const resolution = resolvePhysicalTrack(zandvoort)
    if (resolution.status !== 'available') {
      throw new Error('Expected Zandvoort to resolve')
    }

    const bankValues = new Set(
      resolution.track.stations.flatMap(({ bankingDegrees }) =>
        bankingDegrees === null ? [] : [bankingDegrees],
      ),
    )
    expect(bankValues).toContain(18)
    expect(bankValues).toContain(19)
    expect(
      [...bankValues].some((value) => value > 2 && value < 10),
    ).toBe(true)
    expect(resolution.track.fieldProvenance.bankingDegrees).toMatchObject({
      confidence: 'low',
      method: 'source-priority-composite',
      source: 'derived',
    })
    expect(resolution.track.fieldProvenance.elevationMeters).toMatchObject({
      method: 'public-elevation-grid-interpolation',
      source: 'observed',
    })
    expect(resolution.track.fieldProvenance.grade).toMatchObject({
      method: 'public-elevation-grid-gradient',
      source: 'derived',
    })
    expect(resolution.track.fieldProvenance.usableWidthMeters).toMatchObject({
      method: 'osm-width-tag-interpolation',
      source: 'observed',
    })
    expect(
      resolution.track.stations.every(
        ({ elevationMeters, gradeFraction, usableWidthMeters }) =>
          elevationMeters !== null &&
          gradeFraction !== null &&
          usableWidthMeters === 10,
      ),
    ).toBe(true)
  })
})
