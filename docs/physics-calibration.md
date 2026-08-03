# Physics calibration and validation

## Policy

Calibration is allowed to change a parameter only when the parameter has a
physical or behavioural meaning outside a lap-time target. Validation is a
read-only comparison between the resulting model output and an independent
observation. The implementation is in
`src/simulation/physicsCalibration.ts`; it contains no optimiser and does not
write to production data.

The following are prohibited:

- forcing a lap to `baseLapTime` or any other target;
- a circuit-, event- or test-specific lap-time/pace multiplier;
- changing a parameter after looking at its holdout error;
- fitting one car, driver, race result or random seed individually;
- restoring the removed target-speed coefficient stack under new names.

Circuit geometry, measured circuit width and a documented banked section may
differ by circuit. They are road inputs, not calibration coefficients. A car's
mass, power, tyre and aerodynamic parameters do not change merely because the
track ID changes.

`PHYSICS_CALIBRATION_PARAMETERS` is an allow-list and a range validator, not an
application or fitting API. Regulatory and published inputs appear in it with
`calibratable: false`; this makes reports classify them without permitting a
tuning pass to move them.

## Parameter register

Current values live in their owning physics/decision modules. Bounds below are
sanity bounds accepted by the reporting API, not uncertainty claims and not
targets.

| Parameters | Class / scope | Unit and allowed range | Current F1 examples | Physical meaning and use | Evidence and sensitivity |
| --- | --- | --- | --- | --- | --- |
| `combustionPowerKw`, `hybridDeploymentPowerLimitKw`, `minimumMassKg`, `gearCount`, `maximumEngineRpm` | regulatory limit / category, fixed | 100-1000 kW; 0-500 kW; 500-1000 kg; 4-10; 6000-20000 rpm | 400 kW; 350 kW; 768 kg; 8; 15000 rpm | Legal PU, mass and transmission boundaries used directly by the drivetrain and force integration | Regulation-derived. Power and mass have high longitudinal/lap sensitivity; gear count and the rev ceiling mainly constrain available ratios. They must be updated from a rule/source, not fitted. |
| `wheelRadiusM`, `wheelbaseM`, `trackWidthM` | published geometry / category, fixed | 0.25-0.45 m; 2.5-4 m; 1.5-2.2 m | 0.36 m; 3.6 m; 2.0 m | Convert road speed to crank RPM and determine longitudinal/lateral load transfer | Published/measured geometry. Wheel radius has high RPM/gearing sensitivity; wheelbase and track width have medium load-transfer sensitivity. |
| `dragAreaScale`, `liftAreaM2` | inferred physical property / category | 0.4-1.5 ratio; 1-8 m2 | 1.0; 5.0 m2 | Aerodynamic drag and vertical load, both proportional to dynamic pressure | Derived because teams do not publish full coefficients. High sensitivity to maximum speed and fast-corner/lap time respectively. Validate against speed traps and corner traces when those observations exist. |
| `drivetrainEfficiency`, `rollingResistanceCoefficient` | inferred physical property / category | 0.75-0.99; 0.005-0.03 | 0.94; 0.012 | Mechanical and rolling losses in the longitudinal force balance | Engineering estimates. Efficiency has medium/high acceleration sensitivity; rolling resistance is low at high speed and more visible at low speed. |
| `peakTyreFrictionCoefficient`, `tyreLoadSensitivity` | inferred physical property / category | 0.8-2.5; 0-0.3 exponent | 1.75; 0.12 | Size and load dependence of the shared friction ellipse | Derived from plausible category lateral/braking capability. Both have high corner, braking and lap sensitivity. Must be checked across loads rather than against one lap time. |
| `centreOfGravityHeightM`, `maximumBrakeDecelerationMps2` | inferred physical property / category | 0.15-0.65 m; 10-60 m/s2 | 0.30 m; 49.05 m/s2 | Load transfer geometry and brake-system ceiling | Engineering estimates. Medium tyre-utilisation and high braking-distance sensitivity. |
| `topGearDesignSpeedKph`, `gearSpread`, `peakTorqueRevFraction` | inferred physical property / category | 220-450 km/h; 2-6 ratio; 0.4-0.9 | 402 km/h; 4.0; 0.70 | Defines physical gear ratios and the ICE torque-curve shape | Vehicle-design estimates. High RPM/acceleration sensitivity, medium lap sensitivity; never a top-speed clamp or track correction. |
| `RACING_LINE_REALISATION` | global model-resolution correction | 0-1 ratio | 0.28 | Prevents the roughly 33 m centreline sampling and theoretical line widening from counting the same radius gain twice | Global geometry-resolution assumption. High corner-radius/lap sensitivity. It may change only with a resolution study, never per circuit. |
| `DRIVER_TRANSIENT_EFFICIENCY` | global behavioural efficiency | 0.8-1 ratio | 0.97 | Represents the transient grip that a quasi-steady point mass cannot sustain continuously | Global point-mass limitation. High lap and corner sensitivity. It is not an ace/driver bonus. |

