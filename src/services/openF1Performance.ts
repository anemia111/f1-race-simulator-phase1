import type {
  DataProvenance,
  Driver,
  Team,
  TireCompound,
  TrackObservedCalibration,
} from '../types'
import type { OpenF1Bundle, OpenF1StandingsSnapshot } from './openF1'

export type FieldCalibration = {
  confidence: number
  drivers: Driver[]
  provenance: DataProvenance
  referenceLapTimeSeconds: number | null
  sampleCount: number
  source: 'openf1-calibrated' | 'simulation'
  teamPaceDeltaSeconds: Record<string, number | null>
  teams: Team[]
}

type ObservedSource = Pick<OpenF1Bundle, 'carData' | 'drivers'> &
  Partial<Pick<OpenF1Bundle, 'laps' | 'pit' | 'sessionResult'>>

type StandingSource =
  | Pick<
      OpenF1Bundle,
      'drivers' | 'championshipDrivers' | 'championshipTeams'
    >
  | OpenF1StandingsSnapshot

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const FUEL_GAIN_PER_LAP_PRIOR_SECONDS = 0.04
const MIN_TIRE_OFFSET_SAMPLES = 6

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/racing bulls|rb f1 team/g, 'rb')
    .replace(/red bull racing/g, 'red bull')
    .replace(/[^a-z0-9]/g, '')

function median(values: number[]) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const center = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[center - 1] + sorted[center]) / 2
    : sorted[center]
}

function percentile(values: number[], quantile: number) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * quantile)),
  )
  return sorted[index]
}

function openF1Compound(value: string | null): TireCompound | null {
  const normalized = value?.toUpperCase() ?? ''

  if (normalized.includes('SOFT')) return 'S'
  if (normalized.includes('MEDIUM')) return 'M'
  if (normalized.includes('HARD')) return 'H'
  if (normalized.includes('INTER')) return 'I'
  if (normalized.includes('WET')) return 'W'
  return null
}

function robustSlope(samples: Array<{ x: number; y: number }>) {
  if (samples.length < 4) {
    return null
  }

  const slopes: number[] = []

  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const run = samples[right].x - samples[left].x

      if (run > 0 && run <= 8) {
        slopes.push((samples[right].y - samples[left].y) / run)
      }
    }
  }

  return median(slopes)
}

