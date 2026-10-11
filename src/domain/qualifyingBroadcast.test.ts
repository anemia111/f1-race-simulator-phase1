import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from '../simulation/race'
import type { CarSnapshot, LapRecord, RaceSnapshot } from '../types'
import { updateQualifyingCards } from './qualifyingBroadcast'

function lap(time = 90, completedAt = 100, segment = 'Q1', valid = true): LapRecord {
  return { lap: 1, lapTimeSeconds: time, sectors: [time / 3, time / 3, time / 3],
    completedAtSeconds: completedAt, segment, isValid: valid, invalidReason: valid ? null : 'Track limits',
    tireRun: { kind: 'f1-pirelli', compound: 'S', ageLaps: 1 },
    weather: 'clear', trackGrip: 1, position: 1, pitStop: false }
}
function fixture(): RaceSnapshot {
  const state = createInitialRace({ drivers: initialDrivers.slice(0, 5), teams: initialTeams,
    track: tracks[0], seed: 'broadcast', weekendStage: 'qualifying' })
  return { ...state, elapsedSeconds: 240, timedParticipantDriverIds: state.cars.map(car => car.driverId),
    cars: state.cars.map((car, index) => ({ ...car, status: 'running', hiddenFromTrack: false,
      projectedLapTime: 90, progress: 0.9 - index * 0.1, lapStartedAtSeconds: 180,
      timedRunPhase: 'attack-lap', currentLapSectorTimes: [29, 30, null],
      lapHistory: [lap(90 + index)], timedSegmentBestSetAtSeconds: { Q1: 100 + index } })) }
}
const update = (state: RaceSnapshot, now = 0, previous: Parameters<typeof updateQualifyingCards>[0] = [], advance: number | null = 2) =>
  updateQualifyingCards(previous, state, 'Q1', advance, now)
const finish = (car: CarSnapshot, time: number, valid = true): CarSnapshot => ({ ...car,
  timedRunPhase: 'in-lap', lapStartedAtSeconds: 270, progress: 0.001,
  lapHistory: [...car.lapHistory, lap(time, 270, 'Q1', valid)] })

describe('qualifying broadcast direction', () => {
  it('selects the nearest three finishes, never out/in laps or inactive drivers', () => {
    const state = fixture()
    state.cars[0].timedRunPhase = 'out-lap'
    state.cars[1].timedRunPhase = 'in-lap'
    expect(update(state).map(card => card.driverId)).toEqual(state.cars.slice(2).map(car => car.driverId))
    state.timedParticipantDriverIds = [state.cars[4].driverId]
    expect(update(state)).toHaveLength(1)
  })
  it('compares safe drivers to the leader, eliminated/no-time drivers to the last safe place', () => {
    const state = fixture()
    const cards = update(state)
    expect(cards[0].reference?.kind).toBe('personal')
    expect(cards[1].reference?.driverId).toBe(state.cars[0].driverId)
    expect(cards[2].reference).toMatchObject({ kind: 'cutoff', position: 2, driverId: state.cars[1].driverId })
    state.cars[2].lapHistory = []
    expect(update(state)[2].reference?.kind).toBe('cutoff')
    expect(update(state, 0, [], null)[2].reference?.kind).toBe('leader')
  })
  it('shows the measured cumulative split delta and a running clock separately', () => {
    const card = update(fixture())[2]
    expect(card.clockSeconds).toBe(60)
    expect(card.split).toBe(2)
    expect(card.deltaSeconds).toBeCloseTo(59 - 91 * 2 / 3)
  })
  it('holds a frozen result for three wall-clock seconds even at accelerated simulation speed', () => {
    const state = fixture(), before = update(state)
    state.elapsedSeconds = 270
    state.cars[0] = finish(state.cars[0], 89)
    const atLine = update(state, 1000, before)
    expect(atLine[0].result?.lapTimeSeconds).toBe(89)
    expect(atLine[0].deltaSeconds).toBe(-1)
    state.elapsedSeconds = 400
    state.cars[0] = finish(state.cars[0], 88)
    expect(update(state, 3999, atLine)[0]).toEqual(atLine[0])
    expect(update(state, 4000, atLine).some(card => card.driverId === state.cars[0].driverId)).toBe(false)
  })
  it('retains multiple simultaneous finishers without exceeding three cards', () => {
    const state = fixture(), before = update(state)
    state.elapsedSeconds = 270
    state.cars[0] = finish(state.cars[0], 89)
    state.cars[1] = finish(state.cars[1], 90)
    const cards = update(state, 1000, before)
    expect(cards).toHaveLength(3)
    expect(cards.filter(card => card.result)).toHaveLength(2)
    expect(new Set(cards.map(card => card.driverId)).size).toBe(3)
  })
  it('keeps a finish visible during an interval, but drops old flying laps on a reset', () => {
    const state = fixture(), before = update(state)
    state.elapsedSeconds = 270
    state.cars[0] = finish(state.cars[0], 89)
    const cards = update(state, 1000, before)
    expect(updateQualifyingCards(cards, { ...state, timedParticipantDriverIds: [] }, '', null, 2000)[0].result).not.toBeNull()
    const reset = { ...fixture(), elapsedSeconds: 0, cars: fixture().cars.map(car => ({ ...car, timedRunPhase: 'out-lap' as const })) }
    expect(update(reset, 2000, cards)).toEqual([])
  })
  it('keeps the pre-finish reference when the driver beats or changes the cutoff', () => {
    const state = fixture(), before = update(state)
    state.elapsedSeconds = 270
    state.cars[2] = finish(state.cars[2], 88)
    const card = update(state, 1000, before).find(card => card.driverId === state.cars[2].driverId)!
    expect(card.position).toBe(1)
    expect(card.reference?.lap.lapTimeSeconds).toBe(91)
    expect(card.deltaSeconds).toBe(-3)
  })
  it('does not publish a deleted lap as an improvement', () => {
    const state = fixture(), before = update(state)
    state.elapsedSeconds = 270
    state.cars[2] = finish(state.cars[2], 88, false)
    const card = update(state, 1000, before).find(card => card.driverId === state.cars[2].driverId)!
    expect(card.result?.isValid).toBe(false)
    expect(card.deltaSeconds).toBeNull()
    expect(card.position).toBe(3)
  })
  it('never uses another segment or invalid laps as a reference', () => {
    const state = fixture()
    state.cars.forEach(car => { car.lapHistory = [lap(80, 90, 'Q2'), lap(70, 100, 'Q1', false)] })
    expect(update(state).every(card => card.reference === null)).toBe(true)
    expect(update(state).every(card => card.deltaSeconds === null)).toBe(true)
  })
})
