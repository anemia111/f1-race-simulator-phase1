import { decideDriverBehavior, type DriverDecisionContext } from '../simulation/driverDecision'
import { decideTeamInstruction, applyTeamInstruction, delayTeammatePit } from '../simulation/teamDecision'
import { behaviorDriverFor } from './driverBehavior'
import { advancePedals } from '../simulation/pedalControl'
import { advanceRaceTyre, initialRaceTyre } from '../simulation/raceTyres'
import { recordTelemetry } from '../simulation/telemetryHistory'
import { clamp, modulo, MOTORSPORT_STEP_SECONDS, targetSpeedMps, stationAt, tyreForceBudget } from './coursePhysics'
import { drivetrainState, trafficAero, tyreGripScale } from './vehicleDynamics'
import { initialSectorTiming, advanceSectorTiming } from './sectorTiming'
import type { MotorsportCar, MotorsportEntry, MotorsportPitRequest, MotorsportRaceConfig, MotorsportRaceState } from './types'

const RUNNING = new Set(['running', 'pit-entry', 'pit-service', 'pit-exit'])
function appendEvent(state: MotorsportRaceState, entryId: string | null, message: string) {
  state.events.push({ tick: state.tick, seconds: state.raceSeconds, entryId, message })
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500)
}
export function validateMotorsportConfig(config: MotorsportRaceConfig) {
  if (config.sessionKind !== undefined && !['race', 'practice', 'qualifying'].includes(config.sessionKind)) throw new Error('Invalid session kind')
  if (config.sessionKind && config.sessionKind !== 'race' && config.format.kind !== 'time') throw new Error('Timed sessions require a duration')
  if (config.schemaVersion !== 1 || !['kyojo', 'super-gt', 'wec', 'indycar'].includes(config.championship) || typeof config.seed !== 'string' || typeof config.eventId !== 'string') throw new Error('Invalid championship configuration')
  if (!['standing', 'rolling'].includes(config.start) || !['dry', 'wet'].includes(config.weather) || !Number.isFinite(config.startFuelFraction) || config.startFuelFraction < 0 || config.startFuelFraction > 1) throw new Error('Invalid starting conditions')
  for (const limit of [config.maximumStintSeconds, config.minimumDriverSeconds, config.maximumDriverSeconds]) if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw new Error('Invalid driver time limit')
  if (!config.entries.length || config.entries.length > 100) throw new Error('Race requires 1–100 cars')
  if (new Set(config.entries.map(entry => entry.id)).size !== config.entries.length) throw new Error('Duplicate car identity')
  if (!(config.course.lengthM > 100) || config.course.lengthM > 100000 || !Number.isFinite(config.course.lengthM) || config.course.points.length < 3 || config.course.points.length > 32768 || config.course.points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(coordinate => !Number.isFinite(coordinate)))) throw new Error('Invalid course')
  if (!['road', 'street', 'short-oval', 'speedway'].includes(config.course.kind)) throw new Error('Invalid course kind')
  for (const value of [config.course.pitEntry.value, config.course.pitExit.value]) if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid pit position')
  for (const value of [config.course.pitLengthM.value, config.course.pitSpeedKph.value, config.course.widthM.value]) if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid course operation')
  if (!Number.isFinite(config.course.bankingDegrees.value) || Math.abs(config.course.bankingDegrees.value) > 60) throw new Error('Invalid banking')
  if (!['laps', 'time'].includes(config.format.kind)) throw new Error('Invalid race format')
  if (config.format.kind === 'laps' ? !Number.isInteger(config.format.laps) || config.format.laps < 1 : !Number.isFinite(config.format.seconds) || config.format.seconds <= 0) throw new Error('Invalid race distance')
  for (const entry of config.entries) {
    if (typeof entry.id !== 'string' || !entry.id || typeof entry.number !== 'string' || typeof entry.team !== 'string' || typeof entry.machine.name !== 'string' || !['kyojo', 'gt500', 'gt300', 'hypercar', 'lmgt3', 'lmp2', 'indycar'].includes(entry.classId) || entry.machine.classId !== entry.classId) throw new Error('Invalid car identity')
    if (!entry.drivers.length || new Set(entry.drivers.map(driver => driver.id)).size !== entry.drivers.length) throw new Error(`Invalid crew for ${entry.id}`)
    for (const driver of entry.drivers) {
      if (driver.qualifyingPace !== undefined && driver.qualifyingPace !== null && (!Number.isFinite(driver.qualifyingPace) || driver.qualifyingPace < 0 || driver.qualifyingPace > 1.2)) throw new Error('Invalid qualifying skill')
      if (typeof driver.id !== 'string' || typeof driver.name !== 'string' || (driver.overall !== null && (!Number.isFinite(driver.overall) || driver.overall < 0 || driver.overall > 120))) throw new Error('Invalid driver')
      for (const rating of [driver.racePace, driver.consistency, driver.tyreManagement]) if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 1.2)) throw new Error('Invalid driver skill')
    }
    for (const value of [entry.machine.massKg.value, entry.machine.powerKw.value, entry.machine.fuelCapacityKg.value, entry.machine.fuelKgPerKm.value, entry.machine.dragAreaM2.value, entry.machine.tyreMu.value]) {
      if (!(value > 0) || !Number.isFinite(value)) throw new Error(`Invalid physical input for ${entry.id}`)
    }
    if (!Number.isInteger(entry.machine.gears.value) || entry.machine.gears.value < 1 || entry.machine.gears.value > 12) throw new Error('Invalid transmission')
    for (const value of [entry.machine.driverMassKg.value, entry.machine.liftAreaM2.value, entry.machine.hybridPowerKw.value, entry.machine.hybridCapacityMj.value, entry.machine.hybridRecoveryPowerKw?.value ?? 0, entry.machine.hybridMinimumSpeedKph?.value ?? 0]) if (!Number.isFinite(value) || value < 0) throw new Error('Invalid physical input')
    if (entry.machine.virtualEnergyCapacityMj !== null && (!Number.isFinite(entry.machine.virtualEnergyCapacityMj.value) || entry.machine.virtualEnergyCapacityMj.value <= 0)) throw new Error('Invalid energy allowance')
  }
}
export function createMotorsportRace(config: MotorsportRaceConfig): MotorsportRaceState {
  validateMotorsportConfig(config)
  const cars: MotorsportCar[] = config.entries.map((entry, index) => ({
    entryId: entry.id, distanceM: index === 0 ? 0 : -index * 9, speedMps: config.start === 'rolling' ? 80 / 3.6 : 0,
    lateralM: index % 2 ? 1.5 : -1.5, gear: config.start === 'rolling' ? 2 : 1,
    fuelKg: entry.machine.fuelCapacityKg.value * clamp(config.startFuelFraction, 0, 1),
    virtualEnergyMj: entry.machine.virtualEnergyCapacityMj?.value ?? null,
    hybridEnergyMj: entry.machine.hybridCapacityMj.value, tyreLife: 1, tyreTemperatureC: 65, tyreState: initialRaceTyre(),
    tyreSets: [{ compound: config.weather === 'wet' ? 'wet' : 'primary', completedLaps: 0 }],
    driverIndex: 0, driverSeconds: entry.drivers.map(() => 0), driverLastOutSeconds: entry.drivers.map(() => -1), stintSeconds: 0,
    driverDistanceM: entry.drivers.map(() => 0), drivingStints: [], activeDrivingStart: null, activeDrivingEnd: 0, lastRefuelLap: 0,
    status: 'running', pitPathM: 0, pitServiceRemaining: 0, pitRequest: null,
    pits: 0, fuelAddedKg: 0, stopWork: null, laps: 0, lastLapSeconds: null, bestLapSeconds: null, lapStartedAt: 0, lapHistory: [],
    finishTime: null, penaltySeconds: 0, warnings: [], blueFlag: false,
    pushToPassSeconds: config.championship === 'indycar' && (config.course.kind === 'road' || config.course.kind === 'street') ? 200 : 0,
    hybridDeployedMj: 0,
    timing: initialSectorTiming(config.course, !config.sessionKind || config.sessionKind === 'race'),
  }))
  const timed = config.sessionKind === 'practice' || config.sessionKind === 'qualifying'
  if (timed) cars.forEach((car, index) => {
    // Independent SIM pit releases, spaced along the exit queue. The first
    // partial out lap is excluded from best-lap classification below.
    car.distanceM = -index * 20
    car.status = 'pit-exit'; car.pitPathM = config.course.pitLengthM.value * 0.5
    car.lapInvalid = true
    car.speedMps = config.course.pitSpeedKph.value / 3.6
  })
  return { schemaVersion: 1, tick: 0, raceSeconds: 0, formationSeconds: 0, phase: timed ? 'racing' : 'formation', cars,
    flag: 'green', flagUntil: null, leaderFinished: false, winnerId: null,
    events: [{ tick: 0, seconds: 0, entryId: null, message: timed ? `SIM ${config.sessionKind}: timed best-lap session; category knockout/group formats are not inferred.` : 'SIM formation. Source references and every estimated physical input are retained in this race configuration.' }] }
}

