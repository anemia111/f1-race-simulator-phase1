import { describe, expect, it } from 'vitest'
import { importedDriverRatings, importedDriverRatingById } from './importedDriverRatings'
import { driverPool2026, originalDriverPool2026 } from './seriesRegistry'
import { materializeAssignedDriver } from './driverPool'
import { driverHistorySearchTerms } from '../components/FreeModeBuilder'

describe('user-authored cross-category driver import', () => {
  it('retains all 338 source rows, raw axes, nullable potential and identity uniqueness', () => {
    expect(importedDriverRatings.drivers).toHaveLength(338)
    expect(importedDriverRatingById.size).toBe(338)
    expect(importedDriverRatings.drivers.filter((row) => row.potential === null)).toHaveLength(337)
    for (const row of importedDriverRatings.drivers) {
      expect(row.overall).toBe(Number(row.raw.WORLD_OVR))
      expect(row.ratings.racePace).toBe(Number(row.raw['Race pace']) / 100)
      expect(driverPool2026.some((driver) => driver.id === row.id)).toBe(true)
    }
  })

  it('preserves every original authored ability and uses CSV axes for new people', () => {
    for (const driver of originalDriverPool2026) {
      const actual = driverPool2026.find((candidate) => candidate.id === driver.id)!
      expect(actual.ratings).toEqual(driver.ratings)
      expect(actual.overall).toBe(driver.overall)
      expect(actual.potential).toBe(driver.potential)
    }
    const source = importedDriverRatings.drivers.find((row) => row.name === 'Riona Tomishita')!
    const driver = driverPool2026.find((candidate) => candidate.id === source.id)!
    expect(driver.overall).toBe(77)
    expect(driver.ratings).toEqual(source.ratings)
    expect(driver.potential).toBe(77)
    expect(source.potential).toBeNull()
    const seated = materializeAssignedDriver(driver, {
      seriesId: 'super-formula', season: 2026, teamId: 'test-seat', carNumber: 39,
    })
    expect(seated.skills.racePace).toBe(0.78)
    expect(seated.performanceSource?.fileName).toBe(importedDriverRatings.sourceFile)
    expect(driverHistorySearchTerms(driver)).toContain('KYOJO CUP history')
  })

  it('merges reviewed spellings without changing existing IDs or inventing affiliations', () => {
    expect(importedDriverRatingById.get('juju_noda')?.name).toBe('Juju Noda')
    expect(importedDriverRatingById.get('joshua_duerksen')?.name).toBe('Joshua Dürksen')
    expect(importedDriverRatingById.get('noah_stromsted')?.name).toBe('Noah Strømsted')
    const palou = driverPool2026.find((driver) => driver.name === 'Alex Palou')!
    expect(palou.careerHistory.some((entry) => entry.seriesId === 'indycar')).toBe(true)
    expect(palou).not.toHaveProperty('teamId')
    expect(palou).not.toHaveProperty('carNumber')
    expect(palou.nationality).toBe('UNK')
  })
})
