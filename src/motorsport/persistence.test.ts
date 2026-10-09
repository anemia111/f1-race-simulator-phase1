import { describe, expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'

describe('independent motorsport checkpoints', () => {
  it('resumes the exact physical state and future trajectory, including a 62-car crew grid', () => {
    const config = createMotorsportConfig('wec', 'wec:3')
    expect(config.entries).toHaveLength(62)
    const state = advanceMotorsportRace(createMotorsportRace(config), 6500, config)
    const save = parseMotorsportSave(serializeMotorsportSave(config, state))!
    expect(save).not.toBeNull()
    expect(save.state).toEqual(state)
    expect(advanceMotorsportRace(save.state, 100, save.config)).toEqual(advanceMotorsportRace(state, 100, config))
  })
  it('rejects corrupt payloads, wrong versions and inconsistent car/crew identities', () => {
    const config = createMotorsportConfig('kyojo'), state = createMotorsportRace(config)
    const valid = serializeMotorsportSave(config, state)
    expect(parseMotorsportSave(valid.replace('kyojo', 'kyoxo'))).toBeNull()
    expect(parseMotorsportSave('{')).toBeNull()
    expect(parseMotorsportSave(valid.replace('"schemaVersion":1', '"schemaVersion":9'))).toBeNull()
    expect(parseMotorsportSave(serializeMotorsportSave(config, { ...state, cars: state.cars.slice(1) }))).toBeNull()
    expect(parseMotorsportSave(serializeMotorsportSave(config, { ...state, cars: state.cars.map((car, i) => i ? car : { ...car, driverIndex: 99 }) }))).toBeNull()
  })
})
