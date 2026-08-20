import { describe, expect, it } from 'vitest';
import { initialDrivers, initialTeams } from '../data/grid2026';
import type { EnergyStoreState, RechargeRuleDefinition } from '../types';
import {
  advanceEnergyStore,
  type AdvanceEnergyStoreOptions,
  type EnergyStoreStep,
  createInitialEnergyStore,
  energyBalanceErrorMJ,
  energyDeploymentRequestFor,
  energySystemParametersFor,
  normalizeEnergyStoreState,
  rebaseEnergyStoreAtLapCrossing,
  startNextEnergyLap,
} from './energySystem';
import {
  FIA_2026_REGULATION_PROFILE,
  permittedMguKDcPowerKwForSpeed,
  resolveF1RechargeRule,
  type MguKPowerCurve,
} from './regulations';

const team = initialTeams.find((candidate) => candidate.id === 'ferrari')!;
const driver = initialDrivers.find((candidate) => candidate.code === 'LEC')!;
const raceRechargeRule = resolveF1RechargeRule({ stage: 'race' });

function finiteRechargeRule(
  maxCuKBusRechargeMj: number,
  options: { additionalAllowanceMJ?: number; baseLimitMJ?: number } = {},
): RechargeRuleDefinition {
  return {
    additionalAllowanceMJ: options.additionalAllowanceMJ ?? 0,
    baseLimitMJ: options.baseLimitMJ ?? maxCuKBusRechargeMj,
    limit: { kind: 'finite', maxCuKBusRechargeMj },
    measuredAt: 'CU-K-HV-DC-bus',
    resolution: 'verified-event',
    ruleId: `test-finite-${maxCuKBusRechargeMj}`,
    sourceId: 'phase4-energy-test',
  };
}

const unlimitedRechargeRule: RechargeRuleDefinition = {
  additionalAllowanceMJ: 0,
  baseLimitMJ: null,
  limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
  measuredAt: 'CU-K-HV-DC-bus',
  resolution: 'technical-low-grip-safety-car',
  ruleId: 'test-unlimited',
  sourceId: 'phase4-energy-test',
};

const unavailableRechargeRule: RechargeRuleDefinition = {
  additionalAllowanceMJ: 0,
  baseLimitMJ: null,
  limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
  measuredAt: 'CU-K-HV-DC-bus',
  resolution: 'event-context-unavailable',
  ruleId: 'test-unavailable',
  sourceId: 'phase4-energy-test',
};

const defaultStep: Omit<AdvanceEnergyStoreOptions, 'state'> = {
  ambientTemperatureC: 25,
  brakePercent: 0,
  combustionWheelPowerKw: 520,
  deltaSeconds: 1,
  deploymentDcPowerLimitKw: FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
  deploymentRequest: 0,
  driverErsManagement: driver.skills.ersManagement,
  driverWetSkill: driver.skills.wetSkill,
  gripMultiplier: 1,
  rechargeRule: raceRechargeRule,
  speedKph: 300,
  surfaceWaterMm: 0,
  team,
  throttlePercent: 100,
  tire: 'M',
  vehicleMassKg: 840,
};

function step(
  state: EnergyStoreState,
  overrides: Partial<Omit<AdvanceEnergyStoreOptions, 'state'>> = {},
) {
  return advanceEnergyStore({
    ...defaultStep,
    rechargeRule: state.rechargeRule,
    ...overrides,
    state,
  });
}

function deploymentRequest(
  state: EnergyStoreState,
  overrides: Partial<Parameters<typeof energyDeploymentRequestFor>[0]> = {},
) {
  return energyDeploymentRequestFor({
    battlePhase: 'single-file',
    driverErsManagement: driver.skills.ersManagement,
    isFinalLap: false,
    lapProgress: 0.2,
    overtakeActive: false,
    paceMode: 'standard',
    phaseActive: false,
    speedKph: 260,
    state,
    straightLengthAheadMeters: 900,
    straightness: 0.96,
    team,
    throttlePercent: 100,
    timedRunPhase: null,
    ...overrides,
  });
}

function expectAuditToClose(result: EnergyStoreStep) {
  const { audit } = result;
  const independentlyExpectedStoredEnergyMJ =
    audit.initialStoredEnergyMJ +
    audit.storedChargeEnergyMJ -
    audit.energyRemovedFromStoreMJ;
  const independentlyExpectedConversionResidualMJ =
    audit.recoveredMechanicalEnergyMJ +
    audit.energyRemovedFromStoreMJ -
    audit.storedChargeEnergyMJ -
    audit.deployedMechanicalEnergyMJ -
    audit.batteryLossEnergyMJ -
    audit.inverterLossEnergyMJ -
    audit.motorLossEnergyMJ;

  expect(audit.finalStoredEnergyMJ).toBeCloseTo(
    independentlyExpectedStoredEnergyMJ,
    10,
  );
  expect(Math.abs(audit.storeBalanceErrorMJ)).toBeLessThan(1e-9);
  expect(Math.abs(independentlyExpectedConversionResidualMJ)).toBeLessThan(
    1e-9,
  );
  expect(Math.abs(audit.conversionChainErrorMJ)).toBeLessThan(1e-9);
  expect(result.state.lastStepBalanceErrorMJ).toBeLessThan(1e-9);
}

