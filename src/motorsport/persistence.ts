import { migrateCourseRegistration } from './courseMigration'
import { encodeTelemetryHistory, decodeTelemetryHistory } from '../simulation/telemetryHistory'
import { motorsportMachine } from './packages'
import { validateMotorsportConfig } from './race'
import type { MotorsportRaceConfig, MotorsportRaceState } from './types'
import { validSectorTiming } from './sectorTiming'
import { validRaceTyre } from '../simulation/raceTyres'

export const MOTORSPORT_SAVE_KEY = 'race-sim-motorsport-2026-v1'
export type MotorsportSave = { schemaVersion: 1; config: MotorsportRaceConfig; state: MotorsportRaceState }
function checksum(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
function finiteTree(value: unknown, depth = 0): boolean {
  if (depth > 30) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length <= 32768 && value.every(item => finiteTree(item, depth + 1))
  if (typeof value === 'object') return Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && finiteTree(item, depth + 1))
  return false
}
export function serializeMotorsportSave(config: MotorsportRaceConfig, state: MotorsportRaceState): string {
  const payload = JSON.stringify({ schemaVersion: 1, config, state } satisfies MotorsportSave,(key,value)=>key==='telemetryHistory' && Array.isArray(value)?encodeTelemetryHistory(value):value)
  return JSON.stringify({ schemaVersion: 1, checksum: checksum(payload), payload })
}
export function parseMotorsportSave(raw: string): MotorsportSave | null {
  try {
    if (raw.length > 16_000_000) return null
    const envelope = JSON.parse(raw) as { schemaVersion?: number; checksum?: string; payload?: string }
    if (envelope.schemaVersion !== 1 || typeof envelope.payload !== 'string' || checksum(envelope.payload) !== envelope.checksum) return null
    const save = JSON.parse(envelope.payload,(key,value)=>key==='telemetryHistory'?decodeTelemetryHistory(value):value) as MotorsportSave
    if (!finiteTree(save) || save.schemaVersion !== 1 || save.state.schemaVersion !== 1 || save.config.schemaVersion !== 1) return null
    for (const entry of save.config.entries) {
      const current=motorsportMachine(entry.machine.name,entry.classId)
      entry.machine.hybridRecoveryPowerKw ??= current.hybridRecoveryPowerKw
      entry.machine.hybridMinimumSpeedKph ??= current.hybridMinimumSpeedKph
      if(entry.machine.hybridCapacityMj.basis==='simulation' && entry.machine.hybridCapacityMj.value===4 && current.hybridCapacityMj.basis==='manufacturer-reference') entry.machine.hybridCapacityMj=current.hybridCapacityMj
    }
    validateMotorsportConfig(save.config)
    if (save.config.applicationMode !== undefined && !['championship','free'].includes(save.config.applicationMode)) return null
    if (save.config.freeSettings !== undefined && (!['manual','random','qualifying-result'].includes(save.config.freeSettings.grid) || typeof save.config.freeSettings.equalCars !== 'boolean')) return null
    if (!['kyojo', 'super-gt', 'wec', 'indycar'].includes(save.config.championship) || !['formation', 'racing', 'finished'].includes(save.state.phase)) return null
    if (!['green', 'yellow', 'fcy', 'sc', 'red'].includes(save.state.flag) || save.state.raceSeconds < 0 || !Number.isSafeInteger(save.state.tick) || save.state.tick < 0) return null
    if (![save.state.raceSeconds, save.state.formationSeconds].every(value => Number.isFinite(value) && value >= 0) || typeof save.state.leaderFinished !== 'boolean' || (save.state.flagUntil !== null && !Number.isFinite(save.state.flagUntil))) return null
    if (save.state.winnerId !== null && !save.config.entries.some(entry => entry.id === save.state.winnerId)) return null
    if (!Array.isArray(save.state.events) || save.state.events.length > 500 || save.state.events.some(event => !Number.isSafeInteger(event.tick) || !Number.isFinite(event.seconds) || typeof event.message !== 'string' || (event.entryId !== null && !save.config.entries.some(entry => entry.id === event.entryId)))) return null
    if (save.state.cars.length !== save.config.entries.length || new Set(save.state.cars.map(car => car.entryId)).size !== save.state.cars.length) return null
    migrateCourseRegistration(save.config, save.state)
    for (const car of save.state.cars) {
      if (car.lateralVelocityMps !== undefined && (!Number.isFinite(car.lateralVelocityMps) || Math.abs(car.lateralVelocityMps)>2.5)) return null
      if (car.tyreState !== undefined && (!validRaceTyre(car.tyreState) || Math.abs(car.tyreState.life - car.tyreLife) > 1e-8 || Math.abs(car.tyreState.surfaceC - car.tyreTemperatureC) > 1e-8)) return null
      if (car.timing !== undefined && !validSectorTiming(car.timing, save.config.course)) return null
      if (car.telemetryHistory !== undefined) {
        if (!Array.isArray(car.telemetryHistory) || car.telemetryHistory.length>768) return null
        car.telemetryHistory = car.telemetryHistory.map(point=>Array.isArray(point)?{lap:point[0],progress:point[1],seconds:point[2],speedKph:point[3],throttlePercent:point[4],brakePercent:point[5],gear:point[6],rpm:point[7]}:point)
        if(car.telemetryHistory.some(point=>![point.lap,point.progress,point.seconds,point.speedKph,point.throttlePercent,point.brakePercent,point.gear,point.rpm].every(Number.isFinite) || point.progress<0 || point.progress>=1 || point.speedKph<0 || point.throttlePercent<0 || point.throttlePercent>100 || point.brakePercent<0 || point.brakePercent>100)) return null
      }
      if (car.paceMode !== undefined && !['push','standard','save','defend'].includes(car.paceMode)) return null
      if (car.lapInvalid !== undefined && typeof car.lapInvalid !== 'boolean') return null
      if (car.lapHistory !== undefined && (!Array.isArray(car.lapHistory) || car.lapHistory.length > 1000 || car.lapHistory.some(lap => !Number.isSafeInteger(lap.lap) || lap.lap < 1 || !Number.isFinite(lap.seconds) || lap.seconds <= 0 || !Number.isInteger(lap.driverIndex) || lap.driverIndex < 0 || typeof lap.compound !== 'string' || typeof lap.pit !== 'boolean'))) return null
      if (car.battle !== undefined && (!save.config.entries.some(entry=>entry.id===car.battle!.opponentId) || ![-1,1].includes(car.battle.side) || !Number.isFinite(car.battle.startedAt) || car.battle.startedAt<0 || car.battle.startedAt>save.state.raceSeconds)) return null
      if (car.driverIntent !== undefined && !['controlled-flag','pit-entry','emergency-avoidance','attack','defend','dirty-air-avoidance','tow-alignment','blue-flag-yield','team-order-yield','physical-reference-line'].includes(car.driverIntent)) return null
      if (car.teamInstruction !== undefined && (!['hold-position','let-teammate-through','free-to-fight'].includes(car.teamInstruction.kind) || !['no-team-battle','protect-team-result','faster-teammate'].includes(car.teamInstruction.reason) || (car.teamInstruction.teammateId!==null && !save.config.entries.some(entry=>entry.id===car.teamInstruction!.teammateId)))) return null
      const entry = save.config.entries.find(item => item.id === car.entryId)
      if (!Array.isArray(car.tyreSets) || !car.tyreSets.length || car.tyreSets.some(set => !['primary', 'alternate', 'wet'].includes(set.compound) || !Number.isSafeInteger(set.completedLaps) || set.completedLaps < 0)) return null
      if (![car.distanceM, car.speedMps, car.lateralM, car.fuelKg, car.hybridEnergyMj, car.tyreLife, car.tyreTemperatureC, car.stintSeconds, car.pitPathM, car.pitServiceRemaining, car.fuelAddedKg, car.lapStartedAt, car.penaltySeconds, car.pushToPassSeconds, car.hybridDeployedMj].every(Number.isFinite) || !Number.isInteger(car.gear) || typeof car.blueFlag !== 'boolean' || !Number.isSafeInteger(car.lastRefuelLap) || car.lastRefuelLap < 0 || !Array.isArray(car.warnings) || car.warnings.some(warning => typeof warning !== 'string')) return null
      if ([car.virtualEnergyMj, car.lastLapSeconds, car.bestLapSeconds, car.finishTime].some(value => value !== null && !Number.isFinite(value))) return null
      if (!entry || car.driverSeconds.length !== entry.drivers.length || car.driverLastOutSeconds.length !== entry.drivers.length || !Number.isInteger(car.driverIndex) || car.driverIndex < 0 || car.driverIndex >= entry.drivers.length) return null
      if (!Array.isArray(car.driverDistanceM) || car.driverDistanceM.length !== entry.drivers.length || car.driverDistanceM.some(metres => metres < 0) || !Array.isArray(car.drivingStints) || car.drivingStints.some((stint, index) => !Number.isInteger(stint.driverIndex) || stint.driverIndex < 0 || stint.driverIndex >= entry.drivers.length || stint.start < 0 || stint.end < stint.start || stint.end > save.state.raceSeconds + 0.0001 || (index > 0 && stint.start < car.drivingStints[index - 1].end))) return null
      if (!Number.isFinite(car.activeDrivingEnd) || car.activeDrivingEnd < 0 || car.activeDrivingEnd > save.state.raceSeconds + 0.0001 || (car.activeDrivingStart !== null && (!Number.isFinite(car.activeDrivingStart) || car.activeDrivingStart < 0 || car.activeDrivingStart > car.activeDrivingEnd))) return null
      if (!['running', 'pit-entry', 'pit-service', 'pit-exit', 'finished', 'retired'].includes(car.status) || car.fuelKg < 0 || car.fuelKg > entry.machine.fuelCapacityKg.value + 1e-6 || car.speedMps < 0 || car.tyreLife < 0 || car.tyreLife > 1) return null
      if ((car.status === 'pit-entry' || car.status === 'pit-service') && car.pitRequest === null) return null
      if (car.status === 'pit-service' && (!car.stopWork || car.stopWork.totalSeconds <= 0 || car.stopWork.fuelAddedKg < 0 || car.stopWork.energyAddedMj < 0)) return null
      if (car.driverSeconds.some(seconds => seconds < 0) || car.stintSeconds < 0 || car.pitServiceRemaining < 0 || car.pitPathM < 0 || !Number.isSafeInteger(car.laps) || car.laps < 0) return null
      if (car.hybridEnergyMj < 0 || car.hybridEnergyMj > entry.machine.hybridCapacityMj.value + 1e-6) return null
      if (entry.machine.virtualEnergyCapacityMj === null ? car.virtualEnergyMj !== null : car.virtualEnergyMj === null || car.virtualEnergyMj > entry.machine.virtualEnergyCapacityMj.value + 1e-6) return null
      if (car.pitRequest !== null && (car.pitRequest.entryId !== car.entryId || car.pitRequest.fuelFraction < 0 || car.pitRequest.fuelFraction > 1 || (car.pitRequest.nextDriverIndex !== null && (!Number.isInteger(car.pitRequest.nextDriverIndex) || car.pitRequest.nextDriverIndex < 0 || car.pitRequest.nextDriverIndex >= entry.drivers.length)))) return null
    }
    return save
  } catch { return null }
}
