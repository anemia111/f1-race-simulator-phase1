import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import { f1CourseAuditFingerprint } from './f1-course-audit-fingerprint.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = resolve(argument('output') ?? resolve(root, 'docs/validation/f1-course-times.json'))
const candidate = argument('coefficient')
const baseline = argument('baseline')
const baselineFiles = ['physicalLap','categoryPhysics','race','telemetry','qualifying','tireCompoundPace']
const baselineSources = new Map(baseline ? baselineFiles.map(name => [`/src/simulation/${name}.ts`,execFileSync('git',['show',`${baseline}:src/simulation/${name}.ts`],{cwd:root,encoding:'utf8',windowsHide:true})]) : [])
if (baseline) baselineSources.set('/src/freeMode/crossCategoryTracks.ts',execFileSync('git',['show',`${baseline}:src/freeMode/crossCategoryTracks.ts`],{cwd:root,encoding:'utf8',windowsHide:true}))
if (candidate && (!argument('track') || !Number.isFinite(Number(candidate)))) throw new Error('A finite candidate needs one explicit track')
const server = await createServer({root, configFile: false, appType: 'custom', logLevel: 'silent', server: {middlewareMode: true},
  plugins: [{name:'offline-contact-candidate', enforce:'pre', transform(code,id){
    const oldSource = [...baselineSources].find(([path])=>id.replaceAll('\\','/').endsWith(path))?.[1]
    if (oldSource) return oldSource
    if (!candidate) return
    if(id.replaceAll('\\','/').endsWith('/simulation/f1CourseCalibration.ts')) return code.replace('const calibratedCoefficient = coefficients[track.id]', `const calibratedCoefficient = ${Number(candidate)}`)
  }}]})
try {
  const [free, registry, calibration, physical, category, race] = await Promise.all([
    server.ssrLoadModule('/src/freeMode/freeModeRegistry.ts'), server.ssrLoadModule('/src/series/seriesRegistry.ts'),
    server.ssrLoadModule('/src/simulation/f1CourseCalibration.ts'), server.ssrLoadModule('/src/simulation/physicalLap.ts'),
    server.ssrLoadModule('/src/simulation/categoryPhysics.ts'), server.ssrLoadModule('/src/simulation/race.ts'),
  ])
  const f1 = registry.seriesPackageById.get('f1-custom')
  const native = new Set(f1.tracks.map(track => track.id))
  const donor = f1.drivers.find(driver => driver.code === 'RUS') ?? f1.drivers[0]
  const driver = {...donor, id: 'calibration-driver-100', skills: Object.fromEntries(Object.keys(donor.skills).map(key => [key, 1])),
    performanceSource: {...donor.performanceSource, overall: 100, rawRatings: Object.fromEntries(Object.keys(donor.performanceSource.rawRatings).map(key => [key,100]))}}
  const donorTeam = f1.teams.find(team => team.id === donor.teamId)
  const team = {...donorTeam, machine: Object.fromEntries(Object.entries(donorTeam.machine).map(([key,value]) => [key, typeof value === 'number' ? 0.86 : value]))}
  const rows = []
  for (const option of free.freeModeTrackOptions(registry.seriesPackageById)) {
    if (argument('track') && option.id !== argument('track')) continue
    // Use the production Free Mode conversion, including foreign-course aero
    // zones. Auditing the donor track directly misses those operational inputs.
    const track = free.buildFreeModeRaceConfig({version:1, categoryId:'f1-custom',trackId:option.id,
      sessionKind:'race',gridMode:'manual',weatherMode:'clear',raceLaps:10,practiceDurationMinutes:30,
      seed:`f1-course-audit:${option.id}:0`,equalCars:true,
      entrants:[{id:'audit',driverId:donor.id,sourceTeamId:donor.teamId,carNumber:1}]},
    {seriesById:registry.seriesPackageById,driverPool:registry.driverPool2026}).track
    const fit = calibration.f1CourseCalibrationFor(track)
    const before = physical.simulatePhysicalLap(track, {physics: category.categoryPhysicsFor('f1-custom'), airTemperatureC:25})
    const row = {id: track.id, name: option.name, native: native.has(track.id), lengthKm: track.lengthKm,
      referenceStatus: fit.referenceStatus, calibrationKind: fit.kind, targetSeconds: fit.targetSeconds,
      uncalibratedSeconds: before.lapTimeSeconds, calibratedReferenceSeconds: fit.referenceSeconds,
      effectiveContactCoefficient: fit.physics.peakTyreFrictionCoefficient, referenceResidualSeconds: fit.residualSeconds, bounded: fit.bounded}
    if (!process.argv.includes('--reference-only')) {
      const config = {drivers:[driver], teams:[team], seed:`f1-course-audit:${track.id}:${argument('seed') ?? 0}`, seriesId:'f1-custom',freeMode:true,
        track:{...track,rainProbability:0},
        weekendStage:'qualifying', qualifyingDryCompound:'S', tireAllocation:f1.rules.tires.standardAllocation,
        tireSupplier:f1.rules.tireSupplier, categoryRaceFormat:f1.rules.race,
        timedSessionPlan:{segments:[{name:'Q1', startsAtSeconds:0, endsAtSeconds:900, participantDriverIds:[driver.id],
          tire:{kind:'f1-pirelli-session-tire',compound:'S'}, suspensionStartsAtSeconds:null,suspensionEndsAtSeconds:null}],totalDurationSeconds:900}}
      let snapshot = race.createInitialRace(config)
      let valid = []
      for(let elapsed=0;elapsed<900 && valid.length<2;elapsed+=3){
        snapshot=race.advanceRace(snapshot,3,config)
        valid=snapshot.cars[0].lapHistory.filter(lap=>lap.isValid && lap.segment==='Q1')
      }
      row.liveValidLaps=valid.length
      row.liveBestSeconds=valid.length ? Math.min(...valid.map(lap=>lap.lapTimeSeconds)) : null
      row.liveReferenceResidualSeconds=fit.targetSeconds!==null && row.liveBestSeconds!==null ? row.liveBestSeconds-fit.targetSeconds : null
    }
    rows.push(row)
    console.log(JSON.stringify(row))
  }
  const report={schemaVersion:1, series:'f1-custom', sourceBaseline:baseline ?? null, seed:argument('seed') ?? '0', generatedAt:new Date().toISOString(),
    sourceFingerprint: await f1CourseAuditFingerprint(root),
    conditions:'Isolated driver 100, neutral machine axes 0.86, dry Q1, fixed seed per course, first two valid timed laps. SIM setup/temperature/tyre preparation remain active. Not an official top-three classification.',
    rows}
  await mkdir(dirname(output), {recursive:true})
  await writeFile(output, JSON.stringify(report,null,2)+'\n')
  if(rows.some(row=>row.bounded || (!process.argv.includes('--reference-only') && row.liveValidLaps===0))) process.exitCode=1
} finally {await server.close()}
