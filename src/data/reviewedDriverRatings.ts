import imported from './importedDriverRatings2026.json'
import review from './driverRatingsReview2026.json'
import previousReview from './driverRatingsReviewPrevious20261013.json'
import {expandedDriverSkills, type CompactDriverRatings} from './driverProfiles'
import type {Driver} from '../types'
import type {DriverPoolRecord} from '../series/driverPool'
import type {MotorsportDriver} from '../motorsport/types'
import {clampPersonAbility,driverAbilityCeiling} from '../simulation/driverAbility'

export const DRIVER_RATING_REVIEW_VERSION = '2026-10-13.2'
export const driverRatingReview = review
export const DRIVER_DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  yuki_nakayama: 'Yuki Nakayama',
}
export const driverDisplayName = (id: string, fallback: string) =>
  DRIVER_DISPLAY_NAME_OVERRIDES[id] ?? fallback
export const driverDisplayCode = (id: string, fallback: string) =>
  id === 'yuki_nakayama' ? 'NAK' : fallback
const authored = new Map(imported.drivers.map(row => [row.id, row]))
const revised = new Map(review.drivers.map(row => [row.id, row]))
const previousReviewed = new Map(previousReview.drivers.map(row => [row.id, row]))
const previousNative = new Map<string, Driver[]>()
const columns: Record<keyof CompactDriverRatings, string> = {qualifyingPace:'Qualifying pace',racePace:'Race pace',consistency:'Consistency',tyreManagement:'Tyre management',wetSkill:'Wet skill',raceStart:'Race start',overtaking:'Overtaking',defending:'Defending',technicalFeedback:'Technical feedback',adaptability:'Adaptability',experience:'Experience',errorControl:'Error control'}
function performanceSource(row: NonNullable<ReturnType<typeof reviewedRating>>) {
  return {fileName:'src/data/driverRatingsReview2026.json',overall:row.overall,
    rawRatings:{Overall:row.overall,Potential:row.potential??row.overall,...Object.fromEntries(Object.entries(columns).map(([key,column])=>[column,row.ratings[key as keyof CompactDriverRatings]*100]))}}
}

/** Explicit editorial dataset; no category-dependent runtime rating deduction. */
export function reviewedRating(id: string) {
  return revised.get(id) ?? authored.get(id)
}

export function reviewFactoryDriver(driver: Driver): Driver {
  driver = {...driver, code: driverDisplayCode(driver.id, driver.code)}
  previousNative.set(driver.id, [...(previousNative.get(driver.id)??[]),driver])
  const row = reviewedRating(driver.id)
  if (!row) return {...driver, name: driverDisplayName(driver.id, driver.name)}
  return {...driver, name: driverDisplayName(driver.id, driver.name), skills: expandedDriverSkills(row.ratings), potential: (row.potential ?? row.overall) / 100,
    performanceSource: performanceSource(row)}
}

export function reviewPoolDriver(driver: DriverPoolRecord): DriverPoolRecord {
  const row = reviewedRating(driver.id)
  if (!row) return driver
  const revision = revised.get(driver.id)
  const id = `rating-review:${DRIVER_RATING_REVIEW_VERSION}:${driver.id}`
  return {...driver, name: driverDisplayName(driver.id, driver.name), code: driverDisplayCode(driver.id, driver.code), overall: row.overall, potential: row.potential ?? row.overall, ratings: {...row.ratings},
    ratingSourceProvenanceId: id, provenance: [...driver.provenance, {
      id, sourceType: 'editorial', sourceDate: '2026-10-13', sourceSeason: 2026,
      sourceSeriesId: driver.provenance[0].sourceSeriesId, sourceFile: revision ? 'src/data/driverRatingsReview2026.json' : 'src/data/importedDriverRatings2026.json',
      sourceIds: revision?.sources ?? [authored.get(driver.id)?.raw['Source URL'] || 'user-authored-rating'],
      confidence: 'low', methodVersion: revision ? review.method : 'restore-authored-cross-category-values',
    }]}
}

/** Upgrade only a whole, recognizable factory profile; keep any manual tune. */
export function migrateFactoryDriverRating(driver: Driver): Driver {
  const code = driverDisplayCode(driver.id, driver.code)
  if (code !== driver.code) driver = {...driver, code}
  const row = reviewedRating(driver.id)
  const name = driverDisplayName(driver.id, driver.name)
  if (!row) return name === driver.name ? driver : {...driver, name}
  const same = (skills: Driver['skills']) => Object.keys(skills).every(key =>
    Math.abs(driver.skills[key as keyof typeof skills] - skills[key as keyof typeof skills]) < 1e-9)
  const old = previousNative.get(driver.id)
  const source = authored.get(driver.id)
  const prior = previousReviewed.get(driver.id)
  if (!old?.some(d=>same(d.skills)) && !(source && same(expandedDriverSkills(source.ratings))) && !(prior && same(expandedDriverSkills(prior.ratings)))) return name === driver.name ? driver : {...driver, name}
  const defaultPotential=old?.some(d=>d.potential===driver.potential) || driver.potential===(source?.potential??source?.overall??NaN)/100 || driver.potential===(prior?.potential??NaN)/100
  return {...driver, name, skills: expandedDriverSkills(row.ratings), potential: defaultPotential?(row.potential ?? row.overall) / 100:driver.potential,
    performanceSource: performanceSource(row)}
}

export function legacyCompactRating(id: string): CompactDriverRatings | undefined {
  return authored.get(id)?.ratings
}

export const reviewedDriverPreviousOverall = (id: string) => authored.get(id)?.overall

/** Older extra-category saves used either the imported row or the old native
 * pool winner. Match all stored driving axes and OVR, never a surname or rank. */
export function migrateMotorsportDriverRating(driver:MotorsportDriver):MotorsportDriver {
  driver={...driver,name:driverDisplayName(driver.id,driver.name)}
  const row=reviewedRating(driver.id)
  const source=authored.get(driver.id)
  const prior=previousReviewed.get(driver.id)
  const keys=['racePace','consistency','tyreManagement','qualifyingPace'] as const
  const previous=[...(source?[{overall:source.overall,...source.ratings}]:[]),...(prior?[{overall:prior.overall,...prior.ratings}]:[]),...(previousNative.get(driver.id)??[]).map(d=>({
    overall:d.performanceSource?.overall,racePace:d.skills.racePace,qualifyingPace:d.skills.qualifyingPace,
    consistency:d.skills.consistency,tyreManagement:d.skills.tireManagement,
  }))]
  const factory=!driver.skills&&row&&previous.some(old=>driver.overall===old.overall && keys.every(key=>driver[key]!==undefined&&driver[key]!==null&&Math.abs(driver[key]!-old[key])<1e-9))
  if(factory)return {...driver,overall:row.overall,racePace:row.ratings.racePace,consistency:row.ratings.consistency,
    tyreManagement:row.ratings.tyreManagement,qualifyingPace:row.ratings.qualifyingPace,ratingSource:'src/data/driverRatingsReview2026.json'}
  return {...driver,overall:driver.overall===null?null:Math.min(driverAbilityCeiling(driver.id),driver.overall),
    racePace:driver.racePace===null?null:clampPersonAbility(driver.id,driver.racePace),
    consistency:driver.consistency===null?null:clampPersonAbility(driver.id,driver.consistency),
    tyreManagement:driver.tyreManagement===null?null:clampPersonAbility(driver.id,driver.tyreManagement),
    ...(driver.qualifyingPace===undefined||driver.qualifyingPace===null?{}:{qualifyingPace:clampPersonAbility(driver.id,driver.qualifyingPace)})}
}
