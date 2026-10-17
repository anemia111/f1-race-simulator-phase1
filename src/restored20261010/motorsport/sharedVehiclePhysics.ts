import type { Team } from '../types'
import { categoryPhysicsFor, type CategoryPhysicsProfile } from '../simulation/categoryPhysics'
import { integrateVehicleLongitudinalStep, type LongitudinalStepInput } from '../simulation/vehicleDynamics'
import type { MotorsportMachine } from './types'

// The rating adapter is neutral: absolute machine specifications below own
// power, drag and grip. No F1 team's competitive ratings enter these classes.
export const neutralPhysicsTeam: Team = {
  id: 'absolute-machine-specification', name: 'Absolute machine specification', color: '#ffffff', pitCrewSpeed: 0.86,
  machine: {
    qualifyingPace: 0.86, racePace: 0.86, lowSpeedCornerPerformance: 0.86,
    mediumSpeedCornerPerformance: 0.86, highSpeedCornerPerformance: 0.86,
    mechanicalGrip: 0.86, traction: 0.86, brakingStability: 0.86,
    brakingPerformance: 0.86, aerodynamicEfficiency: 0.86, downforceGeneration: 0.86,
    dragEfficiency: 0.86, straightLineEfficiency: 0.86, activeAeroEfficiency: 0.86,
    towSensitivity: 0.86, dirtyAirTolerance: 0.86, tireWarmup: 0.86,
    tireDegManagement: 0.86, frontTireManagement: 0.86, rearTireManagement: 0.86,
    wetPerformance: 0.86, intermediatePerformance: 0.86, kerbHandling: 0.86,
    rideCompliance: 0.86, bumpTolerance: 0.86, coolingEfficiency: 0.86,
    brakeCooling: 0.86, puOutput: 0.86, electricalDeploymentEfficiency: 0.86,
    energyRecoveryEfficiency: 0.86, fuelEfficiency: 0.86, reliability: 0.86,
  },
}

const profiles = new WeakMap<MotorsportMachine, CategoryPhysicsProfile>()
/** Geometry, gearing and brake ceilings are explicit SIM priors, not measurements. */
const geometry = {
  kyojo: [2.5, 1.6, 0.30, 8000, 240, 25],
  gt500: [2.75, 1.9, 0.35, 8000, 330, 38],
  gt300: [2.7, 1.9, 0.45, 8500, 315, 30],
  hypercar: [3.05, 1.95, 0.35, 8500, 350, 40],
  lmgt3: [2.7, 1.9, 0.45, 8500, 315, 30],
  lmp2: [3.0, 1.9, 0.30, 8500, 350, 40],
  indycar: [3.0, 1.9, 0.30, 12000, 400, 40],
} as const

export function motorsportPhysicsFor(machine: MotorsportMachine): CategoryPhysicsProfile {
  const cached = profiles.get(machine)
  if (cached) return cached
  const [wheelbaseM, trackWidthM, centreOfGravityHeightM, maximumEngineRpm, topGearDesignSpeedKph, maximumBrakeDecelerationMps2] = geometry[machine.classId]
  const physics: CategoryPhysicsProfile = {
    ...categoryPhysicsFor('super-formula'),
    id: machine.classId,
    combustionPowerKw: machine.powerKw.value,
    referenceDragAreaM2: machine.dragAreaM2.value,
    dragAreaScale: 1,
    drivetrainEfficiency: 0.94,
    turbocharged: machine.classId !== 'kyojo' && machine.classId !== 'lmp2',
    gearCount: machine.gears.value,
    hybridDeploymentPowerLimitKw: machine.hybridPowerKw.value,
    liftAreaM2: machine.liftAreaM2.value,
    peakTyreFrictionCoefficient: machine.tyreMu.value,
    tyreLoadSensitivity: 0.125,
    wheelRadiusM: machine.classId === 'kyojo' ? 0.28 : 0.33,
    wheelbaseM, trackWidthM, centreOfGravityHeightM, maximumEngineRpm,
    minimumEngineRpm: maximumEngineRpm * 0.3,
    topGearDesignSpeedKph, maximumBrakeDecelerationMps2,
    overtakeBoostPowerKw: 0,
    rollingResistanceCoefficient: 0.015,
    minimumMassRule: { kind: 'fixed-minimum-mass', massKg: machine.massKg.value + machine.driverMassKg.value, sourceId: machine.massKg.source },
  }
  profiles.set(machine, physics)
  return physics
}

export function integrateMotorsportVehicle(machine: MotorsportMachine,
  input: Omit<LongitudinalStepInput, 'team' | 'categoryPhysics' | 'baseVehicleMassKg'>) {
  return integrateVehicleLongitudinalStep({
    ...input, team: neutralPhysicsTeam, categoryPhysics: motorsportPhysicsFor(machine),
    baseVehicleMassKg: machine.massKg.value + machine.driverMassKg.value,
  })
}
