import type { Vector3Tuple } from 'three'
import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from './series/seriesIds'
import type { RuntimeSystems } from './simulation/runtimeSystems'
import type {
  SuperFormulaControlTireInventory,
  SuperFormulaControlTireSurface,
  SuperFormulaControlTireUnavailableInput,
} from './simulation/superFormulaControlTires2026'
import type { SuperFormula2026EngineLedger } from './simulation/superFormulaEngineLedger'

export type CameraMode = 'overview' | 'chase' | 'orbit'
export type SpeedMultiplier = 1 | 5 | 20 | 60
export type TireCompound = 'S' | 'M' | 'H' | 'I' | 'W'
export type DryTireCompound = Extract<TireCompound, 'S' | 'M' | 'H'>
export type TireSetAllocation = Record<TireCompound, number>

export type CategoryRaceFormat = {
  featureDistanceKm: number | null
  featureDistanceOverridesKm: Record<string, number>
  featureOverallTimeLimitSeconds: number | null
  featureTimeLimitSeconds: number | null
  sprintDistanceKm: number | null
  sprintDistanceOverridesKm: Record<string, number>
  sprintLapsRatio: number | null
  sprintOverallTimeLimitSeconds: number | null
  sprintTimeLimitSeconds: number | null
}

export type TirePerformanceState =
  | 'cold'
  | 'optimal'
  | 'graining'
  | 'overheating'
  | 'degraded'
export type DryCompoundFamily = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'
export type GridSource = 'brief' | 'qualifying' | 'openf1'
export type FlagState = 'clear' | 'yellow' | 'vsc' | 'sc' | 'red'
export type SectorFlagState = FlagState | 'double-yellow'
export type IncidentStopLocation = 'on-track' | 'off-track'
export type IncidentTrackState =
  | 'clear'
  | 'on-track-stopped'
  | 'off-track-stopped'
export type CarStatus =
  | 'running'
  | 'pit'
  | 'retired'
  | 'finished'
  | 'disqualified'
  | 'dns'
export type SessionStatus = 'racing' | 'finished'
export type StartProcedurePhase =
  | 'formation'
  | 'grid'
  | 'lights'
  | 'racing'
export type WeatherState = 'clear' | 'light-rain' | 'heavy-rain'
export type ActiveAeroMode = 'corner' | 'partial-straight' | 'straight'
export type DriverAdjustableBodyworkState =
  | 'corner'
  | 'transition-to-straight'
  | 'straight'
  | 'transition-to-corner'
  | 'failed-corner-safe'
export type ActiveAeroFailureState =
  | 'operational'
  | 'failed-corner-safe'
export type ActiveAeroTransitionState = {
  durationSeconds: number
  elapsedSeconds: number
  fromCommand: ActiveAeroMode
  frontStartStraightFraction: number
  rearStartStraightFraction: number
  toCommand: ActiveAeroMode
}
/** Durable front/rear bodywork state carried by live ticks and checkpoints. */
export type ActiveAeroState = {
  activationZoneId: string | null
  command: ActiveAeroMode
  commandAtSeconds: number | null
  failureState: ActiveAeroFailureState
  front: DriverAdjustableBodyworkState
  /** Continuous Corner=0 to Straight=1 front-wing position. */
  frontStraightFraction: number
  rear: DriverAdjustableBodyworkState
  /** Continuous Corner=0 to Straight=1 rear-wing position. */
  rearStraightFraction: number
  transition: ActiveAeroTransitionState | null
  transitionProgress: number
}
export type OvertakeStatus = 'disabled' | 'available' | 'active'
export type RestartProcedure = 'none' | 'standing' | 'rolling'
export type ErsMode = 'harvest' | 'balanced' | 'deploy'
export type ErsKOperatingMode =
  | 'propulsion'
  | 'braking-regeneration'
  | 'lift-coast-regeneration'
  | 'full-throttle-superclip'
  | 'inactive'
export type RacePaceMode = 'push' | 'standard' | 'save' | 'defend'
export type BattlePhase =
  | 'single-file'
  | 'following'
  | 'attacking'
  | 'side-by-side'
  | 'defending'
  | 'resolved'
export type StewardStatus = 'clear' | 'noted' | 'investigating' | 'penalty'
export type StewardOffence =
  | 'causing-collision'
  | 'forcing-off-track'
  | 'unsafe-rejoin'
  | 'leaving-track-advantage'
export type StewardConsequence =
  | 'none'
  | 'minor'
  | 'significant'
  | 'major'
  | 'reckless'
export type PitPhase = 'none' | 'entry' | 'lane' | 'box' | 'exit'
export type PitServiceKind =
  | 'tire-stop'
  | 'repair-stop'
  | 'drive-through'
  | 'stop-go'
  | null
export type PenaltyKind =
  | 'time-5'
  | 'time-10'
  | 'drive-through'
  | 'stop-go-10'
  | 'penalty-lap'
  | 'grid-drop'
  | 'pit-lane-start'
  | 'disqualification'
export type TimedRunPhase = 'garage' | 'out-lap' | 'attack-lap' | 'in-lap' | 'cooldown'
export type PracticeProgramKind =
  | 'systems-check'
  | 'aero-correlation'
  | 'setup-baseline'
  | 'qualifying-simulation'
  | 'race-simulation'
  | 'compound-comparison'
  | 'qualifying-preparation'
  | 'setup-verification'
  | 'start-pit-practice'
export type TimedSegmentAttemptStatus =
  | 'garage'
  | 'left-pits'
  | 'flying-lap'
export type QualifyingReleaseStrategy =
  | 'bank-lap'
  | 'traffic-gap'
  | 'track-evolution'
  | 'weather-priority'
export type QualifyingClassificationStatus =
  | 'classified'
  | 'no-time'
  | 'deleted'
export type WeekendStage =
  | 'fp1'
  | 'fp2'
  | 'fp3'
  | 'sprintQualifying'
  | 'sprint'
  | 'qualifying'
  | 'qualifying2'
  | 'race'
  | 'race2'

export type RechargeMeasurementPoint = 'CU-K-HV-DC-bus'

export type F1RechargeSessionType =
  | 'freePractice'
  | 'sprintQualifying'
  | 'qualifying'
  | 'sprint'
  | 'race'
export type RechargeLimit =
  | { kind: 'finite'; maxCuKBusRechargeMj: number }
  | { kind: 'unlimited'; maxCuKBusRechargeMj: null }
  | { kind: 'unavailable'; maxCuKBusRechargeMj: null }
