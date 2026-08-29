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
| `combustionPowerKw`, `hybridDeploymentPowerLimitKw`, `gearCount`, `maximumEngineRpm` | regulatory limit / category, fixed | 100-1000 kW; 0-500 kW; 4-10; 6000-20000 rpm | 400 kW; 350 kW; 8; 15000 rpm | Legal PU and transmission boundaries used directly by the drivetrain | Regulation-derived. Power has high longitudinal/lap sensitivity; gear count and the rev ceiling mainly constrain available ratios. They must be updated from a rule/source, not fitted. |
| `otherSessionBaseKg`, `qualifyingBaseKg` | regulatory limit / category, fixed | 724 kg; 726 kg | C4.1: 724 kg + Nominal Tyre Mass for other sessions; 726 kg + Nominal Tyre Mass for Sprint Qualifying/Qualifying | Session-aware base for the vehicle minimum-mass resolver | FIA Technical C4.1. Nominal Tyre Mass is a separately named FIA event input determined under C4.7; it is unavailable until observed and is never a calibration candidate or inferred from an old all-in mass. Heat-hazard added mass is passed separately. |
| `wheelRadiusM`, `wheelbaseM`, `trackWidthM` | published geometry / category, fixed | 0.25-0.45 m; 2.5-4 m; 1.5-2.2 m | 0.36 m; 3.4 m maximum; 2.0 m | Convert road speed to crank RPM and determine longitudinal/lateral load transfer | C2.3.3 caps wheelbase at 3.400 m. The model uses that public maximum without claiming a team's shorter homologated dimension. Wheel radius has high RPM/gearing sensitivity; wheelbase and track width have medium load-transfer sensitivity. |
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
| `categoryPhysics.ts` unresolved-mass policy | 768 kg historical simulation reference | F1 force-model continuity only; explicitly `non-regulatory-simulation-reference` | Used only while FIA C4.7 Nominal Tyre Mass is unavailable. It is not serialized or displayed as the C4.1 minimum. Supplying a named event observation switches the operational resolver to 724/726 kg + Nominal Tyre Mass; heat-hazard mass is added once on either path. |
| `drivetrain.ts` launch | launch RPM 0.38 of rev limit; clutch bite 0.35 engagement; MGU-K base speed 0.35 of rev limit | Current global defaults with category RPM/gear inputs | Engineering shape assumptions. High standing-start and low-speed force sensitivity, little steady-lap sensitivity. A category-specific override needs published motor/clutch evidence. |
| `drivetrain.ts` turbo | spool time constant 0.55 s at zero rev, falling linearly to 0.13 s at the limiter; lift decay 0.30 s | Stateful combustion response, category physical behaviour | Commented engineering estimate. High throttle-transient sensitivity; zero effect on electrical torque. Validate against time-resolved acceleration, never lap time alone. |
| `drivetrain.ts` clutch | engagement time constant 0.48 s; release 0.16 s; numerical floor 0.02 s | Stateful standing launch, category physical behaviour | Engineering estimate. High launch sensitivity. Must remain continuous and traction-limited in the launch tests. |
| `physicalLap.ts` reference deployment | category MGU-K limit, bounded by the exact speed curve and an event-aware mechanical allowance; 3 allocation passes and 5 trim passes | Explicit offline policy, category | Verified event recharge (or the labelled 7 MJ no-event reference policy) is measured at the CU-K bus; the 4 MJ SOC window is stored energy. Both are converted through the neutral battery/inverter/motor chain before becoming one mechanical allocation. They are never added directly. The pass counts are numerical convergence, not tuning. Live deployment remains owned by `energySystem.ts`. |
| `physicalLap.ts` reference active aero | declared `aeroActivationZones`; neutral front/rear Corner/Straight area decomposition for both drag and load; Corner Mode under braking | Explicit offline policy, category | Uses `activeAeroReferenceAreaMultipliers`, the neutral adapter for the same front/rear category prior as the driven force path. No target speed, circuit factor or aggregate Straight-Mode scalar is present. `trackDynamics.buildProfile` opts out with `activeAeroZones: false` because it is a geometry classifier, not a lap. |
| `vehicleGeometry.ts` footprint | width 1.90 m; length 5.20 m; track-edge margin 0.25 m; lateral margin 0.35 m; longitudinal margin 1.25 m | Published/inferred geometry and global collision envelope | Width is regulation-derived; length and margins are conservative simulation envelopes. High occupancy/contact sensitivity, no clear-air lap sensitivity. Category-specific geometry should replace these when sourced. |
| `lateralDynamics.ts` response | maximum lateral speed 2.8 m/s; acceleration 4.0 m/s2; target response 0.25 s | Global lateral-control dynamics | Behavioural/engineering assumptions. High pass, defence and avoidance sensitivity. Validate with lane-change traces; do not fit finishing order. |
| `driverDecision.ts` sampling | 12 decision windows per lap | Global algorithmic/behavioural resolution | Low-frequency deterministic choice boundary. High reaction opportunity sensitivity on very short/long circuits; the same seed/window remains reproducible. A time- or distance-based replacement needs a separate design change. |
| `driverDecision.ts` base error | `0.002 + 0.055(1-consistency) + 0.040(1-awareness) + 0.035(1-control precision) + 0.026(aggression x risk)` | Global formula producing per-driver behaviour | Behavioural prior, not observed calibration. High mistake dispersion/contact sensitivity. Requires driver/incident samples before numeric calibration. |
| `vehicleDynamics.ts` dirty air | active below 2.5 s in corners; loss coefficient 0.115; minimum multiplier 0.88; lateral wake width 3.2 m | Team-informed aerodynamic interaction | Engineering assumption. High following-corner sensitivity. Requires paired-car aero/telemetry; never use a circuit lap residual. |
| `vehicleDynamics.ts` tow | active through 1.8 s on sufficiently straight road; coefficient `0.105 + 0.075 x team rating`; cap 0.19; lateral wake width 2.8 m | Team-informed aerodynamic interaction | Engineering assumption. High closing-speed/overtake sensitivity. Requires speed-trap pairs at measured gaps. |
| `vehicleDynamics.ts` F1 active-aero force prior v1 | front/rear load and drag shares/retentions; bounded ride-height, pitch, yaw, wake and 400 ms transition sensitivities, returned with `category-level-prior-only` provenance | Category-level structural prior | FIA sources establish the mechanism and regulatory geometry, while public research supports decomposition and sensitivity axes. None publishes a 2026 team aero map, so every coefficient is an explicit uncalibrated bounded prior. Validate with independent force/balance/transition observations if they become available; never solve it from a top speed or circuit residual. |
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

