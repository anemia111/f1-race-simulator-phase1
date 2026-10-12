import {resolveSuperFormulaOperational} from '../simulation/superFormulaOperational'
import type {RaceConfig,RaceSnapshot,TireCompound} from '../types'
import type {MotorsportRaceConfig,MotorsportRaceState} from '../motorsport/types'
import {validEngineeringPlan,type EngineeringPlan} from './raceEngineer'

function checkedPlan(plan:EngineeringPlan,seconds:number,distance:number,pits:number,fieldSize:number) {
  return validEngineeringPlan(plan)&&plan.status==='scheduled'&&plan.actualPosition===undefined&&plan.createdSeconds<=seconds&&seconds-plan.createdSeconds<30&&plan.startingPitStops===pits&&plan.dueDistance>=distance-0.1&&plan.dueDistance<=distance+5.1&&plan.positionHigh<=fieldSize
}
export function applyFormulaEngineeringPlan(snapshot:RaceSnapshot,config:RaceConfig,id:string,plan:EngineeringPlan|null):RaceSnapshot {
  if(!['race','sprint'].includes(config.weekendStage??'race'))return snapshot
  const car=snapshot.cars.find(c=>c.driverId===id)
  if(!car||car.status!=='running'||car.pitPhase!=='none')return snapshot
  if(plan===null)return {...snapshot,cars:snapshot.cars.map(c=>c===car?{...c,engineeringPlan:c.engineeringPlan?{...c.engineeringPlan,status:'cancelled'}:undefined}:c)}
  if(!checkedPlan(plan,snapshot.elapsedSeconds,car.totalDistance,car.pitStops,snapshot.cars.length)||!snapshot.pitLaneOpen||!config.track.pitLane||car.lap<2)return snapshot
  let compound:TireCompound|undefined
  if(car.runtimeSystems.kind==='f1'){
    const tires=car.runtimeSystems.tires
    const wet=snapshot.weather==='light-rain'||snapshot.weather==='heavy-rain'
    const choices:TireCompound[]=wet?['I','W']:['H','M','S']
    // Existing AI still handles compound legality and changing weather. This is
    // a manual tyre-stop preference from available sets, never a fabricated set.
    compound=plan.compound&&tires.tireSetsRemaining[plan.compound]!>0?plan.compound:choices.find(t=>t!==tires.tire&&tires.tireSetsRemaining[t]!>0)??choices.find(t=>tires.tireSetsRemaining[t]!>0)
    if(!compound)return snapshot
  } else {
    const runtime=car.runtimeSystems,surface=runtime.liveTires.activeSurface
    if(resolveSuperFormulaOperational().pitLane.enforcement!=='enabled'||runtime.controlTires.sets[surface].remainingSets<=0)return snapshot
  }
  const accepted={...plan,...(compound?{compound}:{})}
  return {...snapshot,cars:snapshot.cars.map(c=>c===car?{...c,engineeringPlan:accepted}:c)}
}
export function applyMotorsportEngineeringPlan(state:MotorsportRaceState,config:MotorsportRaceConfig,id:string,plan:EngineeringPlan|null):MotorsportRaceState {
  if(config.sessionKind&&config.sessionKind!=='race')return state
  const car=state.cars.find(c=>c.entryId===id)
  if(!car||car.status!=='running')return state
  if(plan===null)return {...state,cars:state.cars.map(c=>c===car?{...c,engineeringPlan:c.engineeringPlan?{...c.engineeringPlan,status:'cancelled'}:undefined}:c)}
  const count=config.entries.filter(e=>e.classId===config.entries.find(e=>e.id===id)?.classId).length
  if(state.flag==='red'||config.championship==='kyojo'&&config.applicationMode!=='free'||!checkedPlan(plan,state.raceSeconds,car.distanceM/config.course.lengthM,car.pits,count))return state
  return {...state,cars:state.cars.map(c=>c===car?{...c,engineeringPlan:plan}:c)}
}
