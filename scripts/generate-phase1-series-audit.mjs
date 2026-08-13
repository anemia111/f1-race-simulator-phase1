import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const baselineAudit = JSON.parse(
  readFileSync(join(root, 'artifacts/series-scope-baseline.json'), 'utf8'),
)
const baselineCommit = baselineAudit.sourceCommit
const baselineSeriesData = JSON.parse(
  execFileSync(
    'git',
    ['show', `${baselineCommit}:src/data/motorsportSeries2026.json`],
    { cwd: root, encoding: 'utf8' },
  ),
)
const seriesData = JSON.parse(
  readFileSync(join(root, 'src/data/motorsportSeries2026.json'), 'utf8'),
)
const historicalDocument = JSON.parse(
  readFileSync(join(root, 'src/data/historicalDriverPool2026.json'), 'utf8'),
)

const flattenSeriesDrivers = (series) =>
  series.teams.flatMap((team) =>
    team.drivers.map((driver) => ({ driver, seriesId: series.id, team })),
  )

const legacyPoolSources = baselineSeriesData.series
  .filter((series) => series.id === 'f2' || series.id === 'f3')
  .flatMap(flattenSeriesDrivers)
const historicalById = new Map(
  historicalDocument.drivers.map((driver) => [driver.id, driver]),
)
const legacyIds = legacyPoolSources.map(({ driver }) => driver.id)
const historicalIds = historicalDocument.drivers.map((driver) => driver.id)
const missingIds = legacyIds.filter((id) => !historicalById.has(id))
const extraIds = historicalIds.filter((id) => !legacyIds.includes(id))
const mismatches = []

for (const { driver, seriesId, team } of legacyPoolSources) {
  const migrated = historicalById.get(driver.id)
  if (!migrated) continue
  const provenance = migrated.provenance[0]
  const career = migrated.careerHistory[0]
  const expected = {
    code: driver.code,
    name: driver.name,
    nationality: driver.nationality,
    overall: driver.overall,
    potential: driver.potential,
    sourceSeriesId: seriesId,
    sourceTeamId: team.id,
    sourceTeamName: team.name,
    sourceCarNumber: driver.number,
  }
  const actual = {
    code: migrated.code,
    name: migrated.name,
    nationality: migrated.nationality,
    overall: migrated.overall,
    potential: migrated.potential,
    sourceSeriesId: provenance?.sourceSeriesId,
    sourceTeamId: provenance?.sourceTeam?.sourceId,
    sourceTeamName: provenance?.sourceTeam?.name,
    sourceCarNumber: provenance?.sourceCarNumber,
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    mismatches.push({ actual, driverId: driver.id, expected })
  }
  if (
    career?.seriesId !== seriesId ||
    career?.sourceTeamId !== team.id ||
    career?.sourceTeamName !== team.name ||
    career?.sourceCarNumber !== driver.number
  ) {
    mismatches.push({ driverId: driver.id, field: 'careerHistory' })
  }
}

const liveSeatKeys = []
const findLiveSeatKeys = (value, path) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findLiveSeatKeys(item, `${path}[${index}]`))
    return
  }
  if (typeof value !== 'object' || value === null) return

  for (const [key, child] of Object.entries(value)) {
    if (key === 'teamId' || key === 'carNumber') {
      liveSeatKeys.push(`${path}.${key}`)
    }
    findLiveSeatKeys(child, `${path}.${key}`)
  }
}

historicalDocument.drivers.forEach((driver, index) =>
  findLiveSeatKeys(driver, `drivers[${index}]`),
)

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells
}

const csvLines = readFileSync(join(root, 'src/data/f1Performance.csv'), 'utf8')
  .split(/\r?\n/u)
const driverSectionEnd = csvLines.findIndex((line) =>
  line.startsWith('TEAM MACHINE ABILITIES'),
)
const headers = parseCsvLine(csvLines[0])
const f1Rows = csvLines
  .slice(1, driverSectionEnd)
  .filter((line) => line.trim().length > 0)
  .map((line) =>
    Object.fromEntries(
      parseCsvLine(line).map((value, index) => [headers[index], value]),
    ),
  )
