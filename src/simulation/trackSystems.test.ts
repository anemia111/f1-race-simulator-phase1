import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import {
  activeAeroModeFor,
  ersDeploymentPowerKw,
  overtakeStatusFor,
  updateOvertakeEligibilityAfterTravel,
} from './activeAero'
import { createInitialRace } from './race'
import {
  advanceVscMarshallingSectorTracking,
  distanceRespectingLocalYellowOrder,
  flagPaceMultiplier,
  flagPhaseForProgress,
  marshalPostProgressesForTrack,
  phaseThreeTuning,
  progressIsInYellowFlagZone,
  sectorFlagStatesFor,
  vscPaceScaleForDelta,
  wearScaleForControlPhase,
  yellowFlagZoneForIncident,
} from './raceEvents'
import { calculateCarTelemetry } from './telemetry'
import {
  lineDeviationPenaltySeconds,
  racingLineAt,
  trackDynamicsAt,
} from './trackDynamics'
import {
  advanceTrackWater,
  createTrackWaterState,
  gripForSurfaceWater,
} from './trackWater'

describe('track-dependent systems', () => {
  it('scopes a local yellow to the marshalling sector around the incident', () => {
    const yellow = {
      id: 'local-yellow',
      flag: 'yellow' as const,
      sector: 1,
      yellowSeverity: 'single' as const,
      yellowZone: {
        startProgress: 0.38,
        incidentProgress: 0.42,
        endProgress: 0.46,
      },
      startSeconds: 20,
      endSeconds: 40,
      startMessage: 'Yellow flag',
      endMessage: 'Track clear',
    }

    expect(flagPhaseForProgress(yellow, 0.37, 1)).toBeNull()
    expect(flagPhaseForProgress(yellow, 0.4, 1)).toBe(yellow)
    expect(flagPhaseForProgress(yellow, 0.45, 1)).toBe(yellow)
    expect(flagPhaseForProgress(yellow, 0.46, 1)).toBeNull()
    expect(flagPhaseForProgress(yellow, 0.5, 1)).toBeNull()
    expect(
      flagPaceMultiplier(flagPhaseForProgress(yellow, 0.37, 1), 1, {
        gapToAheadSeconds: 0.4,
        isLeader: false,
      }),
    ).toBe(1)
    expect(
      flagPaceMultiplier(flagPhaseForProgress(yellow, 0.4, 1), 1, {
        gapToAheadSeconds: 0.4,
        isLeader: false,
      }),
    ).toBe(phaseThreeTuning.singleYellowMarshallingPace)
    expect(sectorFlagStatesFor('yellow', 1)).toEqual([
      'clear',
      'yellow',
      'clear',
    ])
    expect(sectorFlagStatesFor('clear', null, 2)).toEqual([
      'clear',
      'clear',
      'double-yellow',
    ])
    expect(sectorFlagStatesFor('yellow', null, 1)).toEqual([
      'clear',
      'double-yellow',
      'clear',
    ])
    expect(sectorFlagStatesFor('vsc', null)).toEqual(['vsc', 'vsc', 'vsc'])
  })

  it('builds the yellow-to-green zone from the posts surrounding an incident', () => {
    const track = tracks[0]
    const posts = marshalPostProgressesForTrack(track)
    const zone = yellowFlagZoneForIncident(track, 0.417)
    const forwardDistance = (from: number, to: number) =>
      ((to - from) % 1 + 1) % 1

    expect(posts.length).toBeGreaterThanOrEqual(2)
    expect(posts).toContain(zone.startProgress)
    expect(posts).toContain(zone.endProgress)
    expect(progressIsInYellowFlagZone(zone.incidentProgress, zone)).toBe(true)
    expect(forwardDistance(zone.startProgress, zone.incidentProgress)).toBeGreaterThan(0)
    expect(forwardDistance(zone.incidentProgress, zone.endProgress)).toBeGreaterThan(0)
    expect(
      progressIsInYellowFlagZone(
        (zone.startProgress - 0.001 + 1) % 1,
        zone,
      ),
    ).toBe(false)
  })

  it('handles a marshalling zone that crosses the control line', () => {
    const zone = {
      endProgress: 0.03,
      incidentProgress: 0.99,
      startProgress: 0.96,
    }

    expect(progressIsInYellowFlagZone(0.98, zone)).toBe(true)
    expect(progressIsInYellowFlagZone(0.01, zone)).toBe(true)
    expect(progressIsInYellowFlagZone(0.03, zone)).toBe(false)
    expect(progressIsInYellowFlagZone(0.5, zone)).toBe(false)
  })

  it('maps local-yellow zones on every configured circuit', () => {
    const forwardDistance = (from: number, to: number) =>
      ((to - from) % 1 + 1) % 1

    for (const track of tracks) {
      const posts = marshalPostProgressesForTrack(track)
      expect(posts.length, track.id).toBeGreaterThanOrEqual(2)

      for (const incidentProgress of [0.07, 0.31, 0.58, 0.84]) {
        const zone = yellowFlagZoneForIncident(track, incidentProgress)
        expect(
          progressIsInYellowFlagZone(incidentProgress, zone),
          `${track.id}@${incidentProgress}`,
        ).toBe(true)
        expect(
          forwardDistance(zone.startProgress, zone.endProgress),
          `${track.id}@${incidentProgress}`,
        ).toBeGreaterThan(0)
        expect(
          forwardDistance(zone.startProgress, zone.endProgress),
          `${track.id}@${incidentProgress}`,
        ).toBeLessThan(0.25)
      }
    }
  })

  it('requires a larger pace reduction for double yellow than single yellow', () => {
    const shared = {
      endMessage: 'Track clear',
      endSeconds: 40,
      flag: 'yellow' as const,
      id: 'yellow-severity',
      sector: 1,
      startMessage: 'Yellow flag',
      startSeconds: 20,
      yellowZone: {
        endProgress: 0.46,
        incidentProgress: 0.42,
        startProgress: 0.38,
      },
    }
    const options = { gapToAheadSeconds: 0.4, isLeader: false }

    expect(
      flagPaceMultiplier({ ...shared, yellowSeverity: 'double' }, 1, options),
    ).toBeLessThan(
      flagPaceMultiplier({ ...shared, yellowSeverity: 'single' }, 1, options),
    )
  })

  it('prevents a speed differential from completing a pass under local yellow', () => {
    const heldDistance = distanceRespectingLocalYellowOrder({
      aheadProjectedDistance: 2.42,
      currentDistance: 2.4,
      projectedDistance: 2.43,
      referenceLapTimeSeconds: 90,
    })
    const unaffectedDistance = distanceRespectingLocalYellowOrder({
      aheadProjectedDistance: 2.42,
      currentDistance: 2.4,
      projectedDistance: 2.41,
      referenceLapTimeSeconds: 90,
    })

    expect(heldDistance).toBeGreaterThanOrEqual(2.4)
    expect(heldDistance).toBeLessThan(2.42)
    expect(unaffectedDistance).toBe(2.41)
  })

  it('uses VSC delta as a pace controller instead of a fixed speed cap', () => {
    expect(vscPaceScaleForDelta(-1)).toBeLessThan(
      vscPaceScaleForDelta(0),
    )
    expect(vscPaceScaleForDelta(2)).toBeGreaterThan(
      vscPaceScaleForDelta(0),
    )
    expect(vscPaceScaleForDelta(0, 1, 0)).toBeCloseTo(
      phaseThreeTuning.vscPace,
      5,
    )
    expect(phaseThreeTuning.vscPace).toBeLessThan(
      phaseThreeTuning.vscMinimumTimePace,
    )
    expect(
      phaseThreeTuning.vscMinimumTimePace - phaseThreeTuning.vscPace,
    ).toBeGreaterThanOrEqual(0.02)
  })

  it('reduces tire and component wear under neutralisation', () => {
    const phaseFor = (flag: 'yellow' | 'vsc' | 'sc' | 'red') => ({
      endMessage: '',
      endSeconds: 30,
      flag,
      id: flag,
      sector: 1,
      startMessage: '',
      startSeconds: 10,
    })

    expect(wearScaleForControlPhase(null)).toEqual({ component: 1, tire: 1 })
    expect(wearScaleForControlPhase(phaseFor('sc')).tire).toBeLessThan(
      wearScaleForControlPhase(phaseFor('vsc')).tire,
    )
    expect(wearScaleForControlPhase(phaseFor('red'))).toEqual({
      component: 0,
      tire: 0,
    })
  })

  it('counts only completed marshalling sectors crossed with a negative VSC delta', () => {
    const first = advanceVscMarshallingSectorTracking({
      lastMeasuredSector: null,
      nextDeltaSeconds: -0.2,
      nextTotalDistance: 0.8,
      previousDeltaSeconds: 0.1,
      previousTotalDistance: 0.1,
      redSectorCount: 0,
      sectorsPerLap: 4,
    })

    expect(first).toEqual({ lastMeasuredSector: 3, redSectorCount: 2 })
    expect(
      advanceVscMarshallingSectorTracking({
        lastMeasuredSector: first.lastMeasuredSector,
        nextDeltaSeconds: 0.2,
        nextTotalDistance: 1.1,
        previousDeltaSeconds: -0.2,
        previousTotalDistance: 0.8,
        redSectorCount: first.redSectorCount,
        sectorsPerLap: 4,
      }),
    ).toEqual({ lastMeasuredSector: 4, redSectorCount: 2 })
  })

  it('slows for a local yellow without a fixed 225 km/h ceiling', () => {
    const track = tracks[0]
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'local-yellow-speed',
      teams: initialTeams,
      track,
    })
    const fastestPoint = track.centerline.reduce(
      (best, _, index) => {
        const progress = index / track.centerline.length
        const speed = trackDynamicsAt(track, progress).referenceSpeedKph

        return speed > best.speed ? { progress, speed } : best
      },
      { progress: 0, speed: 0 },
    )
    const car = {
      ...snapshot.cars[0],
      progress: fastestPoint.progress,
      speedKph: 320,
      status: 'running' as const,
    }
    const yellow = {
      id: 'local-yellow',
      flag: 'yellow' as const,
      sector: 0,
      startSeconds: 20,
      endSeconds: 40,
      startMessage: 'Yellow flag',
      endMessage: 'Track clear',
    }
    const shared = {
      car,
      deltaSeconds: 2,
      driver: initialDrivers[0],
      elapsedSeconds: 30,
      lowGripConditions: false,
      raceLap: 3,
      team: initialTeams.find((candidate) => candidate.id === car.teamId)!,
      track,
      trackGrip: 1,
      weather: 'clear' as const,
    }
    const clearTelemetry = calculateCarTelemetry({
      ...shared,
      phase: null,
    })
    const yellowTelemetry = calculateCarTelemetry({
      ...shared,
      localFlagPaceScale: 0.88,
      phase: yellow,
    })

    expect(yellowTelemetry.speedKph).toBeGreaterThan(100)
    expect(yellowTelemetry.speedKph).not.toBe(225)
    expect(yellowTelemetry.speedKph).toBeLessThan(clearTelemetry.speedKph)
  })

  it('disables Overtake in low grip while retaining partial active aero', () => {
    const track = tracks[0]
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'aero-test',
      teams: initialTeams,
      track,
    })
    const zone = track.aeroActivationZones![0]
    const car = {
      ...snapshot.cars[1],
      gapToAhead: 0.6,
      progress: zone.lowGripStart ?? zone.start,
      status: 'running' as const,
    }

    expect(
      activeAeroModeFor({
        car,
        lowGripConditions: true,
        phase: null,
        track,
      }),
    ).toBe(zone.lowGripMode === 'partial' ? 'partial-straight' : 'corner')
    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car,
        lowGripConditions: true,
        phase: null,
        raceLap: 4,
        track,
      }),
    ).toBe('disabled')
  })

  it('accumulates standing water, then drains and restores grip', () => {
    const track = tracks[0]
    const cars = createInitialRace({
      drivers: initialDrivers,
      seed: 'water-test',
      teams: initialTeams,
      track,
    }).cars
    const wet = advanceTrackWater({
      cars,
      deltaSeconds: 300,
      previous: createTrackWaterState(),
      rainIntensityMmH: 18,
      track,
    })
    const drying = advanceTrackWater({
      cars,
      deltaSeconds: 600,
      previous: wet,
      rainIntensityMmH: 0,
      track,
    })

    expect(wet.surfaceWaterMmBySector[0]).toBeGreaterThan(0)
    expect(drying.surfaceWaterMmBySector[0]).toBeLessThan(
      wet.surfaceWaterMmBySector[0],
    )
    expect(
      gripForSurfaceWater(1, drying.surfaceWaterMmBySector[0], 1),
    ).toBeGreaterThan(
      gripForSurfaceWater(1, wet.surfaceWaterMmBySector[0], 0),
    )
  })

  it('requires remaining per-lap electrical energy for Overtake', () => {
    const track = tracks[0]
    const line = track.overtakeControlLines![0]
    const car = {
      ...createInitialRace({
        drivers: initialDrivers,
        seed: 'overtake-energy',
        teams: initialTeams,
        track,
      }).cars[1],
      gapToAhead: 0.4,
      progress: line.activationProgress,
      status: 'running' as const,
    }

    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car,
        lowGripConditions: false,
        overtakeEnergyRemainingMj: 0,
        phase: null,
        raceLap: 4,
        track,
      }),
    ).toBe('disabled')
  })

  it('latches Overtake eligibility at the detection line', () => {
    const track = tracks[0]
    const line = track.overtakeControlLines![0]
    const detectionDistance = 3 + line.detectionProgress
    const baseCar = {
      ...createInitialRace({
        drivers: initialDrivers,
        seed: 'overtake-detection-latch',
        teams: initialTeams,
        track,
      }).cars[1],
      gapToAhead: 0.72,
      position: 2,
      progress: line.detectionProgress - 0.001,
      status: 'running' as const,
      totalDistance: detectionDistance - 0.001,
    }
    const eligibility = updateOvertakeEligibilityAfterTravel({
      car: baseCar,
      lowGripConditions: false,
      nextTotalDistance: detectionDistance + 0.001,
      phase: null,
      previousTotalDistance: detectionDistance - 0.001,
      raceControlEnabled: true,
      track,
    })
    const activationDistance =
      eligibility!.activationLap + line.activationProgress
    const readyCar = {
      ...baseCar,
      gapToAhead: 1.6,
      overtakeEligibility: eligibility,
      progress: line.activationProgress - 0.001,
      totalDistance: activationDistance - 0.001,
    }

    expect(eligibility).toMatchObject({
      controlLineIndex: 0,
      detectedGapSeconds: 0.72,
      eligible: true,
    })
    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car: readyCar,
        lowGripConditions: false,
        phase: null,
        raceLap: 4,
        track,
      }),
    ).toBe('available')
    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car: {
          ...readyCar,
          progress: line.activationProgress + 0.01,
          totalDistance: activationDistance + 0.01,
        },
        lowGripConditions: false,
        phase: null,
        raceLap: 4,
        track,
      }),
    ).toBe('active')
  })

  it('does not grant Overtake when a car closes up after detection', () => {
    const track = tracks[0]
    const line = track.overtakeControlLines![0]
    const detectionDistance = 2 + line.detectionProgress
    const baseCar = {
      ...createInitialRace({
        drivers: initialDrivers,
        seed: 'overtake-detection-miss',
        teams: initialTeams,
        track,
      }).cars[1],
      gapToAhead: line.detectionGapSeconds + 0.08,
      position: 2,
      status: 'running' as const,
      totalDistance: detectionDistance - 0.001,
    }
    const eligibility = updateOvertakeEligibilityAfterTravel({
      car: baseCar,
      lowGripConditions: false,
      nextTotalDistance: detectionDistance + 0.001,
      phase: null,
      previousTotalDistance: detectionDistance - 0.001,
      raceControlEnabled: true,
      track,
    })
    const activationDistance =
      eligibility!.activationLap + line.activationProgress

    expect(eligibility?.eligible).toBe(false)
    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car: {
          ...baseCar,
          gapToAhead: 0.2,
          overtakeEligibility: eligibility,
          progress: line.activationProgress + 0.01,
          totalDistance: activationDistance + 0.01,
        },
        lowGripConditions: false,
        phase: null,
        raceLap: 3,
        track,
      }),
    ).toBe('disabled')
  })

  it('uses the post-Miami FIA 2026 ERS-K zone limits', () => {
    const standardAt289 = ersDeploymentPowerKw({
      ersMode: 'deploy',
      overtakeStatus: 'available',
      speedKph: 289,
    })
    const standardAt290 = ersDeploymentPowerKw({
      ersMode: 'deploy',
      overtakeStatus: 'available',
      speedKph: 290,
    })
    const standardAt291 = ersDeploymentPowerKw({
      ersMode: 'deploy',
      overtakeStatus: 'available',
      speedKph: 291,
    })
    const standardAt340 = ersDeploymentPowerKw({
      ersMode: 'deploy',
      overtakeStatus: 'available',
      speedKph: 340,
    })
    const overtakeAt340 = ersDeploymentPowerKw({
      ersMode: 'deploy',
      overtakeStatus: 'active',
      speedKph: 340,
    })

    expect(standardAt289).toBe(250)
    expect(standardAt290).toBe(250)
    expect(standardAt291).toBe(250)
    expect(standardAt340).toBe(250)
    expect(overtakeAt340).toBe(350)
    expect(
      ersDeploymentPowerKw({
        ersMode: 'deploy',
        overtakeStatus: 'available',
        speedKph: 345,
      }),
    ).toBe(250)
    expect(
      ersDeploymentPowerKw({
        ersMode: 'deploy',
        overtakeStatus: 'active',
        speedKph: 355,
      }),
    ).toBe(350)
    expect(
      ersDeploymentPowerKw({
        curve: 'specified-sector',
        ersMode: 'deploy',
        overtakeStatus: 'available',
        speedKph: 280,
      }),
    ).toBe(350)
    expect(
      ersDeploymentPowerKw({
        curve: 'low-grip-estimate',
        ersMode: 'deploy',
        overtakeStatus: 'disabled',
        speedKph: 290,
      }),
    ).toBe(250)
    expect(
      ersDeploymentPowerKw({
        ersMode: 'harvest',
        overtakeStatus: 'active',
        speedKph: 320,
      }),
    ).toBe(0)
  })

  it('uses one ideal racing line and charges an exit cost for battle offsets', () => {
    const track = tracks[0]
    const sharpest = Array.from(
      { length: track.centerline.length },
      (_, index) => index / track.centerline.length,
    ).sort(
      (left, right) =>
        trackDynamicsAt(track, right).curvature -
        trackDynamicsAt(track, left).curvature,
    )[0]
    const line = racingLineAt(track, sharpest)

    expect(Math.abs(line.offset)).toBeGreaterThan(0)
    expect(
      lineDeviationPenaltySeconds(
        track,
        sharpest,
        track.width * 0.25,
        'side-by-side',
      ),
    ).toBeGreaterThan(0)
    expect(
      lineDeviationPenaltySeconds(track, sharpest, 0, 'single-file'),
    ).toBe(0)
  })
})