export type FiaPuRechargeRule = {
  id: string
  sessionTypes: F1RechargeSessionType[]
  lapKind: 'any' | 'out-lap-other-than-in-ttcs'
  overtakeAtLapStart: 'active' | 'inactive' | 'not-applicable'
  lowGrip: 'any' | 'required'
  behindSafetyCar: 'any' | 'required'
  limit: RechargeLimit
  /** Optional decomposition supplied by the same event table. */
  baseLimitMj?: number
  additionalAllowanceMj?: number
}

/**
 * Provenance-bearing event input from FIA Competition / Power Unit Information.
 * Missing event or stage values resolve as unavailable unless the binding
 * technical text itself defines the complete context. They are never inferred
 * from a simulated lap or an observed speed trace.
 */
export type FiaPuEventInput = {
  schemaVersion: 1
  seriesId: 'f1-custom'
  eventId: string
  trackId: string
  source: {
    sourceId: string
    authority: 'race-director-instruction'
    documentNumber: number
    documentDate: string
    publishedAt: string
    url: string
    enclosure: string
    sha256: string
    validationStatus: 'verified'
  }
  recharge: {
    measuredAt: RechargeMeasurementPoint
    rules: FiaPuRechargeRule[]
  }
}

export type RechargeRuleDefinition = {
  limit: RechargeLimit
  baseLimitMJ: number | null
  additionalAllowanceMJ: number
  measuredAt: RechargeMeasurementPoint
  resolution:
    | 'technical-default'
    | 'technical-low-grip-safety-car'
    | 'verified-event'
    | 'event-context-unavailable'
  ruleId: string
  sourceId: string
}

export type RechargeRuleState = RechargeRuleDefinition & {
  usedMJ: number
  remainingMJ: number | null
}

/** High-level scheduling intent. The physical layer remains the sole SOC owner. */
export type F1EnergyIntent = {
  propulsionAggression: number
  harvestPreference: number
  liftCoastPreference: number
  superclipAcceptance: number
  endOfStraightHarvestBias: number
  defendEnergyReserve: number
  attackEnergyReserve: number
  qualifyingSpendBias: number
}

/** Independent driver skills. The displayed overall is informational only. */
export type DriverSkillProfile = {
  rawPace: number
  qualifyingPace: number
  racePace: number
  brakingSkill: number
  lowSpeedCornerSkill: number
  mediumSpeedCornerSkill: number
  highSpeedCornerSkill: number
  tractionControl: number
  throttleControl: number
  tireManagement: number
  tireWarmupSkill: number
  wetSkill: number
  intermediateSkill: number
  overtakingSkill: number
  defendingSkill: number
  racecraft: number
  consistency: number
  mistakeResistance: number
  pressureHandling: number
  trafficManagement: number
  dirtyAirManagement: number
  fuelManagement: number
  ersManagement: number
  restartSkill: number
  startSkill: number
  confidence: number
  precision: number
  adaptability: number
  raceAwareness: number
  carBalanceAdaptation: number
}

export type DriverTunableStat = keyof DriverSkillProfile

/** Preferences alter execution losses only; they never create car performance. */
export type DriverStyleProfile = {
  frontEndPreference: number
  rearStabilityNeed: number
  oversteerTolerance: number
  understeerTolerance: number
  brakingAggression: number
  cornerShapePreference: number
}

/** Fixed season-long physical characteristics shared by both team cars. */
export type MachinePerformanceProfile = {
  qualifyingPace: number
  racePace: number
  lowSpeedCornerPerformance: number
  mediumSpeedCornerPerformance: number
  highSpeedCornerPerformance: number
  mechanicalGrip: number
  traction: number
  brakingStability: number
  brakingPerformance: number
  aerodynamicEfficiency: number
  downforceGeneration: number
  dragEfficiency: number
  straightLineEfficiency: number
  activeAeroEfficiency: number
  towSensitivity: number
  dirtyAirTolerance: number
  tireWarmup: number
  tireDegManagement: number
  frontTireManagement: number
  rearTireManagement: number
  wetPerformance: number
  intermediatePerformance: number
  kerbHandling: number
  rideCompliance: number
  bumpTolerance: number
  coolingEfficiency: number
  brakeCooling: number
  puOutput: number
  electricalDeploymentEfficiency: number
  energyRecoveryEfficiency: number
  fuelEfficiency: number
  reliability: number
}

export type MachineTunableStat = keyof MachinePerformanceProfile

export type RaceEventKind =
  | 'flag'
  | 'track-limit'
  | 'incident'
  | 'accident'
  | 'pit'
  | 'penalty'
  | 'finish'
  | 'weather'
  | 'overtake'
  | 'contact'
  | 'investigation'
  | 'info'

export type RaceEvent = {
  id: string
  kind: RaceEventKind
  elapsedSeconds: number
  timeLabel: string
  message: string
}

export type PenaltyRecord = {
  id: string
  issuedAtSeconds: number
  kind: PenaltyKind
  reason: string
  seconds: number
  /**
   * F1-only FIA point value retained with an event penalty. SUPER FORMULA
   * event penalties always store zero here; Article 5 uses its own
   * official-adjudication season ledger.
   */
  penaltyPoints: number
  served: boolean
  mustServeByLap?: number | null
  servedAtSeconds?: number | null
}

/**
 * FIA/ISC automatic-decision evidence retained while F1 stewards consider an
 * incident. SUPER FORMULA does not create this record from simulated driving:
 * it records an observation and requires an explicit official decision for
 * its separate Article 5 ledger.
 */
export type StewardCase = {
  id: string
  openedAtSeconds: number
  resolveAtSeconds: number
  driverId: string
  otherDriverId: string | null
  offence: StewardOffence
  article: string
  /** Share of responsibility assigned to the investigated driver, 0..1. */
  responsibilityShare: number
  consequence: StewardConsequence
  advantageSeconds?: number
}

export type ComponentCondition = {
  conditionPercent: number
  allocationUsed: number
  allocationLimit: number | null
}

export type CarComponents = {
  ice: ComponentCondition
  turbo: ComponentCondition
  exhaust: ComponentCondition
  energyStore: ComponentCondition
  controlElectronics: ComponentCondition
  mguK: ComponentCondition
  gearbox: ComponentCondition
}

export type TrackProgressZone = {
  start: number
  end: number
  label: string
}

/**
 * A force-model input for the local road surface. It is intentionally separate
 * from render geometry and the legacy `surfaceRoughness` hint: values must
 * identify whether they are sourced observations or simulator policy.
 */
