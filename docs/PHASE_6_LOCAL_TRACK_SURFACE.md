# Phase 6 local track-surface substrate

## Status and scope — closed

This Phase 6 implementation introduces a deterministic, two-lane local-surface
substrate, connects it to the live race force path, and makes that substrate
the live water/rubber evolution authority. The canonical-authority migration
and its legacy cleanup are complete. The source-backed road-input follow-up now
ingests the public MADRING width/banking/grade/elevation facts and Zandvoort's
published bank angles. It also establishes fail-closed contracts for numeric
road grip and tyre relaxation. It does **not** claim that unpublished
circuit/tyre coefficients, a complete surveyed elevation mesh, or chassis
response data have become available.

Phase 6 is closed at this source boundary. Every requested measured field is
either connected with provenance or represented as explicitly unavailable; the
absence of a public supplier/circuit number is not unfinished implementation.
It may be reopened only when a primary source supplies the missing numeric
input and its units/location/category scope.

## Runtime model

`src/simulation/trackSurface.ts` owns a structure-of-arrays typed state with
two lanes per cell:

- `racing-line`;
- `off-line`.

Every cell has bounded bonded rubber, loose-rubber/marble proxy, water-film
depth, drying maturity, surface temperature, and a static base-friction input.
The state has a serializable form; the checkpoint parser validates that form
strictly and rejects malformed or normalizable persisted input.
`trackSurfaceAt` resolves the car's normalized progress and lateral offset to
a cell and lane. A grid slot remains on the racing line; the off-line lane
starts only outside the bounded lateral threshold.

Fresh sessions enter through `createInitialTrackSurfaceState`, which writes
the existing rain-derived water/dryness policy directly into the canonical
two-lane arrays. The former `TrackWaterState` and `TrackRubberState` sector
initializers are removed. `createTrackSurfaceStateFromLegacySectors` remains
only for v2 checkpoint migration and focused compatibility fixtures.

The live representation uses `Float64Array`; `RaceSnapshot.trackSurface`
stores its strict plain-array serialization. It is the single persisted
simulation authority. Active UI, strategy and session-rule consumers derive
sector summaries directly from it through `trackSurfaceSectorSummary`. The
historic three-sector fields are absent from the current `RaceSnapshot` and
checkpoint schema v4; they exist only in the explicit v3/v2 migration input.

## Canonical live evolution

`advanceRace` restores the canonical two-lane state at the start of a tick and
calls `advanceTrackSurface` once. The update integrates bounded 50 ms internal
surface-policy slices, not a new fixed race tick, up to a 30 s public-frame
safety bound. Rainfall is added to every
represented cell/lane; drainage, evaporation, tyre spray, and capacity
overflow are explicit external sinks. Vehicle traversals deposit rubber,
displace water, mature the drying line, and move a bounded share of loose
rubber from the racing line to the off-line lane. Rain washes bonded and loose
rubber gradually. The obsolete three-sector water and rubber updater exports
are removed, so they cannot be run as a second evolution authority.

A traversal records normalized start progress, lap-fraction distance, and the
resolved lane. Only a moving, running car that is on the circuit and outside a
pit phase contributes tyre work. Formation-lap movement therefore contributes;
stationary grid/lights cars, garage or pit-lane cars, and off-track cars do not.
Rain, drainage, evaporation, drying maturity, and temperature continue to
evolve across every cell even when there is no vehicle traversal.

The update returns water and rubber flux ledgers. Water closes as previous
stock plus rainfall minus drainage, evaporation, tyre spray, and overflow.
Rubber closes as previous bonded-plus-loose coverage plus tyre deposit minus
wash and bounded removal. Marble migration is an internal lane transfer, so it
does not appear as an external stock source or sink.

## Compatibility, force coupling, and checkpoints

`RaceSnapshot.trackSurface` is the only dynamic surface authority. After the
canonical update, active runtime and UI reads use the same direct canonical
summary helper. No three-sector water, drying or rubber copy is written to the
current snapshot.