The physical reference lap is closest to a clear qualifying lap: the explicit
operational vehicle-mass resolution plus the planner's fuel allowance, dry
reference grip and the documented offline deployment policy. Until an FIA
C4.7 Nominal Tyre Mass observation is supplied, that resolution is visibly a
non-regulatory simulation reference rather than a claimed C4.1 minimum.
Observed race medians contain fuel, traffic, tyre, neutralisation and strategy
effects, so they are retained as future live-race validation data and are not
substituted for a force-model qualifying target.

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

Run on 2026-08-29 against the same checked-in official qualifying
observations. Parameter selection and structural investigation used only the
five-circuit calibration split. The holdout was read once after the code and
the unchanged 5.0 m2 lift-area value were fixed.

| Set | Samples | Mean percentage bias | Mean absolute error |
| --- | ---: | ---: | ---: |
| Calibration | 5 | +0.813% | 1.181 s |
| Holdout | 6 | +0.091% | 2.646 s |
| Overall | 11 | — | 1.980 s |

The structural defect was in reference MGU-K allocation. A segment had been
ranked by only its immediate local seconds per joule, so the allocator ignored
speed carried into downstream parts of a long acceleration run and overvalued
short low-speed exits. The allocator now removes each segment's deployment,
resolves the complete closed lap, and ranks the complete-lap marginal benefit.
The forward sweep also permits negative net acceleration from drag instead of
treating terminal-equilibrium speed as an instantaneous pointwise cap.

On the calibration split this reduced lap MAE from 1.329 to 1.181 s, peak MAE
from 11.8 to 3.4 km/h, and peak bias from -11.8 to +0.9 km/h; modelled peak
spread increased from 5.1 to 8.3 km/h against 15 km/h observed. No production
coefficient moved. The one-time holdout MAE improved from 3.02 to 2.646 s. The
overall observed-peak MAE is 7.527 km/h with +3.919 km/h bias.

