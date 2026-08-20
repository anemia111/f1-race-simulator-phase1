# Phase 6 local track-surface substrate

## Status and scope

This is the first Phase 6 implementation slice. It introduces a deterministic,
two-lane local-surface substrate and connects it to the live race force path.
It does **not** claim that Phase 6 as a whole is complete: source-backed
elevation/banking, physical-width ingestion, tyre transient/relaxation,
chassis response, and circuit-scenario validation remain separate follow-up
slices.

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
simulation authority. The historic three-sector fields remain projections for
existing UI and session-rule consumers, so they can be removed only after
those consumers have a direct two-lane API.

## Compatibility and force coupling

`advanceRace` restores the canonical two-lane state at the start of a tick and
projects its racing-line sectors into the established water and rubber update
functions. Those functions run exactly once. Their result is then projected
back into a fresh canonical state, from which the compatibility sector fields
are regenerated. The racing-line values therefore retain the established
inputs; the off-line lane gets only a bounded, `simulator-policy`
loose-rubber proxy until local observations exist.

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

## Provenance boundary

`TrackDefinition.surfaceProfile` is optional and requires a non-empty label
and one of `official`, `observed`, or `simulator-policy`. Its global or
wrap-aware progress sections can currently supply only `baseFriction`.
Malformed or unlabelled provenance fails closed to neutral `1.0` friction.

No track in the shipped 2026 data receives a new friction value in this slice.
Consequently, a normal existing race keeps its prior racing-line result. A
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

- Per-track roughness and drainage inputs;
- source-backed cell-by-cell water, rubber, temperature, or debris evolution;
- source-backed physical width, elevation, grade, banking, kerb, or runoff
  geometry;
- tyre relaxation/transient response, source-backed compound force
  coefficients, or an SF control-tyre physics model. SUPER FORMULA remains
  source-unavailable
  for those coefficients and does not reuse F1/Pirelli values.

`advanceTrackSurfaceCell` is a bounded, deterministic pure update used to test
water balance and future cell-evolution work. It is intentionally not presented
as a sourced circuit-drainage model and is not called by the live race loop;
calling it alongside the established sector updates would double-count water
and rubber changes.

## Verification

Focused tests cover neutral/default behavior, wrap-around cell resolution,
lane selection, legacy-sector reconstruction, canonical serialize/deserialize
round trips, bounded rain/drainage response, provenance fail-closed behavior,
v2 checkpoint hydration, v3 corruption rejection, compatibility projection,
local-force monotonicity, and a race-loop profile integration. Existing
water/rubber and full race regression suites remain part of the release gate.
