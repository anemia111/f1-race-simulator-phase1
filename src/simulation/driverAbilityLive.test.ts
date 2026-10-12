import { expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import type { DriverSkillProfile, RaceConfig } from '../types'
import { advanceRace, createInitialRace } from './race'
import { timedSessionDriverExecutionLossSeconds } from './qualifying'
import { baselineSetupForTrack } from './engineering'

it('reflects ability 120 in a measured solo qualifying lap with unchanged hardware', () => {
  const series = seriesPackageById.get('f1-custom')!
  const reference = series.drivers.find(driver => driver.id === 'yuki_nakayama')!
  const timeAt = (rating: number) => {
    const driver = { ...reference, skills: Object.fromEntries(
      Object.keys(reference.skills).map(key => [key, rating]),
    ) as DriverSkillProfile }
    const config: RaceConfig = {
      drivers: [driver], teams: series.teams,
      track: { ...supportSeriesTracks.find(track => track.id === 'fuji-sf')!, baseLapTime: 77, rainProbability: 0 },
      seriesId: series.id, seed: 'ability-120-live', weekendStage: 'qualifying',
      sessionDurationSeconds: 360,
      timedSessionPlan: { totalDurationSeconds: 360, segments: [{
        name: 'Q1', startsAtSeconds: 0, endsAtSeconds: 360,
        participantDriverIds: [driver.id], suspensionStartsAtSeconds: null,
        suspensionEndsAtSeconds: null, tire: { kind: 'f1-pirelli-session-tire', compound: 'S' },
      }] },
    }
    const team = series.teams.find(team => team.id === driver.teamId)!
    const executionLoss = timedSessionDriverExecutionLossSeconds({
      config, driver, team, fuelLoadKg: 6, setup: baselineSetupForTrack(config.track),
      tire: { kind: 'f1-pirelli-session-tire', compound: 'S' },
      trackGrip: 1, weather: 'clear', weekendStage: 'qualifying', run: 0, seed: config.seed,
    })
    expect(executionLoss).toBeGreaterThanOrEqual(0)
    let snapshot = createInitialRace(config)
    for (let second = 0; second < 360; second++) {
      snapshot = advanceRace(snapshot, 1, config)
      const lap = snapshot.cars[0].lapHistory[0]
      if (lap) {
        expect(lap.sectors.reduce((sum, sector) => sum + sector, 0)).toBeCloseTo(lap.lapTimeSeconds, 5)
        return { lapTime: lap.lapTimeSeconds, executionLoss }
      }
    }
    throw new Error('Solo qualifying did not complete an attack lap')
  }
  const standard = timeAt(1)
  const enhanced = timeAt(1.2)
  console.info('Fuji solo ability comparison (seconds)', { standard, enhanced })
  // Thermal preparation and braking signs can change a single lap either way;
  // require a real live-path difference, not a forced rating-based finish time.
  expect(enhanced.lapTime).not.toBe(standard.lapTime)
  expect(Math.abs(enhanced.lapTime - standard.lapTime)).toBeLessThan(0.5)
  expect(enhanced.executionLoss).toBeLessThan(standard.executionLoss)
}, 30_000)