function expectExactBrakeAuditToClose(result: EnergyStoreStep) {
  const { audit } = result;
  expect(audit.acceptedBrakeRecoveryMechanicalEnergyMJ).toBeLessThanOrEqual(
    audit.requestedBrakeMechanicalEnergyMJ + 1e-12,
  );
  expect(audit.requestedBrakeMechanicalEnergyMJ).toBeCloseTo(
    audit.frictionBrakeMechanicalEnergyMJ +
      audit.acceptedBrakeRecoveryMechanicalEnergyMJ,
    10,
  );
  expect(result.state.frictionBrakePowerKw).toBeCloseTo(
    (audit.frictionBrakeMechanicalEnergyMJ * 1000) / audit.deltaSeconds,
    10,
  );
  expect(result.actualRecoverySourcePowerKw.braking).toBeCloseTo(
    (audit.acceptedBrakeRecoveryMechanicalEnergyMJ * 1000) /
      audit.deltaSeconds,
    10,
  );
  expectAuditToClose(result);
}

describe('Phase 4 Energy Store truth and C5.2.8 DC power', () => {
  const curves: MguKPowerCurve[] = [
    'normal',
    'overtake',
    'race-sprint-power-limited',
  ];
  const boundarySpeedsKph = [309, 310, 339, 340, 344.999, 345, 354.999, 355];
  const dcBoundaryCases = curves.flatMap((curve) =>
    boundarySpeedsKph.map((speedKph) => ({ curve, speedKph })),
  );

  it.each(dcBoundaryCases)(
    'caps $curve deployment at the CU-K DC bus before converting to mechanical power at $speedKph km/h',
    ({ curve, speedKph }) => {
      const regulatoryDcLimitKw = permittedMguKDcPowerKwForSpeed({
        curve,
        speedKph,
      });
      const parameters = energySystemParametersFor(team);
      const result = step(createInitialEnergyStore(team, 0.9), {
        deltaSeconds: 0.05,
        deploymentDcPowerLimitKw: regulatoryDcLimitKw,
        deploymentRequest: 1,
        speedKph,
      });

      expect(result.state.actualDeploymentDcPowerKw).toBeCloseTo(
        regulatoryDcLimitKw,
        8,
      );
      expect(result.state.actualDeploymentDcPowerKw).toBeLessThanOrEqual(
        regulatoryDcLimitKw + 1e-9,
      );
      expect(result.state.actualDeploymentPowerKw).toBeCloseTo(
        result.state.actualDeploymentDcPowerKw *
          parameters.inverterEfficiency *
          parameters.motorEfficiency,
        8,
      );
      expect(result.state.storedDischargePowerKw).toBeGreaterThanOrEqual(
        result.state.actualDeploymentDcPowerKw,
      );
      if (regulatoryDcLimitKw > 0) {
        expect(result.state.actualDeploymentPowerKw).toBeLessThan(
          result.state.actualDeploymentDcPowerKw,
        );
      }
      expectAuditToClose(result);
    },
  );

  it('normalizes every F1 Energy Store and corrupted checkpoints to the exact 4 MJ SOC window', () => {
    for (const candidateTeam of initialTeams) {
      const initial = createInitialEnergyStore(candidateTeam, 0.37);
      const corrupted: EnergyStoreState = {
        ...initial,
        currentEnergyMJ: 91,
        maximumUsableEnergyMJ: 99,
        minimumUsableEnergyMJ: -7,
        stateOfCharge: 0.12,
        usableEnergyMJ: 106,
      };
      const normalized = normalizeEnergyStoreState(
        corrupted,
        candidateTeam,
        37,
        raceRechargeRule,
      );

      expect(
        normalized.maximumUsableEnergyMJ - normalized.minimumUsableEnergyMJ,
      ).toBe(FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj);
      expect(normalized.usableEnergyMJ).toBe(4);
      expect(normalized.currentEnergyMJ).toBe(normalized.maximumUsableEnergyMJ);
      expect(normalized.stateOfCharge).toBe(1);
    }
  });

  it('keeps stored energy and derived SOC inside the exact window under oversized requests', () => {
    let state = createInitialEnergyStore(team, 0);

    state = step(state, {
      brakePercent: 100,
      deltaSeconds: 60,
      speedKph: 350,
      throttlePercent: 0,
    }).state;
    expect(state.currentEnergyMJ).toBeLessThanOrEqual(
      state.maximumUsableEnergyMJ,
    );
    expect(state.stateOfCharge).toBeLessThanOrEqual(1);

    state = step(state, {
      deltaSeconds: 60,
      deploymentDcPowerLimitKw: 10_000,
      deploymentRequest: 1,
      speedKph: 100,
    }).state;
    expect(state.currentEnergyMJ).toBeGreaterThanOrEqual(
      state.minimumUsableEnergyMJ,
    );
    expect(state.stateOfCharge).toBeGreaterThanOrEqual(0);
    expect(state.stateOfCharge).toBeCloseTo(
      (state.currentEnergyMJ - state.minimumUsableEnergyMJ) / 4,
      10,
    );
  });
});

