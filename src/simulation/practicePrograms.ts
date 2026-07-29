import type {
  DryTireCompound,
  PracticeProgramKind,
  RacePaceMode,
  WeekendStage,
} from '../types'
import { hashChance } from './random'
import { isPracticeStage, type PracticeSessionName } from './sessionRules'

export type PracticeEnergyIntent = 'qualifying' | 'balanced' | 'harvest'

export type PracticeProgramPlan = {
  energyIntent: PracticeEnergyIntent
  fuelLaps: number
  garageTurnaroundSeconds: number
  kind: PracticeProgramKind
  label: string
  paceFactor: number
  paceMode: RacePaceMode
  preferredDryCompounds: readonly DryTireCompound[]
  shortLabel: string
  targetFlyingLaps: number
  workItems: readonly string[]
}

type PracticeProgramTemplate = Omit<
  PracticeProgramPlan,
  'fuelLaps' | 'garageTurnaroundSeconds' | 'targetFlyingLaps'
> & {
  fuelMarginLaps: number
  lapRange: readonly [number, number]
}

const programsByStage: Record<
  PracticeSessionName,
  readonly PracticeProgramTemplate[]
> = {
  fp1: [
    {
      energyIntent: 'harvest',
      fuelMarginLaps: 3,
      kind: 'systems-check',
      label: 'Systems installation check',
      lapRange: [2, 3],
      paceFactor: 1.16,
      paceMode: 'save',
      preferredDryCompounds: ['H', 'M'],
      shortLabel: 'SYS',
      workItems: [
        'power-unit and systems validation',
        'brake and cooling check',
        'pit-entry procedure',
      ],
    },
    {
      energyIntent: 'harvest',
      fuelMarginLaps: 3,
      kind: 'aero-correlation',
      label: 'Aero correlation',
      lapRange: [3, 4],
      paceFactor: 1.12,
      paceMode: 'standard',
      preferredDryCompounds: ['H', 'M'],
      shortLabel: 'AERO',
      workItems: [
        'aero-rake and flow-visualisation correlation',
        'ride-height and floor-load measurement',
        'wind sensitivity',
      ],
    },
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'setup-baseline',
      label: 'Mechanical setup baseline',
      lapRange: [4, 6],
      paceFactor: 1.07,
      paceMode: 'standard',
      preferredDryCompounds: ['M', 'H'],
      shortLabel: 'BASE',
      workItems: [
        'low-, medium- and high-speed balance',
        'kerb and bump response',
        'braking stability and traction',
      ],
    },
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'start-pit-practice',
      label: 'Start and pit practice',
      lapRange: [2, 3],
      paceFactor: 1.1,
      paceMode: 'standard',
      preferredDryCompounds: ['M', 'H'],
      shortLabel: 'PROC',
      workItems: [
        'practice start preparation',
        'pit-entry speed and stopping marks',
        'radio and control-system checks',
      ],
    },
  ],
  fp2: [
    {
      energyIntent: 'qualifying',
      fuelMarginLaps: 3.2,
      kind: 'qualifying-simulation',
      label: 'Low-fuel qualifying simulation',
      lapRange: [1, 1],
      paceFactor: 0.99,
      paceMode: 'push',
      preferredDryCompounds: ['S'],
      shortLabel: 'QUALI',
      workItems: [
        'soft-tyre preparation',
        'maximum deployment',
        'single-lap balance',
      ],
    },
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'race-simulation',
      label: 'High-fuel race simulation',
      lapRange: [10, 20],
      paceFactor: 1.055,
      paceMode: 'standard',
      preferredDryCompounds: ['M', 'H'],
      shortLabel: 'LONG',
      workItems: [
        'long-run degradation',
        'thermal management',
        'race fuel and energy management',
      ],
    },
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'compound-comparison',
      label: 'Compound comparison',
      lapRange: [5, 8],
      paceFactor: 1.045,
      paceMode: 'standard',
      preferredDryCompounds: ['H', 'M', 'S'],
      shortLabel: 'TYRE',
      workItems: [
        'compound pace offset',
        'warm-up and overheating',
        'stint crossover estimate',
      ],
    },
    {
      energyIntent: 'qualifying',
      fuelMarginLaps: 3.2,
      kind: 'qualifying-simulation',
      label: 'Late qualifying simulation',
      lapRange: [1, 1],
      paceFactor: 0.985,
      paceMode: 'push',
      preferredDryCompounds: ['S'],
      shortLabel: 'QUALI',
      workItems: [
        'track-evolution response',
        'traffic-gap rehearsal',
        'full-energy flying lap',
      ],
    },
  ],
  fp3: [
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'setup-verification',
      label: 'Final setup verification',
      lapRange: [4, 6],
      paceFactor: 1.04,
      paceMode: 'standard',
      preferredDryCompounds: ['M', 'S'],
      shortLabel: 'SETUP',
      workItems: [
        'overnight setup validation',
        'front-wing fine adjustment',
        'low-fuel balance',
      ],
    },
    {
      energyIntent: 'qualifying',
      fuelMarginLaps: 3.2,
      kind: 'qualifying-preparation',
      label: 'Qualifying preparation',
      lapRange: [1, 1],
      paceFactor: 0.985,
      paceMode: 'push',
      preferredDryCompounds: ['S'],
      shortLabel: 'QUALI',
      workItems: [
        'out-lap tyre preparation',
        'final-corner launch',
        'full deployment',
      ],
    },
    {
      energyIntent: 'qualifying',
      fuelMarginLaps: 3.2,
      kind: 'qualifying-preparation',
      label: 'Final qualifying simulation',
      lapRange: [1, 1],
      paceFactor: 0.98,
      paceMode: 'push',
      preferredDryCompounds: ['S'],
      shortLabel: 'QUALI',
      workItems: [
        'traffic-gap targeting',
        'soft-tyre warm-up',
        'maximum-attack lap',
      ],
    },
    {
      energyIntent: 'balanced',
      fuelMarginLaps: 3,
      kind: 'systems-check',
      label: 'Pre-qualifying systems check',
      lapRange: [3, 5],
      paceFactor: 1.07,
      paceMode: 'standard',
      preferredDryCompounds: ['M', 'S'],
      shortLabel: 'CHECK',
      workItems: [
        'brake and cooling confirmation',
        'pit-entry rehearsal',
        'radio and control-system confirmation',
      ],
    },
  ],
}

