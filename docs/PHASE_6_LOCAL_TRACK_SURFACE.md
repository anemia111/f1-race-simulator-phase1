# Phase 6 local track-surface substrate

## Status and scope

This Phase 6 implementation introduces a deterministic, two-lane local-surface
substrate, connects it to the live race force path, and makes that substrate
the live water/rubber evolution authority. It does **not** claim that Phase 6
as a whole is complete: source-backed elevation/banking, physical-width
ingestion, tyre transient/relaxation, chassis response, and measured
circuit-specific surface parameters remain separate follow-up slices.

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

The live representation uses `Float64Array`; `RaceSnapshot.trackSurface`
stores its strict plain-array serialization. It is the single persisted
simulation authority. Active UI, strategy and session-rule consumers derive
sector summaries directly from it through `trackSurfaceSectorSummary`. The
historic three-sector fields remain output-only checkpoint compatibility data
and can be retired with a deliberate schema-compatibility change.

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
canonical update, racing-line values are projected into the historic
three-sector fields for checkpoint compatibility. Active runtime and UI reads
use the same direct canonical summary helper instead. Compatibility fields are
outputs and are never advanced independently or projected back into the
canonical state.

Checkpoint schema v3 requires a well-formed canonical surface and normalizes
all compatibility sectors from it on restore. Schema v2 checkpoints are
deterministically hydrated once from their then-authoritative three-sector
values, active track sector marks, and source-labelled surface profile. A
malformed v3 canonical state is rejected rather than silently rebuilt from
stale compatibility fields.

The source-labelled static profile is selected when the race is created and is
saved with that race's canonical state. Updating an external configuration
cannot alter an already-running race; v3 restoration verifies that the saved
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

The deterministic continuation model is `2026.08.20.3`. An earlier model is
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
litres, or a claim about road area because physical width is unavailable. The
rubber ledger uses dimensionless `coverage-cell-lane` stock. Coefficients are
explicit neutral simulator policy; none is fitted per circuit.

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

No track in the shipped 2026 data receives a new static friction value in this
slice. Consequently, a normal existing race keeps its prior base-friction
input. A
test-only policy profile proves the live coupling without presenting an
invented circuit measurement as source data.

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
planar adapter for later chassis and surface work. It scales only the existing
horizontal layout to the declared lap length, validates a closed loop, and
exposes arc stations, tangents, normals, and signed horizontal curvature.
Elevation, grade, vertical curvature, banking, and usable width are explicitly
`unavailable`: render-space Y and render width are never reinterpreted as
physical measurements. Consumers must branch on the resolver's discriminated
availability result instead of receiving an invented neutral physical track.

## Physical-road input boundary

The legacy centreline's Y coordinate is a rendering/layout signal, not a
surveyed elevation profile. It is therefore excluded from the live vehicle
force path. Until a source-labelled metric elevation survey is supplied, live
road grade is explicitly unavailable and the only applied fallback is a
neutral grade fraction of `0`.

The existing banking windows and carriageway-width table remain for
compatibility with pre-existing simulator consumers, including racing-line,
lateral-layout, timing-map, qualifying, strategy, and race-occupation paths.
They are surfaced separately from physical provenance:

- physical banking and usable-width provenance is `unavailable`;
- a flat road uses a neutral-default fallback of `0 degrees` banking;
- the named Zandvoort/Madrid banking windows and the 13/10/15 m width values
  are labelled `legacy-simulator-policy`.

They must not be presented as an official, observed, or surveyed circuit
profile. `TrackDefinition.width` remains render-only and never supplies a
physical carriageway measurement. A future metric road survey can replace
these compatibility fallbacks only by carrying its own source, date, method,
and confidence metadata.

## Explicitly not yet operational

- Per-track roughness, drainage, evaporation, catchment, or runoff inputs;
- measured cell-by-cell water, rubber, temperature, or debris state;
- source-backed physical width, elevation, grade, banking, kerb, or runoff
  geometry;
- tyre relaxation/transient response, source-backed compound force
  coefficients, or an SF control-tyre physics model. SUPER FORMULA remains
  source-unavailable
  for those coefficients and does not reuse F1/Pirelli values.

`advanceTrackSurfaceCell` remains a narrow, bounded policy probe. The live race
uses the whole-state `advanceTrackSurface` flux-accounted update; callers must
not run the cell probe as a second evolution pass.

## Verification

Focused tests cover neutral/default behavior, wrap-around cell resolution,
lane selection, canonical serialize/deserialize round trips, water and rubber
flux closure, rain wash, local tyre work, traversal ordering, session carry,
checkpoint rejection, compatibility projection, local-force monotonicity, and
race-loop integration. `npm run validate:track-surface` also runs a deterministic
36-case matrix: Monaco, Monza, Singapore, Spa, Suzuka, and Zandvoort crossed
with green, rubbered, light-rain, heavy-rain, drying, and off-line scenarios.
The light- and heavy-rain probes use fixed 2 and 10 mm/h policy inputs.
The circuit names are coverage labels only: the generator uses the public
domain API, performs no fit or calibration, consults no holdout, and applies no
track-specific multiplier. Use `--no-report` to run the gate without writing
`artifacts/track-surface-validation/summary.json`. Existing full race
regression suites remain part of the release gate.
