// Generates source-labelled road elevation, grade, selected cross-slope, and
// mapped-width samples from public geospatial services.
//
// Geometry is used only to locate samples. OpenStreetMap geometry is
// © OpenStreetMap contributors and is licensed under the ODbL. Elevations are
// queried from the source services named in PROFILE_CONFIGS. Generated output
// is committed so a race never depends on a live network request.

import { writeFile } from 'node:fs/promises'
import { fromArrayBuffer } from 'geotiff'
import proj4 from 'proj4'

const OUTPUT_PATH = 'src/data/measuredRoadProfiles.ts'
const SAMPLE_COUNT = 96
const START_LINE_STRAIGHT_FRACTION = 0.66
const OSM_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const USER_AGENT =
  'f1-race-simulator/1.0 (public measured road profile generator)'
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
const BRITISH_NATIONAL_GRID =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs'
const RIJKSDRIEHOEK =
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs'

const PROFILE_CONFIGS = [
  {
    id: 'zandvoort-approx',
    name: 'Circuit Zandvoort',
    officialKm: 4.259,
    latitude: 52.3888,
    longitude: 4.5409,
    osmWayIds: [
      24626850, 1311765615, 1311802779, 1311822339, 1311822340,
      1311822341, 1311879069, 1311522211, 1311522212, 1313671989,
      1311522213, 1313671990, 1311522214, 1311522215, 1311522216,
      1311522217, 1311522218, 1311566938, 1311566937, 1313671991,
      1311566939, 1313671992, 1311566940, 1311710253,
    ],
    alignment: { circuitKey: 55, kind: 'openf1' },
    elevation: {
      kind: 'pdok-ahn-dsm',
      sourceDate: { precision: 'year', value: '2022' },
      sourceLabel:
        'PDOK AHN4 Digital Surface Model 0.5 m — airborne laser altimetry acquired 2020-2022; NAP vertical datum',
      sourceUrl: 'https://www.ahn.nl/dataroom',
    },
  },
  {
    id: 'silverstone-approx',
    name: 'Silverstone Circuit',
    officialKm: 5.891,
    latitude: 52.0718116,
    longitude: -1.0142991,
    osmWayIds: [
      3571477, 169730585, 169730587, 169733768, 169730586, 430075118,
      169733766, 169733769, 169733770, 169848880, 169848884, 169848881,
      55224168, 55224167, 169854842, 169800226, 169800223, 169800225,
      169848882, 169800224, 169800222, 169618242, 169618240, 169618241,
      169618245, 169609611, 169730588,
    ],
    alignment: { circuitKey: 2, kind: 'openf1' },
    elevation: {
      kind: 'ea-dsm',
      sourceDate: { precision: 'year', value: '2022' },
      sourceLabel:
        'Environment Agency LIDAR Composite DSM 1 m — Ordnance Datum Newlyn; source surveys through 2022',
      sourceUrl:
        'https://www.data.gov.uk/dataset/cf3f1137-c12b-44a1-a835-e80fe4a60b92/lidar-composite-digital-surface-model-dsm-1m',
    },
  },
  {
    id: 'suzuka-approx',
    name: 'Suzuka Circuit',
    officialKm: 5.807,
    latitude: 34.8431,
    longitude: 136.541,
    osmWayIds: [
      175231434, 183391652, 183391660, 411289989, 183391637, 183391639,
      183391638, 183391640, 183391661, 183391665, 183391643, 183391645,
      183391644, 183391657, 183391636, 183391635, 183391628, 183391634,
      183391629, 183391633, 183391631, 183391632, 183391630, 183391642,
      411295349, 183391641, 183391656, 183391664, 183391655, 183391662,
      183391658, 183391646, 183391659, 183391651, 411295347, 183391649,
      183391647, 411295351, 183391648, 411295348,
    ],
    alignment: { circuitKey: 46, kind: 'openf1' },
    elevation: {
      kind: 'gsi-dem',
      sourceDate: { precision: 'unavailable', value: null },
      sourceLabel:
        'Geospatial Information Authority of Japan elevation service — best available DEM at each station',
      sourceUrl: 'https://maps.gsi.go.jp/development/elevation_s.html',
    },
  },
  {
    id: 'motegi-sf',
    name: 'Mobility Resort Motegi',
    officialKm: 4.801,
    osmWayIds: [28213529, 28213530],
    alignment: { kind: 'support-derived-start' },
    elevation: {
      kind: 'gsi-dem',
      sourceDate: { precision: 'unavailable', value: null },
      sourceLabel:
        'Geospatial Information Authority of Japan elevation service — best available DEM at each station',
      sourceUrl: 'https://maps.gsi.go.jp/development/elevation_s.html',
    },
  },
  {
    id: 'autopolis-sf',
    name: 'Autopolis',
    officialKm: 4.674,
    osmWayIds: [115069063],
    alignment: { kind: 'support-derived-start' },
    elevation: {
      kind: 'gsi-dem',
      sourceDate: { precision: 'unavailable', value: null },
      sourceLabel:
        'Geospatial Information Authority of Japan elevation service — best available DEM at each station',
      sourceUrl: 'https://maps.gsi.go.jp/development/elevation_s.html',
    },
  },
  {
    id: 'fuji-sf',
    name: 'Fuji Speedway',
    officialKm: 4.563,
    osmWayIds: [148622740],
    alignment: { kind: 'support-derived-start' },
    elevation: {
      kind: 'gsi-dem',
      sourceDate: { precision: 'unavailable', value: null },
      sourceLabel:
        'Geospatial Information Authority of Japan elevation service — best available DEM at each station',
      sourceUrl: 'https://maps.gsi.go.jp/development/elevation_s.html',
    },
  },
  {
    id: 'sugo-sf',
    name: 'Sportsland SUGO',
    officialKm: 3.586,
    osmWayIds: [107580877, 107581644, 107581031, 107580358],
    alignment: { kind: 'support-derived-start' },
    elevation: {
      kind: 'gsi-dem',
      sourceDate: { precision: 'unavailable', value: null },
      sourceLabel:
        'Geospatial Information Authority of Japan elevation service — best available DEM at each station',
      sourceUrl: 'https://maps.gsi.go.jp/development/elevation_s.html',
    },
  },
]

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchWithRetry(url, options = {}, attempts = 5) {
  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
        signal: AbortSignal.timeout(45_000),
      })
      if (response.ok) return response
      lastError = new Error(`${url} returned HTTP ${response.status}`)
      if (![429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error
    }
    await sleep(1_000 * (attempt + 1))
  }

  throw lastError ?? new Error(`${url} request failed`)
}

