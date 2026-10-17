import type { CarSnapshot, LapRecord, RaceSnapshot } from '../types'

export type QualifyingReference = {
  driverId: string
  code: string
  position: number
  kind: 'leader' | 'cutoff' | 'personal'
  lap: LapRecord
}

export type QualifyingCard = {
  segment: string
  driverId: string
  startedAt: number
  car: CarSnapshot
  position: number | null
  reference: QualifyingReference | null
  sectors: Array<number | null>
  colors: Array<'purple' | 'green' | 'yellow' | 'pending'>
  clockSeconds: number
  deltaSeconds: number | null
  split: number | null
  result: LapRecord | null
  holdUntilMs: number | null
}

const validLaps = (car: CarSnapshot, segment: string) => car.lapHistory.filter(lap =>
  lap.segment === segment && lap.isValid && !lap.pitStop && Number.isFinite(lap.lapTimeSeconds))

function bestLap(car: CarSnapshot, segment: string) {
  return validLaps(car, segment).sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)[0] ?? null
}

/** Display-only direction. Never changes the simulated car, clock or classification. */
export function updateQualifyingCards(
  previous: readonly QualifyingCard[], snapshot: RaceSnapshot,
  segment: string, advanceCount: number | null, nowMs: number,
): QualifyingCard[] {
  if (previous.some(card => card.startedAt > snapshot.elapsedSeconds)) previous = []
  segment = segment || previous[0]?.segment || ''
  const participants = new Set(snapshot.timedParticipantDriverIds)
  const field = snapshot.cars.filter(car => participants.has(car.driverId))
  const ranked = field.map(car => ({ car, lap: bestLap(car, segment) }))
    .filter((entry): entry is { car: CarSnapshot; lap: LapRecord } => entry.lap !== null)
    .sort((a, b) => a.lap.lapTimeSeconds - b.lap.lapTimeSeconds ||
      (a.car.timedSegmentBestSetAtSeconds?.[segment] ?? Infinity) -
      (b.car.timedSegmentBestSetAtSeconds?.[segment] ?? Infinity))
  const positionFor = (id: string) => {
    const index = ranked.findIndex(entry => entry.car.driverId === id)
    return index < 0 ? null : index + 1
  }
  const referenceFor = (car: CarSnapshot): QualifyingReference | null => {
    const position = positionFor(car.driverId)
    const outside = advanceCount !== null && (position === null || position > advanceCount)
    const cutoff = outside ? ranked[(advanceCount ?? 0) - 1] : undefined
    const entry = cutoff ?? ranked[0]
    if (!entry) return null
    return { driverId: entry.car.driverId, code: entry.car.code,
      position: positionFor(entry.car.driverId)!, lap: entry.lap,
      kind: cutoff ? 'cutoff' : entry.car.driverId === car.driverId ? 'personal' : 'leader' }
  }
  const build = (car: CarSnapshot, startedAt: number, reference: QualifyingReference | null,
    result: LapRecord | null = null, holdUntilMs: number | null = null): QualifyingCard => {
    const sectors = result ? result.sectors : car.currentLapSectorTimes
    const before = (candidate: LapRecord) => candidate.completedAtSeconds === undefined ||
      candidate.completedAtSeconds <= startedAt
    const personal = validLaps(car, segment).filter(before)
    const colors = sectors.map((time, index) => {
      if (time === null || !Number.isFinite(time)) return 'pending' as const
      const fastest = Math.min(...field.flatMap(other => validLaps(other, segment)
        .map(lap => lap.sectors[index] ?? Infinity)))
      const own = Math.min(...personal.map(lap => lap.sectors[index] ?? Infinity))
      if (time <= fastest + 0.0005) return 'purple' as const
      return time < own ? 'green' as const : 'yellow' as const
    })
    let split: number | null = null
    for (let index = 0; index < sectors.length; index++) {
      if (sectors[index] === null) break
      split = index + 1
    }
    const deltaSeconds = reference && (!result || result.isValid) && split !== null &&
      reference.lap.sectors.slice(0, split).length === split
      ? sectors.slice(0, split).reduce<number>((sum, time) => sum + (time ?? 0), 0) -
        reference.lap.sectors.slice(0, split).reduce((sum, time) => sum + time, 0)
      : null
    return { segment: result?.segment ?? segment, driverId: car.driverId, startedAt, car, reference, position: positionFor(car.driverId),
      sectors, colors, clockSeconds: result?.lapTimeSeconds ?? Math.max(0, snapshot.elapsedSeconds - startedAt),
      deltaSeconds: result?.isValid && reference ? result.lapTimeSeconds - reference.lap.lapTimeSeconds : deltaSeconds,
      split, result, holdUntilMs }
  }
  const held: QualifyingCard[] = []
  for (const card of previous) {
    if (card.holdUntilMs !== null) {
      if (nowMs < card.holdUntilMs) held.push(card)
      continue
    }
    const car = snapshot.cars.find(car => car.driverId === card.driverId)
    const result = car?.lapHistory.find(lap => lap.segment === card.segment &&
      lap.completedAtSeconds !== undefined && lap.completedAtSeconds > card.startedAt)
    if (car && result) held.push(build(car, card.startedAt, card.reference, result, nowMs + 3000))
  }
  const active = field.filter(car => car.status === 'running' && car.timedRunPhase === 'attack-lap' &&
    car.lapStartedAtSeconds !== null && !car.hiddenFromTrack &&
    !held.some(card => card.driverId === car.driverId))
    // Remaining lap fraction times recent pace is an editorial ETA, never a timing measurement.
    .sort((a, b) => (1 - a.progress) * a.projectedLapTime - (1 - b.progress) * b.projectedLapTime ||
      a.driverId.localeCompare(b.driverId))
  const live = active.slice(0, Math.max(0, 3 - held.length)).map(car => {
    const startedAt = car.lapStartedAtSeconds!
    // The live qualifying order can change during an attack. Resolve both
    // the comparison driver and their current best lap on every update.
    // Finished cards still keep the comparison shown at the timing line.
    return build(car, startedAt, referenceFor(car))
  })
  // Keep finished cards in their physical slot; replace free slots in finish order.
  const cards: QualifyingCard[] = []
  for (let slot = 0; slot < 3; slot++) {
    const heldCard = previous[slot] && held.find(card => card.driverId === previous[slot].driverId)
    const card = heldCard ?? live.shift() ?? held.find(card => !cards.includes(card))
    if (card && !cards.includes(card)) cards.push(card)
  }
  return cards
}
