export type SfOtsSimulation = { remainingSeconds: number; cooldownUntilSeconds: number; active: boolean; cooldownSeconds: number; boostPowerKw: number; source: string }
export const SF_OTS_SOURCE = 'https://toyotagazooracing.com/jp/superformula/cars/2026/'
export const SF_OTS_ALLOCATION_SECONDS = 200
export const SF_OTS_BOOST_POWER_KW = 37
/** 2026 manufacturer-published allocation/cooldowns; boost is an explicit SIM estimate. */
export function createSfOtsSimulation(trackId: string): SfOtsSimulation | undefined {
  const cooldownSeconds = /suzuka|autopolis/.test(trackId) ? 100 : /sugo/.test(trackId) ? 110 : /fuji|motegi/.test(trackId) ? 120 : null
  return cooldownSeconds === null ? undefined : { remainingSeconds: SF_OTS_ALLOCATION_SECONDS, cooldownUntilSeconds: 0, active: false, cooldownSeconds, boostPowerKw: SF_OTS_BOOST_POWER_KW, source: SF_OTS_SOURCE }
}
/** SIM fuel-flow estimate: equal efficiency at the added combustion power.
 * Actual consumed OTS seconds preserve partial final ticks and held braking use.
 * The time budget still runs at closed throttle, but no boost fuel is delivered.
 */
export function sfOtsAdditionalFuelKg(options: {
  before: SfOtsSimulation
  after: SfOtsSimulation
  baseFuelKgPerSecond: number
  combustionPowerKw: number
  throttlePercent: number
}): number {
  const usedSeconds = Math.max(0, options.before.remainingSeconds - options.after.remainingSeconds)
  if (options.combustionPowerKw <= 0) return 0
  return usedSeconds * Math.max(0, options.baseFuelKgPerSecond) *
    (options.before.boostPowerKw / options.combustionPowerKw) *
    Math.max(0, Math.min(1, options.throttlePercent / 100))
}
export function advanceSfOts(state: SfOtsSimulation, requested: boolean, permitted: boolean, seconds: number, dt: number): SfOtsSimulation {
  const active = permitted && requested && state.remainingSeconds > 0 && seconds >= state.cooldownUntilSeconds
  const remainingSeconds = Math.max(0, state.remainingSeconds - (active ? Math.max(0, dt) : 0))
  const stopped = state.active && !active || active && remainingSeconds === 0
  return { ...state, remainingSeconds, active: active && remainingSeconds > 0, cooldownUntilSeconds: stopped ? seconds + state.cooldownSeconds : state.cooldownUntilSeconds }
}