The executable Suzuka comparison is F1 versus SUPER FORMULA; former F2/F3
records are driver-pool history and are not physical validation categories.
The shared official F1/SUPER FORMULA observation has the same order.

### Straight-line speed

The current 2026-08-29 aggregate is reported above (MAE 7.527 km/h, bias
+3.919 km/h). The table and investigation below are the 2026-08-04 historical
baseline that led to active-aero and energy-budget work; they are retained to
show why the rejected hypotheses must not be repeated.

Historical run against the eleven observed qualifying peaks:

| Metric | 2026-08-02 | Now |
| --- | ---: | ---: |
| Circuits compared | 11 | 11 |
| Mean absolute error | 23.23 km/h | 7.82 km/h |
| Bias | +23.23 km/h | +6.64 km/h |
| Modelled peak range | 323.4-325.6 km/h | 319.0-345.3 km/h |

The reference lap now reads the circuit's declared active-aero zones, so the
range is the interesting column. It used to span 2.2 km/h across a calendar
whose observed peaks span 55: the lap ran the closed-wing drag area
everywhere, one terminal speed served every circuit, and modelled peak speed
carried no circuit information at all. It now spans 26.3 km/h. That is still
half the observed spread, but it is the first version of this model that can
tell a long straight from a short one.

The deployment allowance is what makes that spread real rather than a shifted
constant. Reading the aero zones alone moves the ceiling and the car still
reaches it nearly everywhere, which is what the earlier investigation found:
peaks spread 10.8 km/h and the bias merely crossed zero. Once reaching the
ceiling costs energy the lap has to take from somewhere else, only the
circuits that can afford it get there.

`npm run validate:speed-trap` is unchanged to the last reported digit -
median mean absolute error 7.66 km/h and peak 7.64, biases -1.08 and -3.10 -
because it measures driven laps and nothing on that path moved. See below for
why it must not be moved to close the gap above.

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

## Pit lane loss per circuit

The loss was one number for all twenty-four circuits. The comment above it
explained why: the only per-circuit input available was pit lane geometry, and
every track carries the same placeholder for it, so deriving a loss from that
would have dressed a placeholder up as a measurement.

The OpenF1 pit endpoint measures the lane directly. Pooling
`lane_duration - stop_duration` over the fetched race sessions gives a median
transit for seventeen of the twenty-two F1 circuits, spanning 15.02 s at
Zandvoort to 25.79 s at Lusail.

A circuit is positioned against the mean of those medians, never against an
absolute time, so the calendar-wide level stays where it was set and only the
differences are observed. The difference is scaled by
`PIT_LANE_LOSS_PER_TRANSIT_SECOND`: a longer lane costs more time in the lane
but also replaces a longer stretch of track, and the loss keeps
1 - limit/racing of the difference, which is three fifths at an 80 km/h limit.
Using the raw lane-time difference would overstate the spread by about two
thirds. Modelled losses now run 13.6 s to 20.0 s.

Five circuits have no row and take the base. Monaco and Silverstone are the
unfortunate ones, being known outliers.

### A transit time is not a loss

`TrackObservedCalibration.pitLaneTransitSeconds` was being fed straight in as
the loss whenever live telemetry had been fetched. It is a lane time, which is
about three and a half seconds longer, so a fetched session silently moved the
pit stop. Both observed paths now go through the same conversion, and
`pitLaneLossSecondsForTrack` is the single place the race and the pit wall read
it from - they had been duplicating the expression.

The same trap is still live in the calibration data. `pitLaneLossSeconds` in
`f1PaceCalibration2026.json` holds the median `lane_duration`, including the
stationary time, while `openF1Performance.ts` subtracts the stop for the same
concept. Nothing reads the JSON field today, which is the only reason it has
not caused a bug.

## The qualifying calibration loop could not converge

`calibrate-race-pace.mjs` adjusted `neutralBaseLapSeconds` by the difference
between simulated and reference qualifying pace, once per iteration, stopping
when that difference fell below 0.015 s. It never could. Qualifying lap times
come from forces and do not read `baseLapTime` at all - the doc comment on
`timedPhysicalLap` says so, and it is now held to that by a test in
`paceReference2026.test.ts`, which runs the same session at 60 s, 120 s and the
real value and gets identical lap times to the millisecond.