async function overpass(query) {
  let lastError = null

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const endpoint = OSM_ENDPOINTS[attempt % OSM_ENDPOINTS.length]
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(35_000),
      })
      if (response.ok) return response.json()
      lastError = new Error(`${endpoint} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(3_000 * (attempt + 1))
  }

  throw lastError ?? new Error('Overpass request failed')
}

function metresBetween(left, right) {
  const earthRadius = 6_371_008.8
  const radians = (degrees) => (degrees * Math.PI) / 180
  const deltaLatitude = radians(right.lat - left.lat)
  const deltaLongitude = radians(right.lon - left.lon)
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(left.lat)) *
      Math.cos(radians(right.lat)) *
      Math.sin(deltaLongitude / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine))
}

function pathLength(points, close = false) {
  const source = close ? [...points, points[0]] : points
  let total = 0
  for (let index = 1; index < source.length; index += 1) {
    total += metresBetween(source[index - 1], source[index])
  }
  return total
}

function parseWidth(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const width = Number(normalized)
  return Number.isFinite(width) && width >= 5 && width <= 30 ? width : null
}

function normalizedWay(element, reverse = false) {
  const geometry = reverse ? element.geometry.slice().reverse() : element.geometry.slice()
  const nodes = reverse ? element.nodes.slice().reverse() : element.nodes.slice()
  return {
    geometry,
    id: Number(element.id),
    nodes,
    tags: element.tags ?? {},
    widthMeters: parseWidth(element.tags?.width),
  }
}

function eligibleRaceway(element) {
  const tags = element.tags ?? {}
  const name = String(tags.name ?? '')
  return (
    element.type === 'way' &&
    Array.isArray(element.geometry) &&
    element.geometry.length >= 2 &&
    Array.isArray(element.nodes) &&
    element.nodes.length === element.geometry.length &&
    tags.raceway !== 'pit_lane' &&
    !/pit(?:straat| lane| road)/iu.test(name) &&
    !/kart/iu.test(String(tags.sport ?? '')) &&
    !['dirt', 'unpaved'].includes(String(tags.surface ?? ''))
  )
}

function cycleCandidates(elements, allowReverse) {
  const ways = elements.filter(eligibleRaceway).map((element) => normalizedWay(element))
  const adjacency = new Map()
  const add = (from, edge) => {
    const entries = adjacency.get(from) ?? []
    entries.push(edge)
    adjacency.set(from, entries)
  }

  for (const way of ways) {
    const first = way.nodes[0]
    const last = way.nodes.at(-1)
    if (first === last) continue
    const reversedByTag = way.tags.oneway === '-1'
    const forward = reversedByTag ? normalizedWay(way, true) : way
    add(forward.nodes[0], forward)
    if (allowReverse || !['yes', '1', '-1'].includes(String(way.tags.oneway ?? ''))) {
      const reverse = normalizedWay(forward, true)
      add(reverse.nodes[0], reverse)
    }
  }

  const candidates = []
  const signatures = new Set()
  for (const way of ways) {
    if (way.nodes[0] === way.nodes.at(-1)) {
      candidates.push([way])
      signatures.add(String(way.id))
    }
  }

  const maximumEdges = 48
  function search(startNode, node, path, used) {
    if (candidates.length >= 4_000 || path.length >= maximumEdges) return
    for (const edge of adjacency.get(node) ?? []) {
      if (used.has(edge.id)) continue
      const next = edge.nodes.at(-1)
      const nextPath = [...path, edge]
      if (next === startNode && nextPath.length >= 2) {
        const signature = nextPath
          .map(({ id }) => id)
          .sort((left, right) => left - right)
          .join(',')
        if (!signatures.has(signature)) {
          signatures.add(signature)
          candidates.push(nextPath)
        }
        continue
      }
      const nextUsed = new Set(used)
      nextUsed.add(edge.id)
      search(startNode, next, nextPath, nextUsed)
    }
  }

  for (const startNode of adjacency.keys()) {
    search(startNode, startNode, [], new Set())
  }
  return candidates
}

function chainGeometry(ways) {
  const points = []
  for (const way of ways) {
    const geometry = way.geometry.map((point) => ({
      lat: Number(point.lat),
      lon: Number(point.lon),
    }))
    if (points.length > 0) geometry.shift()
    points.push(...geometry)
  }
  if (points.length > 2 && metresBetween(points[0], points.at(-1)) < 5) points.pop()
  return points
}

function bestCycle(config, elements) {
  const targetMeters = config.officialKm * 1_000
  let candidates = cycleCandidates(elements, false)
  if (candidates.length === 0) candidates = cycleCandidates(elements, true)
  const ranked = candidates
    .map((ways) => {
      const points = chainGeometry(ways)
      const measuredMeters = pathLength(points, true)
      return {
        deviation: Math.abs(measuredMeters - targetMeters) / targetMeters,
        measuredMeters,
        points,
        ways,
      }
    })
    .filter(({ points }) => points.length >= 12)
    .sort((left, right) => left.deviation - right.deviation)
  const best = ranked[0]
  if (!best || best.deviation > 0.08) {
    if (!best) {
      const eligible = elements.filter(eligibleRaceway)
      console.error(
        `${config.id}: ${eligible.length} eligible OSM ways; ` +
          eligible
            .slice(0, 80)
            .map((way) => `${way.id}:${way.nodes?.[0]}-${way.nodes?.at(-1)}`)
            .join(' '),
      )
    }
    throw new Error(
      `${config.id}: no OSM raceway cycle matched ${config.officialKm.toFixed(3)} km; closest ${best ? `${(best.measuredMeters / 1_000).toFixed(3)} km` : 'unavailable'}`,
    )
  }
  return best
}

function fixedWayChain(config, elements) {
  const byId = new Map(
    elements.filter(eligibleRaceway).map((element) => [Number(element.id), element]),
  )
  const ways = []
  let tail = null
  for (const wayId of config.osmWayIds) {
    const source = byId.get(wayId)
    if (!source) throw new Error(`${config.id}: OSM way ${wayId} was not returned`)
    let way = normalizedWay(source)
    if (tail) {
      const headGap = metresBetween(tail, way.geometry[0])
      const endGap = metresBetween(tail, way.geometry.at(-1))
      if (endGap < headGap) way = normalizedWay(source, true)
      if (Math.min(headGap, endGap) > 30) {
        throw new Error(`${config.id}: configured OSM ways do not form a chain`)
      }
    }
    ways.push(way)
    tail = way.geometry.at(-1)
  }
  const points = chainGeometry(ways)
  const measuredMeters = pathLength(points, true)
  const deviation = Math.abs(measuredMeters - config.officialKm * 1_000) / (config.officialKm * 1_000)
  if (deviation > 0.04) {
    throw new Error(`${config.id}: configured OSM chain is ${(deviation * 100).toFixed(2)}% from published length`)
  }
  return { deviation, measuredMeters, points, ways }
}

function toLocalMetres(points) {
  const meanLatitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length
  const metresPerDegreeLatitude = 111_132.92
  const metresPerDegreeLongitude =
    111_319.49 * Math.cos((meanLatitude * Math.PI) / 180)
  const origin = points[0]
  return points.map((point) => ({
    east: (point.lon - origin.lon) * metresPerDegreeLongitude,
    lat: point.lat,
    lon: point.lon,
    north: (point.lat - origin.lat) * metresPerDegreeLatitude,
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
  const total = cumulative.at(-1)
  const samples = []
  let segment = 1
  for (let index = 0; index < sampleCount; index += 1) {
    const target = (index / sampleCount) * total
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1
    const startDistance = cumulative[segment - 1]
    const endDistance = cumulative[segment]
    const ratio = endDistance === startDistance ? 0 : (target - startDistance) / (endDistance - startDistance)
    const start = loop[segment - 1]
    const end = loop[segment]
    samples.push({
      east: start.east + (end.east - start.east) * ratio,
      lat: start.lat + (end.lat - start.lat) * ratio,
      lon: start.lon + (end.lon - start.lon) * ratio,
      north: start.north + (end.north - start.north) * ratio,
    })
  }
  return samples
}

function longestStraight(samples) {
  const headingAt = (index) => {
    const current = samples[index]
    const next = samples[(index + 1) % samples.length]
    return Math.atan2(next.north - current.north, next.east - current.east)
  }
  let best = { length: 1, startIndex: 0 }
  for (let start = 0; start < samples.length; start += 1) {
    let heading = headingAt(start)
    let length = 1
    for (let step = 1; step < samples.length; step += 1) {
      const index = (start + step) % samples.length
      let change = Math.abs(headingAt(index) - heading)
      if (change > Math.PI) change = 2 * Math.PI - change
      if (change > 0.1) break
      heading = headingAt(index)
      length += 1
    }
    if (length > best.length) best = { length, startIndex: start }
  }
  return best
}

function rotateToStart(points, startIndex) {
  return [...points.slice(startIndex), ...points.slice(0, startIndex)]
}

function rotatePoint([x, y], degrees) {
  const radians = (degrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [x * cosine - y * sine, x * sine + y * cosine]
}

function resamplePlanarLoop(points, sampleCount) {
  const source = points.map(([east, north]) => ({ east, north }))
  return resampleClosedLoop(
    source.map((point) => ({ ...point, lat: point.north, lon: point.east })),
    sampleCount,
  ).map(({ east, north }) => ({ east, north }))
}

function normalizedPlanar(points) {
  const meanEast = points.reduce((sum, point) => sum + point.east, 0) / points.length
  const meanNorth = points.reduce((sum, point) => sum + point.north, 0) / points.length
  const centered = points.map((point) => ({
    east: point.east - meanEast,
    north: point.north - meanNorth,
  }))
  const norm = Math.sqrt(
    centered.reduce((sum, point) => sum + point.east ** 2 + point.north ** 2, 0),
  )
  return centered.map((point) => ({ east: point.east / norm, north: point.north / norm }))
}

function alignByShape(samples, target) {
  const targetNormalized = normalizedPlanar(target)
  let best = null
  for (const reversed of [false, true]) {
    const candidate = reversed ? samples.slice().reverse() : samples
    const candidateNormalized = normalizedPlanar(candidate)
    for (let shift = 0; shift < samples.length; shift += 1) {
      let dot = 0
      let cross = 0
      for (let index = 0; index < samples.length; index += 1) {
        const source = candidateNormalized[(index + shift) % samples.length]
        const destination = targetNormalized[index]
        dot += source.east * destination.east + source.north * destination.north
        cross += source.east * destination.north - source.north * destination.east
      }
      const error = 1 - Math.hypot(dot, cross)
      if (!best || error < best.error) best = { candidate, error, reversed, shift }
    }
  }
  if (!best || best.error > 0.08) {
    throw new Error(`OSM/OpenF1 shape alignment error ${best?.error ?? 'unavailable'} exceeds the gate`)
  }
  return {
    error: best.error,
    reversed: best.reversed,
    samples: Array.from(
      { length: samples.length },
      (_, index) => best.candidate[(index + best.shift) % samples.length],
    ),
    shift: best.shift,
  }
}

async function openF1Target(circuitKey) {
  const response = await fetchWithRetry(
    `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/2026`,
  )
  const circuit = await response.json()
  if (!Array.isArray(circuit.x) || !Array.isArray(circuit.y)) {
    throw new Error(`OpenF1 circuit ${circuitKey} has no planar coordinates`)
  }
  const points = circuit.x.map((x, index) =>
    rotatePoint([Number(x), Number(circuit.y[index])], Number(circuit.rotation ?? 0)),
  )
  return resamplePlanarLoop(points, SAMPLE_COUNT)
}

function pointSegmentDistanceSquared(point, start, end) {
  const deltaEast = end.east - start.east
  const deltaNorth = end.north - start.north
  const denominator = deltaEast ** 2 + deltaNorth ** 2
  const ratio =
    denominator <= 1e-9
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.east - start.east) * deltaEast +
              (point.north - start.north) * deltaNorth) /
              denominator,
          ),
        )
  const closestEast = start.east + deltaEast * ratio
  const closestNorth = start.north + deltaNorth * ratio
  return (point.east - closestEast) ** 2 + (point.north - closestNorth) ** 2
}

function widthSegments(ways, originPoints) {
  const originLatitude = originPoints[0].lat
  const originLongitude = originPoints[0].lon
  const meanLatitude = originPoints.reduce((sum, point) => sum + point.lat, 0) / originPoints.length
  const metresPerDegreeLongitude = 111_319.49 * Math.cos((meanLatitude * Math.PI) / 180)
  const toLocal = (point) => ({
    east: (point.lon - originLongitude) * metresPerDegreeLongitude,
    north: (point.lat - originLatitude) * 111_132.92,
  })
  return ways.flatMap((way) => {
    if (way.widthMeters === null) return []
    const geometry = way.geometry.map(toLocal)
    return geometry.slice(1).map((end, index) => ({
      end,
      start: geometry[index],
      widthMeters: way.widthMeters,
    }))
  })
}

function widthAt(point, segments) {
  let nearest = null
  for (const segment of segments) {
    const distanceSquared = pointSegmentDistanceSquared(point, segment.start, segment.end)
    if (!nearest || distanceSquared < nearest.distanceSquared) {
      nearest = { distanceSquared, widthMeters: segment.widthMeters }
    }
  }
  return nearest && nearest.distanceSquared <= 15 ** 2 ? nearest.widthMeters : null
}

function offsetPoint(point, tangentEast, tangentNorth, offsetMeters) {
  const length = Math.hypot(tangentEast, tangentNorth)
  const normalEast = -tangentNorth / length
  const normalNorth = tangentEast / length
  const metresPerDegreeLongitude = 111_319.49 * Math.cos((point.lat * Math.PI) / 180)
  return {
    lat: point.lat + (normalNorth * offsetMeters) / 111_132.92,
    lon: point.lon + (normalEast * offsetMeters) / metresPerDegreeLongitude,
  }
}

function featureInfoUrl(base, parameters) {
  const url = new URL(base)
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value))
  return url
}

async function lidarRasterFor(kind, samples) {
  const isAhn = kind === 'pdok-ahn-dsm'
  const projection = isAhn ? RIJKSDRIEHOEK : BRITISH_NATIONAL_GRID
  const resolutionMeters = isAhn ? 0.5 : 1
  const projected = samples.map((point) => {
    const [x, y] = proj4('EPSG:4326', projection, [point.lon, point.lat])
    return { x, y }
  })
  const paddingMeters = 12
  const minimumX =
    Math.floor((Math.min(...projected.map(({ x }) => x)) - paddingMeters) / resolutionMeters) *
    resolutionMeters
  const maximumX =
    Math.ceil((Math.max(...projected.map(({ x }) => x)) + paddingMeters) / resolutionMeters) *
    resolutionMeters
  const minimumY =
    Math.floor((Math.min(...projected.map(({ y }) => y)) - paddingMeters) / resolutionMeters) *
    resolutionMeters
  const maximumY =
    Math.ceil((Math.max(...projected.map(({ y }) => y)) + paddingMeters) / resolutionMeters) *
    resolutionMeters
  let url
  if (isAhn) {
    url = featureInfoUrl('https://service.pdok.nl/rws/ahn/wcs/v1_0', {
      BBOX: `${minimumX},${minimumY},${maximumX},${maximumY}`,
      COVERAGE: 'dsm_05m',
      CRS: 'EPSG:28992',
      FORMAT: 'GeoTIFF',
      HEIGHT: Math.round((maximumY - minimumY) / resolutionMeters),
      REQUEST: 'GetCoverage',
      SERVICE: 'WCS',
      VERSION: '1.0.0',
      WIDTH: Math.round((maximumX - minimumX) / resolutionMeters),
    })
  } else {
    url = featureInfoUrl(
      'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wcs',
      {
        CoverageId:
          '9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m',
        format: 'image/tiff',
        request: 'GetCoverage',
        service: 'WCS',
        version: '2.0.1',
      },
    )
    url.searchParams.append('subset', `E(${minimumX},${maximumX})`)
    url.searchParams.append('subset', `N(${minimumY},${maximumY})`)
  }
  const response = await fetchWithRetry(url)
  const tiff = await fromArrayBuffer(await response.arrayBuffer())
  const image = await tiff.getImage()
  const raster = await image.readRasters({ interleave: true })
  const [originX, originY] = image.getOrigin()
  const [resolutionX, resolutionY] = image.getResolution()
  const [rasterMinimumX, rasterMinimumY, rasterMaximumX, rasterMaximumY] =
    image.getBoundingBox()
  const width = image.getWidth()
  const height = image.getHeight()
  const noData = image.getGDALNoData()
  const sample = (point) => {
    const [x, y] = proj4('EPSG:4326', projection, [point.lon, point.lat])
    const column = Math.floor(
      (x - rasterMinimumX) / Math.abs(resolutionX),
    )
    const row = Math.floor(
      (rasterMaximumY - y) / Math.abs(resolutionY),
    )
    if (column < 0 || row < 0 || column >= width || row >= height) {
      throw new Error(
        `LIDAR point ${point.lat},${point.lon} (${x},${y}) fell outside ${width}x${height} raster origin ${originX},${originY} bbox ${rasterMinimumX},${rasterMinimumY},${rasterMaximumX},${rasterMaximumY} resolution ${resolutionX},${resolutionY}`,
      )
    }
    const value = Number(raster[row * width + column])
    if (!Number.isFinite(value) || (noData !== null && value === noData)) {
      throw new Error(`LIDAR raster returned no height at ${point.lat},${point.lon}`)
    }
    return value
  }
  return {
    detail: isAhn ? 'AHN4 DSM 0.5m WCS GeoTIFF' : 'EA composite DSM 1m WCS GeoTIFF',
    sample,
  }
}

async function gsiElevation(point) {
  const url = featureInfoUrl(
    'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
    { lat: point.lat, lon: point.lon, outtype: 'JSON' },
  )
  const data = await (await fetchWithRetry(url)).json()
  const value = Number(data.elevation)
  if (!Number.isFinite(value)) throw new Error(`GSI returned no height at ${point.lat},${point.lon}`)
  return { elevationMeters: value, detail: String(data.hsrc ?? 'GSI DEM') }
}

async function mapWithConcurrency(items, concurrency, callback) {
  const output = Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      output[index] = await callback(items[index], index)
      await sleep(40)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return output
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function circularAt(values, index) {
  return values[(index + values.length) % values.length]
}

function smoothedElevations(raw) {
  const medianFiltered = raw.map((_, index) =>
    median([
      circularAt(raw, index - 1),
      circularAt(raw, index),
      circularAt(raw, index + 1),
    ]),
  )
  return medianFiltered.map((_, index) => {
    const value =
      circularAt(medianFiltered, index - 2) +
      circularAt(medianFiltered, index - 1) * 2 +
      circularAt(medianFiltered, index) * 3 +
      circularAt(medianFiltered, index + 1) * 2 +
      circularAt(medianFiltered, index + 2)
    return value / 9
  })
}

function gradeProfile(elevations, stationSpacingMeters) {
  return elevations.map((_, index) => {
    const rise = circularAt(elevations, index + 2) - circularAt(elevations, index - 2)
    const grade = rise / (stationSpacingMeters * 4)
    return Math.max(-0.2, Math.min(0.2, grade))
  })
}

function bankProfile(samples, crossSections) {
  const raw = samples.map((point, index) => {
    const section = crossSections[index]
    if (!section) return null
    const previous = circularAt(samples, index - 1)
    const next = circularAt(samples, index + 1)
    const incoming = { east: point.east - previous.east, north: point.north - previous.north }
    const outgoing = { east: next.east - point.east, north: next.north - point.north }
    const cross = incoming.east * outgoing.north - incoming.north * outgoing.east
    if (Math.abs(cross) < 1e-4) return null
    const planeResidual = Math.abs(
      section.center - (section.left + section.right) / 2,
    )
    if (planeResidual > 0.35) return null
    const lateralSlope = (section.right - section.left) / 8
    return (Math.atan(lateralSlope * Math.sign(cross)) * 180) / Math.PI
  })
  return raw.map((_, index) => {
    const neighborhood = [-2, -1, 0, 1, 2]
      .map((offset) => circularAt(raw, index + offset))
      .filter((value) => value !== null && Number.isFinite(value))
    if (neighborhood.length < 3) return null
    const value = median(neighborhood)
    if (Math.abs(value) < 2 || Math.abs(value) > 25) return null
    const agreeing = neighborhood.filter((candidate) => Math.sign(candidate) === Math.sign(value))
    return agreeing.length >= 3 ? value : null
  })
}

function rounded(value, digits) {
  return Number(value.toFixed(digits))
}

function sourceLiteral(source) {
  return `{
        confidence: ${JSON.stringify(source.confidence)},
        method: ${JSON.stringify(source.method)},
        source: ${JSON.stringify(source.source)},
        sourceDate: ${JSON.stringify(source.sourceDate)},
        sourceLabel: ${JSON.stringify(source.sourceLabel)},
        sourceUrl: ${JSON.stringify(source.sourceUrl)},
      }`
}

function entryLiteral(result) {
  const samples = result.samples
    .map(
      (sample) =>
        `      [${sample.progress}, ${sample.elevationMeters}, ${sample.gradeFraction}, ${sample.bankingDegrees ?? 'null'}, ${sample.usableWidthMeters ?? 'null'}],`,
    )
    .join('\n')
  const fields = Object.entries(result.fields)
    .map(([name, source]) => `      ${name}: ${source ? sourceLiteral(source) : 'null'},`)
    .join('\n')
  return `  ${JSON.stringify(result.id)}: {
    fields: {
${fields}
    },
    generatedAt: ${JSON.stringify(result.generatedAt)},
    geometry: ${JSON.stringify(result.geometry)},
    sampleSpacingMeters: ${result.sampleSpacingMeters},
    sourceDetails: ${JSON.stringify(result.sourceDetails)},
    samples: [
${samples}
    ],
  }`
}

async function geometryFor(config) {
  let response
  if (config.osmWayIds) {
    response = await overpass(`[out:json][timeout:120];way(id:${config.osmWayIds.join(',')});out geom;`)
  } else {
    response = await overpass(
      `[out:json][timeout:120];way["highway"="raceway"](around:5000,${config.latitude},${config.longitude});out geom;`,
    )
  }
  console.log(
    `${config.id}: Overpass returned ${response.elements?.length ?? 0} elements; keys ${Object.keys(response.elements?.[0] ?? {}).join(',')}`,
  )
  const selected = config.osmWayIds
    ? fixedWayChain(config, response.elements ?? [])
    : bestCycle(config, response.elements ?? [])
  let local = toLocalMetres(selected.points)
  let alignment
  if (config.alignment.kind === 'support-derived-start') {
    if (signedArea(local) > 0) local = [local[0], ...local.slice(1).reverse()]
    const evenlySpaced = resampleClosedLoop(local, SAMPLE_COUNT)
    const straight = longestStraight(evenlySpaced)
    const startIndex =
      (straight.startIndex + Math.round(straight.length * START_LINE_STRAIGHT_FRACTION)) %
      evenlySpaced.length
    alignment = {
      error: null,
      reversed: false,
      samples: rotateToStart(evenlySpaced, startIndex),
      shift: startIndex,
    }
  } else {
    const samples = resampleClosedLoop(local, SAMPLE_COUNT)
    alignment = alignByShape(samples, await openF1Target(config.alignment.circuitKey))
  }
  const segments = widthSegments(selected.ways, selected.points)
  const samples = alignment.samples.map((sample) => ({
    ...sample,
    widthMeters: widthAt(sample, segments),
  }))
  return {
    alignment,
    measuredMeters: selected.measuredMeters,
    osmTimestamp: response.osm3s?.timestamp_osm_base ?? null,
    samples,
    wayIds: selected.ways.map(({ id }) => id),
  }
}

async function generateProfile(config) {
  const geometry = await geometryFor(config)
  const lidarCrossSections = ['pdok-ahn-dsm', 'ea-dsm'].includes(config.elevation.kind)
  const lidarRaster = lidarCrossSections
    ? await lidarRasterFor(config.elevation.kind, geometry.samples)
    : null
  const readings = await mapWithConcurrency(geometry.samples, 3, async (point, index) => {
    const center = lidarRaster
      ? {
          detail: lidarRaster.detail,
          elevationMeters: lidarRaster.sample(point),
        }
      : await gsiElevation(point)
    if (!lidarRaster) return { center, crossSection: null }
    const previous = circularAt(geometry.samples, index - 1)
    const next = circularAt(geometry.samples, index + 1)
    const tangentEast = next.east - previous.east
    const tangentNorth = next.north - previous.north
    const left = lidarRaster.sample(
      offsetPoint(point, tangentEast, tangentNorth, 4),
    )
    const right = lidarRaster.sample(
      offsetPoint(point, tangentEast, tangentNorth, -4),
    )
    return {
      center,
      crossSection: {
        center: center.elevationMeters,
        left,
        right,
      },
    }
  })
  const details = [...new Set(readings.map(({ center }) => center.detail))]
  const rawElevations = readings.map(({ center, crossSection }) =>
    crossSection
      ? median([crossSection.left, center.elevationMeters, crossSection.right])
      : center.elevationMeters,
  )
  const elevations = smoothedElevations(rawElevations)
  const spacing = (config.officialKm * 1_000) / SAMPLE_COUNT
  const grades = gradeProfile(elevations, spacing)
  const banks = lidarCrossSections
    ? bankProfile(
        geometry.samples,
        readings.map(({ crossSection }) => crossSection),
      )
    : Array(SAMPLE_COUNT).fill(null)
  const hasBank = banks.some((value) => value !== null)
  const hasWidth = geometry.samples.some(({ widthMeters }) => widthMeters !== null)
  const generatedAt = new Date().toISOString()
  const elevationSource = {
    confidence: config.elevation.kind === 'gsi-dem' ? 'medium' : 'medium',
    method: 'public-elevation-grid-interpolation',
    source: 'observed',
    sourceDate: config.elevation.sourceDate,
    sourceLabel: `${config.elevation.sourceLabel}; OSM centreline alignment`,
    sourceUrl: config.elevation.sourceUrl,
  }
  return {
    fields: {
      bankingDegrees: hasBank
        ? {
            confidence: 'low',
            method: 'public-lidar-cross-section',
            source: 'derived',
            sourceDate: config.elevation.sourceDate,
            sourceLabel: `${config.elevation.sourceLabel}; 8 m cross-track section, planar residual and 2 degree signal gates`,
            sourceUrl: config.elevation.sourceUrl,
          }
        : null,
      elevationMeters: elevationSource,
      grade: {
        ...elevationSource,
        confidence: 'low',
        method: 'public-elevation-grid-gradient',
        source: 'derived',
        sourceLabel: `${config.elevation.sourceLabel}; circular median/weighted elevation smoothing and four-station centred gradient on the OSM-aligned centreline`,
      },
      usableWidthMeters: hasWidth
        ? {
            confidence: 'low',
            method: 'osm-width-tag-interpolation',
            source: 'observed',
            sourceDate: {
              precision: geometry.osmTimestamp ? 'day' : 'unavailable',
              value: geometry.osmTimestamp?.slice(0, 10) ?? null,
            },
            sourceLabel: 'OpenStreetMap raceway width tags mapped to the selected racing-course cycle',
            sourceUrl: OSM_COPYRIGHT_URL,
          }
        : null,
    },
    generatedAt,
    geometry: {
      alignmentError: geometry.alignment.error === null ? null : rounded(geometry.alignment.error, 6),
      attribution: '© OpenStreetMap contributors (ODbL)',
      measuredKm: rounded(geometry.measuredMeters / 1_000, 3),
      osmTimestamp: geometry.osmTimestamp,
      osmWayIds: geometry.wayIds,
    },
    id: config.id,
    sampleSpacingMeters: rounded(spacing, 3),
    sourceDetails: details,
    samples: geometry.samples.map((point, index) => ({
      bankingDegrees: banks[index] === null ? null : rounded(banks[index], 3),
      elevationMeters: rounded(elevations[index], 3),
      gradeFraction: rounded(grades[index], 6),
      progress: rounded(index / SAMPLE_COUNT, 8),
      usableWidthMeters:
        point.widthMeters === null ? null : rounded(point.widthMeters, 3),
    })),
  }
}

const results = []
for (const config of PROFILE_CONFIGS) {
  const result = await generateProfile(config)
  results.push(result)
  const elevations = result.samples.map(({ elevationMeters }) => elevationMeters)
  const grades = result.samples.map(({ gradeFraction }) => gradeFraction)
  console.log(
    `${config.id.padEnd(20)} ${result.geometry.measuredKm.toFixed(3)} km; elevation ${Math.min(...elevations).toFixed(1)}-${Math.max(...elevations).toFixed(1)} m; grade ${(Math.min(...grades) * 100).toFixed(1)}-${(Math.max(...grades) * 100).toFixed(1)}%; banks ${result.samples.filter(({ bankingDegrees }) => bankingDegrees !== null).length}; widths ${result.samples.filter(({ usableWidthMeters }) => usableWidthMeters !== null).length}`,
  )
}

const file = `// Generated by scripts/generate-measured-road-profiles.mjs.
// Do not edit samples by hand. The generated values are public-geodata
// observations/derivations, not FIA circuit-dossier survey records.
//
// Raceway geometry © OpenStreetMap contributors, ODbL:
// https://www.openstreetmap.org/copyright

export type MeasuredRoadProfileField = Readonly<{
  confidence: 'high' | 'medium' | 'low'
  method:
    | 'public-elevation-grid-interpolation'
    | 'public-elevation-grid-gradient'
    | 'public-lidar-cross-section'
    | 'osm-width-tag-interpolation'
  source: 'observed' | 'derived'
  sourceDate: Readonly<{
    precision: 'day' | 'year' | 'unavailable'
    value: string | null
  }>
  sourceLabel: string
  sourceUrl: string
}>

export type MeasuredRoadProfile = Readonly<{
  fields: Readonly<{
    bankingDegrees: MeasuredRoadProfileField | null
    elevationMeters: MeasuredRoadProfileField
    grade: MeasuredRoadProfileField
    usableWidthMeters: MeasuredRoadProfileField | null
  }>
  generatedAt: string
  geometry: Readonly<{
    alignmentError: number | null
    attribution: string
    measuredKm: number
    osmTimestamp: string | null
    osmWayIds: readonly number[]
  }>
  sampleSpacingMeters: number
  sourceDetails: readonly string[]
  /** progress, elevation m, grade fraction, bank deg or null, width m or null */
  samples: ReadonlyArray<readonly [number, number, number, number | null, number | null]>
}>

export const measuredRoadProfiles: Readonly<Record<string, MeasuredRoadProfile>> = {
${results.map(entryLiteral).join(',\n')}
}
`

await writeFile(OUTPUT_PATH, file)
console.log(`Generated ${results.length} measured road profiles in ${OUTPUT_PATH}`)
