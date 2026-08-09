# F1 2026 Straight Mode / Corner Mode

This document fixes the Phase 3 implementation and evidence boundary for the
2026 F1 driver-adjustable front and rear bodywork. It does not describe DRS,
Overtake, or the fixed-aero Super Formula car.

## Authority and evidence boundary

The source cut-off is 2026-08-08. Technical Issue 20 supplies the two-position
front/rear bodywork and 400 ms transition constraint. The FIA 2026 overview
confirms that Straight Mode moves both elements, reduces overall drag and is
separate from Overtake. FIA event maps own the activation geometry.

The source manifest also records one FIA driver transcript and three public
research references for qualitative wake, balance, ride-height and active-aero
methodology. They do not publish a 2026 constructor aero map. Consequently:

- regulatory positions, transition limit and official zones are fixed inputs;
- all numeric force-map coefficients are labelled `category-level-prior-only`;
- no coefficient was inferred from a lap time, speed trap, target top speed,
  team result, circuit residual or holdout observation;
- the FIA generation-level 55% drag and 30% downforce comparisons are not used
  as Corner-to-Straight coefficients.

The exact URLs, dates, PDF hashes, licences and limitations are in
`artifacts/source-manifest.json`. Runtime force results carry the corresponding
source IDs and assumption-set ID.

## State and runtime ownership

`ActiveAeroState` persists the front and rear straight fractions, command,
transition, activation-zone ID and failure state in `CarSnapshot`. The race
checkpoint parser validates the complete shape and migrates older snapshots to
Corner Mode. Resuming a checkpoint preserves an in-flight transition.

For each live telemetry tick:

1. eligibility resolves a Corner, partial-front or full-Straight command;
2. `advanceActiveAeroState` advances each element continuously;
3. the resulting fractions enter longitudinal force integration in that same
   tick;
4. the UI enum is derived only as a compatibility display value.

Both elements settle within 0.4 s. A moving car cannot command Straight Mode
outside an activation zone. Low Grip can retain only an explicitly mapped
partial-front operation and disables Overtake. A detected bodywork failure,
pit/retirement state or controlled rejoin returns both fractions to the
Corner-safe state. Straight Mode eligibility never reads the following-car gap;
Overtake eligibility remains a separate electrical/race-control input.

## Decomposed force model

Let `sf` and `sr` be the front and rear straight fractions in `[0,1]`, `q =
rho V^2 / 2`, and `r(x,s) = 1 - (1-x)s` be retention interpolation. Front and
rear areas are calculated separately:

```text
Af_drag = A_drag * share_f_drag * r(retain_f_drag, sf) * setup/ride/yaw/tow
Ar_drag = A_drag * share_r_drag * r(retain_r_drag, sr) * setup/ride/yaw/tow

Af_load = A_load * balance_f * r(retain_f_load, sf) * ride/pitch/yaw/wake_f
Ar_load = A_load * balance_r * r(retain_r_load, sr) * ride/pitch/yaw/wake_r

Df = q * Af_drag       Dr = q * Ar_drag
Lf = q * Af_load       Lr = q * Ar_load
```

Pitch changes the bounded front balance before deployment. Ride-height, pitch
and yaw penalties are quadratic and clamped. The existing wake observation is
applied with different bounded front/rear exponents, while tow changes drag but
not load. During travel, `sin(pi * transitionProgress)` creates a bounded drag
penalty and load loss that are zero at both settled positions. Every returned
force contains its structural fractions, modifiers, assumptions and provenance.

The F1 prior is `f1-2026-decomposed-active-aero-prior-v1`. Its coefficients are
engineering priors, intentionally category-wide and narrowly bounded by team
machine ratings. Provenance reports `confidence: low`, `validationStatus:
prior-only` and `publicCoefficientRange: null`; the latter must remain null
rather than turning a different car's CFD result into a fictitious F1 range.
Super Formula uses `sf-2026-fixed-aero-prior-v1`; its straight fractions are
forced to zero, so F1 active aero cannot leak into SF runtime.

The offline qualifying/reference lap uses
`activeAeroReferenceAreaMultipliers`. That pure adapter uses the same front/rear
decomposition at neutral setup, pitch, yaw and wake. It changes both drag and
load in declared zones and uses Corner Mode under braking. The former aggregate
`straightAeroDragMultiplier` and `partialAeroDragMultiplier` fields no longer
exist.

## Activation-zone source policy

An available FIA event map is authoritative, including an empty Straight Mode
list such as Monaco. Its runtime source is `official`. The map projection uses
published turn anchors and offsets; repeated labels can select an explicit
zero-based occurrence, which keeps the Hungaroring Turn 1A anchor distinct from
Turn 1.

Without an official event map, a candidate may be emitted only as
`geometry-derived-estimate`. The estimator uses a published lap length to turn
the surveyed centerline into metres, then screens continuous low-curvature runs
for estimated lateral load, usable distance, the preceding corner exit, next
braking point, a 400 ms transition margin, width, pit-entry/exit conflict and
start/finish crossing. A failed physical screen returns no estimate; there is
no longest-segment fallback. Each accepted zone stores confidence and a
human-readable basis. The 300 km/h value is only a conservative transition and
lateral-load screening assumption, not a vehicle speed target.

If official operations are later added, `aeroActivationZonesWithOfficialOverride`
automatically replaces every estimate. Estimated data is never relabelled
official.

Fuji, Motegi, SUGO and Autopolis currently expose geometry estimates for an F1
car selected on those physical tracks in Free Mode. Their `runtimeScope` is
`f1-free-mode`; they are not SF Straight Mode zones and do not change SF OTS.

## Verification and open evidence

Run:

```bash
npm run validate:f1-current-generation
npm run validate:active-aero-zones
```

The first gate proves durable continuous state, transition/failure invariants,
an actual live-race transition probe, decomposed forces and absence of the
legacy scalar. The zone audit proves official precedence and records the
human-readable basis for every Japanese Free Mode estimate. Both artifacts
retain `fitPerformed: false` and `trackSpecificMultiplierCount: 0`.

The Phase 3 driven speed-trap check exits 1: median MAE/bias are 14.44/-12.77
km/h and peak MAE/bias are 15.79/-14.77 km/h. All four aggregate gates fail and
seven circuit IDs exceed the outer bound. This is an observational failure, not
a licence to reverse-solve the prior. No coefficient changed after seeing it.
The aggregate-only record is
`artifacts/f1-current-generation-physics-summary.json`; detailed per-circuit
values are not committed.

No public observation currently resolves team-specific front/rear coefficients,
transition traces or bodywork force maps. Those domains remain prior-only. A
future validation must use independent force/balance/transition evidence and
freeze its protocol before looking at holdout results; circuit lap residuals
cannot be used to tune this model.
