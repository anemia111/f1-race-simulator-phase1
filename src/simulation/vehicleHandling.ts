import type { CategoryPhysicsProfile } from './categoryPhysics'

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
export type WheelHandlingState = {
  slipRatio: number; slipAngleRad: number; surfaceC: number; coreC: number
  wear: number; loadN: number; slipWorkJ: number
}
/** Reduced-order dynamic model. Parameters are SIM priors, never measured tyre maps. */
export type VehicleHandlingState = {
  version: 1; yawRate: number; headingError: number; lateralSpeed: number; lateralOffset: number
  steeringRad: number; lateralAcceleration: number; longitudinalAcceleration: number
  rollRad: number; rollRate: number; pitchRad: number; pitchRate: number; heaveM: number; heaveSpeed: number
  brakeTemperatureC: number; gear: number; shiftRemaining: number; shiftTarget: number
  wheels: WheelHandlingState[]; intervention: 'none' | 'traction' | 'brake-release'
}
export function initialVehicleHandling(offset = 0, temperatureC = 70): VehicleHandlingState {
  return { version: 1, yawRate: 0, headingError: 0, lateralSpeed: 0, lateralOffset: offset,
    steeringRad: 0, lateralAcceleration: 0, longitudinalAcceleration: 0,
    rollRad: 0, rollRate: 0, pitchRad: 0, pitchRate: 0, heaveM: 0, heaveSpeed: 0,
    brakeTemperatureC: 460, gear: 1, shiftRemaining: 0, shiftTarget: 1,
    wheels: Array.from({ length: 4 }, () => ({ slipRatio: 0, slipAngleRad: 0, surfaceC: temperatureC, coreC: temperatureC, wear: 0, loadN: 0, slipWorkJ: 0 })), intervention: 'none' }
}
export function validVehicleHandling(value: unknown): value is VehicleHandlingState {
  if (!value || typeof value !== 'object') return false
  const s = value as VehicleHandlingState
  const finite = (o: object) => Object.values(o).every(v => typeof v !== 'number' || Number.isFinite(v))
  const required = ['yawRate','headingError','lateralSpeed','lateralOffset','steeringRad','lateralAcceleration','longitudinalAcceleration','rollRad','rollRate','pitchRad','pitchRate','heaveM','heaveSpeed','brakeTemperatureC','gear','shiftRemaining','shiftTarget'] as const
  return s.version === 1 && required.every(key => typeof s[key] === 'number' && Number.isFinite(s[key])) && finite(s) && ['none','traction','brake-release'].includes(s.intervention) && Array.isArray(s.wheels) && s.wheels.length === 4 &&
    s.wheels.every(w => w && typeof w === 'object' && ['slipRatio','slipAngleRad','surfaceC','coreC','wear','loadN','slipWorkJ'].every(key => typeof w[key as keyof WheelHandlingState] === 'number' && Number.isFinite(w[key as keyof WheelHandlingState])) && finite(w) && Math.abs(w.slipRatio) <= 3 && Math.abs(w.slipAngleRad) <= 1.3 && w.surfaceC >= -50 && w.surfaceC <= 250 && w.coreC >= -50 && w.coreC <= 250 && w.wear >= 0 && w.wear <= 1 && w.loadN >= 0 && w.slipWorkJ >= 0) &&
    Math.abs(s.headingError) <= 1.3 && Math.abs(s.lateralSpeed) <= 50 && Math.abs(s.yawRate) <= 5 &&
    s.brakeTemperatureC >= -50 && s.brakeTemperatureC <= 1250 && Number.isInteger(s.gear) && s.gear >= 1 && s.gear <= 8 && Number.isInteger(s.shiftTarget) && s.shiftTarget >= 1 && s.shiftTarget <= 8 && s.shiftRemaining >= 0 && s.shiftRemaining <= 1
}
/** A tyre change preserves the chassis, gearbox and brake state. */
export function replaceHandlingTyres(s: VehicleHandlingState | undefined, temperatureC: number): VehicleHandlingState | undefined {
  return s ? { ...s, wheels: initialVehicleHandling(0, temperatureC).wheels } : undefined
}
export function handlingSlip(s: VehicleHandlingState | undefined) {
  return { drive: s ? Math.max(0, ...s.wheels.slice(2).map(w => w.slipRatio)) : 0,
    brake: s ? Math.max(0, ...s.wheels.map(w => -w.slipRatio)) : 0 }
}
/** Peak and post-peak grip; the existing tyre model still owns compound/wear grip. */
export function handlingGrip(s: VehicleHandlingState | undefined) {
  if (!s) return 1
  const spread = Math.max(...s.wheels.map(w => w.surfaceC)) - Math.min(...s.wheels.map(w => w.surfaceC))
  return clamp(1 - Math.max(0, Math.max(...s.wheels.map(w => Math.abs(w.slipRatio))) - 0.12) * 0.28 - spread * 0.0015 - Math.max(...s.wheels.map(w => w.wear)) * 0.04, 0.55, 1)
}

