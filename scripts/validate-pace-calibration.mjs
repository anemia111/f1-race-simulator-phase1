import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CALIBRATION_DIRECTORY = resolve(ROOT, 'src', 'data', 'calibration')
const paths = {
  f1: resolve(CALIBRATION_DIRECTORY, 'f1PaceCalibration2026.json'),
  sf: resolve(
    CALIBRATION_DIRECTORY,
    'superFormulaPaceCalibration2026.json',
  ),
  manifest: resolve(
    CALIBRATION_DIRECTORY,
    'paceCalibrationManifest.json',
  ),
}
const statuses = new Set([
  'official',
  'observed',
  'derived',
  'estimated',
  'unverified',
])

const fail = (message) => {
  throw new Error(`Pace calibration validation failed: ${message}`)
}

const isSeconds = (value, nullable = false) =>
  (nullable && value === null) ||
  (Number.isFinite(value) && value >= 35 && value <= 300)

const isConfidence = (value) =>
  Number.isFinite(value) && value >= 0 && value <= 1

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

function validateRecord(record, expectedSeries, eventIds) {
  if (
    record.schemaVersion !== 1 ||
    record.season !== 2026 ||
    record.series !== expectedSeries
  ) {
    fail(`${record.eventId ?? 'unknown'} has invalid identity metadata`)
  }

  const uniqueId = `${record.series}:${record.eventId}`

  if (eventIds.has(uniqueId)) {
    fail(`duplicate event ${uniqueId}`)
  }
  eventIds.add(uniqueId)

  if (
    typeof record.eventId !== 'string' ||
    typeof record.trackId !== 'string' ||
    !Number.isSafeInteger(record.round) ||
    record.round < 1 ||
    !Number.isFinite(Date.parse(record.eventDate))
  ) {
    fail(`${uniqueId} has invalid event fields`)
  }

  if (
    !isSeconds(record.qualifying.selectedReferenceSeconds) ||
    !isSeconds(record.qualifying.poleSeconds, true) ||
    !statuses.has(record.qualifying.status) ||
    !isConfidence(record.qualifying.confidence)
  ) {
    fail(`${uniqueId} has invalid qualifying calibration`)
  }

  if (
    !isSeconds(record.race.cleanLapReferenceSeconds, true) ||
    !isSeconds(record.race.winnerAverageSeconds, true) ||
    !statuses.has(record.race.status) ||
    !isConfidence(record.race.confidence) ||
    !Number.isSafeInteger(record.race.cleanLapCount) ||
    record.race.cleanLapCount < 0
  ) {
    fail(`${uniqueId} has invalid race calibration`)
  }

  if (
    !isSeconds(record.simulation.neutralBaseLapSeconds) ||
    !Number.isFinite(record.simulation.qualifyingOffsetSeconds) ||
    !Number.isFinite(
      record.simulation.expectedGreenRaceDeltaSeconds,
    ) ||
    !Number.isFinite(record.simulation.raceModelCorrectionSeconds) ||
    (record.simulation.racePaceScale !== undefined &&
      (!Number.isFinite(record.simulation.racePaceScale) ||
        record.simulation.racePaceScale < 0.8 ||
        record.simulation.racePaceScale > 1.25)) ||
    !Number.isSafeInteger(record.simulation.calibrationSeedCount) ||
    record.simulation.calibrationSeedCount < 100
  ) {
    fail(`${uniqueId} has invalid simulation calibration`)
  }

  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    fail(`${uniqueId} has no source`)
  }

  const sourceIdentities = new Set()

  for (const source of record.sources) {
    if (
      typeof source.provider !== 'string' ||
      typeof source.label !== 'string' ||
      typeof source.url !== 'string' ||
      !source.url.startsWith('https://') ||
      !Number.isFinite(Date.parse(source.retrievedAt))
    ) {
      fail(`${uniqueId} has invalid source provenance`)
    }

    const sourceIdentity = [
      source.provider,
      source.label,
      source.url,
      source.sessionKey ?? '',
    ].join('\u0000')

    if (sourceIdentities.has(sourceIdentity)) {
      fail(`${uniqueId} has duplicate source provenance`)
    }
    sourceIdentities.add(sourceIdentity)
  }

  if (
    record.qualifying.status === 'estimated' &&
    record.qualifying.poleSeconds !== null
  ) {
    fail(`${uniqueId} presents an estimated qualifying record as a pole`)
  }

  for (const [label, value, range] of [
    [
      'qualifying',
      record.qualifying.selectedReferenceSeconds,
      record.qualifying.referenceRangeSeconds,
    ],
    [
      'race',
      record.race.cleanLapReferenceSeconds,
      record.race.referenceRangeSeconds,
    ],
  ]) {
    if (
      range !== undefined &&
      (!Array.isArray(range) ||
        range.length !== 2 ||
        !isSeconds(range[0]) ||
        !isSeconds(range[1]) ||
        range[0] >= range[1] ||
        value === null ||
        value < range[0] ||
        value > range[1])
    ) {
      fail(`${uniqueId} has an invalid ${label} reference range`)
    }
  }

  if (
    record.race.status === 'observed' &&
    record.race.cleanLapCount < 30
  ) {
    fail(`${uniqueId} has insufficient observed clean race laps`)
  }

  const validation = record.simulation.validation

  if (!validation) {
    fail(`${uniqueId} has no fixed-seed validation`)
  }

  if (
    validation.qualifyingSeedCount < 100 ||
    Math.abs(validation.qualifyingReferenceErrorSeconds) > 0.3
  ) {
    fail(`${uniqueId} misses the fixed-seed qualifying acceptance`)
  }

  if (
    record.qualifying.poleSeconds !== null &&
    Math.abs(
      validation.poleMedianSeconds -
        record.qualifying.poleSeconds,
    ) >
      0.351
  ) {
    fail(`${uniqueId} misses the fixed-seed pole acceptance`)
  }

  if (
    record.qualifying.fieldMedianDeltaSeconds !== null &&
    Math.abs(
      validation.fieldMedianDeltaSeconds -
        record.qualifying.fieldMedianDeltaSeconds,
    ) > 0.6
  ) {
    fail(`${uniqueId} misses the qualifying field-spread acceptance`)
  }

  if (
    validation.raceSeedCount > 0 &&
    (validation.raceSeedCount < 100 ||
      validation.raceReferenceErrorSeconds === null ||
      Math.abs(validation.raceReferenceErrorSeconds) > 0.7)
  ) {
    fail(`${uniqueId} misses the fixed-seed race acceptance`)
  }
}

