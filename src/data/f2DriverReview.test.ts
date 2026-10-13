import { describe, expect, it } from 'vitest'
import audit from './f2DriverRatingAudit20261013.json'
import before from './driverRatingsReviewBeforeF220261013.json'
import historical from './historicalDriverPool2026.json'
import { expandedDriverSkills } from './driverProfiles'
import { driverRatingReview, migrateFactoryDriverRating, migrateMotorsportDriverRating, reviewedRating } from './reviewedDriverRatings'
import { driverPool2026, seatedDriverFrom } from '../series/seriesRegistry'
import { driverOverallAbilityPoints } from '../simulation/driverAbility'
import { behaviorDriverFor } from '../motorsport/driverBehavior'
import { createMotorsportConfig, motorsportDriver } from '../motorsport/packages'
import { createMotorsportRace } from '../motorsport/race'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import { parsePersistedDriverRatings, serializeDriverRatings } from '../persistence'

describe('F2 common ability review and live seat propagation', () => {
  it('covers all 23 participants with distinct Emerson/Enzo identities and bounded shared axes', () => {
    expect(audit.drivers).toHaveLength(23)
    expect(new Set(audit.drivers.map(row=>row.id)).size).toBe(23)
    expect(audit.drivers.some(row=>row.id==='expansion_emerson_fittipaldi_jr')).toBe(true)
    expect(audit.drivers.some(row=>row.id==='enzo_fittipaldi')).toBe(false)
    expect(driverPool2026.some(person=>person.id==='enzo_fittipaldi')).toBe(true)
    for(const row of audit.drivers) {
      const person=driverPool2026.find(person=>person.id===row.id)!
      expect(person.overall).toBe(row.reviewedOverall)
      expect(Object.values(person.ratings).every(value=>value>=0&&value<=1)).toBe(true)
      expect(driverRatingReview.drivers.find(person=>person.id===row.id)!.sources).toContain('https://www.fiaformula2.com/en/standings/2026/drivers')
    }
  })

  it.each(['f1-custom','super-formula'] as const)('routes every reviewed person and updates whole prior defaults in %s seats', seriesId => {
    for(const row of before.drivers) {
      const pool=driverPool2026.find(person=>person.id===row.id)!
      const current=seatedDriverFrom(pool,{seriesId,teamId:'audit',carNumber:1})
      expect(driverOverallAbilityPoints(current)).toBe(pool.overall)
      const previous={...current,skills:expandedDriverSkills(row.ratings),potential:row.potential/100}
      expect(migrateFactoryDriverRating(previous).skills).toEqual(current.skills)
      expect(parsePersistedDriverRatings(JSON.stringify(serializeDriverRatings([previous])),[current])[0].skills).toEqual(current.skills)
      const edited={...previous,skills:{...previous.skills,throttleControl:0.51},potential:0.99}
      expect(migrateFactoryDriverRating(edited).skills).toEqual(edited.skills)
      expect(migrateFactoryDriverRating(edited).potential).toBe(0.99)
    }
  })

  it('upgrades old F2 history defaults while keeping the historical source artifact and manual edits', () => {
    for(const row of historical.drivers.filter(row=>row.provenance.some(source=>source.sourceSeriesId==='f2'))) {
      const pool=driverPool2026.find(person=>person.id===row.id)!
      const current=seatedDriverFrom(pool,{seriesId:'f1-custom',teamId:'audit',carNumber:1})
      const previous={...current,skills:expandedDriverSkills(row.ratings)}
      expect(migrateFactoryDriverRating(previous).skills).toEqual(current.skills)
      const edited={...previous,skills:{...previous.skills,brakingSkill:0.52}}
      expect(migrateFactoryDriverRating(edited).skills).toEqual(edited.skills)
    }
    expect(historical.drivers.find(row=>row.id==='rafael_camara')!.overall).toBe(75)
  })

  it('updates every whole compact/detailed extra-category default and preserves single-field edits', () => {
    for(const row of before.drivers) {
      const person=motorsportDriver(driverPool2026.find(person=>person.id===row.id)!.name)
      const previous={...person,overall:row.overall,racePace:row.ratings.racePace,qualifyingPace:row.ratings.qualifyingPace,
        consistency:row.ratings.consistency,tyreManagement:row.ratings.tyreManagement}
      for(const old of [previous,{...previous,skills:expandedDriverSkills(row.ratings)}]) {
        const next=migrateMotorsportDriverRating(old)
        expect(next.overall).toBe(reviewedRating(row.id)!.overall)
        expect(behaviorDriverFor(next).skills).toEqual(expandedDriverSkills(reviewedRating(row.id)!.ratings))
      }
      const edited={...previous,skills:{...expandedDriverSkills(row.ratings),throttleControl:0.51}}
      expect(migrateMotorsportDriverRating(edited).skills).toEqual(edited.skills)
      expect(migrateMotorsportDriverRating({...previous,qualifyingPace:0.51}).qualifyingPace).toBe(0.51)
    }
  })

  it.each(['kyojo','super-gt','wec','indycar'] as const)('restores revised detailed F2 abilities from an actual %s save', category => {
    const row=before.drivers.find(row=>row.id==='dino_beganovic')!
    const config=createMotorsportConfig(category)
    const person=motorsportDriver('Dino Beganovic')
    config.entries[0].drivers[0]={...person,overall:row.overall,racePace:row.ratings.racePace,
      qualifyingPace:row.ratings.qualifyingPace,consistency:row.ratings.consistency,tyreManagement:row.ratings.tyreManagement,
      skills:expandedDriverSkills(row.ratings)}
    const saved=parseMotorsportSave(serializeMotorsportSave(config,createMotorsportRace(config)))!
    expect(saved).not.toBeNull()
    const restored=saved.config.entries[0].drivers[0]
    expect(restored.overall).toBe(85)
    expect(restored.skills).toEqual(expandedDriverSkills(reviewedRating(row.id)!.ratings))
  })
})
