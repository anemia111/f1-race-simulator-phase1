import { describe, expect, it } from 'vitest'
import { advanceVehicleHandling, initialVehicleHandling, validVehicleHandling, handlingSlip, replaceHandlingTyres } from './vehicleHandling'
import { categoryPhysicsFor } from './categoryPhysics'
import { integrateVehicleLongitudinalStep } from './vehicleDynamics'
import { advancePedals } from './pedalControl'
import { createMotorsportConfig } from '../motorsport/packages'
import { advanceMotorsportRace, createMotorsportRace, validateMotorsportConfig } from '../motorsport/race'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import { encodeTelemetryHistory, decodeTelemetryHistory, handlingTelemetry, recordTelemetry, type TelemetryPoint } from './telemetryHistory'
import { initialTeams } from '../data/grid2026'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace, advanceRace } from './race'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'
import type { RaceConfig } from '../types'

const physics = categoryPhysicsFor('super-formula')
const corner = { seconds: 0.05, speedMps: 25, massKg: 710, physics, curvature: 0.008,
  desiredOffset: 0, actualOffset: 0, grip: 1, downforceN: 1400, driveForceN: 500,
  brakeForceN: 0, requestedDriveN: 500, tractionLimitN: 4500, accelerationMps2: 0,
  brakeWorkMJ: 0, trackC: 32, airC: 25, wet: false, differentialPercent: 55 }

