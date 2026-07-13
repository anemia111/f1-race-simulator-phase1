import type { CarComponents, Team } from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function createCarComponents(): CarComponents {
  return {
    // FIA 2026 Sporting Regulations B8.2: base allowance plus the 2026 extra unit.
    ice: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 4 },
    turbo: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 4 },
    exhaust: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 4 },
    energyStore: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 3 },
    controlElectronics: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 3 },
    mguK: { conditionPercent: 100, allocationUsed: 1, allocationLimit: 3 },
    // Gearbox condition is simulated, but it is not presented as a B8.2 PU pool.
    gearbox: { conditionPercent: 100, allocationUsed: 1, allocationLimit: null },
  }
}

export const componentAllocationSource = {
  asOf: '2026-06-25',
  label: 'FIA 2026 Sporting Regulations B8.2 (Issue 07)',
  url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf',
} as const

export function normalizeCarComponents(
  components?: Partial<CarComponents> | null,
): CarComponents {
  const defaults = createCarComponents()

  return Object.fromEntries(
    (Object.keys(defaults) as Array<keyof CarComponents>).map((key) => [
      key,
      { ...defaults[key], ...(components?.[key] ?? {}) },
    ]),
  ) as CarComponents
}

export function replaceCarComponent(
  components: CarComponents,
  key: keyof CarComponents,
) {
  const normalized = normalizeCarComponents(components)
  const previous = normalized[key]
  const allocationUsed = previous.allocationUsed + 1
  const overAllocation =
    previous.allocationLimit === null
      ? 0
      : Math.max(0, allocationUsed - previous.allocationLimit)
  const gridPenalty = overAllocation === 0 ? 0 : overAllocation === 1 ? 10 : 5

  return {
    components: {
      ...normalized,
      [key]: {
        ...previous,
        allocationUsed,
        conditionPercent: 100,
      },
    },
    gridPenalty,
  }
}

export function advanceComponentWear(options: {
  components: CarComponents
  deltaLaps: number
  engineStress: number
  team: Team
}) {
  const { deltaLaps, engineStress, team } = options
  const components = normalizeCarComponents(options.components)
  const reliabilityFactor = 1.22 - team.reliability * 0.42
  const wear = (rate: number) =>
    rate * deltaLaps * reliabilityFactor * (0.76 + engineStress * 0.42)
  const update = (
    component: CarComponents[keyof CarComponents],
    rate: number,
  ) => ({
    ...component,
    conditionPercent: clamp(component.conditionPercent - wear(rate), 0, 100),
  })

  return {
    ice: update(components.ice, 0.048),
    turbo: update(components.turbo, 0.061),
    exhaust: update(components.exhaust, 0.039),
    energyStore: update(components.energyStore, 0.055),
    controlElectronics: update(components.controlElectronics, 0.028),
    mguK: update(components.mguK, 0.052),
    gearbox: update(components.gearbox, 0.043),
  }
}

export function componentPacePenaltySeconds(components: CarComponents) {
  const normalized = normalizeCarComponents(components)
  const powerCondition = Math.min(
    normalized.ice.conditionPercent,
    normalized.turbo.conditionPercent,
    normalized.exhaust.conditionPercent,
    normalized.mguK.conditionPercent,
    normalized.energyStore.conditionPercent,
  )
  const gearboxCondition = normalized.gearbox.conditionPercent

  return (
    Math.max(0, 45 - powerCondition) * 0.018 +
    Math.max(0, 35 - gearboxCondition) * 0.012
  )
}

export function weakestComponent(components: CarComponents) {
  return (Object.entries(normalizeCarComponents(components)) as Array<
    [keyof CarComponents, CarComponents[keyof CarComponents]]
  >).sort(
    (left, right) =>
      left[1].conditionPercent - right[1].conditionPercent,
  )[0]
}
