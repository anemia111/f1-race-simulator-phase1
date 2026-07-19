import seriesDataJson from '../data/motorsportSeries2026.json'
import { expandedDriverSkills, type CompactDriverRatings } from '../data/driverProfiles'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { tracks as f1Tracks } from '../data/tracks'
import type {
  Driver,
  DriverStyleProfile,
  MachinePerformanceProfile,
  Team,
  TrackDefinition,
} from '../types'
import type {
  DriverAssignmentRecord,
  DriverPoolRecord,
  SeriesCalendarEvent,
  SeriesId,
  SeriesPackage,
  SeriesRules,
  SeriesSource,
} from './types'

const DATA_FILE = 'src/data/motorsportSeries2026.json'

type RawDriver = {
  code: string
  id: string
  name: string
  nationality: string
  number: number
  overall: number
  potential: number
}

type RawTeam = {
  color: string
  drivers: RawDriver[]
  id: string
  name: string
  operations: number
}

type RawSeries = {
  calendar: SeriesCalendarEvent[]
  carCount: number
  id: SeriesId
  label: string
  rules: SeriesRules
  shortLabel: string
  sources: SeriesSource[]
  teamCount: number
  teams?: RawTeam[]
}

type RawReserve = Omit<DriverPoolRecord, 'potential'> & {
  potential: number
  teamId: string
}

type RawSeriesData = {
  reserves: RawReserve[]
  schemaVersion: number
  series: RawSeries[]
  sourceDate: string
}

const rawData = seriesDataJson as unknown as RawSeriesData

const neutralDriverStyle: DriverStyleProfile = {
  brakingAggression: 0.5,
  cornerShapePreference: 0,
  frontEndPreference: 0,
  oversteerTolerance: 0.5,
  rearStabilityNeed: 0,
  understeerTolerance: 0.5,
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value))

