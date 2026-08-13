import { describe, expect, it } from 'vitest'
import {
  fiaPuEventInputFor,
  fiaPuEventInputs2026,
  fiaSuzukaPuEventInput2026,
} from './fiaPuEventInputs2026'

describe('2026 FIA Power Unit event inputs', () => {
  it('pins the verified Japanese Grand Prix document provenance', () => {
    expect(fiaPuEventInputs2026).toHaveLength(1)
    expect(fiaSuzukaPuEventInput2026).toMatchObject({
      eventId: 'f1-03',
      recharge: { measuredAt: 'CU-K-HV-DC-bus' },
      schemaVersion: 1,
      seriesId: 'f1-custom',
      source: {
        authority: 'race-director-instruction',
        documentDate: '2026-03-26',
        documentNumber: 4,
        enclosure: 'R03_Japan_Power_Unit_Information.pdf',
        publishedAt: '2026-03-26T01:49:00+01:00',
        sha256:
          '8d29d55f1632af79e72e836e74a658ec0ec0d68fa278fe374e6d00c3e7aeed20',
        sourceId: 'fia-f1-2026-japan-power-unit-information-r03',
        url: 'https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_power_unit_information.pdf',
        validationStatus: 'verified',
      },
      trackId: 'suzuka-approx',
    })
  })

  it('normalizes the five table conditions as complete recharge limits', () => {
    expect(fiaSuzukaPuEventInput2026.recharge.rules).toEqual([
      expect.objectContaining({
        additionalAllowanceMj: 0,
        baseLimitMj: 8.5,
        id: 'suzuka-race-overtake-inactive',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
        overtakeAtLapStart: 'inactive',
        sessionTypes: ['race'],
      }),
      expect.objectContaining({
        additionalAllowanceMj: 0.5,
        baseLimitMj: 8.5,
        id: 'suzuka-race-overtake-active-at-lap-start',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        overtakeAtLapStart: 'active',
        sessionTypes: ['race'],
      }),
      expect.objectContaining({
        id: 'suzuka-qualifying',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 8 },
        sessionTypes: ['qualifying'],
      }),
      expect.objectContaining({
        id: 'suzuka-free-practice',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        sessionTypes: ['freePractice'],
      }),
      expect.objectContaining({
        id: 'suzuka-out-lap-other-than-race',
        lapKind: 'out-lap-other-than-in-ttcs',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        sessionTypes: ['freePractice', 'qualifying'],
      }),
    ])
  })

  it('resolves by event identity and does not infer another event', () => {
    expect(fiaPuEventInputFor('f1-03')).toBe(fiaSuzukaPuEventInput2026)
    expect(fiaPuEventInputFor('f1-04')).toBeNull()
    expect(fiaPuEventInputFor('suzuka-approx')).toBeNull()
  })
})
