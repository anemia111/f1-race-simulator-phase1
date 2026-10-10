export type CourseMotionSample = { distance: number; lateral: number; pitBlend: number }
export type CourseMotionSegment = { from: CourseMotionSample; to: CourseMotionSample; startedMs: number; durationMs: number }

/** Interpolate unwrapped road distance, then evaluate the road curve. Cartesian
 * interpolation cuts through hairpins and the inside of banked oval turns. */
export function courseMotionAt(segment: CourseMotionSegment, nowMs: number): CourseMotionSample {
  const fraction = segment.durationMs > 0 ? Math.max(0, Math.min(1, (nowMs - segment.startedMs) / segment.durationMs)) : 1
  return { distance: segment.from.distance + (segment.to.distance - segment.from.distance) * fraction,
    lateral: segment.from.lateral + (segment.to.lateral - segment.from.lateral) * fraction,
    pitBlend: segment.from.pitBlend + (segment.to.pitBlend - segment.from.pitBlend) * fraction }
}

export function nextCourseMotion(previous: CourseMotionSegment | null, to: CourseMotionSample, nowMs: number, durationMs: number): CourseMotionSegment {
  const from = previous ? courseMotionAt(previous, nowMs) : to
  // Session replacement/backward import must reset rather than animate a reverse lap.
  const reset = !previous || to.distance < from.distance || to.distance - from.distance > 0.5 || durationMs <= 0
  return { from: reset ? to : from, to, startedMs: nowMs, durationMs: reset ? 0 : Math.min(250, durationMs) }
}