export type TrackSurfaceProfile = {
  baseFriction: number
  source: 'official' | 'observed' | 'simulator-policy'
  sourceLabel: string
  sourceUrl?: string | null
  sections?: Array<{
    baseFriction: number
    endProgress: number
    source: 'official' | 'observed' | 'simulator-policy'
    sourceLabel: string
    sourceUrl?: string | null
    startProgress: number
  }>
}

export type OperationalDataSource =
  | 'official'
  | 'openf1'
  | 'derived'
  | 'geometry-derived-estimate'
  | 'fallback'

export type DataProvenanceKind =
  | 'official'
  | 'observed'
  | 'calibrated'
  | 'simulated'
  | 'fallback'
  | 'unavailable'

export type DataProvenance = {
  kind: DataProvenanceKind
  provider: 'FIA' | 'Pirelli' | 'OpenF1' | 'Simulator'
  sampledAt?: string | null
  sessionKey?: number | null
  sourceYear?: number | null
  note?: string | null
}

export type AeroActivationZone = TrackProgressZone & {
  lowGripStart?: number
  lowGripMode: 'partial' | 'disabled'
  source: OperationalDataSource
}

export type OvertakeControlLine = {
  activationProgress: number
  detectionGapSeconds: number
  detectionProgress: number
  source: OperationalDataSource
}

/** Gap sampled at a detection line for one subsequent Overtake activation. */
export type OvertakeEligibility = {
  activationLap: number
  controlLineIndex: number
  detectedGapSeconds: number
  eligible: boolean
}

export type TireNomination = {
  H: DryCompoundFamily
  M: DryCompoundFamily
  S: DryCompoundFamily
  source: 'pirelli' | 'estimated'
  sourceUrl: string | null
}

export type TrackObservedCalibration = {
  cleanLapSampleCount?: number
  fuelGainPerLapSeconds?: number | null
  lapClassCounts?: Partial<Record<ObservedLapClass, number>>
  maxSpeedKph: number | null
  medianPitStopsPerDriver: number | null
  medianStintLapsByCompound: Partial<Record<TireCompound, number>>
  pitLaneTransitSeconds: number | null
  sectorWeights: [number, number, number] | null
  strategySampleCount: number
  trackTemperatureC: number | null
  tireDegradationByCompound: Partial<Record<TireCompound, number>>
  tirePaceOffsetByCompound: Partial<Record<TireCompound, number>>
  tireSampleCountByCompound: Partial<Record<TireCompound, number>>
  sampleCount: number
  provenance: DataProvenance
}

export type ObservedLapClass =
  | 'qualifying-push'
  | 'race-clear'
  | 'race-traffic'
  | 'race-management'
  | 'in-lap'
  | 'out-lap'
  | 'pit-lap'
  | 'safety-car'
  | 'virtual-safety-car'
  | 'yellow'
  | 'wet'
  | 'invalid'
  | 'unknown'

export type CalibrationStatus =
  | 'official'
  | 'observed'
  | 'derived'
  | 'estimated'
  | 'unverified'

export type PaceCalibrationSource = {
  provider: string
  label: string
  url: string
  retrievedAt: string
  documentHash?: string
  sessionKey?: number
}

export type EventPaceCalibration = {
  schemaVersion: number
  calibrationVersion: string
  series: 'f1-custom' | 'super-formula'
  season: number
  eventId: string
  eventName: string
  trackId: string
  round: number
  eventDate: string
  /**
   * True for a category x course baseline that is not a calendar event: the
   * category never races here, so there is no timing of its own and `round`
   * only satisfies the schema. Free Mode reads these when a category is put on
   * another series' circuit.
   */
  courseReference?: boolean
  qualifying: {
    poleSeconds: number | null
    top3MedianSeconds: number | null
    top5MedianSeconds: number | null
    theoreticalBestSeconds: number | null
    selectedReferenceSeconds: number
    selectedMethod: string
    fieldP10DeltaSeconds: number | null
    fieldMedianDeltaSeconds: number | null
    fieldP90DeltaSeconds: number | null
    referenceRangeSeconds?: [number, number]
    validLapCount: number
    deletedOrInvalidRate: number | null
    status: CalibrationStatus
    confidence: number
  }
  race: {
    cleanLapReferenceSeconds: number | null
    earlyStintMedianSeconds: number | null
    middleStintMedianSeconds: number | null
    lateStintMedianSeconds: number | null
    greenLapP10Seconds: number | null
    greenLapMedianSeconds: number | null
    greenLapP90Seconds: number | null
    winnerAverageSeconds: number | null
    referenceRangeSeconds?: [number, number]
    pitLaneLossSeconds: number | null
    inLapLossSeconds: number | null
    outLapLossSeconds: number | null
    clearAirTrafficDeltaSeconds: number | null
    cleanLapCount: number
    totalLapCount: number
    compoundMedianSeconds: Partial<Record<TireCompound, number>>
    stintMedianSeconds: Array<{
      compound: TireCompound | null
      medianSeconds: number
      sampleCount: number
      stintNumber: number
    }>
    fuelGainPerLapSeconds: number | null
    tireDegradationPerLapSeconds: number | null
    status: CalibrationStatus
    confidence: number
  }
  /**
   * Observed straight-line speed reference for the circuit.
   *
   * Two different observables are kept apart on purpose. The FIA speed trap is a
   * fixed point on one straight, so it measures the car only where the trap
   * happens to be: at Suzuka the 2026 trap read 308 km/h while the same cars
   * peaked at 349 km/h elsewhere on the lap. `*FieldPeakKph` is therefore the
   * maximum of the whole classified field's car telemetry over the session and
   * is the value a lap-wide simulated peak may be compared against; the trap
   * values are retained as published context, not as a peak.
   *
   * Qualifying and race peaks stay separate because they are not the same
   * physical state: qualifying runs low fuel and an attack setup in clear air,
   * while a race peak includes fuel, tow, and Overtake trains.
   */
  speed?: {
    /** Maximum car-telemetry speed across the classified qualifying field. */
    qualifyingFieldPeakKph: number | null
    /** Median of each qualifying car's own peak, less sensitive to one sample. */
    qualifyingDriverPeakMedianKph: number | null
    /** Maximum car-telemetry speed across the classified race field. */
    raceFieldPeakKph: number | null
    /** Median of each race car's own peak. */
    raceDriverPeakMedianKph: number | null
    /** Highest published FIA speed-trap value of the race, for context only. */
    raceTrapMaxKph: number | null
    /** Median published FIA speed-trap value of the race. */
    raceTrapMedianKph: number | null
    /** Highest published FIA speed-trap value of qualifying. */
    qualifyingTrapMaxKph: number | null
    telemetrySampleCount: number
    trapSampleCount: number
    status: CalibrationStatus
    confidence: number
  }
  simulation: {
    neutralBaseLapSeconds: number
    qualifyingOffsetSeconds: number
    expectedGreenRaceDeltaSeconds: number
    /**
     * Legacy additive calibration retained for old data migrations only.
     * Runtime race pace must not add this value directly.
     */
    raceModelCorrectionSeconds: number
    residualSigmaSeconds: number
    calibrationSeedCount: number
    validation?: {
      validatedAt: string
      qualifyingSeedCount: number
      raceSeedCount: number
      poleMedianSeconds: number
      top3MedianSeconds: number
      fieldMedianDeltaSeconds: number
      raceGreenMedianSeconds: number | null
      qualifyingReferenceErrorSeconds: number
      raceReferenceErrorSeconds: number | null
      liveQualifyingSeedCount?: number
      liveQualifyingTop3MedianSeconds?: number | null
      liveQualifyingReferenceErrorSeconds?: number | null
    }
  }
  sources: PaceCalibrationSource[]
  notes: string[]
}

