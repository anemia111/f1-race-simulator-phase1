export type SfOtsSimulation = { remainingSeconds: number; cooldownUntilSeconds: number; active: boolean; cooldownSeconds: number; boostPowerKw: number; source: string }
export const SF_OTS_SOURCE = 'https://toyotagazooracing.com/jp/superformula/cars/2026/'
/** 2026 manufacturer-published allocation/cooldowns; boost is an explicit SIM estimate. */
export function createSfOtsSimulation(trackId: string): SfOtsSimulation | undefined {
  const cooldownSeconds = /suzuka|autopolis/.test(trackId) ? 100 : /sugo/.test(trackId) ? 110 : /fuji|motegi/.test(trackId) ? 120 : null
  return cooldownSeconds === null ? undefined : { remainingSeconds: 200, cooldownUntilSeconds: 0, active: false, cooldownSeconds, boostPowerKw: 37, source: SF_OTS_SOURCE }
}
export function advanceSfOts(state: SfOtsSimulation, requested: boolean, permitted: boolean, seconds: number, dt: number): SfOtsSimulation {
  const active = permitted && requested && state.remainingSeconds > 0 && seconds >= state.cooldownUntilSeconds
  const remainingSeconds = Math.max(0, state.remainingSeconds - (active ? Math.max(0, dt) : 0))
  const stopped = state.active && !active || active && remainingSeconds === 0
  return { ...state, remainingSeconds, active: active && remainingSeconds > 0, cooldownUntilSeconds: stopped ? seconds + state.cooldownSeconds : state.cooldownUntilSeconds }
}
