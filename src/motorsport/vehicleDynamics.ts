import { wakeDownforceMultiplier, wakeDragReduction } from '../simulation/wakeModel'
import { clamp } from './coursePhysics'
import { initialRaceTyre, raceTyreGrip } from '../simulation/raceTyres'
import type { MotorsportCar, MotorsportClass, MotorsportMachine, MotorsportRaceConfig } from './types'

/** SIM tyre curve; individual supplier temperature/compound maps are private. */
export function tyreGripScale(car: MotorsportCar, weather: MotorsportRaceConfig['weather'], classId: MotorsportMachine['classId'] = 'gt300', oval = false) {
  const compound = car.tyreSets.at(-1)?.compound ?? 'primary'
  const surface = weather === 'wet' ? compound === 'wet' ? 0.73 : 0.48 : compound === 'wet' ? 0.78 : 1
  const state = car.tyreState ? { ...car.tyreState, life: car.tyreLife, surfaceC: car.tyreTemperatureC } : initialRaceTyre(car.tyreTemperatureC, car.tyreLife)
  return raceTyreGrip(state, classId, compound, oval) * surface
}
/** SIM coefficient priors, not measured wind-tunnel maps or speed bonuses. */
export const categoryWake = {
  kyojo: {dragReduction:0.14,downforceSensitivity:0.3},
  gt500: {dragReduction:0.10,downforceSensitivity:1.25},
  gt300: {dragReduction:0.14,downforceSensitivity:0.7},
  hypercar: {dragReduction:0.09,downforceSensitivity:1.3},
  lmgt3: {dragReduction:0.14,downforceSensitivity:0.7},
  lmp2: {dragReduction:0.10,downforceSensitivity:1.35},
  indycar: {dragReduction:0.09,downforceSensitivity:1.4},
} satisfies Record<MotorsportClass,{dragReduction:number;downforceSensitivity:number}>

export function trafficAero(gapM: number, lateralM: number, speedMps: number, radiusM = 1200,
  classId: MotorsportClass = 'gt300', oval = false) {
  if(speedMps<=0 || gapM<=0) return {dragScale:1,liftScale:1}
  const profile = categoryWake[classId]
  const dragReduction = classId==='indycar' && oval ? 0.14 : profile.dragReduction
  const curvature = clamp(120 / Math.max(1,radiusM),0,1)
  // At low speed there is little usable wake; aerodynamic forces still scale v².
  const exposure = clamp((speedMps-8)/22,0,1)
  const observation = { gapSeconds: gapM / Math.max(1,speedMps), lateralSeparationM: lateralM,
    curvature, straightness: 1-curvature }
  return { dragScale: 1-wakeDragReduction(observation,dragReduction*exposure,dragReduction),
    liftScale: wakeDownforceMultiplier(observation,profile.downforceSensitivity*exposure) }
}