export function advanceVehicleHandling(previous: VehicleHandlingState, input: {
  seconds: number; speedMps: number; massKg: number; physics: CategoryPhysicsProfile
  curvature: number; desiredOffset: number; actualOffset: number; grip: number
  downforceN: number; driveForceN: number; brakeForceN: number; requestedDriveN: number
  tractionLimitN: number; requestedBrakeN?: number; brakeBiasPercent?: number; accelerationMps2: number; brakeWorkMJ: number
  trackC: number; airC: number; wet: boolean; differentialPercent: number
  frontDriveFraction?: number; crosswindMps?: number; roadBumpM?: number
}): VehicleHandlingState {
  const s: VehicleHandlingState = { ...previous, lateralOffset: input.actualOffset, wheels: previous.wheels.map(w => ({ ...w })) }
  const p = input.physics, mass = Math.max(1, input.massKg), v = Math.max(0, input.speedMps)
  const count = Math.max(1, Math.ceil(Math.max(0, input.seconds) / 0.01)), dt = input.seconds / count
  const frontLength = p.wheelbaseM * 0.55, rearLength = p.wheelbaseM * 0.45
  const yawInertia = mass * p.wheelbaseM ** 2 * 0.22
  for (let tick = 0; tick < count; tick++) {
    const laneError = clamp(input.desiredOffset - s.lateralOffset, -8, 8)
    const desiredHeading = clamp(laneError / Math.max(12, v * 0.65), -0.16, 0.16)
    const bodySlip = Math.atan2(s.lateralSpeed, Math.max(3, v))
    const steerTarget = clamp(Math.atan(p.wheelbaseM * input.curvature) + bodySlip +
      (desiredHeading - s.headingError) * 1.2 - (s.yawRate - v * input.curvature) * 0.6, -0.65, 0.65)
    const steeringRate = Math.abs(s.headingError) > 0.1 ? 2.5 : 1.4
    s.steeringRad += clamp(steerTarget - s.steeringRad, -steeringRate * dt, steeringRate * dt)
    const frontSlip = clamp(s.steeringRad - Math.atan2(s.lateralSpeed + frontLength * s.yawRate, Math.max(3, v)), -1.2, 1.2)
    const rearSlip = clamp(-Math.atan2(s.lateralSpeed - rearLength * s.yawRate, Math.max(3, v)), -1.2, 1.2)
    const normal = mass * 9.80665 + Math.max(0, input.downforceN)
    const longitudinalTransfer = mass * input.accelerationMps2 * p.centreOfGravityHeightM / p.wheelbaseM
    const sideTransfer = mass * s.lateralAcceleration * p.centreOfGravityHeightM / p.trackWidthM
    const frontLoad = clamp(normal * 0.45 - longitudinalTransfer, normal * 0.15, normal * 0.85)
    const loads = [frontLoad / 2 - sideTransfer / 2, frontLoad / 2 + sideTransfer / 2,
      (normal - frontLoad) / 2 - sideTransfer / 2, (normal - frontLoad) / 2 + sideTransfer / 2]
    const axleForces = [0, 0]
    for (let wheel = 0; wheel < 4; wheel++) {
      const w = s.wheels[wheel], front = wheel < 2
      w.loadN = Math.max(normal * 0.01, loads[wheel])
      const mu = p.peakTyreFrictionCoefficient * input.grip * Math.pow(w.loadN / Math.max(1, mass * 9.80665 / 4), -p.tyreLoadSensitivity)
      const available = Math.max(1, mu * w.loadN)
      const frontFraction = input.frontDriveFraction ?? 0
      // A limited-slip differential transfers demand away from the unloaded wheel.
      const axleLoad = front ? frontLoad : normal - frontLoad
      const locking = clamp(input.differentialPercent / 100, 0, 1)
      const share = (1 - locking) * 0.5 + locking * w.loadN / Math.max(1, axleLoad)
      const driveRequest = input.requestedDriveN * (front ? frontFraction : 1 - frontFraction) * share
      const bias = clamp((input.brakeBiasPercent ?? 56) / 100, 0.3, 0.8)
      const brakeShare = front ? bias : 1 - bias
      const brakeRequest = (input.requestedBrakeN ?? input.brakeForceN) * brakeShare * 0.5
      // Sliding is driven by demand above the remaining friction ellipse,
      // including turning load; clipping the delivered force must not erase it.
      const lateralDemand = Math.min(available * 0.995, Math.abs(s.lateralAcceleration) * mass * w.loadN / normal)
      const longitudinalCapacity = Math.max(1, Math.sqrt(available ** 2 - lateralDemand ** 2))
      const ratio = (driveRequest - brakeRequest) / longitudinalCapacity
      const targetSlip = clamp(0.08 * ratio + Math.sign(ratio) * Math.max(0, Math.abs(ratio) - 1) * 0.24, -2.5, 2.5)
      const relaxation = 1 - Math.exp(-dt * Math.max(3, v) / 0.6)
      w.slipRatio += (targetSlip - w.slipRatio) * relaxation
      w.slipAngleRad += ((front ? frontSlip : rearSlip) - w.slipAngleRad) * relaxation
      const fx = clamp(input.driveForceN * (front ? frontFraction : 1 - frontFraction) * share - input.brakeForceN * brakeShare * 0.5, -available, available)
      const lateralCapacity = Math.sqrt(Math.max(0, available ** 2 - fx ** 2))
      const fy = lateralCapacity * Math.tanh(w.slipAngleRad / 0.075)
      axleForces[front ? 0 : 1] += fy
      const slipPowerW = Math.abs(fx * w.slipRatio * v) + Math.abs(fy * Math.tan(w.slipAngleRad) * v)
      w.slipWorkJ += slipPowerW * dt
      const surfaceHeat = slipPowerW * 0.08 + input.brakeWorkMJ * 1e6 / Math.max(0.01, input.seconds) * 0.012 / 4
      const transfer = (w.surfaceC - w.coreC) * 55
      const cooling = (w.surfaceC - input.airC) * (8 + v * 1.2) + (w.surfaceC - input.trackC) * (input.wet ? 75 : 15)
      w.surfaceC = clamp(w.surfaceC + (surfaceHeat - transfer - cooling) / 3500 * dt, -50, 250)
      w.coreC = clamp(w.coreC + transfer / 18000 * dt, -50, 250)
      w.wear = clamp(w.wear + slipPowerW * dt / 8e8 * (1 + Math.max(0, w.coreC - 110) / 30), 0, 1)
    }
    const [frontFy, rearFy] = axleForces
    const crosswindForce = (input.crosswindMps ?? 0) * Math.abs(input.crosswindMps ?? 0) * 0.6
    s.lateralAcceleration = (frontFy + rearFy + crosswindForce) / mass
    s.yawRate = clamp(s.yawRate + (frontFy * frontLength - rearFy * rearLength) / yawInertia * dt, -5, 5)
    s.lateralSpeed = clamp(s.lateralSpeed + (s.lateralAcceleration - v * s.yawRate) * dt, -50, 50)
    if (v < 3) { s.yawRate *= Math.exp(-dt * 5); s.lateralSpeed *= Math.exp(-dt * 5) }
    s.headingError = clamp(s.headingError + (s.yawRate - v * input.curvature) * dt, -1.2, 1.2)
    s.lateralOffset += (s.lateralSpeed * Math.cos(s.headingError) + v * Math.sin(s.headingError)) * dt
    const rollTarget = clamp(s.lateralAcceleration * p.centreOfGravityHeightM / (9.80665 * p.trackWidthM) * 0.08, -0.08, 0.08)
    const pitchTarget = clamp(-input.accelerationMps2 * p.centreOfGravityHeightM / (9.80665 * p.wheelbaseM) * 0.12, -0.06, 0.06)
    s.rollRate += (100 * (rollTarget - s.rollRad) - 16 * s.rollRate) * dt; s.rollRad += s.rollRate * dt
    s.pitchRate += (120 * (pitchTarget - s.pitchRad) - 18 * s.pitchRate) * dt; s.pitchRad += s.pitchRate * dt
    const heaveTarget = -(input.downforceN / mass) * 0.0005 + (input.roadBumpM ?? 0)
    s.heaveSpeed += (180 * (heaveTarget - s.heaveM) - 20 * s.heaveSpeed) * dt; s.heaveM += s.heaveSpeed * dt
  }
  s.longitudinalAcceleration = input.accelerationMps2
  const heatJ = input.brakeWorkMJ * 1e6
  s.brakeTemperatureC = clamp(s.brakeTemperatureC + heatJ / 14000 - (s.brakeTemperatureC - input.airC) * (0.002 + v * 0.00012) * input.seconds, -50, 1250)
  const slip = handlingSlip(s)
  s.intervention = slip.brake > 0.13 ? 'brake-release' : slip.drive > 0.10 ? 'traction' : 'none'
  return s
}