export type CarSetup = {
  frontWing: number
  rearWing: number
  rideHeightMm: number
  brakeBiasPercent: number
  differentialPercent: number
  coolingPercent: number
}

export type TireSet = {
  id: string
  compound: TireCompound
  family: DryCompoundFamily | null
  laps: number
  heatCycles: number
  status: 'available' | 'used' | 'returned'
}

export type SafetyCarProcedureStage =
  | 'deployed'
  | 'collecting-field'
  | 'queue-formed'
  | 'unlapping'
  | 'in-this-lap'
  | 'pit-entry'

export type SafetyCarEligibilityStatus =
  | 'pending'
  | 'eligible'
  | 'ineligible'

export type NeutralisationProcedure =
  | {
      kind: 'vsc'
      stage: 'deployed' | 'ending'
      endingStartedAtSeconds: number | null
      resumeAtSeconds: number | null
    }
  | {
      kind: 'safety-car'
      stage: SafetyCarProcedureStage
      orangeLights: boolean
      /** Green rear light authorising only the cars named by Race Control. */
      greenLight: boolean
      /** B5.13.2b queue-gap instruction selected by the Race Director. */
      maximumQueueGapCarLengths: 10 | 20
      leaderDistanceAtDeployment: number
      leaderCollectionTargetDistance: number
      safetyCarDistance: number
      safetyCarLastUpdatedAtSeconds: number
      leaderCollectedAtSeconds: number | null
      fieldQueuedAtSeconds: number | null
      /** End-of-lap reference after each car's second SC1 crossing. */
      eligibilityLineTargetByDriver: Record<string, number>
      eligibilityStatusByDriver: Record<string, SafetyCarEligibilityStatus>
      eligibleLappedDriverIds: string[]
      /** Stable order published with the Race Control permission message. */
      unlappingOrderDriverIds: string[]
      /** Distance at which each authorised car passed the Safety Car. */
      unlappingPassedSafetyCarAtDistanceByDriver: Record<string, number>
      /** Cars that have completed the no-overtaking lap and joined the tail. */
      unlappingRejoinedDriverIds: string[]
      unauthorizedSafetyCarOvertakeDriverIds: string[]
      lastObservedSafetyCarGapByDriver: Record<string, number>
      lappedCarsMayOvertakeAtSeconds: number | null
      overtakingNotPermittedAtSeconds: number | null
      pitExitClosed: boolean
      /** B5.13.3 Race Director instruction for SC and every car to use pit lane. */
      pitLaneRouteRequired: boolean
      pitLaneRouteAnnouncedAtSeconds?: number | null
      returnNotBeforeLeaderDistance: number | null
      inThisLapEarliestLeaderDistance: number | null
      inThisLapAtSeconds: number | null
      pitEntryLeaderDistance: number | null
      pitEntrySafetyCarDistance: number | null
      pitEntryAtSeconds: number | null
      restartLineDistance: number | null
      restartTargetsByDriver: Record<string, number> | null
      /** B5.13.8: final lap remains neutralised after the SC enters the pits. */
      finishingUnderSafetyCar: boolean
    }

/**
 * A live flag phase carried in the race snapshot. `endSeconds` is the earliest
 * hazard-clear time; SC and VSC phases still complete their formal withdrawal
 * procedures before racing resumes.
 */
export type YellowFlagZone = {
  /** Exact track-progress position of the incident or obstruction. */
  incidentProgress: number
  /** Light/flag post immediately before the incident, in race direction. */
  startProgress: number
  /** Green-light/flag post immediately after the incident. */
  endProgress: number
}

export type ActiveFlagPhase = {
  id: string
  flag: Exclude<FlagState, 'clear'>
  /** Timing sector containing the incident, retained for timing displays. */
  sector: number
  /** Double yellow is used while a major incident is being assessed. */
  yellowSeverity?: 'single' | 'double'
  /** FIA marshalling sector controlled by a local yellow. */
  yellowZone?: YellowFlagZone
  safetyCarUsesPitLane?: boolean
  startSeconds: number
  endSeconds: number
  startMessage: string
  endMessage: string
  /** Race Control escalation after the marshals' initial local-yellow response. */
  escalation?: {
    activateAtSeconds: number
    endMessage: string
    flag: Exclude<FlagState, 'clear' | 'yellow'>
    hazardClearAtSeconds: number
    id: string
    safetyCarUsesPitLane?: boolean
    startMessage: string
  } | null
  neutralisation?: NeutralisationProcedure | null
  /** Legacy import hint; live SC timing is owned by `neutralisation`. */
  lappedCarsMayOvertakeAtSeconds?: number | null
}

export type Team = {
  id: string
  name: string
  color: string
  machine: MachinePerformanceProfile
  pitCrewSpeed: number
  performanceSource?: {
    fileName: string
    overall: number
    rawRatings: Record<string, number>
  }
}

export type Driver = {
  id: string
  teamId: string
  code: string
  name: string
  carNumber: number
  nationality?: string
  potential?: number
  seatRole?: 'regular' | 'third_car' | 'reserve' | 'development'
  skills: DriverSkillProfile
  style: DriverStyleProfile
  startOffset: number
  performanceSource?: {
    fileName: string
    overall: number
    rawRatings: Record<string, number>
  }
  /** Starting tire compound. The live compound lives on CarSnapshot. */
  tire: TireCompound
}

