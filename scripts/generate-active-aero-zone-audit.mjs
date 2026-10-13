import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const repoRoot = resolve(import.meta.dirname, '..')
const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  root: repoRoot,
  server: { middlewareMode: true },
})

const EXPECTED_JAPANESE_TRACK_IDS = [
  'motegi-sf',
  'autopolis-sf',
  'fuji-sf',
  'sugo-sf',
]
const MAXIMUM_ESTIMATED_LATERAL_LOAD_G = 0.85
const MINIMUM_USABLE_ZONE_METERS = 300
const REQUIRED_TRANSITION_SECONDS = 0.4

const failure = (failures, condition, id) => {
  if (!condition) failures.push(id)
}

try {
  const { tracks } = await server.ssrLoadModule('/src/data/tracks.ts')
  const { supportSeriesTracks } = await server.ssrLoadModule(
    '/src/data/supportSeriesTracks.ts',
  )
  const { officialTrackOperations2026 } = await server.ssrLoadModule(
    '/src/data/officialTrackOperations2026.ts',
  )
  const { isGeometryDerivedAeroActivationZone, aeroZoneLengthMeters } = await server.ssrLoadModule(
    '/src/data/aeroZoneGeometry.ts',
  )

  const invariantFailures = []
  const lengthsFor = (track) => (track.aeroActivationZones ?? []).map((zone, index, zones) => {
    const span = (zone.end - zone.start + 1) % 1
    const normalMeters = aeroZoneLengthMeters(track.centerline, track.lengthKm * 1000, zone.start, zone.end)
    const lowGripMeters = zone.lowGripMode === 'disabled' ? null : aeroZoneLengthMeters(track.centerline, track.lengthKm * 1000, zone.lowGripStart ?? zone.start, zone.end)
    const id = `${track.id}:zone-${index + 1}`
    failure(invariantFailures, Number.isFinite(normalMeters) && normalMeters > 0 && span > 0 && span < 0.5, `${id}:physical-length`)
    failure(invariantFailures, lowGripMeters === null || (lowGripMeters > 0 && lowGripMeters <= normalMeters + 0.1), `${id}:low-grip-length`)
    failure(invariantFailures, zones.every((other, i) => i === index || ((other.start - zone.start + 1) % 1) >= span), `${id}:overlap`)
    if (zone.basis) failure(invariantFailures, Math.abs(normalMeters - zone.basis.usableZoneMeters) < 1, `${id}:basis-length`)
    return { label: zone.label, normalMeters: Math.round(normalMeters), lowGripMeters: lowGripMeters === null ? null : Math.round(lowGripMeters),
      projectedEndTurn: officialTrackOperations2026[track.id]?.straightMode[index]?.brakingTurn ?? null }
  })
  const f1Tracks = tracks.map((track) => {
    const official = officialTrackOperations2026[track.id]
    const zones = track.aeroActivationZones ?? []
    const detectionLines = track.overtakeControlLines ?? []
    failure(invariantFailures, detectionLines.length > 0, `${track.id}:missing-detection`)
    failure(invariantFailures, detectionLines.every(line =>
      Number.isFinite(line.detectionProgress) && line.detectionProgress >= 0 && line.detectionProgress < 1 &&
      Number.isFinite(line.activationProgress) && line.activationProgress >= 0 && line.activationProgress < 1 &&
      line.detectionProgress !== line.activationProgress), `${track.id}:detection-geometry`)
    const estimatedZones = zones.filter(isGeometryDerivedAeroActivationZone)
    const sourceClassification = official
      ? 'official-map'
      : estimatedZones.length > 0
        ? 'geometry-derived-estimate'
        : 'unavailable'

    if (official) {
      failure(
        invariantFailures,
        zones.length === official.straightMode.length,
        `${track.id}:official-zone-count`,
      )
      failure(
        invariantFailures,
        zones.every((zone) => zone.source === 'official'),
        `${track.id}:official-source-precedence`,
      )
      failure(
        invariantFailures,
        estimatedZones.length === 0,
        `${track.id}:official-estimate-leak`,
      )
      failure(
        invariantFailures,
        track.activeAeroUnavailable === (official.straightMode.length === 0),
        `${track.id}:official-unavailable-state`,
      )
    } else {
      failure(
        invariantFailures,
        zones.every((zone) => zone.source === 'geometry-derived-estimate'),
        `${track.id}:estimated-source`,
      )
    }

    return {
      activeAeroUnavailable: track.activeAeroUnavailable ?? false,
      sourceClassification,
      sourceUrl: official?.sourceUrl ?? null,
      detectionLines,
      lengths: lengthsFor(track),
      trackId: track.id,
      zoneCount: zones.length,
      zones,
    }
  })

  failure(
    invariantFailures,
    Object.keys(officialTrackOperations2026).every((trackId) =>
      tracks.some((track) => track.id === trackId),
    ),
    'official-map-track-coverage',
  )

  const japaneseTracks = EXPECTED_JAPANESE_TRACK_IDS.map((trackId) => {
    const track = supportSeriesTracks.find((candidate) => candidate.id === trackId)
    const zones = track?.aeroActivationZones ?? []

    failure(invariantFailures, Boolean(track), `${trackId}:missing-track`)
    failure(invariantFailures, zones.length > 0, `${trackId}:missing-zone`)

    const auditedZones = zones.map((zone, index) => {
      const richZone = isGeometryDerivedAeroActivationZone(zone) ? zone : null
      const zoneId = `${trackId}:zone-${index + 1}`

      failure(
        invariantFailures,
        zone.source === 'geometry-derived-estimate' && richZone !== null,
        `${zoneId}:provenance`,
      )
      failure(
        invariantFailures,
        richZone?.runtimeScope === 'f1-free-mode',
        `${zoneId}:runtime-scope`,
      )
      failure(
        invariantFailures,
        richZone?.basis.physicalScaleAvailable === true,
        `${zoneId}:physical-scale`,
      )
      failure(
        invariantFailures,
        Number.isFinite(richZone?.basis.maximumEstimatedLateralLoadG) &&
          richZone.basis.maximumEstimatedLateralLoadG <=
            MAXIMUM_ESTIMATED_LATERAL_LOAD_G,
        `${zoneId}:lateral-load-screen`,
      )
      failure(
        invariantFailures,
        Number.isFinite(richZone?.basis.peakCurvatureRadPerMeter) &&
          richZone.basis.peakCurvatureRadPerMeter >= 0,
        `${zoneId}:curvature-screen`,
      )
      failure(
        invariantFailures,
        richZone?.basis.usableZoneMeters >= MINIMUM_USABLE_ZONE_METERS,
        `${zoneId}:usable-length`,
      )
      failure(
        invariantFailures,
        richZone?.basis.transitionSeconds === REQUIRED_TRANSITION_SECONDS &&
          richZone.basis.transitionMarginMeters > 0,
        `${zoneId}:transition-margin`,
      )
      failure(
        invariantFailures,
        Number.isFinite(richZone?.basis.precedingCornerExitProgress) &&
          Number.isFinite(richZone?.basis.nextBrakingPointProgress),
        `${zoneId}:operational-boundaries`,
      )

      return richZone ?? zone
    })

    return {
      lengths: track ? lengthsFor(track) : [],
      lengthKm: track?.lengthKm ?? null,
      trackId,
      zoneCount: zones.length,
      zones: auditedZones,
    }
  })

  const { crossCategoryCoursePacks } = await server.ssrLoadModule('/src/freeMode/crossCategoryTracks.ts')
  const { freeModeEstimatedAeroZones } = await server.ssrLoadModule('/src/freeMode/freeModeRegistry.ts')
  const alreadyAudited = new Set([...tracks, ...supportSeriesTracks].map(track => track.id))
  const expansionTracks = []
  for (const { track } of crossCategoryCoursePacks) {
    if (alreadyAudited.has(track.id)) continue
    alreadyAudited.add(track.id)
    const runtimeTrack = { ...track, aeroActivationZones: freeModeEstimatedAeroZones(track) }
    expansionTracks.push({ trackId: track.id, zoneCount: runtimeTrack.aeroActivationZones.length,
      lengths: lengthsFor(runtimeTrack), zones: runtimeTrack.aeroActivationZones,
      sourceClassification: 'geometry-derived-estimate' })
  }
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    sourceCutoffDate: '2026-10-13',
    command: 'npm run validate:active-aero-zones',
    verdict: invariantFailures.length === 0 ? 'PASS' : 'FAIL',
    calibrationPolicy: {
      fitPerformed: false,
      trackSpecificMultiplierCount: 0,
    },
    policy: {
      estimatedZonesAreNotOfficial: true,
      officialMarkersUseProjectedCornerReferences: true,
      zoneBrakingEndpointsAreDerived: true,
      maximumEstimatedLateralLoadG: MAXIMUM_ESTIMATED_LATERAL_LOAD_G,
      minimumUsableZoneMeters: MINIMUM_USABLE_ZONE_METERS,
      requiredTransitionSeconds: REQUIRED_TRANSITION_SECONDS,
      transitionSpeedKphIsScreeningOnly: true,
    },
    expansionPhysicalTracksForF1FreeMode: expansionTracks,
    officialF1Tracks: f1Tracks,
    japanesePhysicalTracksForF1FreeMode: japaneseTracks,
    summary: {
      totalPhysicalTrackCount: f1Tracks.length + japaneseTracks.length + expansionTracks.length,
      expansionTrackCount: expansionTracks.length,
      f1TrackCount: f1Tracks.length,
      geometryEstimatedF1TrackCount: f1Tracks.filter(
        (track) => track.sourceClassification === 'geometry-derived-estimate',
      ).length,
      officialF1TrackCount: f1Tracks.filter(
        (track) => track.sourceClassification === 'official-map',
      ).length,
      officialUnavailableF1TrackCount: f1Tracks.filter(
        (track) =>
          track.sourceClassification === 'official-map' &&
          track.activeAeroUnavailable,
      ).length,
      japaneseTrackCount: japaneseTracks.length,
      japaneseZoneCount: japaneseTracks.reduce(
        (count, track) => count + track.zoneCount,
        0,
      ),
    },
    invariantFailures,
  }

  mkdirSync(join(repoRoot, 'artifacts'), { recursive: true })
  writeFileSync(
    join(repoRoot, 'artifacts/active-aero-zone-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  const rows = [...f1Tracks, ...japaneseTracks, ...expansionTracks].flatMap(track => track.lengths.length
    ? track.lengths.map(zone => `| ${track.trackId} | ${zone.label} | ${zone.normalMeters} | ${zone.lowGripMeters ?? 'disabled'} | ${zone.projectedEndTurn ?? 'geometry'} |`)
    : [`| ${track.trackId} | unavailable | - | - | - |`])
  writeFileSync(join(repoRoot, 'artifacts/active-aero-zone-lengths.md'),
    '# Straight Mode physical length review - 2026-10-13\n\nLengths follow the centerline scaled to published lap distance. FIA maps supply starts; turn entry/end projections remain SIM estimates. Expansion courses are geometry estimates; unavailable means no safe run met the screening criteria.\n\n| Course | Zone | Normal (m) | Low Grip (m) | Projected end turn |\n| --- | --- | ---: | ---: | --- |\n' + rows.join('\n') + '\n')
  console.log(
    JSON.stringify(
      {
        invariantFailures,
        summary: report.summary,
        verdict: report.verdict,
      },
      null,
      2,
    ),
  )

  if (process.argv.includes('--enforce') && invariantFailures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await server.close()
}
