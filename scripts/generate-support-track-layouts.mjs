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

// Way ids were selected by listing every `highway=raceway` way around each
// venue and keeping the chain that forms the car racing course. `ways` is in
// running order; each way's last node meets the next way's first node.
const circuits = [
  {
    id: 'motegi-sf',
    name: 'Mobility Resort Motegi',
    officialKm: 4.801,
    osmWayIds: [28213529, 28213530],
    pitLaneWayId: 229813464,
    url: 'https://www.mr-motegi.jp/eng/course/road_course/',
  },
  {
    id: 'autopolis-sf',
    name: 'Autopolis',
    officialKm: 4.674,
    osmWayIds: [115069063],
    pitLaneWayId: null,
    url: 'https://autopolis.jp/ap/course/',
  },
  {
    id: 'fuji-sf',
    name: 'Fuji Speedway',
    officialKm: 4.563,
    osmWayIds: [148622740],
    pitLaneWayId: 148621414,
    url: 'https://www.fsw.tv/en/guide/course.html',
  },
  {
    id: 'sugo-sf',
    name: 'Sportsland SUGO',
    // SUGO re-surveyed the four-wheel course in January 2026; the chicane-less
    // racing distance is the figure the series now runs to.
    officialKm: 3.586,
    osmWayIds: [107580877, 107581644, 107581031, 107580358],
    pitLaneWayId: 573824372,
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

function nearestIndex(points, target) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const distance = Math.hypot(point.east - target.east, point.north - target.north)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
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

const wayIds = circuits.flatMap((circuit) =>
  circuit.pitLaneWayId === null
    ? circuit.osmWayIds
    : [...circuit.osmWayIds, circuit.pitLaneWayId],
)
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

  // Anchor progress 0 on the start/finish straight. The pit lane runs beside
  // it, so its midpoint projects onto the straight.
  const pitLane = circuit.pitLaneWayId === null ? null : wayById.get(circuit.pitLaneWayId)
  let startIndex = 0

  if (pitLane) {
    const pitPoints = pitLane.geometry
    const pitMid = pitPoints[Math.floor(pitPoints.length / 2)]
    const originLat = chain[0].lat
    const originLon = chain[0].lon
    const meanLat = chain.reduce((total, point) => total + point.lat, 0) / chain.length
    startIndex = nearestIndex(local, {
      east: (pitMid.lon - originLon) * 111319.49 * Math.cos((meanLat * Math.PI) / 180),
      north: (pitMid.lat - originLat) * 111132.92,
    })
  }

  const centerline = normalize(
    resampleClosedLoop(rotateToStart(local, startIndex), SAMPLE_COUNT),
  )

  report.push(
    `${circuit.id.padEnd(14)} measured ${measuredKm.toFixed(3)} km / published ${circuit.officialKm} km (${(deviation * 100).toFixed(2)}% off), ${chain.length} OSM nodes -> ${SAMPLE_COUNT} samples`,
  )

  entries.push(`  ${JSON.stringify(circuit.id)}: {
    centerline: ${pointsLiteral(centerline)} as Array<[number, number, number]>,
    measuredKm: ${Number(measuredKm.toFixed(3))},
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
