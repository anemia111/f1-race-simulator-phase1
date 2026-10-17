import {createServer} from 'vite'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const root=resolve(process.env.ERS_EXPERIMENT_SOURCE??'.')
const out=resolve(process.env.ERS_EXPERIMENT_OUTPUT??'../../outputs/ers-experiment-after.json')
const server=await createServer({root,logLevel:'error',server:{middlewareMode:true},appType:'custom'})
try {
  const {runErsExperiment}=await server.ssrLoadModule('/src/simulation/diagnostics/ersExperiment.ts')
  const report={generatedAt:new Date().toISOString(),sourceRoot:root,model:'Production energySystem + drivetrain + vehicleDynamics; direct controlled demand, not driver strategy or observed F1 telemetry',fullThrottle:runErsExperiment(),partialThrottle:runErsExperiment({throttlePercent:60}),tractionCase:runErsExperiment({initialSpeedKph:20,durationSeconds:2,gripMultiplier:.55})}
  await mkdir(resolve(out,'..'),{recursive:true})
  await writeFile(out,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({out,fullThrottle:report.fullThrottle.map(({samples: _samples,...summary})=>summary),partialThrottle:report.partialThrottle.map(({samples: _samples,...summary})=>summary)},null,2))
}finally{await server.close()}

