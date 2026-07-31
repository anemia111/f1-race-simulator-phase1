import { describe, expect, it } from 'vitest'
import {
  componentConditionState,
  componentConditionThresholds,
  filterPitWallRaceControl,
  pitWallBoxCommands,
  pitWallCapabilitiesFor,
  pitWallIntervals,
  pitWallObservedSource,
  pitWallPaceCommandDisabledReason,
  pitWallRaceControlEntries,
  pitWallTabs,
  raceControlKindFromMessage,
} from './pitWall'
import type { CarSnapshot, RaceEvent } from '../types'

const carStub = (overrides: Partial<CarSnapshot>): CarSnapshot =>
  ({
    code: 'AAA',
    driverId: 'a',
    gapToAhead: 0,
    position: 1,
    status: 'running',
    tireSetsRemaining: {},
    ...overrides,
  }) as CarSnapshot

const eventStub = (overrides: Partial<RaceEvent>): RaceEvent => ({
  elapsedSeconds: 0,
  id: 'event',
  kind: 'info',
  message: 'message',
  timeLabel: '00:00',
  ...overrides,
})

describe('pit wall tabs', () => {
  it('exposes the five operational sections in order', () => {
    expect(pitWallTabs.map((tab) => tab.id)).toEqual([
      'overview',
      'strategy',
      'systems',
      'weather',
      'race-control',
    ])
  })
})

describe('componentConditionState', () => {
  it('bands condition against the shared thresholds', () => {
    expect(componentConditionState(100)).toBe('good')
    expect(componentConditionState(componentConditionThresholds.watch)).toBe(
      'good',
    )
    expect(
      componentConditionState(componentConditionThresholds.watch - 0.1),
    ).toBe('watch')
    expect(componentConditionState(componentConditionThresholds.critical)).toBe(
      'watch',
    )
    expect(
      componentConditionState(componentConditionThresholds.critical - 0.1),
    ).toBe('critical')
    expect(componentConditionState(0)).toBe('critical')
  })

  it('keeps CRITICAL at or below the point pace penalties start accruing', () => {
    // componentPacePenaltySeconds charges lap time below 45% power condition.
    expect(componentConditionThresholds.critical).toBeLessThanOrEqual(45)
    expect(componentConditionThresholds.critical).toBeLessThan(
      componentConditionThresholds.watch,
    )
  })
})

describe('pitWallCapabilitiesFor', () => {
  it('gives F1 the hybrid Energy Store and active aero', () => {
    const capabilities = pitWallCapabilitiesFor({
      overtakeSystem: 'active-aero',
      seriesId: 'f1-custom',
    })

    expect(capabilities).toMatchObject({
      activeAero: true,
      hybridErs: true,
      ots: false,
      overtakeLabel: 'ACTIVE AERO',
    })
  })

  it('names electrical Overtake separately from active aero in F1', () => {
    // Both are 2026 systems but they are not the same one, so the pit wall
    // must not print ACTIVE AERO against overtakeStatus.
    const capabilities = pitWallCapabilitiesFor({
      overtakeSystem: 'active-aero',
      seriesId: 'f1-custom',
    })

    expect(capabilities.overtakeStatusLabel).toBe('Overtake')
    expect(capabilities.overtakeStatusLabel).not.toBe(
      capabilities.overtakeLabel,
    )
  })

  it('never claims a hybrid Energy Store or active aero for F2 and F3', () => {
    for (const seriesId of ['f2', 'f3'] as const) {
      const capabilities = pitWallCapabilitiesFor({
        overtakeSystem: 'drs',
        seriesId,
      })

      expect(capabilities.hybridErs).toBe(false)
      expect(capabilities.activeAero).toBe(false)
      expect(capabilities.overtakeLabel).toBe('DRS')
    }
  })

  it('reports SUPER FORMULA push-to-pass without F1 systems', () => {
    const capabilities = pitWallCapabilitiesFor({
      overtakeSystem: 'ots',
      seriesId: 'super-formula',
    })

    expect(capabilities).toMatchObject({
      activeAero: false,
      hybridErs: false,
      ots: true,
      overtakeLabel: 'OTS',
    })
  })
})