Checkpoint schema v4 requires a well-formed canonical surface and stores no
three-sector projection. Schema v3 checkpoints validate their canonical state,
discard their projection copies, and continue as v4 state. Schema v2
checkpoints are deterministically hydrated once from their then-authoritative
three-sector values, active track sector marks, and source-labelled surface
profile. A malformed v3 or v4 canonical state is rejected rather than silently
rebuilt from stale compatibility fields.

The source-labelled static profile is selected when the race is created and is
saved with that race's canonical state. Updating an external configuration
cannot alter an already-running race; restoration verifies that the saved
static profile, cell grid, defaults, and base-friction array match the active
track definition before allowing continuation.

The race loop resolves the local surface once for each running car and composes
it as follows:

```text
track grip = base-friction/marbles × existing rubber/water composition
           -> existing live tyre and vehicle-force calculation
```

Water and rubber are deliberately composed once. `trackSurfaceAt` returns
their local state but does not include them in its base-grip multiplier; the
existing `gripWithTrackRubber` and telemetry water handling retain that job.
This prevents a second rain or rubber multiplier from being introduced during
the migration.

The current deterministic continuation model is `2026.08.30.1`. An earlier model is
rejected rather than resuming with the former sector-level evolution rules.

## Weekend and session carry-over

`WeekendContext.trackSurfaceCarry` stores a deep serialized canonical state
with its track ID. Completion of a played practice, qualifying, sprint, or race
session carries that state forward. A synthetic skipped session preserves the
previous carry instead of fabricating surface work. The first session starts
fresh from current rain and track temperature.

A carry is restored only for the same track ID and only when its raw shape and
static contract (profile, sector marks, defaults, cell grid, and base-friction
array) still match. Otherwise it fails closed to a fresh state. Timed practice,
qualifying, and sprint-qualifying freeze the carried bonded-rubber and marble
stocks through `rubberEvolutionEnabled: false` so player time acceleration
cannot alter rubber between qualifying groups. Water, dryness, and surface
temperature still evolve. Race and sprint sessions enable rubber evolution.

## Policy units and limitations

The water ledger uses `mm-cell-lane`: the sum of film depths over equal model
slots. It is proportional to represented inventory, but it is not kilograms,
litres, or a claim about road area. Source-backed width is available only on
MADRING; the cell stock still intentionally uses equal slots instead of mixing
physical areas with legacy fallback tracks. The rubber ledger uses
dimensionless `coverage-cell-lane` stock. Evolution coefficients are explicit
neutral simulator policy; none is fitted per circuit.

There is no slope, camber, catchment, drain-map, spray-return, or runoff
geometry from which to route water between cells. Tyre-displaced film leaves
the represented substrate as spray, and only film above the 6 mm slot capacity
is recorded as overflow. `dryness` is a bounded response state, not a second
water inventory. Likewise, bonded rubber, marbles, and surface temperature are
policy proxies rather than measured circuit telemetry.

## Provenance boundary

`TrackDefinition.surfaceProfile` is optional and requires a non-empty label
and one of `official`, `observed`, or `simulator-policy`. Its global or
wrap-aware progress sections can currently supply only `baseFriction`.
Malformed or unlabelled provenance fails closed to neutral `1.0` friction.

No track in the shipped 2026 data receives a new static friction value. The
2026 Pirelli material describes Zandvoort as relatively low grip and Madrid's
new asphalt as unknown, but publishes no numeric coefficient. The
`resolveSourceBackedRoadGrip` boundary retains those qualitative observations
with `numericCoefficient: null`; it never maps an adjective to a force
multiplier. Consequently, a normal existing race keeps its prior neutral
base-friction input. A test-only policy profile proves the live coupling
without presenting an invented circuit measurement as source data.

## Tyre-force and brake-capacity follow-up

The second Phase 6 slice connects the existing F1 tyre runtime state to the
same live force envelope used by both cornering and longitudinal integration.
`f1TireForceEnvelopeFor` is a bounded `simulator-policy` bridge: an in-window,
fresh F1 set remains exactly neutral, while cold/hot temperatures, wear,
thermal stress, graining, and overheating can only reduce available grip. The
multiplier is composed once in telemetry before the existing force ellipse; it
is not a lap-time correction. SUPER FORMULA retains its explicit
source-unavailable control-tyre physical model and never receives F1/Pirelli
coefficients.

