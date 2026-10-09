import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const {createMotorsportConfig} = await server.ssrLoadModule('/src/motorsport/packages.ts')
  const {createMotorsportRace,advanceMotorsportRace} = await server.ssrLoadModule('/src/motorsport/race.ts')
  const {targetSpeedMps} = await server.ssrLoadModule('/src/motorsport/coursePhysics.ts')
  const {tyreGripScale} = await server.ssrLoadModule('/src/motorsport/vehicleDynamics.ts')
  const rows=[]
  for(const category of ['kyojo','super-gt','wec','indycar']) {
    const config=createMotorsportConfig(category);config.entries=config.entries.slice(0,1)
    let state={...createMotorsportRace(config),phase:'racing'}
    let min=Infinity,max=0,overspeed=0,maxAcceleration=0,minAcceleration=0,stopped=0
    for(let i=0;i<5000 && state.cars[0].distanceM<config.course.lengthM*3;i++) {
      const old=state.cars[0];state=advanceMotorsportRace(state,1,config);const car=state.cars[0]
      if(old.distanceM<config.course.lengthM)continue
      const target=targetSpeedMps(config.course,config.entries[0].machine,old.distanceM,{massKg:config.entries[0].machine.massKg.value+config.entries[0].machine.driverMassKg.value+old.fuelKg,gripScale:tyreGripScale(old,config.weather,config.entries[0].classId)})
      min=Math.min(min,car.speedMps*3.6);max=Math.max(max,car.speedMps*3.6);overspeed=Math.max(overspeed,(old.speedMps-target)*3.6)
      maxAcceleration=Math.max(maxAcceleration,(car.speedMps-old.speedMps)*10);minAcceleration=Math.min(minAcceleration,(car.speedMps-old.speedMps)*10)
      if(car.speedMps<1)stopped++
    }
    rows.push({category,course:config.course.id,minKph:min,maxKph:max,maximumTargetExcessKph:overspeed,maxAcceleration,minAcceleration,stopped,bestLap:state.cars[0].bestLapSeconds})
    if(process.env.MOTION_FULL_FIELD){
      const raceConfig=createMotorsportConfig(category);raceConfig.format={kind:'laps',laps:1,basis:'SIM validation'}
      let race=createMotorsportRace(raceConfig)
      for(let i=0;i<20000&&race.phase!=='finished';i+=1000)race=advanceMotorsportRace(race,1000,raceConfig)
      console.log(category,'full field',race.phase,race.cars.reduce((s,c)=>(s[c.status]=(s[c.status]??0)+1,s),{}),race.cars.filter(c=>c.status==='running').slice(0,3).map(c=>({d:c.distanceM,v:c.speedMps,lat:c.lateralM})))
    }
  }
  console.log(JSON.stringify(rows,null,2))
  if(process.env.MOTION_REPORT)writeFileSync(process.env.MOTION_REPORT,JSON.stringify(rows,null,2))
} finally {await server.close()}
