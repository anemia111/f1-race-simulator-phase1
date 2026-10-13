// Offline SIM authoring tool. Fits contact forces, never elapsed-time scales.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'f1-contact-fit-'))
const server = await createServer({root,configFile:false,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
try {
  const [free,registry,fit,lap] = await Promise.all([
    server.ssrLoadModule('/src/freeMode/freeModeRegistry.ts'),server.ssrLoadModule('/src/series/seriesRegistry.ts'),
    server.ssrLoadModule('/src/simulation/f1CourseCalibration.ts'),server.ssrLoadModule('/src/simulation/physicalLap.ts')])
  const rows = []
  const coefficients = {}
  const measure = async (id, coefficient) => {
    const output = join(directory, `${id}.json`)
    await new Promise((yes,no)=>{
      const child=spawn(process.execPath,['scripts/validate-f1-course-times.mjs',`--track=${id}`,`--coefficient=${coefficient}`,`--output=${output}`],{cwd:root,stdio:['ignore','ignore','inherit'],windowsHide:true})
      child.on('error',no); child.on('close',code=>code===0?yes():no(new Error(`Contact candidate failed: ${id}, ${code}`)))
    })
    return JSON.parse(await readFile(output,'utf8')).rows[0]
  }
  for(const option of free.freeModeTrackOptions(registry.seriesPackageById)){
    const initial = fit.f1CourseCalibrationFor(option.physicalTrack)
    if(initial.targetSeconds===null)continue
    let coefficient=initial.physics.peakTyreFrictionCoefficient
    let measurement=null
    let bestMeasurement=null
    for(let iteration=0;iteration<6;iteration++){
      measurement=await measure(option.id,coefficient)
      const error=measurement.liveReferenceResidualSeconds
      if(error===null)throw new Error(`No valid measurement for ${option.id}`)
      console.log(JSON.stringify({id:option.id,iteration,coefficient,seconds:measurement.liveBestSeconds,error}))
      if(!bestMeasurement || Math.abs(error)<Math.abs(bestMeasurement.liveReferenceResidualSeconds)) bestMeasurement=measurement
      if(Math.abs(error)<0.25)break
      const secondsAt = c=>lap.simulatePhysicalLap(option.physicalTrack,{physics:{...initial.physics,peakTyreFrictionCoefficient:c},airTemperatureC:25}).lapTimeSeconds
      const derivative=(secondsAt(coefficient+.01)-secondsAt(coefficient-.01))/.02
      if (!Number.isFinite(derivative) || derivative>=-1e-6) throw new Error(`Contact response is not identifiable for ${option.id}`)
      const next=Math.max(.8,Math.min(2.5,coefficient-error/derivative))
      if(Math.abs(next-coefficient)<.0001)break
      coefficient=next
    }
    // Store the coefficient actually measured, including any bounded residual.
    bestMeasurement.bounded=(bestMeasurement.effectiveContactCoefficient>=2.4999 || bestMeasurement.effectiveContactCoefficient<=.8001)
      && Math.abs(bestMeasurement.liveReferenceResidualSeconds)>.25
    coefficients[option.id]=bestMeasurement.effectiveContactCoefficient
    rows.push(bestMeasurement)
  }
  const report={schemaVersion:1,kind:'SIM effective contact model; not measured tyre or road friction',
    conditions:'Dry isolated driver 100, machine axes 0.86, first two valid Q1 laps, calibration seed 0. Fuel/setup/thermal/energy/driver controllers active.',
    coefficients,calibrationMeasurements:rows}
  if(process.argv.includes('--write')) {
    await writeFile(resolve(root,'src/data/calibration/f1CourseContactCalibration.json'),JSON.stringify(report,null,2)+'\n')
  } else console.log(JSON.stringify(report,null,2))
} finally {await server.close();await rm(directory,{recursive:true,force:true})}