async function main() {
  const [f1, sf, manifest] = await Promise.all([
    readJson(paths.f1),
    readJson(paths.sf),
    readJson(paths.manifest),
  ])

  if (!Array.isArray(f1) || !Array.isArray(sf)) {
    fail('series files must contain arrays')
  }

  const eventIds = new Set()

  for (const record of f1) {
    validateRecord(record, 'f1-custom', eventIds)
  }

  for (const record of sf) {
    validateRecord(record, 'super-formula', eventIds)
  }

  if (
    manifest.schemaVersion !== 1 ||
    manifest.season !== 2026 ||
    manifest.eventCount !== f1.length + sf.length ||
    !Number.isFinite(Date.parse(manifest.generatedAt))
  ) {
    fail('manifest does not match the series files')
  }

  const f1Ratios = f1.map(
    (record) =>
      record.simulation.neutralBaseLapSeconds /
      record.qualifying.selectedReferenceSeconds,
  )
  const uniqueRatios = new Set(
    f1Ratios.map((ratio) => ratio.toFixed(4)),
  )

  if (uniqueRatios.size < Math.ceil(f1.length * 0.6)) {
    fail('F1 neutral bases appear to use a category-wide multiplier')
  }

  if (
    f1.every(
      (record) =>
        Math.abs(
          record.simulation.neutralBaseLapSeconds -
            record.qualifying.selectedReferenceSeconds * 1.046,
        ) < 0.01,
    )
  ) {
    fail('legacy 1.046 conversion is still active')
  }

  const monaco = f1.find(
    (record) => record.trackId === 'monaco-approx',
  )

  if (
    !monaco ||
    monaco.race.cleanLapReferenceSeconds === null ||
    monaco.race.winnerAverageSeconds === null ||
    monaco.race.winnerAverageSeconds -
      monaco.race.cleanLapReferenceSeconds <
      20
  ) {
    fail('Monaco clean pace is not separated from winner average')
  }

  const f1Suzuka = f1.find(
    (record) => record.trackId === 'suzuka-approx',
  )
  const sfSuzuka = sf.find(
    (record) => record.trackId === 'suzuka-approx',
  )

  if (
    !f1Suzuka ||
    !sfSuzuka ||
    f1Suzuka.qualifying.selectedReferenceSeconds ===
      sfSuzuka.qualifying.selectedReferenceSeconds ||
    f1Suzuka.simulation.neutralBaseLapSeconds ===
      sfSuzuka.simulation.neutralBaseLapSeconds
  ) {
    fail('Suzuka F1 and SUPER FORMULA calibration is not separated')
  }

  const madrid = f1.find(
    (record) => record.trackId === 'madrid-approx',
  )

  if (
    !madrid ||
    madrid.qualifying.status !== 'estimated' ||
    madrid.qualifying.confidence >= 0.5 ||
    !Array.isArray(madrid.qualifying.referenceRangeSeconds)
  ) {
    fail('MADRING uncertainty is not represented')
  }

  const historicalForecasts = f1.filter(
    (record) =>
      record.qualifying.status === 'estimated' &&
      record.trackId !== 'madrid-approx',
  )

  if (
    historicalForecasts.length === 0 ||
    historicalForecasts.some(
      (record) =>
        !Array.isArray(record.qualifying.referenceRangeSeconds) ||
        !record.sources.some(
          (source) =>
            source.provider === 'OpenF1' &&
            source.label.includes('historical forecast input'),
        ),
    )
  ) {
    fail('future F1 rounds do not retain same-circuit historical inputs')
  }

  const autopolis = sf.find(
    (record) => record.trackId === 'autopolis-sf',
  )

  if (
    !autopolis ||
    autopolis.qualifying.status !== 'official' ||
    autopolis.qualifying.poleSeconds !== 85.866 ||
    autopolis.race.status !== 'unverified' ||
    autopolis.race.cleanLapReferenceSeconds !== null
  ) {
    fail('Autopolis qualifying or cancelled-race state is incorrect')
  }

  for (const path of Object.values(paths)) {
    const details = await stat(path)

    if (details.size > 500_000) {
      fail(`${path} is too large for the runtime bundle`)
    }
  }

  process.stdout.write(
    `Validated ${f1.length} F1 and ${sf.length} SUPER FORMULA event calibrations (${manifest.calibrationVersion}).\n`,
  )
}

await main()
