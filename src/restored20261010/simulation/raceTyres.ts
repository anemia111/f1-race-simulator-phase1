/** Category-specific SIM parameters. Supplier coefficients are not public.
 * Longevity constraints and compound ordering: docs/tyre-model-2026-10-08.md.
 * Grip acts on the force solver; never add this loss to a measured lap again. */
export type RaceTyreCategory = 'super-formula' | 'kyojo' | 'gt500' | 'gt300' | 'hypercar' | 'lmgt3' | 'lmp2' | 'indycar'
export type RaceTyreCompound = 'primary' | 'alternate' | 'wet'
export type RaceTyreState = {
  version: 1; distanceKm: number; equivalentKm: number; life: number
  surfaceC: number; coreC: number; damage: number; graining: number
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
export function raceTyreProfile(category: RaceTyreCategory, compound: RaceTyreCompound, oval = false) {
  const lifeKm = { 'super-formula': 290, kyojo: 220, gt500: 350, gt300: 480, hypercar: 1050, lmgt3: 1000, lmp2: 1000, indycar: oval ? 380 : 240 }[category]
  const alternate = compound === 'alternate' && category === 'indycar' && !oval
  const wet = compound === 'wet'
  return { lifeKm: lifeKm * (alternate ? 0.62 : wet ? 0.85 : 1), freshGrip: alternate ? 1.03 : 1,
    optimumC: wet ? 65 : 90, windowC: wet ? 18 : category === 'lmgt3' || category === 'lmp2' ? 25 : 20,
    normalLoss: alternate ? 0.065 : category === 'hypercar' || category === 'lmgt3' || category === 'lmp2' ? 0.025 : 0.045,
    cliffAt: alternate ? 0.65 : 0.78, cliffLoss: alternate ? 0.20 : 0.16 }
}
export function initialRaceTyre(temperatureC = 65, life = 1): RaceTyreState {
  return { version: 1, distanceKm: 0, equivalentKm: 0, life: clamp(life, 0, 1), surfaceC: temperatureC, coreC: temperatureC, damage: 0, graining: 0 }
}
export function validRaceTyre(value: unknown): value is RaceTyreState {
  if (!value || typeof value !== 'object') return false
  const state = value as RaceTyreState
  return state.version === 1 && [state.distanceKm, state.equivalentKm, state.life, state.surfaceC, state.coreC, state.damage, state.graining].every(Number.isFinite) &&
    state.distanceKm >= 0 && state.equivalentKm >= 0 && state.life >= 0 && state.life <= 1 && state.damage >= 0 && state.damage <= 1 && state.graining >= 0 && state.graining <= 1 && state.surfaceC >= -50 && state.surfaceC <= 250 && state.coreC >= -50 && state.coreC <= 250
}
export function raceTyreGrip(state: RaceTyreState, category: RaceTyreCategory, compound: RaceTyreCompound, oval = false) {
  const profile = raceTyreProfile(category, compound, oval), wear = 1 - state.life
  const cold = Math.max(0, profile.optimumC - profile.windowC - Math.min(state.surfaceC, state.coreC + 12))
  const hot = Math.max(0, Math.max(state.surfaceC, state.coreC) - profile.optimumC - profile.windowC)
  const thermal = Math.max(cold / 90, hot / 75, state.graining * 0.14)
  const cliff = Math.max(0, wear - profile.cliffAt) / (1 - profile.cliffAt)
  return profile.freshGrip * clamp((1 - profile.normalLoss * wear - profile.cliffLoss * cliff ** 1.6) * (1 - Math.min(0.30, thermal)) * (1 - state.damage * 0.08), 0.45, 1)
}
export function advanceRaceTyre(state: RaceTyreState, input: {
  category: RaceTyreCategory; compound: RaceTyreCompound; oval?: boolean
  seconds: number; distanceM: number; speedMps: number; demand: number; massRatio: number
  management: number; pace: 'push' | 'standard' | 'save' | 'defend'; trackC: number; wet: boolean
}): RaceTyreState {
  const profile = raceTyreProfile(input.category, input.compound, input.oval)
  const dt = Math.max(0, input.seconds), distanceKm = Math.max(0, input.distanceM) / 1000
  const demand = clamp(input.demand, 0, 1.5), moving = clamp(input.speedMps / 18, 0, 1)
  const dryWet = input.compound === 'wet' && !input.wet
  const targetC = input.trackC + moving * (input.wet ? 30 : 45) + demand * (input.wet ? 14 : 30) + (dryWet ? 25 : 0)
  const surfaceC = clamp(state.surfaceC + (targetC - state.surfaceC) * (1 - Math.exp(-dt / (targetC > state.surfaceC ? 24 : 45))), -50, 250)
  const coreC = clamp(state.coreC + (surfaceC - state.coreC) * (1 - Math.exp(-dt / 110)), -50, 250)
  const overheat = Math.max(0, Math.max(surfaceC, coreC) - profile.optimumC - profile.windowC)
  const cold = Math.max(0, profile.optimumC - profile.windowC - coreC)
  const pace = { push: 1.16, standard: 1, save: 0.80, defend: 1.05 }[input.pace]
  const work = (0.68 + 0.40 * demand ** 2) * clamp(input.massRatio, 0.65, 1.5) ** 0.65
  const equivalent = distanceKm * work * (1.25 - clamp(input.management, 0, 1.2) * 0.30) * pace * (1 + overheat / 45) * (dryWet ? 3.8 : 1)
  const damage = clamp(state.damage + equivalent / profile.lifeKm * overheat / 45, 0, 1)
  const graining = clamp(state.graining + distanceKm / profile.lifeKm * (cold / 15 * demand - (cold === 0 ? 0.7 : 0)), 0, 1)
  return { version: 1, distanceKm: state.distanceKm + distanceKm, equivalentKm: state.equivalentKm + equivalent,
    life: Math.max(0, state.life - equivalent / profile.lifeKm), surfaceC, coreC, damage, graining }
}
