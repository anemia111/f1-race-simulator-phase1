# Physics Engine Rewrite

Status: in progress. Base commit `0daeb61` on `master` is the rollback point:
621 tests, lint, build and playtest all green, published as `20260801T042703Z`.

## Why

The simulator is asked to be a real physical model: aerodynamic drag, tyre
resistance, downforce, lateral G, a real engine, and cars that each decide how
to drive. The longitudinal axis is already close to that. The lateral axis is
not modelled at all, and a calibration layer overrides the physics that does
exist.

## The inversion at the centre of it

Today the engine computes a **target speed** and then moves the car toward it:

```
referenceSpeedKph  (curvature heuristic, rescaled to hit track.baseLapTime)
  × paceScale × flagPaceScale × machineCapability × driverExecution
  × dirtyAirMultiplier × gripSpeedMultiplier × fuelCornerMultiplier
  × preparationPaceScale
  = racingTargetSpeedKph
```

A physical engine runs the other way: forces produce acceleration, acceleration
produces speed, and lap time is whatever falls out. Every item below exists
only to serve the target-speed direction, so each one is either deleted or
replaced by the force that should have produced it.

## Delete list

| # | What | Where | Replaced by |
|---|---|---|---|
| 1 | `baseLapTime` iterative rescale (20 passes) | `trackDynamics.ts` | Nothing. Lap time becomes an output, not an input. **This is the blocker for everything else.** |
| 2 | `rawSpeedFactor` curvature heuristic | `trackDynamics.ts:80` | Corner speed solved from lateral G against tyre load and downforce |
| 3 | `MIN_REFERENCE_SPEED_KPH` / `MAX_REFERENCE_SPEED_KPH` constants | `trackDynamics.ts:24` | Physical limits: grip at the low end, power vs drag at the high end |
| 4 | The seven-multiplier target-speed stack | `telemetry.ts:302` | Each becomes a force: machine → power and CdA, driver → braking point and throttle, dirty air → wake aero loss, grip → tyre load |
| 5 | `MACHINE_INTERNAL_PERFORMANCE_SCALE = 1.06` and `internalAccelerationScale` | `vehicleDynamics.ts:52` | Nothing. A fudge uplift applied at three sites with three different ratios and no physical basis |
| 6 | `longStraightTargetHeadroomKph` | `telemetry.ts:299` | Nothing. Straight-line speed already follows from power against drag |
| 7 | Segment-probability battle resolution | `overtaking.ts` | Overtakes resolved from geometry once cars have lateral position |
| 8 | `ACE_PACE_THRESHOLD` / `ACE_PACE_GAIN` / `ACE_PACE_MAX_GAIN` / `ACE_RACE_PACE_MAX_GAIN` | `vehicleDynamics.ts:48` | Driver skill expressed as braking point, throttle application and line choice. **Approved for deletion, but only in the same change that adds the replacement** — see the note below |

## Duplication found while surveying

**Engine RPM is computed but not used.** `categoryEngineRpmForSpeed` produces an
RPM for the dashboard, while drive force is `powerKw / v`, which makes output
independent of engine speed and gearing. Two representations of the same thing,
only one of which is physical. A torque curve with real gear ratios collapses
them into one number.

## Order of work

Tyres first: both axes need the same load-sensitive force model, and building
the lateral axis on the old percentage grip would mean doing it twice.

1. Tyre force model — vertical load from mass plus downforce, longitudinal and
   lateral force from a friction ellipse, load transfer under braking and
   cornering
2. Engine torque curve, gear ratios, final drive
3. Lateral dynamics; remove the `baseLapTime` rescale
4. Lateral position, per-car braking and line decisions, geometric overtaking
5. Re-derive the calibration against the observational references

## Constraints that have to change

`CLAUDE.md` and `CLAUDE_HANDOFF.md` both state that cars stay on one racing
line with no lateral movement, and that per-frame domain calculation should
stay cheap. Step 4 retires the first. The second becomes a budget question
rather than a prohibition, and the fixed-tick worker already isolates the cost
from rendering.

Determinism is **not** dropped. A force-based engine on a fixed tick with
seeded randomness stays reproducible, and the existing seed helpers still own
every random draw.

## What this invalidates

Most per-circuit and per-category calibration constants, and the tests that
assert them, encode the behaviour of the target-speed model. They are rewritten
in step 5 against the observational references rather than carried forward.

`origin/drag-calibration-wip` (`959e022`) holds an observationally calibrated
drag model — CdA against 2026 OpenF1 speed-trap data, a corrected tow reduction,
and the FIA speed-based MGU-K de-rate. Its physics is sound and its speed-trap
errors are 1-13 km/h. It was left out of the base because its lap-time
calibration was never re-run: all ten observed circuits came out slow, mean
absolute error 0.886 s with a uniform +0.886 s bias. Fold the physics into step
5 and derive the calibration there rather than re-tuning it twice.
