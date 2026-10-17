import type {
  PenaltyKind,
  StewardCase,
  StewardConsequence,
} from '../types'

export type StewardPenaltyDecision = {
  kind: PenaltyKind | null
  seconds: number
  penaltyPoints: number
  reason: string
  article: string
}

const noFurtherAction = (
  reason: string,
  article: string,
): StewardPenaltyDecision => ({
  kind: null,
  seconds: 0,
  penaltyPoints: 0,
  reason,
  article,
})

const timePenalty = (
  seconds: 5 | 10,
  penaltyPoints: number,
  reason: string,
  article: string,
): StewardPenaltyDecision => ({
  kind: seconds === 5 ? 'time-5' : 'time-10',
  seconds,
  penaltyPoints,
  reason,
  article,
})

const proceduralPenalty = (
  kind: 'drive-through' | 'stop-go-10',
  penaltyPoints: number,
  reason: string,
  article: string,
): StewardPenaltyDecision => ({
  kind,
  seconds: kind === 'drive-through' ? 20 : 30,
  penaltyPoints,
  reason,
  article,
})

export function penaltyLabel(decision: StewardPenaltyDecision): string {
  if (decision.kind === null) {
    return 'no further action'
  }

  if (decision.kind === 'drive-through') {
    return 'a drive-through penalty'
  }

  if (decision.kind === 'stop-go-10') {
    return 'a 10-second stop-and-go penalty'
  }

  return `a +${decision.seconds}s penalty`
}

export function jumpStartDecision(movementMeters: number): StewardPenaltyDecision {
  const movement = Math.max(0, movementMeters)
  const article = 'B5.11.1'

  if (movement === 0) {
    return noFurtherAction('No false-start movement detected', article)
  }

  if (movement <= 0.25) {
    return timePenalty(5, 0, 'False start / incorrect starting location', article)
  }

  if (movement <= 1) {
    return timePenalty(10, 0, 'False start / incorrect starting location', article)
  }

  if (movement <= 3) {
    return proceduralPenalty('drive-through', 0, 'False start / incorrect starting location', article)
  }

  return proceduralPenalty('stop-go-10', 0, 'False start / incorrect starting location', article)
}

/**
 * 2026 Penalty Guidelines: the third track-limit offence earns a black and
 * white flag; the fourth and every subsequent offence earns another 5s.
 */
export function trackLimitPenaltyFromWarnings(warnings: number): number {
  return Math.max(0, Math.floor(warnings) - 3) * 5
}

export function collisionDecision(stewardCase: StewardCase): StewardPenaltyDecision {
  const article =
    stewardCase.article ||
    (stewardCase.offence === 'forcing-off-track'
      ? 'ISC App. L Ch. IV 2(b)'
      : 'ISC App. L Ch. IV 2(d)')

  // A driver must be predominantly responsible before a sporting penalty is
  // imposed. Shared-responsibility racing incidents remain no further action.
  if (stewardCase.responsibilityShare < 0.51) {
    return noFurtherAction('Racing incident - no predominant responsibility', article)
  }

  const reason =
    stewardCase.offence === 'forcing-off-track'
      ? 'Forcing another driver off the track'
      : 'Causing a collision'

  switch (stewardCase.consequence) {
    case 'none':
      return stewardCase.responsibilityShare >= 0.8
        ? timePenalty(5, 0, reason, article)
        : noFurtherAction('Minor contact with no immediate sporting consequence', article)
    case 'minor':
      return timePenalty(5, 1, reason, article)
    case 'significant':
      return timePenalty(10, 2, reason, article)
    case 'major':
      return stewardCase.responsibilityShare >= 0.82
        ? proceduralPenalty('stop-go-10', 3, reason, article)
        : proceduralPenalty('drive-through', 3, reason, article)
    case 'reckless':
      return proceduralPenalty('stop-go-10', 4, `${reason} - reckless`, article)
  }
}

export function trackExcursionDecision(options: {
  kind: 'unsafe-rejoin' | 'lasting-advantage'
  severity: StewardConsequence
  advantageSeconds?: number
}): StewardPenaltyDecision {
  if (options.kind === 'lasting-advantage') {
    const article = 'B1.9.6 / ISC App. L Ch. IV 2(c)'
    const advantage = Math.max(0, options.advantageSeconds ?? 0)

    if (advantage <= 0.15) {
      return noFurtherAction('No lasting sporting advantage retained', article)
    }

    if (options.severity === 'major' || options.severity === 'reckless') {
      return proceduralPenalty('drive-through', 0, 'Leaving the track and gaining a lasting advantage', article)
    }

    return timePenalty(
      advantage < 0.75 ? 5 : 10,
      0,
      'Leaving the track and gaining a lasting advantage',
      article,
    )
  }

  const article = 'B1.8.6 / ISC App. L Ch. IV 2(c)'

  if (options.severity === 'major' || options.severity === 'reckless') {
    return proceduralPenalty('drive-through', 2, 'Leaving the track and rejoining unsafely', article)
  }

  return timePenalty(
    options.severity === 'significant' ? 10 : 5,
    options.severity === 'significant' ? 2 : 1,
    'Leaving the track and rejoining unsafely',
    article,
  )
}