function pitWork(config: MotorsportRaceConfig, car: MotorsportCar, entry: MotorsportEntry, request: MotorsportPitRequest) {
  const fraction = clamp(request.fuelFraction, 0, 1)
  const fuelAddedKg = Math.max(0, entry.machine.fuelCapacityKg.value * fraction - car.fuelKg)
  const energyAdded = car.virtualEnergyMj === null ? 0 : Math.max(0, (entry.machine.virtualEnergyCapacityMj?.value ?? 0) * fraction - car.virtualEnergyMj)
  // WEC virtual energy is a separate allowance. Its proportional 40s reference
  // is never used as an instantaneous fuel-tank fill or added engine power.
  const fuelSeconds = entry.classId === 'lmp2' && config.course.id === 'le-mans'
    ? Math.min(60, Math.max(0, car.laps - car.lastRefuelLap + (car.pits === 0 ? 2 : 0)) * 4)
    : config.championship === 'wec' && car.virtualEnergyMj !== null
    ? 2 + 40 * energyAdded / Math.max(1, entry.machine.virtualEnergyCapacityMj?.value ?? 1)
    : fuelAddedKg / (config.championship === 'indycar' ? 4 : 2)
  const tyreSeconds = request.changeTyres ? config.championship === 'indycar' ? 7 : 20 : 0
  const driverSeconds = request.nextDriverIndex !== null && request.nextDriverIndex !== car.driverIndex ? 12 : 0
  // WEC refuelling is first, with the car on its wheels and no tools. Driver
  // change can overlap; tyre work begins after the refuelling phase.
  const total = config.championship === 'indycar'
    ? Math.max(fuelSeconds, tyreSeconds, driverSeconds)
    : Math.max(fuelSeconds + tyreSeconds, driverSeconds)
  return { fuelAddedKg, energyAdded, fuelSeconds, tyreSeconds, driverSeconds, total: Math.max(2, total) }
}
function requestForStrategy(config: MotorsportRaceConfig, entry: MotorsportEntry, car: MotorsportCar): MotorsportPitRequest | null {
  if (config.championship === 'kyojo' && config.applicationMode !== 'free') return null
  const fuelReserve = entry.machine.fuelKgPerKm.value * config.course.lengthM / 1000 * 1.8
  // A request immediately after the pit entry still needs nearly a full lap
  // before service. Le Mans' 13.6km lap consumes far more than an 8% reserve.
  const energyReserve = (entry.machine.virtualEnergyCapacityMj?.value ?? 0) * (config.course.lengthM > 10000 ? 0.35 : 0.15)
  const stintDue = config.maximumStintSeconds !== null && car.stintSeconds >= config.maximumStintSeconds - 180
  const tyresDue = car.tyreLife < 0.28
  const requiredAlternates = config.course.kind === 'street' || config.course.id === 'nashville' ? 2 : 1
  const missingAlternates = requiredAlternates - car.tyreSets.filter(set => set.compound === 'alternate' && set.completedLaps >= 2).length
  const compoundDue = config.championship === 'indycar' && config.weather === 'dry' && (config.course.kind === 'road' || config.course.kind === 'street' || config.course.id === 'nashville') && config.format.kind === 'laps' && config.format.laps >= 6 && missingAlternates > 0 && car.tyreSets.at(-1)!.completedLaps >= 2 && config.format.laps - car.laps <= missingAlternates * 4 + 2
  const gtShareDue = config.applicationMode !== 'free' && config.championship === 'super-gt' && (config.format.kind !== 'laps' || config.format.laps >= 6) && (config.format.kind === 'laps'
    ? car.driverDistanceM[car.driverIndex] >= Math.max(0, config.format.laps * 2 / 3 - 2) * config.course.lengthM
    : car.driverSeconds[car.driverIndex] >= config.format.seconds * 2 / 3 - 180)
  const windowDue = config.championship === 'wec' && config.course.id === 'le-mans' && drivingTimeInWindow(car, car.driverIndex, car.activeDrivingEnd - 21600, car.activeDrivingEnd) >= 14220
  const totalDue = config.maximumDriverSeconds !== null && car.driverSeconds[car.driverIndex] >= config.maximumDriverSeconds - 180
  if (car.fuelKg > fuelReserve && (car.virtualEnergyMj === null || car.virtualEnergyMj > energyReserve) && !stintDue && !tyresDue && !gtShareDue && !windowDue && !totalDue && !compoundDue) return null
  const crew = entry.drivers
  let nextDriverIndex: number | null = null
  if (crew.length > 1) nextDriverIndex = car.driverSeconds.indexOf(Math.min(...car.driverSeconds))
  return { entryId: car.entryId, fuelFraction: 1, changeTyres: car.tyreLife < 0.65 || compoundDue, nextDriverIndex }
}

