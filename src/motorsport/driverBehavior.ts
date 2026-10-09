import { catalogPoolDriverById } from '../series/expansionCatalog'
import { expandedDriverSkills } from '../data/driverProfiles'
import type { CompactDriverRatings } from '../data/driverProfiles'
import type { Driver } from '../types'
import type { MotorsportDriver } from './types'

const cache=new WeakMap<MotorsportDriver,Driver>()
/** Uses the same authored pool and skill expansion as F1/SF. Unknown axes
 * receive neutral SIM values; no driver rating is recalculated or persisted. */
export function behaviorDriverFor(person: MotorsportDriver): Driver {
  const cached=cache.get(person)
  if (cached) return cached
  const pool=catalogPoolDriverById.get(person.id)
  const fallback: CompactDriverRatings={adaptability:0.75,consistency:person.consistency??0.75,
    defending:0.75,errorControl:0.75,experience:0.75,overtaking:0.75,
    qualifyingPace:person.qualifyingPace??person.racePace??0.75,racePace:person.racePace??0.75,
    raceStart:0.75,technicalFeedback:0.75,tyreManagement:person.tyreManagement??0.75,wetSkill:0.75}
  const driver: Driver={id:person.id,name:person.name,code:pool?.code??person.name.slice(0,3),
    teamId:'behavior-only',carNumber:0,startOffset:0,tire:'M',skills:expandedDriverSkills(pool?.ratings??fallback),
    style:{brakingAggression:0.5,cornerShapePreference:0,frontEndPreference:0,
      oversteerTolerance:0.5,rearStabilityNeed:0,understeerTolerance:0.5}}
  cache.set(person,driver)
  return driver
}
