/** SIM anticipatory car-following control; collision resolution is a last resort. */
export function followingDemand(options: {
  speedKph: number
  aheadSpeedKph: number
  distanceM: number
  lateralSeparationM: number
}) {
  if (!Number.isFinite(options.distanceM) || options.distanceM <= 0 ||
      Math.abs(options.lateralSeparationM) >= 2.2) {
    return { decelerationMps2: 0, throttleScale: 1 }
  }
  const speed = Math.max(0, options.speedKph / 3.6)
  const aheadSpeed = Math.max(0, options.aheadSpeedKph / 3.6)
  const gap = Math.max(0.1, options.distanceM - 5.6)
  // Retain room to steer around an obstruction, not just to touch its bumper.
  const desiredGap = 4 + speed * 0.35
  const closing = Math.max(0, speed - aheadSpeed)
  const safeSpeed = Math.max(0, aheadSpeed + (gap - desiredGap) / 1.2)
  const decelerationMps2 = Math.max(
    0,
    (speed - safeSpeed) / 0.8,
    closing * closing / (2 * Math.max(1, gap - 2)),
  )
  return {
    decelerationMps2,
    throttleScale: Math.min(1, Math.max(0, (gap - desiredGap) / Math.max(3, desiredGap))),
  }
}
