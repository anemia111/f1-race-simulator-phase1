import { paceCalibrationFor } from '../data/paceCalibration'
import type { TrackDefinition } from '../types'
import { categoryPhysicsFor, type CategoryPhysicsProfile } from './categoryPhysics'
import { simulatePhysicalLap } from './physicalLap'
import contactCalibration from '../data/calibration/f1CourseContactCalibration.json'
import supplementalReferences from '../data/calibration/f1SupplementalCourseReferences.json'

export type F1CourseCalibration = {
  kind: 'sim-effective-contact-calibration' | 'uncalibrated-physical-estimate'
  physics: CategoryPhysicsProfile
  targetSeconds: number | null
  referenceStatus: string
  referenceSeconds: number
  residualSeconds: number | null
  bounded: boolean
}

const cache = new WeakMap<TrackDefinition, F1CourseCalibration>()
const coefficients: Record<string, number> = contactCalibration.coefficients
const measurements = (contactCalibration as {
  calibrationMeasurements?: Array<{id: string; bounded: boolean}>
}).calibrationMeasurements ?? []
const supplemental: Record<string, { targetSeconds: number; status: string }> = supplementalReferences

/**
 * Explicit SIM contact-model calibration. Lap timing cannot distinguish tyre
 * friction from coarse road curvature, so this is NOT a measured road/Pirelli
 * coefficient or an independently validated vehicle property. The unmodified
 * category model remains available to the physics holdout audit.
 *
 * Only forces consume this effective profile. Time, distance, battery energy,
 * traffic gaps, fuel and driver ratings are never scaled to a target lap.
 * Foreign tracks resolve by F1 category x course, never their donor series.
 */
export function f1CourseCalibrationFor(track: TrackDefinition): F1CourseCalibration {
  const cached = cache.get(track)
  if (cached) return cached
  const base = categoryPhysicsFor('f1-custom')
  const reference = paceCalibrationFor('f1-custom', track.id === 'monza' ? 'monza-approx' : track.id)
  const targetSeconds = reference?.qualifying.selectedReferenceSeconds ?? supplemental[track.id]?.targetSeconds ?? null
  const referenceStatus = reference?.qualifying.status ?? supplemental[track.id]?.status ?? 'unavailable'
  const lapAt = (physics: CategoryPhysicsProfile) => simulatePhysicalLap(track, {
    physics, airTemperatureC: 25,
  }).lapTimeSeconds
  const calibratedCoefficient = coefficients[track.id]
  if (targetSeconds !== null && calibratedCoefficient !== undefined) {
    if (!Number.isFinite(calibratedCoefficient) || calibratedCoefficient < 0.8 || calibratedCoefficient > 2.5) {
      throw new Error(`Invalid F1 SIM contact calibration for ${track.id}`)
    }
    const physics = Object.freeze({ ...base, peakTyreFrictionCoefficient: calibratedCoefficient })
    const referenceSeconds = lapAt(physics)
    const result: F1CourseCalibration = {
      kind: 'sim-effective-contact-calibration', physics, targetSeconds,
      referenceStatus, referenceSeconds,
      residualSeconds: referenceSeconds - targetSeconds,
      bounded: measurements.some(measurement => measurement.id === track.id && measurement.bounded),
    }
    cache.set(track, result)
    return result
  }
  if (targetSeconds === null) {
    const result: F1CourseCalibration = {
      kind: 'uncalibrated-physical-estimate', physics: base,
      targetSeconds: null, referenceStatus: 'unavailable', referenceSeconds: lapAt(base),
      residualSeconds: null, bounded: false,
    }
    cache.set(track, result)
    return result
  }
  let lower = 0.8
  let upper = 2.5
  const slow = lapAt({ ...base, peakTyreFrictionCoefficient: lower })
  const fast = lapAt({ ...base, peakTyreFrictionCoefficient: upper })
  for (let step = 0; step < 18; step += 1) {
    const coefficient = (lower + upper) / 2
    if (lapAt({ ...base, peakTyreFrictionCoefficient: coefficient }) > targetSeconds) lower = coefficient
    else upper = coefficient
  }
  const physics = Object.freeze({ ...base, peakTyreFrictionCoefficient: (lower + upper) / 2 })
  const referenceSeconds = lapAt(physics)
  const result: F1CourseCalibration = {
    kind: 'sim-effective-contact-calibration', physics, targetSeconds,
    referenceStatus, referenceSeconds,
    residualSeconds: referenceSeconds - targetSeconds,
    bounded: targetSeconds < fast || targetSeconds > slow,
  }
  cache.set(track, result)
  return result
}

export function f1PhysicsForTrack(track: TrackDefinition) {
  return f1CourseCalibrationFor(track).physics
}