So the loop moved a number with no influence on the quantity it measured. The
error never changed, the break never fired, and every pass added the same error
again. With two iterations per call and two calls per run, running the script
would have moved every base lap time by up to 31 s.

It now reports rather than adjusts, and what it reports is a real finding:

| | error |
| --- | ---: |
| Baku | +7.9 s |
| Monza | +6.2 s |
| Spa | +6.1 s |
| Silverstone | +6.0 s |
| Madrid | -4.8 s |
| Shanghai | -3.4 s |
| Lusail | -3.0 s |

Positive is the simulation running fast. That is the same straight-against-
corner axis the reference-lap holdout shows, on the same circuits, and it is
much larger than the 2.65 s holdout figure because a driven qualifying session
compounds what a single reference lap only hints at. No base lap time can
absorb it.

### The provenance label claimed more than it had

`baseLapTimeSource` was `2026-reference` whenever a pace reference existed, and
every circuit has one, so every circuit claimed it - including the sixteen
whose own race record says `estimated`. It now follows the record.

`baseLapTime` itself is left alone. It no longer sets pace anywhere; what still
reads it are timing scales - safety-car durations, session budgets, the pit
wall's projected position. For that purpose it is about 6 % quicker than an
observed green-flag lap on every one of the ten measured events, which is a
separate question from this one.

## Reference laps spent two and a half times the MGU-K energy the rules allow

Measured on 2026-08-03, fixed on 2026-08-04; the section below the measurement
records what the fix was. `deployment-energy-budget` is a validation domain, so
the number is in the report rather than in a note.

`REFERENCE_DEPLOYMENT_POLICY` granted the category deployment limit wherever
full power was requested and said so plainly: it "deliberately has no
state-of-charge, harvesting or lap strategy", and a live simulation "must
instead pass the power authorised by its Energy Store". Qualifying is a live
session and did not. `qualifying.ts` passed
`categoryPhysics.hybridDeploymentPowerLimitKw` straight through, so every
modelled qualifying lap deployed as if the Energy Store were bottomless.

Integrating the permitted power over the segments where the finished lap gains
speed gives what each lap actually spends. All eleven measured circuits exceed
the limit, averaging 2.38 times it:

| | MJ per lap | against a 7 MJ qualifying limit |
| --- | ---: | ---: |
| Shanghai | 20.00 | 2.86x |
| Spa | 18.79 | 2.68x |
| Suzuka | 18.57 | 2.65x |
| Miami | 17.25 | 2.46x |

A real car deploys full power for roughly a third of its accelerating time.
This one does it for all of it.

### What this does and does not explain

It does not explain the per-circuit spread. Simulated qualifying runs from
7.9 s fast at Baku to 4.8 s slow at Madrid, and the energy figures do not
follow that at all - Shanghai and Madrid spend the most and are the two
slowest. Enforcing a budget would not close it.

It does bear on the mean. The same twenty-two circuits average 2.5 s fast, and
an eleven-megajoule overspend is worth several seconds of lap time, so the
level and this are plausibly the same finding.

## The allowance, and where a lap spends it

The budget is enforced by `REFERENCE_DEPLOYMENT_POLICY`, using
`regulation-energy-budget-by-marginal-value`. Phase 4 corrected the accounting
boundary: the regulatory recharge value is CU-K HV DC-bus energy, whereas the
offline lap spends MGU-K mechanical energy. The two are no longer added as if
they were the same quantity.

### How much a lap may spend

The inputs now remain at their own measurement boundaries:

| Input | Boundary | Resolution |
| --- | --- | --- |
| Event maximum Recharge | CU-K HV DC bus | Verified event Power Unit Information; unavailable when the context is missing |
| Reference fallback | CU-K HV DC bus | Explicit simulator reference policy of 7 MJ, based on the FIA 2026-04-20 explanatory release; not labelled a binding event value |
| Usable SOC window | Stored Energy Store energy | Fixed 4 MJ under C5.2.9 |
| Offline deployment allowance | MGU-K mechanical energy | Both inputs converted through battery, inverter, and motor losses before allocation |

The verified Suzuka table supplies 8.0 MJ for Qualifying, so its reference
attack lap differs from the no-event 7 MJ policy. There is no universal
FIA-exact `7 + 4 = 11 MJ` attack-lap value.