function hashUnit(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

function estimatedRating(
  driver: RawDriver,
  axis: keyof CompactDriverRatings,
  adjustment = 0,
) {
  const variation = (hashUnit(`${driver.id}:${axis}`) - 0.5) * 4
  return clamp((driver.overall + variation + adjustment) / 100)
}

function compactRatingsFor(driver: RawDriver): CompactDriverRatings {
  const youthGap = Math.max(0, driver.potential - driver.overall)

  return {
    adaptability: estimatedRating(driver, 'adaptability', youthGap * 0.08),
    consistency: estimatedRating(driver, 'consistency', -youthGap * 0.08),
    defending: estimatedRating(driver, 'defending'),
    errorControl: estimatedRating(driver, 'errorControl', -youthGap * 0.1),
    experience: estimatedRating(driver, 'experience', -youthGap * 0.22),
    overtaking: estimatedRating(driver, 'overtaking'),
    qualifyingPace: estimatedRating(driver, 'qualifyingPace', 1),
    racePace: estimatedRating(driver, 'racePace'),
    raceStart: estimatedRating(driver, 'raceStart'),
    technicalFeedback: estimatedRating(
      driver,
      'technicalFeedback',
      -youthGap * 0.08,
    ),
    tyreManagement: estimatedRating(driver, 'tyreManagement'),
    wetSkill: estimatedRating(driver, 'wetSkill'),
  }
}

function rawRatingsFor(
  driver: RawDriver,
  ratings: CompactDriverRatings,
) {
  return {
    Overall: driver.overall,
    Potential: driver.potential,
    'Qualifying pace': Math.round(ratings.qualifyingPace * 100),
    'Race pace': Math.round(ratings.racePace * 100),
    Consistency: Math.round(ratings.consistency * 100),
    'Tyre management': Math.round(ratings.tyreManagement * 100),
    'Wet skill': Math.round(ratings.wetSkill * 100),
    'Race start': Math.round(ratings.raceStart * 100),
    Overtaking: Math.round(ratings.overtaking * 100),
    Defending: Math.round(ratings.defending * 100),
    'Technical feedback': Math.round(ratings.technicalFeedback * 100),
    Adaptability: Math.round(ratings.adaptability * 100),
    Experience: Math.round(ratings.experience * 100),
    'Error control': Math.round(ratings.errorControl * 100),
  }
}

function oneMakeMachineProfile(
  baseRating: number,
  operations: number,
): MachinePerformanceProfile {
  const base = clamp(baseRating / 100, 0.65, 0.95)
  const operationalPace = clamp(base + (operations - 85) * 0.0008, 0.65, 0.95)
  const reliability = clamp(base + (operations - 82) * 0.0015, 0.65, 0.97)

  return {
    activeAeroEfficiency: base,
    aerodynamicEfficiency: base,
    brakeCooling: reliability,
    brakingPerformance: operationalPace,
    brakingStability: operationalPace,
    bumpTolerance: base,
    coolingEfficiency: reliability,
    dirtyAirTolerance: base,
    downforceGeneration: base,
    dragEfficiency: base,
    electricalDeploymentEfficiency: base,
    energyRecoveryEfficiency: base,
    frontTireManagement: operationalPace,
    fuelEfficiency: base,
    highSpeedCornerPerformance: operationalPace,
    intermediatePerformance: operationalPace,
    kerbHandling: operationalPace,
    lowSpeedCornerPerformance: operationalPace,
    mechanicalGrip: base,
    mediumSpeedCornerPerformance: operationalPace,
    puOutput: base,
    qualifyingPace: operationalPace,
    racePace: operationalPace,
    rearTireManagement: operationalPace,
    reliability,
    rideCompliance: base,
    straightLineEfficiency: base,
    tireDegManagement: operationalPace,
    tireWarmup: operationalPace,
    towSensitivity: base,
    traction: operationalPace,
    wetPerformance: operationalPace,
  }
}

function createSeriesField(definition: RawSeries) {
  const teams = (definition.teams ?? []).map<Team>((team) => ({
    color: team.color,
    id: team.id,
    machine: oneMakeMachineProfile(
      definition.rules.vehicleBaseRating ?? 86,
      team.operations,
    ),
    name: team.name,
    performanceSource: {
      fileName: DATA_FILE,
      overall: team.operations,
      rawRatings: {
        'One-make vehicle baseline': definition.rules.vehicleBaseRating ?? 86,
        'Team operations': team.operations,
      },
    },
    pitCrewSpeed: clamp(team.operations / 100, 0.72, 0.96),
  }))
  const drivers = (definition.teams ?? []).flatMap((team) =>
    team.drivers.map<Driver>((driver, index) => {
      const ratings = compactRatingsFor(driver)
      const gridIndex =
        (definition.teams ?? []).findIndex((candidate) => candidate.id === team.id) *
          Math.max(1, team.drivers.length) +
        index

      return {
        carNumber: driver.number,
        code: driver.code,
        id: driver.id,
        name: driver.name,
        nationality: driver.nationality,
        performanceSource: {
          fileName: DATA_FILE,
          overall: driver.overall,
          rawRatings: rawRatingsFor(driver, ratings),
        },
        potential: driver.potential / 100,
        seatRole: 'regular',
        skills: expandedDriverSkills(ratings),
        startOffset: gridIndex === 0 ? 0 : -gridIndex * 0.018,
        style: { ...neutralDriverStyle },
        teamId: team.id,
        tire: 'M',
      }
    }),
  )

  return { drivers, teams }
}

const allTrackDefinitions = [...f1Tracks, ...supportSeriesTracks]
const trackById = new Map(allTrackDefinitions.map((track) => [track.id, track]))

function tracksFor(definition: RawSeries) {
  const eventByTrack = new Map(
    definition.calendar.map((event) => [event.trackId, event]),
  )

  return Array.from(new Set(definition.calendar.map((event) => event.trackId))).map(
    (trackId): TrackDefinition => {
      const track = trackById.get(trackId)

      if (!track) {
        throw new Error(`${DATA_FILE}: ${definition.id} references missing track ${trackId}`)
      }

      const event = eventByTrack.get(trackId)
      return {
        ...track,
        baseLapTime: Number(
          (track.baseLapTime * definition.rules.baseLapTimeMultiplier).toFixed(3),
        ),
        isSprintWeekend: Boolean(event?.sprint),
        raceLaps: Math.max(
          12,
          Math.round((track.raceLaps ?? 50) * definition.rules.raceDistanceRatio),
        ),
        raceLapsSource:
          definition.id === 'f1-custom' ? track.raceLapsSource : 'estimated',
      }
    },
  )
}

const tireCompounds = ['H', 'I', 'M', 'S', 'W'] as const
const validWeekendStages = new Set([
  'fp1',
  'fp2',
  'fp3',
  'sprintQualifying',
  'sprint',
  'qualifying',
  'qualifying2',
  'race',
  'race2',
])

function validateTireAllocation(
  pkg: SeriesPackage,
  label: string,
  allocation: SeriesRules['tires']['standardAllocation'],
) {
  for (const compound of tireCompounds) {
    const count = allocation[compound]

    if (!Number.isInteger(count) || count < 0) {
      throw new Error(
        `${DATA_FILE}: ${pkg.id} ${label} allocation has invalid ${compound} count ${count}`,
      )
    }
  }
}

function validateQualifyingStructure(
  pkg: SeriesPackage,
  qualifying: SeriesRules['qualifying'],
  label: string,
) {
  const segments = qualifying.segments
  const expectedNames = ['Q1', 'Q2', 'Q3']

  if (
    !Number.isFinite(qualifying.breakSeconds) ||
    qualifying.breakSeconds < 0 ||
    segments.length === 0 ||
    segments.length > expectedNames.length ||
    (qualifying.grouping !== undefined &&
      qualifying.grouping !== 'balanced' &&
      qualifying.grouping !== 'car-number-parity') ||
    (qualifying.format !== 'grouped' && qualifying.grouping !== undefined) ||
    segments.some(
      (segment, index) =>
        segment.name !== expectedNames[index] ||
        !Number.isFinite(segment.durationSeconds) ||
        segment.durationSeconds <= 0 ||
        (segment.advanceCount !== null &&
          (!Number.isInteger(segment.advanceCount) ||
            segment.advanceCount < 1 ||
            segment.advanceCount >=
              (index === 0
                ? pkg.carCount
                : (segments[index - 1].advanceCount ?? pkg.carCount)))) ||
        (index < segments.length - 1 && segment.advanceCount === null),
    ) ||
    (qualifying.format === 'single-session' && segments.length !== 1)
  ) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid ${label} structure`)
  }
}

export function validateSeriesPackage(pkg: SeriesPackage) {
  if (pkg.teams.length !== pkg.teamCount || pkg.drivers.length !== pkg.carCount) {
    throw new Error(
      `${DATA_FILE}: ${pkg.id} expected ${pkg.teamCount} teams/${pkg.carCount} cars; received ${pkg.teams.length}/${pkg.drivers.length}`,
    )
  }

  const driverIds = new Set(pkg.drivers.map((driver) => driver.id))
  const carNumbers = new Set(pkg.drivers.map((driver) => driver.carNumber))
  const teamIds = new Set(pkg.teams.map((team) => team.id))

  if (driverIds.size !== pkg.drivers.length || carNumbers.size !== pkg.drivers.length) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has duplicate driver ids or car numbers`)
  }

  if (teamIds.size !== pkg.teams.length) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has duplicate team ids`)
  }

  for (const driver of pkg.drivers) {
    const overall = driver.performanceSource?.overall

    if (!teamIds.has(driver.teamId)) {
      throw new Error(
        `${DATA_FILE}: ${pkg.id} driver ${driver.id} references missing team ${driver.teamId}`,
      )
    }

    if (
      !Number.isFinite(overall) ||
      overall === undefined ||
      overall < 0 ||
      overall > 100 ||
      !Number.isFinite(driver.potential) ||
      driver.potential === undefined ||
      driver.potential < 0 ||
      driver.potential > 1 ||
      Object.values(driver.skills).some(
        (rating) => !Number.isFinite(rating) || rating < 0 || rating > 1,
      )
    ) {
      throw new Error(`${DATA_FILE}: invalid 0-100 profile for ${driver.id}`)
    }
  }

  const calendarIds = new Set(pkg.calendar.map((event) => event.id))
  const trackIds = new Set(pkg.tracks.map((track) => track.id))

  if (calendarIds.size !== pkg.calendar.length) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has duplicate calendar event ids`)
  }

  for (const event of pkg.calendar) {
    if (
      !Number.isInteger(event.round) ||
      event.round < 1 ||
      !Number.isInteger(event.raceCount) ||
      event.raceCount < 1 ||
      !trackIds.has(event.trackId) ||
      (event.gridSourceTrackId !== undefined &&
        !trackIds.has(event.gridSourceTrackId)) ||
      (event.featurePoints !== undefined &&
        (event.featurePoints.length > pkg.carCount ||
          event.featurePoints.some(
            (points) => !Number.isFinite(points) || points < 0,
          ))) ||
      (event.raceLaps !== undefined &&
        (!Number.isInteger(event.raceLaps) || event.raceLaps < 1)) ||
      (event.raceTimeLimitSeconds !== undefined &&
        (!Number.isFinite(event.raceTimeLimitSeconds) ||
          event.raceTimeLimitSeconds <= 0)) ||
      (event.raceOverallTimeLimitSeconds !== undefined &&
        (!Number.isFinite(event.raceOverallTimeLimitSeconds) ||
          event.raceOverallTimeLimitSeconds <= 0))
    ) {
      throw new Error(`${DATA_FILE}: ${pkg.id} has invalid calendar event ${event.id}`)
    }

    if (event.weekendStages) {
      const raceSessions = event.weekendStages.filter(
        (stage) => stage === 'sprint' || stage === 'race' || stage === 'race2',
      ).length

      if (
        new Set(event.weekendStages).size !== event.weekendStages.length ||
        event.weekendStages.some((stage) => !validWeekendStages.has(stage)) ||
        (!event.weekendStages.includes('qualifying') &&
          event.gridSourceTrackId === undefined) ||
        !event.weekendStages.includes('race') ||
        raceSessions !== event.raceCount
      ) {
        throw new Error(
          `${DATA_FILE}: ${pkg.id} has invalid weekend override ${event.id}`,
        )
      }
    }

    if (event.qualifying) {
      validateQualifyingStructure(
        pkg,
        event.qualifying,
        `${event.id} qualifying`,
      )
    }
  }

  const raceFormat = pkg.rules.race
  const optionalPositiveValues = [
    raceFormat.featureDistanceKm,
    raceFormat.featureOverallTimeLimitSeconds,
    raceFormat.featureTimeLimitSeconds,
    raceFormat.sprintDistanceKm,
    raceFormat.sprintOverallTimeLimitSeconds,
    raceFormat.sprintTimeLimitSeconds,
  ]

  if (
    optionalPositiveValues.some(
      (value) => value !== null && (!Number.isFinite(value) || value <= 0),
    ) ||
    (raceFormat.sprintLapsRatio !== null &&
      (!Number.isFinite(raceFormat.sprintLapsRatio) ||
        raceFormat.sprintLapsRatio <= 0 ||
        raceFormat.sprintLapsRatio > 1)) ||
    (raceFormat.featureTimeLimitSeconds !== null &&
      raceFormat.featureOverallTimeLimitSeconds !== null &&
      raceFormat.featureOverallTimeLimitSeconds <
        raceFormat.featureTimeLimitSeconds) ||
    (raceFormat.sprintTimeLimitSeconds !== null &&
      raceFormat.sprintOverallTimeLimitSeconds !== null &&
      raceFormat.sprintOverallTimeLimitSeconds <
        raceFormat.sprintTimeLimitSeconds)
  ) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid race format`)
  }

  for (const overrides of [
    raceFormat.featureDistanceOverridesKm,
    raceFormat.sprintDistanceOverridesKm,
  ]) {
    if (
      Object.entries(overrides).some(
        ([trackId, distanceKm]) =>
          !trackIds.has(trackId) ||
          !Number.isFinite(distanceKm) ||
          distanceKm <= 0,
      )
    ) {
      throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid distance override`)
    }
  }

  validateQualifyingStructure(pkg, pkg.rules.qualifying, 'qualifying')

  if (
    new Set(pkg.rules.weekendStages).size !== pkg.rules.weekendStages.length ||
    !pkg.rules.weekendStages.includes('qualifying') ||
    !pkg.rules.weekendStages.includes('race') ||
    (pkg.rules.sprintGridReverseCount > 0 &&
      !pkg.rules.weekendStages.includes('sprint')) ||
    pkg.rules.sprintGridReverseCount > pkg.carCount
  ) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid weekend structure`)
  }

  const reducedPointsTables = pkg.rules.points.reduced
    ? [
        ...pkg.rules.points.reduced.feature,
        ...pkg.rules.points.reduced.sprint,
      ]
    : []
  const pointsTables = [
    ['feature', pkg.rules.points.feature],
    ['qualifying', pkg.rules.points.qualifying],
    ['sprint', pkg.rules.points.sprint],
    ...reducedPointsTables.map(
      (table, index) => [`reduced-${index + 1}`, table] as const,
    ),
  ] as const

  for (const [label, table] of pointsTables) {
    if (
      table.length > pkg.carCount ||
      table.some((points) => !Number.isFinite(points) || points < 0)
    ) {
      throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid ${label} points table`)
    }
  }

  const fastestLap = pkg.rules.points.fastestLap
  if (
    fastestLap &&
    (!Number.isFinite(fastestLap.points) ||
      fastestLap.points <= 0 ||
      !Number.isInteger(fastestLap.maximumClassifiedPosition) ||
      fastestLap.maximumClassifiedPosition < 1 ||
      fastestLap.maximumClassifiedPosition > pkg.carCount ||
      !Number.isFinite(fastestLap.minimumCompletionRatio) ||
      fastestLap.minimumCompletionRatio < 0 ||
      fastestLap.minimumCompletionRatio > 1)
  ) {
    throw new Error(`${DATA_FILE}: ${pkg.id} has an invalid fastest-lap rule`)
  }

  validateTireAllocation(pkg, 'standard', pkg.rules.tires.standardAllocation)
  if (pkg.rules.tires.sprintAllocation) {
    validateTireAllocation(pkg, 'sprint', pkg.rules.tires.sprintAllocation)
  }

  if (
    pkg.rules.tires.standardAllocation[
      pkg.rules.tires.qualifyingDryCompound
    ] < 1
  ) {
    throw new Error(
      `${DATA_FILE}: ${pkg.id} qualifying compound is not in its tire allocation`,
    )
  }

  const suppliedDrySpecifications = (['H', 'M', 'S'] as const).filter(
    (compound) => pkg.rules.tires.standardAllocation[compound] > 0,
  ).length

  if (pkg.rules.featureRaceTwoDryCompounds && suppliedDrySpecifications < 2) {
    throw new Error(
      `${DATA_FILE}: ${pkg.id} requires two dry specifications but supplies ${suppliedDrySpecifications}`,
    )
  }
}

