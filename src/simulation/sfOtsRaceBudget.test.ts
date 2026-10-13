import { expect, it } from 'vitest'
import { sfOtsUseRequestedFor } from './driverOtsIntent'
import { advanceSfOts, createSfOtsSimulation } from './sfOtsRuntime'

// Lightweight decision-clock exercise; no full-race physics or rendering.
for (const track of ['suzuka-sf', 'autopolis-sf', 'sugo-sf', 'fuji-sf', 'motegi-sf']) {
  it(`spends the allocation while running alone and respects ${track} cooldown`, () => {
    let state = createSfOtsSimulation(track)!
    const raceSeconds = 3600
    let firstUse = -1, lastRelease = -Infinity, uses = 0
    for (let seconds = 0; seconds < raceSeconds; seconds++) {
      const permitted = seconds < 900 || seconds >= 1080
      const requested = sfOtsUseRequestedFor({
        alreadyActive: state.active, battlePhase: 'single-file', brakePercent: seconds % 80 >= 65 ? 70 : 0,
        gapToAheadSeconds: 20, isFinalLap: false, paceMode: 'standard', straightness: 0.1,
        throttlePercent: seconds % 80 >= 65 ? 0 : 100,
        raceBudget: { allocationSeconds: 200, remainingSeconds: state.remainingSeconds,
          cooldownSeconds: state.cooldownSeconds, remainingRaceSeconds: raceSeconds - seconds,
          raceFractionRemaining: (raceSeconds - seconds) / raceSeconds },
      })
      const next = advanceSfOts(state, requested, permitted, seconds, 1)
      if (next.active && !state.active) {
        expect(seconds - lastRelease).toBeGreaterThanOrEqual(state.cooldownSeconds)
        if (firstUse === -1) firstUse = seconds
        uses++
      }
      if (state.active && !next.active) lastRelease = seconds
      state = next
    }
    expect(firstUse).toBeGreaterThan(0)
    expect(uses).toBeGreaterThan(3)
    expect(state.remainingSeconds).toBe(0)
  })
}

it('uses a large late surplus continuously before another cooldown could waste it', () => {
  expect(sfOtsUseRequestedFor({ alreadyActive: true, battlePhase: 'single-file', brakePercent: 70,
    gapToAheadSeconds: 20, isFinalLap: false, paceMode: 'standard', straightness: 0,
    throttlePercent: 0, raceBudget: { allocationSeconds: 200, remainingSeconds: 170,
      cooldownSeconds: 120, remainingRaceSeconds: 250, raceFractionRemaining: 0.1 } })).toBe(true)
})

it('does not spend a scheduled burst during an explicit fuel-saving pace', () => {
  expect(sfOtsUseRequestedFor({ battlePhase: 'single-file', brakePercent: 0, gapToAheadSeconds: 20,
    isFinalLap: false, paceMode: 'save', straightness: 1, throttlePercent: 100,
    raceBudget: { allocationSeconds: 200, remainingSeconds: 200, cooldownSeconds: 120,
      remainingRaceSeconds: 800, raceFractionRemaining: 0.2 } })).toBe(false)
})