export type TrackDefinition = {
  id: string
  name: string
  location: string
  kind: 'permanent' | 'street' | 'hybrid'
  feature: string
  isSprintWeekend: boolean
  rainProbability: number
  centerline: Vector3Tuple[]
  width: number
  /** Circuit lap length used by the speed-integrated movement model. */
  lengthKm: number
  lengthSource: 'official' | 'estimated'
  /** Physical inputs for air density and surface load; estimates are explicit. */
  altitudeMeters?: number
  surfaceRoughness?: number
  /** Optional source-labelled local-surface force profile. */
  surfaceProfile?: TrackSurfaceProfile
  tireNomination?: TireNomination
  baseLapTime: number
  baseLapTimeSource?: 'estimated' | 'openf1-observed' | '2026-reference'
  /**
   * Reader-facing season benchmark. Qualifying is the representative pole
   * time; raceAverage is total winner time divided by laps and therefore may
   * include pit stops and neutralisations. It is not a clean-lap speed cap.
   */
  paceReference2026?: {
    qualifyingBasis:
      | 'official-result'
      | 'observed'
      | 'derived'
      | 'estimate'
    qualifyingSeconds: number
    qualifyingRangeSeconds?: [number, number]
    raceAverageBasis:
      | 'official-result'
      | 'observed'
      | 'derived'
      | 'estimate'
    raceAverageSeconds: number
    raceAverageRangeSeconds?: [number, number]
    series: 'f1-custom' | 'super-formula'
    sourceLabel: string
    sourceUrl: string
    note?: string
    calibration: EventPaceCalibration
  }
  observedCalibration?: TrackObservedCalibration
  calendar2026?: {
    calendarSlot: number
    championshipRound: number | null
    dateStart: string
    dateEnd: string
    status: 'scheduled' | 'cancelled'
    sourceUrl: string
  }
  /** Official scheduled Grand Prix lap count when the circuit is confirmed. */
  raceLaps?: number
  raceLapsSource?: 'official' | 'estimated'
  sectorMarks: number[]
  sectorMarksSource?: OperationalDataSource
  /** 2026 front/rear driver-adjustable bodywork activation zones. */
  aeroActivationZones?: AeroActivationZone[]
  /** FIA event map explicitly lists Straight Mode as unavailable. */
  activeAeroUnavailable?: boolean
  /** 2026 electrical Overtake detection and activation control lines. */
  overtakeControlLines?: OvertakeControlLine[]
  /** Safety-car timing lines used for the lightweight restart and pit logic. */
  safetyCarLines?: {
    line1Progress: number
    line2Progress: number
  }
  pitLane?: {
    boxCount: number
    boxSpacingProgress?: number
    boxStartProgress: number
    entryProgress: number
    exitProgress: number
    speedLimitKph: number
    geometrySource?: OperationalDataSource
    speedLimitSource?: OperationalDataSource
    sourceUrl?: string | null
  }
  corners?: Array<{
    number: number
    position: Vector3Tuple
  }>
  layoutSource?: {
    detail: 'real' | 'fallback'
    label: string
    provider: 'openf1' | 'official' | 'openstreetmap' | 'fallback'
    url: string | null
    year: number | null
  }
  /**
   * Maps raw OpenF1 location samples into this track's local frame. Official
   * vector layouts without a matching telemetry coordinate frame omit it.
   */
  locationProjection?: {
    rotationDeg: number
    centerX: number
    centerY: number
    scale: number
  }
  marshalPosts?: Vector3Tuple[]
  openF1?: {
    circuitImage: string | null
    circuitInfoUrl: string | null
    circuitKey: number
    circuitShortName: string
    countryCode: string
    dateEnd: string
    dateStart: string
    isCancelled: boolean
    meetingKey: number
    meetingName: string
    round: number
  }
  /** Free Mode provenance for category/track combinations outside a calendar. */
  freeModeProvenance?: {
    /**
     * `category-reference` marks a circuit that is not on this category's
     * calendar but has its own calibrated category x course baseline, so the
     * pace is neither a native calendar entry nor another category's number.
     */
    pace: 'native' | 'category-reference' | 'simulated'
    overtakeZones: 'native' | 'simulated'
    sourceSeries: Array<'F1' | 'SF'>
  }
}

export type RaceConfig = {
  track: TrackDefinition
  teams: Team[]
  drivers: Driver[]
  seed: string
  /** Exact competition identity required by event-scoped official inputs. */
  eventId?: string | null
  /** Category identity keeps checkpoints and category-specific assists isolated. */
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
  overtakeSystem?: 'active-aero' | 'ots'
  overtakeActivation?: 'first-detection' | 'after-one-lap' | 'immediate'
  tireSupplier?: 'Pirelli' | 'Yokohama'
  tireAllocation?: TireSetAllocation
  qualifyingDryCompound?: DryTireCompound
  /** Category rulebook duration for single timed sessions such as FP. */
  sessionDurationSeconds?: number | null
  /** Event bulletin override for one-off replacement or shortened races. */
  sessionRaceLapsOverride?: number | null
  sessionRaceTimeLimitSecondsOverride?: number | null
  sessionOverallTimeLimitSecondsOverride?: number | null
  featureRaceMandatoryPitStop?: boolean
  featureRaceTwoDryCompounds?: boolean
  categoryRaceFormat?: CategoryRaceFormat
  weekendStage?: WeekendStage
  /**
   * FIA event-supplied Nominal Tyre Mass used by the 2026 C4.1 resolver.
   * `null` or omission means no authoritative observation is available; it
   * must never be inferred from the simulator's historical vehicle mass.
   */
  fiaNominalTyreMassKg?: number | null
  /** Provenance-bearing FIA Race Director Power Unit Information input. */
  fiaPuEventInput?: FiaPuEventInput | null
  /** Persisted weekend effects passed from previously completed sessions. */
  weekendContext?: WeekendContext
  timedSessionPlan?: TimedSessionPlan
}

/** Pirelli-specific timed-session selection. Never use for SUPER FORMULA. */
export type F1PirelliSessionTire = {
  compound: TireCompound
  kind: 'f1-pirelli-session-tire'
}

/**
 * Published SF rules establish dry/wet control-set limits but no physical
 * coefficient model. Timed-session simulation must retain that absence rather
 * than importing an F1 compound multiplier as a convenience default.
 */
