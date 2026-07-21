// Builds real centerlines for the SUPER FORMULA / support-series Japanese
// circuits from OpenStreetMap `highway=raceway` geometry.
//
// OpenF1 only publishes layouts for F1 venues, so the domestic circuits used to
// carry hand-drawn placeholder vectors. OSM maps each of these courses as
// surveyed ways, which gives a real shape that can be checked against the
// published lap length before it is written out.
//
// OpenStreetMap data is © OpenStreetMap contributors, licensed under the ODbL.

import { writeFile } from 'node:fs/promises'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const OUTPUT_PATH = 'src/data/supportSeriesTrackLayouts.ts'
const USER_AGENT = 'f1-race-simulator/1.0 (support series track layout generator)'
// Matches scripts/generate-real-track-layouts.mjs so support circuits land in
// the same scene scale as the OpenF1 F1 layouts.
const TARGET_SPAN = 48
const SAMPLE_COUNT = 156
// The published lap length and the surveyed OSM centerline are measured
// differently, so allow a small deviation before treating a chain as wrong.
const LENGTH_TOLERANCE = 0.04
/**
 * How far along the pit straight the start line sits.
 *
 * Calibrated against the official Fuji Speedway layout, whose distance profile
 * puts turn one (TGR corner) about 0.5 km after the line on a 1.475 km
 * straight, so the line sits roughly two thirds of the way down it: most of the
 * straight is behind the grid, and the run to turn one is the shorter part.
 * Applied to all four circuits, which share that pit-complex-after-the-final-
 * corner layout. A derived position, not a surveyed timing line.
 */
const START_LINE_STRAIGHT_FRACTION = 0.66

