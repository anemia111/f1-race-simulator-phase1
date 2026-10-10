import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const destination = resolve(process.argv[2] || 'artifacts/motorsport/calibration.json')
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { createMotorsportConfig, motorsportEvents } = await server.ssrLoadModule('/src/motorsport/packages.ts')
  const { createMotorsportRace, advanceMotorsportRace } = await server.ssrLoadModule('/src/motorsport/race.ts')
  const official = JSON.parse(await readFile(resolve(root, 'src/data/indyEventEntries2026.json'), 'utf8'))
  const reports = []
  const time = text => { const parts = text.split(':').map(Number); return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] }
  for (const event of motorsportEvents('indycar')) {
    const original = createMotorsportConfig('indycar', event.id)
    const config = { ...original, entries: original.entries.slice(0, 1), format: { kind: 'laps', laps: 4, basis: 'SIM clean-air calibration run' } }
    let state = createMotorsportRace(config), maximumSpeedKph = 0
    const started = performance.now()
    for (let ticks = 0; state.phase !== 'finished' && ticks < 200000; ticks += 10) {
      state = advanceMotorsportRace(state, 10, config)
      maximumSpeedKph = Math.max(maximumSpeedKph, state.cars[0].speedMps * 3.6)
    }
    const source = official.events.find(item => item.round === event.round)
    const measured = source.entries.map(entry => time(entry.bestLapTime)).filter(value => Number.isFinite(value) && value > 0)
    const reference = measured.length ? Math.min(...measured) : null
    const simulated = state.cars[0].bestLapSeconds
    reports.push({ event: event.id, course: config.course.id, kind: config.course.kind, finished: state.phase === 'finished', simulatedBestLapSeconds: simulated, officialRaceBestLapSeconds: reference, deviationPercent: reference && simulated ? (simulated / reference - 1) * 100 : null, maximumSpeedKph, wallSeconds: (performance.now() - started) / 1000, sourceUrl: source.sourceUrl })
  }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, JSON.stringify({ verifiedOn: '2026-10-07', method: 'Four-lap clean-air SIM vs published race best laps. These are different operating conditions, not exact reproduction targets. No per-circuit pace multiplier is applied.', reports }, null, 2) + '\n')
  console.log(JSON.stringify({ destination, reports }, null, 2))
  if (reports.some(report => !report.finished)) process.exitCode = 1
} finally { await server.close() }
