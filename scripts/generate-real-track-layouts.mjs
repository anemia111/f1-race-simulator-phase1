import { writeFile } from 'node:fs/promises'

const OPENF1_MEETINGS_URL = 'https://api.openf1.org/v1/meetings?year=2026'
const OUTPUT_PATH = 'src/data/realTrackLayouts.ts'
const TARGET_SPAN = 48
const SAMPLE_COUNT = 156

const trackIdByCircuitKey = new Map([
  [10, 'albert-park-approx'],
  [49, 'shanghai-approx'],
  [46, 'suzuka-approx'],
  [63, 'bahrain-approx'],
  [149, 'jeddah-approx'],
  [151, 'miami-approx'],
  [23, 'montreal-approx'],
  [22, 'monaco-approx'],
  [15, 'barcelona-approx'],
  [19, 'red-bull-ring-approx'],
  [2, 'silverstone-approx'],
  [7, 'spa-approx'],
  [4, 'hungaroring-approx'],
  [55, 'zandvoort-approx'],
  [39, 'monza-approx'],
  [153, 'madrid-approx'],
  [144, 'baku-approx'],
  [61, 'singapore-approx'],
  [9, 'cota-approx'],
  [65, 'mexico-city-approx'],
  [14, 'interlagos-approx'],
  [152, 'las-vegas-approx'],
  [150, 'lusail-approx'],
  [70, 'yas-marina-approx'],
])

const streetTrackIds = new Set([
  'albert-park-approx',
  'baku-approx',
  'jeddah-approx',
  'las-vegas-approx',
  'madrid-approx',
  'monaco-approx',
  'singapore-approx',
])

const hybridTrackIds = new Set([
  'miami-approx',
  'montreal-approx',
])

function trackWidthFor(trackId) {
  if (trackId === 'monaco-approx') {
    return 2.2
  }

  if (streetTrackIds.has(trackId)) {
    return 2.45
  }

  if (hybridTrackIds.has(trackId)) {
    return 2.65
  }

  return 2.85
}

async function fetchJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }

  return response.json()
}

function distance(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]

  return Math.hypot(dx, dy)
}

function rotatePoint([x, y], degrees) {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return [x * cos - y * sin, x * sin + y * cos]
}

function resampleClosedPath(points, sampleCount) {
  const source = points.slice()

  if (distance(source[0], source[source.length - 1]) > 0.001) {
    source.push(source[0])
  }

  const cumulative = [0]

  for (let index = 1; index < source.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(source[index - 1], source[index]))
  }

  const total = cumulative[cumulative.length - 1]
  const samples = []
  let segment = 1

  for (let index = 0; index < sampleCount; index += 1) {
    const target = (index / sampleCount) * total

    while (segment < cumulative.length - 1 && cumulative[segment] < target) {
      segment += 1
    }

    const previousDistance = cumulative[segment - 1]
    const nextDistance = cumulative[segment]
    const local =
      nextDistance === previousDistance
        ? 0
        : (target - previousDistance) / (nextDistance - previousDistance)
    const previous = source[segment - 1]
    const next = source[segment]

    samples.push([
      previous[0] + (next[0] - previous[0]) * local,
      previous[1] + (next[1] - previous[1]) * local,
    ])
  }

  return samples
}

