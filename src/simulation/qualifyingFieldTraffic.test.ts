import { it, expect } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { advanceRace, createInitialRace } from './race'
import type { RaceConfig } from '../types'

it('lets early flying laps pass a full preparing field at Fuji without a multi-second blockade', () => {
  const config: RaceConfig = { ...phaseOneConfig,
    track: { ...supportSeriesTracks.find(track => track.id === 'fuji-sf')!, baseLapTime: 77, rainProbability: 0 },
    weekendStage: 'qualifying', sessionDurationSeconds: 1080,
    timedSessionPlan: { totalDurationSeconds: 1080, segments: [{ name: 'Q1', startsAtSeconds: 0, endsAtSeconds: 1080,
      participantDriverIds: phaseOneConfig.drivers.map(driver => driver.id), suspensionStartsAtSeconds: null, suspensionEndsAtSeconds: null,
      tire: { kind: 'f1-pirelli-session-tire', compound: 'S' } }] } }
  let snapshot = createInitialRace(config)
  const starts = new Map<string, number>()
  for (let second = 0; second < 360; second++) {
    snapshot = advanceRace(snapshot, 1, config)
    for (const car of snapshot.cars) if (car.timedRunPhase === 'attack-lap' && !starts.has(car.driverId)) starts.set(car.driverId, second)
    if (['RUS', 'NOR'].every(code => snapshot.cars.find(car => car.code === code)!.lapHistory.length)) break
  }
  // Previously RUS lost ~14 s and NOR ~5 s to transit traffic. These checks
  // constrain actual measured laps, not classification or who must win.
  for (const code of ['RUS', 'NOR']) {
    const car = snapshot.cars.find(car => car.code === code)!
    expect(car.bestLapTimeSeconds, code).not.toBeNull()
    expect(car.bestLapTimeSeconds, code).toBeLessThan(80)
  }
  expect(starts.size).toBeGreaterThan(10)
}, 45_000)
