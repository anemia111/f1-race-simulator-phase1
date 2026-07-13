import type { DataProvenance } from '../types'
import type { OpenF1Bundle, OpenF1CarData } from './openF1'

export type SynchronizedCarData = {
  byCode: Map<string, OpenF1CarData>
  provenance: DataProvenance
  rejectedStaleSamples: number
  targetDate: string | null
}

/**
 * Produces one coherent telemetry frame instead of mixing each driver's
 * newest sample from unrelated points in time. Samples older than the
 * tolerance are explicitly rejected and must fall back to simulation.
 */
export function buildSynchronizedCarData(
  bundle: OpenF1Bundle | null | undefined,
  toleranceMs = 5_000,
  requestedTargetDate?: string | null,
): SynchronizedCarData {
  const empty: SynchronizedCarData = {
    byCode: new Map(),
    provenance: {
      kind: 'unavailable',
      provider: 'OpenF1',
      note: 'No car_data frame available',
    },
    rejectedStaleSamples: 0,
    targetDate: null,
  }

  if (!bundle?.carData.length) {
    return empty
  }

  const requestedTargetMs = requestedTargetDate
    ? new Date(requestedTargetDate).getTime()
    : Number.POSITIVE_INFINITY
  const eligibleSamples = bundle.carData.filter(
    (sample) => new Date(sample.date).getTime() <= requestedTargetMs,
  )

  if (eligibleSamples.length === 0) {
    return empty
  }

  const targetDate = eligibleSamples.reduce(
    (latest, sample) => (sample.date > latest ? sample.date : latest),
    eligibleSamples[0].date,
  )
  const targetMs = new Date(targetDate).getTime()
  const codeByNumber = new Map(
    bundle.drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
  )
  const latestByNumber = new Map<number, OpenF1CarData>()

  for (const sample of eligibleSamples) {
    const sampleMs = new Date(sample.date).getTime()

    if (!Number.isFinite(sampleMs) || sampleMs > targetMs) {
      continue
    }

    const current = latestByNumber.get(sample.driver_number)

    if (!current || sample.date > current.date) {
      latestByNumber.set(sample.driver_number, sample)
    }
  }

  const byCode = new Map<string, OpenF1CarData>()
  let rejectedStaleSamples = 0

  for (const [driverNumber, sample] of latestByNumber) {
    const code = codeByNumber.get(driverNumber)
    const sampleMs = new Date(sample.date).getTime()

    if (!code || targetMs - sampleMs > toleranceMs) {
      rejectedStaleSamples += 1
      continue
    }

    byCode.set(code, sample)
  }

  return {
    byCode,
    provenance: {
      kind: 'observed',
      provider: 'OpenF1',
      sampledAt: targetDate,
      sessionKey: bundle.selectedSession?.session_key ?? null,
      sourceYear: bundle.year,
      note: `${byCode.size} synchronized drivers within ${toleranceMs / 1000}s`,
    },
    rejectedStaleSamples,
    targetDate,
  }
}
