import type { Vector3Tuple } from 'three'

export type CameraMode = 'overview' | 'chase' | 'orbit'
export type SpeedMultiplier = 1 | 5 | 20 | 60
export type TireCompound = 'S' | 'M' | 'H' | 'I' | 'W'
export type DryCompoundFamily = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'
export type GridSource = 'brief' | 'qualifying' | 'openf1'
export type FlagState = 'clear' | 'yellow' | 'vsc' | 'sc' | 'red'
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
export type RacePaceMode = 'push' | 'standard' | 'save' | 'defend'
export type BattlePhase =
  | 'single-file'
  | 'following'
  | 'attacking'
  | 'side-by-side'
  | 'defending'
  | 'resolved'
export type StewardStatus = 'clear' | 'noted' | 'investigating' | 'penalty'
export type PitPhase = 'none' | 'entry' | 'lane' | 'box' | 'exit'
export type PitServiceKind = 'tire-stop' | 'drive-through' | 'stop-go' | null
export type PenaltyKind =
  | 'time-5'
  | 'time-10'
  | 'drive-through'
  | 'stop-go-10'
  | 'grid-drop'
  | 'pit-lane-start'
  | 'disqualification'
export type TimedRunPhase = 'garage' | 'out-lap' | 'attack-lap' | 'in-lap' | 'cooldown'
export type WeekendStage =
  | 'fp1'
  | 'fp2'
  | 'fp3'
  | 'sprintQualifying'
  | 'sprint'
  | 'qualifying'
  | 'race'
export type DriverTunableStat =
  | 'speed'
  | 'consistency'
  | 'tireManagement'
  | 'overtaking'
  | 'defense'
  | 'wetSkill'

export type RaceEventKind =
  | 'flag'
  | 'track-limit'
  | 'incident'
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
  served: boolean
  mustServeByLap?: number | null
  servedAtSeconds?: number | null
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
  pitLaneTransitSeconds: number | null
  sectorWeights: [number, number, number] | null
  tireDegradationByCompound: Partial<Record<TireCompound, number>>
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

/**
 * A live flag phase carried in the race snapshot. Phases are created by
 * incidents (crashes, retirements) and expire at `endSeconds`.
 */
export type ActiveFlagPhase = {
  id: string
  flag: Exclude<FlagState, 'clear'>
  /** Affected sector (0-based). Only local yellows scope slowing to it. */
  sector: number
  startSeconds: number
  endSeconds: number
  startMessage: string
  endMessage: string
  lappedCarsMayOvertakeAtSeconds?: number | null
}

export type Team = {
  id: string
  name: string
  color: string
  cornering: number
  straightLine: number
  reliability: number
  pitCrewSpeed: number
}

export type Driver = {
  id: string
  teamId: string
  code: string
  name: string
  speed: number
  consistency: number
  tireManagement: number
  /** Racecraft when trying to pass another car. Defaults to `speed`. */
  overtaking?: number
  /** Racecraft when defending from a car behind. Defaults to `consistency`. */
  defense?: number
  /** Wet-weather racecraft. Defaults to consistency/tire management blend. */
  wetSkill?: number
  /** Error tendency in wheel-to-wheel racing. Defaults from consistency. */
  errorRate?: number
  startOffset: number
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
  /** 2026 front/rear driver-adjustable bodywork activation zones. */
  aeroActivationZones?: AeroActivationZone[]
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
    url: string | null
    year: number | null
  }
  /**
   * Maps raw OpenF1 location-sample coordinates into this track's local frame.
   * Only present for generated real layouts; fallback layouts cannot place
   * factual car positions and must say so in the UI.
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
  weekendStage?: WeekendStage
  /** Persisted weekend effects passed from previously completed sessions. */
  weekendContext?: WeekendContext
  timedSessionPlan?: TimedSessionPlan
}

export type TimedSessionSegmentPlan = {
  compound: TireCompound
  endsAtSeconds: number
  name: string
  participantDriverIds: string[]
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
  gridByStage: Partial<Record<'sprint' | 'race', string[]>>
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

/** Immutable record written only when a car crosses the timing line. */
export type LapRecord = {
  lap: number
  lapTimeSeconds: number
  sectors: [number, number, number]
  tire: TireCompound
  tireAgeLaps: number
  weather: WeatherState
  trackGrip: number
  position: number
  pitStop: boolean
  isValid: boolean
  invalidReason: string | null
}

export type CarSnapshot = {
  driverId: string
  teamId: string
  code: string
  driverName: string
  teamName: string
  teamColor: string
  progress: number
  lap: number
  totalDistance: number
  /** Dynamic lateral displacement from the normal racing line, in track units. */
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
  /** ERS-K recharge accumulated on the current lap for regulation limits. */
  energyHarvestedThisLapMj: number
  ersMode: ErsMode
  /** Estimated instantaneous MGU-K deployment, never OpenF1-observed. */
  ersPowerKw: number
  ersBatteryPercent: number
  tireTemperatureC: number
  /** Accumulated stint wear independent from integer lap age. */
  tireWearPercent: number
  brakeTemperatureC: number
  stewardStatus: StewardStatus
  stewardNote: string | null
  timedRunStartedAtSeconds: number | null
  timedRunPhase: TimedRunPhase | null
  timedRunsCompleted: number
  timedSegmentBestSeconds: Record<string, number | null>
  deletedLapCount: number
  impedingWarnings: number
  outside107Percent: boolean
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
  hasUnlappedUnderSafetyCar: boolean
  blueFlag: boolean
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
  /** End of the post-SC/VSC/red restart window (low grip), if active. */
  restartUntilSeconds: number | null
  fuelEffectSeconds: number
  trackEvolutionLevel: number
  weather: WeatherState
  weatherLabel: string
  weatherForecastLabel: string
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
  timedSegmentLabel: string | null
  timedSessionSuspended: boolean
  timedParticipantDriverIds: string[]
  timedYellowUntilSeconds: number | null
  timedYellowSector: number | null
  pitLaneOpen: boolean
  events: RaceEvent[]
  weekend: WeekendState
}