describe('Phase 4 CU-K HV DC-bus recharge ledger', () => {
  it('caps a finite ledger at the bus, stores less after battery loss, and never nets later deployment', () => {
    const rule = finiteRechargeRule(0.05, {
      additionalAllowanceMJ: 0.02,
      baseLimitMJ: 0.03,
    });
    const initial = createInitialEnergyStore(team, 0.3, rule);
    const recovered = step(initial, {
      brakePercent: 100,
      deltaSeconds: 1,
      speedKph: 330,
      throttlePercent: 0,
    });

    expect(recovered.audit.rechargedAtCuKBusMJ).toBeCloseTo(0.05, 10);
    expect(recovered.audit.storedChargeEnergyMJ).toBeGreaterThan(0);
    expect(recovered.audit.storedChargeEnergyMJ).toBeLessThan(
      recovered.audit.rechargedAtCuKBusMJ,
    );
    expect(recovered.state.rechargedAtCuKBusThisLapMJ).toBeCloseTo(0.05, 10);
    expect(recovered.state.storedEnergyThisLapMJ).toBeCloseTo(
      recovered.audit.storedChargeEnergyMJ,
      10,
    );
    expect(recovered.state.rechargeRule).toMatchObject({
      additionalAllowanceMJ: 0.02,
      baseLimitMJ: 0.03,
      measuredAt: 'CU-K-HV-DC-bus',
      remainingMJ: 0,
      usedMJ: 0.05,
    });
    expectAuditToClose(recovered);

    const deployed = step(recovered.state, {
      deltaSeconds: 0.5,
      deploymentRequest: 1,
      speedKph: 250,
    });
    expect(deployed.state.rechargeRule.usedMJ).toBeCloseTo(0.05, 10);

    const attemptedRecovery = step(deployed.state, {
      brakePercent: 100,
      deltaSeconds: 1,
      speedKph: 330,
      throttlePercent: 0,
    });
    expect(attemptedRecovery.state.requestedRecoveryPowerKw).toBeGreaterThan(0);
    expect(attemptedRecovery.state.actualRecoveryPowerKw).toBe(0);
    expect(attemptedRecovery.state.rechargedAtCuKBusThisLapMJ).toBeCloseTo(
      0.05,
      10,
    );
    expect(attemptedRecovery.state.operatingMode).toBe('inactive');
    expectAuditToClose(attemptedRecovery);
  });

  it('preserves unlimited bus usage with a null remainder and accepts additional recovery', () => {
    const initial = createInitialEnergyStore(team, 0.25, unlimitedRechargeRule);
    const preloaded: EnergyStoreState = {
      ...initial,
      rechargedAtCuKBusThisLapMJ: 12,
      rechargeRule: {
        ...initial.rechargeRule,
        remainingMJ: null,
        usedMJ: 12,
      },
    };
    const recovered = step(preloaded, {
      brakePercent: 70,
      deltaSeconds: 0.5,
      speedKph: 280,
      throttlePercent: 0,
    });

    expect(recovered.state.rechargedAtCuKBusThisLapMJ).toBeGreaterThan(12);
    expect(recovered.state.rechargeRule.limit).toEqual({
      kind: 'unlimited',
      maxCuKBusRechargeMj: null,
    });
    expect(recovered.state.rechargeRule.remainingMJ).toBeNull();
    expect(recovered.state.rechargeRule.usedMJ).toBe(
      recovered.state.rechargedAtCuKBusThisLapMJ,
    );
    expectAuditToClose(recovered);
  });

  it('fails closed when the recharge limit is unavailable', () => {
    const initial = createInitialEnergyStore(
      team,
      0.25,
      unavailableRechargeRule,
    );
    const attempted = step(initial, {
      combustionWheelPowerKw: 500,
      deltaSeconds: 1,
      superclipGeneratorRequestKw: 80,
      throttlePercent: 100,
    });

    expect(attempted.state.requestedRecoveryPowerKw).toBe(80);
    expect(attempted.state.actualRecoveryPowerKw).toBe(0);
    expect(attempted.state.chargeDcPowerKw).toBe(0);
    expect(attempted.state.rechargedAtCuKBusThisLapMJ).toBe(0);
    expect(attempted.state.rechargeRule).toMatchObject({
      limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      remainingMJ: null,
      usedMJ: 0,
    });
    expect(attempted.state.operatingMode).toBe('inactive');
    expectAuditToClose(attempted);
  });
});

