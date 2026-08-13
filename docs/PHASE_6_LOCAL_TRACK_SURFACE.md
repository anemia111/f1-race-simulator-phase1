# Phase 6 local track-surface substrate

## Status and scope

This is the first Phase 6 implementation slice. It introduces a deterministic,
two-lane local-surface substrate and connects it to the live race force path.
It does **not** claim that Phase 6 as a whole is complete: physical track
geometry, sourced elevation/banking, tyre-transient force coupling, brake
hardware capacity, and chassis response remain separate follow-up slices.

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

## Explicitly not yet operational

- Per-track roughness and drainage inputs;
- direct cell ownership/persistence across race ticks;
- source-backed physical width, elevation, grade, banking, kerb, or runoff
  geometry;
- tyre temperature, wear, graining, and relaxation-state effects on the live
  force envelope;
- temperature-dependent brake hardware capacity;
- an SF control-tyre physics model. SUPER FORMULA remains source-unavailable
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
