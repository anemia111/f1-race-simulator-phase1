import type {Driver,DriverTunableStat} from '../types'
import {driverAbilityValue} from './driverAbility'

/** User-requested SIM learning thresholds, not official driver qualifications. */
export const MACHINE_DIFFICULTIES:Readonly<Record<string,{label:string;level:number;required:number}>>={
  'f1-custom':{label:'F1',level:6,required:88},
  'super-formula':{label:'SUPER FORMULA',level:5,required:80},
  indycar:{label:'INDYCAR',level:5,required:82},
  hypercar:{label:'WEC Hypercar',level:5,required:80},
  gt500:{label:'SUPER GT GT500',level:5,required:78},
  lmp2:{label:'WEC LMP2',level:4,required:74},
  gt300:{label:'SUPER GT GT300',level:3,required:64},
  lmgt3:{label:'WEC LMGT3',level:3,required:64},
  kyojo:{label:'KYOJO CUP',level:1,required:52},
}
const controls:ReadonlyArray<readonly [DriverTunableStat,number]>=[
  ['brakingSkill',0.18],['tractionControl',0.18],['throttleControl',0.18],
  ['precision',0.22],['carBalanceAdaptation',0.14],['raceAwareness',0.1],
]
export function driverMachineDifficulty(driver:Driver,category:string) {
  const machine=MACHINE_DIFFICULTIES[category]
  const capability=controls.reduce((sum,[stat,weight])=>sum+driverAbilityValue(driver,stat)*100*weight,0)
  const shortfall=machine?controls.reduce((sum,[stat,weight])=>sum+Math.max(0,machine.required-driverAbilityValue(driver,stat)*100)*weight,0):0
  const severity=Math.min(1,Math.max(0,shortfall/25))**2
  return {machine,capability,shortfall,gripUtilisation:1-0.32*severity,pedalRateScale:1-0.45*severity}
}
