import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const repoRoot = resolve(import.meta.dirname, '..')
const enforce = process.argv.includes('--enforce')
const noReport = process.argv.includes('--no-report')
const outputDirectory = join(repoRoot, 'artifacts', 'sf-ots-validation')

const fullyProvenancedEventPack = Object.freeze({
  activationConditions:
    'The event bulletin defines the OTS activation conditions for this event.',
  allocationSeconds: 95,
  boostPowerKw: 20,
  cooldownSeconds: 45,
  kind: 'super-formula-ots-event-pack',
  provenance: Object.freeze({
    authority: 'official-notice',
    checksum: 'sf-ots-validation-event-notice-sha256',
    documentId: '2026-sf-ots-validation-event-notice',
    publishedAt: '2026-08-11',
    url: 'https://example.invalid/sf-ots-validation-event-notice',
  }),
  schemaVersion: 1,
  seriesId: 'super-formula',
})

/**
 * This preserves plausible numeric values while making the document invalid.
 * The gate therefore proves that a malformed event pack cannot silently retain
 * an allocation, boost, or cooldown through a historic/default fallback.
 */
const malformedEventPack = Object.freeze({
  ...fullyProvenancedEventPack,
  provenance: Object.freeze({
    ...fullyProvenancedEventPack.provenance,
    checksum: '',
  }),
})

function summarizeOts(ots) {
  return {
    activationConditions: ots.activationConditions,
    active: ots.active,
    allocationSeconds: ots.allocationSeconds,
    availability: ots.availability,
    boostPowerKw: ots.boostPowerKw,
    cooldownSeconds: ots.cooldownSeconds,
    eventPackStatus: ots.eventPackStatus,
    provenance: ots.provenance,
    runtimeEligibility: ots.runtimeEligibility,
  }
}

function isUnavailable(ots, eventPackStatus) {
  return (
    ots.activationConditions === null &&
    ots.active === false &&
    ots.allocationSeconds === null &&
    ots.availability === 'unavailable' &&
    ots.boostPowerKw === null &&
    ots.cooldownSeconds === null &&
    ots.eventPackStatus === eventPackStatus &&
    ots.runtimeEligibility?.canActivate === false &&
    ots.runtimeEligibility?.status === 'unavailable'
  )
}

function isAcceptedButInactive(ots) {
  return (
    ots.activationConditions === fullyProvenancedEventPack.activationConditions &&
    ots.active === false &&
    ots.allocationSeconds === fullyProvenancedEventPack.allocationSeconds &&
    ots.availability === 'verified-event-rule' &&
    ots.boostPowerKw === fullyProvenancedEventPack.boostPowerKw &&
    ots.cooldownSeconds === fullyProvenancedEventPack.cooldownSeconds &&
    ots.eventPackStatus === 'accepted' &&
    ots.provenance?.authority === fullyProvenancedEventPack.provenance.authority &&
    ots.provenance?.checksum === fullyProvenancedEventPack.provenance.checksum &&
    ots.provenance?.documentId === fullyProvenancedEventPack.provenance.documentId &&
    ots.provenance?.publishedAt === fullyProvenancedEventPack.provenance.publishedAt &&
    ots.provenance?.url === fullyProvenancedEventPack.provenance.url &&
    ots.runtimeEligibility?.canActivate === false &&
    ots.runtimeEligibility?.status === 'requires-event-condition-evaluation'
  )
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  root: repoRoot,
  server: { middlewareMode: true },
})

try {
  const operational = await server.ssrLoadModule(
    '/src/simulation/superFormulaOperational.ts',
  )
  const runtimeSystems = await server.ssrLoadModule(
    '/src/simulation/runtimeSystems.ts',
  )

  function exerciseScenario({ id, eventOtsPack }) {
    const request = eventOtsPack === undefined ? {} : { eventOtsPack }
    const runtimeOptions = {
      entrantId: `sf-ots-validation-${id}`,
      ...(eventOtsPack === undefined ? {} : { eventOtsPack }),
    }

    return {
      id,
      resolver: summarizeOts(
        operational.resolveSuperFormulaOperational(request).ots,
      ),
      runtime: summarizeOts(
        runtimeSystems.createSuperFormulaRuntimeSystems(runtimeOptions).ots,
      ),
    }
  }

  function runScenarios() {
    return [
      exerciseScenario({ id: 'no-event-pack' }),
      exerciseScenario({ id: 'malformed-event-pack', eventOtsPack: malformedEventPack }),
      exerciseScenario({
        id: 'fully-provenanced-pack-without-condition-evaluator',
        eventOtsPack: fullyProvenancedEventPack,
      }),
    ]
  }

  const scenarios = runScenarios()
  const repeatedScenarios = runScenarios()
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  const invariantFailures = []
  const requireInvariant = (condition, id) => {
    if (!condition) invariantFailures.push(id)
  }

  const noEventPack = scenarioById.get('no-event-pack')
  const malformedPack = scenarioById.get('malformed-event-pack')
  const acceptedPack = scenarioById.get(
    'fully-provenanced-pack-without-condition-evaluator',
  )

  requireInvariant(
    noEventPack !== undefined && isUnavailable(noEventPack.resolver, 'missing'),
    'no-event-pack-resolver-fails-closed',
  )
  requireInvariant(
    noEventPack !== undefined && isUnavailable(noEventPack.runtime, 'missing'),
    'no-event-pack-runtime-fails-closed',
  )
  requireInvariant(
    malformedPack !== undefined &&
      isUnavailable(malformedPack.resolver, 'invalid'),
    'malformed-event-pack-resolver-fails-closed',
  )
  requireInvariant(
    malformedPack !== undefined &&
      isUnavailable(malformedPack.runtime, 'invalid'),
    'malformed-event-pack-runtime-fails-closed',
  )
  requireInvariant(
    acceptedPack !== undefined && isAcceptedButInactive(acceptedPack.resolver),
    'provenanced-event-pack-resolver-accepted-but-inactive',
  )
  requireInvariant(
    acceptedPack !== undefined && isAcceptedButInactive(acceptedPack.runtime),
    'provenanced-event-pack-runtime-accepted-but-inactive',
  )

  const scenarioTrace = JSON.stringify(scenarios)
  const repeatedScenarioTrace = JSON.stringify(repeatedScenarios)
  requireInvariant(
    scenarioTrace === repeatedScenarioTrace,
    'fixed-input-runtime-determinism',
  )

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    sourceCutoffDate: '2026-08-08',
    command: 'npm run validate:sf-ots',
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    scope: [
      'src/simulation/superFormulaOperational.ts',
      'src/simulation/runtimeSystems.ts',
    ],
    policy: {
      eventConditionEvaluatorSupplied: false,
      verifiedEventPackMayExposeValues: true,
      verifiedEventPackMayActivateWithoutEvaluator: false,
      missingOrMalformedPackUsesNumericFallback: false,
    },
    deterministicTrace: {
      repeatedFixedInputOutputIdentical: scenarioTrace === repeatedScenarioTrace,
      sha256: createHash('sha256').update(scenarioTrace).digest('hex'),
    },
    scenarios,
    invariantFailures,
  }

  if (!noReport) {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(
      join(outputDirectory, 'summary.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }

  console.log(
    JSON.stringify(
      {
        artifact: noReport ? null : 'artifacts/sf-ots-validation/summary.json',
        invariantFailures,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  )

  if (enforce && invariantFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await server.close()
}
