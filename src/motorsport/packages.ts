import { catalogCalendarFor, catalogDriverId, catalogPoolDriverById, expansionCatalog } from '../series/expansionCatalog'
import { courseAssetsFor, expansionMachineSpecifications, machineSpecificationSources, quantityInSI } from '../series/expansionAssets'
import type { MachineSpecification } from '../series/expansionAssets'
import eventFormats from '../data/motorsportEventFormats2026.json'
import lemansEntries from '../data/lemansEntries2026.json'
import indyEntries from '../data/indyEventEntries2026.json'
import wecEntries from '../data/wecEventEntries2026.json'
import type { ChampionshipId, EvidenceValue, MotorsportClass, MotorsportCourse, MotorsportDriver, MotorsportEntry, MotorsportEvent, MotorsportMachine, MotorsportRaceConfig } from './types'

export const motorsportChampionships = [
  { id: 'kyojo' as const, label: 'KYOJO CUP', categories: ['kyojo'] },
  { id: 'super-gt' as const, label: 'SUPER GT · GT500 / GT300', categories: ['super-gt-gt500', 'super-gt-gt300'] },
  { id: 'wec' as const, label: 'FIA WEC · Hypercar / LMGT3', categories: ['wec-hypercar', 'wec-lmgt3'] },
  { id: 'indycar' as const, label: 'NTT INDYCAR SERIES', categories: ['indycar'] },
]
const classes: Record<string, MotorsportClass> = { kyojo: 'kyojo', 'super-gt-gt500': 'gt500', 'super-gt-gt300': 'gt300', 'wec-hypercar': 'hypercar', 'wec-lmgt3': 'lmgt3', indycar: 'indycar' }
const categoryForClass: Record<MotorsportClass, string> = { kyojo: 'kyojo', gt500: 'super-gt-gt500', gt300: 'super-gt-gt300', hypercar: 'wec-hypercar', lmgt3: 'wec-lmgt3', lmp2: 'wec-lmp2', indycar: 'indycar' }
export const simulatedValue = (value: number, source = 'Public specifications do not establish this parameter; explicit SIM calibration'): EvidenceValue => ({ value, basis: 'simulation', source })
const classSimulation: Record<MotorsportClass, { mass: number; power: number; gears: number; drag: number; lift: number; mu: number; fuel: number; consumption: number }> = {
  kyojo: { mass: 635, power: 131.243, gears: 6, drag: 0.63, lift: 0.9, mu: 1.45, fuel: 24, consumption: 0.22 },
  gt500: { mass: 1020, power: 405, gears: 6, drag: 1.05, lift: 4.3, mu: 1.7, fuel: 75, consumption: 0.38 },
  gt300: { mass: 1300, power: 360, gears: 6, drag: 0.88, lift: 2.0, mu: 1.5, fuel: 75, consumption: 0.32 },
  hypercar: { mass: 1040, power: 520, gears: 7, drag: 0.92, lift: 3.7, mu: 1.7, fuel: 65, consumption: 0.34 },
  lmgt3: { mass: 1320, power: 360, gears: 6, drag: 0.88, lift: 2.0, mu: 1.5, fuel: 75, consumption: 0.32 },
  lmp2: { mass: 950, power: 400, gears: 6, drag: 0.85, lift: 3.5, mu: 1.65, fuel: 56.25, consumption: 0.32 },
  indycar: { mass: 809.662, power: 485, gears: 6, drag: 0.9, lift: 3.1, mu: 1.7, fuel: 53, consumption: 0.31 },
}
const colors = ['#42d6c4', '#ffbe44', '#ea6372', '#97afff', '#cf8cff', '#72d18d', '#ef9766', '#67bedf']
function reference(spec: MachineSpecification | undefined, field: 'mass' | 'power' | 'gears', fallback: number): EvidenceValue {
  const quantity = spec ? quantityInSI(spec[field]) : null
  if (!quantity || quantity.value === null) return simulatedValue(fallback)
  return { value: quantity.value, basis: 'manufacturer-reference', source: `${machineSpecificationSources.get(spec![field === 'mass' ? 'massSourceId' : 'sourceId'] ?? spec!.sourceId)?.url ?? spec!.sourceId} · ${quantity.relation}` }
}
export function motorsportMachine(name: string, classId: MotorsportClass, engine?: string, kind: MotorsportCourse['kind'] = 'road'): MotorsportMachine {
  const base = classSimulation[classId]
  const configuration = kind === 'speedway' ? 'speedway' : kind === 'short-oval' ? 'short-oval' : 'road-street'
  const spec = expansionMachineSpecifications.find(item => classId === 'indycar'
    ? item.categoryId === 'indycar' && item.engineSupplier === engine && item.configuration === configuration
    : item.categoryId === categoryForClass[classId] && item.name === name)
  const mass = reference(spec, 'mass', base.mass)
  const isOval = kind === 'speedway' || kind === 'short-oval'
  const hybridReference = (spec as MachineSpecification & { hybridPowerKw?: number } | undefined)?.hybridPowerKw
  const lmdh = classId === 'hypercar' && /963|V-Series|ARX-06|M Hybrid|A424|GMR-001/i.test(name)
  const hybridPower = hybridReference ?? (classId === 'hypercar' && !/Valkyrie/i.test(name) ? /Toyota|499P|9X8/i.test(name) ? 200 : 50 : classId === 'indycar' ? 44.74 : 0)
  return {
    id: `${classId}:${name}:${classId === 'indycar' ? configuration : ''}`, name: spec?.name ?? name, classId,
    massKg: mass, powerKw: reference(spec, 'power', base.power), gears: reference(spec, 'gears', base.gears),
    driverMassKg: classId === 'indycar' ? { value: 185 * 0.45359237, basis: 'published', source: 'INDYCAR 2026 rule 14.4 · driver equivalency 185lb' } : simulatedValue(classId === 'kyojo' ? 60 : 82, 'SIM occupant/ballast reference added separately to vehicle mass; not measured driver weight'),
    dragAreaM2: simulatedValue(classId === 'indycar' && isOval ? kind === 'speedway' ? 0.56 : 0.74 : base.drag),
    liftAreaM2: simulatedValue(classId === 'indycar' && isOval ? kind === 'speedway' ? 1.4 : 1.8 : base.lift),
    tyreMu: simulatedValue(classId === 'indycar' && isOval ? kind === 'speedway' ? 1.45 : 1.4 : base.mu), fuelCapacityKg: simulatedValue(base.fuel, classId === 'lmp2' ? 'WEC 2026 D12: maximum 75L; SIM density 0.75kg/L converts volume to fuel mass, not measured batch density' : undefined), fuelKgPerKm: simulatedValue(base.consumption),
    hybridPowerKw: hybridReference === undefined ? simulatedValue(hybridPower) : { value: hybridPower, basis: 'manufacturer-reference', source: machineSpecificationSources.get(spec!.sourceId)?.url ?? spec!.sourceId }, hybridCapacityMj: lmdh ? {value:4.86,basis:'manufacturer-reference',source:'https://newsroom.porsche.com/en_US/2025/company/porsche-963-rsp-39683.html · common LMDh 1.35 kWh battery'} : simulatedValue(hybridPower === 0 ? 0 : classId === 'indycar' ? 0.32 : 4),
    hybridRecoveryPowerKw: lmdh ? {value:200,basis:'manufacturer-reference',source:'https://www.bosch.fr/actualites/2026/24h-du-mans/'} : simulatedValue(hybridPower),
    hybridMinimumSpeedKph: simulatedValue(classId==='hypercar' && !lmdh && hybridPower>0 ? 190 : 0,'SIM deployment gate; 190 km/h LMH manufacturer reference, exact 2026 event BoP must override'),
    virtualEnergyCapacityMj: classId === 'hypercar' || classId === 'lmgt3' ? simulatedValue(classId === 'hypercar' ? 900 : 700, 'SIM stint-energy reference; event BoP must replace this value') : null,
    notes: [spec?.notes ?? 'Individual technical specification is unavailable; class SIM references are explicit.',
      'Aero, tyre, fuel consumption and energy maps are simulation estimates. Reference output is not an event BoP.',
      ...(classId === 'hypercar' ? ['Hybrid power is part of the combined power cap, never added on top.'] : [])],
  }
}
export function motorsportDriver(name: string): MotorsportDriver {
  const id = catalogDriverId(name)
  const person = catalogPoolDriverById.get(id)
  return { id, name: person?.name ?? name, overall: person?.overall ?? null,
    racePace: person?.ratings.racePace ?? null, consistency: person?.ratings.consistency ?? null,
    qualifyingPace: person?.ratings.qualifyingPace ?? null,
    tyreManagement: person?.ratings.tyreManagement ?? null,
    ratingSource: person?.provenance.find(source => source.id === person.ratingSourceProvenanceId)?.sourceFile ?? null }
}
export function motorsportEntries(championship: ChampionshipId, kind: MotorsportCourse['kind'] = 'road', courseId?: string, round?: number): MotorsportEntry[] {
  const indyEvent = championship === 'indycar' && round !== undefined ? indyEntries.events.find(event => event.round === round) : undefined
  if (indyEvent) return indyEvent.entries.map((entry, index) => ({
    id: `indycar:${entry.number}`, number: entry.number, team: entry.team, color: colors[index % colors.length], classId: 'indycar',
    machine: motorsportMachine(`Dallara IR-18 / ${entry.engine}`, 'indycar', entry.engine, kind),
    drivers: [motorsportDriver(entry.name)], sourceUrl: indyEvent.sourceUrl,
  }))
  const wecCourseSlug: Record<string, string> = { imola: '6-hours-of-imola', spa: 'totalenergies-6-hours-of-spa-francorchamps', 'spa-francorchamps': 'totalenergies-6-hours-of-spa-francorchamps', 'le-mans': '24-hours-of-le-mans', interlagos: 'rolex-6-hours-of-sao-paulo', cota: 'lone-star-le-mans', fuji: '6-hours-of-fuji', barcelona: '6-hours-of-barcelona' }
  const wecEvent = championship === 'wec' && courseId ? wecEntries.events.find(event => event.eventUrl.endsWith(`/${wecCourseSlug[courseId]}-2026`)) : undefined
  if (wecEvent) return wecEvent.entries.map((entry, index) => ({
    id: `wec-${entry.classId}:${entry.number}`, number: entry.number, team: entry.team,
    color: colors[index % colors.length], classId: entry.classId as MotorsportClass,
    machine: motorsportMachine(entry.machine, entry.classId as MotorsportClass),
    drivers: entry.drivers.map(driver => ({ ...motorsportDriver(driver.name === 'TBA' ? `TBA #${entry.number}` : driver.name), fiaGrade: ['P', 'G', 'S', 'B'].includes(driver.grade) ? driver.grade as 'P' | 'G' | 'S' | 'B' : undefined })),
    sourceUrl: wecEvent.sourceUrl,
  }))
  if (championship === 'wec' && courseId === 'le-mans') return lemansEntries.entries.map((entry, index) => ({
    id: `wec-${entry.classId}:${entry.number}`, number: entry.number, team: entry.team,
    color: colors[index % colors.length], classId: entry.classId as MotorsportClass,
    machine: motorsportMachine(entry.machine, entry.classId as MotorsportClass),
    drivers: entry.drivers.map(driver => ({ ...motorsportDriver(driver.name), fiaGrade: driver.grade as 'P' | 'G' | 'S' | 'B' })),
    sourceUrl: lemansEntries.sourceUrl,
  }))
  const categories = motorsportChampionships.find(item => item.id === championship)!.categories
  return categories.flatMap(categoryId => {
    const category = expansionCatalog.categories.find(item => item.id === categoryId)!
    return category.entries.map((entry, index) => ({
      id: `${categoryId}:${entry.number}`, number: entry.number, team: entry.team ?? 'Team unconfirmed',
      color: colors[index % colors.length], classId: classes[categoryId],
      machine: motorsportMachine(entry.machine ?? `Dallara IR-18 / ${entry.engine ?? 'Engine unconfirmed'}`, classes[categoryId], entry.engine ?? undefined, kind),
      drivers: entry.drivers.map(motorsportDriver), sourceUrl: expansionCatalog.sources.find(source => source.id === entry.sourceId)?.url ?? '',
    }))
  })
}
const ovalIds = new Set(['phoenix', 'indianapolis-500', 'indy-500', 'indianapolis-oval', 'wwtr', 'nashville', 'milwaukee'])
const streetIds = new Set(['st-petersburg', 'arlington', 'long-beach', 'detroit', 'toronto', 'washington-dc', 'markham'])
export function motorsportCourses(championship: ChampionshipId): MotorsportCourse[] {
  const category = motorsportChampionships.find(item => item.id === championship)!.categories[0]
  return courseAssetsFor(category).filter(asset => asset.centerline.length >= 3 && asset.publishedLengthMeters !== null).map(asset => {
    const kind = ovalIds.has(asset.id) ? /indianapolis|indy-500|nashville/.test(asset.id) ? 'speedway' as const : 'short-oval' as const : streetIds.has(asset.id) ? 'street' as const : 'road' as const
    const banking = asset.id === 'nashville' ? { value: 14, basis: 'published' as const, source: 'https://www.nashvillesuperspeedway.com/media/track-facts/track-facts.html · turn banking; transitions derived' }
      : asset.id === 'milwaukee' ? { value: 9, basis: 'published' as const, source: 'https://www.indycar.com/News/2013/06/6-15-Milwaukee-IndyFest-race-setup · nominal turn banking; transitions derived' }
        : asset.id === 'wwtr' ? simulatedValue(10, 'https://www.indycar.com/News/2023/08/08-22-Setup-WWTR · published 11 / 9 degree turns, uniform mean is an approximation')
        : asset.id === 'phoenix' ? simulatedValue(10, 'https://www.phoenixraceway.com/about-phoenix-raceway/ · published 0..11 degree range; uniform 10 degree turn approximation')
      : /indianapolis-500|indy-500|indianapolis-oval/.test(asset.id) ? { value: 9.2, basis: 'published' as const, source: 'https://www.indycar.com/News/2023/05/05-19-Setup-Indy · turns; straights flat' } : simulatedValue(0, 'No verified banking profile; neutral SIM profile')
    return { id: asset.id, name: asset.name, lengthM: asset.publishedLengthMeters!, points: asset.centerline,
      kind, sourceUrl: asset.sourceUrl ?? '', geometryBasis: asset.geometryStatus,
      pitEntry: simulatedValue(0.92, 'SIM pit entry fraction; not a surveyed timing reference'),
      pitExit: simulatedValue((0.92 + 500 / asset.publishedLengthMeters!) % 1, 'SIM exit derived from 500m lane distance; no arbitrary fraction of the lap is skipped'),
      pitLengthM: simulatedValue(500), pitSpeedKph: simulatedValue(championship === 'indycar' ? 60 : 60),
      bankingDegrees: banking, widthM: simulatedValue(kind === 'street' ? 10 : 12),
    }
  })
}
export function motorsportEvents(championship: ChampionshipId): MotorsportEvent[] {
  const category = motorsportChampionships.find(item => item.id === championship)!.categories[0]
  return catalogCalendarFor(category).flatMap(event => {
    const sourceUrl = event.url ?? expansionCatalog.sources.find(source => source.id === event.sourceId)?.url ?? ''
    const base = { championship, round: event.round, dateLabel: event.dateLabel, courseId: event.trackKey.replace(/^milwaukee-race[12]$/, 'milwaukee'), sourceUrl }
    if (championship === 'kyojo') return [10, 15].map((laps, index) => ({ ...base,
      id: `kyojo:${event.round}:${index === 0 ? 'sprint' : 'final'}`, label: `Rd.${event.round} ${index === 0 ? 'Sprint' : 'Final'}`,
      format: { kind: 'laps' as const, laps, basis: 'https://kyojocup.jp/report/40.html / https://kyojocup.jp/report/41.html' } }))
    const indyFormat = eventFormats.indycar.find(item => item.courseId === event.trackKey)
    const gtHours = event.raceName?.match(/(\d+)Hours/)
    const gtKm = event.raceName?.match(/(\d+)km/)
    const course = motorsportCourses(championship).find(item => item.id === base.courseId)
    return [{ ...base, id: `${championship}:${event.round}`, label: `Rd.${event.round} ${event.trackName}`,
      format: championship === 'wec' ? { kind: 'time' as const, seconds: event.trackKey === 'le-mans' ? 86400 : 21600, basis: sourceUrl }
        : championship === 'indycar' && indyFormat ? { kind: 'laps' as const, laps: indyFormat.laps, basis: indyFormat.url }
          : gtHours ? { kind: 'time' as const, seconds: Number(gtHours[1]) * 3600, basis: sourceUrl }
            : { kind: 'laps' as const, laps: Math.ceil(Number(gtKm?.[1] ?? 300) * 1000 / (course?.lengthM ?? 5000)), basis: `${sourceUrl} · derived from published kilometre distance / lap length; supplementary regulations may differ` } }]
  }).sort((a, b) => a.round - b.round)
}
export function createMotorsportConfig(championship: ChampionshipId, eventId?: string): MotorsportRaceConfig {
  const events = motorsportEvents(championship)
  const event = events.find(item => item.id === eventId) ?? events[0]
  const course = motorsportCourses(championship).find(item => item.id === event.courseId)
  if (!course) throw new Error(`Course geometry is not available for ${event.label}`)
  const entries = motorsportEntries(championship, course.kind, course.id, event.round)
    .filter(entry => championship !== 'kyojo' || event.round !== 1 || !['4', '57'].includes(entry.number))
  return { schemaVersion: 1, seed: 'motorsport-2026', championship, eventId: event.id, course, entries,
    format: event.format, start: 'rolling', weather: 'dry', startFuelFraction: 1,
    maximumStintSeconds: null, minimumDriverSeconds: null, maximumDriverSeconds: null }
}
