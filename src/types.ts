import type { Vector3Tuple } from 'three'

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
export type OvertakeStatus = 'disabled' | 'available' | 'active'
export type RestartProcedure = 'none' | 'standing' | 'rolling'
export type ErsMode = 'harvest' | 'balanced' | 'deploy'
export type EnergyRecoveryMode =
  | 'none'
  | 'braking'
  | 'lift-coast'
  | 'super-clipping'
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
  /** FIA penalty points applied to the driver's twelve-month tally. */
  penaltyPoints: number
  served: boolean
  mustServeByLap?: number | null
  servedAtSeconds?: number | null
}

/** Structured evidence retained while the stewards consider an incident. */
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

export type OperationalDataSource = 'official' | 'openf1' | 'derived' | 'fallback'

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
  tireNomination?: TireNomination
  baseLapTime: number
  baseLapTimeSource?: 'estimated' | 'openf1-observed'
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
}

export type RaceConfig = {
  track: TrackDefinition
  teams: Team[]
  drivers: Driver[]
  seed: string
  /** Category identity keeps checkpoints and category-specific assists isolated. */
  seriesId?: 'f1-custom' | 'f2' | 'f3' | 'super-formula'
  overtakeSystem?: 'active-aero' | 'drs' | 'ots'
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
  /** FIA event directive override; public regulations otherwise expose 8.5 MJ. */
  fiaEventRechargeLimitMj?: number | null
  /** Persisted weekend effects passed from previously completed sessions. */
  weekendContext?: WeekendContext
  timedSessionPlan?: TimedSessionPlan
}

export type TimedSessionSegmentPlan = {
  compound: TireCompound
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
}

export type TimedSessionPlan = {
  segments: TimedSessionSegmentPlan[]
  totalDurationSeconds: number
}

export type WeekendContext = {
  completed: WeekendStage[]
  gridByStage: Partial<Record<'sprint' | 'race' | 'race2', string[]>>
  setupBonusByDriver: Record<string, number>
  setupByDriver: Record<string, CarSetup>
  setupConfidenceByDriver: Record<string, number>
  parcFermeLockedByDriver: Record<string, boolean>
  componentConditionByDriver: Record<string, CarComponents>
  tireSetsByDriver: Record<string, Partial<Record<TireCompound, number>>>
  tireSetInventoryByDriver: Record<string, TireSet[]>
  gridPenaltyByDriver: Record<string, number>
  /** Parc ferme or sporting decision requiring a start from the pit lane. */
  pitLaneStartByDriver: Record<string, boolean>
  qualificationStatusByDriver: Record<
    string,
    'qualified' | 'exempt' | 'not-qualified'
  >
  notes: string[]
}

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

