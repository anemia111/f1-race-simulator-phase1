import {describe,it,expect} from 'vitest'
import {decideTeamInstruction,applyTeamInstruction,delayTeammatePit,driverAcceptsTeamInstruction,type TeamCarObservation} from './teamDecision'
import {initialDrivers} from '../data/grid2026'
import {decideDriverBehavior,type DriverDecisionContext} from './driverDecision'
const a:TeamCarObservation={id:'a',teamId:'team',classId:'gt500',distanceM:1000,speedMps:50,running:true,expectedLapSeconds:90,tyreLife:0.8}
const b={...a,id:'b',distanceM:980}
describe('teams protect the combined result without removing driver autonomy',()=>{
 it('holds equal teammates and releases a clearly quicker one',()=>{
  expect(decideTeamInstruction(a,[a,b],5000).kind).toBe('hold-position')
  const quicker={...b,expectedLapSeconds:89}
  expect(decideTeamInstruction(a,[a,quicker],5000).kind).toBe('let-teammate-through')
  expect(decideTeamInstruction(quicker,[a,quicker],5000).reason).toBe('faster-teammate')
  expect(decideTeamInstruction(a,[a,{...b,distanceM:700}],5000).kind).toBe('free-to-fight')
 })
 it('does not turn an unrelated opponent or another class into a teammate',()=>{
  expect(decideTeamInstruction(a,[a,{...b,teamId:'other'}],5000).kind).toBe('free-to-fight')
  expect(decideTeamInstruction(a,[a,{...b,classId:'gt300'}],5000).kind).toBe('free-to-fight')
 })
 it('makes team compliance deterministic, personal, and distinct from a flag',()=>{
  const driver=initialDrivers[0]
  const input:DriverDecisionContext={seed:'team',driver,lap:2,trackProgress:0.2,currentLateralOffsetM:0,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,edgeClearanceM:1,flagState:'clear'}
  let accepted:DriverDecisionContext|undefined
  for(let i=0;i<30;i++){
   const context={...input,seed:String(i)},instruction={kind:'let-teammate-through' as const,teammateId:'b',reason:'faster-teammate' as const}
   const next=applyTeamInstruction(context,instruction,{id:'b',gapSeconds:0.4,lateralM:0})
   expect(next).toEqual(applyTeamInstruction(context,instruction,{id:'b',gapSeconds:0.4,lateralM:0}))
   if(next.yield?.active)accepted=next
  }
  expect(accepted?.flagState).toBe('clear')
  expect(decideDriverBehavior(accepted!).intent).toBe('team-order-yield')
  expect(decideDriverBehavior({...accepted!,flagState:'yellow'}).intent).toBe('controlled-flag')
  const choices=Array.from({length:100},(_,i)=>driverAcceptsTeamInstruction('x','driver',i,.5,.9))
  expect(choices.includes(true)&&choices.includes(false)).toBe(true)
 })
 it('avoids double stacking but never delays fuel, mandatory or weather emergencies',()=>{
  const safe={teammateBusy:true,fuelLaps:4,tyreLife:.6,mandatoryStopDue:false,weatherEmergency:false}
  expect(delayTeammatePit(safe)).toBe(true)
  expect(delayTeammatePit({...safe,fuelLaps:1})).toBe(false)
  expect(delayTeammatePit({...safe,mandatoryStopDue:true})).toBe(false)
  expect(delayTeammatePit({...safe,weatherEmergency:true})).toBe(false)
 })
})
