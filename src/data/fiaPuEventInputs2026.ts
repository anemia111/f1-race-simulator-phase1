import type { FiaPuEventInput } from '../types'

const SUZUKA_PU_INFORMATION_URL =
  'https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_power_unit_information.pdf'

/**
 * Race Director document 4 for the 2026 Japanese Grand Prix.
 *
 * Each finite value is the complete recharge limit measured at the CU-K HV DC
 * bus. In particular, the 9.0 MJ Overtake row is 8.5 MJ plus the table's
 * 0.5 MJ allowance; consumers must not add the allowance to 9.0 MJ again.
 */
export const fiaSuzukaPuEventInput2026 = {
  eventId: 'f1-03',
  recharge: {
    measuredAt: 'CU-K-HV-DC-bus',
    rules: [
      {
        additionalAllowanceMj: 0,
        baseLimitMj: 8.5,
        behindSafetyCar: 'any',
        id: 'suzuka-race-overtake-inactive',
        lapKind: 'any',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
        lowGrip: 'any',
        overtakeAtLapStart: 'inactive',
        sessionTypes: ['race'],
      },
      {
        additionalAllowanceMj: 0.5,
        baseLimitMj: 8.5,
        behindSafetyCar: 'any',
        id: 'suzuka-race-overtake-active-at-lap-start',
        lapKind: 'any',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        lowGrip: 'any',
        overtakeAtLapStart: 'active',
        sessionTypes: ['race'],
      },
      {
        additionalAllowanceMj: 0,
        baseLimitMj: 8,
        behindSafetyCar: 'any',
        id: 'suzuka-qualifying',
        lapKind: 'any',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 8 },
        lowGrip: 'any',
        overtakeAtLapStart: 'not-applicable',
        sessionTypes: ['qualifying'],
      },
      {
        additionalAllowanceMj: 0,
        baseLimitMj: 9,
        behindSafetyCar: 'any',
        id: 'suzuka-free-practice',
        lapKind: 'any',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        lowGrip: 'any',
        overtakeAtLapStart: 'not-applicable',
        sessionTypes: ['freePractice'],
      },
      {
        additionalAllowanceMj: 0,
        baseLimitMj: 9,
        behindSafetyCar: 'any',
        id: 'suzuka-out-lap-other-than-race',
        lapKind: 'out-lap-other-than-in-ttcs',
        limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
        lowGrip: 'any',
        overtakeAtLapStart: 'not-applicable',
        sessionTypes: ['freePractice', 'qualifying'],
      },
    ],
  },
  schemaVersion: 1,
  seriesId: 'f1-custom',
  source: {
    authority: 'race-director-instruction',
    documentDate: '2026-03-26',
    documentNumber: 4,
    enclosure: 'R03_Japan_Power_Unit_Information.pdf',
    publishedAt: '2026-03-26T01:49:00+01:00',
    sha256: '8d29d55f1632af79e72e836e74a658ec0ec0d68fa278fe374e6d00c3e7aeed20',
    sourceId: 'fia-f1-2026-japan-power-unit-information-r03',
    url: SUZUKA_PU_INFORMATION_URL,
    validationStatus: 'verified',
  },
  trackId: 'suzuka-approx',
} as const satisfies FiaPuEventInput

export const fiaPuEventInputs2026 = [fiaSuzukaPuEventInput2026] as const

const inputsByEventId = new Map<string, FiaPuEventInput>(
  fiaPuEventInputs2026.map((input) => [input.eventId, input]),
)

export function fiaPuEventInputFor(eventId: string) {
  return inputsByEventId.get(eventId) ?? null
}