export type SuperFormulaControlSessionTire = {
  kind: 'super-formula-control-session-tire'
  physicalModel: {
    availability: 'unavailable'
    simulatorPolicy: 'do-not-apply-physical-tire-coefficients'
    sourceInput: SuperFormulaControlTireUnavailableInput
    value: null
  }
  surface: SuperFormulaControlTireSurface
}

export type TimedSessionTire =
  | F1PirelliSessionTire
  | SuperFormulaControlSessionTire

export type TimedSessionSegmentPlan = {
  /** True when race control treats the segment as wet for run planning. */
  declaredWet?: boolean
  /** Human-readable label when multiple windows share one classification key. */
  displayLabel?: string
  endsAtSeconds: number
  /** Stable identity for grouped sessions whose windows share the same name. */
  id?: string
  name: string
  participantDriverIds: string[]
  /** Group quotas used to promote measured times into the next segment. */
  promotionGroups?: Array<{
    advanceCount: number
    participantDriverIds: string[]
  }>
  /** False for parallel/group windows that use a predetermined participant list. */
  selectFromPrevious?: boolean
  startsAtSeconds: number
  suspensionEndsAtSeconds: number | null
  suspensionStartsAtSeconds: number | null
  /** Category-owned session tyre declaration; never a generic compound alias. */
  tire: TimedSessionTire
}

export type TimedSessionPlan = {
  segments: TimedSessionSegmentPlan[]
  totalDurationSeconds: number
}

/** State shared by every race-weekend lifecycle, independent of car category. */
export type WeekendContextBase = {
  completed: WeekendStage[]
  gridByStage: Partial<Record<'sprint' | 'race' | 'race2', string[]>>
  setupBonusByDriver: Record<string, number>
  setupByDriver: Record<string, CarSetup>
  setupConfidenceByDriver: Record<string, number>
  parcFermeLockedByDriver: Record<string, boolean>
  gridPenaltyByDriver: Record<string, number>
  /** Parc ferme or sporting decision requiring a start from the pit lane. */
  pitLaneStartByDriver: Record<string, boolean>
  qualificationStatusByDriver: Record<
    string,
    'qualified' | 'exempt' | 'not-qualified'
  >
  notes: string[]
}

/** F1-only weekend lifecycle state. Never use this shape for SUPER FORMULA. */
export type F1WeekendContext = WeekendContextBase & {
  seriesId: 'f1-custom'
  componentConditionByDriver: Record<string, CarComponents>
  tireSetInventoryByDriver: Record<string, TireSet[]>
  tireSetsByDriver: Record<string, Partial<Record<TireCompound, number>>>
}

/**
 * SUPER FORMULA 2026 lifecycle state. The published tyre rule supports only
 * dry/wet control-set inventories, and Article 24 owns engine allocation.
 * There is intentionally no F1 component or Pirelli compound compatibility
 * field on this branch.
 */
export type SuperFormulaWeekendContext = WeekendContextBase & {
  seriesId: 'super-formula'
  controlTireInventoryByDriver: Record<string, SuperFormulaControlTireInventory>
  engineLedgerByEntrant: Record<string, SuperFormula2026EngineLedger>
}

export type WeekendContext = F1WeekendContext | SuperFormulaWeekendContext

export type WeekendState = {
  stage: WeekendStage
  label: string
  completed: WeekendStage[]
  source: 'openf1' | 'simulation'
}

export type SectorTimingStatus =
  | 'pending'
  | 'overall-best'
  | 'personal-best'
  | 'slower'

/**
 * Display state of one measured timing segment. `dim` is an uncompleted
 * segment; `pit` and `stopped` are car states that outrank a comparison. Shared
 * so the timing tower and the pit wall cannot drift into two colour vocabularies.
 */
export type MiniSectorState =
  | 'dim'
  | 'yellow'
  | 'green'
  | 'purple'
  | 'pit'
  | 'stopped'

export type F1LapTireRun = {
  ageLaps: number
  compound: TireCompound
  kind: 'f1-pirelli'
}

export type SuperFormulaLapTireRun = {
  /** No temperature/wear coefficient is represented without a verified input. */
  kind: 'super-formula-control-tire'
  lapsOnCurrentSet: number
  physicalModelAvailability: 'unavailable'
  surface: SuperFormulaControlTireSurface
}

export type LapTireRun = F1LapTireRun | SuperFormulaLapTireRun

/** Immutable record written only when a car crosses the timing line. */
export type LapRecord = {
  lap: number
  lapTimeSeconds: number
  sectors: [number, number, number]
  /** 24 measured timing segments (eight per sector), written at the line. */
  miniSectors?: number[]
  /**
   * Timed-session segment the lap was set in (Q1/Q2/Q3, SQ1-3). Lets the timing
   * screen scope best laps and purple sectors to the current segment so each
   * knockout session starts from a clean sheet. Absent for race laps.
   */
  segment?: string
  tireRun: LapTireRun
  weather: WeatherState
  trackGrip: number
  position: number
  pitStop: boolean
  isValid: boolean
  invalidReason: string | null
}

/**
 * Energy Store state is carried between ticks and laps. Percent is a derived
 * UI value; every transfer is integrated in MJ from instantaneous kW.
 */
