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
The state has a strict serializable form and rejects malformed persisted input.
`trackSurfaceAt` resolves the car's normalized progress and lateral offset to
a cell and lane. A grid slot remains on the racing line; the off-line lane
starts only outside the bounded lateral threshold.

The arrays use `Float64Array` during this compatibility stage. That preserves
the exact numeric values carried by the existing three-sector checkpoint
fields while the runtime has two representations. A later checkpoint migration
may choose a compact persisted representation only together with an explicit
schema/version change.

## Compatibility and force coupling

The pre-existing sector water, drying-line, and rubber fields remain the
checkpoint authority. On every simulation step, `advanceRace` deterministically
materializes the local state from those fields. The racing-line values therefore
reproduce the old inputs; the off-line lane gets only a bounded,
`simulator-policy` loose-rubber proxy until local observations exist.

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
window remains neutral for compatibility. The same temperature-limited ceiling
also bounds the Energy Store's braking-recovery and friction-brake prediction,
so it cannot credit unavailable brake torque before the live force solve. The
policy intentionally makes no claim about team-specific disc, pad, duct, or
cooling data.

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
- direct cell ownership/persistence across race ticks;
- source-backed physical width, elevation, grade, banking, kerb, or runoff
  geometry;
- tyre relaxation/transient response, source-backed compound force
  coefficients, or an SF control-tyre physics model. SUPER FORMULA remains
  source-unavailable
  for those coefficients and does not reuse F1/Pirelli values.

`advanceTrackSurfaceCell` is a bounded, deterministic pure update used to test
water balance and future ownership migration. It is intentionally not presented
as a sourced circuit-drainage model and is not yet the live checkpoint state.

## Verification

Focused tests cover neutral/default behavior, wrap-around cell resolution,
lane selection, legacy-sector reconstruction, bounded rain/drainage response,
serialization rejection, provenance fail-closed behavior, local-force
monotonicity, and a race-loop profile integration. Existing water/rubber and
full race regression suites remain part of the release gate.
