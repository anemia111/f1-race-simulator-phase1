import { describe, expect, it } from 'vitest'
import type { OpenF1RaceControl } from './openF1'
import {
  flagFromRaceControl,
  sectorFlagsFromRaceControl,
} from './openF1Derived'

const event = (
  overrides: Partial<OpenF1RaceControl>,
): OpenF1RaceControl => ({
  category: 'Flag',
  date: '2026-07-14T12:00:00Z',
  driver_number: null,
  flag: null,
  lap_number: 1,
  message: '',
  qualifying_phase: null,
  scope: 'Sector',
  sector: 1,
  ...overrides,
})

describe('OpenF1 sector flags', () => {
  it('labels a local yellow with its one-based sector', () => {
    expect(
      flagFromRaceControl(
        event({ message: 'YELLOW FLAG IN SECTOR 2', sector: 2 }),
      ),
    ).toEqual({ flag: 'yellow', flagLabel: 'YELLOW S2' })
  })

  it('tracks independent sector deployment and withdrawal', () => {
    expect(
      sectorFlagsFromRaceControl([
        event({ message: 'YELLOW FLAG IN SECTOR 2', sector: 2 }),
        event({
          date: '2026-07-14T12:00:01Z',
          message: 'DOUBLE YELLOW IN SECTOR 3',
          sector: 3,
        }),
        event({
          date: '2026-07-14T12:00:02Z',
          flag: 'GREEN',
          message: 'SECTOR 2 CLEAR',
          sector: 2,
        }),
      ]),
    ).toEqual(['clear', 'clear', 'double-yellow'])
  })

  it('applies global control phases to all sectors', () => {
    expect(
      sectorFlagsFromRaceControl([
        event({
          category: 'SafetyCar',
          message: 'VIRTUAL SAFETY CAR DEPLOYED',
          scope: 'Track',
          sector: null,
        }),
      ]),
    ).toEqual(['vsc', 'vsc', 'vsc'])
  })
})
