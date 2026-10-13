import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { parsePersistedWeekend } from '../persistence'
import { createWeekendContext, completePracticeSession } from './weekend'
import { setDriverAutomaticSetup, updateDriverCarSetup } from './driverSetups'
import type { PracticeSessionResult } from './qualifying'

const drivers = initialDrivers.slice(0, 2)
const first = drivers[0].id
const second = drivers[1].id
const context = () => createWeekendContext(drivers, false, tracks[0])

function result(driverId: string): PracticeSessionResult {
  return {
    driverId, teamId: drivers[0].teamId, code: 'TST', driverName: 'Test',
    teamName: 'Test', teamColor: '#fff', position: 1, bestLapTimeSeconds: 90,
    longRunPaceSeconds: 92, setupScore: 80, setupConfidence: 0.8,
    setupRecommendation: { ...context().setupByDriver[first], rearWing: 9 },
    lapsCompleted: 10, runCount: 0, runTires: [], programs: [],
    firstPitExitAtSeconds: 1, finalPitExitAtSeconds: 10, sessionDurationSeconds: 100,
    weather: 'clear', weatherLabel: 'Clear',
  }
}

describe('per-driver setup editing', () => {
  it('changes one car independently of its teammate and keeps the source immutable', () => {
    const before = context()
    const after = updateDriverCarSetup(before, first, { rearWing: 2, brakeBiasPercent: 54.5 })
    expect(after.setupByDriver[first]).toMatchObject({ rearWing: 2, brakeBiasPercent: 54.5 })
    expect(after.setupByDriver[second]).toBe(before.setupByDriver[second])
    expect(before.setupByDriver[first].rearWing).not.toBe(2)
    expect(after.manualSetupByDriver?.[first]).toBe(true)
  })

  it('enforces physical setting bounds and rejects non-finite input', () => {
    const before = context()
    const after = updateDriverCarSetup(before, first, { rearWing: 100, rideHeightMm: 0, coolingPercent: Number.NaN })
    expect(after.setupByDriver[first]).toMatchObject({ rearWing: 10, rideHeightMm: 20, coolingPercent: before.setupByDriver[first].coolingPercent })
  })

  it('rejects unknown drivers and locked-car edits, resets and mode changes', () => {
    const before = context()
    before.parcFermeLockedByDriver[first] = true
    expect(updateDriverCarSetup(before, first, { rearWing: 1 })).toBe(before)
    expect(setDriverAutomaticSetup(before, first, false)).toBe(before)
    expect(updateDriverCarSetup(before, 'unknown', { rearWing: 1 })).toBe(before)
  })

  it('preserves a manual setup through FP while automatically tuning another car', () => {
    const manual = updateDriverCarSetup(context(), first, { rearWing: 2 })
    const after = completePracticeSession(manual, 'fp1', [result(first), result(second)])
    expect(after.setupByDriver[first].rearWing).toBe(2)
    expect(after.setupByDriver[second].rearWing).toBe(9)
    expect(after.setupConfidenceByDriver[first]).toBe(0.8)
    const automatic = setDriverAutomaticSetup(after, first, true)
    expect(completePracticeSession(automatic, 'fp2', [result(first)]).setupByDriver[first].rearWing).toBe(9)
  })

  it('round-trips the driver-specific setup and manual mode and defaults old saves to auto', () => {
    const manual = updateDriverCarSetup(context(), first, { rearWing: 2 })
    const restore = (weekendContext: ReturnType<typeof context>) => parsePersistedWeekend(JSON.stringify({
      trackId: tracks[0].id, stage: 'fp1', seed: 'driver-setups', gridSource: 'qualifying', weekendContext,
    }), tracks, drivers)!.weekendContext
    expect(restore(manual).setupByDriver[first]).toEqual(manual.setupByDriver[first])
    expect(restore(manual).manualSetupByDriver).toEqual({ [first]: true, [second]: false })
    expect(restore(context()).manualSetupByDriver?.[first]).toBe(false)
  })
})