const superFormula = seriesData.series.find(
  (series) => series.id === 'super-formula',
)
const superFormulaDrivers = flattenSeriesDrivers(superFormula).map(
  ({ driver }) => driver,
)
const provenanceIdentityRows = [
  ...f1Rows.map((driver) => driver['Driver ID']),
  ...historicalIds,
  ...superFormulaDrivers.map((driver) => driver.id),
  ...seriesData.reserves.map((driver) => driver.id),
]
const canonicalIdentityCount = new Set(provenanceIdentityRows).size
const provenanceCount = provenanceIdentityRows.length

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.(?:ts|tsx|json)$/u.test(name) || name.endsWith('.test.ts')) return []
    return [path]
  })
}

const allMultiplierReferences = sourceFiles(join(root, 'src')).flatMap((path) => {
  const matches = readFileSync(path, 'utf8').match(/\bbaseLapTimeMultiplier\b/gu)
  return matches
    ? [{ count: matches.length, file: relative(root, path).replaceAll('\\', '/') }]
    : []
})
const compatibilityOnlyMultiplierFiles = new Set([
  'src/data/seriesConfiguration.ts',
])
const multiplierReferences = allMultiplierReferences.filter(
  (reference) => !compatibilityOnlyMultiplierFiles.has(reference.file),
)
const compatibilityMultiplierReferences = allMultiplierReferences.filter(
  (reference) => compatibilityOnlyMultiplierFiles.has(reference.file),
)
const executableSeriesIds = seriesData.series.map((series) => series.id)
const expectedExecutableSeriesIds = ['f1-custom', 'super-formula']
const f2Count = historicalDocument.drivers.filter(
  (driver) => driver.provenance[0]?.sourceSeriesId === 'f2',
).length
const f3Count = historicalDocument.drivers.filter(
  (driver) => driver.provenance[0]?.sourceSeriesId === 'f3',
).length
const invariantFailures = [
  executableSeriesIds.join(',') !== expectedExecutableSeriesIds.join(',')
    ? 'executable-series-ids'
    : null,
  f2Count !== 22 ? 'f2-history-count' : null,
  f3Count !== 30 ? 'f3-history-count' : null,
  missingIds.length > 0 || extraIds.length > 0 ? 'historical-id-diff' : null,
  mismatches.length > 0 ? 'historical-source-mismatch' : null,
  liveSeatKeys.length > 0 ? 'historical-live-seat-key' : null,
  canonicalIdentityCount !== 110 ? 'canonical-identity-count' : null,
  provenanceCount !== 111 ? 'canonical-provenance-count' : null,
  multiplierReferences.length > 0 ? 'runtime-base-lap-multiplier' : null,
].filter(Boolean)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baselineCommit,
  verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
  executableSeries: {
    before: baselineAudit.summary.executableSeriesIds,
    after: executableSeriesIds,
  },
  driverPool: {
    identityCount: canonicalIdentityCount,
    provenanceCount,
    historicalIdentityCount: historicalDocument.drivers.length,
    f2HistoricalCount: f2Count,
    f3HistoricalCount: f3Count,
    missingIds,
    extraIds,
    sourceMismatchCount: mismatches.length,
    mismatches,
    danglingLiveSeatKeyCount: liveSeatKeys.length,
    danglingLiveSeatKeys: liveSeatKeys,
  },
  directPaceCorrectionAudit: {
    runtimeBaseLapTimeMultiplierCount: multiplierReferences.reduce(
      (count, item) => count + item.count,
      0,
    ),
    references: multiplierReferences,
    compatibilityOnlyReferences: compatibilityMultiplierReferences,
  },
  invariantFailures,
}

const artifactDirectory = join(root, 'artifacts')
mkdirSync(artifactDirectory, { recursive: true })
writeFileSync(
  join(artifactDirectory, 'driver-pool-migration.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(JSON.stringify({
  driverPool: report.driverPool,
  executableSeries: report.executableSeries.after,
  verdict: report.verdict,
}, null, 2))

if (process.argv.includes('--enforce') && invariantFailures.length > 0) {
  process.exitCode = 1
}
