import { describe, expect, it } from 'vitest'
import machines from './recovered20261010/expansionMachineSpecs2026.json'
import manifest from './recovered20261010/recovery-manifest.json'

describe('recovered original category data', () => {
  it('preserves every recovered source byte, including authored ratings and event packs', async () => {
    const originals = import.meta.glob<string>('./recovered20261010/*.json', {
      query: '?raw', import: 'default', eager: true,
    })
    expect(manifest.files).toHaveLength(7)
    for (const file of manifest.files) {
      const bytes = new TextEncoder().encode(originals[`./recovered20261010/${file.file}`])
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      expect(hash, file.file).toBe(file.sha256)
    }
  })
  it('keeps 43 machine configurations and the evidence limitations of the original specifications', () => {
    expect(machines.machines).toHaveLength(43)
    const counts: Record<string, number> = {}
    for (const machine of machines.machines) counts[machine.categoryId] = (counts[machine.categoryId] ?? 0) + 1
    expect(counts).toEqual({ indycar: 6, kyojo: 1, 'super-gt-gt300': 15, 'super-gt-gt500': 3,
      'wec-hypercar': 8, 'wec-lmp2': 1, 'wec-lmgt3': 9 })
    for (const machine of machines.machines) {
      expect(machines.sources.some(source => source.id === machine.sourceId), machine.name).toBe(true)
    }
    const chevrolet = machines.machines.find(machine => machine.name.includes('Chevrolet'))!
    expect(chevrolet.power.value).toBeNull()
    expect(chevrolet.power.relation).toBe('unavailable')
    expect(chevrolet.mass.relation).toBe('regulatory-minimum-excluding-driver-fuel')
  })
})