// Way ids were selected by listing every `highway=raceway` way around each
// venue and keeping the chain that forms the car racing course. `ways` is in
// running order; each way's last node meets the next way's first node.
const circuits = [
  {
    id: 'motegi-sf',
    name: 'Mobility Resort Motegi',
    officialKm: 4.801,
    osmWayIds: [28213529, 28213530],
    url: 'https://www.mr-motegi.jp/eng/course/road_course/',
  },
  {
    id: 'autopolis-sf',
    name: 'Autopolis',
    officialKm: 4.674,
    osmWayIds: [115069063],
    url: 'https://autopolis.jp/ap/course/',
  },
  {
    id: 'fuji-sf',
    name: 'Fuji Speedway',
    officialKm: 4.563,
    osmWayIds: [148622740],
    url: 'https://www.fsw.tv/en/guide/course.html',
  },
  {
    id: 'sugo-sf',
    name: 'Sportsland SUGO',
    // SUGO re-surveyed the four-wheel course in January 2026; the chicane-less
    // racing distance is the figure the series now runs to.
    officialKm: 3.586,
    osmWayIds: [107580877, 107581644, 107581031, 107580358],
    url: 'https://www.sportsland-sugo.co.jp/course/c-racing/',
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function overpass(query) {
  let lastError = null

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(ENDPOINTS[attempt % ENDPOINTS.length], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
      })

      if (response.ok) {
        return response.json()
      }

      // Overpass throttles hard; 429/504 clear on their own.
      if (response.status !== 429 && response.status !== 504) {
        throw new Error(`Overpass returned HTTP ${response.status}`)
      }

      lastError = new Error(`Overpass returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await sleep(6000 * (attempt + 1))
  }

  throw lastError ?? new Error('Overpass request failed')
}

function metresBetween(a, b) {
  const earthRadius = 6371008.8
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLon = toRadians(b.lon - a.lon)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(deltaLon / 2) ** 2

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine))
}

function pathLength(points) {
  let total = 0

  for (let index = 1; index < points.length; index += 1) {
    total += metresBetween(points[index - 1], points[index])
  }

  return total
}

// Joins the configured ways head-to-tail, flipping a way when only its end
// node touches the chain, and drops the duplicated shared node.
function chainWays(circuit, wayById) {
  const chain = []

  for (const wayId of circuit.osmWayIds) {
    const way = wayById.get(wayId)

    if (!way) {
      throw new Error(`${circuit.id}: OSM way ${wayId} was not returned`)
    }

    let geometry = way.geometry.slice()

    if (chain.length > 0) {
      const tail = chain[chain.length - 1]
      const headGap = metresBetween(tail, geometry[0])
      const endGap = metresBetween(tail, geometry[geometry.length - 1])

      if (endGap < headGap) {
        geometry = geometry.reverse()
      }

      const gap = Math.min(headGap, endGap)

      if (gap > 30) {
        throw new Error(
          `${circuit.id}: way ${wayId} is ${gap.toFixed(1)} m from the previous way`,
        )
      }

      geometry = geometry.slice(1)
    }

    chain.push(...geometry)
  }

  // A closed way repeats its first node; drop it so the loop has no duplicate.
  if (
    chain.length > 2 &&
    metresBetween(chain[0], chain[chain.length - 1]) < 30
  ) {
    chain.pop()
  }

  return chain
}

function toLocalMetres(points) {
  const meanLat =
    points.reduce((total, point) => total + point.lat, 0) / points.length
  const metresPerDegreeLat = 111132.92
  const metresPerDegreeLon = 111319.49 * Math.cos((meanLat * Math.PI) / 180)
  const originLat = points[0].lat
  const originLon = points[0].lon

  return points.map((point) => ({
    east: (point.lon - originLon) * metresPerDegreeLon,
    north: (point.lat - originLat) * metresPerDegreeLat,
  }))
}

function signedArea(points) {
  let total = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    total += current.east * next.north - next.east * current.north
  }

  return total / 2
}

function rotateToStart(points, startIndex) {
  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

function resampleClosedLoop(points, sampleCount) {
  const loop = [...points, points[0]]
  const cumulative = [0]

  for (let index = 1; index < loop.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] +
        Math.hypot(
          loop[index].east - loop[index - 1].east,
          loop[index].north - loop[index - 1].north,
        ),
    )
  }

  const total = cumulative[cumulative.length - 1]
  const samples = []
  let segment = 1

  for (let index = 0; index < sampleCount; index += 1) {
    const target = (index / sampleCount) * total

    while (segment < cumulative.length - 1 && cumulative[segment] < target) {
      segment += 1
    }

    const spanStart = cumulative[segment - 1]
    const spanEnd = cumulative[segment]
    const local = spanEnd === spanStart ? 0 : (target - spanStart) / (spanEnd - spanStart)

    samples.push({
      east: loop[segment - 1].east + (loop[segment].east - loop[segment - 1].east) * local,
      north:
        loop[segment - 1].north + (loop[segment].north - loop[segment - 1].north) * local,
    })
  }

  return samples
}

function normalize(samples) {
  const easts = samples.map((point) => point.east)
  const norths = samples.map((point) => point.north)
  const centerEast = (Math.min(...easts) + Math.max(...easts)) / 2
  const centerNorth = (Math.min(...norths) + Math.max(...norths)) / 2
  const scale =
    TARGET_SPAN /
    Math.max(Math.max(...easts) - Math.min(...easts), Math.max(...norths) - Math.min(...norths))

  // Scene space uses x=east and z=south, matching the OpenF1 F1 layouts.
  return samples.map((point) => [
    Number(((point.east - centerEast) * scale).toFixed(2)),
    0,
    Number((-(point.north - centerNorth) * scale).toFixed(2)),
  ])
}

function pointsLiteral(points) {
  return `[\n${points
    .map((point) => `      [${point[0]}, ${point[1]}, ${point[2]}],`)
    .join('\n')}\n    ]`
}

/**
 * Longest run of samples that holds a near-constant heading. On these circuits
 * that is the pit straight, which is where the start line sits.
 */
function longestStraight(samples) {
  const count = samples.length
  const headingAt = (index) => {
    const current = samples[index]
    const next = samples[(index + 1) % count]

    return Math.atan2(next.north - current.north, next.east - current.east)
  }
  let best = { length: 1, startIndex: 0 }

  for (let start = 0; start < count; start += 1) {
    let heading = headingAt(start)
    let length = 1

    for (let step = 1; step < count; step += 1) {
      const index = (start + step) % count
      let change = Math.abs(headingAt(index) - heading)

      if (change > Math.PI) change = 2 * Math.PI - change
      if (change > 0.1) break

      heading = headingAt(index)
      length += 1
    }

    if (length > best.length) {
      best = { length, startIndex: start }
    }
  }

  return best
}

/**
 * Timing sectors are placed where the lap splits into three roughly equal
 * stretches of running time, which is how circuits tend to position their
 * lines. Distance thirds would put every boundary in the same place regardless
 * of layout, so the pace proxy below weights corners by their curvature: a
 * tight section takes far longer to cover than the same distance of straight.
 *
 * This is still derived geometry, not a published timing-line position.
 */
function sectorMarksFor(samples) {
  const count = samples.length
  const curvatureAt = (index) => {
    const previous = samples[(index - 1 + count) % count]
    const current = samples[index]
    const next = samples[(index + 1) % count]
    const inbound = Math.atan2(current.north - previous.north, current.east - previous.east)
    const outbound = Math.atan2(next.north - current.north, next.east - current.east)
    let turn = Math.abs(outbound - inbound)

    if (turn > Math.PI) turn = 2 * Math.PI - turn

    return turn
  }

  // Smooth the heading change so a single noisy survey node cannot dominate.
  const smoothed = samples.map((_, index) =>
    (curvatureAt((index - 1 + count) % count) +
      curvatureAt(index) * 2 +
      curvatureAt((index + 1) % count)) /
    4,
  )
  const durations = samples.map((point, index) => {
    const next = samples[(index + 1) % count]
    const distance = Math.hypot(next.east - point.east, next.north - point.north)
    // Relative pace only; the constant sets how hard corners are penalised.
    const speed = 1 / (1 + smoothed[index] * 6)

    return distance / speed
  })
  const total = durations.reduce((sum, value) => sum + value, 0)
  const marks = [0]
  let running = 0

  for (let index = 0; index < count; index += 1) {
    const before = running / total
    running += durations[index]
    const after = running / total

    for (const target of [1 / 3, 2 / 3]) {
      if (before < target && after >= target) {
        marks.push(Number(((index + 1) / count).toFixed(3)))
      }
    }
  }

  // Fall back to even thirds if the scan somehow missed a boundary.
  while (marks.length < 3) marks.push(Number((marks.length / 3).toFixed(3)))

  return marks.slice(0, 3)
}

const wayIds = circuits.flatMap((circuit) => circuit.osmWayIds)
const response = await overpass(`[out:json][timeout:120];
way(id:${wayIds.join(',')});
out geom;`)
const wayById = new Map(
  (response.elements ?? [])
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .map((element) => [element.id, element]),
)

const entries = []
const report = []

for (const circuit of circuits) {
  const chain = chainWays(circuit, wayById)
  const measuredKm = (pathLength([...chain, chain[0]]) / 1000)
  const deviation = Math.abs(measuredKm - circuit.officialKm) / circuit.officialKm

  if (deviation > LENGTH_TOLERANCE) {
    throw new Error(
      `${circuit.id}: OSM chain measures ${measuredKm.toFixed(3)} km but the published length is ${circuit.officialKm} km`,
    )
  }

  let local = toLocalMetres(chain)

  // Every one of these circuits runs clockwise, which is a negative shoelace
  // area in an east/north frame. OSM digitisation order is not guaranteed, so
  // normalise it rather than trusting the way direction.
  if (signedArea(local) > 0) {
    local = [local[0], ...local.slice(1).reverse()]
  }

  // Anchor progress 0 on the start/finish straight, which on every one of these
  // circuits is the longest straight, so it is located from the geometry.
  //
  // The line then goes early on that straight. All four put the pit complex and
  // the grid just after the final corner and leave the long run down to turn
  // one ahead of the line, which is exactly what makes Fuji's 1.5 km blast
  // famous. An earlier attempt aimed at the pit lane's midpoint instead, but
  // OSM pit lane ways carry their approach and exit roads, so the midpoint sat
  // far past the boxes and left the line almost on top of turn one.
  const evenlySpaced = resampleClosedLoop(local, SAMPLE_COUNT)
  const straight = longestStraight(evenlySpaced)
  const startIndex =
    (straight.startIndex +
      Math.round(straight.length * START_LINE_STRAIGHT_FRACTION)) %
    evenlySpaced.length

  const resampled = rotateToStart(evenlySpaced, startIndex)
  const centerline = normalize(resampled)
  const sectorMarks = sectorMarksFor(resampled)

  report.push(
    `${circuit.id.padEnd(14)} measured ${measuredKm.toFixed(3)} km / published ${circuit.officialKm} km (${(deviation * 100).toFixed(2)}% off), ${chain.length} OSM nodes -> ${SAMPLE_COUNT} samples, sectors ${sectorMarks.join(' / ')}`,
  )

  entries.push(`  ${JSON.stringify(circuit.id)}: {
    centerline: ${pointsLiteral(centerline)} as Array<[number, number, number]>,
    measuredKm: ${Number(measuredKm.toFixed(3))},
    sectorMarks: [${sectorMarks.join(', ')}] as [number, number, number],
    source: {
      attribution: '© OpenStreetMap contributors (ODbL)',
      kind: 'openstreetmap',
      officialUrl: ${JSON.stringify(circuit.url)},
      osmWayIds: [${circuit.osmWayIds.join(', ')}],
      circuitName: ${JSON.stringify(circuit.name)},
    },
  }`)
}

const file = `// Generated by scripts/generate-support-track-layouts.mjs from OpenStreetMap geometry.
// Do not edit point arrays by hand; adjust the generator and rerun
// npm run generate:support-tracks.
//
// Track geometry © OpenStreetMap contributors, licensed under the ODbL
// (https://www.openstreetmap.org/copyright).

export type SupportTrackLayout = {
  centerline: Array<[number, number, number]>
  /** Lap length measured along the surveyed OSM centerline, in kilometres. */
  measuredKm: number
  /**
   * Progress of each timing sector boundary, derived by splitting the lap into
   * three roughly equal stretches of running time. Not a published timing-line
   * position.
   */
  sectorMarks: [number, number, number]
  source: {
    attribution: string
    kind: 'openstreetmap'
    officialUrl: string
    osmWayIds: number[]
    circuitName: string
  }
}

export const supportSeriesTrackLayouts: Partial<Record<string, SupportTrackLayout>> = {
${entries.join(',\n')}
}
`

await writeFile(OUTPUT_PATH, file)
console.log(`Generated ${entries.length} support track layouts in ${OUTPUT_PATH}`)
console.log(report.join('\n'))
