export type DataMode = 'SIM' | 'HIST' | 'LIVE'

export const LIVE_SAMPLE_MAX_AGE_MS = 120_000
const FUTURE_SAMPLE_TOLERANCE_MS = 5_000

export function classifyObservedDataMode(
  latestSampleDate: string | null,
  nowMs = Date.now(),
): DataMode {
  if (!latestSampleDate) {
    return 'SIM'
  }

  const sampleMs = new Date(latestSampleDate).getTime()

  if (
    !Number.isFinite(sampleMs) ||
    sampleMs > nowMs + FUTURE_SAMPLE_TOLERANCE_MS
  ) {
    return 'SIM'
  }

  return nowMs - sampleMs <= LIVE_SAMPLE_MAX_AGE_MS ? 'LIVE' : 'HIST'
}

export function resolveRequestedDataMode(options: {
  detectedMode: DataMode
  hasHistoricalData: boolean
  requestedMode: DataMode
}): DataMode {
  const { detectedMode, hasHistoricalData, requestedMode } = options

  if (requestedMode === 'SIM') {
    return 'SIM'
  }

  if (requestedMode === 'LIVE') {
    return detectedMode === 'LIVE'
      ? 'LIVE'
      : hasHistoricalData
        ? 'HIST'
        : 'SIM'
  }

  return hasHistoricalData ? 'HIST' : 'SIM'
}

export function dataModeUsesObservedTiming(mode: DataMode) {
  return mode === 'HIST' || mode === 'LIVE'
}

export function dataModeUsesObservedEnvironment(mode: DataMode) {
  return mode === 'LIVE'
}