export const seriesPackages: SeriesPackage[] = rawData.series.map((definition) => {
  const field =
    definition.id === 'f1-custom'
      ? { drivers: initialDrivers, teams: initialTeams }
      : createSeriesField(definition)
  const pkg: SeriesPackage = {
    calendar: definition.calendar,
    carCount: definition.carCount,
    drivers: field.drivers,
    id: definition.id,
    label: definition.label,
    rules: definition.rules,
    shortLabel: definition.shortLabel,
    sources: definition.sources,
    teamCount: definition.teamCount,
    teams: field.teams,
    tracks: tracksFor(definition),
  }

  validateSeriesPackage(pkg)
  return pkg
})

export const seriesPackageById = new Map(
  seriesPackages.map((series) => [series.id, series]),
)

export const defaultSeriesPackage = seriesPackageById.get('f1-custom')!

const poolById = new Map<string, DriverPoolRecord>()

for (const series of seriesPackages) {
  for (const driver of series.drivers) {
    const candidate: DriverPoolRecord = {
      code: driver.code,
      id: driver.id,
      name: driver.name,
      nationality: driver.nationality ?? 'UNK',
      overall: driver.performanceSource?.overall ?? 0,
      potential: Math.round((driver.potential ?? 0) * 100),
    }
    const current = poolById.get(driver.id)

    if (current && current.name !== candidate.name) {
      throw new Error(`${DATA_FILE}: driver id ${driver.id} maps to multiple names`)
    }

    if (!current || candidate.overall > current.overall) {
      poolById.set(driver.id, candidate)
    }
  }
}