describe('pitWallObservedSource', () => {
  it('stays SIM unless an observed sample actually backs the field', () => {
    expect(pitWallObservedSource(false, 'LIVE')).toBe('SIM')
    expect(pitWallObservedSource(true, 'SIM')).toBe('SIM')
    expect(pitWallObservedSource(true, 'LIVE')).toBe('LIVE')
    expect(pitWallObservedSource(true, 'HIST')).toBe('HIST')
  })
})

describe('pitWallIntervals', () => {
  const field = [
    carStub({ code: 'AAA', driverId: 'a', gapToAhead: 0, position: 1 }),
    carStub({ code: 'BBB', driverId: 'b', gapToAhead: 1.25, position: 2 }),
    carStub({ code: 'CCC', driverId: 'c', gapToAhead: 0.5, position: 3 }),
  ]

  it('reads the interval behind from the following car own gap', () => {
    expect(pitWallIntervals(field, 'b')).toEqual({
      aheadCode: 'AAA',
      behindCode: 'CCC',
      intervalAheadSeconds: 1.25,
      intervalBehindSeconds: 0.5,
    })
  })

  it('leaves the leader with no interval ahead', () => {
    expect(pitWallIntervals(field, 'a')).toMatchObject({
      aheadCode: null,
      intervalAheadSeconds: null,
    })
  })

  it('leaves the last runner with no interval behind', () => {
    expect(pitWallIntervals(field, 'c')).toMatchObject({
      behindCode: null,
      intervalBehindSeconds: null,
    })
  })

  it('ignores retired and non-starting cars', () => {
    const withRetirement = [
      ...field,
      carStub({
        code: 'DDD',
        driverId: 'd',
        gapToAhead: 2,
        position: 4,
        status: 'retired',
      }),
    ]

    expect(pitWallIntervals(withRetirement, 'c').behindCode).toBeNull()
  })

  it('returns unavailable intervals for an unknown driver', () => {
    expect(pitWallIntervals(field, 'missing')).toEqual({
      aheadCode: null,
      behindCode: null,
      intervalAheadSeconds: null,
      intervalBehindSeconds: null,
    })
  })

  it('does not crash on an empty field', () => {
    expect(() => pitWallIntervals([], 'a')).not.toThrow()
  })
})

describe('pitWallBoxCommands', () => {
  it('disables a compound with no remaining set and explains why', () => {
    const commands = pitWallBoxCommands(
      carStub({ status: 'running', tireSetsRemaining: { M: 2, S: 0 } }),
    )
    const soft = commands.find((command) => command.compound === 'S')
    const medium = commands.find((command) => command.compound === 'M')

    expect(soft?.disabled).toBe(true)
    expect(soft?.disabledReason).toMatch(/No S sets remain/u)
    expect(medium?.disabled).toBe(false)
    expect(medium?.disabledReason).toBeNull()
    expect(medium?.setsRemaining).toBe(2)
  })

  it('treats a missing compound entry as no sets remaining', () => {
    const commands = pitWallBoxCommands(
      carStub({ status: 'running', tireSetsRemaining: {} }),
    )

    expect(commands.every((command) => command.disabled)).toBe(true)
    expect(commands.every((command) => command.setsRemaining === 0)).toBe(true)
  })

  it('blocks every box call for a car that is not running', () => {
    for (const status of ['retired', 'dns', 'disqualified', 'finished'] as const) {
      const commands = pitWallBoxCommands(
        carStub({ status, tireSetsRemaining: { H: 3, M: 3, S: 3 } }),
      )

      expect(commands.every((command) => command.disabled)).toBe(true)
      expect(commands[0].disabledReason).toContain(status)
    }
  })

  it('covers all five compounds', () => {
    expect(
      pitWallBoxCommands(carStub({})).map((command) => command.compound),
    ).toEqual(['S', 'M', 'H', 'I', 'W'])
  })
})

describe('pitWallPaceCommandDisabledReason', () => {
  it('allows instructions to a running or servicing car', () => {
    expect(pitWallPaceCommandDisabledReason(carStub({ status: 'running' }))).toBeNull()
    expect(pitWallPaceCommandDisabledReason(carStub({ status: 'pit' }))).toBeNull()
  })

  it('blocks instructions to a car that is out of the session', () => {
    expect(
      pitWallPaceCommandDisabledReason(carStub({ status: 'retired' })),
    ).toContain('retired')
  })
})

