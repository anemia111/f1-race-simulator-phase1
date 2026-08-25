import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import type { Driver, DriverSkillProfile } from '../types'
import {
  DRIVER_DECISION_WINDOWS_PER_LAP,
  decideDriverBehavior,
  driverBehaviorTraits,
  driverDecisionWindow,
  type DriverDecisionContext,
} from './driverDecision'
import { incidentForLap } from './incidents'

const baseDriver = initialDrivers[0]

function driverAt(
  skillValue: number,
  brakingAggression = baseDriver.style.brakingAggression,
): Driver {
  const skills = Object.fromEntries(
    Object.keys(baseDriver.skills).map((key) => [key, skillValue]),
  ) as DriverSkillProfile

  return {
    ...baseDriver,
    skills,
    style: { ...baseDriver.style, brakingAggression },
  }
}

function contextFor(
  overrides: Partial<DriverDecisionContext> = {},
): DriverDecisionContext {
  return {
    seed: 'driver-decision-test',
    driver: baseDriver,
    lap: 7,
    trackProgress: 0.42,
    flagState: 'clear',
    currentLateralOffsetM: 0.2,
    physicalReferenceLineOffsetM: -0.45,
    trackHalfWidthM: 6.5,
    ...overrides,
  }
}

describe('seeded driver decisions', () => {
  it('returns exactly the same decision for the same seed and window', () => {
    const context = contextFor({
      attack: {
        active: true,
        intensity: 0.8,
        opponentId: 'opponent-a',
        opponentLateralOffsetM: 0.1,
      },
    })

    expect(decideDriverBehavior(context)).toEqual(decideDriverBehavior(context))
  })

  it('is stateless and independent of the order in which drivers are sampled', () => {
    const firstContext = contextFor({
      driver: initialDrivers[0],
      attack: {
        active: true,
        intensity: 0.65,
        opponentId: initialDrivers[1].id,
        opponentLateralOffsetM: -0.2,
      },
    })
    const secondContext = contextFor({
      driver: initialDrivers[1],
      defend: {
        active: true,
        intensity: 0.7,
        opponentId: initialDrivers[0].id,
        opponentLateralOffsetM: 0.35,
      },
    })
    const forward = [
      decideDriverBehavior(firstContext),
      decideDriverBehavior(secondContext),
    ]
    const reverse = [
      decideDriverBehavior(secondContext),
      decideDriverBehavior(firstContext),
    ]

    expect(forward[0]).toEqual(reverse[1])
    expect(forward[1]).toEqual(reverse[0])
  })

  it('samples twelve low-resolution windows per lap', () => {
    expect(DRIVER_DECISION_WINDOWS_PER_LAP).toBe(12)
    expect(driverDecisionWindow(0)).toBe(0)
    expect(driverDecisionWindow(1 / 12 - 0.000_001)).toBe(0)
    expect(driverDecisionWindow(1 / 12)).toBe(1)
    expect(driverDecisionWindow(0.999_999)).toBe(11)
    expect(driverDecisionWindow(1)).toBe(0)

    const atEndOfLap = decideDriverBehavior(
      contextFor({ lap: 3, trackProgress: 0.999 }),
    )
    expect(atEndOfLap.absoluteDecisionWindow).toBe(3 * 12 + 11)
    expect(atEndOfLap).not.toHaveProperty('decisionWindow')
  })

  it('ignores displayed overall and ACE-like source metadata', () => {
    const lowMetadata: Driver = {
      ...baseDriver,
      performanceSource: {
        fileName: 'metadata-only.csv',
        overall: 1,
        rawRatings: { Overall: 1, ACE: 0 },
      },
    }
    const aceMetadata: Driver = {
      ...baseDriver,
      performanceSource: {
        fileName: 'metadata-only.csv',
        overall: 100,
        rawRatings: { Overall: 100, ACE: 100 },
      },
    }

    expect(driverBehaviorTraits(lowMetadata)).toEqual(
      driverBehaviorTraits(aceMetadata),
    )
    expect(
      decideDriverBehavior(contextFor({ driver: lowMetadata })),
    ).toEqual(decideDriverBehavior(contextFor({ driver: aceMetadata })))
  })

  it('saturates generic named behavior at the published ceiling', () => {
    expect(driverBehaviorTraits(driverAt(1.2))).toEqual(
      driverBehaviorTraits(driverAt(1)),
    )
  })

  it('applies flag, pit, emergency, battle, wake, tow, then reference priority', () => {
    const fullContext = contextFor({
      flagState: 'vsc',
      pit: { requested: true, pitLaneLateralOffsetM: 4.5 },
      emergency: {
        active: true,
        obstacleId: 'stopped-car',
        obstacleLateralOffsetM: 0,
        severity: 1,
      },
      attack: {
        active: true,
        intensity: 1,
        opponentId: 'car-ahead',
        opponentLateralOffsetM: 0.2,
      },
      defend: {
        active: true,
        intensity: 0.2,
        opponentId: 'car-behind',
        opponentLateralOffsetM: -0.3,
      },
      dirtyAir: {
        active: true,
        intensity: 1,
        opponentId: 'wake-car',
        opponentLateralOffsetM: 0.1,
      },
      tow: {
        active: true,
        intensity: 1,
        opponentId: 'tow-car',
        opponentLateralOffsetM: -0.1,
      },
    })

    expect(decideDriverBehavior(fullContext).intent).toBe('controlled-flag')

    const withoutFlag = { ...fullContext, flagState: 'clear' as const }
    expect(decideDriverBehavior(withoutFlag).intent).toBe('pit-entry')

    const withoutPit = {
      ...withoutFlag,
      pit: { ...withoutFlag.pit!, requested: false },
    }
    expect(decideDriverBehavior(withoutPit).intent).toBe(
      'emergency-avoidance',
    )

    const withoutEmergency = {
      ...withoutPit,
      emergency: { ...withoutPit.emergency!, active: false },
    }
    expect(decideDriverBehavior(withoutEmergency).intent).toBe('attack')

    const defenceOnly = {
      ...withoutEmergency,
      attack: { ...withoutEmergency.attack!, active: false },
    }
    expect(decideDriverBehavior(defenceOnly).intent).toBe('defend')

    const withoutBattle = {
      ...defenceOnly,
      defend: { ...defenceOnly.defend!, active: false },
    }
    expect(decideDriverBehavior(withoutBattle).intent).toBe(
      'dirty-air-avoidance',
    )

    const withoutDirtyAir = {
      ...withoutBattle,
      dirtyAir: { ...withoutBattle.dirtyAir!, active: false },
    }
    expect(decideDriverBehavior(withoutDirtyAir).intent).toBe('tow-alignment')

    const referenceOnly = {
      ...withoutDirtyAir,
      tow: { ...withoutDirtyAir.tow!, active: false },
    }
    expect(decideDriverBehavior(referenceOnly).intent).toBe(
      'physical-reference-line',
    )
  })

  it('keeps high-skill control error lower across many deterministic seeds', () => {
    const highSkill = driverAt(1)
    const lowSkill = driverAt(0.2)
    let highError = 0
    let lowError = 0

    for (let sample = 0; sample < 500; sample += 1) {
      const seed = `control-error-${sample}`
      const highDecision = decideDriverBehavior(
        contextFor({ driver: highSkill, seed }),
      )
      const lowDecision = decideDriverBehavior(
        contextFor({ driver: lowSkill, seed }),
      )

      highError +=
        Math.abs(highDecision.controlError) +
        Math.abs(highDecision.lineErrorM) / 6.5
      lowError +=
        Math.abs(lowDecision.controlError) +
        Math.abs(lowDecision.lineErrorM) / 6.5
    }

    expect(highError / 500).toBeLessThan(lowError / 500)
  })

  it('uses aggression for control risk without granting speed', () => {
    const cautiousDriver = driverAt(0.78, 0)
    const aggressiveDriver = driverAt(0.78, 1)
    let cautiousErrors = 0
    let aggressiveErrors = 0

    for (let sample = 0; sample < 500; sample += 1) {
      const attack = {
        active: true,
        intensity: 0.72,
        opponentId: 'same-opponent',
        opponentLateralOffsetM: 0,
      }
      const cautious = decideDriverBehavior(
        contextFor({
          seed: `aggression-${sample}`,
          driver: cautiousDriver,
          attack,
        }),
      )
      const aggressive = decideDriverBehavior(
        contextFor({
          seed: `aggression-${sample}`,
          driver: aggressiveDriver,
          attack,
        }),
      )

      cautiousErrors += Number(cautious.errorTriggered)
      aggressiveErrors += Number(aggressive.errorTriggered)

      expect(cautious).not.toHaveProperty('speedMultiplier')
      expect(cautious).not.toHaveProperty('lapTimeDeltaSeconds')
      expect(aggressive).not.toHaveProperty('speedMultiplier')
      expect(aggressive).not.toHaveProperty('lapTimeDeltaSeconds')
    }

    expect(aggressiveDriver.style.brakingAggression).toBeGreaterThan(
      cautiousDriver.style.brakingAggression,
    )
    expect(aggressiveErrors).toBeGreaterThan(cautiousErrors)
  })

  it('keeps window controls separate from lap incident outcomes', () => {
    const driver = initialDrivers[0]
    const team = initialTeams.find(
      (candidate) => candidate.id === driver.teamId,
    )!
    const decision = decideDriverBehavior(contextFor({ driver }))

    for (const outcomeField of [
      'damageDelta',
      'flagResponse',
      'attemptedDefence',
      'attemptedOvertake',
      'contactRisk',
      'retirement',
      'timeLossSeconds',
    ]) {
      expect(decision).not.toHaveProperty(outcomeField)
    }

    const beforeDecision = incidentForLap(
      'driver-incident-owner',
      driver,
      team,
      12,
    )
    decideDriverBehavior(contextFor({ driver, seed: 'unrelated-window' }))
    const afterDecision = incidentForLap(
      'driver-incident-owner',
      driver,
      team,
      12,
    )

    expect(afterDecision).toEqual(beforeDecision)
    expect(
      incidentForLap('driver-incident-owner', driver, team, 1),
    ).toBeNull()
  })

  it('returns finite bounded traits and physical control requests', () => {
    const invalidSkills = Object.fromEntries(
      Object.keys(baseDriver.skills).map((key, index) => [
        key,
        index % 3 === 0 ? Number.NaN : index % 3 === 1 ? -10 : 10,
      ]),
    ) as DriverSkillProfile
    const invalidDriver: Driver = {
      ...baseDriver,
      skills: invalidSkills,
      style: {
        frontEndPreference: Number.NaN,
        rearStabilityNeed: Number.POSITIVE_INFINITY,
        oversteerTolerance: -10,
        understeerTolerance: 10,
        brakingAggression: Number.NaN,
        cornerShapePreference: Number.NEGATIVE_INFINITY,
      },
    }
    const traits = driverBehaviorTraits(invalidDriver)

    for (const value of Object.values(traits)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }

    const decision = decideDriverBehavior(
      contextFor({
        driver: invalidDriver,
        currentLateralOffsetM: Number.NaN,
        physicalReferenceLineOffsetM: Number.POSITIVE_INFINITY,
        trackHalfWidthM: Number.NaN,
        emergency: {
          active: true,
          obstacleLateralOffsetM: Number.NaN,
          severity: Number.POSITIVE_INFINITY,
        },
      }),
    )
    const numericOutputs = [
      decision.desiredLateralOffsetM,
      decision.lineErrorM,
      decision.brakeOnsetDeltaSeconds,
      decision.brakePressureScale,
      decision.throttleTimingDeltaSeconds,
      decision.throttleOpeningScale,
      decision.controlError,
    ]

    expect(numericOutputs.every(Number.isFinite)).toBe(true)
    expect(Math.abs(decision.desiredLateralOffsetM)).toBeLessThanOrEqual(5.45)
    expect(decision.brakePressureScale).toBeGreaterThanOrEqual(0)
    expect(decision.brakePressureScale).toBeLessThanOrEqual(1.1)
    expect(decision.throttleOpeningScale).toBeGreaterThanOrEqual(0)
    expect(decision.throttleOpeningScale).toBeLessThanOrEqual(1)
  })
})
