import { wakeDownforceMultiplier, wakeDragReduction } from '../simulation/wakeModel'
import { clamp } from './coursePhysics'
import { initialRaceTyre, raceTyreGrip } from '../simulation/raceTyres'
import type { MotorsportCar, MotorsportMachine, MotorsportRaceConfig } from './types'

/** SIM tyre curve; individual supplier temperature/compound maps are private. */
export function tyreGripScale(car: MotorsportCar, weather: MotorsportRaceConfig['weather'], classId: MotorsportMachine['classId'] = 'gt300', oval = false) {
  const compound = car.tyreSets.at(-1)?.compound ?? 'primary'
  const surface = weather === 'wet' ? compound === 'wet' ? 0.73 : 0.48 : compound === 'wet' ? 0.78 : 1
  const state = car.tyreState ? { ...car.tyreState, life: car.tyreLife, surfaceC: car.tyreTemperatureC } : initialRaceTyre(car.tyreTemperatureC, car.tyreLife)
  return raceTyreGrip(state, classId, compound, oval) * surface
}

/** SIM wake coefficients, distinct from manufacturer or wind-tunnel data. */
export function trafficAero(gapM: number, lateralM: number, speedMps: number, radiusM = 1200) {
  const curvature = clamp(120 / Math.max(1,radiusM),0,1)
  const observation = { gapSeconds: gapM / Math.max(1,speedMps), lateralSeparationM: lateralM,
    curvature, straightness: 1-curvature }
  return { dragScale: 1-wakeDragReduction(observation,0.063),
    liftScale: wakeDownforceMultiplier(observation,0.9) }
}

/** Fixed ratio ladder, not corner-speed-dependent gear selection. */
export function drivetrainState(machine: MotorsportMachine, speedMps: number, previousGear: number) {
  const redline = machine.classId === 'indycar' ? 12000 : machine.classId === 'kyojo' || machine.classId === 'gt500' ? 8000 : 8500
  const topSpeed = Math.cbrt((machine.powerKw.value + (machine.classId === 'indycar' ? 89.48 : 0)) * 1000 * 0.94 / (0.5 * 1.225 * machine.dragAreaM2.value)) * 1.04
  const rpmFor = (gear: number) => Math.max(redline * 0.25, speedMps / (topSpeed / 1.34 ** (machine.gears.value - gear)) * redline)
  let gear = clamp(previousGear, 1, machine.gears.value)
  if (rpmFor(gear) > redline * 0.96 && gear < machine.gears.value) gear++
  else if (rpmFor(gear) < redline * 0.58 && gear > 1) gear--
  return { gear, rpm: Math.round(rpmFor(gear)), redline }
}
