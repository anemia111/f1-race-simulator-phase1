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
      regulationData,
    ] = await Promise.all([
        server.ssrLoadModule('/src/simulation/physicsCalibration.ts'),
        server.ssrLoadModule('/src/simulation/categoryPhysics.ts'),
        server.ssrLoadModule('/src/simulation/physicalLap.ts'),
        server.ssrLoadModule('/src/data/tracks.ts'),
        server.ssrLoadModule('/src/data/paceCalibration.ts'),
        server.ssrLoadModule('/src/simulation/regulations.ts'),
      ])

    return {
      calibration,
      categories,
      paceData,
      physicsLap,
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
  const { categoryPhysicsFor } = runtime.categories
  const { simulatePhysicalLap } = runtime.physicsLap
  const { tracks } = runtime.trackData
  const {
    f1PaceCalibration2026,
    superFormulaPaceCalibration2026,
  } = runtime.paceData
  const { FIA_2026_REGULATION_PROFILE } = runtime.regulationData
  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const observations = f1QualifyingLapObservations(
    f1PaceCalibration2026,
  )
  const f1Physics = categoryPhysicsFor('f1-custom')
  const predictions = observations.map((observation) => {
    const track = trackById.get(observation.trackId)

    if (!track) {
      throw new Error(`Missing track geometry for ${observation.trackId}`)
    }

    return {
      predictedLapSeconds: simulatePhysicalLap(track, {
        physics: f1Physics,
      }).lapTimeSeconds,
      trackId: observation.trackId,
    }
  })
  const commonCategoryTrackIds = ['suzuka-approx']
  const categoryIds = ['f1-custom', 'super-formula', 'f2', 'f3']
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

  const baseline = simulatePhysicalLap(suzuka, { physics: f1Physics })
  const fuelHeavy = simulatePhysicalLap(suzuka, {
    massKg: f1Physics.minimumMassKg + 80,
    physics: f1Physics,
  })
  const wet = simulatePhysicalLap(suzuka, {
    gripMultiplier: 0.7,
    physics: f1Physics,
  })
  const noDeployment = simulatePhysicalLap(suzuka, {
    deploymentPowerKw: 0,
    physics: f1Physics,
  })
  const lowerGripTyre = simulatePhysicalLap(suzuka, {
    gripMultiplier: 0.92,
    physics: f1Physics,
  })
  const physicalAcrossObservedTracks = observations.map((observation) => {
    const track = trackById.get(observation.trackId)

    if (!track) {
      throw new Error(`Missing track geometry for ${observation.trackId}`)
    }

    return simulatePhysicalLap(track, { physics: f1Physics })
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

  // The reference lap spends a regulation allowance, so measuring the bill is
  // what shows whether the allocation actually respects it.
  //
  // Two different bounds apply and the report carries both, because which one
  // binds depends on what kind of lap is being described. The recharge limit
  // is what a lap may recover as it runs, so it bounds a lap repeated in a
  // steady state. A single clear qualifying lap also arrives with the usable
  // state-of-charge window already filled from the out lap and empties it, so
  // its bound is the sum. The reference lap is that single clear lap, and the
  // observations it is compared against - official Q3 times and qualifying
  // telemetry peaks - are single clear laps too, so the sum is the bound that
  // applies to it. The recharge limit stays in the report because a lap over
  // it is a lap the car could not repeat.
  const qualifyingLimitMj =
    FIA_2026_REGULATION_PROFILE.energy.qualifyingRechargeLimitMj
  const attackLapAllowanceMj =
    qualifyingLimitMj +
    FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj
  // A lap that plans to spend the whole allowance lands on the limit, and the
  // segment-wise integral that measures it carries a joule or so of rounding.
  // Counting those as over the limit would report a rounding error as a
  // regulation breach, so "over" means over by more than the integral can
  // resolve. A lap that genuinely overspends does so by megajoules: before the
  // allocation existed these same circuits read 14 to 20 MJ, which is over
  // both bounds.
  const ENERGY_BUDGET_RESOLUTION_MJ = 0.001
  const energyComparisons = observations
    .map((observation, index) => ({
      trackId: observation.trackId,
      modelMj: physicalAcrossObservedTracks[index].deploymentEnergyMj,
      ratioOfAllowance:
        physicalAcrossObservedTracks[index].deploymentEnergyMj /
        attackLapAllowanceMj,
      ratioOfLimit:
        physicalAcrossObservedTracks[index].deploymentEnergyMj /
        qualifyingLimitMj,
    }))
    .sort((left, right) => right.ratioOfLimit - left.ratioOfLimit)

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
          'MGU-K energy each reference lap spends, against the single-clear-lap allowance (qualifying recharge limit plus the usable state-of-charge window) in FIA_2026_REGULATION_PROFILE (article C5.2.7-C5.2.12). The recharge limit on its own is reported alongside, as the bound on a lap repeated in a steady state.',
        modelValue: {
          perCircuit: energyComparisons,
          meanMj: average(energyComparisons.map((entry) => entry.modelMj)),
          maximumMj: Math.max(
            ...energyComparisons.map((entry) => entry.modelMj),
          ),
          meanRatioOfAllowance: average(
            energyComparisons.map((entry) => entry.ratioOfAllowance),
          ),
          meanRatioOfLimit: average(
            energyComparisons.map((entry) => entry.ratioOfLimit),
          ),
          circuitsOverAllowance: energyComparisons.filter(
            (entry) =>
              entry.modelMj >
              attackLapAllowanceMj + ENERGY_BUDGET_RESOLUTION_MJ,
          ).length,
          circuitsOverRepeatableLimit: energyComparisons.filter(
            (entry) =>
              entry.modelMj > qualifyingLimitMj + ENERGY_BUDGET_RESOLUTION_MJ,
          ).length,
        },
        observedValue: {
          attackLapAllowanceMj,
          qualifyingRechargeLimitMj:
            FIA_2026_REGULATION_PROFILE.energy.qualifyingRechargeLimitMj,
          usableStateOfChargeWindowMj:
            FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj,
          raceLimitMj: FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
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
