export type ChampionshipId = 'kyojo' | 'super-gt' | 'wec' | 'indycar'
export type MotorsportClass = 'kyojo' | 'gt500' | 'gt300' | 'hypercar' | 'lmgt3' | 'lmp2' | 'indycar'
export type EvidenceValue = { value: number; basis: 'published' | 'manufacturer-reference' | 'simulation'; source: string }
export type MotorsportDriver = {
  id: string; name: string; overall: number | null
  racePace: number | null; consistency: number | null; tyreManagement: number | null
  ratingSource: string | null; fiaGrade?: 'P' | 'G' | 'S' | 'B'
  qualifyingPace?: number | null
}
export type MotorsportMachine = {
  id: string; name: string; classId: MotorsportClass
  massKg: EvidenceValue; powerKw: EvidenceValue; gears: EvidenceValue
  driverMassKg: EvidenceValue
  dragAreaM2: EvidenceValue; liftAreaM2: EvidenceValue; tyreMu: EvidenceValue
  fuelCapacityKg: EvidenceValue; fuelKgPerKm: EvidenceValue
  hybridPowerKw: EvidenceValue; hybridCapacityMj: EvidenceValue
  hybridRecoveryPowerKw?: EvidenceValue; hybridMinimumSpeedKph?: EvidenceValue
  virtualEnergyCapacityMj: EvidenceValue | null
  notes: string[]
}
export type MotorsportEntry = {
  id: string; number: string; team: string; color: string; classId: MotorsportClass
  machine: MotorsportMachine; drivers: MotorsportDriver[]; sourceUrl: string
}
export type MotorsportCourse = {
  id: string; name: string; lengthM: number; points: [number, number][]
  kind: 'road' | 'street' | 'short-oval' | 'speedway'
  sourceUrl: string; geometryBasis: string
  /** Every operational approximation remains explicit and editable. */
  pitEntry: EvidenceValue; pitExit: EvidenceValue; pitLengthM: EvidenceValue
  pitSpeedKph: EvidenceValue; bankingDegrees: EvidenceValue; widthM: EvidenceValue
}
export type MotorsportRaceFormat =
  | { kind: 'laps'; laps: number; basis: string }
  | { kind: 'time'; seconds: number; basis: string }
export type MotorsportEvent = {
  id: string; championship: ChampionshipId; round: number; label: string; dateLabel: string
  courseId: string; format: MotorsportRaceFormat; sourceUrl: string
  availableEntryIds?: string[]
}
export type MotorsportRaceConfig = {
  schemaVersion: 1; seed: string; championship: ChampionshipId; eventId: string
  course: MotorsportCourse; entries: MotorsportEntry[]; format: MotorsportRaceFormat
  start: 'standing' | 'rolling'; weather: 'dry' | 'wet'
  /** Race director inputs, not randomly generated official decisions. */
  startFuelFraction: number; maximumStintSeconds: number | null
  minimumDriverSeconds: number | null; maximumDriverSeconds: number | null
  /** Optional for existing race saves. Timed sessions use measured best laps. */
  sessionKind?: 'practice' | 'qualifying' | 'race'
  applicationMode?: 'championship' | 'free'
  freeSettings?: { grid: 'manual' | 'random' | 'qualifying-result'; equalCars: boolean }
}
export type MotorsportPitRequest = {
  entryId: string; fuelFraction: number; changeTyres: boolean; nextDriverIndex: number | null
}
export type MotorsportCar = {
  battle?: { opponentId: string; side: -1 | 1; startedAt: number }
  teamInstruction?: import('../simulation/teamDecision').TeamInstruction
  driverIntent?: import('../simulation/driverDecision').DriverDecisionIntent
  tyreState?: import('../simulation/raceTyres').RaceTyreState
  telemetryHistory?: import('../simulation/telemetryHistory').TelemetryPoint[]
  throttlePercent?: number; brakePercent?: number; rpm?: number
  hybridPowerKw?: number; regenerationPowerKw?: number; hybridRecoveredMj?: number
  entryId: string; distanceM: number; speedMps: number; lateralM: number; gear: number
  fuelKg: number; virtualEnergyMj: number | null; hybridEnergyMj: number
  tyreLife: number; tyreTemperatureC: number; driverIndex: number
  tyreSets: { compound: 'primary' | 'alternate' | 'wet'; completedLaps: number }[]
  driverSeconds: number[]; driverLastOutSeconds: number[]; stintSeconds: number
  driverDistanceM: number[]
  lastRefuelLap: number
  drivingStints: { driverIndex: number; start: number; end: number }[]
  activeDrivingStart: number | null; activeDrivingEnd: number
  status: 'running' | 'pit-entry' | 'pit-service' | 'pit-exit' | 'finished' | 'retired'
  pitPathM: number; pitServiceRemaining: number; pitRequest: MotorsportPitRequest | null
  pits: number; fuelAddedKg: number; stopWork: {
    fuelSeconds: number; tyreSeconds: number; driverSeconds: number; totalSeconds: number
    fuelAddedKg: number; energyAddedMj: number
  } | null
  laps: number; lastLapSeconds: number | null; bestLapSeconds: number | null; lapStartedAt: number
  lapHistory?: { lap: number; seconds: number; driverIndex: number; compound: string; pit: boolean }[]
  lapInvalid?: boolean
  timing?: MotorsportSectorTiming
  paceMode?: 'push' | 'standard' | 'save' | 'defend'
  finishTime: number | null; penaltySeconds: number; warnings: string[]
  blueFlag: boolean; pushToPassSeconds: number; hybridDeployedMj: number
}
export type MotorsportSectorTiming = {
  lap: number; startedAt: number | null; crossings: (number | null)[]; invalid: boolean
  lastLap: { lap: number; sectors: number[]; miniSectors: number[]; valid: boolean } | null
  bestSectors: (number | null)[]; bestMiniSectors: (number | null)[]
}
export type MotorsportRaceState = {
  schemaVersion: 1; tick: number; raceSeconds: number; formationSeconds: number
  phase: 'formation' | 'racing' | 'finished'; cars: MotorsportCar[]
  flag: 'green' | 'yellow' | 'fcy' | 'sc' | 'red'; flagUntil: number | null
  leaderFinished: boolean; winnerId: string | null
  events: { tick: number; seconds: number; entryId: string | null; message: string }[]
}
