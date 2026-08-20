import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { seriesPackageById } from '../series/seriesRegistry'
import {
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
} from './categoryPhysics'
import {
  advanceEnergyStore,
  createInitialEnergyStore,
  energySystemParametersFor,
} from './energySystem'
import { resolveF1RechargeRule } from './regulations'
import {
  integrateVehicleLongitudinalStep,
  previewServiceBrakeMechanicalBudget,
  type LongitudinalStepInput,
} from './vehicleDynamics'

const f1Driver = initialDrivers.find((driver) => driver.code === 'LEC')!
const f1Team = initialTeams.find((team) => team.id === f1Driver.teamId)!
const f1Physics = categoryPhysicsFor('f1-custom')
const f1BaseMassKg = resolveOperationalVehicleMass({
  f1NominalTyreMassKg: null,
  physics: f1Physics,
  weekendStage: 'race',
}).operationalMassKg
const fuelLoadKg = 35

function energyStepFor(options: {
  brakeMechanicalEnergyProfileMJ?: readonly number[]
  brakePercent: number
  combustionWheelPowerKw?: number
  speedKph: number
  superclipGeneratorRequestKw?: number
  throttlePercent: number
}) {
  const rechargeRule = resolveF1RechargeRule({ stage: 'race' })
  const state = createInitialEnergyStore(f1Team, 0.2, rechargeRule)

  return advanceEnergyStore({
    allowLiftCoastRecovery: true,
    ambientTemperatureC: 25,
    brakeMechanicalEnergyProfileMJ:
      options.brakeMechanicalEnergyProfileMJ,
    brakePercent: options.brakePercent,
    combustionWheelPowerKw: options.combustionWheelPowerKw ?? 0,
    deltaSeconds: 0.5,
    deploymentDcPowerLimitKw: 350,
    deploymentRequest: 0,
    driverErsManagement: f1Driver.skills.ersManagement,
    driverWetSkill: f1Driver.skills.wetSkill,
    gripMultiplier: 1,
    rechargeRule,
    speedKph: options.speedKph,
    state,
    superclipGeneratorRequestKw:
      options.superclipGeneratorRequestKw ?? 0,
    surfaceWaterMm: 0,
    team: f1Team,
    throttlePercent: options.throttlePercent,
    tire: 'M',
    vehicleMassKg: f1BaseMassKg + fuelLoadKg,
  })
}

