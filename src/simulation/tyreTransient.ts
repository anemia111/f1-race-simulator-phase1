import type { ExecutableSeriesId } from '../series/seriesIds'

const VALIDATED_TYRE_TRANSIENT_PARAMETERS: unique symbol = Symbol(
  'validated-tyre-transient-parameters',
)

/**
 * Source-labelled tyre relaxation parameters. The mathematical response is
 * generic, but these distances are tyre-construction inputs and must not be
 * borrowed between F1, SUPER FORMULA, road tyres, or test fixtures.
 */
export type TyreTransientParameters = Readonly<{
  readonly [VALIDATED_TYRE_TRANSIENT_PARAMETERS]: true
  lateralRelaxationLengthM: number
  longitudinalRelaxationLengthM: number
  source: 'manufacturer' | 'observed'
  sourceDate: string | null
  sourceLabel: string
  sourceUrl: string
}>

export type TyreTransientParameterResolution =
  | Readonly<{
      parameters: TyreTransientParameters
      seriesId: ExecutableSeriesId
      status: 'available'
    }>
  | Readonly<{
      methodSourceLabel: string
      methodSourceUrl: string
      reason: 'series-specific-relaxation-lengths-not-public'
      requiredFields: readonly [
        'lateralRelaxationLengthM',
        'longitudinalRelaxationLengthM',
      ]
      seriesId: ExecutableSeriesId
      status: 'unavailable'
    }>

export type TyreTransientForceState = Readonly<{
  lateralForceN: number
  longitudinalForceN: number
}>

export type TyreTransientParameterValidation =
  | Readonly<{ parameters: TyreTransientParameters; status: 'available' }>
  | Readonly<{
      reason: 'invalid-or-unlabelled-parameters'
      status: 'unavailable'
    }>

const RELAXATION_METHOD_SOURCE = Object.freeze({
  sourceLabel:
    'Loeb et al., Lateral Stiffness, Cornering Stiffness and Relaxation Length of the Pneumatic Tire, SAE 900129 (1990)',
  sourceUrl: 'https://doi.org/10.4271/900129',
})

const finitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback

/**
 * Validates the complete category-specific input before it can reach the
 * numerical relaxation model. A citation to the generic equation is not a
 * substitute for measured or manufacturer-supplied tyre coefficients.
 */
export function validateTyreTransientParameters(
  value: Partial<TyreTransientParameters> | null | undefined,
): TyreTransientParameterValidation {
  if (
    !value ||
    !finitePositive(value.lateralRelaxationLengthM) ||
    !finitePositive(value.longitudinalRelaxationLengthM) ||
    (value.source !== 'manufacturer' && value.source !== 'observed') ||
    typeof value.sourceLabel !== 'string' ||
    value.sourceLabel.trim().length === 0 ||
    typeof value.sourceUrl !== 'string' ||
    value.sourceUrl.trim().length === 0 ||
    (value.sourceDate !== null && typeof value.sourceDate !== 'string')
  ) {
    return Object.freeze({
      reason: 'invalid-or-unlabelled-parameters',
      status: 'unavailable',
    })
  }

  return Object.freeze({
    parameters: Object.freeze({
      lateralRelaxationLengthM: value.lateralRelaxationLengthM,
      longitudinalRelaxationLengthM: value.longitudinalRelaxationLengthM,
      source: value.source,
      sourceDate: value.sourceDate,
      sourceLabel: value.sourceLabel.trim(),
      sourceUrl: value.sourceUrl.trim(),
      [VALIDATED_TYRE_TRANSIENT_PARAMETERS]: true,
    }),
    status: 'available',
  })
}

/**
 * Resolves shipped category data. Public 2026 FIA/Pirelli/JRP material does
 * not publish F1 or SUPER FORMULA relaxation lengths, so both categories fail
 * closed instead of inheriting a road-tyre or test coefficient.
 */
export function resolveTyreTransientParameters(
  seriesId: ExecutableSeriesId,
): TyreTransientParameterResolution {
  return Object.freeze({
    methodSourceLabel: RELAXATION_METHOD_SOURCE.sourceLabel,
    methodSourceUrl: RELAXATION_METHOD_SOURCE.sourceUrl,
    reason: 'series-specific-relaxation-lengths-not-public',
    requiredFields: Object.freeze([
      'lateralRelaxationLengthM',
      'longitudinalRelaxationLengthM',
    ] as const),
    seriesId,
    status: 'unavailable',
  })
}

function firstOrderDistanceResponse(options: {
  current: number
  distanceMeters: number
  relaxationLengthMeters: number
  target: number
}) {
  const current = finiteOr(options.current, 0)
  const target = finiteOr(options.target, 0)
  const distanceMeters = Math.max(0, finiteOr(options.distanceMeters, 0))
  const responseFraction = -Math.expm1(
    -distanceMeters / options.relaxationLengthMeters,
  )

  return current + (target - current) * responseFraction
}

/**
 * Distance-domain first-order tyre-force response. This function is usable
 * only after the parameter validator has produced a source-labelled input.
 * It deliberately has no implicit F1/SF/default relaxation length.
 */
export function advanceTyreTransientForce(options: {
  distanceMeters: number
  parameters: TyreTransientParameters
  state: TyreTransientForceState
  target: TyreTransientForceState
}): TyreTransientForceState {
  return Object.freeze({
    lateralForceN: firstOrderDistanceResponse({
      current: options.state.lateralForceN,
      distanceMeters: options.distanceMeters,
      relaxationLengthMeters: options.parameters.lateralRelaxationLengthM,
      target: options.target.lateralForceN,
    }),
    longitudinalForceN: firstOrderDistanceResponse({
      current: options.state.longitudinalForceN,
      distanceMeters: options.distanceMeters,
      relaxationLengthMeters: options.parameters.longitudinalRelaxationLengthM,
      target: options.target.longitudinalForceN,
    }),
  })
}