/** Immutable record written only when a car crosses the timing line. */
export type LapRecord = {
  lap: number
  lapTimeSeconds: number
  sectors: [number, number, number]
  /** 24 measured timing segments (eight per sector), written at the line. */
  miniSectors?: number[]
  tire: TireCompound
  tireAgeLaps: number
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
  chargePowerKw: number
  dischargePowerKw: number
  requestedDeploymentPowerKw: number
  actualDeploymentPowerKw: number
  requestedRecoveryPowerKw: number
  actualRecoveryPowerKw: number
  requestedBrakePowerKw: number
  frictionBrakePowerKw: number
  recoveryTorqueNm: number
  motorMechanicalPowerKw: number
  batteryChargePowerKw: number
  batteryDischargePowerKw: number
  batteryTemperatureC: number
  motorGeneratorTemperatureC: number
  inverterTemperatureC: number
  harvestPotentialThisLapMJ: number
  actualHarvestedThisLapMJ: number
  deployedMechanicalEnergyThisLapMJ: number
  energyRemovedThisLapMJ: number
  conversionLossThisLapMJ: number
  lapStartEnergyMJ: number
  energyBalanceErrorMJ: number
  thermalDerating: number
  socPowerLimitKw: number
  batteryAcceptancePowerKw: number
  maximumDeploymentPowerKw: number
  deploymentRequest: number
  recoveryMode: EnergyRecoveryMode
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
  /** Compatibility field; normal-track simulation keeps this fixed at zero. */
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
  gapToLeader: number
  gapToAhead: number
  gapToLeaderLabel: string
  gapToAheadLabel: string
  trackLimitWarnings: number
  speedKph: number
  /** Team/driver instruction that changes pace, energy use, and wear. */
  racePaceMode: RacePaceMode
  throttlePercent: number
  brakePercent: number
  rpm: number
  gear: number
  /** 2026 front/rear driver-adjustable bodywork state. */
  activeAeroMode: ActiveAeroMode
  /** 2026 electrical Overtake availability, separate from active aero. */
  overtakeStatus: OvertakeStatus
  /** Detection-line result held until the corresponding activation zone. */
  overtakeEligibility: OvertakeEligibility | null
  /** Additional electrical energy available to 2026 Overtake this lap. */
  overtakeEnergyRemainingMj: number
  /** Super Formula OTS allocation; absent for categories using DRS/aero overtake. */
  otsRemainingSeconds?: number
  /**
   * Race time until which OTS may not be reactivated after a use. Super Formula
   * enforces a per-circuit lockout (about 120 s at Fuji/Motegi, 110 s at SUGO,
   * 100 s at Suzuka/Autopolis) so the allocation cannot be spent in one burst.
   */
  otsCooldownUntilSeconds?: number
  /** ERS-K recharge accumulated on the current lap for regulation limits. */
  energyHarvestedThisLapMj: number
  /** Battery energy spent by the MGU-K on the current lap. */
  energyDeployedThisLapMj: number
  ersMode: ErsMode
  /** Estimated instantaneous MGU-K deployment, never OpenF1-observed. */
  ersPowerKw: number
  /** Conserved Energy Store, electrical machine, and thermal state. */
  energyStore: EnergyStoreState
  ersBatteryPercent: number
  /** Continuous 0..1 high-speed energy-recovery severity. */
  superClippingIntensity: number
  /** Fraction of normal PU + MGU-K wheel power currently available. */
  superClippingDrivePowerScale: number
  /** Electrical power being recovered specifically by super clipping. */
  superClippingRegenPowerKw: number
  /** Energy recovered by super clipping on the current lap. */
  superClippingRecoveredThisLapMj: number
  /** Simulation clock at the start of the current clipping episode. */
  superClippingStartedAtSeconds: number | null
  /** Track progress at the start of the current clipping episode. */
  superClippingStartedAtProgress: number | null
  /** Elapsed duration of the current clipping episode. */
  superClippingDurationSeconds: number
  /** Remaining fuel mass. This is consumed continuously from travelled distance. */
  fuelLoadKg: number
  /** Surface tread temperature used for immediate grip and wear. */
  tireTemperatureC: number
  /** Slower-moving internal tyre temperature used for thermal history. */
  tireCarcassTemperatureC: number
  /** Temporary cold-surface performance loss, 0..100. */
  tireGrainingPercent: number
  /** Temporary heat saturation, 0..100. */
  tireOverheatingPercent: number
  tirePerformanceState: TirePerformanceState
  /** Accumulated stint wear independent from integer lap age. */
  tireWearPercent: number
  /** Permanent performance loss accumulated while outside the thermal window. */
  tireThermalStressPercent?: number
  brakeTemperatureC: number
  /** Time spent continuously above the brake system's safe thermal range. */
  brakeOverheatSeconds: number
  stewardStatus: StewardStatus
  stewardNote: string | null
  timedRunStartedAtSeconds: number | null
  timedRunPhase: TimedRunPhase | null
  timedRunsCompleted: number
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
   * already run. Prevents re-rolling a lap when an incident time-loss pushes
   * the car back across the same lap boundary.
   */
  processedLap: number
  /** Last 12-part track segment that evaluated a wheel-to-wheel battle. */
  processedBattleSegment: number
  /** Current tire compound (changes at pit stops). */
  tire: TireCompound
  tireAgeLaps: number
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
  /** Compound that will be fitted when the active stop completes. */
  pendingTire: TireCompound | null
  /** Distinct dry compounds used so far (two-compound rule). */
  compoundsUsed: TireCompound[]
  /** Remaining weekend tire sets available to this car's strategy. */
  tireSetsRemaining: Partial<Record<TireCompound, number>>
  /** 0..1 accumulated car damage; adds lap time until repaired at a stop. */
  damage: number
  /** Accumulated time penalties, applied to classification. */
  penaltySeconds: number
  /** Penalty points imposed during this competition. */
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
  hasUnlappedUnderSafetyCar: boolean
  blueFlag: boolean
  blueFlagSinceSeconds: number | null
  startsFromPitLane: boolean
  lowPowerStartDetected: boolean
  warningLightsUntilSeconds: number | null
  components: CarComponents
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
  /** Full wet tyres are compulsory for the current SC start/resumption. */
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
  /** B1.5.10 declaration for the active Sprint or Race session. */
  heatHazardDeclared: boolean
  /** Current simulated Heat Index used for the declaration audit. */
  heatIndexC: number
  /** C4.6 session mass increase: 5kg declared TTCS, 2kg other sessions. */
  heatHazardMassIncreaseKg: number
  /** Sporting B1.5.11 declaration, held for the relevant session once made. */
  rainHazardDeclared: boolean
  /** Sporting B1.5.12 Race Director grip declaration. */
  lowGripConditions: boolean
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
