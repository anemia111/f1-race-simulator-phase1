import { initialRaceTyre, raceTyreProfile, validRaceTyre, type RaceTyreState } from './raceTyres'
import {
  createSuperFormulaControlTireInventory,
  consumeSuperFormulaControlTireSets,
  superFormulaControlTireSurfaces,
  validateSuperFormulaControlTireInventory,
  type SuperFormulaControlTireInventory,
  type SuperFormulaControlTireSurface,
  type SuperFormulaControlTireUnavailableInput,
} from './superFormulaControlTires2026'

/**
 * The published rules verify dry/wet set limits but do not publish a tyre
 * performance model. This policy is deliberately a simulator declaration,
 * rather than a claim that a Yokohama coefficient was sourced.
 */
export const superFormulaLiveTirePolicy = {
  authority: 'simulator-policy',
  id: 'super-formula-live-control-tyre-v1',
  rationale:
    'No event-specific fitted-control-tyre input is bundled; select only a dry or wet surface without mapping it to an F1 compound.',
} as const

export type SuperFormulaLiveTireFitment = {
  /** The physical set was deducted from the source-bound dry/wet inventory. */
  readonly inventorySetCounted: true
  /** Monotonically increments for each simulated fitment; it is not a vendor serial. */
  readonly sequence: number
  /** Explicitly labelled neutral fallback until a verified event fitment exists. */
  readonly selectionProvenance: typeof superFormulaLiveTirePolicy
  readonly surface: SuperFormulaControlTireSurface
}

export type SuperFormulaLiveTirePhysicalModel = {
  readonly availability: 'unavailable'
  /** Do not synthesize supplier coefficients; SIM performance lives separately. */
  readonly simulatorPolicy: 'do-not-apply-physical-tire-coefficients'
  /**
   * Retains the JAF-backed unavailable input and its provenance rather than
   * substituting a Pirelli-derived model.
   */
  readonly sourceInput: SuperFormulaControlTireUnavailableInput
  readonly value: null
}

/**
 * Live SUPER FORMULA tyre state. Surface and set accounting are operational;
 * no F1 compound or allocation is represented. simulatedPerformance is the
 * separate, explicitly estimated control-tyre model authorised by the user.
 */
export type SuperFormulaLiveTireState = {
  /** Separate SIM model; the source-bound supplier coefficients remain unavailable. */
  readonly simulatedPerformance?: RaceTyreState
  readonly activeSurface: SuperFormulaControlTireSurface
  readonly fitment: SuperFormulaLiveTireFitment
  readonly kind: 'super-formula-live-control-tire'
  /** Completed laps of the physical fitted set. */
  readonly lapsOnCurrentSet: number
  readonly physicalModel: SuperFormulaLiveTirePhysicalModel
}

export type SuperFormulaLiveTireRuntime = {
  readonly controlTires: SuperFormulaControlTireInventory
  readonly liveTires: SuperFormulaLiveTireState
}

/** Legacy lap-count-only saves receive an explicit SIM wear estimate, not a new set. */
export function superFormulaSimulatedTyreFor(state: SuperFormulaLiveTireState, lapLengthKm: number) {
  if (state.simulatedPerformance) return state.simulatedPerformance
  const distanceKm = state.lapsOnCurrentSet * lapLengthKm
  const profile = raceTyreProfile('super-formula', state.activeSurface === 'wet' ? 'wet' : 'primary')
  return { ...initialRaceTyre(65, 1 - distanceKm / profile.lifeKm), distanceKm, equivalentKm: distanceKm }
}

export type SuperFormulaLiveTireValidationIssue = {
  readonly code:
    | 'active-set-not-accounted'
    | 'invalid-fitment-provenance'
    | 'invalid-inventory'
    | 'invalid-lap-count'
    | 'invalid-physical-policy'
    | 'invalid-schema'
    | 'unsupported-surface'
  readonly message: string
}

