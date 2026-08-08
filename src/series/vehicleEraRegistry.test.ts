import { describe, expect, it } from 'vitest'
import {
  resolveRuntimeVehicleEra,
  validationVehicleEraForId,
  vehicleEraRegistry,
} from './vehicleEraRegistry'

describe('vehicle era registry', () => {
  it('keeps the 2025 TPC anchor outside the two live 2026 packages', () => {
    expect(
      vehicleEraRegistry.map(({ availability, eraId, seriesId }) => ({
        availability,
        eraId,
        seriesId,
      })),
    ).toEqual([
      {
        availability: 'validation-only',
        eraId: 'f1-2025-tpc',
        seriesId: 'f1-custom',
      },
      {
        availability: 'runtime',
        eraId: 'f1-2026-current',
        seriesId: 'f1-custom',
      },
      {
        availability: 'runtime',
        eraId: 'sf-2026',
        seriesId: 'super-formula',
      },
    ])
  })

  it('resolves one date-qualified runtime package per executable series', () => {
    expect(
      resolveRuntimeVehicleEra({
        eventDate: '2026-08-08',
        seriesId: 'f1-custom',
      }).eraId,
    ).toBe('f1-2026-current')
    expect(
      resolveRuntimeVehicleEra({
        eventDate: '2026-08-08',
        seriesId: 'super-formula',
      }).eraId,
    ).toBe('sf-2026')
  })

  it('rejects TPC at the runtime boundary even for the F1 series', () => {
    expect(() =>
      resolveRuntimeVehicleEra({
        eventDate: '2026-07-28',
        requestedEraId: 'f1-2025-tpc',
        seriesId: 'f1-custom',
      }),
    ).toThrow(/validation-only/)

    expect(validationVehicleEraForId('f1-2025-tpc')).toMatchObject({
      availability: 'validation-only',
      validationEvidenceSourceIds: ['haas-fuji-tpc-2026-06-25'],
    })
  })

  it('does not cross series or backdate a runtime package', () => {
    expect(() =>
      resolveRuntimeVehicleEra({
        eventDate: '2026-08-08',
        requestedEraId: 'sf-2026',
        seriesId: 'f1-custom',
      }),
    ).toThrow(/belongs to super-formula/)

    expect(() =>
      resolveRuntimeVehicleEra({
        eventDate: '2025-12-31',
        seriesId: 'f1-custom',
      }),
    ).toThrow(/No runtime vehicle era/)
  })

  it('uses generation-specific physics, tyre, aero, and power-unit ids', () => {
    const tpc = validationVehicleEraForId('f1-2025-tpc')
    const current = resolveRuntimeVehicleEra({
      eventDate: '2026-08-08',
      seriesId: 'f1-custom',
    })

    expect(tpc.vehiclePhysicsId).not.toBe(current.vehiclePhysicsId)
    expect(tpc.tyreFamilyId).not.toBe(current.tyreFamilyId)
    expect(tpc.aeroSystemId).not.toBe(current.aeroSystemId)
    expect(tpc.powerUnitSystemId).not.toBe(current.powerUnitSystemId)
  })
})
