import { describe, expect, it } from 'vitest'
import { catalogCalendarFor, catalogDriverCategories, catalogDriverId, expansionCatalog,
  validateExpansionCatalog, catalogPoolDriverById } from './expansionCatalog'
import { EXECUTABLE_SERIES_IDS } from './seriesIds'

describe('source-backed expansion directory', () => {
  it('retains the whole source directory with crews instead of one driver per car', () => {
    expect(expansionCatalog.categories.map((category) => [category.id, category.entries.length]))
      .toEqual([['kyojo', 20], ['super-gt-gt500', 14], ['super-gt-gt300', 29],
        ['indycar', 33], ['wec-hypercar', 17], ['wec-lmgt3', 18]])
    expect(expansionCatalog.categories.find((category) => category.id === 'wec-lmgt3')!
      .entries.find((entry) => entry.number === '91')!.drivers).toContain('Timur BOGUSLAVSKIY')
    expect(expansionCatalog.categories.find((category) => category.id === 'wec-hypercar')!
      .entries[0].number).toBe('007')
    expect(() => validateExpansionCatalog(expansionCatalog)).not.toThrow()
  })

  it('uses reviewed bilingual identities to link SF, SUPER GT, WEC and reserve history', () => {
    expect(catalogDriverId('太田　格之進')).toBe('kakunoshin_ohta')
    expect(catalogDriverId('Kamui KOBAYASHI')).toBe('kamui_kobayashi')
    expect(catalogDriverId('Ryō HIRAKAWA')).toBe('ryo_hirakawa')
    expect(catalogDriverCategories.get('tomoki_nojiri')?.size).toBe(2)
    expect(catalogDriverId('unreviewed similar surname')).toMatch(/^catalog:/)
  })

  it('retains current amended calendars and does not mistake responsive card order for race order', () => {
    expect(catalogCalendarFor('kyojo')).toHaveLength(5)
    expect(catalogCalendarFor('super-gt-gt300')).toHaveLength(8)
    expect(catalogCalendarFor('super-gt-gt500').find((event) => event.round === 3)?.trackKey).toBe('motegi')
    const indy = catalogCalendarFor('indycar')
    expect(indy).toHaveLength(18)
    expect(indy[0].trackKey).toBe('st-petersburg')
    expect(indy.at(-1)?.trackKey).toBe('laguna-seca')
    expect(catalogCalendarFor('wec-hypercar').slice(-2).map((event) => event.trackKey))
      .toEqual(['barcelona', 'monza'])
  })

  it('does not turn identities into fabricated performance or executable category packages', () => {
    for (const category of expansionCatalog.categories) {
      expect(EXECUTABLE_SERIES_IDS).not.toContain(category.id)
      for (const entry of category.entries) expect(entry).not.toHaveProperty('overall')
    }
  })

  it('connects all twenty KYOJO registrations to imported pool abilities', () => {
    const kyojo = expansionCatalog.categories.find((category) => category.id === 'kyojo')!
    for (const entry of kyojo.entries) {
      expect(catalogPoolDriverById.get(catalogDriverId(entry.drivers[0]))).toBeDefined()
    }
    expect(catalogPoolDriverById.get(catalogDriverId('塚越 広大'))?.name).toBe('Koudai Tsukakoshi')
    expect(catalogDriverId('Alexander LYNN')).toBe(catalogDriverId('Alex Lynn'))
  })
})
