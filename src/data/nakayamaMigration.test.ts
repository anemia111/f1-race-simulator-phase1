import { describe, expect, it } from 'vitest'
import { initialDrivers } from './grid2026'
import { parsePersistedDriverRatings, serializeDriverRatings } from '../persistence'
import { parsePersistedSeriesConfiguration, serializeSeriesConfiguration } from './seriesConfiguration'
import { driverPool2026, seatedDriverFrom, seriesPackageById } from '../series/seriesRegistry'
import { createMotorsportConfig, motorsportDriver } from '../motorsport/packages'
import { createMotorsportRace } from '../motorsport/race'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import type { Driver, DriverSkillProfile } from '../types'

const f1 = seriesPackageById.get('f1-custom')!
const sf = seriesPackageById.get('super-formula')!
const oldDriver = (driver: Driver, value: number): Driver => ({ ...driver, potential: value,
  skills: Object.fromEntries(Object.keys(driver.skills).map(key => [key, value])) as DriverSkillProfile })
const expect110 = (driver: Driver) => expect(Object.values(driver.skills).every(value => value === 1.1)).toBe(true)

describe('authored Nakayama 110 saved-data migration', () => {
  it.each([1.05, 1.2])('upgrades untouched %s legacy ratings and preserves edited ratings', value => {
    const drivers = initialDrivers.map(driver => driver.id === 'yuki_nakayama' ? oldDriver(driver, value) : driver)
    const raw = serializeDriverRatings(drivers)
    const restored = parsePersistedDriverRatings(JSON.stringify(raw), initialDrivers)
    expect110(restored.find(driver => driver.id === 'yuki_nakayama')!)
    expect(restored.filter(driver => driver.id !== 'yuki_nakayama')).toEqual(initialDrivers.filter(driver => driver.id !== 'yuki_nakayama'))
    raw.ratingsByDriver.yuki_nakayama.qualifyingPace = value - 0.01
    expect(parsePersistedDriverRatings(JSON.stringify(raw), initialDrivers).find(driver => driver.id === 'yuki_nakayama')!.skills.qualifyingPace).toBe(value - 0.01)
  })

  it.each([1.05, 1.2])('upgrades %s in saved series configuration without changing other drivers', value => {
    const drivers = f1.drivers.map(driver => driver.id === 'yuki_nakayama' ? oldDriver(driver, value) : driver)
    const raw = serializeSeriesConfiguration(f1.id, f1.teams, drivers)
    const restored = parsePersistedSeriesConfiguration(JSON.stringify(raw), f1)!
    const nakayama = restored.drivers.find(driver => driver.id === 'yuki_nakayama')!
    expect110(nakayama)
    expect(nakayama.potential).toBe(1.1)
    expect(restored.drivers.filter(driver => driver.id !== nakayama.id)).toEqual(f1.drivers.filter(driver => driver.id !== nakayama.id))
    raw.drivers.find(driver => driver.id === nakayama.id)!.skills.qualifyingPace = value - 0.01
    expect(parsePersistedSeriesConfiguration(JSON.stringify(raw), f1)!.drivers.find(driver => driver.id === nakayama.id)!.skills.qualifyingPace).toBe(value - 0.01)
  })

  it.each([1.05, 1.2])('keeps a saved SF seat while upgrading imported Nakayama %s', value => {
    const seat = sf.drivers[0]
    const person = driverPool2026.find(driver => driver.id === 'yuki_nakayama')!
    const assigned = seatedDriverFrom(person, { seriesId: sf.id, carNumber: seat.carNumber, teamId: seat.teamId, seatRole: 'regular' })
    const raw = serializeSeriesConfiguration(sf.id, sf.teams, [oldDriver(assigned, value), ...sf.drivers.slice(1)])
    const restored = parsePersistedSeriesConfiguration(JSON.stringify(raw), sf)!
    expect110(restored.drivers[0])
    expect(restored.drivers[0]).toMatchObject({ id: person.id, teamId: seat.teamId, carNumber: seat.carNumber })
  })

  it.each(['kyojo', 'super-gt', 'wec', 'indycar'] as const)('%s resumes legacy imported crews at 110, retaining state and custom tunes', category => {
    for (const overall of [105, 120]) {
      const config = createMotorsportConfig(category)
      const person = motorsportDriver(driverPool2026.find(driver => driver.id === 'yuki_nakayama')!.name)
      expect(person.id).toBe('yuki_nakayama')
      config.entries[0].drivers[0] = { ...person, name: 'Saved custom name', overall,
        racePace: overall / 100, qualifyingPace: overall / 100,
        consistency: overall / 100, tyreManagement: overall / 100 }
      const state = createMotorsportRace(config)
      const restored = parseMotorsportSave(serializeMotorsportSave(config, state))!
      expect(restored.config.entries[0].drivers[0]).toMatchObject({ id: person.id,
        name: 'Saved custom name', overall: 110, racePace: 1.1, qualifyingPace: 1.1, consistency: 1.1, tyreManagement: 1.1 })
      expect(restored.state).toEqual(state)
      config.entries[0].drivers[0].racePace! -= 0.01
      expect(parseMotorsportSave(serializeMotorsportSave(config, state))!.config.entries[0].drivers[0]).toEqual(config.entries[0].drivers[0])
    }
  })
})
