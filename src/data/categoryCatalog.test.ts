import { describe, expect, it } from 'vitest'
import { categoryCatalogs } from './categoryCatalog'
import { seriesPackages } from '../series/seriesRegistry'

describe('read-only category catalog', () => {
  it('retains every requested category without adding unimplemented race runtimes', () => {
    expect(categoryCatalogs().map(category => category.id)).toEqual([
      'f1-custom', 'super-formula', 'f2', 'f3', 'gt500', 'gt300', 'indycar', 'kyojo', 'wec',
    ])
    expect(seriesPackages.map(series => series.id)).toEqual(['f1-custom', 'super-formula'])
    const byId = new Map(categoryCatalogs().map(category => [category.id, category]))
    expect(byId.get('f2')?.entries).toHaveLength(22)
    expect(byId.get('f3')?.entries).toHaveLength(30)
    expect(byId.get('gt500')?.entries).toHaveLength(14)
    expect(byId.get('gt300')?.entries).toHaveLength(29)
    expect(byId.get('wec')?.entries).toHaveLength(35)
    expect(byId.get('kyojo')?.entries).toHaveLength(20)
    expect(byId.get('indycar')?.entries).toHaveLength(33)
  })

  it('preserves official crew grouping, numbers, provenance and Unicode', () => {
    for (const category of categoryCatalogs().filter(category => category.sourceUrl)) {
      expect(category.checkedAt).toBe('2026-10-17')
      expect(new URL(category.sourceUrl).protocol).toBe('https:')
      expect(new Set(category.entries.map(entry => entry.number)).size).toBe(category.entries.length)
      for (const entry of category.entries) {
        expect(entry.drivers.length).toBeGreaterThan(0)
        expect(entry.drivers.every(name => name.trim().length > 0 && !name.includes('\uFFFD'))).toBe(true)
        expect(new URL(entry.url).origin).toBe(new URL(category.sourceUrl).origin)
      }
    }
    const gt = categoryCatalogs().find(category => category.id === 'gt500')!
    expect(gt.entries.find(entry => entry.number === '8')?.drivers).toEqual(['太田　格之進', '大津　弘樹'])
    const wec = categoryCatalogs().find(category => category.id === 'wec')!
    expect(wec.entries.find(entry => entry.number === '15')?.drivers).toHaveLength(3)
  })
})