describe('Phase 4 ERS-K operating modes', () => {
  it('classifies actual propulsion', () => {
    const result = step(createInitialEnergyStore(team, 0.8), {
      deploymentRequest: 1,
      speedKph: 250,
    });

    expect(result.state.actualDeploymentDcPowerKw).toBeGreaterThan(0);
    expect(result.state.actualRecoveryPowerKw).toBe(0);
    expect(result.state.operatingMode).toBe('propulsion');
    expectAuditToClose(result);
  });

  it('classifies actual braking regeneration', () => {
    const result = step(createInitialEnergyStore(team, 0.3), {
      brakePercent: 70,
      speedKph: 280,
      throttlePercent: 0,
    });

    expect(result.state.actualRecoveryPowerKw).toBeGreaterThan(0);
    expect(result.state.operatingMode).toBe('braking-regeneration');
    expectAuditToClose(result);
  });

  it('uses a temperature-limited brake ceiling before calculating recovery and friction heat', () => {
    const normal = step(createInitialEnergyStore(team, 0.3), {
      brakeDecelerationLimitMps2: 49.05,
      brakePercent: 100,
      deltaSeconds: 0.5,
      recoveryRequestScale: 0.1,
      speedKph: 330,
      throttlePercent: 0,
    });
    const overheated = step(createInitialEnergyStore(team, 0.3), {
      // Matches the bounded policy's overheated range rather than inventing
      // a team-specific brake specification.
      brakeDecelerationLimitMps2: 41.2,
      brakePercent: 100,
      deltaSeconds: 0.5,
      recoveryRequestScale: 0.1,
      speedKph: 330,
      throttlePercent: 0,
    });

    expect(overheated.state.requestedBrakePowerKw).toBeLessThan(
      normal.state.requestedBrakePowerKw,
    );
    expect(overheated.state.frictionBrakePowerKw).toBeLessThan(
      normal.state.frictionBrakePowerKw,
    );
    expect(overheated.actualRecoverySourcePowerKw.braking).toBeLessThan(
      normal.actualRecoverySourcePowerKw.braking,
    );
    expect(overheated.audit.rechargedAtCuKBusMJ).toBeLessThan(
      normal.audit.rechargedAtCuKBusMJ,
    );
    expectAuditToClose(normal);
    expectAuditToClose(overheated);
  });

  it('uses an exact contact-patch brake-work budget without the legacy 5.1 g or aero prediction', () => {
    const exactBudgetMJ = 0.18;
    const result = step(createInitialEnergyStore(team, 0.3), {
      brakeDecelerationLimitMps2: 0,
      brakeMechanicalEnergyBudgetMJ: exactBudgetMJ,
      brakePercent: 100,
      deltaSeconds: 1.2,
      gripMultiplier: 0.25,
      speedKph: 330,
      throttlePercent: 0,
    });
    const sameBudgetAtDifferentLegacyInputs = step(
      createInitialEnergyStore(team, 0.3),
      {
        brakeDecelerationLimitMps2: 49.05,
        brakeMechanicalEnergyBudgetMJ: exactBudgetMJ,
        brakePercent: 100,
        deltaSeconds: 1.2,
        gripMultiplier: 1.15,
        speedKph: 180,
        throttlePercent: 0,
      },
    );

    expect(result.audit.requestedBrakeMechanicalEnergyMJ).toBeCloseTo(
      exactBudgetMJ,
      12,
    );
    expect(result.state.requestedBrakePowerKw).toBeCloseTo(150, 12);
    expect(result.state.requestedBrakePowerKw).toBeCloseTo(
      sameBudgetAtDifferentLegacyInputs.state.requestedBrakePowerKw,
      12,
    );
    expect(result.state.requestedRecoveryPowerKw).toBeCloseTo(
      sameBudgetAtDifferentLegacyInputs.state.requestedRecoveryPowerKw,
      12,
    );
    expectExactBrakeAuditToClose(result);
    expectExactBrakeAuditToClose(sameBudgetAtDifferentLegacyInputs);
  });

  it('lets positive exact brake work own the generator even below the legacy pedal gate', () => {
    const result = step(createInitialEnergyStore(team, 0.3), {
      allowLiftCoastRecovery: true,
      brakeMechanicalEnergyBudgetMJ: 0.06,
      brakePercent: 2,
      combustionWheelPowerKw: 500,
      deltaSeconds: 0.5,
      deploymentRequest: 1,
      speedKph: 280,
      superclipGeneratorRequestKw: 500,
      throttlePercent: 100,
    });
    const totalAcceptedGeneratorPowerKw =
      result.actualRecoverySourcePowerKw.braking +
      result.actualRecoverySourcePowerKw.liftCoast +
      result.actualRecoverySourcePowerKw.superclip;

    expect(result.audit.requestedBrakeMechanicalEnergyMJ).toBeCloseTo(0.06, 12);
    expect(result.audit.requestedSuperclipMechanicalEnergyMJ).toBe(0);
    expect(result.actualRecoverySourcePowerKw.liftCoast).toBe(0);
    expect(result.actualRecoverySourcePowerKw.superclip).toBe(0);
    expect(result.state.actualDeploymentDcPowerKw).toBe(0);
    expect(totalAcceptedGeneratorPowerKw).toBeLessThanOrEqual(
      result.state.requestedBrakePowerKw + 1e-12,
    );
    expectExactBrakeAuditToClose(result);
  });

  it('caps a short brake event in its actual solver slice instead of smearing power across the frame', () => {
    const brakeMechanicalEnergyProfileMJ = [0.175, 0, 0, 0, 0] as const;
    const common = {
      allowLiftCoastRecovery: true,
      brakePercent: 2,
      combustionWheelPowerKw: 500,
      deltaSeconds: 0.5,
      deploymentRequest: 1,
      speedKph: 280,
      superclipGeneratorRequestKw: 500,
      throttlePercent: 100,
    } as const;
    const profiled = step(createInitialEnergyStore(team, 0.2), {
      ...common,
      // The profile is authoritative when both exact contracts are present.
      brakeMechanicalEnergyBudgetMJ: 9,
      brakeMechanicalEnergyProfileMJ,
    });
    const wholeFrameAverage = step(createInitialEnergyStore(team, 0.2), {
      ...common,
      brakeMechanicalEnergyBudgetMJ: 0.175,
    });
    const acceptedProfileMJ =
      profiled.audit.acceptedBrakeRecoveryMechanicalEnergyProfileMJ;
    const acceptedProfileTotalMJ = acceptedProfileMJ.reduce(
      (sum, energyMJ) => sum + energyMJ,
      0,
    );
    const sliceSeconds =
      common.deltaSeconds / brakeMechanicalEnergyProfileMJ.length;

    expect(profiled.audit.requestedBrakeMechanicalEnergyMJ).toBeCloseTo(
      0.175,
      12,
    );
    expect(acceptedProfileMJ).toHaveLength(5);
    expect(acceptedProfileMJ[0]).toBeGreaterThan(0);
    expect(
      acceptedProfileMJ.every(
        (energyMJ, index) =>
          energyMJ <= brakeMechanicalEnergyProfileMJ[index] + 1e-12,
      ),
    ).toBe(true);
    expect(
      acceptedProfileMJ.slice(1).every((energyMJ) => energyMJ === 0),
    ).toBe(true);
    expect((acceptedProfileMJ[0] * 1000) / sliceSeconds).toBeLessThanOrEqual(
      energySystemParametersFor(team).maximumRecoveryMechanicalPowerKw + 1e-9,
    );
    expect(acceptedProfileTotalMJ).toBeCloseTo(
      profiled.audit.acceptedBrakeRecoveryMechanicalEnergyMJ,
      12,
    );
    expect(
      profiled.audit.acceptedBrakeRecoveryMechanicalEnergyMJ,
    ).toBeLessThan(
      wholeFrameAverage.audit.acceptedBrakeRecoveryMechanicalEnergyMJ,
    );
    expect(profiled.actualRecoverySourcePowerKw.liftCoast).toBe(0);
    expect(profiled.actualRecoverySourcePowerKw.superclip).toBe(0);
    expect(profiled.state.actualDeploymentDcPowerKw).toBe(0);
    expectExactBrakeAuditToClose(profiled);
  });

  it('normalizes a present invalid exact brake budget to zero instead of restoring the legacy predictor', () => {
    for (const invalidBudgetMJ of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = step(createInitialEnergyStore(team, 0.3), {
        brakeMechanicalEnergyBudgetMJ: invalidBudgetMJ,
        brakePercent: 100,
        deltaSeconds: 0.5,
        speedKph: 330,
        throttlePercent: 0,
      });

      expect(result.state.requestedBrakePowerKw).toBe(0);
      expect(result.state.requestedRecoveryPowerKw).toBe(0);
      expect(result.state.frictionBrakePowerKw).toBe(0);
      expectExactBrakeAuditToClose(result);
    }

    const invalidProfile = step(createInitialEnergyStore(team, 0.3), {
      brakeMechanicalEnergyBudgetMJ: 1,
      brakeMechanicalEnergyProfileMJ: [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1,
      ],
      brakePercent: 100,
      deltaSeconds: 0.5,
      speedKph: 330,
      throttlePercent: 0,
    });
    const emptyProfile = step(createInitialEnergyStore(team, 0.3), {
      brakeMechanicalEnergyBudgetMJ: 1,
      brakeMechanicalEnergyProfileMJ: [],
      brakePercent: 100,
      deltaSeconds: 0.5,
      speedKph: 330,
      throttlePercent: 0,
    });

    expect(invalidProfile.state.requestedBrakePowerKw).toBe(0);
    expect(
      invalidProfile.audit.acceptedBrakeRecoveryMechanicalEnergyProfileMJ,
    ).toEqual([0, 0, 0]);
    expect(emptyProfile.state.requestedBrakePowerKw).toBe(0);
    expect(
      emptyProfile.audit.acceptedBrakeRecoveryMechanicalEnergyProfileMJ,
    ).toEqual([0]);
    expectExactBrakeAuditToClose(invalidProfile);
    expectExactBrakeAuditToClose(emptyProfile);
  });

  it('classifies actual lift-and-coast regeneration', () => {
    const result = step(createInitialEnergyStore(team, 0.3), {
      brakePercent: 0,
      speedKph: 200,
      throttlePercent: 20,
    });

    expect(result.state.actualRecoveryPowerKw).toBeGreaterThan(0);
    expect(result.state.operatingMode).toBe('lift-coast-regeneration');
    expectAuditToClose(result);
  });

  it('classifies 7.99 kW of actual full-throttle generation as superclip and never motors simultaneously', () => {
    const result = step(createInitialEnergyStore(team, 0.3), {
      combustionWheelPowerKw: 500,
      deploymentRequest: 1,
      superclipGeneratorRequestKw: 7.99,
      throttlePercent: 100,
    });

    expect(result.state.requestedRecoveryPowerKw).toBeCloseTo(7.99, 10);
    expect(result.state.actualRecoveryPowerKw).toBeCloseTo(7.99, 10);
    expect(result.actualRecoverySourcePowerKw.superclip).toBeCloseTo(7.99, 10);
    expect(result.state.operatingMode).toBe('full-throttle-superclip');
    expect(result.state.chargeDcPowerKw).toBeGreaterThan(0);
    expect(result.state.actualDeploymentDcPowerKw).toBe(0);
    expect(result.state.dischargeDcPowerKw).toBe(0);
    expect(result.state.motorMechanicalPowerKw).toBeLessThan(0);
    expect(result.audit.recoveredSuperclipMechanicalEnergyMJ).toBeCloseTo(
      result.audit.recoveredMechanicalEnergyMJ,
      10,
    );
    expect(result.audit.superclipRechargedAtCuKBusMJ).toBeCloseTo(
      result.audit.rechargedAtCuKBusMJ,
      10,
    );
    expectAuditToClose(result);
  });

  it('does not relabel unrelated brake recovery from a mixed malformed request', () => {
    const result = step(createInitialEnergyStore(team, 0.3), {
      brakePercent: 70,
      combustionWheelPowerKw: 500,
      superclipGeneratorRequestKw: 2,
      throttlePercent: 100,
    });

    expect(result.state.actualRecoveryPowerKw).toBeGreaterThan(0);
    expect(result.actualRecoverySourcePowerKw.superclip).toBeGreaterThan(0);
    expect(result.actualRecoverySourcePowerKw.superclip).toBeLessThan(
      result.state.actualRecoveryPowerKw,
    );
    expect(
      result.actualRecoverySourcePowerKw.braking +
        result.actualRecoverySourcePowerKw.liftCoast +
        result.actualRecoverySourcePowerKw.superclip,
    ).toBeCloseTo(result.state.actualRecoveryPowerKw, 10);
    expect(result.audit.superclipRechargedAtCuKBusMJ).toBeGreaterThan(0);
    expect(result.audit.superclipRechargedAtCuKBusMJ).toBeLessThan(
      result.audit.rechargedAtCuKBusMJ,
    );
    expect(
      result.audit.superclipRechargedAtCuKBusMJ /
        result.audit.rechargedAtCuKBusMJ,
    ).toBeCloseTo(
      result.audit.recoveredSuperclipMechanicalEnergyMJ /
        result.audit.recoveredMechanicalEnergyMJ,
      10,
    );
    expect(result.state.operatingMode).toBe('braking-regeneration');
    expect(result.state.actualDeploymentDcPowerKw).toBe(0);
    expectAuditToClose(result);
  });

  it('does not accept a superclip request without high throttle and positive ICE wheel power', () => {
    const lowThrottle = step(createInitialEnergyStore(team, 0.3), {
      combustionWheelPowerKw: 500,
      superclipGeneratorRequestKw: 120,
      throttlePercent: 40,
    });
    const noIce = step(createInitialEnergyStore(team, 0.3), {
      combustionWheelPowerKw: 0,
      superclipGeneratorRequestKw: 120,
      throttlePercent: 100,
    });

    expect(lowThrottle.actualRecoverySourcePowerKw.superclip).toBe(0);
    expect(lowThrottle.audit.superclipRechargedAtCuKBusMJ).toBe(0);
    expect(lowThrottle.state.operatingMode).toBe('lift-coast-regeneration');
    expect(noIce.actualRecoverySourcePowerKw.superclip).toBe(0);
    expect(noIce.audit.superclipRechargedAtCuKBusMJ).toBe(0);
    expect(noIce.state.operatingMode).toBe('inactive');
  });

  it('classifies accepted superclip flow across the whole public tick even if the recharge ledger fills before its final slice', () => {
    const result = step(
      createInitialEnergyStore(team, 0.5, finiteRechargeRule(0.01)),
      {
        combustionWheelPowerKw: 500,
        deltaSeconds: 2,
        superclipGeneratorRequestKw: 120,
        throttlePercent: 100,
      },
    );

    expect(result.actualRecoverySourcePowerKw.superclip).toBeGreaterThan(0);
    expect(result.state.actualRecoveryPowerKw).toBeGreaterThan(0);
    expect(result.audit.superclipRechargedAtCuKBusMJ).toBeGreaterThan(0);
    expect(result.state.rechargeRule.remainingMJ).toBe(0);
    expect(result.state.operatingMode).toBe('full-throttle-superclip');
    expectAuditToClose(result);
  });

  it('uses actual flow rather than a request label when selecting inactive', () => {
    const initial = createInitialEnergyStore(
      team,
      0.3,
      unavailableRechargeRule,
    );
    const result = step(initial, {
      combustionWheelPowerKw: 500,
      superclipGeneratorRequestKw: 120,
      throttlePercent: 100,
    });

    expect(result.state.requestedRecoveryPowerKw).toBe(120);
    expect(result.state.actualRecoveryPowerKw).toBe(0);
    expect(result.state.operatingMode).toBe('inactive');
    expectAuditToClose(result);
  });

  it('does not report a motor and generator in the same substep', () => {
    const braking = step(createInitialEnergyStore(team, 0.45), {
      brakePercent: 60,
      deploymentRequest: 1,
      speedKph: 260,
      throttlePercent: 0,
    });
    const superclip = step(createInitialEnergyStore(team, 0.45), {
      combustionWheelPowerKw: 500,
      deploymentRequest: 1,
      superclipGeneratorRequestKw: 40,
      speedKph: 320,
      throttlePercent: 100,
    });

    for (const result of [braking, superclip]) {
      expect(result.state.actualRecoveryPowerKw).toBeGreaterThan(0);
      expect(result.state.actualDeploymentDcPowerKw).toBe(0);
      expect(result.audit.deployedAtCuKBusMJ).toBe(0);
      expect(result.audit.rechargedAtCuKBusMJ).toBeGreaterThan(0);
      expectAuditToClose(result);
    }
  });
});

