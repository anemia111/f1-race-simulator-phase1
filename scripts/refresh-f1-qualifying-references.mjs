// Manually checked official classification snapshot, 2026-10-11.
// Race distributions need separate all-lap evidence and are not updated here.
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const path = new URL('src/data/calibration/f1PaceCalibration2026.json', root)
const manifestPath = new URL('src/data/calibration/paceCalibrationManifest.json', root)
const records = JSON.parse(await readFile(path, 'utf8'))
const retrievedAt = '2026-10-11T03:55:00.000Z'
const updates = [
  ['zandvoort-approx', '1292/netherlands', [71.163, 71.265, 71.296, 71.305, 71.494]],
  ['monza-approx', '1293/italy', [81.786, 81.846, 81.966, 82.004, 82.011]],
  ['madrid-approx', '1294/spain', [91.824, 91.835, 91.964, 92.013, 92.019]],
  ['baku-approx', '1295/azerbaijan', [102.526, 103.363, 103.364, 103.5, 103.672]],
  ['singapore-approx', '1296/singapore', [91.373, 91.427, 91.496, 91.562, 91.712]],
]
for (const record of records) {
  // Old controller-scale measurements are not evidence for today's forces.
  delete record.simulation.validation
  record.simulation.calibrationSeedCount = 0
  const update = updates.find(([trackId]) => trackId === record.trackId)
  if (!update) continue
  const [, eventPath, seconds] = update
  record.calibrationVersion = '2026.10.11.1'
  record.qualifying = {
    poleSeconds: seconds[0], top3MedianSeconds: seconds[1], top5MedianSeconds: seconds[2],
    theoreticalBestSeconds: null, selectedReferenceSeconds: seconds[1],
    selectedMethod: 'Median of the fastest three official Q3 result times',
    fieldP10DeltaSeconds: null, fieldMedianDeltaSeconds: null, fieldP90DeltaSeconds: null,
    validLapCount: 0, deletedOrInvalidRate: null, status: 'official', confidence: 0.96,
  }
  record.sources = record.sources.filter(source => source.label !== 'Official 2026 qualifying classification (October snapshot)')
  record.sources.push({ provider: 'Formula 1', label: 'Official 2026 qualifying classification (October snapshot)',
    url: `https://www.formula1.com/en/results/2026/races/${eventPath}/qualifying`, retrievedAt })
  record.notes = [...record.notes.filter(note => !note.startsWith('Qualifying forecast uses') && !note.startsWith('Qualifying classification refreshed')),
    'Qualifying classification refreshed on 2026-10-11. Race distributions retain their separately dated evidence; result-table lap counts are not classified clean-lap sample counts.']
}
await writeFile(path, JSON.stringify(records, null, 2) + '\n')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.calibrationVersion = '2026.10.11.1'
manifest.generatedAt = retrievedAt
manifest.series.find(series => series.id === 'f1-custom').latestObservedEventDate = '2026-10-11'
manifest.generator = 'scripts/update-pace-calibration.mjs + scripts/refresh-f1-qualifying-references.mjs'
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Refreshed ${updates.length} official qualifying references; retired stale controller measurements.`)