export function stewardCaseDecision(
  stewardCase: StewardCase,
): StewardPenaltyDecision {
  if (
    stewardCase.offence === 'causing-collision' ||
    stewardCase.offence === 'forcing-off-track'
  ) {
    return collisionDecision(stewardCase)
  }

  return trackExcursionDecision({
    kind:
      stewardCase.offence === 'unsafe-rejoin'
        ? 'unsafe-rejoin'
        : 'lasting-advantage',
    severity: stewardCase.consequence,
    advantageSeconds: stewardCase.advantageSeconds,
  })
}

/** Race pit-lane speeding ladder from the 2026 Penalty Guidelines. */
export function pitLaneSpeedingDecision(excessKph: number): StewardPenaltyDecision {
  const excess = Math.max(0, excessKph)
  const article = 'B1.6.3(a)(iii)'

  if (excess === 0) {
    return noFurtherAction('No pit-lane speed excess recorded', article)
  }

  if (excess < 6) {
    return timePenalty(5, 0, 'Pit-lane speeding', article)
  }

  if (excess <= 15) {
    return proceduralPenalty('drive-through', 0, 'Pit-lane speeding', article)
  }

  return proceduralPenalty('stop-go-10', 0, 'Pit-lane speeding', article)
}

export function unsafeReleaseDecision(options: {
  gapSeconds: number
  driverAtFault?: boolean
}): StewardPenaltyDecision {
  const gap = Math.max(0, options.gapSeconds)
  const points = options.driverAtFault ? (gap < 0.28 ? 2 : 1) : 0
  const article = 'B1.6.2(a)'

  if (gap >= 0.42) {
    return noFurtherAction('Pit release did not create an unsafe conflict', article)
  }

  if (gap < 0.2) {
    return proceduralPenalty('drive-through', points, 'Unsafe release', article)
  }

  return timePenalty(gap < 0.32 ? 10 : 5, points, 'Unsafe release', article)
}

export function blueFlagDecision(ignoredForSeconds: number): StewardPenaltyDecision {
  const duration = Math.max(0, ignoredForSeconds)
  const article = 'ISC App. H 2.5.5(e) / App. L Ch. IV 2(a)'

  if (duration < 5) {
    return noFurtherAction('Blue-flag compliance window not exceeded', article)
  }

  if (duration >= 12) {
    return proceduralPenalty('drive-through', 0, 'Failing to respect blue flags', article)
  }

  return timePenalty(
    duration >= 8 ? 10 : 5,
    0,
    'Failing to respect blue flags',
    article,
  )
}

export function yellowFlagDecision(doubleYellow: boolean): StewardPenaltyDecision {
  return doubleYellow
    ? proceduralPenalty(
        'stop-go-10',
        3,
        'Failing to slow for double yellow flags',
        'B1.8.4(b)/(c) / ISC App. H 2.5.5(b)',
      )
    : timePenalty(
        10,
        3,
        'Failing to slow for a single yellow flag',
        'B1.8.4(a) / ISC App. H 2.5.5(b)',
      )
}

/** B1.9.6c crossing allowance, including the final-three-lap conversion. */
export function proceduralPenaltyDeadlineLap(
  currentLap: number,
  raceLaps: number | null,
): number {
  const normalizedLap = Math.max(0, Math.floor(currentLap))
  const lapsRemaining =
    raceLaps === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, raceLaps - normalizedLap)

  return normalizedLap + (lapsRemaining <= 3 ? 3 : 2)
}

/** Red marshalling-sector ladder while a VSC is active. */
export function vscSpeedingDecision(redSectors: number): StewardPenaltyDecision {
  const count = Math.max(0, Math.floor(redSectors))
  const article = 'B5.12.2(b)'

  if (count < 2) {
    return noFurtherAction('No sanctionable VSC red-sector sequence', article)
  }

  if (count >= 6) {
    return proceduralPenalty('stop-go-10', 3, 'Exceeding the VSC speed limit', article)
  }

  if (count === 5) {
    return proceduralPenalty('drive-through', 3, 'Exceeding the VSC speed limit', article)
  }

  if (count === 4) {
    return timePenalty(10, 2, 'Exceeding the VSC speed limit', article)
  }

  return timePenalty(5, 1, 'Exceeding the VSC speed limit', article)
}

export function vscEndingDeltaDecision(redDeltaSeconds: number): StewardPenaltyDecision {
  const deficit = Math.max(0, redDeltaSeconds)
  const article = 'B5.12.2(b)'

  if (deficit === 0) {
    return noFurtherAction('VSC end delta remained compliant', article)
  }

  if (deficit > 5) {
    return proceduralPenalty('drive-through', 3, 'Exceeding the VSC minimum delta at VSC end', article)
  }

  if (deficit > 3) {
    return timePenalty(10, 2, 'Exceeding the VSC minimum delta at VSC end', article)
  }

  return timePenalty(5, 1, 'Exceeding the VSC minimum delta at VSC end', article)
}
