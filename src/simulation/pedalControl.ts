/** Driver pedal travel, in percent/second. These are SIM control parameters,
 * not measured driver traces. Forces must be computed from the returned pedals. */
export function advancePedals(input: {
  throttle: number; brake: number; previousThrottle: number; previousBrake: number
  seconds: number; carbonBrakes?: boolean; stop?: boolean
  pickupRateScale?: number
  style?: {brakeReleaseScale:number;throttleRiseScale:number;throttleCeiling:number}
  feedback?: { lateralUse: number; driveSlip: number; brakeSlip: number; skill: number; brakeSkill?:number }
}): { throttle: number; brake: number } {
  const bound = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0))
  if (input.stop) return { throttle: 0, brake: 100 }
  const dt = Math.max(0, input.seconds)
  const move = (previous: number, target: number, rise: number, fall: number) =>
    bound(previous + Math.max(-fall * dt, Math.min(rise * dt, target - previous)))
  const feedback = input.feedback
  const skill = Math.max(0, Math.min(1.2, feedback?.skill ?? 1))
  const brakeSkill = Math.max(0,Math.min(1.2,feedback?.brakeSkill??skill))
  const lateralUse = Math.max(0, Math.min(1, feedback?.lateralUse ?? 0))
  const execution = skill / 1.2
  const brakeTarget = bound(input.brake) * (feedback ? Math.max(0.35, 1 - Math.max(0, feedback.brakeSlip - 0.11) * (2.4 + brakeSkill)) : 1)
  const brake = move(bound(input.previousBrake), brakeTarget, input.carbonBrakes ? 650 : 450, (feedback ? 130 + 110 * brakeSkill : 260)*(input.style?.brakeReleaseScale??1))
  // A lift is faster than opening the throttle. Brake release and traction
  // demand govern pickup rather than alternating full pedals every tick.
  // Skilled drivers reserve less unused torque while cornering, but notice
  // wheelspin earlier and lift more precisely. This changes pedals only;
  // the friction ellipse and available engine torque remain authoritative.
  const tractionCorrection = feedback ? Math.max(0.15, 1 - Math.max(0, feedback.driveSlip - (0.105 - 0.03 * execution)) * (2.4 + 1.2 * skill)) : 1
  const pickupReserve = feedback ? 1 - (1 - execution) * 0.18 * lateralUse : 1
  const throttleTarget = input.brake > 3 || brake > 3 ? 0 : Math.min(bound(input.throttle),input.style?.throttleCeiling??100) * tractionCorrection * pickupReserve
  const throttle = move(bound(input.previousThrottle), throttleTarget,
    (feedback ? (60 + 140 * skill) * Math.max(0.2, 1 - lateralUse * (0.83 - 0.13 * execution)) : 200)*(input.style?.throttleRiseScale??1)*Math.max(0.25,Math.min(1,input.pickupRateScale??1)), 1200)
  return { throttle, brake }
}
