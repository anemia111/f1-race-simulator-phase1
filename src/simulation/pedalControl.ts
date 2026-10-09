/** Driver pedal travel, in percent/second. These are SIM control parameters,
 * not measured driver traces. Forces must be computed from the returned pedals. */
export function advancePedals(input: {
  throttle: number; brake: number; previousThrottle: number; previousBrake: number
  seconds: number; carbonBrakes?: boolean; stop?: boolean
}): { throttle: number; brake: number } {
  const bound = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0))
  if (input.stop) return { throttle: 0, brake: 100 }
  const dt = Math.max(0, input.seconds)
  const move = (previous: number, target: number, rise: number, fall: number) =>
    bound(previous + Math.max(-fall * dt, Math.min(rise * dt, target - previous)))
  const brake = move(bound(input.previousBrake), bound(input.brake), input.carbonBrakes ? 650 : 450, 260)
  // A lift is faster than opening the throttle. Brake release and traction
  // demand govern pickup rather than alternating full pedals every tick.
  const throttleTarget = input.brake > 3 || brake > 3 ? 0 : bound(input.throttle)
  const throttle = move(bound(input.previousThrottle), throttleTarget, 200, 1200)
  return { throttle, brake }
}
