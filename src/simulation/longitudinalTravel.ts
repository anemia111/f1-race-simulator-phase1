/** Position and terminal velocity have different jobs. Never feed mean travel
 * speed back as the next force solver's initial speed in unrestricted motion. */
export function resolvedTerminalSpeedKph(options: {
  requestedDistanceM: number
  resolvedDistanceM: number
  forceEndSpeedKph: number
  startSpeedKph: number
  deltaSeconds: number
}) {
  const constrained = options.resolvedDistanceM + 1e-6 < options.requestedDistanceM
  if (!constrained) return Math.max(0, options.forceEndSpeedKph)
  if (options.deltaSeconds <= 0) return Math.max(0, options.startSpeedKph)
  // An occupancy clamp can cover emergency closure plus subsequent following
  // within one tick. Assuming uniform deceleration over the entire tick can
  // then produce a negative terminal speed and park a rolling queue. Use the
  // resolved travel pace as a conservative external cap instead. This is not
  // additional tyre braking, and cannot be credited as recovered energy.
  const meanSpeedKph = options.resolvedDistanceM * 3.6 / options.deltaSeconds
  return Math.max(0, Math.min(options.forceEndSpeedKph, meanSpeedKph))
}