export type EnergyStoreState = {
  usableEnergyMJ: number
  currentEnergyMJ: number
  minimumUsableEnergyMJ: number
  maximumUsableEnergyMJ: number
  stateOfCharge: number
  /** CU-K high-voltage DC-bus power entering the Energy Store path. */
  chargeDcPowerKw: number
  /** CU-K high-voltage DC-bus power leaving the Energy Store path. */
  dischargeDcPowerKw: number
  /** Rate actually added to stored Energy Store energy after battery loss. */
  storedChargePowerKw: number
  /** Rate removed from stored Energy Store energy, including battery loss. */
  storedDischargePowerKw: number
  requestedDeploymentDcPowerKw: number
  actualDeploymentDcPowerKw: number
  /** Mechanical MGU-K propulsion power delivered before the driveline. */
  actualDeploymentPowerKw: number
  /** Mechanical generator request at the MGU-K shaft. */
  requestedRecoveryPowerKw: number
  /** Mechanical generator power absorbed at the MGU-K shaft. */
  actualRecoveryPowerKw: number
  requestedBrakePowerKw: number
  frictionBrakePowerKw: number
  recoveryTorqueNm: number
  motorMechanicalPowerKw: number
  batteryLossPowerKw: number
  inverterLossPowerKw: number
  motorLossPowerKw: number
  batteryTemperatureC: number
  motorGeneratorTemperatureC: number
  inverterTemperatureC: number
  requestedRecoveryMechanicalEnergyThisLapMJ: number
  recoveredMechanicalEnergyThisLapMJ: number
  /** Regulatory C5.2.10 ledger at the CU-K HV DC bus. */
  rechargedAtCuKBusThisLapMJ: number
  /** Energy actually added to the Energy Store after charge losses. */
  storedEnergyThisLapMJ: number
  deployedAtCuKBusThisLapMJ: number
  deployedMechanicalEnergyThisLapMJ: number
  energyRemovedThisLapMJ: number
  batteryLossThisLapMJ: number
  inverterLossThisLapMJ: number
  motorLossThisLapMJ: number
  /** Legacy checkpoint loss that predates component-level attribution. */
  unattributedConversionLossThisLapMJ: number
  conversionLossThisLapMJ: number
  lapStartEnergyMJ: number
  lastStepBalanceErrorMJ: number
  energyBalanceErrorMJ: number
  thermalDerating: number
  socDischargeDcPowerLimitKw: number
  batteryChargeDcPowerLimitKw: number
  maximumDeploymentDcPowerKw: number
  deploymentRequest: number
  operatingMode: ErsKOperatingMode
  rechargeRule: RechargeRuleState
}

export type CarSnapshot = {
  driverId: string
  teamId: string
  code: string
  carNumber: number
  driverName: string
  teamName: string
  teamColor: string
  progress: number
  lap: number
  totalDistance: number
  /** Signed physical displacement from the reference line, in metres. */
  lateralOffsetM: number
  /** Signed lateral velocity across the track, in metres per second. */
  lateralVelocityMps: number
  /** Driver-selected physical lateral target, in metres. */
  desiredLateralOffsetM: number
  /**
   * @deprecated Compatibility alias for `lateralOffsetM`. New simulation code
   * must write both fields until pre-lateral-dynamics checkpoints age out.
   */
  trackLateralOffset: number
  battlePhase: BattlePhase
  battleOpponentId: string | null
  battlePhaseUntilSeconds: number | null
  /** Positive gains and negative losses are applied progressively, not teleported. */
  battleDeltaSecondsRemaining: number
  /** Original grid slot for position-gain reporting in race classification. */
  gridPosition: number
  projectedLapTime: number
  /** Last completed lap, measured by the simulation rather than current pace. */
  lastLapTimeSeconds: number | null
  /** Best completed lap available for the final classification. */
  bestLapTimeSeconds: number | null
  bestLapLap: number | null
  /** Simulation clock at the most recent start/finish crossing. */
  lapStartedAtSeconds: number | null
  /** True only after this timed lap physically passes a double-yellow zone. */
  passedDoubleYellowThisLap: boolean
  /** Current-lap splits, written once when the CPU car crosses each sector line. */
  currentLapSectorTimes: [number | null, number | null, number | null]
  /** Current-lap 24-part timing, frozen as each mini-sector line is crossed. */
  currentLapMiniSectorTimes: Array<number | null>
  /** Completed lap history; sampled at the timing line, never per frame. */
  lapHistory: LapRecord[]
  position: number
  /**
   * Explicit live timing position retained for UI compatibility. While cars are
   * running it matches the physical `position`; pending time penalties only
   * change the classification after the finish.
   */
  liveDisplayPosition?: number
  gapToLeader: number
  gapToAhead: number
  gapToLeaderLabel: string
  gapToAheadLabel: string
  trackLimitWarnings: number
  /** Clock time when the car left the racing surface; null while on track. */
  offTrackSinceSeconds?: number | null
  /** Earliest time a stopped car may assess a safe gap and rejoin. */
  rejoinEligibleAtSeconds?: number | null
  /**
   * Explicit accident/recovery location used by Race Control and queue
   * ordering. Optional so checkpoints created before this field remain valid.
   */
  incidentTrackState?: IncidentTrackState
  incidentTrackStateSinceSeconds?: number | null
  speedKph: number
  /** Team/driver instruction that changes pace, energy use, and wear. */
  racePaceMode: RacePaceMode
  /** Completed-lap index on which the automatic pace mode was last evaluated. */
  racePaceModeDecisionLap: number
  /** Completed-lap index on which the automatic mode last actually changed. */
  racePaceModeChangedLap: number
  throttlePercent: number
  brakePercent: number
  rpm: number
  gear: number
  /** Turbo compressor state carried between fixed simulation ticks, 0..1. */
  turboSpoolFraction?: number
  /** Driveline clutch connection carried between ticks, 0=open and 1=locked. */
  clutchEngagementFraction?: number
  /** Generic category-level overtake display state (F1 Overtake or SF OTS). */
  overtakeStatus: OvertakeStatus
  /**
   * Category-owned physical and regulatory state. F1-only aero/ERS/component
   * truth is nested in the F1 branch; SUPER FORMULA has a separate no-ERS
   * runtime shape and cannot receive zero-valued F1 compatibility aliases.
   */
  runtimeSystems: RuntimeSystems
  /** Remaining fuel mass. This is consumed continuously from travelled distance. */
  fuelLoadKg: number
  brakeTemperatureC: number
  /** Time spent continuously above the brake system's safe thermal range. */
  brakeOverheatSeconds: number
  stewardStatus: StewardStatus
  stewardNote: string | null
  timedRunStartedAtSeconds: number | null
  timedRunPhase: TimedRunPhase | null
  timedRunsCompleted: number
  /** Active free-practice work programme; absent in race and qualifying. */
  practiceProgram?: PracticeProgramKind | null
  /** Flying laps completed in the current multi-lap practice run. */
  timedRunLapsCompleted?: number
  /** Planned flying-lap count before the car returns to the garage. */
  timedRunTargetLaps?: number
  timedSegmentBestSeconds: Record<string, number | null>
  /** Clock time of each segment best; exact ties favour the earlier lap. */
  timedSegmentBestSetAtSeconds?: Record<string, number | null>
  /** FIA no-time ordering evidence, reset at the start of each segment. */
  timedSegmentAttemptStatus?: Record<string, TimedSegmentAttemptStatus>
  timedReleaseStrategy?: QualifyingReleaseStrategy | null
  qualifyingClassificationStatus?: QualifyingClassificationStatus
  deletedLapCount: number
  impedingWarnings: number
  stewardsGrantedStart: boolean
  pitExitQueueSeconds: number
  // --- race state (phase 3-B) ---
  status: CarStatus
  /**
   * Highest lap whose crossing effects (incidents, warnings, pit calls) have
   * already run. Prevents re-rolling a lap after an unusual state transition.
   */
  processedLap: number
  /** Last 12-part track segment that evaluated a wheel-to-wheel battle. */
  processedBattleSegment: number
  pitStops: number
  pitPhase: PitPhase
  pitServiceKind: PitServiceKind
  pitLaneProgress: number | null
  /** Simulation time when the current pit stop began, for visual pit entry. */
  pitStartedAtSeconds: number | null
  /** While in the pit box: simulation time at which the stop completes. */
  pitUntilSeconds: number | null
  /** While back on track: simulation time until pit-exit visual blending ends. */
  pitExitUntilSeconds: number | null
  /** 0..1 accumulated car damage; adds lap time until repaired at a stop. */
  damage: number
  /** Accumulated time penalties, applied to classification. */
  penaltySeconds: number
  /**
   * F1/FIA event-local point counter. It is never the SUPER FORMULA Article 5
   * legal tally, and SUPER FORMULA runtime keeps this counter at zero.
   */
  penaltyPoints: number
  /** Classification laps removed by the stewards. */
  penaltyLaps: number
  penalties: PenaltyRecord[]
  /** Penalty seconds already served during pit stops. */
  servedPenaltySeconds: number
  retiredAtSeconds: number | null
  retiredReason: string | null
  /** Interpolated time the car crossed the finish line, for classification. */
  finishedAtSeconds: number | null
  /** True once a retired car has been cleared from the 3D track. */
  hiddenFromTrack: boolean
  vscDeltaSeconds: number
  /** Number of completed marshalling sectors with a negative VSC delta. */
  vscRedSectorCount?: number
  /** Absolute timing mini-sector last sampled for VSC compliance. */
  vscLastMeasuredMiniSector?: number | null
  /**
   * First mini-sector judged against the VSC delta. A car cannot brake from
   * racing speed to the delta inside the sector where the VSC is deployed, so
   * that sector is the driver's chance to reach it rather than a violation.
   */
  vscJudgedFromMiniSector?: number | null
  hasUnlappedUnderSafetyCar: boolean
  blueFlag: boolean
  blueFlagSinceSeconds: number | null
  /**
   * The driver is giving way to faster traffic in a timed session.
   *
   * Separate from `blueFlag`, which is a race-control instruction to a lapped
   * car. This is practice and qualifying etiquette: nobody is racing, so a
   * driver on a transit lap lets a lap on the clock through.
   */
  timedTrafficYield: boolean
  startsFromPitLane: boolean
  lowPowerStartDetected: boolean
  warningLightsUntilSeconds: number | null
}