export function drivingTimeInWindow(car: MotorsportCar, driverIndex: number, start: number, end: number) {
  return car.drivingStints.reduce((seconds, stint) => seconds + (stint.driverIndex === driverIndex ? Math.max(0, Math.min(end, stint.end) - Math.max(start, stint.start)) : 0), 0) + (car.activeDrivingStart !== null && car.driverIndex === driverIndex ? Math.max(0, Math.min(end, car.activeDrivingEnd) - Math.max(start, car.activeDrivingStart)) : 0)
}

function closeDrivingStint(car: MotorsportCar, end = car.activeDrivingEnd) {
  if (car.activeDrivingStart !== null) car.drivingStints = [...car.drivingStints, { driverIndex: car.driverIndex, start: car.activeDrivingStart, end: Math.max(car.activeDrivingStart, end) }]
  car.activeDrivingStart = null
}

/** Findings preserve steward discretion instead of inventing an automatic penalty. */
export function motorsportCrewAudit(car: MotorsportCar, config: MotorsportRaceConfig): string[] {
  if (config.applicationMode === 'free' || config.sessionKind === 'practice' || config.sessionKind === 'qualifying') return []
  const entry = config.entries.find(item => item.id === car.entryId)!
  const findings: string[] = []
  if (config.championship === 'indycar' && config.weather === 'dry' && (config.course.kind === 'road' || config.course.kind === 'street' || config.course.id === 'nashville')) {
    const primary = car.tyreSets.filter(set => set.compound === 'primary' && set.completedLaps >= 2).length
    const alternate = car.tyreSets.filter(set => set.compound === 'alternate' && set.completedLaps >= 2).length
    if (primary < 1 || alternate < (config.course.kind === 'street' || config.course.id === 'nashville' ? 2 : 1)) findings.push('INDYCAR rules 15.3.3.2 / 15.3.6.3: required primary/alternate sets did not each complete two laps; steward review required (wet-condition exceptions apply).')
  }
  if (config.championship === 'super-gt') {
    if (car.driverSeconds.filter(seconds => seconds > 0).length < 2) findings.push('SUPER GT: two drivers must participate; steward review required.')
    const share = config.format.kind === 'laps' ? car.driverDistanceM.map(metres => metres / Math.max(1, car.driverDistanceM.reduce((a, b) => a + b, 0))) : car.driverSeconds.map(seconds => seconds / (config.format.kind === 'time' ? config.format.seconds : 1))
    if (share.some(value => value > 2 / 3 + 0.0001)) findings.push('SUPER GT: driver exceeded the two-thirds distance/time share; steward review required.')
  }
  if (config.championship === 'wec') {
    const leMans = config.course.id === 'le-mans'
    entry.drivers.forEach((driver, index) => {
      const seconds = car.driverSeconds[index]
      if (seconds === 0) findings.push(`${driver.name}: did not drive; disqualification subject to steward force-majeure decision.`)
      if (seconds < (leMans ? 3600 : 2700)) findings.push(`${driver.name}: below championship-points driving-time threshold.`)
      const graded = driver.fiaGrade === 'B' || driver.fiaGrade === 'S'
      const minimum = leMans ? 21600 : 6300
      const anotherSilverQualified = driver.fiaGrade === 'S' && entry.drivers.some((other, otherIndex) => otherIndex !== index && other.fiaGrade === 'S' && car.driverSeconds[otherIndex] >= minimum)
      if (graded && !anotherSilverQualified && entry.classId !== 'hypercar' && seconds < minimum) findings.push(`${driver.name}: below published Bronze/Silver minimum; steward review required.`)
      if (leMans && graded && entry.classId !== 'hypercar' && seconds > 50400) findings.push(`${driver.name}: exceeded 14-hour maximum; steward review required.`)
      if (leMans && car.drivingStints.some(stint => drivingTimeInWindow(car, index, stint.end - 21600, stint.end) > 14400.1)) findings.push(`${driver.name}: exceeded four driving hours in a six-hour window.`)
    })
  }
  if (config.minimumDriverSeconds !== null && car.driverSeconds.some(seconds => seconds < config.minimumDriverSeconds!)) findings.push('User driver minimum not met.')
  if (config.maximumDriverSeconds !== null && car.driverSeconds.some(seconds => seconds > config.maximumDriverSeconds!)) findings.push('User driver maximum exceeded.')
  return findings
}

export function requestMotorsportPit(state: MotorsportRaceState, request: MotorsportPitRequest, config: MotorsportRaceConfig): MotorsportRaceState {
  const entry = config.entries.find(item => item.id === request.entryId)
  if (!entry) throw new Error('Unknown pit-request car')
  if (!Number.isFinite(request.fuelFraction) || request.fuelFraction < 0 || request.fuelFraction > 1) throw new Error('Invalid refuel target')
  if (request.nextDriverIndex !== null && (!Number.isInteger(request.nextDriverIndex) || request.nextDriverIndex < 0 || request.nextDriverIndex >= entry.drivers.length)) throw new Error('Unknown replacement driver')
  if (config.applicationMode !== 'free' && config.championship === 'kyojo' && (request.fuelFraction > 0 || request.nextDriverIndex !== null)) throw new Error('KYOJO has no routine refuelling or crew changes')
  return { ...state, cars: state.cars.map(car => car.entryId === request.entryId && car.status === 'running' ? { ...car, pitRequest: { ...request } } : car) }
}

export function setMotorsportFlag(state: MotorsportRaceState, flag: MotorsportRaceState['flag'], durationSeconds: number | null = null): MotorsportRaceState {
  if (durationSeconds !== null && (!(durationSeconds > 0) || !Number.isFinite(durationSeconds))) throw new Error('Invalid neutralisation duration')
  const cars = flag === 'red' ? state.cars.map(car => { const next = { ...car }; closeDrivingStint(next); return next }) : state.cars
  return { ...state, cars, flag, flagUntil: durationSeconds === null ? null : state.raceSeconds + durationSeconds,
    events: [...state.events.slice(-499), { tick: state.tick, seconds: state.raceSeconds, entryId: null, message: `Race director: ${flag.toUpperCase()}` }] }
}

