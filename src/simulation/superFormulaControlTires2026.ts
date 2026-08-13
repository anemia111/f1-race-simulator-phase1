import {
  superFormulaOperationalRules2026,
  type SuperFormulaRuleProvenance,
  type VerifiedSuperFormulaRule,
} from '../data/superFormulaRules2026'

/**
 * The published 2026 SUPER FORMULA rule states only the maximum number of
 * dry and wet sets. This domain deliberately carries no unverified
 * subdivision or physical-performance model.
 */
export const superFormulaControlTireSurfaces = ['dry', 'wet'] as const

export type SuperFormulaControlTireSurface =
  (typeof superFormulaControlTireSurfaces)[number]

export type SuperFormulaControlTireUnavailableInput = {
  readonly availability: 'unavailable'
  readonly provenance: SuperFormulaRuleProvenance
  readonly reason: string
  readonly value: null
}

export type SuperFormulaControlTireSpecification = {
  readonly drySetSubdivision: SuperFormulaControlTireUnavailableInput
  readonly physicalCoefficients: SuperFormulaControlTireUnavailableInput
  readonly wetSetSubdivision: SuperFormulaControlTireUnavailableInput
}

export type SuperFormulaControlTireSetInventory = {
  readonly allocatedSets: number
  readonly maximumSets: number
  readonly maximumSetsRule: VerifiedSuperFormulaRule<number>
  readonly remainingSets: number
  readonly surface: SuperFormulaControlTireSurface
  readonly usedSets: number
}

export type SuperFormulaControlTireInventory = {
  readonly kind: 'super-formula-control-tire-inventory'
  readonly schemaVersion: 1
  readonly seriesId: 'super-formula'
  readonly sets: Readonly<
    Record<SuperFormulaControlTireSurface, SuperFormulaControlTireSetInventory>
  >
  readonly specification: SuperFormulaControlTireSpecification
}

export type SuperFormulaControlTireInventorySeed = {
  readonly allocatedSets?: Partial<
    Record<SuperFormulaControlTireSurface, number>
  >
  readonly usedSets?: Partial<Record<SuperFormulaControlTireSurface, number>>
}

export type SuperFormulaControlTireInventoryValidationIssue = {
  readonly code:
    | 'allocated-sets-exceed-maximum'
    | 'invalid-count'
    | 'invalid-schema'
    | 'maximum-sets-not-authoritative'
    | 'remaining-sets-mismatch'
    | 'unavailable-input-present'
    | 'unexpected-surface'
    | 'used-sets-exceed-allocation'
  readonly message: string
  readonly surface?: SuperFormulaControlTireSurface
}

export type SuperFormulaControlTireInventoryValidation =
  | {
      readonly issues: readonly []
      readonly valid: true
    }
  | {
      readonly issues: readonly SuperFormulaControlTireInventoryValidationIssue[]
      readonly valid: false
    }

const maximumSetsRuleBySurface: Readonly<
  Record<SuperFormulaControlTireSurface, VerifiedSuperFormulaRule<number>>
