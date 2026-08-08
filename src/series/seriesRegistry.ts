import seriesDataJson from '../data/motorsportSeries2026.json'
import { expandedDriverSkills, type CompactDriverRatings } from '../data/driverProfiles'
import { initialDrivers, initialTeams } from '../data/grid2026'
import {
  PERFORMANCE_CSV_FILE,
  reserveDrivers,
} from '../data/performanceCsv'
import {
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_LIMIT_BREAK_MAX,
} from '../simulation/driverAbility'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { tracks as f1Tracks } from '../data/tracks'
import {
  baseLapTimeSourceForPaceReference,
  paceReference2026For,
  simulationBaseLapTimeForPaceReference,
} from '../data/paceReferences2026'
import { DRIVER_ABILITY_GROUPS } from '../simulation/driverAbility'
import type {
  Driver,
  DriverSkillProfile,
  DriverStyleProfile,
  MachinePerformanceProfile,
  Team,
  TrackDefinition,
} from '../types'
import type {
  SeriesCalendarEvent,
  SeriesId,
  SeriesPackage,
  SeriesRules,
  SeriesSource,
} from './types'
import {
  HISTORICAL_DRIVER_POOL_METHOD_VERSION,
  historicalDriverPool2026,
  materializeAssignedDriver,
  validateDriverAssignments,
  validateDriverPool,
  type DriverAssignment,
  type DriverPoolProvenance,
  type DriverPoolRecord,
  type DriverSourceRole,
} from './driverPool'
import { resolveRuntimeVehicleEra } from './vehicleEraRegistry'

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

