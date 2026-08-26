import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { RaceConfig, StewardCase, TimedSessionPlan } from '../types'
import { ensureNeutralisationProcedure } from './neutralisation'
import { runSeriesQualifying, superFormulaControlSessionTireForWeather } from './qualifying'
import { hashChance } from './random'
import { advanceRace, createInitialRace } from './race'
import { buildTimedSessionPlan } from './timedSessionPlan'
import { trackSurfaceSectorSummary } from './trackSurface'
import { weatherFor } from './weather'

type UnknownRecord = Record<string, unknown>

const f1RuntimeFieldNames = new Set([
  'activeAeroMode',
  'activeAeroState',
  'overtakeEligibility',
  'overtakeEnergyRemainingMj',
  'overtakeRechargeAllowanceActiveThisLap',
  'energyLapStartedInLowGripConditions',
  'energyLapStartedBehindSafetyCar',
  'energyHarvestedThisLapMj',
  'energyDeployedThisLapMj',
  'ersMode',
  'ersPowerKw',
  'ersBatteryPercent',
  'energyStore',
  'stateOfCharge',
  'superClippingIntensity',
  'superClippingRegenPowerKw',
  'superClippingRecoveredThisLapMj',
  'superClippingStartedAtSeconds',
  'superClippingStartedAtProgress',
  'superClippingDurationSeconds',
  'standingStartMguKReleaseLatched',
  'mguH',
  'mguK',
  'controlElectronics',
  'ice',
  'turbo',
  'exhaust',
  'tire',
  'tireAgeLaps',
  'pendingTire',
  'compoundsUsed',
  'tireSetsRemaining',
  'tireTemperatureC',
  'tireCarcassTemperatureC',
  'tireGrainingPercent',
  'tireOverheatingPercent',
  'tirePerformanceState',
  'tireWearPercent',
  'tireThermalStressPercent',
])

const f1TireCompoundValues = new Set(['S', 'M', 'H', 'I', 'W'])

