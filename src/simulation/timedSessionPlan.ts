import type { KnockoutQualifying } from './qualifying'
import { QUALIFYING_BREAK_SECONDS } from './sessionRules'
import type {
  TimedSessionPlan,
  TimedSessionSegmentPlan,
} from '../types'

export function buildTimedSessionPlan(
  qualifying: KnockoutQualifying,
  breakSeconds = QUALIFYING_BREAK_SECONDS,
  format: 'knockout' | 'single-session' | 'grouped' = 'knockout',
): TimedSessionPlan {
  let cursor = 0
  const segments: TimedSessionSegmentPlan[] = []

  const appendSegment = (
    segment: KnockoutQualifying['segments'][number],
    options: {
      displayLabel?: string
      durationSeconds?: number
      id?: string
      participantDriverIds?: string[]
      promotionGroups?: TimedSessionSegmentPlan['promotionGroups']
      selectFromPrevious?: boolean
      suspensionSeconds?: number
    } = {},
  ) => {
      const durationSeconds =
        options.durationSeconds ?? segment.sessionDurationSeconds
      const suspensionSeconds =
        options.suspensionSeconds ?? segment.suspensionSeconds
      const suspensionStartsAtSeconds =
        suspensionSeconds > 0
          ? cursor + durationSeconds * 0.55
          : null
      const suspensionEndsAtSeconds =
        suspensionStartsAtSeconds === null
          ? null
          : suspensionStartsAtSeconds + suspensionSeconds
      const endsAtSeconds =
        cursor + durationSeconds + suspensionSeconds
      const plan: TimedSessionSegmentPlan = {
        compound: segment.results[0]?.compound ?? 'S',
        declaredWet: segment.weather !== 'clear',
        displayLabel: options.displayLabel,
        endsAtSeconds,
        id: options.id ?? segment.name,
        name: segment.name,
        participantDriverIds:
          options.participantDriverIds ??
          segment.results.map((result) => result.driverId),
        promotionGroups: options.promotionGroups,
        selectFromPrevious: options.selectFromPrevious,
        startsAtSeconds: cursor,
        suspensionEndsAtSeconds,
        suspensionStartsAtSeconds,
      }

      cursor = endsAtSeconds
      segments.push(plan)
  }

  qualifying.segments.forEach((segment, index) => {
    if (format === 'grouped' && index === 0) {
      const groups = ['A', 'B'] as const
      const groupDurationSeconds = segment.sessionDurationSeconds / groups.length

      groups.forEach((group, groupIndex) => {
        appendSegment(segment, {
          displayLabel: `${segment.name} GROUP ${group}`,
          durationSeconds: groupDurationSeconds,
          id: `${segment.name}-${group}`,
          participantDriverIds: segment.results
            .filter((result) => result.qualifyingGroup === group)
            .map((result) => result.driverId),
          selectFromPrevious: false,
          suspensionSeconds: groupIndex === 0 ? segment.suspensionSeconds : 0,
        })
      })
    } else {
      const openingSegment = qualifying.segments[0]
      const nextParticipantIds = new Set(
        segment.results.map((result) => result.driverId),
      )
      const promotionGroups =
        format === 'grouped' && index === 1
          ? (['A', 'B'] as const).map((group) => {
              const participantDriverIds = openingSegment.results
                .filter((result) => result.qualifyingGroup === group)
                .map((result) => result.driverId)

              return {
                advanceCount: participantDriverIds.filter((driverId) =>
                  nextParticipantIds.has(driverId),
                ).length,
                participantDriverIds,
              }
            })
          : undefined

      appendSegment(segment, { promotionGroups })
    }

    if (index < qualifying.segments.length - 1) {
      cursor += breakSeconds
    }
  })

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
