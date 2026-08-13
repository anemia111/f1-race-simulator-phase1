# F1 2026 current-generation physics

This document describes the regulatory boundary for the live
`f1-2026-current` vehicle. It is not a description of the validation-only
`f1-2025-tpc` car and none of its rules may be selected for Super Formula.

## Frozen authority

The source cut-off is 2026-08-08. The effective base set is:

| Section | Current issue | Published | Source ID |
| --- | --- | --- | --- |
| Sporting B | 08 | 2026-08-05 | `fia-f1-2026-sporting-b08` |
| Technical C | 20 | 2026-08-05 | `fia-f1-2026-technical-c20` |
| Operational F | 10 | 2026-08-05 | `fia-f1-2026-operational-f10` |

All three were approved by the WMSC on 2026-08-03. Exact URLs, retrieval
metadata and document hashes are frozen in `artifacts/source-manifest.json`.
An event instruction can override only the rule and scope delegated to it; an
observation or simulator policy cannot override an official rule.

## Chassis and mass

Technical C2.3.3 limits wheelbase to 3400 mm. The current physics profile uses
the public maximum, 3.400 m, without claiming that every constructor homologated
that exact dimension.

Technical C4.1 does not define one 768 kg current-generation minimum:

- Sprint Qualifying and Qualifying: 726 kg + FIA Nominal Tyre Mass.
- Every other session: 724 kg + FIA Nominal Tyre Mass.
- The applicable C4.6 Heat Hazard addition is added separately.

`resolveMinimumVehicleMass()` therefore requires the nominal-tyre input and
returns an explicit `unavailable` result when it is absent. It never derives a
tyre mass by subtracting 724 or 726 from the old 768 kg simulator reference.
Technical C4.7 assigns the measurement to the tyre provider using new
production dry-weather tyres (50-tyre samples per axle), with publication after
the final pre-Championship TCC opportunity and remeasurement after a
specification change; Appendix C1 defines the rounded set value. Technical C20
does not publish the resulting number, so a separate provider publication is
required before the input can be resolved.
The force model's transitional mass reference is labelled non-regulatory at
its call sites; it is not exposed as the C4.1 minimum.

## ERS-K power authority

`permittedMguKDcPowerKwForSpeed()` is the single pure C5.2.7/C5.2.8 DC-power
authority. After evaluating the selected curve it applies the absolute 350 kW
cap.

Normal, with Overtake inactive:

```text
v < 340 km/h       1800 - 5v kW
340 <= v < 345     6900 - 20v kW
v >= 345           0 kW
```

Overtake active:

```text
v < 355 km/h       7100 - 20v kW
v >= 355           0 kW
```

The specified Race/Sprint power-limited state:

```text
v < 310 km/h       250 kW
310 <= v < 340     1800 - 5v kW
340 <= v < 345     6900 - 20v kW
v >= 345           0 kW
```

The competition-specific low-grip curve in `FIA-F1-DOC-111` is not public.
The runtime therefore represents it as unavailable and fails closed; it does
not substitute a guessed 250 kW curve. Low Grip also disables Overtake.

## Energy and start gates

- C5.2.9 constrains the usable Energy Store maximum-to-minimum SOC window to
  4 MJ. The UI percentage is derived from the MJ state.
- C5.2.10 provides the public 8.5 MJ/lap recharge ceiling. Event information
  may reduce the ordinary competition value to 7 MJ. SQ/Q event values may be
  lower, with the current Issue 20 floor fixed at 4 MJ and the Sporting B08
  event-count constraint retained as authority metadata.
- Under C5.2.12, normal positive MGU-K torque during a standing launch remains
  blocked below 50 km/h. Reaching 50 km/h is latched for that launch. The SECU
  low-power safety exception is a separate state and does not pretend the
  normal threshold was crossed.

## Active aero and Overtake

The current era has no DRS state. Front and rear driver-adjustable bodywork use
the regulation's Corner Mode and Straight Mode terminology. Commands are
stateful, transitions complete in no more than 400 ms, a deployment command is
accepted only while stationary or in an Activation Zone, and a failure returns
both elements to the Corner-safe state. Straight Mode eligibility is independent
from Overtake eligibility.

Phase 3 persists the continuous front/rear fractions in every live race
snapshot and checkpoint. The telemetry tick advances that state before the
longitudinal force integration, so transition fractions—not a display enum—own
the front/rear drag and downforce forces. The old aggregate Straight-Mode drag
scalar has been removed from the category profile and from the offline lap.
Failure, pit, retirement and rejoin paths reset both elements to Corner-safe.

The force model and its category-prior limitations are specified in
`docs/F1_ACTIVE_AERO_STRAIGHT_CORNER_MODE.md`. Its live path includes separate
front/rear drag and load, balance shift, bounded ride-height, pitch, yaw, wake
and transition effects. The offline reference lap uses the same decomposition
at a neutral category point and returns to Corner Mode for braking; it does not
infer a coefficient from a lap time or top speed.

Normal Grip may use full Straight Mode in a mapped activation zone. Low Grip
disables full Straight Mode and Overtake; only the explicitly mapped partial
front-bodywork operation can remain available. Missing official event inputs
stay unavailable or are separately labelled geometry-derived estimates.
Official event maps always replace estimates, including an authoritative empty
list such as Monaco. The geometry audit covers physical curvature, continuous
straight distance, transition margin, braking boundary, width, pit conflicts
and start/finish operation. Japanese non-F1 circuits expose those estimates
only to an F1 car in Free Mode; Super Formula continues to use fixed bodywork
and OTS.

## Calibration boundary

These regulatory values are fixed inputs, not calibration parameters. The gate
must retain `fitPerformed: false` and `trackSpecificMultiplierCount: 0`.
Neither `baseLapTime`, a circuit-specific pace factor nor an observed target
speed may rewrite them.

The Phase 3 driven speed-trap validation is not green: median MAE/bias are
14.44/-12.77 km/h and peak MAE/bias are 15.79/-14.77 km/h, so all four
aggregate gates fail. Seven circuits exceed the outer bound. The structural
runtime and zone gates nevertheless pass. Public authority does not supply a
2026 constructor force map, so this failure did not trigger a circuit
correction, target-speed inversion or coefficient change. The decomposed
coefficients remain explicitly prior-only pending independent force evidence.

Run the focused gate with:

```bash
npm run validate:f1-current-generation
npm run validate:active-aero-zones
```

The generated reports are `artifacts/f1-current-generation-gate.json` and
`artifacts/active-aero-zone-audit.json`.
