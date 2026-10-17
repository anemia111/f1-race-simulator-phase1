import { registeredCourseCorners } from '../data/cornerReferences'
import type { TrackDefinition } from '../types'
import specsJson from '../data/expansionMachineSpecs2026.json'
import layoutsJson from '../data/expansionCourseLayouts.json'
import { tracks } from '../data/tracks'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { expansionCatalog, catalogCalendarFor } from './expansionCatalog'
import { alignExpansionControlLine } from '../data/expansionTiming'

export type TechnicalQuantity = {
  value: number | null
  upper?: number
  unit: string
  relation: string
  text: string
}
export type MachineSpecification = {
  categoryId: string
  name: string
  sourceId: string
  configuration?: string
  engineSupplier?: string
  mass: TechnicalQuantity
  length: TechnicalQuantity
  width: TechnicalQuantity
  height: TechnicalQuantity
  wheelbase: TechnicalQuantity
  displacement: TechnicalQuantity
  power: TechnicalQuantity
  gears: TechnicalQuantity
  engine: string
  architecture: string
  enginePosition: string | null
  notes: string
  massSourceId?: string
  driverEquivalencyPounds?: number
}
export const expansionMachineSpecifications = specsJson.machines as MachineSpecification[]
export const machineSpecificationSources = new Map(specsJson.sources.map((source) => [source.id, source]))

// hp/bhp and metric PS are different units. Published power is not wheel power
// or a calibrated event output; retain the original qualifier after conversion.
export function quantityInSI(quantity: TechnicalQuantity): TechnicalQuantity {
  const conversions: Record<string, [number, string]> = {
    mm: [0.001, 'm'], in: [0.0254, 'm'], lb: [0.45359237, 'kg'],
    PS: [0.73549875, 'kW'], hp: [0.7456998715822702, 'kW'], bhp: [0.7456998715822702, 'kW'],
    cc: [0.000001, 'm³'],
  }
  const [factor, unit] = conversions[quantity.unit] ?? [1, quantity.unit]
  return { ...quantity, value: quantity.value === null ? null : quantity.value * factor,
    ...(quantity.upper === undefined ? {} : { upper: quantity.upper * factor }), unit }
}

export function machineAssetsFor(categoryId: string) {
  const specifications = expansionMachineSpecifications.filter((spec) => spec.categoryId === categoryId)
  const category = expansionCatalog.categories.find((item) => item.id === categoryId)
  const identities = [...new Set(category?.entries.map((entry) => entry.machine).filter((name): name is string => !!name))]
  if (categoryId === 'indycar') return specifications
  return identities.map((name) => specifications.find((spec) => spec.name === name) ?? {
    categoryId, name, sourceId: category!.entries.find((entry) => entry.machine === name)!.sourceId,
    specificationUnavailable: true as const,
  })
}

export type ExpansionCourseAsset = {
  id: string
  name: string
  centerline: Array<[number, number]>
  corners?: TrackDefinition['corners']
  publishedLengthMeters: number | null
  measuredLengthMeters: number | null
  sourceUrl: string | null
  geometryStatus: 'existing-pack' | 'osm-centerline' | 'official-map-trace' | 'unavailable'
  notes: string
}
const existingTracks = new Map([...tracks, ...supportSeriesTracks].map((track) => [track.id, track]))
const existingTrackIds: Record<string, string> = {
  fuji: 'fuji-sf', motegi: 'motegi-sf', sugo: 'sugo-sf', autopolis: 'autopolis-sf',
  suzuka: 'suzuka-approx', spa: 'spa-approx', monza: 'monza-approx', cota: 'cota-approx',
  interlagos: 'interlagos-approx', barcelona: 'barcelona-approx',
}
const newLayouts = new Map(layoutsJson.layouts.map((layout) => [layout.id, layout]))
export function courseAssetsFor(categoryId: string): ExpansionCourseAsset[] {
  const unique = new Map(catalogCalendarFor(categoryId).map((event) => [
    event.trackKey.replace(/^milwaukee-race[12]$/, 'milwaukee'), event,
  ]))
  return [...unique].map(([id, event]) => {
    const existing = existingTracks.get(existingTrackIds[id])
    if (existing) return {
      id, name: event.trackName, corners: existing.corners?.map(corner => ({...corner, position: [corner.position[0], 0, -corner.position[2]]})), centerline: existing.centerline.map(([x, , z]) => [x, -z]),
      publishedLengthMeters: existing.lengthKm * 1000, measuredLengthMeters: null,
      sourceUrl: existing.layoutSource?.url ?? null, geometryStatus: 'existing-pack' as const,
      notes: '既存のコース形状。追加カテゴリーでの計測線・ピット運用・車両ペースは別途検証。',
    }
    const layout = newLayouts.get(id)
    if (layout) return {
      id, name: event.trackName, corners: registeredCourseCorners(id), centerline: alignExpansionControlLine(id, layout.centerlineMeters as Array<[number, number]>),
      publishedLengthMeters: layout.publishedLengthMeters, measuredLengthMeters: layout.measuredLengthMeters,
      sourceUrl: layout.geometrySourceUrl, geometryStatus: 'geometryBasis' in layout && layout.geometryBasis === 'official-map-trace' ? 'official-map-trace' as const : 'osm-centerline' as const, notes: layout.notes,
    }
    return { id, name: event.trackName, centerline: [], publishedLengthMeters: null,
      measuredLengthMeters: null, sourceUrl: null, geometryStatus: 'unavailable' as const,
      notes: '開催コースは確認済み。走路の閉ループ形状を検証中。' }
  })
}

export function coursePreviewPoints(course: ExpansionCourseAsset): string {
  if (!course.centerline.length) return ''
  const xs = course.centerline.map(([x]) => x)
  const ys = course.centerline.map(([, y]) => y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = 180 / Math.max(maxX - minX, maxY - minY, 1)
  return course.centerline.map(([x, y]) => `${100 + (x - (minX + maxX) / 2) * scale},${100 - (y - (minY + maxY) / 2) * scale}`).join(' ')
}

export const courseGeometryAttribution = layoutsJson.attribution