The catalogue also provides machine-readable classification, units, bounds and
scope. A candidate with `trackId`, `eventId`, `baseLapTime`, `paceScale` or
`lapTimeMultiplier` is rejected at runtime. Duplicate parameters, category
values without a category, global values with a category, fixed inputs and
out-of-range values are also rejected.

### Operational and behavioural constant register

Not every numeric constant is a calibratable car property. The remaining
state-transition, safety and stochastic constants are listed separately so
they cannot become an undocumented second calibration layer.

| Owner | Current values and units | Scope / role | Evidence, sensitivity and change rule |
| --- | --- | --- | --- |
| `drivetrain.ts` launch | launch RPM 0.38 of rev limit; clutch bite 0.35 engagement; MGU-K base speed 0.35 of rev limit | Current global defaults with category RPM/gear inputs | Engineering shape assumptions. High standing-start and low-speed force sensitivity, little steady-lap sensitivity. A category-specific override needs published motor/clutch evidence. |
| `drivetrain.ts` turbo | spool time constant 0.55 s at zero rev, falling linearly to 0.13 s at the limiter; lift decay 0.30 s | Stateful combustion response, category physical behaviour | Commented engineering estimate. High throttle-transient sensitivity; zero effect on electrical torque. Validate against time-resolved acceleration, never lap time alone. |
| `drivetrain.ts` clutch | engagement time constant 0.48 s; release 0.16 s; numerical floor 0.02 s | Stateful standing launch, category physical behaviour | Engineering estimate. High launch sensitivity. Must remain continuous and traction-limited in the launch tests. |
| `physicalLap.ts` reference deployment | category MGU-K limit whenever the offline planner requests full acceleration | Explicit offline policy, category | Not a live SOC assumption or calibration. Live deployment comes from `energySystem.ts`; comparing this reference with a race requires that limitation to be stated. |
| `vehicleGeometry.ts` footprint | width 1.90 m; length 5.20 m; track-edge margin 0.25 m; lateral margin 0.35 m; longitudinal margin 1.25 m | Published/inferred geometry and global collision envelope | Width is regulation-derived; length and margins are conservative simulation envelopes. High occupancy/contact sensitivity, no clear-air lap sensitivity. Category-specific geometry should replace these when sourced. |
| `lateralDynamics.ts` response | maximum lateral speed 2.8 m/s; acceleration 4.0 m/s2; target response 0.25 s | Global lateral-control dynamics | Behavioural/engineering assumptions. High pass, defence and avoidance sensitivity. Validate with lane-change traces; do not fit finishing order. |
| `driverDecision.ts` sampling | 12 decision windows per lap | Global algorithmic/behavioural resolution | Low-frequency deterministic choice boundary. High reaction opportunity sensitivity on very short/long circuits; the same seed/window remains reproducible. A time- or distance-based replacement needs a separate design change. |
| `driverDecision.ts` base error | `0.002 + 0.055(1-consistency) + 0.040(1-awareness) + 0.035(1-control precision) + 0.026(aggression x risk)` | Global formula producing per-driver behaviour | Behavioural prior, not observed calibration. High mistake dispersion/contact sensitivity. Requires driver/incident samples before numeric calibration. |
| `vehicleDynamics.ts` dirty air | active below 2.5 s in corners; loss coefficient 0.115; minimum multiplier 0.88; lateral wake width 3.2 m | Team-informed aerodynamic interaction | Engineering assumption. High following-corner sensitivity. Requires paired-car aero/telemetry; never use a circuit lap residual. |
| `vehicleDynamics.ts` tow | active through 1.8 s on sufficiently straight road; coefficient `0.105 + 0.075 x team rating`; cap 0.19; lateral wake width 2.8 m | Team-informed aerodynamic interaction | Engineering assumption. High closing-speed/overtake sensitivity. Requires speed-trap pairs at measured gaps. |
| `overtaking.ts` incident tuning | driver-error scale 0.40; base contact 0.022; opening/restart/corner additions 0.040/0.030/0.022; straight reduction 0.010; base crash 0.055; opening/restart additions 0.035/0.025; crash-detail weight 0.040; attacker/defender retirement 0.55/0.20 | Global behavioural/operational risk model | Existing stochastic prior. Very high contact, finish-rate and neutralisation sensitivity. No checked observed target currently supports tuning it, so it remains unvalidated rather than being adjusted to one race. |
| integration resolution | longitudinal internal step 0.10 s; lateral substep 0.05 s with a 3 s catch-up cap; energy step 0.50 s | Global numerical method, not calibration | Must be tested by convergence and finite-state checks. It must not be changed to improve an observational score without demonstrating numerical error. |