Service-brake hardware now has a temperature-dependent capacity resolver. Its
bounded policy capacity is intersected with the requested brake force and the
tyre longitudinal envelope in the vehicle solver, so cold or overheated brake
hardware cannot be hidden by a later force calculation. The normal operating
window remains neutral for compatibility. The live F1 braking path no longer
asks the Energy Store to predict brake work from a nominal deceleration. It
first previews the same tyre-ellipse, hardware-temperature, lateral-demand and
release-modulated force solve used by the vehicle, and sends the resulting
contact-patch work as equal-duration internal-slice energies. The Energy Store
caps recovery in each slice against both that mechanical work and its existing
machine, battery, thermal, SOC and lap-recharge limits. Accepted braking energy
is returned slice-by-slice and becomes a local friction/recovery split in the
final force solve; it cannot continue after the service brake releases or be
smeared across a coarse public frame. Frame-integrated service work therefore
closes as friction work plus accepted braking-recovery work, and brake thermal
feedback consumes the final friction work rather than a nominal-power proxy.

Non-braking lift/coast and super-clipping keep their existing standalone
generator path, and callers that do not supply the exact profile retain the
legacy compatibility calculation. SUPER FORMULA still has no F1 Energy Store;
its service-brake work is entirely frictional. The policy intentionally makes
no claim about team-specific disc, pad, duct, or cooling data. Because this
changes deterministic ERS and brake-temperature continuation, checkpoint model
`2026.08.20.2` rejects the preceding `2026.08.20.1` force model rather than
silently mixing histories.

## Physical-track contract follow-up

`src/simulation/physicalTrack.ts` provides a pure, provenance-labelled metric
adapter for chassis and surface work. It scales only the existing horizontal
layout to the declared lap length, validates a closed loop, and exposes arc
stations, tangents, normals, signed horizontal curvature, and any locally
available sourced road fields. Render-space Y and render width are still never
reinterpreted as physical measurements. Unsupported station fields remain
`null`, with `unavailable` provenance at track level.

## Physical-road input boundary

The legacy centreline's Y coordinate remains a rendering/layout signal, not a
surveyed elevation profile. `physicalRoadProfiles.ts` adds data only when an
independent primary source publishes it:

- MADRING: all 22 official corner lengths, entry/exit widths and banking
  slopes, the 15 m/589 m main straight, T2/T7 elevations, and the published
  8% uphill/10 m rise and 5% downhill sections;
- Zandvoort: the published 19 degree T3 and 18 degree T14 bank angles.

MADRING banking values are published as percentage slope and are converted
with `atan(slope / 100)`. Counter-banked corners retain a negative sign. Corner
lengths are centred on the existing official corner markers and stationized on
the declared lap length, so this transformation is labelled `derived` rather
than promoted to a survey. The partial elevation profile is intentionally low
confidence: only the source-covered landmarks/grade sections are populated.

The live grade/banking force paths, racing-line geometry, lateral boundaries,
race occupation, qualifying decisions, and strategy width reference now read
the same local physical road resolver. Where a source value is absent, grade
and ordinary banking fall back neutrally to zero and width retains the labelled
legacy policy. `TrackDefinition.width` remains render-only. In particular, the
old misplaced Madrid bank window is removed; La Monumental is resolved from
the T12 marker and its official 547.82 m length.

## Tyre transient data boundary

SAE 900129 experimentally derives a first-order differential response using a
tyre relaxation length. `tyreTransient.ts` implements its exact distance-domain
first-order update and requires positive, source-labelled lateral and
longitudinal relaxation lengths. The numerical update is step-invariant for a
constant target and contains no default coefficient.

