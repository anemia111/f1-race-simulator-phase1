import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const artifactsDir = join(repoRoot, 'artifacts')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim()
const generatedAt = new Date().toISOString()

const normalizePath = (value) => value.replaceAll('\\', '/')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function walk(root, extensions) {
  if (!existsSync(root)) return []
  const files = []
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry)
    const stats = statSync(absolute)
    if (stats.isDirectory()) {
      files.push(...walk(absolute, extensions))
    } else if (extensions.has(extname(entry))) {
      files.push(absolute)
    }
  }
  return files.sort((left, right) => left.localeCompare(right))
}

function scan(files, patterns) {
  const matches = []
  for (const file of files) {
    const contents = readFileSync(file, 'utf8')
    const lines = contents.split(/\r?\n/u)
    for (const [index, line] of lines.entries()) {
      for (const pattern of patterns) {
        pattern.regex.lastIndex = 0
        if (!pattern.regex.test(line)) continue
        matches.push({
          category: pattern.category,
          excerpt: line.trim().slice(0, 240),
          file: normalizePath(relative(repoRoot, file)),
          line: index + 1,
          symbol: pattern.symbol,
        })
      }
    }
  }
  return matches
}

function writeJson(name, value) {
  writeFileSync(join(artifactsDir, name), `${JSON.stringify(value, null, 2)}\n`)
}

const sourceFiles = walk(join(repoRoot, 'src'), new Set(['.ts', '.tsx', '.json']))
const scriptFiles = walk(join(repoRoot, 'scripts'), new Set(['.mjs', '.js', '.ts']))
const documentationFiles = walk(join(repoRoot, 'docs'), new Set(['.md']))
const packageFile = join(repoRoot, 'package.json')

const directPatterns = [
  {
    category: 'series-pace-multiplier',
    symbol: 'baseLapTimeMultiplier',
    regex: /\bbaseLapTimeMultiplier\b/gu,
  },
  {
    category: 'legacy-direct-seconds',
    symbol: 'raceModelCorrectionSeconds',
    regex: /\braceModelCorrectionSeconds\b/gu,
  },
  {
    category: 'track-evolution-direct-seconds',
    symbol: 'trackEvolutionGainSecondsFor',
    regex: /\btrackEvolutionGainSecondsFor\b/gu,
  },
  {
    category: 'forbidden-pace-key',
    symbol: 'paceScale-or-lapTimeMultiplier',
    regex: /\b(?:paceScale|lapTimeMultiplier)\b/gu,
  },
  {
    category: 'forbidden-ai-result-bonus',
    symbol: 'ai-direct-result-bonus',
    regex: /\b(?:attackBonusSeconds|strategyTimeGain|driverMagicGrip)\b/gu,
  },
]

const directMatches = scan([...sourceFiles, ...scriptFiles], directPatterns)
writeJson('direct-result-correction-inventory.json', {
  schemaVersion: 1,
  generatedAt,
  sourceCommit,
  scope: ['src', 'scripts'],
  note:
    'Inventory only. Each match requires classification as runtime authority, compatibility/UI usage, validator, test, or inert data before removal.',
  summary: {
    matchCount: directMatches.length,
    productionMatchCount: directMatches.filter(
      (match) => !match.file.includes('.test.') && !match.file.startsWith('scripts/'),
    ).length,
    countsByCategory: Object.fromEntries(
      directPatterns.map((pattern) => [
        pattern.category,
        directMatches.filter((match) => match.category === pattern.category).length,
      ]),
    ),
  },
  matches: directMatches,
})

const decisionPatterns = [
  {
    category: 'decision-function',
    symbol: 'decision-or-strategy-function',
    regex:
      /\b(?:export\s+)?(?:async\s+)?function\s+\w*(?:decid|Decision|strateg|Strategy|overtak|Overtak|penalt|Penalty|steward|Steward|raceControl|RaceControl|pit|Pit)\w*/gu,
  },
  {
    category: 'decision-rng',
    symbol: 'decisionRoll',
    regex: /\bdecisionRoll\b/gu,
  },
  {
    category: 'physical-intent-contract',
    symbol: 'DriverDecisionIntent',
    regex: /\bDriverDecisionIntent\b/gu,
  },
]
const productionTypeScript = sourceFiles.filter(
  (file) => !file.includes('.test.') && !file.endsWith('.json'),
)
const decisionMatches = scan(productionTypeScript, decisionPatterns)
writeJson('agent-decision-inventory.json', {
  schemaVersion: 1,
  generatedAt,
  sourceCommit,
  scope: ['src/**/*.ts', 'src/**/*.tsx'],
  summary: {
    matchCount: decisionMatches.length,
    explicitDecisionLogTypePresent: sourceFiles.some((file) =>
      readFileSync(file, 'utf8').includes('AgentDecisionLog'),
    ),
    knownDecisionModules: [
      'src/simulation/driverDecision.ts',
      'src/simulation/strategy.ts',
      'src/simulation/overtaking.ts',
      'src/simulation/neutralisation.ts',
      'src/simulation/classification.ts',
    ].filter((file) => existsSync(join(repoRoot, file))),
  },
  matches: decisionMatches,
})