Track-width overrides and published banked sections are circuit-scoped physical
inputs. Their source/placement limitations are documented in `physicalLap.ts`;
they are intentionally absent from the calibration candidate API. Team machine
ratings and individual driver skill/style data are model inputs, while the
formulas that map them to forces and decisions are category/global parameters.
No per-driver result correction is present in this register.

## Checked observational data

The validator reads the existing files; it does not fetch or manufacture data:

- `src/data/calibration/f1PaceCalibration2026.json`: 26 F1-series records,
  including four explicit cross-category course references. Eleven have an
  official 2026 qualifying result and ten have an observed race sample.
  Fifteen qualifying and sixteen race sections are estimated rather than
  observed. All ten observed races contain compound medians and a derived tyre
  degradation field; none contains an observed fuel-gain value.
- `src/data/calibration/f1PaceCalibration2026.json` also carries an optional
  `speed` section on eleven records: the observed 2026 straight-line peaks from
  OpenF1 car telemetry, plus the published FIA speed-trap values. The two are
  kept apart deliberately. The trap is a fixed point on one straight, so it is
  context and never a peak: the Suzuka 2026 race trap read 308 km/h while the
  same cars peaked at 349 km/h elsewhere on the lap. A circuit whose sessions
  have not run carries no section rather than an estimate.
- `src/data/calibration/superFormulaPaceCalibration2026.json`: five records.
  Four have official qualifying results; none has an observed race sample.
  Suzuka supplies the one common official F1/SUPER FORMULA category-order
  check.

The physical reference lap is closest to a clear qualifying lap: minimum mass
plus the planner's explicit fuel allowance, dry reference grip and the
documented offline deployment policy. Observed race medians contain fuel,
traffic, tyre, neutralisation and strategy effects, so they are retained as
future live-race validation data and are not substituted for a force-model
qualifying target.

The JSON schema still carries legacy compatibility fields named
`liveTimingPaceScale`, `racePaceScale`, `qualifyingPaceScale` and
`raceModelCorrectionSeconds`. This validator does not read any of them. They
are neither calibration candidates nor physical evidence, and their presence
in old data must not be interpreted as approval for runtime use. The legacy
pace-calibration scripts that write those fields are outside this read-only
workflow and must not be used to calibrate the new physical model.

No checked independent target currently exists for maximum or minimum corner
speed, 0-100/0-200 acceleration, braking distance, fuel-mass slope, wet pace,
deployment delta, SOC depletion, driver dispersion, overtake or contact rate,
finish rate/order, seed reproduction or long-run stability. The race-derived
tyre fields are genuine observations, but they combine fuel, traffic, compound
selection and stint position and do not measure the generic grip perturbation
printed by this validator; treating those unlike quantities as a matched pair
would be less honest than leaving tyre accuracy unavailable. Model diagnostics
may be printed for some domains, but without a compatible target their
validation `status` is `unavailable`, `observedValue` is `null`, and `value` is
`null`. That distinction prevents a plausible-looking model output from being
misreported as measured accuracy.

## Fixed calibration/holdout split

Only records whose qualifying status is `official` enter the split. Estimated
future rounds and cross-category estimates enter neither side.

| Calibration (available for model-development analysis) | Holdout (never use to choose a value) |
| --- | --- |
| Albert Park | Shanghai |
| Suzuka | Montreal |
| Miami | Monaco |
| Barcelona | Silverstone |
| Red Bull Ring | Spa |
|  | Hungaroring |