export function buildOpenF1TrackCalibration(
  bundle: OpenF1Bundle | null | undefined,
): TrackObservedCalibration {
  const unavailable: TrackObservedCalibration = {
    maxSpeedKph: null,
    medianPitStopsPerDriver: null,
    medianStintLapsByCompound: {},
    pitLaneTransitSeconds: null,
    provenance: {
      kind: 'unavailable',
      provider: 'OpenF1',
      note: 'No selected-session samples available for track calibration',
    },
    sampleCount: 0,
    sectorWeights: null,
    strategySampleCount: 0,
    trackTemperatureC: null,
    tireDegradationByCompound: {},
    tirePaceOffsetByCompound: {},
    tireSampleCountByCompound: {},
  }

  if (!bundle?.selectedSession) {
    return unavailable
  }

  const validLaps = bundle.laps.filter(
    (lap) =>
      lap.lap_duration !== null &&
      lap.lap_duration > 35 &&
      lap.lap_duration < 240 &&
      !lap.is_pit_out_lap,
  )
  const sectorRatios = validLaps.flatMap((lap) => {
    if (
      lap.duration_sector_1 === null ||
      lap.duration_sector_2 === null ||
      lap.duration_sector_3 === null
    ) {
      return []
    }

    const total =
      lap.duration_sector_1 + lap.duration_sector_2 + lap.duration_sector_3
    return total <= 0
      ? []
      : [[
          lap.duration_sector_1 / total,
          lap.duration_sector_2 / total,
          lap.duration_sector_3 / total,
        ] as [number, number, number]]
  })
  const sectorWeights: [number, number, number] | null =
    sectorRatios.length === 0
      ? null
      : [
          median(sectorRatios.map((ratio) => ratio[0])) ?? 0.33,
          median(sectorRatios.map((ratio) => ratio[1])) ?? 0.34,
          median(sectorRatios.map((ratio) => ratio[2])) ?? 0.33,
        ]
  const normalizedSectorWeights = sectorWeights
    ? (() => {
        const total = sectorWeights.reduce((sum, value) => sum + value, 0)
        return sectorWeights.map((value) => value / total) as [
          number,
          number,
          number,
        ]
      })()
    : null
  const pitLaneTransitSeconds = median(
    bundle.pit.flatMap((pit) => {
      if (pit.lane_duration === null || pit.lane_duration <= 0) {
        return []
      }

      return [
        Math.max(1, pit.lane_duration - Math.max(0, pit.stop_duration ?? 0)),
      ]
    }),
  )
  const maxSpeedKph = percentile(
    bundle.carData
      .map((sample) => sample.speed)
      .filter((speed) => speed > 80 && speed < 390),
    0.99,
  )
  const lapsByDriverAndNumber = new Map(
    validLaps.map((lap) => [`${lap.driver_number}:${lap.lap_number}`, lap]),
  )
  const fastestLapByDriver = new Map<number, number>()

  for (const lap of validLaps) {
    const duration = lap.lap_duration as number
    fastestLapByDriver.set(
      lap.driver_number,
      Math.min(fastestLapByDriver.get(lap.driver_number) ?? Infinity, duration),
    )
  }

  type TireLapSample = {
    adjustedLapTime: number
    compound: TireCompound
    driverNumber: number
    lapNumber: number
    tireAge: number
  }

  const tireLapSamples: TireLapSample[] = []
  const slopesByCompound = new Map<TireCompound, number[]>()

  for (const stint of bundle.stints) {
    const compound = openF1Compound(stint.compound)

    if (!compound) {
      continue
    }

    const samples: TireLapSample[] = []

    for (let lapNumber = stint.lap_start; lapNumber <= stint.lap_end; lapNumber += 1) {
      const lap = lapsByDriverAndNumber.get(`${stint.driver_number}:${lapNumber}`)

      if (!lap?.lap_duration) {
        continue
      }

      const fastestLap = fastestLapByDriver.get(stint.driver_number)

      if (fastestLap !== undefined && lap.lap_duration > fastestLap * 1.1) {
        continue
      }

      const sample = {
        adjustedLapTime:
          lap.lap_duration + lapNumber * FUEL_GAIN_PER_LAP_PRIOR_SECONDS,
        compound,
        driverNumber: stint.driver_number,
        lapNumber,
        tireAge:
          Math.max(0, stint.tyre_age_at_start) +
          Math.max(0, lapNumber - stint.lap_start),
      }
      samples.push(sample)
      tireLapSamples.push(sample)
    }

    const slope = robustSlope(
      samples.map((sample) => ({
        x: sample.tireAge,
        y: sample.adjustedLapTime,
      })),
    )

    if (slope !== null && slope >= -0.02 && slope <= 0.45) {
      slopesByCompound.set(compound, [
        ...(slopesByCompound.get(compound) ?? []),
        Math.max(0, slope),
      ])
    }
  }

  const tireDegradationByCompound = Object.fromEntries(
    [...slopesByCompound].flatMap(([compound, slopes]) => {
      const slope = median(slopes)
      return slope === null ? [] : [[compound, Number(slope.toFixed(4))]]
    }),
  ) as Partial<Record<TireCompound, number>>
  const stintLengthsByCompound = new Map<TireCompound, number[]>()
  const stintCountByDriver = new Map<number, number>()

  for (const stint of bundle.stints) {
    const compound = openF1Compound(stint.compound)
    const stintLaps = stint.lap_end - stint.lap_start + 1

    stintCountByDriver.set(
      stint.driver_number,
      Math.max(
        stintCountByDriver.get(stint.driver_number) ?? 0,
        stint.stint_number,
      ),
    )

    if (compound && stintLaps >= 3) {
      stintLengthsByCompound.set(compound, [
        ...(stintLengthsByCompound.get(compound) ?? []),
        stintLaps,
      ])
    }
  }

  const medianStintLapsByCompound = Object.fromEntries(
    [...stintLengthsByCompound].flatMap(([compound, lengths]) => {
      const stintMedian = median(lengths)
      return stintMedian === null ? [] : [[compound, Number(stintMedian.toFixed(1))]]
    }),
  ) as Partial<Record<TireCompound, number>>
  const observedStopCounts = [...stintCountByDriver.values()].map(
    (stintCount) => Math.max(0, stintCount - 1),
  )
  const medianPitStopsPerDriver =
    bundle.requestedStage === 'race' || bundle.requestedStage === 'sprint'
      ? median(observedStopCounts)
      : null
  const strategySampleCount = observedStopCounts.length
  const tireSampleCountByCompound = tireLapSamples.reduce<
    Partial<Record<TireCompound, number>>
  >((counts, sample) => {
    counts[sample.compound] = (counts[sample.compound] ?? 0) + 1
    return counts
  }, {})
  const adjustedTimesByDriver = new Map<number, number[]>()

  for (const sample of tireLapSamples) {
    adjustedTimesByDriver.set(sample.driverNumber, [
      ...(adjustedTimesByDriver.get(sample.driverNumber) ?? []),
      sample.adjustedLapTime,
    ])
  }

  const residualsByCompound = new Map<TireCompound, number[]>()

  for (const sample of tireLapSamples) {
    const driverBaseline = median(
      adjustedTimesByDriver.get(sample.driverNumber) ?? [],
    )

    if (driverBaseline === null) {
      continue
    }

    const degradation =
      tireDegradationByCompound[sample.compound] ?? 0
    residualsByCompound.set(sample.compound, [
      ...(residualsByCompound.get(sample.compound) ?? []),
      sample.adjustedLapTime -
        driverBaseline -
        degradation * sample.tireAge,
    ])
  }

  const mediumResidual = median(residualsByCompound.get('M') ?? [])
  const tirePaceOffsetByCompound: Partial<Record<TireCompound, number>> = {}

  if (
    mediumResidual !== null &&
    (tireSampleCountByCompound.M ?? 0) >= MIN_TIRE_OFFSET_SAMPLES
  ) {
    tirePaceOffsetByCompound.M = 0

    for (const compound of ['S', 'H'] as const) {
      const residual = median(residualsByCompound.get(compound) ?? [])

      if (
        residual !== null &&
        (tireSampleCountByCompound[compound] ?? 0) >= MIN_TIRE_OFFSET_SAMPLES
      ) {
        tirePaceOffsetByCompound[compound] = Number(
          clamp(residual - mediumResidual, -2, 2).toFixed(3),
        )
      }
    }
  }
  const sampleCount =
    validLaps.length + bundle.carData.length + bundle.pit.length + bundle.stints.length

  return {
    maxSpeedKph,
    medianPitStopsPerDriver,
    medianStintLapsByCompound,
    pitLaneTransitSeconds,
    provenance: {
      kind: sampleCount > 0 ? 'calibrated' : 'unavailable',
      provider: 'OpenF1',
      sampledAt: bundle.selectedSession.date_end,
      sessionKey: bundle.selectedSession.session_key,
      sourceYear: bundle.year,
      note: `${validLaps.length} valid laps; ${tireLapSamples.length} clean tire laps; ${bundle.pit.length} pit visits; ${bundle.stints.length} stints`,
    },
    sampleCount,
    sectorWeights: normalizedSectorWeights,
    strategySampleCount,
    trackTemperatureC:
      bundle.summary.latestWeather?.track_temperature ?? null,
    tireDegradationByCompound,
    tirePaceOffsetByCompound,
    tireSampleCountByCompound,
  }
}