/** Passing prepares a physically close train for the actual faster car. */
function yieldingCars(state: MotorsportRaceState, config: MotorsportRaceConfig, physicalOrder: MotorsportCar[]): Set<string> {
  const yielding = new Set<string>()
  if (state.flag !== 'green' || config.championship === 'indycar') return yielding
  const length = config.course.lengthM
  const classFor = new Map(config.entries.map(entry => [entry.id, entry.classId]))
  physicalOrder.forEach((overtaker, index) => {
    let tail = -1
    const reach = Math.max(140, overtaker.speedMps * 4)
    // The sorted circular road order lets us stop beyond the approach window,
    // rather than filter and sort the whole field separately for each car.
    for (let offset = 1; offset < physicalOrder.length; offset++) {
      const car = physicalOrder[(index + offset) % physicalOrder.length]
      const gap = modulo(car.distanceM - overtaker.distanceM, length)
      if (gap > reach) break
      const rank: Record<string,number>={hypercar:4,lmp2:3,gt500:3,gt300:1,lmgt3:1,kyojo:1,indycar:2}
      const ownClass=classFor.get(overtaker.entryId)!, aheadClass=classFor.get(car.entryId)!
      const fasterClass=rank[ownClass]>rank[aheadClass]
      const lappingSameClass=ownClass===aheadClass && overtaker.distanceM-car.distanceM>=length*0.8
      if (gap<=0 || (!fasterClass && !lappingSameClass)) continue
      if (tail < 0 ? gap <= Math.max(70, overtaker.speedMps * 1.5) : gap - tail < 55) {
        yielding.add(car.entryId); tail = gap
      }
    }
  })
  return yielding
}