This is a limited split, not a statistically independent season. All samples
are completed dry-qualifying references from the same year. There are not
enough wet, long-run or traffic observations to create honest secondary
training/validation splits; those domains remain unavailable instead.

## Metrics

For each observed circuit, with predicted time `p` and observed time `o`:

- lap ratio is `p / o`;
- signed error is `p - o` seconds;
- percentage error is `(p / o - 1) * 100`;
- MAPE is the mean absolute percentage error;
- the worst and smallest errors are selected by absolute seconds;
- the fastest prediction is reported separately so it is not confused with
  the smallest error.

Category ranking uses total distance divided by total time over an identical
set of circuits. Supplying different circuit sets is rejected. The current
script uses Suzuka for all four categories and separately checks the observed
F1/SUPER FORMULA ordering there.

Other validation domains use an explicit evidence pair. A result is
`available` only when both a model value and an independent observed value are
provided with a positive sample count. Missing observations are never replaced
with a zero, estimate, expectation or test tolerance.

## Current read-only result

Run on 2026-08-01 against the checked-in official qualifying observations:

| Set | Samples | Mean lap ratio | MAPE | Mean absolute error |
| --- | ---: | ---: | ---: | ---: |
| Calibration | 5 | 0.9962 | 1.79% | 1.42 s |
| Holdout | 6 | 0.9887 | 3.84% | 3.39 s |
| Overall | 11 | 0.9921 | 2.91% | 2.49 s |

The overall largest absolute error is Silverstone: -5.33 s (-6.04%). The
smallest is Hungaroring: -0.40 s (-0.52%). These are outputs, not per-track
corrections. The Suzuka model ranking is F1, SUPER FORMULA, F2, F3; the shared
official F1/SUPER FORMULA observation has the same order.

### Straight-line speed

Run on 2026-08-02 against the eleven observed qualifying peaks:

| Metric | Value |
| --- | ---: |
| Circuits compared | 11 |
| Mean absolute error | 23.23 km/h |
| Bias | +23.23 km/h |
| Worst | Silverstone +41.7 km/h |
| Best | Hungaroring +2.7 km/h |

**The model is too fast on every circuit compared**, which is why the bias
equals the mean absolute error. This is reported, not corrected: the causes are
physical parameters, and changing them is a separate piece of work from
establishing the observation.

`npm run validate:speed-trap` measures the same thing through full driven laps
rather than reference laps, and separates qualifying from race trim. Its four
aggregate gates now pass: median mean absolute error 7.66 km/h and peak
7.64 km/h against a limit of 8, with biases of -1.08 and -3.10 against a limit
of +/-5. Silverstone remains too fast and Hungaroring too slow by more than the
18 km/h per-circuit bound.

That took four parameters, applied together because each alone moves the error
to the other side: the straight-mode active aero multiplier from 0.47 to 0.639,
the tow ceiling from 19 % to 7 %, the setup drag range from 0.68-1.25 to
0.86-1.14, and the FIA speed-based MGU-K ramp, which was declared in
`FIA_2026_REGULATION_PROFILE` and read by nothing.

Nine tests asserted top speeds of 375 to 400 km/h and were rewritten against
the checked-in telemetry, where field peaks span 291 km/h at Monaco to 360 at
Barcelona. They were reading `topGearDesignSpeedKph` as a target the car should
approach; this document already records it as "never a top-speed clamp", and
`physics-migration-progress.md` records the 395 figure as a clamp the migration
removed. The tests had kept it. One further test drained the Energy Store at
355 and 390 km/h, which the deployment ramp does not permit, so nothing
drained; it now deploys at 280 and judges clipping at 340. Its baseline is checked in at
`qa/speed-trap-2026/master-baseline-speed-trap.json`.

That run also exposes a defect that the per-circuit reference-lap comparison
does not reach, because it only covers circuits with an observation: on the
longest straights the longitudinal model has no terminal velocity. A full race
lap currently peaks at **842 km/h at Baku** and **626 km/h at Montreal**. The
FIA 2026 speed-based MGU-K de-rate is the mechanism that should bound it;
`standardDeploymentCutoffKph` and `overtakeDeploymentCutoffKph` are declared in
`FIA_2026_REGULATION_PROFILE` and are currently read by nothing.