function cleanLapPaceByDriver(source: ObservedSource | null | undefined) {
  const result = new Map<number, number>()

  if (!source?.laps?.length) {
    return result
  }

  const valid = source.laps.filter(
    (lap) =>
      lap.lap_duration !== null &&
      lap.lap_duration > 35 &&
      lap.lap_duration < 240 &&
      !lap.is_pit_out_lap,
  )
  const byDriver = new Map<number, number[]>()

  for (const lap of valid) {
    const samples = byDriver.get(lap.driver_number) ?? []
    samples.push(lap.lap_duration ?? 0)
    byDriver.set(lap.driver_number, samples)
  }

  for (const [driverNumber, samples] of byDriver) {
    const sorted = samples.sort((left, right) => left - right)
    const fastest = sorted[0]
    const clean = sorted.filter((lapTime) => lapTime <= fastest * 1.06)
    const representativeCount = Math.min(
      clean.length,
      Math.max(3, Math.ceil(clean.length * 0.35)),
    )
    const pace = median(clean.slice(0, representativeCount))

    if (pace !== null) {
      result.set(driverNumber, pace)
    }
  }

  return result
}

function representativeLapTime(source: ObservedSource | null | undefined) {
  if (!source?.laps?.length) {
    return null
  }

  const valid = source.laps
    .filter(
      (lap) =>
        lap.lap_duration !== null &&
        lap.lap_duration > 35 &&
        lap.lap_duration < 240 &&
        !lap.is_pit_out_lap,
    )
    .map((lap) => lap.lap_duration as number)
    .sort((a, b) => a - b)

  if (valid.length === 0) {
    return null
  }

  const fastest = valid[0]
  const clean = valid.filter((lapTime) => lapTime <= fastest * 1.08)
  const representative = median(
    clean.slice(0, Math.max(5, Math.ceil(clean.length * 0.1))),
  )

  return representative === null ? null : Number(representative.toFixed(3))
}