for (const reserve of rawData.reserves) {
  if (poolById.has(reserve.id)) {
    throw new Error(`${DATA_FILE}: reserve id ${reserve.id} duplicates the driver pool`)
  }
  poolById.set(reserve.id, {
    code: reserve.code,
    id: reserve.id,
    name: reserve.name,
    nationality: reserve.nationality,
    overall: reserve.overall,
    potential: reserve.potential,
  })
}

export const driverPool2026 = [...poolById.values()]

if (driverPool2026.length !== 110) {
  throw new Error(
    `${DATA_FILE}: expected 110 unique drivers, received ${driverPool2026.length}`,
  )
}

export const driverAssignments2026: DriverAssignmentRecord[] = [
  ...seriesPackages.flatMap((series) =>
    series.drivers.map((driver) => ({
      active: true,
      carNumber: driver.carNumber,
      driverId: driver.id,
      role: driver.seatRole ?? 'regular',
      season: 2026 as const,
      seriesId: series.id,
      teamId: driver.teamId,
    })),
  ),
  ...rawData.reserves.map((reserve) => ({
    active: true,
    carNumber: null,
    driverId: reserve.id,
    role: 'reserve' as const,
    season: 2026 as const,
    seriesId: 'f1-custom' as const,
    teamId: reserve.teamId,
  })),
  {
    active: true,
    carNumber: null,
    driverId: 'ayumu_iwasa',
    role: 'reserve',
    season: 2026,
    seriesId: 'f1-custom',
    teamId: 'racing-bulls',
  },
  {
    active: true,
    carNumber: null,
    driverId: 'kush_maini',
    role: 'reserve',
    season: 2026,
    seriesId: 'f1-custom',
    teamId: 'alpine',
  },
  {
    active: true,
    carNumber: null,
    driverId: 'yuki_tsunoda',
    role: 'reserve',
    season: 2026,
    seriesId: 'f1-custom',
    teamId: 'red-bull-racing',
  },
]

export const seriesRegistryAudit = {
  assignmentCount: driverAssignments2026.length,
  driverPoolCount: driverPool2026.length,
  schemaVersion: rawData.schemaVersion,
  sourceDate: rawData.sourceDate,
}