function advanceTick(previous: MotorsportRaceState, config: MotorsportRaceConfig): MotorsportRaceState {
  const dt = MOTORSPORT_STEP_SECONDS, length = config.course.lengthM
  const state: MotorsportRaceState = { ...previous, tick: previous.tick + 1, events: [...previous.events] }
  if (previous.phase === 'formation') {
    state.formationSeconds = previous.formationSeconds + dt
    if (state.formationSeconds + 1e-8 >= length / (80 / 3.6)) {
      state.phase = 'racing'
      appendEvent(state, null, config.start === 'rolling' ? 'GREEN. Rolling start; formation lap excluded from racing distance.' : 'GREEN. Standing start.')
    }
    return state
  }
  state.raceSeconds = Math.round((previous.raceSeconds + dt) * 10) / 10
  if (state.flagUntil !== null && state.raceSeconds >= state.flagUntil) {
    state.flag = 'green'; state.flagUntil = null; appendEvent(state, null, 'GREEN. Neutralisation ends.')
  }
  if (state.flag === 'red') return { ...state, cars: previous.cars.map(car => ({ ...car, lapInvalid: true, ...(car.timing ? { timing: { ...car.timing, invalid: true } } : {}) })) }
  const entries = new Map(config.entries.map(entry => [entry.id, entry]))
  const physicalOrder = previous.cars.filter(car => car.status === 'running')
    .sort((a, b) => modulo(a.distanceM, length) - modulo(b.distanceM, length) || a.entryId.localeCompare(b.entryId))
  const yields = yieldingCars(previous, config, physicalOrder)
  const nearestAhead = new Map<string, { car: MotorsportCar; gap: number }>()
  if (physicalOrder.length > 1) physicalOrder.forEach((car, index) => {
    const next = physicalOrder[(index + 1) % physicalOrder.length]
    nearestAhead.set(car.entryId, { car: next, gap: modulo(next.distanceM - car.distanceM, length) })
  })
  const nearestBehind = new Map<string, { car: MotorsportCar; gap: number }>()
  if (physicalOrder.length>1) physicalOrder.forEach((car,index)=>{
    const behind=physicalOrder[(index+physicalOrder.length-1)%physicalOrder.length]
    nearestBehind.set(car.entryId,{car:behind,gap:modulo(car.distanceM-behind.distanceM,length)})
  })
  const teamObservations=physicalOrder.map(car=>({id:car.entryId,teamId:entries.get(car.entryId)!.team,
    classId:entries.get(car.entryId)!.classId,distanceM:car.distanceM,speedMps:car.speedMps,running:true,
    expectedLapSeconds:car.bestLapSeconds??car.lastLapSeconds,tyreLife:car.tyreLife}))
  const reservedPitTeams=new Set(previous.cars.filter(car=>car.status==='pit-entry'||car.status==='pit-service')
    .map(car=>entries.get(car.entryId)!.team))
  const leadLapBefore = Math.max(...previous.cars.map(car => car.laps))
  const crossings: { entryId: string; time: number; laps: number }[] = []
  state.cars = previous.cars.map(old => {
    if (!RUNNING.has(old.status)) return old
    const car: MotorsportCar = { ...old, driverSeconds: [...old.driverSeconds], driverLastOutSeconds: [...old.driverLastOutSeconds], driverDistanceM: [...old.driverDistanceM], warnings: [...old.warnings] }
    const entry = entries.get(car.entryId)!, machine = entry.machine, driver = entry.drivers[car.driverIndex]
    const beforeDistance = car.distanceM
    car.hybridPowerKw = 0; car.regenerationPowerKw = 0
    if (car.status !== 'running' || state.flag !== 'green') car.lapInvalid = true
    if (car.status !== 'running') {
      const pitLimit = config.course.pitSpeedKph.value / 3.6
      car.speedMps = car.status === 'pit-service' ? 0 : car.speedMps + clamp(pitLimit - car.speedMps, -6 * dt, 3 * dt)
      car.throttlePercent = car.status === 'pit-service' ? 0 : car.speedMps < pitLimit ? 35 : 10
      car.brakePercent = car.speedMps > pitLimit ? 50 : 0
      const pitDrivetrain = drivetrainState(machine, car.speedMps, car.gear)
      car.gear = pitDrivetrain.gear; car.rpm = pitDrivetrain.rpm
      car.tyreState = advanceRaceTyre(car.tyreState ?? initialRaceTyre(car.tyreTemperatureC, car.tyreLife), {
        category: entry.classId, compound: car.tyreSets.at(-1)?.compound ?? 'primary', seconds: dt, distanceM: 0, speedMps: car.speedMps,
        demand: 0, massRatio: 1, management: driver.tyreManagement ?? 0.75, pace: 'standard', trackC: config.weather === 'wet' ? 22 : 32, wet: config.weather === 'wet',
      })
      car.tyreLife = car.tyreState.life; car.tyreTemperatureC = car.tyreState.surfaceC
      if (car.status === 'pit-service') {
        const work = car.stopWork!
        const elapsed = work.totalSeconds - car.pitServiceRemaining
        const docking = config.championship === 'wec' && car.virtualEnergyMj !== null ? 2 : 0
        const fillingSeconds = Math.max(0.001, work.fuelSeconds - docking)
        const fractionBefore = clamp((elapsed - docking) / fillingSeconds, 0, 1)
        const fractionAfter = clamp((elapsed + dt - docking) / fillingSeconds, 0, 1)
        const fuelThisTick = work.fuelAddedKg * (fractionAfter - fractionBefore)
        car.fuelKg += fuelThisTick; car.fuelAddedKg += fuelThisTick
        if (car.virtualEnergyMj !== null) car.virtualEnergyMj += work.energyAddedMj * (fractionAfter - fractionBefore)
        car.pitServiceRemaining = Math.max(0, car.pitServiceRemaining - dt)
        if (car.pitServiceRemaining === 0) {
          const request = car.pitRequest!
          if (request.changeTyres) {
            car.tyreLife = 1; car.tyreTemperatureC = config.weather === 'wet' ? 18 : 25
            car.tyreState = initialRaceTyre(car.tyreTemperatureC)
            const needsAlternate = config.championship === 'indycar' && (config.course.kind === 'road' || config.course.kind === 'street' || config.course.id === 'nashville') && car.tyreSets.filter(set => set.compound === 'alternate' && set.completedLaps >= 2).length < (config.course.kind === 'street' || config.course.id === 'nashville' ? 2 : 1)
            car.tyreSets = [...car.tyreSets, { compound: config.weather === 'wet' ? 'wet' : needsAlternate ? 'alternate' : 'primary', completedLaps: 0 }]
          }
          if (request.nextDriverIndex !== null && request.nextDriverIndex !== car.driverIndex) {
            car.driverLastOutSeconds[car.driverIndex] = state.raceSeconds
            car.driverIndex = request.nextDriverIndex
            appendEvent(state, car.entryId, `Driver change: ${entry.drivers[car.driverIndex].name}`)
          }
          if (work.fuelAddedKg > 0) car.lastRefuelLap = car.laps
          car.status = 'pit-exit'; car.pitRequest = null; car.stintSeconds = 0
        }
      } else {
        const pitAhead = previous.cars.filter(other=>other.entryId!==car.entryId && (other.status==='pit-exit' || other.status==='pit-entry') && (other.pitPathM>car.pitPathM || other.pitPathM===car.pitPathM && other.entryId.localeCompare(car.entryId)<0)).sort((a,b)=>a.pitPathM-b.pitPathM)[0]
        const pitEnd = config.course.pitLengthM.value
        const remaining = pitEnd - car.pitPathM
        // Join only into a clear gap. Include approaching traffic across the
        // control line, regardless of its lap count; never spawn onto a car.
        const mergeDistance = car.distanceM + remaining / pitEnd * modulo(config.course.pitExit.value - config.course.pitEntry.value, 1) * length
        const mergeBlocked = car.status === 'pit-exit' && remaining < Math.max(12, car.speedMps ** 2 / 12 + 6) && previous.cars.some(other => {
          if (other.entryId === car.entryId || other.status !== 'running') return false
          const gap = modulo(other.distanceM + other.speedMps * dt - mergeDistance + length / 2, length) - length / 2
          return gap < 6 && gap > -Math.max(6, other.speedMps * 0.7)
        })
        if (mergeBlocked) {
          const safeSpeed = Math.sqrt(12 * Math.max(0, remaining - 0.5))
          car.speedMps = Math.min(car.speedMps, safeSpeed)
          car.throttlePercent = 0; car.brakePercent = 50
        }
        let step = pitAhead ? Math.min(car.speedMps*dt,Math.max(0,pitAhead.pitPathM + pitAhead.speedMps*dt-car.pitPathM-6)) : car.speedMps*dt
        step = Math.min(step, Math.max(0, (car.status === 'pit-entry' ? pitEnd * 0.5 : pitEnd - (mergeBlocked ? 0.5 : 0)) - car.pitPathM))
        car.speedMps = step/dt
        car.pitPathM += step
        const pitArc = modulo(config.course.pitExit.value - config.course.pitEntry.value, 1) * length
        car.distanceM += step / config.course.pitLengthM.value * pitArc
        if (car.status === 'pit-entry' && car.pitPathM >= config.course.pitLengthM.value * 0.5) {
          const work = pitWork(config, car, entry, car.pitRequest!)
          car.status = 'pit-service'; car.speedMps = 0; car.pitServiceRemaining = work.total
          car.stopWork = { fuelSeconds: work.fuelSeconds, tyreSeconds: work.tyreSeconds, driverSeconds: work.driverSeconds,
            totalSeconds: work.total, fuelAddedKg: work.fuelAddedKg, energyAddedMj: work.energyAdded }
          car.pits++; appendEvent(state, car.entryId, `Pit service: fuel ${work.fuelAddedKg.toFixed(1)} kg; ${work.total.toFixed(1)} s`)
        } else if (car.status === 'pit-exit' && car.pitPathM >= config.course.pitLengthM.value) {
          car.status = 'running'; car.pitPathM = 0; car.stopWork = null
          appendEvent(state, car.entryId, 'Pit exit.')
        }
      }
    } else {
      if (!car.pitRequest) {
        const planned=requestForStrategy(config,entry,car)
        const fuelLaps=car.fuelKg/Math.max(0.001,machine.fuelKgPerKm.value*length/1000)
        const delay=delayTeammatePit({teammateBusy:reservedPitTeams.has(entry.team),fuelLaps,tyreLife:car.tyreLife,
          mandatoryStopDue:planned?.nextDriverIndex!==null && planned?.nextDriverIndex!==undefined,
          weatherEmergency:config.weather==='wet' && car.tyreSets.at(-1)?.compound!=='wet'})
        if (planned && !delay) {car.pitRequest=planned;reservedPitTeams.add(entry.team)}
      }
      car.driverSeconds[car.driverIndex] += dt; car.stintSeconds += dt
      if (car.activeDrivingStart === null) car.activeDrivingStart = previous.raceSeconds
      car.activeDrivingEnd = state.raceSeconds
      const paceSkill = config.sessionKind === 'qualifying' ? driver.qualifyingPace ?? driver.racePace ?? 0.75 : driver.racePace ?? 0.75
      const tyreSkill = driver.tyreManagement ?? 0.75
      const surfaceGrip = tyreGripScale(car, config.weather, entry.classId, config.course.kind === 'short-oval' || config.course.kind === 'speedway')
      const mass = machine.massKg.value + machine.driverMassKg.value + car.fuelKg
      const ahead = nearestAhead.get(car.entryId), behind=nearestBehind.get(car.entryId)
      const station = stationAt(config.course,car.distanceM)
      const aero = ahead ? trafficAero(ahead.gap,car.lateralM-ahead.car.lateralM,car.speedMps,station.radiusM) : {dragScale:1,liftScale:1}
      const conditions = {massKg:mass,gripScale:surfaceGrip,...aero}
      const paceFactor = car.paceMode==='push'?1.015:car.paceMode==='save'?0.96:car.paceMode==='defend'?0.99:1
      const skillFactor=Math.min(1,(0.95+paceSkill*0.05)*paceFactor)
      const freeTarget=targetSpeedMps(config.course,machine,car.distanceM,{massKg:mass,gripScale:surfaceGrip})*skillFactor
      let target=targetSpeedMps(config.course,machine,car.distanceM,conditions)*skillFactor
      if (car.pitRequest) {
        const pitDistance=modulo(config.course.pitEntry.value*length-car.distanceM,length)
        const braking=tyreForceBudget(machine,station,car.speedMps,conditions).longitudinal/mass
        target=Math.min(target,Math.sqrt((config.course.pitSpeedKph.value/3.6)**2+2*braking*pitDistance*0.8))
      }
      if (state.flag==='fcy') target=Math.min(target,80/3.6)
      if (state.flag==='yellow') target*=0.7
      if (state.flag==='sc') target=Math.min(target,100/3.6)
      car.blueFlag=yields.has(car.entryId)
      const previousOpponent=car.battle?previous.cars.find(other=>other.entryId===car.battle!.opponentId):undefined
      if (car.battle) {
        const gap=previousOpponent?modulo(previousOpponent.distanceM-car.distanceM+length/2,length)-length/2:Infinity
        if (!previousOpponent || previousOpponent.status!=='running' || gap < -7 || gap>140 || state.flag!=='green' || car.blueFlag) delete car.battle
      }
      const opponent=car.battle?previousOpponent:ahead?.car
      const opponentEntry=opponent?entries.get(opponent.entryId)!:null
      const gap=opponent?modulo(opponent.distanceM-car.distanceM+length/2,length)-length/2:Infinity
      // The driver sees speed, public lap times and vehicle identity, not an
      // opponent's hidden fuel/tyre state or its perfect future speed envelope.
      const hasPaceCase=!opponent || car.bestLapSeconds===null || opponent.bestLapSeconds===null ||
        car.bestLapSeconds<=opponent.bestLapSeconds+0.25 ||
        (car.tyreSets.at(-1)?.completedLaps??0)+4<(opponent.tyreSets.at(-1)?.completedLaps??0)
      const publicAccelerationAdvantage=opponentEntry?machine.powerKw.value/(machine.massKg.value+machine.driverMassKg.value)-
        opponentEntry.machine.powerKw.value/(opponentEntry.machine.massKg.value+opponentEntry.machine.driverMassKg.value):0
      const candidate=Boolean(opponent && !car.blueFlag && state.flag==='green' && gap<Math.max(90,car.speedMps*3) && hasPaceCase &&
        (car.battle || car.speedMps>opponent.speedMps+0.5 ||
          (freeTarget>opponent.speedMps+0.75 && publicAccelerationAdvantage>0.003) || car.distanceM-opponent.distanceM>=length*0.8))
      const ownObservation=teamObservations.find(other=>other.id===car.entryId)!
      const instruction=decideTeamInstruction(ownObservation,teamObservations.filter(other=>other.teamId===entry.team),length)
      car.teamInstruction=instruction
      let context: DriverDecisionContext = {
        seed:config.seed,driver:behaviorDriverFor(driver),lap:Math.max(0,Math.floor(car.distanceM/length)),
        trackProgress:modulo(car.distanceM,length)/length,
        flagState:state.flag==='green'?'clear' as const:state.flag==='fcy'?'vsc' as const:state.flag,
        currentLateralOffsetM:car.lateralM,physicalReferenceLineOffsetM:0,trackHalfWidthM:config.course.widthM.value/2,edgeClearanceM:1.5,
        attack:opponent?{active:candidate,opponentId:opponent.entryId,opponentLateralOffsetM:opponent.lateralM,
          gapSeconds:Math.max(0,gap)/Math.max(5,car.speedMps),intensity:1}:undefined,
        dirtyAir:ahead?{active:ahead.gap/Math.max(5,car.speedMps)<2.5 && station.radiusM<500,
          opponentId:ahead.car.entryId,opponentLateralOffsetM:ahead.car.lateralM,intensity:0.5}:undefined,
        tow:ahead?{active:ahead.gap/Math.max(5,car.speedMps)<1.8 && station.radiusM>500,
          opponentId:ahead.car.entryId,opponentLateralOffsetM:ahead.car.lateralM,intensity:0.5}:undefined,
        yield:car.blueFlag?{active:true,preferredSide:1 as const,approachingLateralOffsetM:-2.2,requiredSeparationM:2.25}:undefined,
      }
      if (config.sessionKind!=='practice' && config.sessionKind!=='qualifying') context=applyTeamInstruction(context,instruction,
        behind?{id:behind.car.entryId,gapSeconds:behind.gap/Math.max(5,behind.car.speedMps),lateralM:behind.car.lateralM}:undefined)
      const decision=decideDriverBehavior(context)
      car.driverIntent=decision.intent
      const overtaking=decision.intent==='attack' && candidate
      if (overtaking && !car.battle && opponent) car.battle={opponentId:opponent.entryId,
        side:Math.abs(car.lateralM)>=1?(car.lateralM<0?-1:1):opponent.lateralM< -0.8?1:-1,startedAt:state.raceSeconds}
      const desiredLateral=car.battle&&overtaking?car.battle.side*Math.min(2.4,config.course.widthM.value/2-1.5):decision.desiredLateralOffsetM
      car.lateralM+=clamp(desiredLateral-car.lateralM,-2.5*dt,2.5*dt)
      if (ahead && (state.flag!=='green' || Math.abs(car.lateralM-ahead.car.lateralM)<2.1)) {
        const closing=Math.max(0,car.speedMps-ahead.car.speedMps)
        const braking=tyreForceBudget(machine,station,car.speedMps,conditions).longitudinal/mass
        const brakingGap=7+closing*0.5+closing**2/Math.max(1,2*braking*0.8)
        if (ahead.gap<Math.max(brakingGap,car.speedMps*0.7)) target=Math.min(target,Math.max(0,ahead.car.speedMps+(ahead.gap-7)*0.5))
      }
      const drag = 0.5 * 1.225 * machine.dragAreaM2.value * aero.dragScale * car.speedMps ** 2
      let powerKw = machine.powerKw.value
      let hybrid = state.flag === 'green' && car.speedMps*3.6 >= (machine.hybridMinimumSpeedKph?.value ?? 0) && car.speedMps > 5 && target > car.speedMps && car.hybridEnergyMj > 0
        ? Math.min(machine.hybridPowerKw.value, car.hybridEnergyMj * 1000 / dt) : 0
      // Hypercar's electrical contribution remains inside the combined cap.
      if (entry.classId === 'indycar') powerKw += hybrid
      const p2p = overtaking && state.flag === 'green' && target > car.speedMps && car.pushToPassSeconds > 0 && entry.classId === 'indycar' && (config.course.kind === 'road' || config.course.kind === 'street')
        ? 44.74 * Math.min(1, car.pushToPassSeconds / dt) : 0
      powerKw += p2p
      const tyreForces = tyreForceBudget(machine, station, car.speedMps, conditions)
      const rolling = 0.015 * mass * 9.80665
      const slopeForce=mass*9.80665*station.grade/Math.sqrt(1+station.grade**2)
      const wheelPowerForce = powerKw * 1000 * 0.94 / Math.max(8, car.speedMps)
      // Feed forward the braking slope of the upcoming speed envelope. A finite
      // response time avoids trying to erase every speed error in a single tick.
      const previewM = Math.max(3, car.speedMps * 0.25)
      const futureTarget = targetSpeedMps(config.course, machine, car.distanceM + previewM, conditions) * Math.min(1, (0.95 + paceSkill * 0.05) * paceFactor)
      const plannedAcceleration = Math.min(0, (futureTarget ** 2 - target ** 2) / (2 * previewM))
      const desiredForce = mass * (plannedAcceleration + (target - car.speedMps) / 0.55) + drag + rolling + slopeForce
      // Driven-axle shares are SIM; LMH front assist uses its deployment gate.
      const drivenShare = entry.classId === 'hypercar' && hybrid > 50 ? 1 : 0.62
      // Pedal percentage refers to a fixed hydraulic capacity, not today's
      // changing tyre load. Otherwise pressure falsely rises as aero load falls.
      // Reference-speed hardware sizing is SIM pending supplier brake maps.
      const brakeCapacity = machine.tyreMu.value * ((machine.massKg.value + machine.driverMassKg.value) * 9.80665 + 0.5 * 1.225 * machine.liftAreaM2.value * 85 ** 2)
      const pedal = advancePedals({
        throttle: Math.max(0, Math.min(desiredForce, tyreForces.longitudinal * drivenShare * 0.95)) / Math.max(1, wheelPowerForce) * 100 * decision.throttleOpeningScale,
        brake: Math.max(0, -desiredForce) / Math.max(1, brakeCapacity) * 100 * decision.brakePressureScale,
        previousThrottle: car.throttlePercent ?? 0, previousBrake: car.brakePercent ?? 0,
        seconds: dt, carbonBrakes: entry.classId === 'hypercar' || entry.classId === 'lmp2' || entry.classId === 'indycar',
      })
      const driveForce = Math.min(wheelPowerForce * pedal.throttle / 100, tyreForces.longitudinal * drivenShare)
      const brakeForce = Math.min(tyreForces.longitudinal, brakeCapacity * pedal.brake / 100)
      const acceleration = (driveForce - drag - rolling - slopeForce - brakeForce) / mass
      const throttleFraction = clamp(driveForce / Math.max(1, wheelPowerForce), 0, 1)
      hybrid *= throttleFraction
      car.hybridPowerKw = hybrid
      if (p2p > 0 && throttleFraction > 0.05) car.pushToPassSeconds = Math.max(0, car.pushToPassSeconds - dt)
      const nextSpeed = Math.max(0, car.speedMps + acceleration * dt)
      const unconstrainedStep = (car.speedMps + nextSpeed) * 0.5 * dt
      // Neutralisation applies regardless of lateral lane. Integrate up to the
      // preceding car's safe rear envelope without changing lap identity.
      const distanceStep = ahead && state.flag !== 'green'
        ? Math.min(unconstrainedStep, Math.max(0, ahead.gap + ahead.car.speedMps * dt - 6))
        : unconstrainedStep
      car.throttlePercent = pedal.throttle
      car.brakePercent = pedal.brake
      car.speedMps = nextSpeed; car.distanceM += distanceStep
      car.driverDistanceM[car.driverIndex] += distanceStep
      const fuelUsed = machine.fuelKgPerKm.value * distanceStep / 1000 * (acceleration < -1 ? 0.35 : 0.85 + 0.15 * Math.min(1, Math.max(0, acceleration) / 4)) * (entry.classId === 'hypercar' ? Math.max(0,(powerKw-hybrid)/powerKw) : 1) * (car.paceMode === 'save' ? 0.85 : car.paceMode === 'push' ? 1.05 : 1)
      car.fuelKg = Math.max(0, car.fuelKg - fuelUsed)
      const deliveredPowerKw = Math.max(0, driveForce * car.speedMps / 1000)
      if (car.virtualEnergyMj !== null) {
        const beforeEnergy = car.virtualEnergyMj
        car.virtualEnergyMj -= deliveredPowerKw * dt / 1000
        if (beforeEnergy >= 0 && car.virtualEnergyMj < 0) {
          car.warnings.push('Virtual-energy allowance exceeded; deficit is replenished at next service, steward penalty requires review.')
          appendEvent(state, car.entryId, 'Virtual-energy allowance exceeded. Steward review required; fuel remains a separate physical quantity.')
        }
      }
      const regenerationMj = brakeForce > 0 ? Math.min(machine.hybridRecoveryPowerKw?.value ?? machine.hybridPowerKw.value, brakeForce * car.speedMps / 1000 * 0.3) * dt / 1000 : 0
      const acceptedRegeneration = machine.hybridCapacityMj.value > 0 ? Math.min(regenerationMj,Math.max(0,machine.hybridCapacityMj.value-car.hybridEnergyMj+hybrid*dt/1000)) : 0
      car.regenerationPowerKw = acceptedRegeneration*1000/dt
      car.hybridRecoveredMj = (car.hybridRecoveredMj ?? 0) + acceptedRegeneration
      car.hybridEnergyMj = clamp(car.hybridEnergyMj + acceptedRegeneration - hybrid * dt / 1000, 0, machine.hybridCapacityMj.value)
      car.hybridDeployedMj += hybrid * dt / 1000
      const tyreLoad = clamp((tyreForces.lateral + driveForce + brakeForce) / Math.max(1, tyreForces.available), 0, 1.5)
      car.tyreState = advanceRaceTyre(car.tyreState ? { ...car.tyreState, life: car.tyreLife, surfaceC: car.tyreTemperatureC } : initialRaceTyre(car.tyreTemperatureC, car.tyreLife), {
        category: entry.classId, compound: car.tyreSets.at(-1)?.compound ?? 'primary', oval: config.course.kind === 'short-oval' || config.course.kind === 'speedway',
        seconds: dt, distanceM: distanceStep, speedMps: car.speedMps, demand: tyreLoad,
        massRatio: mass / (machine.massKg.value + machine.driverMassKg.value + machine.fuelCapacityKg.value * 0.5),
        management: tyreSkill, pace: car.paceMode ?? 'standard', trackC: config.weather === 'wet' ? 22 : 32, wet: config.weather === 'wet',
      })
      car.tyreLife = car.tyreState.life; car.tyreTemperatureC = car.tyreState.surfaceC
      const drivetrain = drivetrainState(machine, car.speedMps, car.gear)
      car.gear = drivetrain.gear; car.rpm = drivetrain.rpm
      if (car.status === 'running') car.telemetryHistory = recordTelemetry(car.telemetryHistory,{lap:Math.floor(car.distanceM/length),progress:modulo(car.distanceM,length)/length,seconds:state.raceSeconds,speedKph:car.speedMps*3.6,throttlePercent:car.throttlePercent ?? 0,brakePercent:car.brakePercent ?? 0,gear:car.gear,rpm:car.rpm})
      if (car.pitRequest) {
        const entryLine = (Math.floor(beforeDistance / length) + config.course.pitEntry.value) * length
        const nextEntryLine = entryLine <= beforeDistance ? entryLine + length : entryLine
        if (car.distanceM >= nextEntryLine) { car.distanceM = nextEntryLine; car.status = 'pit-entry'; car.pitPathM = 0; car.stintSeconds = 0; closeDrivingStint(car) }
      }
      if (car.fuelKg === 0) {
        car.status = 'retired'; car.speedMps = 0
        closeDrivingStint(car)
        appendEvent(state, car.entryId, 'Retired: fuel exhausted.')
      }
    }
    advanceSectorTiming(car, beforeDistance, previous.raceSeconds, dt, config.course, state.flag === 'green')
    const completedBefore = Math.max(0, Math.floor(beforeDistance / length))
    const completedAfter = Math.max(0, Math.floor(car.distanceM / length))
    if (completedAfter > completedBefore) {
      const currentSet = car.tyreSets.at(-1)!
      car.tyreSets = [...car.tyreSets.slice(0, -1), { ...currentSet, completedLaps: currentSet.completedLaps + completedAfter - completedBefore }]
      const fraction = clamp((completedAfter * length - beforeDistance) / Math.max(0.001, car.distanceM - beforeDistance), 0, 1)
      const crossing = previous.raceSeconds + dt * fraction
      const lapTime = crossing - car.lapStartedAt
      const timed = config.sessionKind === 'practice' || config.sessionKind === 'qualifying'
      const validLap = !car.lapInvalid && car.status === 'running' && (!timed || completedBefore > 0)
      car.lastLapSeconds = lapTime
      if (validLap) car.bestLapSeconds = Math.min(car.bestLapSeconds ?? Infinity, lapTime)
      car.lapHistory = [...(car.lapHistory ?? []), { lap: completedAfter, seconds: lapTime, driverIndex: car.driverIndex, compound: car.tyreSets.at(-1)!.compound, pit: !validLap || car.status !== 'running' }].slice(-1000)
      car.lapInvalid = car.status !== 'running'
      car.lapStartedAt = crossing; car.laps = completedAfter
      if (RUNNING.has(car.status)) crossings.push({ entryId: car.entryId, time: crossing, laps: completedAfter })
    }
    return car
  })
  // Apply crossing events chronologically, independent of entry-list order.
  for (const crossing of crossings.sort((a, b) => a.time - b.time || a.entryId.localeCompare(b.entryId))) {
    if (config.sessionKind === 'practice' || config.sessionKind === 'qualifying') {
      if (config.format.kind === 'time' && crossing.time >= config.format.seconds) {
        const car = state.cars.find(item => item.entryId === crossing.entryId)!
        car.status = 'finished'; car.finishTime = crossing.time; car.speedMps = 0
        closeDrivingStint(car, crossing.time)
      }
      continue
    }
    const distanceOver = config.format.kind === 'laps' ? crossing.laps >= config.format.laps : crossing.time >= config.format.seconds
    if (!state.leaderFinished && crossing.laps > leadLapBefore && distanceOver) {
      state.leaderFinished = true; state.winnerId = crossing.entryId
      appendEvent(state, crossing.entryId, 'CHEQUERED FLAG. Leader crossed the Line after the required distance/time.')
    }
    if (state.leaderFinished) {
      const car = state.cars.find(item => item.entryId === crossing.entryId)!
      car.status = 'finished'; car.finishTime = crossing.time; car.speedMps = 0
      closeDrivingStint(car, crossing.time)
      car.warnings = [...car.warnings, ...motorsportCrewAudit(car, config)]
    }
  }
  if (state.cars.every(car => !RUNNING.has(car.status))) {
    state.phase = 'finished'; appendEvent(state, null, 'Race finished. Class standings and driver times are available.')
  }
  return state
}