> = {
  dry: superFormulaOperationalRules2026.tires.maxDrySetsPerCarPerRace,
  wet: superFormulaOperationalRules2026.tires.maxWetSetsPerCarPerRace,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0

const sameProvenance = (
  candidate: unknown,
  expected: SuperFormulaRuleProvenance,
) => {
  if (!isRecord(candidate)) {
    return false
  }

  return (
    candidate.article === expected.article &&
    candidate.authority === expected.authority &&
    candidate.checksum === expected.checksum &&
    candidate.publishedAt === expected.publishedAt &&
    candidate.sourceId === expected.sourceId &&
    candidate.url === expected.url
  )
}

const maximumSetsRuleFor = (
  surface: SuperFormulaControlTireSurface,
): VerifiedSuperFormulaRule<number> => {
  const rule = maximumSetsRuleBySurface[surface]

  if (
    rule.availability !== 'verified' ||
    !isNonNegativeInteger(rule.value)
  ) {
    throw new Error(
      `Published 2026 SUPER FORMULA ${surface} tyre-set maximum is unavailable.`,
    )
  }

  return rule
}

const unavailableInput = (
  provenance: SuperFormulaRuleProvenance,
  reason: string,
): SuperFormulaControlTireUnavailableInput => ({
  availability: 'unavailable',
  provenance,
  reason,
  value: null,
})

const specificationFor = (): SuperFormulaControlTireSpecification => {
  const dryRule = maximumSetsRuleFor('dry')
  const wetRule = maximumSetsRuleFor('wet')

  return {
    drySetSubdivision: unavailableInput(
      dryRule.provenance,
      'The published rule gives a dry-set maximum but no verified dry-set subdivision.',
    ),
    physicalCoefficients: unavailableInput(
      dryRule.provenance,
      'The published rule gives no verified physical coefficients for the control tyres.',
    ),
    wetSetSubdivision: unavailableInput(
      wetRule.provenance,
      'The published rule gives a wet-set maximum but no verified wet-set subdivision.',
    ),
  }
}

const setInventoryFor = (
  surface: SuperFormulaControlTireSurface,
  seed: SuperFormulaControlTireInventorySeed,
): SuperFormulaControlTireSetInventory => {
  const maximumSetsRule = maximumSetsRuleFor(surface)
  const maximumSets = maximumSetsRule.value
  const allocatedSets = seed.allocatedSets?.[surface] ?? maximumSets
  const usedSets = seed.usedSets?.[surface] ?? 0

  if (!isNonNegativeInteger(allocatedSets)) {
    throw new RangeError(
      `SUPER FORMULA ${surface} allocated sets must be a non-negative integer.`,
    )
  }

  if (!isNonNegativeInteger(usedSets)) {
    throw new RangeError(
      `SUPER FORMULA ${surface} used sets must be a non-negative integer.`,
    )
  }

  if (allocatedSets > maximumSets) {
    throw new RangeError(
      `SUPER FORMULA ${surface} allocated sets exceed the published maximum of ${maximumSets}.`,
    )
  }

  if (usedSets > allocatedSets) {
    throw new RangeError(
      `SUPER FORMULA ${surface} used sets exceed the allocated set count.`,
    )
  }

  return {
    allocatedSets,
    maximumSets,
    maximumSetsRule,
    remainingSets: allocatedSets - usedSets,
    surface,
    usedSets,
  }
}

const validationIssue = (
  code: SuperFormulaControlTireInventoryValidationIssue['code'],
  message: string,
  surface?: SuperFormulaControlTireSurface,
): SuperFormulaControlTireInventoryValidationIssue => ({
  code,
  message,
  ...(surface === undefined ? {} : { surface }),
})

const validUnavailableInput = (
  value: unknown,
  provenance: SuperFormulaRuleProvenance,
) =>
  isRecord(value) &&
  value.availability === 'unavailable' &&
  value.value === null &&
  typeof value.reason === 'string' &&
  sameProvenance(value.provenance, provenance)

/**
 * Builds an immutable-by-convention inventory from the published maximums.
 * The caller may allocate fewer sets, but cannot allocate beyond the rule.
 */
export function createSuperFormulaControlTireInventory(
  seed: SuperFormulaControlTireInventorySeed = {},
): SuperFormulaControlTireInventory {
  const inventory: SuperFormulaControlTireInventory = {
    kind: 'super-formula-control-tire-inventory',
    schemaVersion: 1,
    seriesId: 'super-formula',
    sets: {
      dry: setInventoryFor('dry', seed),
      wet: setInventoryFor('wet', seed),
    },
    specification: specificationFor(),
  }
  const validation = validateSuperFormulaControlTireInventory(inventory)

  if (!validation.valid) {
    throw new Error(
      `Created an invalid SUPER FORMULA control-tyre inventory: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  return inventory
}

/**
 * Validates data at persistence and runtime-system boundaries without
 * converting unavailable tyre inputs into invented model values.
 */
export function validateSuperFormulaControlTireInventory(
  inventory: unknown,
): SuperFormulaControlTireInventoryValidation {
  const issues: SuperFormulaControlTireInventoryValidationIssue[] = []

  if (!isRecord(inventory)) {
    return {
      issues: [
        validationIssue('invalid-schema', 'Inventory must be an object.'),
      ],
      valid: false,
    }
  }

  if (
    inventory.kind !== 'super-formula-control-tire-inventory' ||
    inventory.schemaVersion !== 1 ||
    inventory.seriesId !== 'super-formula'
  ) {
    issues.push(
      validationIssue(
        'invalid-schema',
        'Inventory identity must identify the 2026 SUPER FORMULA control-tyre schema.',
      ),
    )
  }

  const sets = inventory.sets
  if (!isRecord(sets)) {
    issues.push(
      validationIssue('invalid-schema', 'Inventory sets must be an object.'),
    )
  } else {
    for (const key of Object.keys(sets)) {
      if (!superFormulaControlTireSurfaces.includes(key as SuperFormulaControlTireSurface)) {
        issues.push(
          validationIssue(
            'unexpected-surface',
            `Inventory contains an unsupported tyre surface: ${key}.`,
          ),
        )
      }
    }

    for (const surface of superFormulaControlTireSurfaces) {
      const candidate = sets[surface]
      const expectedRule = maximumSetsRuleFor(surface)

      if (!isRecord(candidate)) {
        issues.push(
          validationIssue(
            'invalid-schema',
            `Inventory is missing its ${surface} set record.`,
            surface,
          ),
        )
        continue
      }

      if (candidate.surface !== surface) {
        issues.push(
          validationIssue(
            'invalid-schema',
            `Inventory ${surface} set record has a mismatched surface label.`,
            surface,
          ),
        )
      }

      const counts = [
        ['allocatedSets', candidate.allocatedSets],
        ['maximumSets', candidate.maximumSets],
        ['remainingSets', candidate.remainingSets],
        ['usedSets', candidate.usedSets],
      ] as const
      for (const [name, value] of counts) {
        if (!isNonNegativeInteger(value)) {
          issues.push(
            validationIssue(
              'invalid-count',
              `Inventory ${surface} ${name} must be a non-negative integer.`,
              surface,
            ),
          )
        }
      }

      if (
        candidate.maximumSets !== expectedRule.value ||
        !isRecord(candidate.maximumSetsRule) ||
        candidate.maximumSetsRule.availability !== 'verified' ||
        candidate.maximumSetsRule.value !== expectedRule.value ||
        !sameProvenance(
          candidate.maximumSetsRule.provenance,
          expectedRule.provenance,
        )
      ) {
        issues.push(
          validationIssue(
            'maximum-sets-not-authoritative',
            `Inventory ${surface} maximum must match the published rule.`,
            surface,
          ),
        )
      }

      if (
        isNonNegativeInteger(candidate.allocatedSets) &&
        isNonNegativeInteger(candidate.maximumSets) &&
        candidate.allocatedSets > candidate.maximumSets
      ) {
        issues.push(
          validationIssue(
            'allocated-sets-exceed-maximum',
            `Inventory ${surface} allocation exceeds its maximum.`,
            surface,
          ),
        )
      }

      if (
        isNonNegativeInteger(candidate.usedSets) &&
        isNonNegativeInteger(candidate.allocatedSets) &&
        candidate.usedSets > candidate.allocatedSets
      ) {
        issues.push(
          validationIssue(
            'used-sets-exceed-allocation',
            `Inventory ${surface} use exceeds its allocation.`,
            surface,
          ),
        )
      }

      if (
        isNonNegativeInteger(candidate.allocatedSets) &&
        isNonNegativeInteger(candidate.usedSets) &&
        isNonNegativeInteger(candidate.remainingSets) &&
        candidate.remainingSets !== candidate.allocatedSets - candidate.usedSets
      ) {
        issues.push(
          validationIssue(
            'remaining-sets-mismatch',
            `Inventory ${surface} remaining sets must equal allocation minus use.`,
            surface,
          ),
        )
      }
    }
  }

  const specification = inventory.specification
  if (!isRecord(specification)) {
    issues.push(
      validationIssue(
        'invalid-schema',
        'Inventory specification must explicitly preserve unavailable inputs.',
      ),
    )
  } else {
    const unavailableInputs = [
      {
        key: 'drySetSubdivision',
        provenance: maximumSetsRuleFor('dry').provenance,
      },
      {
        key: 'physicalCoefficients',
        provenance: maximumSetsRuleFor('dry').provenance,
      },
      {
        key: 'wetSetSubdivision',
        provenance: maximumSetsRuleFor('wet').provenance,
      },
    ] as const
    for (const { key, provenance } of unavailableInputs) {
      if (!validUnavailableInput(specification[key], provenance)) {
        issues.push(
          validationIssue(
            'unavailable-input-present',
            `Inventory ${key} must remain unavailable without a verified event input.`,
          ),
        )
      }
    }
  }

  return issues.length === 0
    ? { issues: [], valid: true }
    : { issues, valid: false }
}

/**
 * Returns a new inventory after consuming physical sets. The source-bound
 * maximum and all unavailable inputs are retained unchanged.
 */
export function consumeSuperFormulaControlTireSets(options: {
  readonly inventory: SuperFormulaControlTireInventory
  readonly setCount?: number
  readonly surface: SuperFormulaControlTireSurface
}): SuperFormulaControlTireInventory {
  const { inventory, surface, setCount = 1 } = options
  const validation = validateSuperFormulaControlTireInventory(inventory)

  if (!validation.valid) {
    throw new Error(
      `Cannot consume sets from an invalid SUPER FORMULA control-tyre inventory: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  if (!isNonNegativeInteger(setCount) || setCount === 0) {
    throw new RangeError('Consumed SUPER FORMULA tyre sets must be a positive integer.')
  }

  const current = inventory.sets[surface]
  if (setCount > current.remainingSets) {
    throw new RangeError(
      `Cannot consume ${setCount} SUPER FORMULA ${surface} tyre sets; only ${current.remainingSets} remain.`,
    )
  }

  const next: SuperFormulaControlTireInventory = {
    ...inventory,
    sets: {
      ...inventory.sets,
      [surface]: {
        ...current,
        remainingSets: current.remainingSets - setCount,
        usedSets: current.usedSets + setCount,
      },
    },
  }
  const nextValidation = validateSuperFormulaControlTireInventory(next)

  if (!nextValidation.valid) {
    throw new Error(
      `Consumed an invalid SUPER FORMULA control-tyre inventory: ${nextValidation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  return next
}
