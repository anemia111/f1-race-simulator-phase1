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
    pitLaneTransitSeconds: null,
    provenance: {
      kind: 'unavailable',
      provider: 'OpenF1',
      note: 'No selected-session samples available for track calibration',
    },
    sampleCount: 0,
    sectorWeights: null,
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
    tireDegradationByCompound,
    tirePaceOffsetByCompound,
    tireSampleCountByCompound,
  }
}

function normalizedStrength(value: number | null, minimum: number, maximum: number) {
  if (value === null || !Number.isFinite(minimum) || maximum - minimum < 0.001) {
    return null
  }

  return clamp((maximum - value) / (maximum - minimum), 0, 1)
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

function representativeSpeedByTeam(source: ObservedSource | null | undefined) {
  const result = new Map<string, number>()

  if (!source?.carData.length) {
    return result
  }

  const teamByDriver = new Map(
    source.drivers.map((driver) => [driver.driver_number, normalize(driver.team_name)]),
  )
  const samplesByTeam = new Map<string, number[]>()

  for (const sample of source.carData) {
    const team = teamByDriver.get(sample.driver_number)

    if (!team || sample.speed < 250) {
      continue
    }

    const samples = samplesByTeam.get(team) ?? []
    samples.push(sample.speed)
    samplesByTeam.set(team, samples)
  }

  for (const [team, samples] of samplesByTeam) {
    const sorted = samples.sort((a, b) => b - a)
    const representative = median(sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.08))))

    if (representative !== null) {
      result.set(team, representative)
    }
  }

  return result
}