The model-only Suzuka perturbations currently report a +1.70% lap for the
heavier mass case, +22.34% for the 0.70 wet-grip case, +9.15% with deployment
removed and +4.57% for a 0.92 tyre-grip case. Because there is no independent
observed target in the checked data for those perturbations, all four remain
`unavailable / null` as accuracy metrics.

## Running the validator

```text
node scripts/validate-physics-calibration.mjs
```

The command prints JSON and leaves the repository unchanged. To preserve an
explicit report outside the default workflow:

```text
node scripts/validate-physics-calibration.mjs --output=<path>.json
```

The output records `fitPerformed: false` and
`trackSpecificMultiplierCount: 0`, plus separate calibration, holdout and
overall results. Structural problems (missing official samples, overlap,
duplicate predictions, non-finite values or unequal category circuit sets)
fail the command. Accuracy errors are reported, not automatically tuned away.

## Failure classification

When a validation fails, classify it before editing code or a test:

- **A - physics regression:** a physical invariant or previously supported
  observation has regressed. Fix the model.
- **B - legacy target-speed assertion:** the test fixes behaviour from the
  removed target-speed/calibration stack. Replace it with a physical or
  behavioural expectation.
- **C - tolerance issue:** independent evidence supports the model and only an
  unjustifiably narrow numeric tolerance failed. Document the evidence before
  changing the tolerance.
- **D - public interface break:** preserve the interface or provide a
  migration/default where practical.
- **E - double counting:** the same power, loss, grip or behaviour acts in two
  layers. Remove one owner.
- **F - nondeterminism:** the same seed and initial state diverge. Fix ordering
  or RNG ownership.
- **G - missing data:** retain `unavailable / null`; do not invent a target.
- **H - known physical limitation:** document the limitation and add the
  smallest physically meaningful model improvement rather than a result
  multiplier.

Future work should add provenance-bearing speed traps, corner traces,
acceleration/braking tests, wet-session comparisons, energy traces and
multi-race traffic statistics. Those observations can populate the existing
evidence fields without changing the no-fit reporting architecture.

## Pit stop stationary time

The per-stop variance was a uniform band 1.8 s wide. A uniform draw cannot
describe a pit stop: it adds half its width to every stop, so the crew's own
capability stops being the floor and the tail stops at a fixed ceiling. Against
148 observed 2026 race stops the model's median sat at 3.54 s against 3.20, its
tenth percentile at 2.74 against 2.40, and its quickest possible stop at 2.16
against an observed 2.00.

It is now an exponential draw of mean 0.78 s, which has a floor and a tail. The
modelled median lands on the observed 3.20 s and the tenth percentile falls to
about 2.6.

`F1_PIT_STOP_STATIONARY_OBSERVATIONS_2026` records the observed figures per
session. Only the lower half of that distribution is a calibration target. A
five- or ten-second penalty is served with the car stationary in its box and
OpenF1 records the whole stop, so the observed p90 of 7.8 s is mostly penalties
rather than slow pit work, and the simulation already models penalties
elsewhere. Matching that tail would count them twice.

### Crew ratings

`pitCrewSpeed` used to come off the DHL fastest-stop award. Winning frequency
ranks the grid but says nothing about how many seconds separate first from
last, so the ratings were compressed into a band 0.19 wide, and through
`crewSpreadSeconds` that put the whole grid 0.76 s apart.

They are now the inverse of the model that consumes them, taken against each
team's observed lower quartile, and the grid spans 1.10 s. Fetching the OpenF1
`drivers` endpoint for the six race sessions is what made this possible; it
supplies the driver-to-team mapping the pit endpoint lacks.

The quartile is the calibration statistic rather than the median for the same
reason the pooled tail is not a target. Team medians span 1.80 s, which is the
1.5 to 2 s the audit quoted, but that spread is partly penalties: a team with
two penalties in fourteen stops has its median dragged up by something its crew
did not do. The lower quartile sits clear of the affected eighth of the sample.

Two consequences beyond the spread. The order is now the measurement's rather
than the award's, so Red Bull and McLaren are no longer assumed to be at the
front of it. And Cadillac has a rating at all: absent from the award table, it
had been taking the neutral baseline, which put a crew that is second slowest
in the observed data into midfield.

Sample sizes are 8 to 18 stops per team. This is ranking evidence with a scale
attached, not a precise per-team time.
