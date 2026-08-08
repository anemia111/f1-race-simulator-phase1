/** Series that can own a live simulator weekend. */
export const EXECUTABLE_SERIES_IDS = [
  'f1-custom',
  'super-formula',
] as const

export type ExecutableSeriesId = (typeof EXECUTABLE_SERIES_IDS)[number]

/**
 * Series identifiers accepted as driver-history provenance.
 *
 * F2 and F3 deliberately exist only on this historical boundary. They are not
 * executable series and must never be used to select a vehicle/rule package.
 */
export const DRIVER_SOURCE_SERIES_IDS = [
  ...EXECUTABLE_SERIES_IDS,
  'f2',
  'f3',
  'external',
] as const

export type DriverSourceSeriesId = (typeof DRIVER_SOURCE_SERIES_IDS)[number]

/** Vehicle eras that are valid for a live simulation. */
export const RUNTIME_VEHICLE_ERA_IDS = [
  'f1-2026-current',
  'sf-2026',
] as const

export type RuntimeVehicleEraId = (typeof RUNTIME_VEHICLE_ERA_IDS)[number]

/** Historical vehicles available only as validation anchors. */
export const VALIDATION_VEHICLE_ERA_IDS = ['f1-2025-tpc'] as const

export type ValidationVehicleEraId =
  (typeof VALIDATION_VEHICLE_ERA_IDS)[number]

export type VehicleEraId = RuntimeVehicleEraId | ValidationVehicleEraId

const executableSeriesIds = new Set<string>(EXECUTABLE_SERIES_IDS)
const driverSourceSeriesIds = new Set<string>(DRIVER_SOURCE_SERIES_IDS)
const runtimeVehicleEraIds = new Set<string>(RUNTIME_VEHICLE_ERA_IDS)
const validationVehicleEraIds = new Set<string>(VALIDATION_VEHICLE_ERA_IDS)

export function isExecutableSeriesId(
  value: unknown,
): value is ExecutableSeriesId {
  return typeof value === 'string' && executableSeriesIds.has(value)
}

export function isDriverSourceSeriesId(
  value: unknown,
): value is DriverSourceSeriesId {
  return typeof value === 'string' && driverSourceSeriesIds.has(value)
}

export function isRuntimeVehicleEraId(
  value: unknown,
): value is RuntimeVehicleEraId {
  return typeof value === 'string' && runtimeVehicleEraIds.has(value)
}

export function isValidationVehicleEraId(
  value: unknown,
): value is ValidationVehicleEraId {
  return typeof value === 'string' && validationVehicleEraIds.has(value)
}

export function isVehicleEraId(value: unknown): value is VehicleEraId {
  return isRuntimeVehicleEraId(value) || isValidationVehicleEraId(value)
}