export type SuperFormulaLiveTireValidation =
  | {
      readonly issues: readonly []
      readonly valid: true
    }
  | {
      readonly issues: readonly SuperFormulaLiveTireValidationIssue[]
      readonly valid: false
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const validSurface = (
  value: unknown,
): value is SuperFormulaControlTireSurface =>
  typeof value === 'string' &&
  superFormulaControlTireSurfaces.includes(
    value as SuperFormulaControlTireSurface,
  )

const sameUnavailableInput = (
  candidate: unknown,
  expected: SuperFormulaControlTireUnavailableInput,
) => {
  if (!isRecord(candidate) || !isRecord(candidate.provenance)) {
    return false
  }

  const expectedProvenance = expected.provenance
  return (
    candidate.availability === 'unavailable' &&
    candidate.reason === expected.reason &&
    candidate.value === null &&
    candidate.provenance.article === expectedProvenance.article &&
    candidate.provenance.authority === expectedProvenance.authority &&
    candidate.provenance.checksum === expectedProvenance.checksum &&
    candidate.provenance.publishedAt === expectedProvenance.publishedAt &&
    candidate.provenance.sourceId === expectedProvenance.sourceId &&
    candidate.provenance.url === expectedProvenance.url
  )
}

const physicalModelFor = (
  inventory: SuperFormulaControlTireInventory,
): SuperFormulaLiveTirePhysicalModel => ({
  availability: 'unavailable',
  simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
  sourceInput: inventory.specification.physicalCoefficients,
  value: null,
})

const liveStateFor = (options: {
  inventory: SuperFormulaControlTireInventory
  lapsOnCurrentSet?: number
  sequence: number
  surface: SuperFormulaControlTireSurface
}): SuperFormulaLiveTireState => ({
  activeSurface: options.surface,
  fitment: {
    inventorySetCounted: true,
    selectionProvenance: superFormulaLiveTirePolicy,
    sequence: options.sequence,
    surface: options.surface,
  },
  kind: 'super-formula-live-control-tire',
  lapsOnCurrentSet: options.lapsOnCurrentSet ?? 0,
  simulatedPerformance: initialRaceTyre(),
  physicalModel: physicalModelFor(options.inventory),
})

/**
 * Creates a live tyre payload and consumes the initial physical control set.
 * The dry fallback is an explicit simulator-policy choice, not a sourced
 * compound mapping or a weather inference.
 */
export function createSuperFormulaLiveTireRuntime(options: {
  readonly initialSurface?: SuperFormulaControlTireSurface
  readonly inventory?: SuperFormulaControlTireInventory
} = {}): SuperFormulaLiveTireRuntime {
  const inventory = options.inventory ?? createSuperFormulaControlTireInventory()
  const inventoryValidation = validateSuperFormulaControlTireInventory(inventory)

  if (!inventoryValidation.valid) {
    throw new Error(
      `Cannot create a live SUPER FORMULA tyre runtime from an invalid inventory: ${inventoryValidation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  const surface = options.initialSurface ?? 'dry'
  const controlTires = consumeSuperFormulaControlTireSets({
    inventory,
    surface,
  })
  const liveTires = liveStateFor({
    inventory: controlTires,
    sequence: controlTires.sets[surface].usedSets,
    surface,
  })
  const validation = validateSuperFormulaLiveTireState({
    controlTires,
    liveTires,
  })

  if (!validation.valid) {
    throw new Error(
      `Created an invalid live SUPER FORMULA tyre runtime: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  return { controlTires, liveTires }
}

/**
 * Fits a new dry/wet control set, resetting laps and the separate SIM tyre
 * state. Unpublished supplier coefficients remain unavailable.
 */
export function fitSuperFormulaLiveControlTire(options: {
  readonly runtime: SuperFormulaLiveTireRuntime
  readonly surface: SuperFormulaControlTireSurface
}): SuperFormulaLiveTireRuntime {
  const validation = validateSuperFormulaLiveTireState(options.runtime)

  if (!validation.valid) {
    throw new Error(
      `Cannot fit a SUPER FORMULA control tyre from an invalid runtime: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}`,
    )
  }

  const controlTires = consumeSuperFormulaControlTireSets({
    inventory: options.runtime.controlTires,
    surface: options.surface,
  })
  const liveTires = liveStateFor({
    inventory: controlTires,
    sequence: options.runtime.liveTires.fitment.sequence + 1,
    surface: options.surface,
  })

  return { controlTires, liveTires }
}

/**
 * Records completed laps for set accounting. The live SIM performance state
 * advances from travelled distance and load, independently of this counter.
 */
export function recordSuperFormulaLiveTireLaps(options: {
  readonly completedLaps: number
  readonly state: SuperFormulaLiveTireState
}): SuperFormulaLiveTireState {
  if (!isNonNegativeInteger(options.completedLaps)) {
    throw new RangeError(
      'Recorded SUPER FORMULA control-tyre laps must be a non-negative integer.',
    )
  }

  return {
    ...options.state,
    lapsOnCurrentSet: options.state.lapsOnCurrentSet + options.completedLaps,
  }
}

/**
 * Validates the persisted live tyre boundary. It rejects made-up physical
 * values and ensures the fitted surface has consumed an inventory set.
 */
export function validateSuperFormulaLiveTireState(
  runtime: unknown,
): SuperFormulaLiveTireValidation {
  const issues: SuperFormulaLiveTireValidationIssue[] = []

  if (!isRecord(runtime)) {
    return {
      issues: [
        {
          code: 'invalid-schema',
          message: 'Live SUPER FORMULA tyre runtime must be an object.',
        },
      ],
      valid: false,
    }
  }

  const controlTires = runtime.controlTires
  const inventoryValidation = validateSuperFormulaControlTireInventory(controlTires)
  const validatedInventory = inventoryValidation.valid
    ? (controlTires as SuperFormulaControlTireInventory)
    : null
  if (!inventoryValidation.valid) {
    issues.push({
      code: 'invalid-inventory',
      message: 'Live SUPER FORMULA tyre runtime must retain a valid control-set inventory.',
    })
  }

  const liveTires = runtime.liveTires
  if (!isRecord(liveTires)) {
    issues.push({
      code: 'invalid-schema',
      message: 'Live SUPER FORMULA tyre state must be an object.',
    })
    return { issues, valid: false }
  }

  if (liveTires.simulatedPerformance !== undefined && !validRaceTyre(liveTires.simulatedPerformance)) {
    issues.push({ code: 'invalid-schema', message: 'Invalid SIM control-tyre performance state.' })
  }

  if (liveTires.kind !== 'super-formula-live-control-tire') {
    issues.push({
      code: 'invalid-schema',
      message: 'Live tyre state must identify the SUPER FORMULA control-tyre schema.',
    })
  }

  if (!validSurface(liveTires.activeSurface)) {
    issues.push({
      code: 'unsupported-surface',
      message: 'Live tyre state must use only the dry or wet control surface.',
    })
  }

  if (!isNonNegativeInteger(liveTires.lapsOnCurrentSet)) {
    issues.push({
      code: 'invalid-lap-count',
      message: 'Live tyre laps must be a non-negative integer.',
    })
  }

  const fitment = liveTires.fitment
  if (
    !isRecord(fitment) ||
    fitment.inventorySetCounted !== true ||
    !validSurface(fitment.surface) ||
    fitment.surface !== liveTires.activeSurface ||
    !Number.isSafeInteger(fitment.sequence) ||
    (fitment.sequence as number) < 1 ||
    !isRecord(fitment.selectionProvenance) ||
    fitment.selectionProvenance.authority !== superFormulaLiveTirePolicy.authority ||
    fitment.selectionProvenance.id !== superFormulaLiveTirePolicy.id ||
    fitment.selectionProvenance.rationale !== superFormulaLiveTirePolicy.rationale
  ) {
    issues.push({
      code: 'invalid-fitment-provenance',
      message: 'Live tyre fitment must retain the explicit simulator-policy provenance.',
    })
  }

  const physicalModel = liveTires.physicalModel
  const expectedPhysicalInput =
    validatedInventory?.specification.physicalCoefficients
  if (
    !isRecord(physicalModel) ||
    physicalModel.availability !== 'unavailable' ||
    physicalModel.simulatorPolicy !==
      'do-not-apply-physical-tire-coefficients' ||
    physicalModel.value !== null ||
    !isRecord(expectedPhysicalInput) ||
    !sameUnavailableInput(physicalModel.sourceInput, expectedPhysicalInput as SuperFormulaControlTireUnavailableInput)
  ) {
    issues.push({
      code: 'invalid-physical-policy',
      message: 'Live tyre physics must remain explicitly unavailable with the source-bound policy input.',
    })
  }

  if (
    validatedInventory &&
    validSurface(liveTires.activeSurface) &&
    validatedInventory.sets[liveTires.activeSurface].usedSets < 1
  ) {
    issues.push({
      code: 'active-set-not-accounted',
      message: 'The active control-tyre surface must have a consumed inventory set.',
    })
  }

  return issues.length === 0
    ? { issues: [], valid: true }
    : { issues, valid: false }
}