export type RaceSnapshot = {
  elapsedSeconds: number
  elapsedLabel: string
  leaderLap: number
  raceLaps: number
  sessionStatus: SessionStatus
  startProcedure: StartProcedurePhase
  /** Seconds remaining in the current pre-start phase; zero once racing. */
  startProcedureRemainingSeconds: number
  formationLapDurationSeconds: number
  formationLapsPlanned: number
  formationLapsCompleted: number
  /** Race Director has ordered formation laps behind the Safety Car. */
  formationBehindSafetyCar: boolean
  /**
   * F1 severe-weather tyre mandate for the current SC start/resumption.
   * Non-F1 category runtimes always retain this as false.
   */
  wetWeatherTyresMandatory: boolean
  raceStartedAtSeconds: number | null
  restartProcedure: RestartProcedure
  restartProcedureUntilSeconds: number | null
  overtakeEnabled: boolean
  overtakeEnableAtLeaderDistance: number | null
  /** Per-car control-line targets used for post-Safety-Car re-enablement. */
  overtakeEnableTargetsByDriver: Record<string, number> | null
  cars: CarSnapshot[]
  eventMessage: string
  flag: FlagState
  flagLabel: string
  flagPhase: ActiveFlagPhase | null
  /** FIA green light-panel display following a VSC/SC withdrawal. */
  greenLightUntilSeconds: number | null
  /** Control state for sectors 1..3, including local and double yellows. */
  sectorFlags: [SectorFlagState, SectorFlagState, SectorFlagState]
  /** End of the post-SC/VSC/red restart window (low grip), if active. */
  restartUntilSeconds: number | null
  fuelEffectSeconds: number
  trackEvolutionLevel: number
  /** Stateful racing-line rubber for sectors 1..3, 0 (green) to 1 (rubbered). */
  rubberLevelBySector: [number, number, number]
  weather: WeatherState
  weatherLabel: string
  weatherForecastLabel: string
  /** FIA B1.5.10 declaration for the active F1 Sprint or Race; unavailable outside F1. */
  heatHazardDeclared: boolean | null
  /** FIA declaration heat index; unavailable outside F1. */
  heatIndexC: number | null
  /** FIA C4.6 session mass increase; unavailable outside F1. */
  heatHazardMassIncreaseKg: number | null
  /** FIA B1.5.11 declaration, held for the relevant F1 session; unavailable outside F1. */
  rainHazardDeclared: boolean | null
  /** FIA B1.5.12 Race Director grip declaration; unavailable outside F1. */
  lowGripConditions: boolean | null
  trackGrip: number
  /** Stateful surface water depth in millimetres for sectors 1..3. */
  surfaceWaterMmBySector: [number, number, number]
  /** Drying-line maturity from 0 (fully wet) to 1 (dry racing line). */
  dryingLineBySector: [number, number, number]
  greenFlagLaps: number
  /** Running clock excludes red-flag suspension time. */
  raceClockSeconds: number
  raceEndedEarly: boolean
  /** Target completed lap after a time limit, null for scheduled distance. */
  checkeredLapTarget: number | null
  timeLimitReachedAtSeconds: number | null
  timedSegmentId: string | null
  timedSegmentLabel: string | null
  timedSessionSuspended: boolean
  timedParticipantDriverIds: string[]
  timedYellowUntilSeconds: number | null
  timedYellowSector: number | null
  /** Incident position used to create the timed-session marshalling sector. */
  timedYellowProgress: number | null
  pitLaneOpen: boolean
  /** Separate SC operational signal; cars may enter while the exit is held. */
  pitExitOpen: boolean
  /** Open cases are resolved from evidence, not a second random roll. */
  stewardCases: StewardCase[]
  events: RaceEvent[]
  weekend: WeekendState
}
