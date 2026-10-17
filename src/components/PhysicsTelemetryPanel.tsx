import type {CarSnapshot} from '../types'
export function PhysicsTelemetryPanel({car}:{car:CarSnapshot|undefined}) {
  const p=car?.physicsTelemetry
  if(!car||!p)return <aside className="physics-telemetry">Physics telemetry unavailable for this snapshot.</aside>
  const e=p.deployment
  const energyStore=car.runtimeSystems.kind==='f1'?car.runtimeSystems.energyStore:null
  const n=(value:number|undefined,digits=1)=>Number.isFinite(value)?value!.toFixed(digits):'N/A'
  const rows=[
    ['Road speed / force result',`${n(car.speedKph)} / ${n(p.forceEndSpeedKph)} km/h`],
    ['Acceleration / mass',`${n(p.accelerationMps2,2)} m/s² / ${n(p.massKg)} kg`],
    ['Step travel: force / resolved',`${n(p.forceDistanceM,3)} / ${n(p.resolvedDistanceM,3)} m`],
    ['Mean travel / external motion limit',`${n(p.meanTravelSpeedKph)} km/h / ${p.motionConstrained?'APPLIED':'none'}`],
    ['Pedals: throttle / brake',`${n(car.throttlePercent,0)} / ${n(car.brakePercent,0)} %`],
    ['Drive request / tyre force',`${n(p.requestedDriveForceN,0)} / ${n(p.driveForceN,0)} N`],
    ['Driven-axle capacity',`${n(p.tractionLimitN,0)} N${p.requestedDriveForceN>p.tractionLimitN+1?' · TRACTION LIMIT':''}`],
    ['Drag / service brake',`${n(p.dragForceN,0)} / ${n(p.brakeForceN,0)} N`],
    ['Rolling / grade',`${n(p.rollingResistanceForceN,0)} / ${n(p.gradeForceN,0)} N`],
    ['Downforce / lateral tyre demand',`${n(p.downforceN,0)} / ${n(p.lateralTyreDemandN,0)} N`],
    ['Wheel drive / generator',`${n(p.wheelDrivePowerKw)} / ${n(p.generatorMechanicalPowerKw)} kW`],
    ['Accepted recovery (mechanical)',energyStore?`${n(energyStore.actualRecoveryPowerKw)} kW`:'N/A — category'],
    ['ICE available before pedal',`${n(p.combustionAvailableKw)} kW`],
    ['ERS demand / regulatory DC cap',e?`${n(e.requestFraction*100,0)} % / ${n(e.regulatoryDcLimitKw)} kW`:'N/A — category'],
    ['Requested / actual DC',e?`${n(e.requestedDcKw)} / ${n(e.actualDcKw)} kW`:'N/A'],
    ['Accepted shaft budget / SOC',e?`${n(e.mechanicalKw)} kW / ${n(e.stateOfCharge*100)} %`:'N/A'],
    ['MGU-K at solver RPM / torque',`${n(p.mguKMechanicalPowerKw)} kW / ${n(p.mguKTorqueNm)} Nm`],
    ['DC caps: hardware / SOC',e?`${n(e.hardwareDcLimitKw)} / ${n(e.socDcLimitKw)} kW`:'N/A'],
    ['DC caps: thermal / remaining energy',e?`${n(e.thermalDcLimitKw)} / ${n(e.availableEnergyDcLimitKw)} kW`:'N/A'],
    ['Energy balance residual',e?`${e.balanceErrorMJ.toExponential(2)} MJ`:'N/A'],
    ['Tow drag reduction / dirty-air load',`${n(p.towDragReduction*100)} % / ${n(p.dirtyAirDownforceMultiplier*100)} %`],
    ['Curvature / reference offset',`${n(p.curvature,3)} / ${n(p.referenceLineOffsetM,2)} m`],
    ['Actual offset / lateral velocity',`${n(car.lateralOffsetM,2)} m / ${n(car.lateralVelocityMps,2)} m/s`],
    ['Following brake demand',`${n(p.followingDecelerationMps2,2)} m/s²`],
    ['Battle / selected driver candidate',`${car.battlePhase} / ${car.driverAgentRuntime?.recentDecisions.at(-1)?.selectedCandidateId??'N/A'}`],
  ]
  return <aside className="physics-telemetry" aria-label="Live physics telemetry"><strong>{car.code} · SIM PHYSICS</strong><small>t={n(p.sampledAtSeconds,2)}s · Δt={n(p.deltaSeconds,3)}s · {p.forceApplied?'force solve applied':'force solve not applied'}</small><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><small>Energy powers: frame averages. DC caps: last internal slice. Forces: end of force solve. Traffic/control may constrain the resolved snapshot. Body yaw and steering are not measured physical states.</small></aside>
}