const turnaroundRangeByKind: Record<
  PracticeProgramPlan['kind'],
  readonly [number, number]
> = {
  'aero-correlation': [70, 125],
  'compound-comparison': [55, 100],
  'qualifying-preparation': [45, 80],
  'qualifying-simulation': [45, 85],
  'race-simulation': [65, 115],
  'setup-baseline': [70, 130],
  'setup-verification': [55, 100],
  'start-pit-practice': [45, 75],
  'systems-check': [55, 100],
}

export function practiceProgramFor(options: {
  driverId: string
  runIndex: number
  seed: string
  stage: WeekendStage
}): PracticeProgramPlan | null {
  const { driverId, runIndex, seed, stage } = options

  if (!isPracticeStage(stage)) {
    return null
  }

  const templates = programsByStage[stage]
  const template = templates[Math.min(Math.max(0, runIndex), templates.length - 1)]
  const [minimumLaps, maximumLaps] = template.lapRange
  const targetFlyingLaps =
    minimumLaps +
    Math.floor(
      hashChance(`${seed}:practice-program:${stage}:${driverId}:${runIndex}:laps`) *
        (maximumLaps - minimumLaps + 1),
    )
  const [minimumTurnaround, maximumTurnaround] =
    turnaroundRangeByKind[template.kind]
  const garageTurnaroundSeconds =
    minimumTurnaround +
    hashChance(
      `${seed}:practice-program:${stage}:${driverId}:${runIndex}:turnaround`,
    ) *
      (maximumTurnaround - minimumTurnaround)

  return {
    ...template,
    fuelLaps: targetFlyingLaps + template.fuelMarginLaps,
    garageTurnaroundSeconds,
    targetFlyingLaps,
  }
}

export function practiceDryCompoundFor(options: {
  driverId: string
  plan: PracticeProgramPlan
  runIndex: number
  seed: string
  stage: PracticeSessionName
}) {
  const { driverId, plan, runIndex, seed, stage } = options
  const index = Math.min(
    plan.preferredDryCompounds.length - 1,
    Math.floor(
      hashChance(
        `${seed}:practice-program:${stage}:${driverId}:${runIndex}:compound`,
      ) * plan.preferredDryCompounds.length,
    ),
  )

  return plan.preferredDryCompounds[index]
}

export function practiceProgramPlanForStage(stage: PracticeSessionName) {
  return programsByStage[stage].map((program) => ({
    kind: program.kind,
    label: program.label,
    shortLabel: program.shortLabel,
    workItems: program.workItems,
  }))
}