The latest FIA rulebook delegates the F1 tyre specification to the supplier,
and public Pirelli 2026 material describes validation/testing without
publishing category relaxation lengths. Public JRP/Yokohama material likewise
does not publish the SUPER FORMULA inputs. Therefore
`resolveTyreTransientParameters` returns `unavailable` for both shipped
categories. The solver is not inserted into the live force path until those
series-specific values exist; doing so now would silently turn an arbitrary
road-tyre/test value into F1 or SF physics.

## Source audit

This non-regulatory Phase 6 source check was rechecked on 2026-08-29 and is
separate from the frozen regulation manifest's 2026-08-08 cut-off.

- MADRING official circuit technical information:
  <https://www.madring.com/en/circuit>
- Formula 1/Pirelli 2026 Dutch Grand Prix preview (published 2026-08-20):
  <https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2026-dutch-grand-prix.7rXg1scAXG5IMsHc9k74g4>
- Pirelli 2026 Zandvoort/Monza/Madrid compound selection (published
  2026-07-28):
  <https://press.pirelli.com/tyre-compounds-selected-for-zandvoort-monza-and-madrid/>
- Pirelli 2026 tyre-range validation summary (published 2025-11-24):
  <https://press.pirelli.com/the-range-of-compounds-for-the-2026-season-has-been-set/>
- FIA 2026 Technical Regulations, C10.8 tyre specification authority:
  <https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf>
- Yokohama Rubber 2026 motorsport programme and SUPER FORMULA control-tyre
  supply (published 2026-03-18):
  <https://www.y-yokohama.com/release/?id=4749&lang=en>
- Loeb et al., SAE 900129, experimental relaxation-length method:
  <https://doi.org/10.4271/900129>

The source audit found qualitative grip/roughness descriptions but no public
numeric circuit friction coefficient. It found the generic first-order tyre
method but no F1/SF construction-specific relaxation lengths or compound force
coefficients.

## Closed source-unavailable inputs

The canonical migration is closed with one live evolution authority, direct
runtime/UI summaries, canonical fresh-session initialization, schema-v4
checkpoint persistence, and explicit v3/v2 migration. The items below are not
cleanup debt hidden behind legacy state; they require new source data or a new
validated physical-model slice. They remain unavailable rather than receiving
invented neutral or circuit-specific values. These are recorded limits, not an
open coding backlog:

- Per-track numeric roughness, drainage, evaporation, catchment, runoff, or
  absolute tyre-road friction inputs;
- measured cell-by-cell water, rubber, temperature, or debris state;
- source-backed physical width/elevation/grade/banking outside the partial
  MADRING and Zandvoort profiles, plus kerb and runoff geometry everywhere;
- live tyre relaxation/transient response, source-backed compound force
  coefficients, or an SF control-tyre physics model. Both series remain
  source-unavailable for relaxation lengths, and SUPER FORMULA does not reuse
  F1/Pirelli values.

`advanceTrackSurfaceCell` remains a narrow, bounded policy probe. The live race
uses the whole-state `advanceTrackSurface` flux-accounted update; callers must
not run the cell probe as a second evolution pass.

## Verification

Focused tests cover neutral/default behavior, wrap-around cell resolution,
lane selection, canonical serialize/deserialize round trips, water and rubber
flux closure, rain wash, local tyre work, traversal ordering, session carry,
checkpoint rejection, v3/v2 compatibility migration, local-force monotonicity,
MADRING/Zandvoort provenance and stationing, signed counter-banking, local
width use, unavailable numeric road grip, and source-gated tyre relaxation.
`npm run validate:track-surface` also runs a
deterministic 36-case matrix: Monaco, Monza, Singapore, Spa, Suzuka, and
Zandvoort crossed with green, rubbered, light-rain, heavy-rain, drying, and
off-line scenarios.
The light- and heavy-rain probes use fixed 2 and 10 mm/h policy inputs.
The circuit names are coverage labels only: the generator uses the public
domain API, performs no fit or calibration, consults no holdout, and applies no
track-specific multiplier. Use `--no-report` to run the gate without writing
`artifacts/track-surface-validation/summary.json`. Existing full race
regression suites remain part of the release gate.
