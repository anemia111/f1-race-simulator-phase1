import { initialTeams } from '../../data/grid2026'
import { categoryPhysicsFor, resolveOperationalVehicleMass } from '../categoryPhysics'
import { advanceEnergyStore, createInitialEnergyStore } from '../energySystem'
import { permittedMguKDcPowerKwForSpeed, resolveF1RechargeRule } from '../regulations'
import { combustionPowerKwFor, integrateVehicleLongitudinalStep } from '../vehicleDynamics'

/** Controlled plant experiment. Direct deployment demand bypasses driver policy;
 * DC curves, SOC/thermal/energy limits, gearbox, tyres and road loads stay live.
 * Fuel/grip are deliberately fixed across A-D. No velocity bonus is applied.
 */
export function runErsExperiment(options:{throttlePercent?:number;initialSpeedKph?:number;durationSeconds?:number;deltaSeconds?:number;gripMultiplier?:number}={}) {
  const physics=categoryPhysicsFor('f1-custom'),team=initialTeams[0]
  const baseVehicleMassKg=resolveOperationalVehicleMass({f1NominalTyreMassKg:null,physics,weekendStage:'race'}).operationalMassKg
  const deltaSeconds=options.deltaSeconds??.05,durationSeconds=options.durationSeconds??8
  const throttlePercent=options.throttlePercent??100,gripMultiplier=options.gripMultiplier??1
  const combustionPowerKw=combustionPowerKwFor(team,physics)
  return [0,.25,.6,1].map((requestFraction,index)=>{
    let energy=createInitialEnergyStore(team,.9,resolveF1RechargeRule({stage:'race'}))
    let speedKph=options.initialSpeedKph??180,distanceM=0,arrival400mSeconds:number|null=null
    let turboSpoolFraction=1,clutchEngagementFraction=1
    const samples=[]
    for(let tick=0;tick<Math.round(durationSeconds/deltaSeconds);tick++) {
      const timeSeconds=(tick+1)*deltaSeconds
      const previousSpeedKph=speedKph,previousDistanceM=distanceM
      const regulatoryDcLimitKw=permittedMguKDcPowerKwForSpeed({curve:'normal',speedKph})
      const energyStep=advanceEnergyStore({allowLiftCoastRecovery:false,ambientTemperatureC:25,brakePercent:0,combustionWheelPowerKw:combustionPowerKw*physics.drivetrainEfficiency,deltaSeconds,deploymentDcPowerLimitKw:regulatoryDcLimitKw,deploymentRequest:requestFraction,gripMultiplier,rechargeRule:energy.rechargeRule,recoveryRequestScale:0,speedKph,state:energy,surfaceWaterMm:0,team,throttlePercent,tire:'M',vehicleMassKg:baseVehicleMassKg+30})
      energy=energyStep.state
      const force=integrateVehicleLongitudinalStep({activeAeroMode:'straight',airDensityKgM3:1.225,baseVehicleMassKg,brakePercent:0,categoryPhysics:physics,clutchEngagementFraction,combustionPowerKw,currentSpeedKph:speedKph,deltaSeconds,dynamics:{roadGradeFraction:0,straightness:1},ersPowerKw:energy.actualDeploymentPowerKw,fuelLoadKg:30,gripMultiplier,regenerativeResistancePowerKw:0,team,throttlePercent,turboSpoolFraction})
      speedKph=force.speedKph;turboSpoolFraction=force.turboSpoolFraction;clutchEngagementFraction=force.clutchEngagementFraction
      // Scalar fallback lets the identical diagnostic harness measure unchanged
      // baseline builds which predate the exposed force-integrated distance.
      distanceM+=force.distanceTravelledM??((previousSpeedKph+speedKph)/7.2)*deltaSeconds
      if(arrival400mSeconds===null&&distanceM>=400)arrival400mSeconds=timeSeconds-deltaSeconds+deltaSeconds*(400-previousDistanceM)/(distanceM-previousDistanceM)
      const accepted=energyStep.audit.deploymentSamples?.at(-1)
      samples.push({timeSeconds,gear:force.gear,rpm:force.rpm,mguKTorqueNm:force.mguKTorqueNm??null,mguKMechanicalPowerKw:force.mguKMechanicalPowerKw??null,requestFraction,regulatoryDcLimitKw,requestedDcKw:energy.requestedDeploymentDcPowerKw,actualDcKw:energy.actualDeploymentDcPowerKw,mechanicalKw:energy.actualDeploymentPowerKw,soc:energy.stateOfCharge,accelerationMps2:force.accelerationMps2,speedKph,distanceM,driveForceN:force.driveForceN,requestedDriveForceN:force.requestedDriveForceN??null,tractionLimitN:force.tractionLimitN,tractionLimited:force.requestedDriveForceN!==undefined?force.requestedDriveForceN>force.tractionLimitN+1e-6:null,dragForceN:force.dragForceN,rollingResistanceForceN:force.rollingResistanceForceN,gradeForceN:force.gradeForceN,wheelDrivePowerKw:force.wheelDrivePowerKw,batteryEnergyRemovedMJ:energy.energyRemovedThisLapMJ,storeBalanceErrorMJ:energyStep.audit.storeBalanceErrorMJ,conversionChainErrorMJ:energyStep.audit.conversionChainErrorMJ,limits:accepted??null})
    }
    return {id:['A-none','B-low','C-medium','D-high'][index],requestFraction,throttlePercent,initialSpeedKph:options.initialSpeedKph??180,deltaSeconds,gripMultiplier,durationSeconds,arrival400mSeconds,finalSpeedKph:speedKph,distanceM,consumedEnergyMJ:energy.energyRemovedThisLapMJ,finalSOC:energy.stateOfCharge,samples}
  })
}

