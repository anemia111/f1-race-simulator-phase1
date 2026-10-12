/// <reference types="node" />
import {describe,it,expect} from 'vitest'
import {writeFileSync} from 'node:fs'
import {driverPool2026,seriesPackages,seatedDriverFrom} from '../series/seriesRegistry'
import {driverRatingReview,reviewedRating,migrateFactoryDriverRating,legacyCompactRating} from './reviewedDriverRatings'
import {expandedDriverSkills} from './driverProfiles'
import {driverAbilityCeiling,driverAbilityValue,clampPersonAbility,driverOverallAbilityPoints} from '../simulation/driverAbility'
import {createMotorsportConfig,motorsportDriver} from '../motorsport/packages'
import {behaviorDriverFor} from '../motorsport/driverBehavior'
import {createMotorsportRace} from '../motorsport/race'
import {parseMotorsportSave,serializeMotorsportSave} from '../motorsport/persistence'
import {initialDrivers} from './performanceCsv'
import {parsePersistedDriverRatings,serializeDriverRatings} from '../persistence'

describe('shared current-strength driver review',()=>{
  it('keeps all 348 identities and bounds every ordinary axis/potential to 100',()=>{
    expect(driverPool2026).toHaveLength(348)
    for(const person of driverPool2026){
      expect(person.overall).toBeLessThanOrEqual(driverAbilityCeiling(person.id))
      expect(person.potential).toBeLessThanOrEqual(driverAbilityCeiling(person.id))
      expect(Object.values(person.ratings).every(n=>n>=0&&n<=driverAbilityCeiling(person.id)/100)).toBe(true)
    }
    expect(driverPool2026.find(p=>p.id==='yuki_nakayama')?.ratings).toEqual(Object.fromEntries(Object.keys(driverPool2026[0].ratings).map(k=>[k,1.2])))
  })
  it('uses identical detailed axes for native seats and seats in another category',()=>{
    for(const series of seriesPackages)for(const driver of series.drivers){
      const pool=driverPool2026.find(p=>p.id===driver.id)!
      expect(driver.skills).toEqual(expandedDriverSkills(pool.ratings))
      expect(seatedDriverFrom(pool,{seriesId:series.id==='f1-custom'?'super-formula':'f1-custom',teamId:'other',carNumber:1}).skills).toEqual(driver.skills)
    }
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('routes the common values to %s force and behaviour drivers',category=>{
    const config=createMotorsportConfig(category)
    for(const entry of config.entries)for(const person of entry.drivers){
      const row=driverPool2026.find(p=>p.id===person.id)
      if(!row)continue
      expect(person.racePace).toBe(row.ratings.racePace)
      expect(person.qualifyingPace).toBe(row.ratings.qualifyingPace)
      expect(behaviorDriverFor(person).skills).toEqual(expandedDriverSkills(row.ratings))
    }
  })
  it('anchors SF near 85 and Juju in the KYOJO midfield, without changing ability on transfer',()=>{
    expect(reviewedRating('kakunoshin_ohta')?.overall).toBe(87)
    expect(reviewedRating('tomoki_nojiri')?.overall).toBe(85)
    expect(reviewedRating('juju_noda')?.overall).toBe(64)
    expect(reviewedRating('expansion_rio_shimono')?.overall).toBe(70)
    const kyojo=driverRatingReview.drivers.filter(d=>d.seriesIds.some(s=>s.includes('kyojo')))
    expect(kyojo.every(d=>d.overall<=70)).toBe(true)
    expect(reviewedRating('expansion_alex_palou')?.overall).toBe(95)
  })
  it('migrates whole old defaults and preserves a single manually edited axis',()=>{
    const original=initialDrivers.find(d=>d.id==='max_verstappen')!
    const base=seriesPackages[0].drivers.find(d=>d.id===original.id)!
    expect(migrateFactoryDriverRating(original).skills).toEqual(base.skills)
    const custom={...original,skills:{...original.skills,wetSkill:0.55}}
    expect(migrateFactoryDriverRating(custom).skills).toEqual(custom.skills)
    expect(parsePersistedDriverRatings(JSON.stringify(serializeDriverRatings([original])),[base])[0].skills).toEqual(base.skills)
    expect(parsePersistedDriverRatings(JSON.stringify(serializeDriverRatings([custom])),[base])[0].skills).toEqual(custom.skills)
  })
  it('upgrades saved extra-category factory values while preserving manual pace and setup',()=>{
    const config=createMotorsportConfig('kyojo'),person=config.entries[0].drivers[0]
    const old=legacyCompactRating(person.id)!
    const review=driverRatingReview.drivers.find(r=>r.id===person.id)!
    config.entries[0].drivers[0]={...person,overall:review.previousOverall,racePace:old.racePace,qualifyingPace:old.qualifyingPace,consistency:old.consistency,tyreManagement:old.tyreManagement}
    const state=createMotorsportRace(config)
    expect(parseMotorsportSave(serializeMotorsportSave(config,state))?.config.entries[0].drivers[0].overall).toBe(person.overall)
    config.entries[0].drivers[0].racePace=0.53
    expect(parseMotorsportSave(serializeMotorsportSave(config,state))?.config.entries[0].drivers[0].racePace).toBe(0.53)
  })
  it('enforces identity limits even when an old normal driver contains 120',()=>{
    const driver=seriesPackages[0].drivers.find(d=>d.id==='max_verstappen')!
    expect(driverAbilityValue({...driver,skills:{...driver.skills,racePace:1.2}},'racePace')).toBe(1)
    expect(clampPersonAbility(driver.id,1.2)).toBe(1)
    expect(clampPersonAbility('yuki_nakayama',1.2)).toBe(1.2)
  })
  it('exports a complete inspectable audit with inherited evidence separated',()=>{
    const lines=['# Driver rating review · 2026-10-13','', 'All values are SIM editorial priors. Same identity uses the same ability in every category. Official results do not measure isolated driver skill. Retained rows are not individually revalidated.','', '| Driver | Common OVR | Runtime group mean | Status | Categories |','|---|---:|---:|---|---|']
    for(const p of [...driverPool2026].sort((a,b)=>b.overall-a.overall||a.id.localeCompare(b.id))){
      const d=seatedDriverFrom(p,{seriesId:'f1-custom',teamId:'audit',carNumber:1}),r=driverRatingReview.drivers.find(r=>r.id===p.id)
      lines.push(`| ${p.name} | ${p.overall} | ${driverOverallAbilityPoints(d)} | ${r?.status??'retained-unverified'} | ${[...new Set(p.careerHistory.map(c=>c.seriesId))].join(', ')} |`)
    }
    if(process.env.DRIVER_REVIEW_REPORT)writeFileSync(process.env.DRIVER_REVIEW_REPORT,lines.join('\n')+'\n')
    expect(motorsportDriver('Alex Palou').overall).toBe(95)
  })
})
