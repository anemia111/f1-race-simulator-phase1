/** SIM closing-speed control; final geometric occupancy remains a separate guard. */
export function followingDemand(options: {
  speedKph: number
  aheadSpeedKph: number
  distanceM: number
  lateralSeparationM: number
  /** Observed braking, expressed in this category's available deceleration. */
  aheadDecelerationMps2?: number
}) {
  if (!Number.isFinite(options.distanceM) || options.distanceM <= 0 ||
      Math.abs(options.lateralSeparationM) >= 2.2) {
    return { decelerationMps2: 0, throttleScale: 1 }
  }
  const speed = Math.max(0, options.speedKph / 3.6)
  const aheadSpeed = Math.max(0, options.aheadSpeedKph / 3.6)
  const clearDistance = Math.max(0.1, options.distanceM - 5.6)
  // A physical clearance buffer, not the old 0.35-second preferred headway.
  // Being inside a preferred gap at matched speed must not brake an entire train.
  const buffer = 2 + speed * 0.04
  const availableDistance = Math.max(0.25, clearDistance - buffer)
  const closing = Math.max(0, speed - aheadSpeed)
  const closureBrake = closing * closing / (2 * availableDistance)
  const clearanceBrake = Math.max(0, buffer - clearDistance) / 0.5 ** 2
  const aheadBraking = Math.max(0, options.aheadDecelerationMps2 ?? 0)
  // Respond immediately to visible braking. Include the road the front car
  // still travels while stopping; a distant car braking is not a stationary wall.
  const frontStoppingDistance = aheadSpeed < 0.5 ? 0
    : aheadBraking > 0.5 ? aheadSpeed * aheadSpeed / (2 * aheadBraking) : Infinity
  const stoppingBrake = speed * speed / (2 * (availableDistance + frontStoppingDistance))
  const decelerationMps2 = Math.max(closureBrake, clearanceBrake, stoppingBrake)
  return {
    decelerationMps2,
    throttleScale: Math.min(1, Math.max(0, 1 - decelerationMps2 / 8)),
  }
}
