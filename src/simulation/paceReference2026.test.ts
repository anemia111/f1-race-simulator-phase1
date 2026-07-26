import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { runQualifying } from './qualifying'
import { advanceRace, createInitialRace } from './race'

function representativeRaceLaps(trackId: string) {
  const track = tracks.find((candidate) => candidate.id === trackId)!
  const qualifying = runQualifying({
    drivers: initialDrivers,
    seed: `pace-reference:${trackId}`,
    teams: initialTeams,
    track: { ...track, rainProbability: 0 },
  })
  const driver = initialDrivers.find(
    (candidate) => candidate.id === qualifying[0].driverId,
  )!
  const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
  const config = {
    drivers: [driver],
    seed: `race-pace-reference:${trackId}`,
    teams: [team],
    track: { ...track, rainProbability: 0 },
  }
  let snapshot = createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  snapshot = advanceRace(snapshot, 5, config)

  for (
    let step = 0;
    step < 3_000 && snapshot.cars[0].lapHistory.length < 4;
    step += 1
  ) {
    snapshot = advanceRace(snapshot, 0.25, config)
  }

  return snapshot.cars[0].lapHistory.map((lap) => lap.lapTimeSeconds)
}

function representativeFullFieldRace(trackId: string) {
  const track = tracks.find((candidate) => candidate.id === trackId)!
  const config = {
    drivers: initialDrivers,
    seed: 'phase-2-default',
    teams: initialTeams,
    track: { ...track, rainProbability: 0 },
  }
  let snapshot = createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  snapshot = advanceRace(snapshot, 5, config)

  for (
    let step = 0;
    step < 3_000 &&
    Math.max(...snapshot.cars.map((car) => car.lapHistory.length)) < 4;
    step += 1
  ) {
    snapshot = advanceRace(snapshot, 0.25, config)
  }

  const leader = snapshot.cars.find((car) => car.position === 1)!

  return {
    leaderLaps: leader.lapHistory.map((lap) => lap.lapTimeSeconds),
    runningCars: snapshot.cars.filter((car) => car.status === 'running').length,
  }
}

const average = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / values.length

describe('2026 pace references', () => {
  it('keeps all 22 F1 qualifying targets inside their data-confidence window', () => {
    const trackIds = tracks
      .filter((track) => track.paceReference2026?.series === 'f1-custom')
      .map((track) => track.id)
    const poleTimes = trackIds.map((trackId) => {
      const track = tracks.find((candidate) => candidate.id === trackId)!
      const result = runQualifying({
        drivers: initialDrivers,
        seed: `pace-reference:${trackId}`,
        teams: initialTeams,
        track: { ...track, rainProbability: 0 },
      })

      return {
        basis: track.paceReference2026!.qualifyingBasis,
        delta:
          result[0].lapTimeSeconds -
          track.paceReference2026!.qualifyingSeconds,
      }
    })

    expect(poleTimes).toHaveLength(22)
    expect(
      poleTimes.every(({ basis, delta }) =>
        Math.abs(delta) <= (basis === 'official-result' ? 0.5 : 1),
      ),
    ).toBe(true)
  })

  it('keeps green race pace faster than the event average without becoming qualifying pace', () => {
    const samples = [
      'albert-park-approx',
      'suzuka-approx',
      'miami-approx',
    ].map((trackId) => {
      const track = tracks.find((candidate) => candidate.id === trackId)!
      const laps = representativeRaceLaps(trackId).slice(1)
      const cleanRacePace = average(laps)

      return {
        cleanRacePace,
        qualifyingSeconds: track.paceReference2026!.qualifyingSeconds,
        raceAverageSeconds: track.paceReference2026!.raceAverageSeconds,
      }
    })

    expect(
      samples.every(
        ({ cleanRacePace, qualifyingSeconds }) =>
          cleanRacePace >= qualifyingSeconds + 5,
      ),
    ).toBe(true)
    expect(
      samples.every(
        ({ cleanRacePace, raceAverageSeconds }) =>
          cleanRacePace <= raceAverageSeconds + 1.5,
      ),
    ).toBe(true)
  })

  it('keeps representative Super Formula qualifying targets within half a second', () => {
    const series = seriesPackageById.get('super-formula')!
    const trackIds = ['motegi-sf', 'suzuka-approx', 'fuji-sf', 'sugo-sf']
    const poleTimes = trackIds.map((trackId) => {
      const track = series.tracks.find((candidate) => candidate.id === trackId)!
      const result = runQualifying({
        drivers: series.drivers,
        seed: `sf-pace-reference:${trackId}`,
        teams: series.teams,
        track: { ...track, rainProbability: 0 },
      })

      return {
        delta:
          result[0].lapTimeSeconds -
          track.paceReference2026!.qualifyingSeconds,
      }
    })

    expect(poleTimes).toHaveLength(trackIds.length)
    expect(
      poleTimes.every(({ delta }) => Math.abs(delta) <= 0.5),
    ).toBe(true)
  })

  it(
    'keeps the full-field Australian leader on the real event-average window',
    () => {
      const result = representativeFullFieldRace('albert-park-approx')
      const track = tracks.find(
        (candidate) => candidate.id === 'albert-park-approx',
      )!
      const stableLaps = result.leaderLaps.slice(1)

      expect(stableLaps).toHaveLength(3)
      expect(
        Math.abs(
          average(stableLaps) -
            track.paceReference2026!.raceAverageSeconds,
        ),
      ).toBeLessThan(0.5)
      expect(result.runningCars).toBe(initialDrivers.length)
    },
    15_000,
  )
})