export function calibrateFieldFromOpenF1(
  teams: Team[],
  drivers: Driver[],
  bundle: StandingSource | null | undefined,
  observed?: ObservedSource | null,
): FieldCalibration {
  const referenceLapTimeSeconds = representativeLapTime(observed)

  if (!bundle || bundle.championshipTeams.length === 0) {
    return {
      confidence: 0,
      drivers,
      provenance: {
        kind: 'simulated',
        provider: 'Simulator',
        note: 'Configured baseline; no compatible OpenF1 standings snapshot',
      },
      referenceLapTimeSeconds,
      sampleCount: 0,
      source: 'simulation',
      teamPaceDeltaSeconds: Object.fromEntries(
        teams.map((team) => [team.id, null]),
      ),
      teams,
    }
  }

  const teamByDriverNumber = new Map(
    bundle.drivers.map((driver) => [driver.driver_number, normalize(driver.team_name)]),
  )
  const paceByDriver = cleanLapPaceByDriver(observed)
  const paceByTeam = new Map<string, number[]>()

  for (const [driverNumber, pace] of paceByDriver) {
    const team = teamByDriverNumber.get(driverNumber)

    if (team) {
      paceByTeam.set(team, [...(paceByTeam.get(team) ?? []), pace])
    }
  }

  const medianPaceByTeam = new Map(
    [...paceByTeam].flatMap(([team, samples]) => {
      const pace = median(samples)
      return pace === null ? [] : [[team, pace] as const]
    }),
  )
  const teamPaces = [...medianPaceByTeam.values()]
  const fastestTeamPace = Math.min(...teamPaces)
  const teamPaceDeltaSeconds = Object.fromEntries(
    teams.map((team) => {
      const pace = medianPaceByTeam.get(normalize(team.name))

      return [
        team.id,
        pace === undefined || !Number.isFinite(fastestTeamPace)
          ? null
          : Number((pace - fastestTeamPace).toFixed(3)),
      ]
    }),
  )
  const sampleCount =
    paceByDriver.size + (observed?.carData.length ?? 0) + (observed?.pit?.length ?? 0)
  const confidence = clamp(
    0.35 + Math.min(0.35, paceByDriver.size / 44) + Math.min(0.2, sampleCount / 8000),
    0,
    0.9,
  )
  const asOfDate = 'asOfDate' in bundle ? bundle.asOfDate : null
  const sourceYear = 'sourceYear' in bundle ? bundle.sourceYear : 2026
  const snapshotSource =
    'snapshotSource' in bundle ? bundle.snapshotSource : 'api'

  return {
    confidence,
    drivers,
    provenance: {
      kind: 'calibrated',
      provider: 'OpenF1',
      sampledAt: asOfDate,
      sourceYear,
      note: `${paceByDriver.size} clean driver pace samples; fixed machine and driver profiles retained; ${
        snapshotSource === 'bundled' ? 'bundled OpenF1' : 'live OpenF1'
      } standings used as a shrinkage prior`,
    },
    referenceLapTimeSeconds,
    sampleCount,
    source: 'openf1-calibrated',
    teamPaceDeltaSeconds,
    teams,
  }
}