const truthPatterns = [
  {
    category: 'external-nondeterminism',
    symbol: 'Math.random',
    regex: /\bMath\.random\s*\(/gu,
  },
  {
    category: 'wall-clock-access',
    symbol: 'Date.now-or-performance.now',
    regex: /\b(?:Date|performance)\.now\s*\(/gu,
  },
  {
    category: 'external-nondeterminism',
    symbol: 'crypto.randomUUID',
    regex: /\bcrypto\.randomUUID\s*\(/gu,
  },
  {
    category: 'observation-boundary-candidate',
    symbol: 'forecast',
    regex: /\b(?:weatherForecast|forecast)\b/giu,
  },
]
const truthMatches = scan(productionTypeScript, truthPatterns)
const explicitWorldTruthMatches = scan(productionTypeScript, [
  {
    category: 'explicit-world-truth',
    symbol: 'WorldTruth',
    regex: /\bWorldTruth\b/gu,
  },
])
writeJson('world-truth-access-audit.json', {
  schemaVersion: 1,
  generatedAt,
  sourceCommit,
  summary: {
    explicitWorldTruthTypePresent: explicitWorldTruthMatches.length > 0,
    explicitWorldTruthMatchCount: explicitWorldTruthMatches.length,
    boundaryCandidateCount: truthMatches.length,
    status:
      explicitWorldTruthMatches.length > 0
        ? 'explicit-boundary-requires-review'
        : 'no-explicit-world-truth-boundary',
  },
  note:
    'Absence of a WorldTruth symbol is not proof of safe observability. Every listed wall-clock, nondeterministic, and forecast access must be classified before agent migration.',
  matches: [...explicitWorldTruthMatches, ...truthMatches],
})

const legacySeriesPatterns = [
  {
    category: 'legacy-series-reference',
    symbol: 'f2-or-f3',
    regex: /(?:'f2'|'f3'|\bf2\b|\bf3\b|FIA Formula 2|FIA Formula 3)/giu,
  },
]
const legacySeriesFiles = [
  ...sourceFiles,
  ...scriptFiles,
  ...documentationFiles,
  packageFile,
]
const legacySeriesMatches = scan(legacySeriesFiles, legacySeriesPatterns)
const seriesData = JSON.parse(
  readFileSync(join(repoRoot, 'src/data/motorsportSeries2026.json'), 'utf8'),
)
const jsonSeries = seriesData.series.map((series) => ({
  id: series.id,
  calendarEventCount: series.calendar.length,
  carCount: series.carCount,
  driverCount: (series.teams ?? []).reduce(
    (total, team) => total + team.drivers.length,
    0,
  ),
  teamCount: series.teamCount,
}))
const f1Csv = readFileSync(join(repoRoot, 'src/data/f1Performance.csv'), 'utf8')
  .trim()
  .split(/\r?\n/u)
const f1CsvDriverIds = new Set(
  f1Csv.slice(1).map((row) => row.split(',')[0]).filter(Boolean),
)
writeJson('series-scope-baseline.json', {
  schemaVersion: 1,
  generatedAt,
  sourceCommit,
  requestedSearch:
    'rg -n "\'f2\'|\'f3\'|\\bf2\\b|\\bf3\\b|FIA Formula 2|FIA Formula 3" src scripts docs package.json',
  summary: {
    executableSeriesIds: jsonSeries.map((series) => series.id),
    f1CsvIdentityCount: f1CsvDriverIds.size,
    legacyReferenceMatchCount: legacySeriesMatches.length,
    legacyReferenceFileCount: new Set(legacySeriesMatches.map((match) => match.file)).size,
    registeredPoolIdentityCount: 110,
    f2PoolIdentityCount: 22,
    f3PoolIdentityCount: 30,
    poolOnlyTargetIdentityCount: 52,
  },
  series: jsonSeries,
  sourceHashes: {
    f1PerformanceCsvSha256: sha256(
      readFileSync(join(repoRoot, 'src/data/f1Performance.csv')),
    ),
    motorsportSeriesJsonSha256: sha256(
      readFileSync(join(repoRoot, 'src/data/motorsportSeries2026.json')),
    ),
  },
  matches: legacySeriesMatches,
})

console.log(
  JSON.stringify(
    {
      agentDecisionMatches: decisionMatches.length,
      directCorrectionMatches: directMatches.length,
      legacySeriesMatches: legacySeriesMatches.length,
      worldTruthBoundaryCandidates: truthMatches.length,
    },
    null,
    2,
  ),
)