/** The engine accepts only integral fixed ticks, independent of display rate. */
export function advanceMotorsportRace(state: MotorsportRaceState, ticks: number, config: MotorsportRaceConfig): MotorsportRaceState {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('Expected a non-negative integer tick count')
  let result = state
  for (let index = 0; index < ticks && result.phase !== 'finished'; index++) result = advanceTick(result, config)
  return result
}
export function motorsportStandings(state: MotorsportRaceState, config: MotorsportRaceConfig) {
  const entries = new Map(config.entries.map(entry => [entry.id, entry]))
  const classPositions = new Map<string, number>()
  const timed = config.sessionKind === 'practice' || config.sessionKind === 'qualifying'
  return [...state.cars].sort((a, b) => (timed ? (a.bestLapSeconds ?? Infinity) - (b.bestLapSeconds ?? Infinity) : 0) || b.laps - a.laps ||
    (a.finishTime !== null && b.finishTime !== null ? a.finishTime + a.penaltySeconds - b.finishTime - b.penaltySeconds : b.distanceM - a.distanceM) || a.entryId.localeCompare(b.entryId))
    .map((car, index) => {
      const entry = entries.get(car.entryId)!, position = (classPositions.get(entry.classId) ?? 0) + 1
      classPositions.set(entry.classId, position)
      return { car, entry, overallPosition: index + 1, classPosition: position }
    })
}
