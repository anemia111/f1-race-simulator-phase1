import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SCRIPT_PATH), '..')
const outputArgument = process.argv
  .find((argument) => argument.startsWith('--output='))
  ?.slice('--output='.length)

async function loadRuntime() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: ROOT,
    server: { middlewareMode: true },
  })

  try {
    const [
      calibration,
      categories,
      physicsLap,
      trackData,
      paceData,
      puEventData,
      regulationData,
    ] = await Promise.all([
        server.ssrLoadModule('/src/simulation/physicsCalibration.ts'),
        server.ssrLoadModule('/src/simulation/categoryPhysics.ts'),
        server.ssrLoadModule('/src/simulation/physicalLap.ts'),
        server.ssrLoadModule('/src/data/tracks.ts'),
        server.ssrLoadModule('/src/data/paceCalibration.ts'),
        server.ssrLoadModule('/src/data/fiaPuEventInputs2026.ts'),
        server.ssrLoadModule('/src/simulation/regulations.ts'),
      ])

    return {
      calibration,
      categories,
      paceData,
      physicsLap,
      puEventData,
      regulationData,
      server,
      trackData,
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

const roundedJson = (value) =>
  JSON.stringify(
    value,
    (_key, nested) =>
      typeof nested === 'number' && Number.isFinite(nested)
        ? Number(nested.toFixed(6))
        : nested,
    2,
  )

const average = (values) =>
  values.reduce((total, value) => total + value, 0) / values.length

const runtime = await loadRuntime()

try {
  const {
    buildPhysicsValidationReport,
    f1QualifyingLapObservations,
    f1QualifyingSpeedObservations,
    summarizePaceCalibrationEvidence,
  } = runtime.calibration
  const { categoryPhysicsFor, resolveOperationalVehicleMass } =
    runtime.categories
  const { simulatePhysicalLap } = runtime.physicsLap
  const { tracks } = runtime.trackData
  const {
    f1PaceCalibration2026,
    superFormulaPaceCalibration2026,
  } = runtime.paceData
  const { fiaPuEventInputs2026 } = runtime.puEventData
  const { FIA_2026_REGULATION_PROFILE } = runtime.regulationData
  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const f1PuEventInputByEventId = new Map(
    fiaPuEventInputs2026.map((input) => [input.eventId, input]),
  )
  const observations = f1QualifyingLapObservations(
    f1PaceCalibration2026,
  )
  const f1Physics = categoryPhysicsFor('f1-custom')
  const f1ReferenceMass = resolveOperationalVehicleMass({
    f1NominalTyreMassKg: null,
    physics: f1Physics,
    weekendStage: 'qualifying',
  })
  const predictions = observations.map((observation) => {
    const track = trackById.get(observation.trackId)

    if (!track) {
      throw new Error(`Missing track geometry for ${observation.trackId}`)
    }

    return {
      predictedLapSeconds: simulatePhysicalLap(track, {
        // Calibration observations identify a circuit, not an FIA competition.
        // Event-scoped PU instructions must never be borrowed by track ID.
        fiaPuEventInput: null,
        physics: f1Physics,
      }).lapTimeSeconds,
      trackId: observation.trackId,
    }
  })
  const commonCategoryTrackIds = ['suzuka-approx']
  const categoryIds = ['f1-custom', 'super-formula']
  const categoryPredictions = categoryIds.flatMap((categoryId) =>
    commonCategoryTrackIds.map((trackId) => {
      const track = trackById.get(trackId)

      if (!track) {
        throw new Error(`Missing common category track ${trackId}`)
      }

      return {
        categoryId,
        lapTimeSeconds: simulatePhysicalLap(track, {
          physics: categoryPhysicsFor(categoryId),
        }).lapTimeSeconds,
        trackId,
        trackLengthKm: track.lengthKm,
      }
    }),
  )
  const suzuka = trackById.get('suzuka-approx')

  if (!suzuka) {
    throw new Error('Suzuka geometry is required for physics diagnostics')
  }

  // This diagnostic deliberately names the 2026 Japanese GP event. It is the
  // only place in this report where that event-scoped PU document is eligible.
  const suzukaPuEventInput = f1PuEventInputByEventId.get('f1-03') ?? null
  const baseline = simulatePhysicalLap(suzuka, {
    eventId: 'f1-03',
    fiaPuEventInput: suzukaPuEventInput,
    physics: f1Physics,
  })
  const fuelHeavy = simulatePhysicalLap(suzuka, {
    eventId: 'f1-03',
    fiaPuEventInput: suzukaPuEventInput,
    massKg: f1ReferenceMass.operationalMassKg + 80,
    physics: f1Physics,
  })
  const wet = simulatePhysicalLap(suzuka, {
    eventId: 'f1-03',
    fiaPuEventInput: suzukaPuEventInput,
    gripMultiplier: 0.7,
    physics: f1Physics,
  })
  const noDeployment = simulatePhysicalLap(suzuka, {
    deploymentPowerKw: 0,
    eventId: 'f1-03',
    fiaPuEventInput: suzukaPuEventInput,
    physics: f1Physics,
  })
  const lowerGripTyre = simulatePhysicalLap(suzuka, {
    eventId: 'f1-03',
    fiaPuEventInput: suzukaPuEventInput,
    gripMultiplier: 0.92,
    physics: f1Physics,
  })
  const physicalAcrossObservedTracks = observations.map((observation) => {
    const track = trackById.get(observation.trackId)

    if (!track) {
      throw new Error(`Missing track geometry for ${observation.trackId}`)
    }

    return simulatePhysicalLap(track, {
      // Observed-track comparisons are circuit-level calibration evidence and
      // therefore use the documented no-event reference policy.
      fiaPuEventInput: null,
      physics: f1Physics,
    })
  })
  // Compare each circuit's modeled peak with its own observed peak. A single
  // field-wide mean would let a circuit that is far too fast be cancelled by one
  // that is too slow, which is the error this comparison exists to expose.
  const speedObservations = f1QualifyingSpeedObservations(f1PaceCalibration2026)
  const modeledPeakByTrack = new Map(
    observations.map((observation, index) => [
      observation.trackId,
      physicalAcrossObservedTracks[index].maximumSpeedKph,
    ]),
  )
  const speedComparisons = speedObservations
    .filter((observation) => modeledPeakByTrack.has(observation.trackId))
    .map((observation) => {
      const modeledPeakKph = modeledPeakByTrack.get(observation.trackId)

      return {
        errorKph: modeledPeakKph - observation.observedFieldPeakKph,
        modeledPeakKph,
        observedDriverPeakMedianKph: observation.observedDriverPeakMedianKph,
        observedFieldPeakKph: observation.observedFieldPeakKph,
        trackId: observation.trackId,
      }
    })
    .sort((left, right) => Math.abs(right.errorKph) - Math.abs(left.errorKph))

  // Each physical reference lap reports both the event/policy CU-K recharge
  // input and the mechanical deployment allowance after battery, inverter and
  // motor losses. They are different measurement boundaries and must never be
  // added or compared as if both were stored or shaft energy.
  // A lap that plans to spend the whole allowance lands on the limit, and the
  // segment-wise integral that measures it carries a joule or so of rounding.
  // Counting those as over the limit would report a rounding error as a
  // regulation breach, so "over" means over by more than the integral can
  // resolve. A lap that genuinely overspends does so by megajoules: before the
  // allocation existed these same circuits read 14 to 20 MJ, which is over
  // both bounds.
  const ENERGY_BUDGET_RESOLUTION_MJ = 0.001
  const energyComparisons = observations
    .map((observation, index) => {
      const lap = physicalAcrossObservedTracks[index]
      const mechanicalAllowanceMj = lap.referenceDeploymentEnergyBudgetMj
      const rechargeAtCuKBusMj = lap.referenceRechargeAtCuKBusMJ

      if (mechanicalAllowanceMj === null || rechargeAtCuKBusMj === null) {
        throw new Error(
          `Missing F1 reference energy boundary for ${observation.trackId}`,
        )
      }

      return {
        trackId: observation.trackId,
        modelMechanicalMj: lap.deploymentEnergyMj,
        mechanicalAllowanceMj,
        ratioOfMechanicalAllowance:
          lap.deploymentEnergyMj / mechanicalAllowanceMj,
        rechargeAtCuKBusMj,
        rechargeResolution: lap.referenceRechargeResolution,
        rechargeSourceId: lap.referenceRechargeSourceId,
      }
    })
    .sort(
      (left, right) =>
        right.ratioOfMechanicalAllowance - left.ratioOfMechanicalAllowance,
    )

  const report = buildPhysicsValidationReport({
    categoryPredictions,
    evidence: {
      'deployment-power-sensitivity': {
        basis: 'Suzuka reference lap with category-limit deployment versus 0 kW',
        modelValue: {
          deployedLapSeconds: baseline.lapTimeSeconds,
          noDeploymentLapSeconds: noDeployment.lapTimeSeconds,
          noDeploymentLapRatio:
            noDeployment.lapTimeSeconds / baseline.lapTimeSeconds,
        },
        observedValue: null,
        sampleCount: 1,
        unit: 's and lap ratio',
      },
      'deployment-energy-budget': {
        basis:
          'MGU-K mechanical energy spent by each reference lap against its event-aware mechanical attack-lap allowance. The source CU-K recharge input is reported separately and is converted through the neutral battery/inverter/motor chain; it is never added directly to the stored SOC window.',
        modelValue: {
          perCircuit: energyComparisons,
          meanMechanicalMj: average(
            energyComparisons.map((entry) => entry.modelMechanicalMj),
          ),
          maximumMechanicalMj: Math.max(
            ...energyComparisons.map((entry) => entry.modelMechanicalMj),
          ),
          meanRatioOfMechanicalAllowance: average(
            energyComparisons.map(
              (entry) => entry.ratioOfMechanicalAllowance,
            ),
          ),
          circuitsOverAllowance: energyComparisons.filter(
            (entry) =>
              entry.modelMechanicalMj >
              entry.mechanicalAllowanceMj + ENERGY_BUDGET_RESOLUTION_MJ,
          ).length,
        },
        observedValue: {
          defaultReferenceRechargePolicyAtCuKBusMj:
            FIA_2026_REGULATION_PROFILE.energy.referenceAttackRechargePolicyMj,
          usableStateOfChargeWindowMj:
            FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj,
          technicalDefaultRechargeLimitAtCuKBusMj:
            FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
          article: FIA_2026_REGULATION_PROFILE.energy.article,
        },
        sampleCount: energyComparisons.length,
        unit: 'MJ per lap',
      },
      'fuel-mass-sensitivity': {
        basis: 'Suzuka reference lap at default mass versus minimum mass + 80 kg',
        modelValue: {
          baselineLapSeconds: baseline.lapTimeSeconds,
          heavyLapSeconds: fuelHeavy.lapTimeSeconds,
          heavyLapRatio: fuelHeavy.lapTimeSeconds / baseline.lapTimeSeconds,
        },
        observedValue: null,
        sampleCount: 1,
        unit: 's and lap ratio',
      },
      'maximum-speed': {
        basis:
          'Physical reference laps compared per circuit with observed 2026 qualifying car-telemetry peaks',
        modelValue: {
          maximumKph: Math.max(
            ...physicalAcrossObservedTracks.map((lap) => lap.maximumSpeedKph),
          ),
          meanKph: average(
            physicalAcrossObservedTracks.map((lap) => lap.maximumSpeedKph),
          ),
          perCircuit: speedComparisons,
          meanAbsoluteErrorKph: speedComparisons.length
            ? average(speedComparisons.map((entry) => Math.abs(entry.errorKph)))
            : null,
          biasKph: speedComparisons.length
            ? average(speedComparisons.map((entry) => entry.errorKph))
            : null,
        },
        observedValue: speedComparisons.length
          ? {
              circuitCount: speedComparisons.length,
              meanFieldPeakKph: average(
                speedComparisons.map((entry) => entry.observedFieldPeakKph),
              ),
            }
          : null,
        sampleCount: speedComparisons.length,
        unit: 'km/h',
      },
      'minimum-corner-speed': {
        basis: 'Physical reference laps on official qualifying comparison tracks',
        modelValue: {
          minimumKph: Math.min(
            ...physicalAcrossObservedTracks.map((lap) => lap.minimumSpeedKph),
          ),
          meanKph: average(
            physicalAcrossObservedTracks.map((lap) => lap.minimumSpeedKph),
          ),
        },
        observedValue: null,
        sampleCount: physicalAcrossObservedTracks.length,
        unit: 'km/h',
      },
      'tyre-behaviour': {
        basis: 'Suzuka reference lap with a dimensionless dry-grip perturbation',
        modelValue: {
          baselineLapSeconds: baseline.lapTimeSeconds,
          lowerGripLapSeconds: lowerGripTyre.lapTimeSeconds,
          lowerGripLapRatio:
            lowerGripTyre.lapTimeSeconds / baseline.lapTimeSeconds,
        },
        observedValue: null,
        sampleCount: 1,
        unit: 's and lap ratio',
      },
      'wet-pace-sensitivity': {
        basis: 'Suzuka dry reference versus a 0.70 surface grip multiplier',
        modelValue: {
          dryLapSeconds: baseline.lapTimeSeconds,
          wetLapSeconds: wet.lapTimeSeconds,
          wetLapRatio: wet.lapTimeSeconds / baseline.lapTimeSeconds,
        },
        observedValue: null,
        sampleCount: 1,
        unit: 's and lap ratio',
      },
    },
    observations,
    predictions,
  })
  const f1SuzukaObservation = f1PaceCalibration2026.find(
    (record) => record.trackId === 'suzuka-approx',
  )
  const sfSuzukaObservation = superFormulaPaceCalibration2026.find(
    (record) => record.trackId === 'suzuka-approx',
  )
  const observedCategoryOrder = [
    {
      categoryId: 'f1-custom',
      lapTimeSeconds:
        f1SuzukaObservation?.qualifying.selectedReferenceSeconds ?? null,
    },
    {
      categoryId: 'super-formula',
      lapTimeSeconds:
        sfSuzukaObservation?.qualifying.selectedReferenceSeconds ?? null,
    },
  ]
  const categoryOrderObservation =
    observedCategoryOrder.every(
      (sample) =>
        typeof sample.lapTimeSeconds === 'number' &&
        Number.isFinite(sample.lapTimeSeconds),
    )
      ? {
          modelOrder: report.categoryRanking
            .filter((entry) =>
              observedCategoryOrder.some(
                (observation) =>
                  observation.categoryId === entry.categoryId,
              ),
            )
            .map((entry) => entry.categoryId),
          observedOrder: observedCategoryOrder
            .sort((left, right) => left.lapTimeSeconds - right.lapTimeSeconds)
            .map((sample) => sample.categoryId),
          sampleCount: 1,
          status: 'available',
          trackId: 'suzuka-approx',
        }
      : {
          modelOrder: null,
          observedOrder: null,
          reason: 'No shared official F1 and SUPER FORMULA circuit observation',
          sampleCount: 0,
          status: 'unavailable',
          trackId: null,
        }
  const result = {
    categoryOrderObservation,
    dataEvidence: summarizePaceCalibrationEvidence(
      f1PaceCalibration2026,
    ),
    generatedAt: new Date().toISOString(),
    report,
    sourceData: {
      f1: 'src/data/calibration/f1PaceCalibration2026.json',
      superFormula:
        'src/data/calibration/superFormulaPaceCalibration2026.json',
    },
  }
  const json = `${roundedJson(result)}\n`

  if (outputArgument) {
    const outputPath = resolve(ROOT, outputArgument)

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, json, 'utf8')
    process.stdout.write(`Wrote ${outputPath}\n`)
  } else {
    process.stdout.write(json)
  }
} finally {
  await runtime.server.close()
}