describe('Phase 6 brake force and Energy Store consistency', () => {
  it('keeps a coarse released-brake frame slice-aligned from preview through final force', () => {
    const vehicleInput: LongitudinalStepInput = {
      activeAeroMode: 'corner',
      airDensityKgM3: 1.225,
      baseVehicleMassKg: f1BaseMassKg,
      brakePercent: 100,
      brakeReleaseSpeedKph: 200,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 204,
      deltaSeconds: 0.5,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg,
      gripMultiplier: 1,
      headwindMps: 80,
      regenerativeResistancePowerKw: 0,
      team: f1Team,
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const preview = previewServiceBrakeMechanicalBudget(vehicleInput)
    const energyStep = energyStepFor({
      brakeMechanicalEnergyProfileMJ: preview.mechanicalEnergyProfileMJ,
      brakePercent: vehicleInput.brakePercent,
      speedKph: vehicleInput.currentSpeedKph,
      throttlePercent: vehicleInput.throttlePercent,
    })
    const acceptedProfile =
      energyStep.audit.acceptedBrakeRecoveryMechanicalEnergyProfileMJ
    const fractionProfile = preview.mechanicalEnergyProfileMJ.map(
      (serviceBrakeEnergyMJ, index) =>
        serviceBrakeEnergyMJ > 1e-12
          ? Math.min(
              1,
              Math.max(
                0,
                (acceptedProfile[index] ?? 0) / serviceBrakeEnergyMJ,
              ),
            )
          : 0,
    )
    const frictionOnly = integrateVehicleLongitudinalStep({
      ...vehicleInput,
      serviceBrakeRegenerativeFractionProfile:
        preview.mechanicalEnergyProfileMJ.map(() => 0),
    })
    const final = integrateVehicleLongitudinalStep({
      ...vehicleInput,
      serviceBrakeRegenerativeFractionProfile: fractionProfile,
    })
    const sliceSeconds =
      vehicleInput.deltaSeconds / preview.mechanicalEnergyProfileMJ.length
    const maximumRecoveryPowerKw =
      energySystemParametersFor(f1Team).maximumRecoveryMechanicalPowerKw

    expect(preview.mechanicalEnergyProfileMJ).toHaveLength(5)
    expect(preview.mechanicalEnergyProfileMJ[0]).toBeGreaterThan(0)
    expect(preview.mechanicalEnergyProfileMJ.slice(1)).toEqual([0, 0, 0, 0])
    expect(acceptedProfile).toHaveLength(
      preview.mechanicalEnergyProfileMJ.length,
    )
    expect(acceptedProfile[0]).toBeGreaterThan(0)
    expect(acceptedProfile.slice(1)).toEqual([0, 0, 0, 0])
    expect((acceptedProfile[0] * 1000) / sliceSeconds).toBeLessThanOrEqual(
      maximumRecoveryPowerKw + 1e-9,
    )
    expect(
      fractionProfile.every((fraction) => fraction >= 0 && fraction <= 1),
    ).toBe(true)

    expect(final.serviceBrakeMechanicalEnergyMJ).toBeCloseTo(
      preview.mechanicalEnergyMJ,
      12,
    )
    expect(final.speedKph).toBe(frictionOnly.speedKph)
    expect(final.serviceBrakeMechanicalEnergyMJ).toBeCloseTo(
      final.brakingRegenerativeMechanicalEnergyMJ +
        final.frictionBrakeMechanicalEnergyMJ,
      12,
    )
    expect(final.brakingRegenerativeMechanicalEnergyMJ).toBeCloseTo(
      energyStep.audit.acceptedBrakeRecoveryMechanicalEnergyMJ,
      12,
    )
    expect(final.frictionBrakeMechanicalEnergyMJ).toBeCloseTo(
      energyStep.audit.frictionBrakeMechanicalEnergyMJ,
      12,
    )
    expect(energyStep.actualRecoverySourcePowerKw.liftCoast).toBe(0)
    expect(energyStep.actualRecoverySourcePowerKw.superclip).toBe(0)
    expect(energyStep.state.actualDeploymentDcPowerKw).toBe(0)
  })

  it('keeps hot hardware and lateral demand below the available straight-line brake work', () => {
    const common: LongitudinalStepInput = {
      activeAeroMode: 'corner',
      airDensityKgM3: 1.225,
      baseVehicleMassKg: f1BaseMassKg,
      brakePercent: 100,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 360,
      deltaSeconds: 0.3,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg,
      gripMultiplier: 1,
      regenerativeResistancePowerKw: 0,
      team: f1Team,
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const straight = previewServiceBrakeMechanicalBudget(common)
    const overheated = previewServiceBrakeMechanicalBudget({
      ...common,
      brakeTemperatureC: 1_150,
    })
    const sameSpeedStraight = previewServiceBrakeMechanicalBudget({
      ...common,
      currentSpeedKph: 200,
    })
    const lateralDemand = previewServiceBrakeMechanicalBudget({
      ...common,
      currentSpeedKph: 200,
      dynamics: {
        effectiveCornerRadiusM: 95,
        roadGradeFraction: 0,
        straightness: 0.35,
      },
    })

    expect(overheated.mechanicalEnergyMJ).toBeLessThan(
      straight.mechanicalEnergyMJ,
    )
    expect(lateralDemand.mechanicalEnergyMJ).toBeLessThan(
      sameSpeedStraight.mechanicalEnergyMJ,
    )
  })

  it.each([
    {
      label: 'lift-and-coast',
      combustionWheelPowerKw: 0,
      speedKph: 200,
      superclipGeneratorRequestKw: 0,
      throttlePercent: 20,
      source: 'liftCoast' as const,
    },
    {
      label: 'superclip',
      combustionWheelPowerKw: 520,
      speedKph: 340,
      superclipGeneratorRequestKw: 120,
      throttlePercent: 100,
      source: 'superclip' as const,
    },
  ])(
    'keeps no-brake $label recovery on the standalone generator path',
    ({
      combustionWheelPowerKw,
      source,
      speedKph,
      superclipGeneratorRequestKw,
      throttlePercent,
    }) => {
      const energyStep = energyStepFor({
        brakePercent: 0,
        combustionWheelPowerKw,
        speedKph,
        superclipGeneratorRequestKw,
        throttlePercent,
      })
      const standalonePowerKw =
        energyStep.actualRecoverySourcePowerKw.liftCoast +
        energyStep.actualRecoverySourcePowerKw.superclip
      const common: LongitudinalStepInput = {
        activeAeroMode: 'straight',
        airDensityKgM3: 1.225,
        baseVehicleMassKg: f1BaseMassKg,
        brakePercent: 0,
        clutchEngagementFraction: 1,
        currentSpeedKph: speedKph,
        deltaSeconds: 0.5,
        dynamics: { roadGradeFraction: 0, straightness: 1 },
        ersPowerKw: 0,
        fuelLoadKg,
        gripMultiplier: 1,
        team: f1Team,
        throttlePercent,
        turboSpoolFraction: 1,
      }
      const baseline = integrateVehicleLongitudinalStep({
        ...common,
        regenerativeResistancePowerKw: 0,
      })
      const recovering = integrateVehicleLongitudinalStep({
        ...common,
        regenerativeResistancePowerKw: standalonePowerKw,
      })

      expect(energyStep.actualRecoverySourcePowerKw[source]).toBeGreaterThan(0)
      expect(energyStep.audit.acceptedBrakeRecoveryMechanicalEnergyMJ).toBe(0)
      expect(energyStep.audit.frictionBrakeMechanicalEnergyMJ).toBe(0)
      expect(recovering.serviceBrakeMechanicalEnergyMJ).toBe(0)
      expect(recovering.brakingRegenerativeMechanicalEnergyMJ).toBe(0)
      expect(recovering.frictionBrakeMechanicalEnergyMJ).toBe(0)
      expect(recovering.generatorMechanicalPowerKw).toBeCloseTo(
        standalonePowerKw,
        8,
      )
      expect(recovering.speedKph).toBeLessThan(baseline.speedKph)
    },
  )

  it('keeps the SUPER FORMULA legacy vehicle path entirely friction-braked', () => {
    const superFormula = seriesPackageById.get('super-formula')!
    const team = superFormula.teams[0]
    const categoryPhysics = categoryPhysicsFor('super-formula')
    const common: LongitudinalStepInput = {
      activeAeroMode: 'corner',
      airDensityKgM3: 1.225,
      brakePercent: 72,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 240,
      deltaSeconds: 0.2,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 24,
      gripMultiplier: 1,
      regenerativeResistancePowerKw: 0,
      categoryPhysics,
      team,
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const legacy = integrateVehicleLongitudinalStep(common)
    const explicitLegacy = integrateVehicleLongitudinalStep({
      ...common,
      serviceBrakeRegenerativeFraction: undefined,
      serviceBrakeRegenerativeFractionProfile: undefined,
    })

    expect(categoryPhysics.id).toBe('super-formula')
    expect(explicitLegacy).toEqual(legacy)
    expect(legacy.serviceBrakeMechanicalEnergyMJ).toBeGreaterThan(0)
    expect(legacy.brakingRegenerativeMechanicalEnergyMJ).toBe(0)
    expect(legacy.frictionBrakeMechanicalEnergyMJ).toBeCloseTo(
      legacy.serviceBrakeMechanicalEnergyMJ,
      12,
    )
    expect(legacy.generatorMechanicalPowerKw).toBe(0)
  })
})