type RawReserve = {
  code: string
  id: string
  name: string
  nationality: string
  overall: number
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

const compactDriverRatingKeys = [
  'adaptability',
  'consistency',
  'defending',
  'errorControl',
  'experience',
  'overtaking',
  'qualifyingPace',
  'racePace',
  'raceStart',
  'technicalFeedback',
  'tyreManagement',
  'wetSkill',
] as const satisfies readonly (keyof CompactDriverRatings)[]

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

function estimatedCompactRatingsFor(driver: RawDriver): CompactDriverRatings {
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

function compactRatingsOverall(ratings: CompactDriverRatings) {
  const skills = expandedDriverSkills(ratings)

  return (
    DRIVER_ABILITY_GROUPS.reduce(
      (total, group) =>
        total +
        group.stats.reduce((sum, stat) => sum + skills[stat], 0) /
          group.stats.length,
      0,
    ) / DRIVER_ABILITY_GROUPS.length
  )
}

function compactRatingsFor(driver: RawDriver): CompactDriverRatings {
  const ratings = estimatedCompactRatingsFor(driver)
  const correction = driver.overall / 100 - compactRatingsOverall(ratings)

  return Object.fromEntries(
    compactDriverRatingKeys.map((key) => [
      key,
      clamp(ratings[key] + correction),
    ]),
  ) as CompactDriverRatings
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

function legacyOneMakeMachineProfile(
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

function oneMakeMachineProfile(baseRating: number): MachinePerformanceProfile {
  const base = clamp(baseRating / 100, 0.65, 0.95)

  return {
    activeAeroEfficiency: base,
    aerodynamicEfficiency: base,
    brakeCooling: base,
    brakingPerformance: base,
    brakingStability: base,
    bumpTolerance: base,
    coolingEfficiency: base,
    dirtyAirTolerance: base,
    downforceGeneration: base,
    dragEfficiency: base,
    electricalDeploymentEfficiency: base,
    energyRecoveryEfficiency: base,
    frontTireManagement: base,
    fuelEfficiency: base,
    highSpeedCornerPerformance: base,
    intermediatePerformance: base,
    kerbHandling: base,
    lowSpeedCornerPerformance: base,
    mechanicalGrip: base,
    mediumSpeedCornerPerformance: base,
    puOutput: base,
    qualifyingPace: base,
    racePace: base,
    rearTireManagement: base,
    reliability: base,
    rideCompliance: base,
    straightLineEfficiency: base,
    tireDegManagement: base,
    tireWarmup: base,
    towSensitivity: base,
    traction: base,
    wetPerformance: base,
  }
}

// Matches the operations-tuned SF profile present at the Phase 0 baseline so
// persisted configurations can be migrated to the one-make hardware boundary.
function phaseZeroOneMakeMachineProfile(
  baseRating: number,
  operations: number,
): MachinePerformanceProfile {
  const base = clamp(baseRating / 100, 0.65, 0.95)
  const operationalDelta = (operations - 85) * 0.0045
  const tuned = (weight: number) =>
    clamp(base + operationalDelta * weight, 0.65, 0.97)
  const reliability = clamp(
    base + (operations - 82) * 0.0035,
    0.65,
    0.97,
  )

  return {
    activeAeroEfficiency: tuned(0.25),
    aerodynamicEfficiency: tuned(0.75),
    brakeCooling: reliability,
    brakingPerformance: tuned(1),
    brakingStability: tuned(1),
    bumpTolerance: tuned(0.7),
    coolingEfficiency: reliability,
    dirtyAirTolerance: tuned(0.45),
    downforceGeneration: tuned(0.85),
    dragEfficiency: tuned(0.65),
    electricalDeploymentEfficiency: tuned(0.1),
    energyRecoveryEfficiency: tuned(0.1),
    frontTireManagement: tuned(1.1),
    fuelEfficiency: tuned(0.25),
    highSpeedCornerPerformance: tuned(0.85),
    intermediatePerformance: tuned(1),
    kerbHandling: tuned(0.75),
    lowSpeedCornerPerformance: tuned(1),
    mechanicalGrip: tuned(1),
    mediumSpeedCornerPerformance: tuned(0.95),
    puOutput: base,
    qualifyingPace: tuned(1.15),
    racePace: tuned(1),
    rearTireManagement: tuned(1.1),
    reliability,
    rideCompliance: tuned(0.7),
    straightLineEfficiency: tuned(0.65),
    tireDegManagement: tuned(1.1),
    tireWarmup: tuned(1),
    towSensitivity: tuned(0.2),
    traction: tuned(1),
    wetPerformance: tuned(1),
  }
}

function profilesEqual(
  candidate: Record<string, unknown>,
  expected: Record<string, number>,
) {
  return Object.entries(expected).every(
    ([key, value]) =>
      typeof candidate[key] === 'number' &&
      Math.abs(candidate[key] - value) < 0.000000001,
  )
}

export function isLegacySupportMachineProfile(
  candidate: Record<string, unknown>,
  baseRating: number,
  operations: number,
) {
  return (
    profilesEqual(
      candidate,
      legacyOneMakeMachineProfile(baseRating, operations),
    ) ||
    profilesEqual(
      candidate,
      phaseZeroOneMakeMachineProfile(baseRating, operations),
    )
  )
}

const legacySuperFormulaOverallByDriverId: Readonly<
  Record<string, number>
> = {
  ayumu_iwasa: 78,
  charlie_wurz: 67,
  igor_fraga: 71,
  juju_noda: 66,
  kakunoshin_ohta: 79,
  kamui_kobayashi: 75,
  kenta_yamashita: 74,
  luke_browning: 72,
  nirei_fukuzumi: 76,
  nobuharu_matsushita: 72,
  ren_sato: 72,
  rikuto_kobayashi: 68,
  roman_stanek: 70,
  sacha_fenestraz: 75,
  sena_sakaguchi: 75,
  sho_tsuboi: 78,
  syun_koide: 68,
  tadasuke_makino: 77,
  tomoki_nojiri: 77,
  toshiki_oyu: 74,
  ukyo_sasahara: 72,
  yuto_nomura: 67,
  zak_osullivan: 70,
}

export function isLegacySupportDriverProfile(
  candidate: DriverSkillProfile,
  baseDriver: Driver,
  seriesId: SeriesId,
) {
  if (seriesId === 'f1-custom') return false

  const currentOverall = baseDriver.performanceSource?.overall
  if (
    typeof currentOverall !== 'number' ||
    typeof baseDriver.potential !== 'number'
  ) {
    return false
  }

  const legacyOverall =
    seriesId === 'super-formula'
      ? legacySuperFormulaOverallByDriverId[baseDriver.id]
      : currentOverall
  if (legacyOverall === undefined) return false
  const legacyRatings = estimatedCompactRatingsFor({
    code: baseDriver.code,
    id: baseDriver.id,
    name: baseDriver.name,
    nationality: baseDriver.nationality ?? '',
    number: baseDriver.carNumber,
    overall: legacyOverall,
    potential: Math.round(baseDriver.potential * 100),
  })

  return profilesEqual(
    candidate,
    expandedDriverSkills(legacyRatings),
  )
}

function createSeriesField(definition: RawSeries) {
  const teams = (definition.teams ?? []).map<Team>((team) => ({
    color: team.color,
    id: team.id,
    machine: oneMakeMachineProfile(definition.rules.vehicleBaseRating ?? 86),
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
      const referenceSeries =
        definition.id === 'f1-custom' || definition.id === 'super-formula'
          ? definition.id
          : null
      const paceReference2026 =
        referenceSeries === null
          ? undefined
          : paceReference2026For(referenceSeries, trackId)
      return {
        ...track,
        baseLapTime: simulationBaseLapTimeForPaceReference(
          paceReference2026,
          track.baseLapTime,
        ),
        baseLapTimeSource:
          baseLapTimeSourceForPaceReference(paceReference2026),
        isSprintWeekend: Boolean(event?.sprint),
        paceReference2026,
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
      overall > DRIVER_ABILITY_LIMIT_BREAK_MAX ||
      !Number.isFinite(driver.potential) ||
      driver.potential === undefined ||
      driver.potential < 0 ||
      driver.potential > DRIVER_ABILITY_INTERNAL_MAX ||
      Object.values(driver.skills).some(
        (rating) =>
          !Number.isFinite(rating) ||
          rating < 0 ||
          rating > DRIVER_ABILITY_INTERNAL_MAX,
      )
    ) {
      // The published scale is still 0-100; the bound is the limit-break
      // ceiling so a rating deliberately placed past the scale is not read as
      // corrupt data. Anything above the ceiling still is.
      throw new Error(`${DATA_FILE}: invalid driver profile for ${driver.id}`)
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
    vehicleEraId: resolveRuntimeVehicleEra({
      eventDate: rawData.sourceDate,
      seriesId: definition.id,
    }).eraId,
  }

  validateSeriesPackage(pkg)
  return pkg
})

export const seriesPackageById = new Map(
  seriesPackages.map((series) => [series.id, series]),
)

export const defaultSeriesPackage = seriesPackageById.get('f1-custom')!

const compactRatingSourceColumns = {
  adaptability: 'Adaptability',
  consistency: 'Consistency',
  defending: 'Defending',
  errorControl: 'Error control',
  experience: 'Experience',
  overtaking: 'Overtaking',
  qualifyingPace: 'Qualifying pace',
  racePace: 'Race pace',
  raceStart: 'Race start',
  technicalFeedback: 'Technical feedback',
  tyreManagement: 'Tyre management',
  wetSkill: 'Wet skill',
} as const satisfies Record<keyof CompactDriverRatings, string>

function compactRatingsFromDriver(driver: Driver): CompactDriverRatings {
  const rawRatings = driver.performanceSource?.rawRatings

  if (!rawRatings) {
    throw new Error(`${DATA_FILE}: driver ${driver.id} has no rating source`)
  }

  return Object.fromEntries(
    Object.entries(compactRatingSourceColumns).map(([key, column]) => {
      const value = rawRatings[column]

      if (!Number.isFinite(value)) {
        throw new Error(
          `${DATA_FILE}: driver ${driver.id} has no numeric ${column} rating`,
        )
      }

      return [key, value / 100]
    }),
  ) as CompactDriverRatings
}

function poolSourceRoleFor(driver: Driver): DriverSourceRole {
  if (driver.seatRole === 'reserve') return 'reserve'
  if (driver.seatRole === 'third_car') return 'test'
  return 'regular'
}

type PoolDriverSource = {
  confidence: DriverPoolProvenance['confidence']
  methodVersion?: string
  seriesId: SeriesId
  sourceDate: string
  sourceFile: string
  sourceType: DriverPoolProvenance['sourceType']
  team?: Team
}

function poolRecordFromDriver(
  driver: Driver,
  source: PoolDriverSource,
): DriverPoolRecord {
  const sourceRole = poolSourceRoleFor(driver)
  const sourceId = `${source.seriesId}:2026:${driver.id}`
  const sourceIds = [sourceId]
  const provenance: DriverPoolProvenance = {
    confidence: source.confidence,
    id: sourceId,
    methodVersion: source.methodVersion,
    sourceCarNumber: driver.carNumber,
    sourceDate: source.sourceDate,
    sourceFile: source.sourceFile,
    sourceIds,
    sourceRole,
    sourceSeason: 2026,
    sourceSeriesId: source.seriesId,
    sourceTeam: source.team
      ? { name: source.team.name, sourceId: source.team.id }
      : undefined,
    sourceType: source.sourceType,
  }

  return {
    careerHistory: [
      {
        role: sourceRole,
        season: 2026,
        seriesId: source.seriesId,
        sourceCarNumber: driver.carNumber,
        sourceIds,
        sourceTeamId: source.team?.id,
        sourceTeamName: source.team?.name,
      },
    ],
    code: driver.code,
    id: driver.id,
    name: driver.name,
    nationality: driver.nationality ?? 'UNK',
    overall: driver.performanceSource?.overall ?? 0,
    potential: Math.round((driver.potential ?? 0) * 100),
    provenance: [provenance],
    ratingSourceProvenanceId: provenance.id,
    ratings: compactRatingsFromDriver(driver),
  }
}

function poolRecordFromReserve(reserve: RawReserve): DriverPoolRecord {
  const raw: RawDriver = {
    code: reserve.code,
    id: reserve.id,
    name: reserve.name,
    nationality: reserve.nationality,
    number: 0,
    overall: reserve.overall,
    potential: reserve.potential,
  }
  const sourceId = `f1-custom:2026:${reserve.id}:reserve-registry`
  const sourceIds = [sourceId]
  const sourceTeam = initialTeams.find((team) => team.id === reserve.teamId)

  if (!sourceTeam) {
    throw new Error(
      `${DATA_FILE}: reserve ${reserve.id} references missing team ${reserve.teamId}`,
    )
  }

  return {
    careerHistory: [
      {
        role: 'reserve',
        season: 2026,
        seriesId: 'f1-custom',
        sourceIds,
        sourceTeamId: sourceTeam.id,
        sourceTeamName: sourceTeam.name,
      },
    ],
    code: reserve.code,
    id: reserve.id,
    name: reserve.name,
    nationality: reserve.nationality,
    overall: reserve.overall,
    potential: reserve.potential,
    provenance: [
      {
        confidence: 'low',
        id: sourceId,
        methodVersion: HISTORICAL_DRIVER_POOL_METHOD_VERSION,
        sourceDate: rawData.sourceDate,
        sourceFile: DATA_FILE,
        sourceIds,
        sourceRole: 'reserve',
        sourceSeason: 2026,
        sourceSeriesId: 'f1-custom',
        sourceTeam: { name: sourceTeam.name, sourceId: sourceTeam.id },
        sourceType: 'synthetic',
      },
    ],
    ratingSourceProvenanceId: sourceId,
    ratings: compactRatingsFor(raw),
  }
}

const poolById = new Map<string, DriverPoolRecord>()

function mergePoolRecord(candidate: DriverPoolRecord) {
  const current = poolById.get(candidate.id)

  if (!current) {
    poolById.set(candidate.id, candidate)
    return
  }

  if (current.name !== candidate.name) {
    throw new Error(`${DATA_FILE}: driver id ${candidate.id} maps to multiple names`)
  }

  const winner = candidate.overall > current.overall ? candidate : current
  const provenanceIds = new Set(current.provenance.map((source) => source.id))
  const provenance = [
    ...current.provenance,
    ...candidate.provenance.filter((source) => !provenanceIds.has(source.id)),
  ] as DriverPoolRecord['provenance']
  const careerKeys = new Set(
    current.careerHistory.map(
      (entry) =>
        `${entry.season}:${entry.seriesId}:${entry.sourceTeamId ?? ''}:${entry.role}`,
    ),
  )
  const careerHistory = [
    ...current.careerHistory,
    ...candidate.careerHistory.filter(
      (entry) =>
        !careerKeys.has(
          `${entry.season}:${entry.seriesId}:${entry.sourceTeamId ?? ''}:${entry.role}`,
        ),
    ),
  ] as DriverPoolRecord['careerHistory']

  poolById.set(candidate.id, { ...winner, careerHistory, provenance })
}

const f1Package = seriesPackageById.get('f1-custom')!
const superFormulaPackage = seriesPackageById.get('super-formula')!
const f1TeamById = new Map(f1Package.teams.map((team) => [team.id, team]))
const superFormulaTeamById = new Map(
  superFormulaPackage.teams.map((team) => [team.id, team]),
)

for (const driver of f1Package.drivers) {
  mergePoolRecord(
    poolRecordFromDriver(driver, {
      confidence: 'medium',
      seriesId: 'f1-custom',
      sourceDate: rawData.sourceDate,
      sourceFile: PERFORMANCE_CSV_FILE,
      sourceType: 'editorial',
      team: f1TeamById.get(driver.teamId),
    }),
  )
}

for (const driver of historicalDriverPool2026) mergePoolRecord(driver)

for (const driver of superFormulaPackage.drivers) {
  mergePoolRecord(
    poolRecordFromDriver(driver, {
      confidence: 'low',
      methodVersion: HISTORICAL_DRIVER_POOL_METHOD_VERSION,
      seriesId: 'super-formula',
      sourceDate: rawData.sourceDate,
      sourceFile: DATA_FILE,
      sourceType: 'synthetic',
      team: superFormulaTeamById.get(driver.teamId),
    }),
  )
}

for (const driver of reserveDrivers) {
  mergePoolRecord(
    poolRecordFromDriver(driver, {
      confidence: 'medium',
      seriesId: 'f1-custom',
      sourceDate: rawData.sourceDate,
      sourceFile: PERFORMANCE_CSV_FILE,
      sourceType: 'editorial',
      team: f1TeamById.get(driver.teamId),
    }),
  )
}

for (const reserve of rawData.reserves) {
  mergePoolRecord(poolRecordFromReserve(reserve))
}

export const driverPool2026 = validateDriverPool([...poolById.values()], {
  expectedIdentityCount: 110,
  expectedProvenanceBySourceSeries: { f2: 22, f3: 30 },
  expectedProvenanceCount: 111,
})

export type SeatAssignment = {
  carNumber: number
  season?: number
  seatRole?: NonNullable<Driver['seatRole']>
  seriesId: SeriesId
  startOffset?: number
  teamId: string
}

/** Builds a shared pool identity into a target-series seat. */
export function seatedDriverFrom(
  poolDriver: DriverPoolRecord,
  seat: SeatAssignment,
): Driver {
  return materializeAssignedDriver(poolDriver, {
    ...seat,
    season: seat.season ?? 2026,
  })
}

const proposedDriverAssignments2026: DriverAssignment[] = [
  ...seriesPackages.flatMap((series) =>
    series.drivers.map((driver) => ({
      active: true,
      carNumber: driver.carNumber,
      driverId: driver.id,
      role:
        driver.seatRole === 'third_car'
          ? ('test' as const)
          : (driver.seatRole ?? 'regular'),
      season: 2026,
      seriesId: series.id,
      teamId: driver.teamId,
    })),
  ),
  ...rawData.reserves.map((reserve) => ({
    active: true,
    carNumber: null,
    driverId: reserve.id,
    role: 'reserve' as const,
    season: 2026,
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
]

export const driverAssignments2026 = validateDriverAssignments(
  proposedDriverAssignments2026,
  {
    driverPool: driverPool2026,
    expectedSeason: 2026,
    seriesCarCapacity: Object.fromEntries(
      seriesPackages.map((series) => [series.id, series.carCount]),
    ),
    teams: seriesPackages.flatMap((series) =>
      series.teams.map((team) => ({
        id: team.id,
        seatCapacity: series.drivers.filter(
          (driver) => driver.teamId === team.id,
        ).length,
        seriesId: series.id,
      })),
    ),
  },
)

export const seriesRegistryAudit = {
  assignmentCount: driverAssignments2026.length,
  danglingAssignmentCount: driverAssignments2026.filter(
    (assignment) => !poolById.has(assignment.driverId),
  ).length,
  driverPoolCount: driverPool2026.length,
  executableSeriesIds: seriesPackages.map((series) => series.id),
  f2HistoricalDriverCount: historicalDriverPool2026.filter(
    (driver) => driver.provenance[0].sourceSeriesId === 'f2',
  ).length,
  f3HistoricalDriverCount: historicalDriverPool2026.filter(
    (driver) => driver.provenance[0].sourceSeriesId === 'f3',
  ).length,
  provenanceCount: driverPool2026.reduce(
    (count, driver) => count + driver.provenance.length,
    0,
  ),
  schemaVersion: rawData.schemaVersion,
  sourceDate: rawData.sourceDate,
}