describe('raceControlKindFromMessage', () => {
  it('classifies observed race control text without a kind field', () => {
    expect(raceControlKindFromMessage('YELLOW FLAG IN SECTOR 2')).toBe('flag')
    expect(raceControlKindFromMessage('SAFETY CAR DEPLOYED')).toBe('flag')
    expect(raceControlKindFromMessage('CAR 31 TRACK LIMITS AT TURN 4')).toBe(
      'track-limit',
    )
    expect(raceControlKindFromMessage('CAR 31 5 SECOND PENALTY')).toBe('penalty')
    expect(raceControlKindFromMessage('TURN 1 INCIDENT NOTED')).toBe(
      'investigation',
    )
    expect(raceControlKindFromMessage('DRIVERS REMINDED OF THE BRIEFING')).toBe(
      'info',
    )
  })
})

describe('pitWallRaceControlEntries', () => {
  const events = [
    eventStub({ id: '1', kind: 'flag', message: 'VSC DEPLOYED' }),
    eventStub({ id: '2', kind: 'penalty', message: 'NAK +5s time penalty' }),
    eventStub({ id: '3', kind: 'overtake', message: 'VER passes NORRIS' }),
  ]

  it('keeps the simulation kind instead of re-deriving it from the message', () => {
    const entries = pitWallRaceControlEntries({
      events,
      selectedCarCode: 'NAK',
    })

    expect(entries.map((entry) => entry.kind)).toEqual([
      'flag',
      'penalty',
      'overtake',
    ])
    expect(entries.every((entry) => entry.source === 'SIM')).toBe(true)
  })

  it('matches the selected car on a word boundary only', () => {
    const entries = pitWallRaceControlEntries({
      events,
      selectedCarCode: 'NAK',
    })

    expect(entries[1].mentionsSelectedCar).toBe(true)
    expect(entries[0].mentionsSelectedCar).toBe(false)
    // NOR must not match inside NORRIS.
    expect(
      pitWallRaceControlEntries({ events, selectedCarCode: 'NOR' })[2]
        .mentionsSelectedCar,
    ).toBe(false)
  })

  it('prefers observed OpenF1 rows and derives their kind', () => {
    const entries = pitWallRaceControlEntries({
      events,
      observedLog: [
        {
          id: 'openf1-1',
          message: 'CHEQUERED FLAG',
          source: 'OPENF1',
          timeLabel: '14:02',
        },
      ],
      selectedCarCode: 'NAK',
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'flag', source: 'OPENF1' })
  })

  it('ignores a simulation-sourced log and reads the events directly', () => {
    const entries = pitWallRaceControlEntries({
      events,
      observedLog: [
        { id: '1', message: 'VSC DEPLOYED', source: 'SIM', timeLabel: '0:10' },
      ],
      selectedCarCode: 'NAK',
    })

    expect(entries).toHaveLength(events.length)
    expect(entries.every((entry) => entry.source === 'SIM')).toBe(true)
  })

  it('survives an empty event history', () => {
    expect(
      pitWallRaceControlEntries({ events: [], selectedCarCode: '' }),
    ).toEqual([])
  })
})

describe('filterPitWallRaceControl', () => {
  const entries = pitWallRaceControlEntries({
    events: [
      eventStub({ id: '1', kind: 'flag', message: 'VSC DEPLOYED' }),
      eventStub({ id: '2', kind: 'penalty', message: 'NAK +5s time penalty' }),
      eventStub({ id: '3', kind: 'track-limit', message: 'HAM track limits' }),
      eventStub({ id: '4', kind: 'investigation', message: 'NAK under review' }),
      eventStub({ id: '5', kind: 'pit', message: 'HAM boxes' }),
    ],
    selectedCarCode: 'NAK',
  })

  it('returns everything for ALL', () => {
    expect(filterPitWallRaceControl(entries, 'all')).toHaveLength(5)
  })

  it('returns only flag messages for FLAGS', () => {
    expect(
      filterPitWallRaceControl(entries, 'flags').map((entry) => entry.id),
    ).toEqual(['1'])
  })

  it('groups penalties, investigations, and track limits for PENALTIES', () => {
    expect(
      filterPitWallRaceControl(entries, 'penalties').map((entry) => entry.id),
    ).toEqual(['2', '3', '4'])
  })

  it('returns only messages naming the selected car', () => {
    expect(
      filterPitWallRaceControl(entries, 'selected-car').map(
        (entry) => entry.id,
      ),
    ).toEqual(['2', '4'])
  })
})
