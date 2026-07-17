import type { KnockoutQualifying } from './qualifying'
import { QUALIFYING_BREAK_SECONDS } from './sessionRules'
import type {
  TimedSessionPlan,
  TimedSessionSegmentPlan,
} from '../types'

export function buildTimedSessionPlan(
  qualifying: KnockoutQualifying,
): TimedSessionPlan {
  let cursor = 0
  const segments = qualifying.segments.map<TimedSessionSegmentPlan>(
    (segment, index) => {
      const suspensionStartsAtSeconds =
        segment.suspensionSeconds > 0
          ? cursor + segment.sessionDurationSeconds * 0.55
          : null
      const suspensionEndsAtSeconds =
        suspensionStartsAtSeconds === null
          ? null
          : suspensionStartsAtSeconds + segment.suspensionSeconds
      const endsAtSeconds =
        cursor + segment.sessionDurationSeconds + segment.suspensionSeconds
      const plan: TimedSessionSegmentPlan = {
        compound: segment.results[0]?.compound ?? 'S',
        declaredWet: segment.weather !== 'clear',
        endsAtSeconds,
        name: segment.name,
        participantDriverIds: segment.results.map((result) => result.driverId),
        startsAtSeconds: cursor,
        suspensionEndsAtSeconds,
        suspensionStartsAtSeconds,
      }

      cursor =
        endsAtSeconds +
        (index < qualifying.segments.length - 1 ? QUALIFYING_BREAK_SECONDS : 0)

      return plan
    },
  )

  return { segments, totalDurationSeconds: cursor }
}

export function timedSessionStateAt(
  plan: TimedSessionPlan | null | undefined,
  elapsedSeconds: number,
) {
  const segment =
    plan?.segments.find(
      (candidate) =>
        elapsedSeconds >= candidate.startsAtSeconds &&
        elapsedSeconds < candidate.endsAtSeconds,
    ) ?? null
  const suspended = Boolean(
    segment &&
      segment.suspensionStartsAtSeconds !== null &&
      segment.suspensionEndsAtSeconds !== null &&
      elapsedSeconds >= segment.suspensionStartsAtSeconds &&
      elapsedSeconds < segment.suspensionEndsAtSeconds,
  )

  return { segment, suspended }
}