function asRecord(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object at the runtime boundary.`)
  }

  return value as UnknownRecord
}

function f1RuntimeLeakPaths(
  value: unknown,
  path = '$',
  visited = new Set<object>(),
): string[] {
  if (value === null || typeof value !== 'object') return []

  if (visited.has(value)) return []
  visited.add(value)

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      f1RuntimeLeakPaths(entry, `${path}[${index}]`, visited),
    )
  }

  return Object.entries(value as UnknownRecord).flatMap(([key, nested]) => [
    ...(f1RuntimeFieldNames.has(key) ? [`${path}.${key}`] : []),
    ...f1RuntimeLeakPaths(nested, `${path}.${key}`, visited),
  ])
}

function f1TireCompoundValuePaths(
  value: unknown,
  path = '$',
  visited = new Set<object>(),
): string[] {
  if (typeof value === 'string') {
    return f1TireCompoundValues.has(value) ? [path] : []
  }

  if (value === null || typeof value !== 'object') return []
  if (visited.has(value)) return []
  visited.add(value)

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      f1TireCompoundValuePaths(entry, `${path}[${index}]`, visited),
    )
  }

  return Object.entries(value as UnknownRecord).flatMap(([key, nested]) =>
    f1TireCompoundValuePaths(nested, `${path}.${key}`, visited),
  )
}

function configFor(seriesId: 'f1-custom' | 'super-formula'): RaceConfig {
  const series = seriesPackageById.get(seriesId)

  if (!series) {
    throw new Error(`Missing ${seriesId} series package.`)
  }

  return {
    drivers: series.drivers,
    overtakeSystem: series.rules.overtakeSystem,
    seed: `phase5-runtime-boundary:${seriesId}`,
    seriesId,
    ...(seriesId === 'super-formula'
      ? { sessionRaceLapsOverride: 25 }
      : {}),
    teams: series.teams,
    track: series.tracks[0],
    weekendStage: 'race',
  }
}

function expectSuperFormulaRuntimeBoundary(snapshot: unknown) {
  const race = asRecord(snapshot, 'Super Formula race snapshot')
  const cars = race.cars

  if (!Array.isArray(cars) || cars.length === 0) {
    throw new Error('A valid Super Formula race must contain cars.')
  }

  for (const [index, car] of cars.entries()) {
    const carRecord = asRecord(car, `Super Formula car ${index}`)
    const runtimeSystems = asRecord(
      carRecord.runtimeSystems,
      `Super Formula car ${index}.runtimeSystems`,
    )

    expect(runtimeSystems.kind).toBe('super-formula')
    expect(['disabled', 'available', 'active']).toContain(
      carRecord.overtakeStatus,
    )
    expect(carRecord).not.toHaveProperty('otsRemainingSeconds')
    expect(carRecord).not.toHaveProperty('otsCooldownUntilSeconds')
    expect(carRecord).not.toHaveProperty('components')
    expect(f1RuntimeLeakPaths(carRecord)).toEqual([])
    expect(f1TireCompoundValuePaths(carRecord)).toEqual([])
  }
}

function timedImpedingFixture(seriesId: 'f1-custom' | 'super-formula') {
  const series = seriesPackageById.get(seriesId)

  if (!series) {
    throw new Error(`Missing ${seriesId} series package.`)
  }

  const attackerId = series.drivers[0]!.id
  const blockerId = series.drivers[1]!.id
  const seed = Array.from({ length: 128 }, (_, index) => `phase5-impeding-${index}`).find(
    (candidate) =>
      hashChance(`${candidate}:impeding-penalty:Q1:${attackerId}:1`) < 0.18,
  )

  if (!seed) {
    throw new Error('Could not prepare a deterministic impeding decision.')
  }

  const tire =
    seriesId === 'f1-custom'
      ? { compound: 'S' as const, kind: 'f1-pirelli-session-tire' as const }
      : superFormulaControlSessionTireForWeather('clear')
  const timedSessionPlan: TimedSessionPlan = {
    segments: [
      {
        endsAtSeconds: 30,
        id: 'Q1-A',
        name: 'Q1',
        participantDriverIds: [attackerId, blockerId],
        startsAtSeconds: 0,
        suspensionEndsAtSeconds: null,
        suspensionStartsAtSeconds: null,
        tire,
      },
    ],
    totalDurationSeconds: 30,
  }
  const config: RaceConfig = {
    ...configFor(seriesId),
    seed,
    timedSessionPlan,
    weekendStage: 'qualifying',
  }
  const initial = createInitialRace(config)
  const snapshot = advanceRace(
    {
      ...initial,
      elapsedSeconds: 1,
      cars: initial.cars.map((car, index) => {
        if (index === 0) {
          return {
            ...car,
            lap: 0,
            lapStartedAtSeconds: 0,
            pitPhase: 'none' as const,
            pitUntilSeconds: null,
            processedLap: 0,
            progress: 0.999,
            speedKph: 300,
            status: 'running' as const,
            timedRunPhase: 'attack-lap' as const,
            totalDistance: 0.999,
          }
        }

        if (index === 1) {
          return {
            ...car,
            lap: 1,
            pitPhase: 'none' as const,
            pitUntilSeconds: null,
            processedLap: 1,
            progress: 0.004,
            speedKph: 80,
            status: 'running' as const,
            timedRunPhase: 'garage' as const,
            totalDistance: 1.004,
          }
        }

        return {
          ...car,
          status: 'dns' as const,
        }
      }),
    },
    0.25,
    config,
  )

  return { blockerId, snapshot }
}

function safetyCarPitRouteFixture(
  seriesId: 'f1-custom' | 'super-formula',
) {
  const config = configFor(seriesId)
  const initial = createInitialRace(config)
  const routeCar = {
    ...initial.cars[0]!,
    lap: 1,
    pitLaneProgress: null,
    pitPhase: 'none' as const,
    processedLap: 1,
    progress: 0.98,
    speedKph: 280,
    status: 'running' as const,
    totalDistance: 1.98,
  }
  const phase = ensureNeutralisationProcedure(
    {
      endMessage: 'Track clear.',
      endSeconds: 300,
      flag: 'sc',
      id: `phase5-${seriesId}-pit-route`,
      safetyCarUsesPitLane: true,
      sector: 0,
      startMessage: 'SAFETY CAR DEPLOYED',
      startSeconds: 0,
    },
    [routeCar],
    config.track,
  )
  const advanced = advanceRace(
    {
      ...initial,
      cars: initial.cars.map((car, index) =>
        index === 0 ? routeCar : { ...car, status: 'dns' as const },
      ),
      flagPhase: phase,
      raceStartedAtSeconds: 0,
      startProcedure: 'racing',
      startProcedureRemainingSeconds: 0,
    },
    0.01,
    config,
  )

  return { advanced, config }
}

describe('Super Formula runtime boundary', () => {
  it('keeps Super Formula race state free of F1 ERS, active-aero, superclip, and component runtime state', () => {
    const config = configFor('super-formula')
    const initial = createInitialRace(config)
    const advanced = advanceRace(initial, 0.25, config)

    expectSuperFormulaRuntimeBoundary(initial)
    expectSuperFormulaRuntimeBoundary(advanced)
  })

  it('keeps FIA weather declarations and C4.6 mass inputs unavailable while retaining simulated surface state', () => {
    const config = configFor('super-formula')
    const initial = createInitialRace(config)
    const advanced = advanceRace(initial, 15, config)

    for (const snapshot of [initial, advanced]) {
      expect(snapshot.heatHazardDeclared).toBeNull()
      expect(snapshot.heatIndexC).toBeNull()
      expect(snapshot.heatHazardMassIncreaseKg).toBeNull()
      expect(snapshot.rainHazardDeclared).toBeNull()
      expect(snapshot.lowGripConditions).toBeNull()
      expect(snapshot.trackGrip).toBeGreaterThan(0)
      const surfaceSectors = trackSurfaceSectorSummary(snapshot.trackSurface)
      expect(surfaceSectors.surfaceWaterMmBySector).toHaveLength(3)
      expect(surfaceSectors.dryingLineBySector).toHaveLength(3)
      for (const f1DeclarationMessage of [
        'HEAT HAZARD',
        'RAIN HAZARD',
        'LOW GRIP CONDITIONS',
      ]) {
        expect(
          snapshot.events.some((event) =>
            event.message.includes(f1DeclarationMessage),
          ),
        ).toBe(false)
      }
    }
  })

  it('keeps severe-rain SF formation tyre messaging neutral while retaining the wet control surface', () => {
    const base = configFor('super-formula')
    const track = { ...base.track, rainProbability: 0.75 }
    const seed = Array.from(
      { length: 5000 },
      (_, index) => `phase5-sf-wet-start-${index}`,
    ).find((candidate) => weatherFor(candidate, track, 0) === 'heavy-rain')

    expect(seed).toBeDefined()

    const initial = createInitialRace({ ...base, seed: seed!, track })
    const runtime = initial.cars[0]!.runtimeSystems

    if (runtime.kind !== 'super-formula') {
      throw new Error('Expected the SUPER FORMULA runtime branch.')
    }

    expect(initial.weather).toBe('heavy-rain')
    expect(initial.formationBehindSafetyCar).toBe(true)
    expect(initial.wetWeatherTyresMandatory).toBe(false)
    expect(initial.eventMessage).not.toMatch(
      /(?:WET WEATHER TYRES MUST BE USED|tyres? (?:are )?compulsory|tyre choice remains free)/iu,
    )
    expect(initial.events.map((event) => event.message).join('\n')).not.toMatch(
      /(?:tyres? (?:are )?compulsory|tyre choice remains free)/iu,
    )
    expect(runtime.liveTires.activeSurface).toBe('wet')
    expect(runtime.liveTires.fitment.surface).toBe('wet')
    expect(runtime.controlTires.sets.wet.usedSets).toBe(1)
  })

  it('fails closed when a legacy FIA/ISC steward case reaches an SF runtime', () => {
    const config = configFor('super-formula')
    const initial = createInitialRace(config)
    const investigated = initial.cars[0]!
    const legacyFiaCase: StewardCase = {
      id: 'legacy-fia-case',
      openedAtSeconds: 0,
      resolveAtSeconds: 0,
      driverId: investigated.driverId,
      otherDriverId: null,
      offence: 'causing-collision',
      article: 'ISC App. L Ch. IV 2(d)',
      responsibilityShare: 1,
      consequence: 'reckless',
    }

    const advanced = advanceRace(
      {
        ...initial,
        raceStartedAtSeconds: 0,
        startProcedure: 'racing',
        startProcedureRemainingSeconds: 0,
        stewardCases: [legacyFiaCase],
      },
      0.25,
      config,
    )
    const reviewed = advanced.cars.find(
      (car) => car.driverId === investigated.driverId,
    )!
    const review = advanced.events.find(
      (event) => event.id === 'decision-legacy-fia-case',
    )

    expect(advanced.stewardCases).toEqual([])
    expect(review).toMatchObject({ kind: 'investigation' })
    expect(review?.message).not.toMatch(/\b(?:FIA|ISC)\b/u)
    expect(review?.message).toContain('official event decision required')
    expect(reviewed.penaltyPoints).toBe(0)
    expect(reviewed.penaltySeconds).toBe(0)
    expect(reviewed.penalties).toEqual([])
    expect(reviewed.stewardStatus).toBe('noted')
  })

  it('does not turn a Super Formula timed-session obstruction into an automatic grid drop', () => {
    const sf = timedImpedingFixture('super-formula')
    const f1 = timedImpedingFixture('f1-custom')
    const sfBlocker = sf.snapshot.cars.find(
      (car) => car.driverId === sf.blockerId,
    )!
    const f1Blocker = f1.snapshot.cars.find(
      (car) => car.driverId === f1.blockerId,
    )!

    expect(sfBlocker.penalties.some((penalty) => penalty.kind === 'grid-drop')).toBe(
      false,
    )
    expect(sfBlocker.impedingWarnings).toBe(0)
    expect(
      sf.snapshot.events.some((event) => event.id.startsWith('impeding-grid-drop-')),
    ).toBe(false)
    expect(f1Blocker.penalties.some((penalty) => penalty.kind === 'grid-drop')).toBe(
      true,
    )
  })

  it('does not apply the F1 Q1 no-time permission or DNS decision to Super Formula', () => {
    const series = seriesPackageById.get('super-formula')!
    const qualifying = runSeriesQualifying(
      {
        drivers: series.drivers,
        seed: 'phase5-sf-no-time',
        seriesId: 'super-formula',
        teams: series.teams,
        track: series.tracks[0],
        weekendStage: 'qualifying',
      },
      series.rules,
    )
    const timedSessionPlan = buildTimedSessionPlan(
      qualifying,
      series.rules.qualifying.breakSeconds,
      series.rules.qualifying.format,
    )
    const config: RaceConfig = {
      ...configFor('super-formula'),
      seed: 'phase5-sf-no-time',
      timedSessionPlan,
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const completed = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car) => ({
          ...car,
          pitUntilSeconds: null,
          timedRunPhase: 'garage' as const,
          timedSegmentBestSeconds: {},
        })),
        elapsedSeconds: timedSessionPlan.totalDurationSeconds,
      },
      0.1,
      config,
    )

    expect(completed.cars.some((car) => car.status === 'dns')).toBe(false)
    expect(completed.cars.some((car) => car.stewardStatus === 'penalty')).toBe(
      false,
    )
    expect(
      completed.events.some((event) => event.id.startsWith('qualifying-permission-')),
    ).toBe(false)
  })

  it('does not inherit F1 Sprint checkpoint stages from a Sprint-marked Free Mode track', () => {
    const sfBase = configFor('super-formula')
    const f1Base = configFor('f1-custom')
    const sf = createInitialRace({
      ...sfBase,
      track: { ...sfBase.track, isSprintWeekend: true },
      weekendStage: 'qualifying',
    })
    const f1 = createInitialRace({
      ...f1Base,
      track: { ...f1Base.track, isSprintWeekend: true },
      weekendStage: 'qualifying',
    })

    expect(sf.weekend.completed).toEqual(['fp1', 'fp2', 'fp3'])
    expect(sf.weekend.completed).not.toContain('sprintQualifying')
    expect(sf.weekend.completed).not.toContain('sprint')
    expect(f1.weekend.completed).toEqual(['fp1', 'sprintQualifying', 'sprint'])
  })

  it('uses the category-owned pit-lane limit for a Safety Car pit-lane route', () => {
    const sf = safetyCarPitRouteFixture('super-formula')
    const f1 = safetyCarPitRouteFixture('f1-custom')
    const sfCar = sf.advanced.cars[0]!
    const f1Car = f1.advanced.cars[0]!

    expect(sfCar.pitPhase).toBe('lane')
    expect(f1Car.pitPhase).toBe('lane')
    expect(sfCar.speedKph).toBeLessThanOrEqual(60.01)
    expect(f1Car.speedKph).toBeLessThanOrEqual(
      (f1.config.track.pitLane?.speedLimitKph ?? 80) + 0.01,
    )
  })

  it('keeps F1-only runtime state inside the F1 runtime payload', () => {
    const initial = createInitialRace(configFor('f1-custom'))
    const car = asRecord(initial.cars[0], 'F1 car')
    const runtimeSystems = asRecord(car.runtimeSystems, 'F1 runtimeSystems')

    expect(runtimeSystems.kind).not.toBe('super-formula')
    expect(initial.heatIndexC).not.toBeNull()
    expect(initial.heatHazardMassIncreaseKg).not.toBeNull()

    for (const field of ['activeAeroState', 'energyStore', 'components']) {
      expect(car).not.toHaveProperty(field)
      expect(runtimeSystems).toHaveProperty(field)
    }

    const tires = asRecord(runtimeSystems.tires, 'F1 runtime tyre state')
    for (const field of [
      'tire',
      'tireAgeLaps',
      'pendingTire',
      'compoundsUsed',
      'tireSetsRemaining',
      'tireTemperatureC',
      'tireCarcassTemperatureC',
      'tireGrainingPercent',
      'tireOverheatingPercent',
      'tirePerformanceState',
      'tireWearPercent',
      'tireThermalStressPercent',
    ]) {
      expect(car).not.toHaveProperty(field)
      expect(tires).toHaveProperty(field)
    }
  })
})
