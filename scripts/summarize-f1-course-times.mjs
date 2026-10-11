import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root,'docs/validation')
const reports = await Promise.all([0,1,2].map(async seed => JSON.parse(await readFile(resolve(directory,`f1-course-times-seed${seed}.json`),'utf8'))))
const beforeText = await readFile(resolve(directory,'f1-course-times-before.json'),'utf8')
  .catch(error => {
    if (error.code !== 'ENOENT') throw error
    return readFile(resolve(root,'../../outputs/f1-course-before-live.json'),'utf8')
  })
const before = JSON.parse(beforeText)
if(new Set(reports.map(report=>report.sourceFingerprint)).size!==1)throw new Error('Source changed between seed audits')
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
const rows = reports[0].rows.map(row=>{
  const measurements=reports.map(report=>report.rows.find(candidate=>candidate.id===row.id))
  if(measurements.some(measurement=>!measurement || measurement.liveBestSeconds===null))throw new Error(`Missing measured lap: ${row.id}`)
  const liveMedianSeconds=median(measurements.map(measurement=>measurement.liveBestSeconds))
  const beforeSeconds=before.rows.find(candidate=>candidate.id===row.id)?.liveBestSeconds ?? null
  return {...row,beforeSeconds,liveMedianSeconds,liveReferenceResidualSeconds:row.targetSeconds===null?null:liveMedianSeconds-row.targetSeconds,
    seeds:measurements.map((measurement,seed)=>({seed,seconds:measurement.liveBestSeconds,validLaps:measurement.liveValidLaps}))}
})
const targeted = rows.filter(row=>row.targetSeconds!==null)
const independentErrors=reports.slice(1).flatMap(report=>report.rows.filter(row=>row.targetSeconds!==null).map(row=>Math.abs(row.liveReferenceResidualSeconds)))
const summary = {layouts:rows.length,targetedLayouts:targeted.length,unavailableLayouts:rows.length-targeted.length,
  beforeMeanAbsoluteErrorSeconds:targeted.reduce((sum,row)=>sum+Math.abs(row.beforeSeconds-row.targetSeconds),0)/targeted.length,
  medianMeanAbsoluteErrorSeconds:targeted.reduce((sum,row)=>sum+Math.abs(row.liveReferenceResidualSeconds),0)/targeted.length,
  medianMaximumAbsoluteErrorSeconds:Math.max(...targeted.map(row=>Math.abs(row.liveReferenceResidualSeconds))),
  independentSeedMeanAbsoluteErrorSeconds:independentErrors.reduce((a,b)=>a+b,0)/independentErrors.length,
  independentSeedMaximumAbsoluteErrorSeconds:Math.max(...independentErrors)}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceFingerprint:reports[0].sourceFingerprint,
  conditions:reports[0].conditions,calibrationSeed:0,independentSeeds:[1,2],summary,rows}
await mkdir(directory,{recursive:true})
await writeFile(resolve(directory,'f1-course-times.json'),JSON.stringify(report,null,2)+'\n')
await writeFile(resolve(directory,'f1-course-times-before.json'),JSON.stringify(before,null,2)+'\n')
const seconds=value=>value===null?'unavailable':value.toFixed(3)
const markdown=`# F1 all 49 course actual-lap audit\n\n${report.conditions}\n\nCalibration seed 0; independent seeds 1 and 2. Times are seconds. Before runtime: ${before.sourceBaseline}. SIM contact coefficients are not measured friction. No F1 reference means an estimate, not an accuracy claim.\n\n${JSON.stringify(summary,null,2)}\n\n| Course | Target status | Target | Before seed 0 | After three-seed median | Residual |\n| --- | --- | ---: | ---: | ---: | ---: |\n`+rows.map(row=>`| ${row.name} (${row.id}) | ${row.referenceStatus} | ${seconds(row.targetSeconds)} | ${seconds(row.beforeSeconds)} | ${seconds(row.liveMedianSeconds)} | ${seconds(row.liveReferenceResidualSeconds)} |`).join('\n')+'\n'
await writeFile(resolve(directory,'F1_COURSE_TIMES.md'),markdown)
console.log(JSON.stringify(summary,null,2))