describe('coupled live vehicle handling', () => {
  it.each(['f1-custom','super-formula'] as const)('%s integrates steering and pedal feedback in live ticks and restores its state', id => {
    const series = seriesPackageById.get(id)!
    const config: RaceConfig = { drivers: series.drivers.slice(0,1), teams: series.teams, track: series.tracks[0], seriesId:id, weekendStage:'fp2', sessionDurationSeconds:900, seed:'live-handling' }
    let state = createInitialRace(config)
    state = { ...state, elapsedSeconds:200, cars:state.cars.map(car=>({...car,status:'running',pitPhase:'none',pitUntilSeconds:null,hiddenFromTrack:false,offTrackSinceSeconds:null,incidentTrackState:'clear',totalDistance:2.3,progress:0.3,processedLap:2,speedKph:150,gear:4,timedRunPhase:'attack-lap',timedRunStartedAtSeconds:190,lapStartedAtSeconds:190,practiceProgram:null})) }
    for (let i=0;i<40;i++) state = advanceRace(state,0.05,config)
    const car=state.cars[0]
    expect(car.totalDistance).toBeGreaterThan(2.3)
    expect(validVehicleHandling(car.handlingState)).toBe(true)
    expect(car.telemetryHistory?.some(p=>p.steeringDegrees!==undefined)).toBe(true)
    const now=Date.now(),raw=serializeRaceCheckpoint('handling',state,now)!
    expect(parseRaceCheckpoint(raw,'handling',config,now)?.cars[0].handlingState).toEqual(car.handlingState)
  })
  it('replacing tyres clears slip heat and wear while keeping chassis and brake memory',()=>{
    const state=advanceVehicleHandling(initialVehicleHandling(),{...corner,requestedDriveN:15000,brakeWorkMJ:0.5})
    const next=replaceHandlingTyres(state,78)!
    expect(next.brakeTemperatureC).toBe(state.brakeTemperatureC)
    expect(next.yawRate).toBe(state.yawRate)
    expect(next.wheels.every(w=>w.slipRatio===0 && w.wear===0 && w.surfaceC===78)).toBe(true)
  })
  it('internal substeps keep constant-condition results consistent across caller tick sizes',()=>{
    const simulate=(dt:number)=>{
      let state=initialVehicleHandling()
      for(let i=0;i<Math.round(2/dt);i++)state=advanceVehicleHandling(state,{...corner,seconds:dt,actualOffset:state.lateralOffset})
      return state
    }
    const fine=simulate(0.01),coarse=simulate(0.1)
    expect(coarse.yawRate).toBeCloseTo(fine.yawRate,5)
    expect(coarse.lateralOffset).toBeCloseTo(fine.lateralOffset,5)
    expect(coarse.wheels[0].surfaceC).toBeCloseTo(fine.wheels[0].surfaceC,5)
  })
  it('develops steering, yaw, axle slip and unequal wheel loads rather than snapping onto a line', () => {
    let state = initialVehicleHandling()
    for (let i=0;i<100;i++) state = advanceVehicleHandling(state, { ...corner, actualOffset: state.lateralOffset })
    expect(validVehicleHandling(state)).toBe(true)
    expect(state.steeringRad).toBeGreaterThan(0)
    expect(state.yawRate).toBeGreaterThan(0)
    expect(state.wheels[0].loadN).not.toBe(state.wheels[1].loadN)
    expect(Math.abs(state.headingError)).toBeLessThan(0.3)
    expect(Math.abs(state.lateralOffset)).toBeLessThan(5)
    expect(state.rollRad).toBeGreaterThan(0)
  })
  it('slip work and braking heat persist, wet cooling removes more heat, and malformed saves are rejected', () => {
    const before=initialVehicleHandling(0,100)
    const dry=advanceVehicleHandling(before,{...corner,driveForceN:3500,requestedDriveN:14000,brakeWorkMJ:1})
    const wet=advanceVehicleHandling(before,{...corner,driveForceN:3500,requestedDriveN:14000,brakeWorkMJ:1,wet:true})
    expect(handlingSlip(dry).drive).toBeGreaterThan(0.08)
    expect(dry.wheels.reduce((n,w)=>n+w.slipWorkJ,0)).toBeGreaterThan(0)
    expect(dry.brakeTemperatureC).toBeGreaterThan(before.brakeTemperatureC)
    expect(wet.wheels[0].surfaceC).toBeLessThan(dry.wheels[0].surfaceC)
    expect(validVehicleHandling({...dry,headingError:NaN})).toBe(false)
    expect(validVehicleHandling({version:1,wheels:[]})).toBe(false)
    expect(validVehicleHandling({...dry,wheels:[{}]})).toBe(false)
  })
  it('retains lock demand after force clipping and changes axle slip with brake bias',()=>{
    const input={...corner,driveForceN:0,requestedDriveN:0,brakeForceN:3000,requestedBrakeN:25000}
    const front=advanceVehicleHandling(initialVehicleHandling(),{...input,brakeBiasPercent:70})
    const rear=advanceVehicleHandling(initialVehicleHandling(),{...input,brakeBiasPercent:40})
    expect(handlingSlip(front).brake).toBeGreaterThan(0.13)
    expect(Math.abs(front.wheels[0].slipRatio)).toBeGreaterThan(Math.abs(rear.wheels[0].slipRatio))
    expect(Math.abs(rear.wheels[2].slipRatio)).toBeGreaterThan(Math.abs(front.wheels[2].slipRatio))
  })
  it('recovers heading after a lateral disturbance without saturating the chassis state',()=>{
    let state={...initialVehicleHandling(),lateralSpeed:-6,yawRate:0.8,headingError:0.12}
    for(let i=0;i<200;i++)state=advanceVehicleHandling(state,{...corner,curvature:0,actualOffset:state.lateralOffset})
    expect(Math.abs(state.yawRate)).toBeLessThan(0.3)
    expect(Math.abs(state.headingError)).toBeLessThan(0.2)
    expect(Math.abs(state.lateralSpeed)).toBeLessThan(4)
  })
  it('requires complete finite optional weather inputs',()=>{
    const config=createMotorsportConfig('kyojo')
    config.environment={airTemperatureC:20,trackTemperatureC:30,windSpeedMps:5,windDirectionRad:1,surfaceWaterMm:0.2}
    expect(()=>validateMotorsportConfig(config)).not.toThrow()
    expect(()=>validateMotorsportConfig({...config,environment:{} as typeof config.environment})).toThrow('Invalid physical environment')
    expect(()=>validateMotorsportConfig({...config,environment:{...config.environment!,windDirectionRad:NaN}})).toThrow('Invalid physical environment')
  })
  it('the driver opens the throttle more gradually under lateral load and reacts to wheel slip', () => {
    const base={throttle:100,brake:0,previousThrottle:30,previousBrake:0,seconds:0.1}
    const straight=advancePedals({...base,feedback:{lateralUse:0,driveSlip:0,brakeSlip:0,skill:1}})
    const turn=advancePedals({...base,feedback:{lateralUse:0.9,driveSlip:0,brakeSlip:0,skill:1}})
    const spinning=advancePedals({...base,previousThrottle:80,feedback:{lateralUse:0.9,driveSlip:0.4,brakeSlip:0,skill:1}})
    expect(turn.throttle).toBeLessThan(straight.throttle)
    expect(spinning.throttle).toBeLessThan(80)
    const lock=advancePedals({...base,brake:80,previousBrake:70,feedback:{lateralUse:0.5,driveSlip:0,brakeSlip:0.4,skill:1}})
    expect(lock.brake).toBeLessThan(70)
    expect(lock.throttle).toBe(0)
  })
  it('a pending gear change reduces the actual force and completes into the requested gear', () => {
    const state={...initialVehicleHandling(),gear:4,shiftTarget:5,shiftRemaining:0.04}
    const input={activeAeroMode:'corner' as const,airDensityKgM3:1.225,baseVehicleMassKg:710,
      fuelLoadKg:10,categoryPhysics:physics,currentSpeedKph:150,deltaSeconds:0.05,
      dynamics:{roadGradeFraction:0,straightness:1},ersPowerKw:0,gripMultiplier:1,team:initialTeams[0],throttlePercent:100,brakePercent:0,
      handling:{state,lateralOffset:0,desiredOffset:0,driverSkill:1,trackC:30,airC:25,wet:false}}
    const shifting=integrateVehicleLongitudinalStep(input)
    const engaged=integrateVehicleLongitudinalStep({...input,handling:{...input.handling,state:{...state,shiftRemaining:0}}})
    expect(shifting.driveForceN).toBeLessThan(engaged.driveForceN)
    expect(shifting.handlingState?.gear).toBe(5)
    expect(shifting.handlingState?.shiftRemaining).toBe(0)
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s advances all handling state and preserves it in saves',category=>{
    const config=createMotorsportConfig(category);config.entries=config.entries.slice(0,1)
    let state={...createMotorsportRace(config),phase:'racing' as const}
    state.cars[0]={...state.cars[0],speedMps:25,tyreTemperatureC:90}
    for(let i=0;i<60;i++)state=advanceMotorsportRace(state,1,config) as typeof state
    expect(state.cars[0].distanceM).toBeGreaterThan(20)
    expect(validVehicleHandling(state.cars[0].handlingState)).toBe(true)
    expect(state.cars[0].telemetryHistory?.some(p=>p.driveSlipPercent!==undefined)).toBe(true)
    const restored=parseMotorsportSave(serializeMotorsportSave(config,state))
    expect(restored?.state.cars[0].handlingState).toEqual(state.cars[0].handlingState)
  })
  it('records the true handling channels, doubles spatial resolution and loads legacy traces',()=>{
    const point:TelemetryPoint={lap:0,progress:0,seconds:0,speedKph:100,throttlePercent:50,brakePercent:0,gear:3,rpm:7000}
    expect(decodeTelemetryHistory(encodeTelemetryHistory([point]))).toEqual([point])
    const next={...point,...handlingTelemetry(initialVehicleHandling()),progress:0.002,seconds:0.1}
    const history=recordTelemetry(recordTelemetry(undefined,point),next)
    expect(history).toHaveLength(2)
    expect(decodeTelemetryHistory(encodeTelemetryHistory(history))).toEqual(history)
  })
})