The recharge limit alone is the bound on a lap repeated forever in a steady
state. The reference lap is documented as the opposite of that - a single
clear qualifying lap - and a driver on that lap empties the store and banks
nothing for the next one. Both observations it is compared against are single
clear laps too: official Q3 times and qualifying telemetry peaks. Comparing a
steady-state lap with attack-lap evidence would be the same category error as
comparing a race median with a reference lap, which this document already
refuses to do elsewhere.

`energySystem.ts` caps recovery at the CU-K bus, stores less after battery
loss, removes more from the store than the bus receives during deployment,
and delivers less mechanical power after inverter and motor losses. The
offline reference applies the same ordering with a documented team-neutral
conversion profile.

Validation reports must therefore identify the event/policy recharge source,
the CU-K input, the converted mechanical allowance, and the actual mechanical
spend separately. A single unlabeled `allowanceMj` is no longer sufficient.

### Where it spends it

The rule is the marginal one: the allowance goes where it buys the most lap
time per joule. At constant power the extra force is `P/v`, so a segment's
value works out proportional to its length over the cube of its speed, and the
allowance drains into slow corner exits and runs out before the top end of a
straight. That is where a real driver spends it, and it is why spending it
evenly was the wrong comparison.

Two things fall out of ranking by measured value rather than by speed alone. A
traction-limited exit is skipped, because electrical power the tyres cannot
put down buys nothing. So is anything above the regulation's speed ramp,
because there is no power to spend there.

The ranking is taken once, from the fully deployed profile, so it cannot chase
its own output around in a circle. Only the point where the allowance runs out
is re-costed against the slower profile the allocation produces, three times,
and a trim pass then gives back the few hundred joules that re-costing leaves
overspent. The segment the allowance runs out on takes the share it can pay
for rather than being switched off, so the speed profile stays continuous.

### The legacy straight-line scalar was rejected and then removed

The following is retained only as a historical rejected-experiment record. The
field no longer exists in a production category profile and these values must
not be rerun as candidates for the decomposed active-aero model.

After both fixes the reference lap is 6.64 km/h fast at the peak and its lap
error is scatter around zero, which looks like an invitation to re-cut
the legacy `straightAeroDragMultiplier`. A past calibration-split sweep gave a
numerical joint optimum near 0.56:

| legacy scalar | Calibration lap MAE | Reference peak MAE | Peak bias |
| ---: | ---: | ---: | ---: |
| 0.639 (then-current) | 1.43 s | 11.14 km/h | -7.82 km/h |
| 0.60 | 1.32 s | 8.16 km/h | -3.71 km/h |
| 0.56 | 1.27 s | 7.17 km/h | +0.75 km/h |
| 0.52 | 1.28 s | 8.85 km/h | +5.04 km/h |

It was not taken. The scalar was shared with the driven path, and at 0.56
`validate:speed-trap` fails three of its four aggregate gates: median mean
absolute error 9.73 km/h against a limit of 8, median bias +5.16 against
+/-5, and peak mean absolute error 8.99 against 8. Driven laps are the
independent evidence that invalidated that apparent optimum.

Phase 3 therefore removed the scalar rather than declaring either historical
value correct. Live forces now resolve front and rear drag/load separately and
the offline reference uses the same decomposition at a neutral point. The
coefficients remain category priors, not fitted values. Any residual remains an
open validation problem and cannot be paid for with drag, energy, or a circuit
correction from a non-matching observation.

### One profile is not a lap

`trackDynamics.buildProfile` takes neither the allowance nor the aero zones,
and passes `deploymentEnergyBudgetMj: null` and `activeAeroZones: false` to
say so. It is a geometry classifier: the live model reads it for corner class,
straightness, full-throttle sections and braking severity, and its own doc
comment already says live speed must come from force integration.

Both opt-outs have the same reason. An allowance inside it would put two
energy plans in series when `energySystem.ts` already owns the live one. Aero
zones inside it would make `cornerClass`, which is cut at fixed speeds, depend
on whether a flap opens on the straight before the corner - and since the
zones are declared per track, the classifier would be reading back its own
input.

This is not a detail. Letting the aero zones into that profile is worth
0.70 km/h on the speed trap's median mean absolute error, which is enough to
take it from 7.66 to 8.36 and fail the gate, without anything on the driven
force path having changed at all.