describe('Phase 4 energy-flow audit, lap reset, and integration slicing', () => {
  it('closes every tick and the independently summed lap balance across every operating mode', () => {
    const initial = createInitialEnergyStore(team, 0.65);
    let state = initial;
    const results: EnergyStoreStep[] = [];
    const inputs: Array<Partial<Omit<AdvanceEnergyStoreOptions, 'state'>>> = [
      {
        deltaSeconds: 0.4,
        deploymentRequest: 0.6,
        speedKph: 260,
      },
      {
        brakePercent: 72,
        deltaSeconds: 0.7,
        speedKph: 300,
        throttlePercent: 0,
      },
      {
        deltaSeconds: 0.5,
        speedKph: 190,
        throttlePercent: 18,
      },
      {
        combustionWheelPowerKw: 500,
        deltaSeconds: 0.3,
        deploymentRequest: 1,
        speedKph: 320,
        superclipGeneratorRequestKw: 12,
        throttlePercent: 100,
      },
      {
        combustionWheelPowerKw: 0,
        deltaSeconds: 0.2,
        speedKph: 70,
        throttlePercent: 100,
      },
    ];

    for (const input of inputs) {
      const result = step(state, input);
      expectAuditToClose(result);
      results.push(result);
      state = result.state;
    }

    const summedStoredChargeMJ = results.reduce(
      (total, result) => total + result.audit.storedChargeEnergyMJ,
      0,
    );
    const summedRemovedMJ = results.reduce(
      (total, result) => total + result.audit.energyRemovedFromStoreMJ,
      0,
    );
    const summedBusRechargeMJ = results.reduce(
      (total, result) => total + result.audit.rechargedAtCuKBusMJ,
      0,
    );

    expect(state.currentEnergyMJ).toBeCloseTo(
      initial.currentEnergyMJ + summedStoredChargeMJ - summedRemovedMJ,
      10,
    );
    expect(state.storedEnergyThisLapMJ).toBeCloseTo(summedStoredChargeMJ, 10);
    expect(state.energyRemovedThisLapMJ).toBeCloseTo(summedRemovedMJ, 10);
    expect(state.rechargedAtCuKBusThisLapMJ).toBeCloseTo(
      summedBusRechargeMJ,
      10,
    );
    expect(Math.abs(energyBalanceErrorMJ(state))).toBeLessThan(1e-9);
  });

  it('preserves MJ, SOC, and thermal truth while resetting every per-lap flow for a new rule', () => {
    let state = createInitialEnergyStore(team, 0.55);
    state = step(state, {
      brakePercent: 70,
      deltaSeconds: 0.8,
      speedKph: 290,
      throttlePercent: 0,
    }).state;
    state = step(state, {
      deltaSeconds: 0.8,
      deploymentRequest: 0.8,
      speedKph: 250,
    }).state;
    const nextRule = finiteRechargeRule(0.2);
    const next = startNextEnergyLap(state, nextRule);

    expect(next.currentEnergyMJ).toBe(state.currentEnergyMJ);
    expect(next.stateOfCharge).toBe(state.stateOfCharge);
    expect(next.batteryTemperatureC).toBe(state.batteryTemperatureC);
    expect(next.motorGeneratorTemperatureC).toBe(
      state.motorGeneratorTemperatureC,
    );
    expect(next.inverterTemperatureC).toBe(state.inverterTemperatureC);
    expect(next.lapStartEnergyMJ).toBe(state.currentEnergyMJ);
    expect(next.operatingMode).toBe('inactive');

    const resetFields = [
      next.requestedRecoveryMechanicalEnergyThisLapMJ,
      next.recoveredMechanicalEnergyThisLapMJ,
      next.rechargedAtCuKBusThisLapMJ,
      next.storedEnergyThisLapMJ,
      next.deployedAtCuKBusThisLapMJ,
      next.deployedMechanicalEnergyThisLapMJ,
      next.energyRemovedThisLapMJ,
      next.batteryLossThisLapMJ,
      next.inverterLossThisLapMJ,
      next.motorLossThisLapMJ,
      next.conversionLossThisLapMJ,
      next.lastStepBalanceErrorMJ,
      next.energyBalanceErrorMJ,
    ];
    expect(resetFields.every((value) => value === 0)).toBe(true);
    expect(next.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 0.2 },
      remainingMJ: 0.2,
      usedMJ: 0,
    });
  });

  it('carries only the post-Line share from an old ledger near its ceiling into the new rule', () => {
    const initialOldRule = finiteRechargeRule(0.09);
    const expandedOldRule = finiteRechargeRule(0.1);
    const nextRule = finiteRechargeRule(8);
    const filled = step(
      createInitialEnergyStore(team, 0.25, initialOldRule),
      {
        brakePercent: 100,
        deltaSeconds: 2,
        speedKph: 300,
        throttlePercent: 0,
      },
    ).state;
    const nearOldCeiling: EnergyStoreState = {
      ...filled,
      rechargeRule: {
        ...expandedOldRule,
        remainingMJ: 0.01,
        usedMJ: 0.09,
      },
    };
    const integrated = step(nearOldCeiling, {
      brakePercent: 100,
      deltaSeconds: 2,
      speedKph: 300,
      throttlePercent: 0,
    }).state;
    const fullFrameBusRechargeMJ =
      integrated.rechargedAtCuKBusThisLapMJ -
      nearOldCeiling.rechargedAtCuKBusThisLapMJ;
    const rebased = rebaseEnergyStoreAtLapCrossing({
      frameStartState: nearOldCeiling,
      integratedState: integrated,
      postLineFraction: 0.6,
      rechargeRule: nextRule,
    });

    expect(fullFrameBusRechargeMJ).toBeCloseTo(0.01, 10);
    expect(rebased.rechargeAcceptanceScale).toBe(1);
    expect(rebased.state.rechargedAtCuKBusThisLapMJ).toBeCloseTo(
      fullFrameBusRechargeMJ * 0.6,
      10,
    );
    expect(rebased.state.rechargeRule.usedMJ).toBeCloseTo(
      rebased.state.rechargedAtCuKBusThisLapMJ,
      12,
    );
    expect(rebased.state.lapStartEnergyMJ).toBeCloseTo(
      nearOldCeiling.currentEnergyMJ +
        (integrated.currentEnergyMJ - nearOldCeiling.currentEnergyMJ) * 0.4,
      12,
    );
    expect(Math.abs(energyBalanceErrorMJ(rebased.state))).toBeLessThan(1e-10);
  });

  it('rejects extreme post-Line recovery consistently when the new ledger is tighter', () => {
    const oldRule = finiteRechargeRule(2);
    const nextRule = finiteRechargeRule(0.001);
    const initial = createInitialEnergyStore(team, 0.2, oldRule);
    const integrated = step(initial, {
      brakePercent: 100,
      deltaSeconds: 8,
      speedKph: 330,
      throttlePercent: 0,
    }).state;
    const rebased = rebaseEnergyStoreAtLapCrossing({
      frameStartState: initial,
      integratedState: integrated,
      postLineFraction: 0.75,
      rechargeRule: nextRule,
    });
    const state = rebased.state;
    const conversionResidualMJ =
      state.recoveredMechanicalEnergyThisLapMJ +
      state.energyRemovedThisLapMJ -
      state.storedEnergyThisLapMJ -
      state.deployedMechanicalEnergyThisLapMJ -
      state.batteryLossThisLapMJ -
      state.inverterLossThisLapMJ -
      state.motorLossThisLapMJ;

    expect(rebased.rechargeAcceptanceScale).toBeLessThan(1);
    expect(state.rechargedAtCuKBusThisLapMJ).toBeCloseTo(0.001, 12);
    expect(state.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 0.001 },
      remainingMJ: 0,
      usedMJ: 0.001,
    });
    expect(state.storedEnergyThisLapMJ).toBeLessThanOrEqual(
      state.rechargedAtCuKBusThisLapMJ + 1e-12,
    );
    expect(state.frictionBrakePowerKw).toBeCloseTo(
      Math.max(
        0,
        state.requestedBrakePowerKw - state.actualRecoveryPowerKw,
      ),
      12,
    );
    expect(Math.abs(energyBalanceErrorMJ(state))).toBeLessThan(1e-10);
    expect(state.energyBalanceErrorMJ).toBeCloseTo(
      energyBalanceErrorMJ(state),
      12,
    );
    expect(Math.abs(conversionResidualMJ)).toBeLessThan(1e-10);

    const checkpointNormalized = normalizeEnergyStoreState(
      state,
      team,
      state.stateOfCharge * 100,
      nextRule,
    );
    expect(checkpointNormalized.currentEnergyMJ).toBeCloseTo(
      state.currentEnergyMJ,
      12,
    );
    expect(checkpointNormalized.rechargedAtCuKBusThisLapMJ).toBeCloseTo(
      state.rechargedAtCuKBusThisLapMJ,
      12,
    );
    expect(checkpointNormalized.rechargeRule.usedMJ).toBeCloseTo(
      checkpointNormalized.rechargedAtCuKBusThisLapMJ,
      12,
    );
    expect(Math.abs(energyBalanceErrorMJ(checkpointNormalized))).toBeLessThan(
      1e-10,
    );
  });

  it('keeps energy integration stable when the same deployment interval is sliced', () => {
    const initial = createInitialEnergyStore(team, 0.7);
    const oneCall = step(initial, {
      deltaSeconds: 2,
      deploymentRequest: 0.65,
      speedKph: 260,
    });
    expectAuditToClose(oneCall);

    let slicedState = initial;
    let slicedRemovedMJ = 0;
    let slicedMechanicalMJ = 0;
    for (let index = 0; index < 40; index += 1) {
      const result = step(slicedState, {
        deltaSeconds: 0.05,
        deploymentRequest: 0.65,
        speedKph: 260,
      });
      expectAuditToClose(result);
      slicedRemovedMJ += result.audit.energyRemovedFromStoreMJ;
      slicedMechanicalMJ += result.audit.deployedMechanicalEnergyMJ;
      slicedState = result.state;
    }

    expect(
      Math.abs(oneCall.state.currentEnergyMJ - slicedState.currentEnergyMJ),
    ).toBeLessThan(0.015);
    expect(
      Math.abs(oneCall.audit.energyRemovedFromStoreMJ - slicedRemovedMJ),
    ).toBeLessThan(0.015);
    expect(
      Math.abs(oneCall.audit.deployedMechanicalEnergyMJ - slicedMechanicalMJ),
    ).toBeLessThan(0.015);
    expect(Math.abs(energyBalanceErrorMJ(slicedState))).toBeLessThan(1e-9);
  });
});

describe('energy scheduling remains an intent rather than a physical override', () => {
  it('requests more deployment for push and attack without changing physical limits', () => {
    const state = createInitialEnergyStore(team, 0.72);
    const standard = deploymentRequest(state, {
      paceMode: 'standard',
      straightLengthAheadMeters: 420,
      straightness: 0.68,
    });
    const push = deploymentRequest(state, {
      paceMode: 'push',
      straightLengthAheadMeters: 420,
      straightness: 0.68,
    });
    const attack = deploymentRequest(state, {
      battlePhase: 'attacking',
      overtakeActive: true,
    });

    expect(push).toBeGreaterThan(standard);
    expect(attack).toBeGreaterThan(standard);

    const standardStep = step(state, {
      deploymentDcPowerLimitKw: 100,
      deploymentRequest: standard,
      speedKph: 340,
    });
    const attackStep = step(state, {
      deploymentDcPowerLimitKw: 100,
      deploymentRequest: attack,
      speedKph: 340,
    });
    expect(standardStep.state.maximumDeploymentDcPowerKw).toBe(
      attackStep.state.maximumDeploymentDcPowerKw,
    );
    expect(attackStep.state.actualDeploymentDcPowerKw).toBeLessThanOrEqual(100);
  });
});
