/// <reference types="node" />
import {describe,it,expect} from 'vitest'
import previousReview from './driverRatingsReviewPrevious20261013.json'
import {writeFileSync} from 'node:fs'
import {driverPool2026,seriesPackages,seatedDriverFrom} from '../series/seriesRegistry'
import {driverRatingReview,reviewedRating,migrateFactoryDriverRating,legacyCompactRating,reviewedDriverPreviousOverall} from './reviewedDriverRatings'
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
  it('uses the requested Yuki Nakayama display name and keeps ability120 in all categories',()=>{
    expect(seriesPackages.flatMap(s=>s.drivers).find(d=>d.id==='yuki_nakayama')?.name).toBe('Yuki Nakayama')
    expect(driverPool2026.find(d=>d.id==='yuki_nakayama')?.name).toBe('Yuki Nakayama')
    expect(driverPool2026.find(d=>d.id==='yuki_nakayama')?.code).toBe('NAK')
    expect(seriesPackages.flatMap(s=>s.drivers).filter(d=>d.id==='yuki_nakayama').every(d=>d.code==='NAK')).toBe(true)
    expect(clampPersonAbility('yuki_nakayama',1.2)).toBe(1.2)
    expect(reviewedDriverPreviousOverall('yuki_nakayama')).toBe(120)
    const historicalSaveName={...seriesPackages[0].drivers.find(d=>d.id==='yuki_nakayama')!,name:'yukinakayama',code:'YUK'}
    expect(migrateFactoryDriverRating(historicalSaveName).name).toBe('Yuki Nakayama')
    expect(migrateFactoryDriverRating(historicalSaveName).code).toBe('NAK')
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
  it('anchors SF near 85 and Juju at the user-requested67, without changing ability on transfer',()=>{
    expect(reviewedRating('kakunoshin_ohta')?.overall).toBe(87)
    expect(reviewedRating('tomoki_nojiri')?.overall).toBe(85)
    expect(reviewedRating('juju_noda')?.overall).toBe(67)
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
  it('reflects current KYOJO title contenders and repeated race results',()=>{
    const expected={riona_tomishita:70,aimi_saito:70,joanne_ciconte:69,kokoro_sato:67,rami_sasaki:65,sara_matsui:64,paige_raddatz:63,itsumo_shiraishi:62}
    for(const [id,overall] of Object.entries(expected)){
      const row=driverRatingReview.drivers.find(r=>r.id===`expansion_${id}`)!
      expect(row.overall).toBe(overall)
      expect(row.sources).toContain('https://toyotagazooracing.com/jp/kyojocup/ranking/2026/')
    }
    for(const p of driverPool2026){
      if(!reviewedRating(p.id))continue
      expect(driverOverallAbilityPoints(seatedDriverFrom(p,{seriesId:'f1-custom',teamId:'audit',carNumber:1}))).toBe(p.overall)
    }
  })
  it('updates published v1 default profiles in any native seat without overwriting manual skill or potential',()=>{
    for(const prior of previousReview.drivers){
      const pool=driverPool2026.find(p=>p.id===prior.id)!
      const current=seatedDriverFrom(pool,{seriesId:'f1-custom',teamId:'audit',carNumber:1})
      const old={...current,skills:expandedDriverSkills(prior.ratings),potential:prior.potential/100}
      expect(migrateFactoryDriverRating(old).skills).toEqual(current.skills)
      expect(parsePersistedDriverRatings(JSON.stringify(serializeDriverRatings([old])),[current])[0].skills).toEqual(current.skills)
      const custom={...old,skills:{...old.skills,qualifyingPace:0.51}}
      expect(migrateFactoryDriverRating(custom).skills).toEqual(custom.skills)
      expect(migrateFactoryDriverRating({...old,potential:0.99}).potential).toBe(0.99)
    }
  })
  it('upgrades published v1 extra-category saves and preserves a manually changed driving axis',()=>{
    const config=createMotorsportConfig('kyojo')
    for(const entry of config.entries)for(let i=0;i<entry.drivers.length;i++){
      const person=entry.drivers[i],prior=previousReview.drivers.find(p=>p.id===person.id)!
      entry.drivers[i]={...person,overall:prior.overall,racePace:prior.ratings.racePace,qualifyingPace:prior.ratings.qualifyingPace,consistency:prior.ratings.consistency,tyreManagement:prior.ratings.tyreManagement}
    }
    const state=createMotorsportRace(config),saved=parseMotorsportSave(serializeMotorsportSave(config,state))!
    for(const entry of saved.config.entries)for(const person of entry.drivers){
      expect(person.overall).toBe(reviewedRating(person.id)!.overall)
      expect(person.racePace).toBe(reviewedRating(person.id)!.ratings.racePace)
    }
    config.entries[0].drivers[0].qualifyingPace=0.51
    expect(parseMotorsportSave(serializeMotorsportSave(config,state))!.config.entries[0].drivers[0].qualifyingPace).toBe(0.51)
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
