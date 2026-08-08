import { describe, expect, it } from 'vitest'
import {
  DRIVER_SOURCE_SERIES_IDS,
  EXECUTABLE_SERIES_IDS,
  RUNTIME_VEHICLE_ERA_IDS,
  VALIDATION_VEHICLE_ERA_IDS,
  isDriverSourceSeriesId,
  isExecutableSeriesId,
  isRuntimeVehicleEraId,
  isValidationVehicleEraId,
  isVehicleEraId,
} from './seriesIds'

describe('series id boundaries', () => {
  it('keeps only F1 and SUPER FORMULA executable', () => {
    expect(EXECUTABLE_SERIES_IDS).toEqual(['f1-custom', 'super-formula'])
    expect(isExecutableSeriesId('f1-custom')).toBe(true)
    expect(isExecutableSeriesId('super-formula')).toBe(true)
    expect(isExecutableSeriesId('f2')).toBe(false)
    expect(isExecutableSeriesId('f3')).toBe(false)
    expect(isExecutableSeriesId('external')).toBe(false)
  })

  it('keeps support series only on the driver-source boundary', () => {
    expect(DRIVER_SOURCE_SERIES_IDS).toEqual([
      'f1-custom',
      'super-formula',
      'f2',
      'f3',
      'external',
    ])

    for (const seriesId of DRIVER_SOURCE_SERIES_IDS) {
      expect(isDriverSourceSeriesId(seriesId)).toBe(true)
    }
    expect(isDriverSourceSeriesId('unknown')).toBe(false)
  })

  it('separates runtime vehicle eras from the TPC validation anchor', () => {
    expect(RUNTIME_VEHICLE_ERA_IDS).toEqual([
      'f1-2026-current',
      'sf-2026',
    ])
    expect(VALIDATION_VEHICLE_ERA_IDS).toEqual(['f1-2025-tpc'])

    expect(isRuntimeVehicleEraId('f1-2026-current')).toBe(true)
    expect(isRuntimeVehicleEraId('sf-2026')).toBe(true)
    expect(isRuntimeVehicleEraId('f1-2025-tpc')).toBe(false)
    expect(isValidationVehicleEraId('f1-2025-tpc')).toBe(true)
    expect(isValidationVehicleEraId('f1-2026-current')).toBe(false)
    expect(isVehicleEraId('f1-2025-tpc')).toBe(true)
    expect(isVehicleEraId('sf-2026')).toBe(true)
    expect(isVehicleEraId('f2')).toBe(false)
  })
})