function normalizeCircuit(circuit) {
  const rawPoints = circuit.x.map((x, index) =>
    rotatePoint([Number(x), Number(circuit.y[index])], Number(circuit.rotation ?? 0)),
  )
  const sampled = resampleClosedPath(rawPoints, SAMPLE_COUNT)
  const xs = sampled.map((point) => point[0])
  const ys = sampled.map((point) => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const scale = TARGET_SPAN / Math.max(maxX - minX, maxY - minY)
  const transform = (point) => {
    const rotated = rotatePoint(
      [Number(point.x), Number(point.y)],
      Number(circuit.rotation ?? 0),
    )

    return [
      Number(((rotated[0] - centerX) * scale).toFixed(2)),
      0,
      Number((-(rotated[1] - centerY) * scale).toFixed(2)),
    ]
  }

  return {
    centerline: sampled.map((point) => [
      Number(((point[0] - centerX) * scale).toFixed(2)),
      0,
      Number((-(point[1] - centerY) * scale).toFixed(2)),
    ]),
    transform,
    // Raw OpenF1 location samples share the circuit_info coordinate frame, so
    // storing this normalization lets the app project them onto the layout.
    projection: {
      rotationDeg: Number(circuit.rotation ?? 0),
      centerX: Number(centerX.toFixed(4)),
      centerY: Number(centerY.toFixed(4)),
      scale: Number(scale.toPrecision(10)),
    },
  }
}

function sectorMarksFor(circuit) {
  const indexes = Array.isArray(circuit.miniSectorsIndexes)
    ? circuit.miniSectorsIndexes.map(Number).filter(Number.isFinite)
    : []

  if (indexes.length < 3 || !Array.isArray(circuit.x) || circuit.x.length === 0) {
    return [0, 0.333, 0.666]
  }

  const firstBoundary = indexes[Math.floor(indexes.length / 3)]
  const secondBoundary = indexes[Math.floor((indexes.length * 2) / 3)]
  const denominator = Math.max(1, circuit.x.length - 1)
  const clampMark = (value) => Math.min(0.95, Math.max(0.05, value / denominator))

  return [
    0,
    Number(clampMark(firstBoundary).toFixed(3)),
    Number(clampMark(secondBoundary).toFixed(3)),
  ]
}

function pointsLiteral(points) {
  return `[\n${points
    .map((point) => `      [${point[0]}, ${point[1]}, ${point[2]}],`)
    .join('\n')}\n    ]`
}

function markersFor(circuit, key, transform, limit) {
  const markers = Array.isArray(circuit[key]) ? circuit[key] : []

  return markers
    .filter((marker) => marker?.trackPosition)
    .map((marker) => ({
      number: Number(marker.number),
      position: transform(marker.trackPosition),
    }))
    .filter((marker) => Number.isFinite(marker.number))
    .slice(0, limit)
}

function cornersLiteral(corners) {
  return `[\n${corners
    .map(
      (corner) =>
        `      { number: ${corner.number}, position: [${corner.position[0]}, ${corner.position[1]}, ${corner.position[2]}] },`,
    )
    .join('\n')}\n    ]`
}

function layoutLiteral(trackId, meeting, circuit) {
  const normalized = normalizeCircuit(circuit)
  const corners = markersFor(circuit, 'corners', normalized.transform, 32)
  const marshalSource =
    Array.isArray(circuit.marshalSectors) && circuit.marshalSectors.length > 0
      ? 'marshalSectors'
      : 'marshalLights'
  const marshalPosts = markersFor(circuit, marshalSource, normalized.transform, 22).map(
    (marker) => marker.position,
  )

  return `  ${JSON.stringify(trackId)}: {
    centerline: ${pointsLiteral(normalized.centerline)} as Array<[number, number, number]>,
    sectorMarks: ${JSON.stringify(sectorMarksFor(circuit))} as [number, number, number],
    width: ${trackWidthFor(trackId)},
    projection: ${JSON.stringify(normalized.projection)},
    corners: ${cornersLiteral(corners)} as Array<{ number: number; position: [number, number, number] }>,
    marshalPosts: ${pointsLiteral(marshalPosts)} as Array<[number, number, number]>,
    source: {
      circuitKey: ${meeting.circuit_key},
      circuitName: ${JSON.stringify(circuit.circuitName ?? meeting.circuit_short_name)},
      url: ${JSON.stringify(meeting.circuit_info_url)},
      year: ${Number(circuit.year ?? meeting.year)},
    },
  }`
}

const meetings = (await fetchJson(OPENF1_MEETINGS_URL))
  .filter((meeting) => !meeting.meeting_name.toLowerCase().includes('testing'))
  .sort((a, b) => a.date_start.localeCompare(b.date_start))

const layouts = []
const skipped = []

for (const meeting of meetings) {
  const trackId = trackIdByCircuitKey.get(Number(meeting.circuit_key))

  if (!trackId || !meeting.circuit_info_url) {
    continue
  }

  let circuit

  try {
    circuit = await fetchJson(meeting.circuit_info_url)
  } catch (error) {
    skipped.push(`${trackId}: ${error instanceof Error ? error.message : 'request failed'}`)
    continue
  }

  if (!Array.isArray(circuit.x) || !Array.isArray(circuit.y)) {
    throw new Error(`Circuit ${meeting.circuit_short_name} has no x/y layout data`)
  }

  layouts.push(layoutLiteral(trackId, meeting, circuit))
}

const file = `// Generated by scripts/generate-real-track-layouts.mjs from OpenF1 circuit_info_url data.
// Do not edit point arrays by hand; adjust the generator and rerun npm run generate:tracks.

export type RealTrackLayout = {
  centerline: Array<[number, number, number]>
  sectorMarks: [number, number, number]
  width: number
  /**
   * Normalization applied to raw circuit_info coordinates. OpenF1 location
   * samples arrive in that same raw frame, so this maps them into the scene:
   * rotate by rotationDeg, then localX=(x-centerX)*scale, localZ=-(y-centerY)*scale.
   */
  projection: {
    rotationDeg: number
    centerX: number
    centerY: number
    scale: number
  }
  corners: Array<{ number: number; position: [number, number, number] }>
  marshalPosts: Array<[number, number, number]>
  source: {
    circuitKey: number
    circuitName: string
    url: string
    year: number
  }
}

export const realTrackLayouts: Partial<Record<string, RealTrackLayout>> = {
${layouts.join(',\n')}
}
`

await writeFile(OUTPUT_PATH, file)
console.log(`Generated ${layouts.length} real track layouts in ${OUTPUT_PATH}`)

if (skipped.length > 0) {
  console.warn(`Skipped ${skipped.length} layouts:\n${skipped.join('\n')}`)
}