function pitPerformanceByTeam(source: ObservedSource | null | undefined) {
  const result = new Map<string, number>()

  if (!source?.pit?.length) {
    return result
  }

  const teamByDriver = new Map(
    source.drivers.map((driver) => [driver.driver_number, normalize(driver.team_name)]),
  )
  const samplesByTeam = new Map<string, number[]>()

  for (const stop of source.pit) {
    const team = teamByDriver.get(stop.driver_number)
    const duration = stop.stop_duration

    if (!team || duration === null || duration < 1.5 || duration > 8) {
      continue
    }

    const samples = samplesByTeam.get(team) ?? []
    samples.push(duration)
    samplesByTeam.set(team, samples)
  }

  for (const [team, samples] of samplesByTeam) {
    const value = median(samples)

    if (value !== null) {
      result.set(team, value)
    }
  }

  return result
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

  const teamStandings = new Map(
    bundle.championshipTeams.map((standing) => [normalize(standing.team_name), standing]),
  )
  const driverNumbersByCode = new Map(
    bundle.drivers.map((driver) => [driver.name_acronym, driver.driver_number]),
  )
  const teamByDriverNumber = new Map(
    bundle.drivers.map((driver) => [driver.driver_number, normalize(driver.team_name)]),
  )
  const driverStandings = new Map(
    bundle.championshipDrivers.map((standing) => [standing.driver_number, standing]),
  )
  const maximumTeamPoints = Math.max(
    0,
    ...bundle.championshipTeams.map((standing) => standing.points_current),
  )
  const maximumDriverPoints = Math.max(
    0,
    ...bundle.championshipDrivers.map((standing) => standing.points_current),
  )
  const teamStandingEvidence = clamp(maximumTeamPoints / 320, 0.15, 0.85)
  const driverStandingEvidence = clamp(maximumDriverPoints / 180, 0.15, 0.85)
  const driverPointsByTeam = new Map<string, number[]>()

  for (const standing of bundle.championshipDrivers) {
    const team = teamByDriverNumber.get(standing.driver_number)

    if (team) {
      driverPointsByTeam.set(team, [
        ...(driverPointsByTeam.get(team) ?? []),
        standing.points_current,
      ])
    }
  }
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
  const minimumPace = Math.min(...teamPaces)
  const maximumPace = Math.max(...teamPaces)
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
  const speedByTeam = representativeSpeedByTeam(observed)
  const observedSpeeds = [...speedByTeam.values()]
  const minimumSpeed = Math.min(...observedSpeeds)
  const maximumSpeed = Math.max(...observedSpeeds)
  const pitByTeam = pitPerformanceByTeam(observed)
  const pitDurations = [...pitByTeam.values()]
  const fastestPit = Math.min(...pitDurations)
  const slowestPit = Math.max(...pitDurations)

  const calibratedTeams = teams.map((team) => {
    const standing = teamStandings.get(normalize(team.name))

    if (!standing) {
      return team
    }

    const rankStrength = clamp((12 - standing.position_current) / 11, 0, 1)
    const pointsStrength =
      maximumTeamPoints > 0
        ? Math.sqrt(standing.points_current / maximumTeamPoints)
        : rankStrength
    const standingStrength = rankStrength * 0.35 + pointsStrength * 0.65
    const paceStrength = normalizedStrength(
      medianPaceByTeam.get(normalize(team.name)) ?? null,
      minimumPace,
      maximumPace,
    )
    const speed = speedByTeam.get(normalize(team.name))
    const straightStrength =
      speed === undefined || maximumSpeed - minimumSpeed < 2
        ? null
        : clamp((speed - minimumSpeed) / (maximumSpeed - minimumSpeed), 0, 1)
    const pitDuration = pitByTeam.get(normalize(team.name))
    const pitStrength = normalizedStrength(
      pitDuration ?? null,
      fastestPit,
      slowestPit,
    )
    const overall =
      paceStrength === null
        ? standingStrength
        : standingStrength * 0.28 + paceStrength * 0.72
    const performancePriorWeight =
      paceStrength === null ? 0.62 - teamStandingEvidence * 0.42 : 0.28
    const performanceTarget = 0.68 + overall * 0.27

    return {
      ...team,
      cornering: clamp(
        team.cornering * performancePriorWeight +
          performanceTarget * (1 - performancePriorWeight),
        0.67,
        0.96,
      ),
      straightLine:
        straightStrength === null
          ? clamp(
              team.straightLine * performancePriorWeight +
                performanceTarget * (1 - performancePriorWeight),
              0.67,
              0.95,
            )
          : clamp(team.straightLine * 0.42 + (0.68 + straightStrength * 0.27) * 0.58, 0.67, 0.96),
      // A points table is not a mechanical-failure model. Keep reliability
      // near the configured prior until multi-event DNF exposure is available.
      reliability: clamp(team.reliability, 0.68, 0.95),
      pitCrewSpeed:
        pitStrength === null
          ? team.pitCrewSpeed
          : clamp(team.pitCrewSpeed * 0.45 + (0.68 + pitStrength * 0.27) * 0.55, 0.67, 0.96),
    }
  })

  const calibratedDrivers = drivers.map((driver) => {
    const number = driverNumbersByCode.get(driver.code)
    const standing = number ? driverStandings.get(number) : null

    if (!standing || !number) {
      return driver
    }

    const standingStrength = clamp((24 - standing.position_current) / 23, 0, 1)
    const pointsStrength =
      maximumDriverPoints > 0
        ? Math.sqrt(standing.points_current / maximumDriverPoints)
        : standingStrength
    const driverPace = paceByDriver.get(number) ?? null
    const driverTeam = teamByDriverNumber.get(number)
    const teamPace = driverTeam ? medianPaceByTeam.get(driverTeam) ?? null : null
    const teammatePoints = driverTeam
      ? (driverPointsByTeam.get(driverTeam) ?? []).find(
          (points) => points !== standing.points_current,
        ) ?? standing.points_current
      : standing.points_current
    const pointsWithinTeamStrength = clamp(
      0.5 +
        (standing.points_current - teammatePoints) /
          Math.max(40, standing.points_current + teammatePoints),
      0,
      1,
    )
    const lapWithinTeamStrength =
      driverPace === null || teamPace === null
        ? null
        : clamp(0.5 + (teamPace - driverPace) / 1.6, 0, 1)
    const withinTeamStrength =
      lapWithinTeamStrength ?? pointsWithinTeamStrength
    const observedStrength =
      lapWithinTeamStrength === null
        ? standingStrength * 0.35 +
          pointsStrength * 0.35 +
          withinTeamStrength * 0.3
        : standingStrength * 0.2 +
          pointsStrength * 0.15 +
          withinTeamStrength * 0.65
    const speedPriorWeight =
      lapWithinTeamStrength === null
        ? 0.62 - driverStandingEvidence * 0.38
        : 0.28
    const speedTarget = 0.7 + observedStrength * 0.27

    return {
      ...driver,
      consistency:
        driver.consistency > 1
          ? driver.consistency
          : clamp(
              driver.consistency * 0.68 +
                (0.68 + observedStrength * 0.27) * 0.32,
              0.68,
              0.96,
            ),
      speed:
        driver.speed > 1
          ? driver.speed
          : clamp(
              driver.speed * speedPriorWeight +
                speedTarget * (1 - speedPriorWeight),
              0.7,
              0.97,
            ),
    }
  })
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
    drivers: calibratedDrivers,
    provenance: {
      kind: 'calibrated',
      provider: 'OpenF1',
      sampledAt: asOfDate,
      sourceYear,
      note: `${paceByDriver.size} clean driver pace samples; ${
        snapshotSource === 'bundled' ? 'bundled OpenF1' : 'live OpenF1'
      } standings used as a shrinkage prior`,
    },
    referenceLapTimeSeconds,
    sampleCount,
    source: 'openf1-calibrated',
    teamPaceDeltaSeconds,
    teams: calibratedTeams,
  }
}
