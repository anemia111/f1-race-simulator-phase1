# Physics migration progress

This file records the staged migration requested for Issues #4, #5 and #6 so
that implementation decisions and verification results survive a long-running
work session. It is a work log, not a source of calibration constants.

## Starting point

- Branch: `feat/physics-engine`
- Starting HEAD: `866309d`
- `master`: `0daeb61`
- Starting worktree: clean, four commits ahead of `master`
- Baseline verification: 64 test files / 685 tests passed; lint and
  `tsc -b --pretty false` passed.
- Only this repository is in scope. The initial instruction prohibited push;
  the later instruction "publish when finished" authorizes the repository's
  normal publish workflow only after all five stages and final checks. Force
  push and merge to `master` remain prohibited.

## Design boundaries

- `physicalLap` supplies geometry, corner-speed limits, a braking plan, a
  reference line and offline/reference validation. It must not overwrite live
  vehicle speed.
- Live speed is integrated from drivetrain force, braking, drag, tyre limits,
  load transfer, mass and road/aero state.
- Energy-system output passed to the drivetrain is actual permitted mechanical
  MGU-K power, after state-of-charge and thermal limits.
- `baseLapTime` remains a compatibility and operations datum, but is not an
  input to speed, force, physical-profile scaling, or progress.
- Driver differences act through decisions and control quality rather than a
  direct speed or acceleration multiplier.
- Calibration may change only parameters with a documented physical or
  behavioural meaning. It may not introduce per-circuit lap matching.

## Stages

### Stage 1 - drivetrain readiness

Status: complete; commit `3b15346`.

- Stateful turbo and clutch APIs, finite launch RPM/torque, and one RPM source
  for gear selection and force are implemented.
- `CarSnapshot` carries optional turbo spool and clutch engagement so old saves
  remain readable. New races start with both states at zero.
- Checkpoint validation accepts missing legacy fields and validates present
  values as finite fractions.
- Live use of these states and removal of old display RPM remain deliberately part
  of Stage 2, where the full production path is connected.

Verification:

- Focused drivetrain, physical-lap, tyre-force and checkpoint tests: 84 passed.
- Full suite: 64 files / 697 tests passed.
- `npm run lint`: passed.
- `npx tsc -b --pretty false`: passed.
- `git diff --check`: passed (line-ending conversion warnings only).

### Stage 2 - production physics path (Issue #4)

Status: complete; commit `2017cf4`.

- `trackDynamics` is now a category-keyed wrapper over `physicalLap`. It
  exposes curvature, effective radius, banking, physical line, live-relevant
  lateral geometry and braking-target geometry without rescaling to
  `baseLapTime`.
- The reference terminal/deployment envelope remains explicitly offline. Live
  speed is never copied from it: `telemetry` turns physical limits and
  operational ceilings into pedal requests, and `vehicleDynamics` integrates
  drivetrain force, drag, grade, mass, braking and the tyre friction ellipse.
- Actual mechanical Energy Store deployment enters the MGU-K exactly once.
  SOC and thermal limits change live acceleration independently. ICE/OTS,
  MGU-K, clutch, turbo, gear, RPM and contact-patch force share one drivetrain
  evaluation.
- Live lateral and forward braking limits are recalculated for current fuel
  mass, regulatory mass, team/setup, air density, dirty-air downforce, tyre and
  surface grip. Surface water has one grip path; tow affects drag only.
- Live gaps and neutralisation spacing use metric arc distance and road speed,
  not `baseLapTime`. Tyre wear advances from physical distance. Blue flags
  shape throttle instead of multiplying post-physics travel.
- F1/SF have separate mass, tyre, aero, PU, gearbox and deployment
  profiles and separate cached reference profiles. Running cars at a clamped
  zero road speed retain first gear and finite launch/idle RPM.
- Removed the old raw speed factor, 68/395 clamp, 12.5/44 envelope, 20-pass
  base-lap scaling, +38 km/h straight boost, internal acceleration scale,
  top-gear efficiency falloff, `power / speed` live drive force, duplicate
  wet/fuel/traction/brake speed factors and display-only gear/RPM path.

Verification:

- Focused race/track/profile/vehicle regression: 217 passed.
- Full suite: 65 files / 720 tests passed in 532.93 s.
- `npm run lint -- --deny-warnings`: passed.
- `npx tsc -b --pretty false`: passed.
- `git diff --check`: passed (line-ending conversion warnings only).
- Legacy Stage 2 symbol search: no production matches.

### Stage 3 - lateral state and driver decisions (Issue #5)

Status: complete; commit `29b28de`.

- Each car now stores canonical lateral offset, velocity and desired offset in
  physical metres. Checkpoint migration accepts the deprecated render alias,
  while the scene converts metres using the published track-width dataset
  rather than the render-only `width` field.
- Lateral motion is continuous and bounded by track edges, vehicle footprint,
  lateral speed and acceleration. Deterministic reservations and rectangular
  occupancy prevent cars from teleporting through one another; longitudinal
  passing completes only after real lateral clearance exists.
- Seeded per-driver decisions select reference, attack, defence, tow,
  dirty-air avoidance, emergency and pit lines. Driver skills and style affect
  pedal timing, pressure/opening, line accuracy, attempts, mistakes and contact
  risk. Overall/ACE metadata can participate in the documented construction,
  import, migration, duplicate selection and profile-selection paths; after a
  profile is materialized and selected, it is not reread as a runtime speed or
  lap-time multiplier.
- Dirty air and tow depend on physical lateral alignment. Contact requires a
  physical longitudinal/lateral opportunity, and a pass is recorded only when
  integrated positions cross.
- Qualifying and practice now use physical category/team/setup lap simulations.
  Driver separation is a bounded control-execution adjustment sampled over the
  same decision windows. It can become negative only when an above-100
  limit-break profile recovers part of the physical reference's transient
  concession. Named performance and energy-skill paths saturate at 100, so that
  bounded recovery is the only runtime owner of authored excess; there is no
  `baseLapTime`, ACE gain or old seconds stack.
- A stopped on-track incident is an explicit immobilised state. Followers
  choose a continuous avoidance line under yellow before occupancy permits
  them through. SC/VSC/yellow speed ceilings remain operational controller
  targets and are not applied a second time as a driver pace multiplier.

Verification:

- Focused driver/lateral/traffic/SC/qualifying regressions: passed.
- Full suite: 70 files / 768 tests passed in 713.06 s.
- `npm run lint -- --deny-warnings`: passed.
- `npx tsc -b --pretty false`: passed.
- `git diff --check`: passed (line-ending conversion warnings only).

### Stage 4 - physics calibration and validation (Issue #6)

Status: complete.

- `physicsCalibration` holds the calibration policy: a parameter allow-list
  with a classification, unit, scope and sanity bounds for each entry.
  Regulatory and published inputs are catalogued with `calibratable: false` so
  a report can name them without a tuning pass being able to move them.
  `validatePhysicsCalibrationCandidates` rejects `trackId`, `eventId`,
  `baseLapTime`, `paceScale` and `lapTimeMultiplier` outright, along with
  duplicates, out-of-range values and category/global scope mismatches. The
  module contains no optimiser and writes no production data.
- `F1_PHYSICS_VALIDATION_SPLIT` fixes a five-circuit calibration set and a
  six-circuit holdout set. `compareLapTimes`, `rankCategoryPace` and
  `buildPhysicsValidationReport` are read-only comparisons against the
  checked-in observations, and `REQUIRED_VALIDATION_DOMAINS` forces a report to
  declare a metric — or an explicit unavailable reason — for lap/vehicle
  speed, acceleration, braking, fuel mass, wet pace, deployment, state of
  charge, tyres, driver dispersion, overtakes, contact, finishing, seed
  determinism and long-run stability.
- The retired per-track controller multipliers `liveTimingPaceScale`,
  `racePaceScale` and `qualifyingPaceScale` are gone from the type, the
  runtime, the validator and the checked-in data: 57 values were removed from
  26 records in `src/data/calibration/f1PaceCalibration2026.json`, and
  `validatePaceCalibrationRecords` now rejects the keys instead of
  range-checking them. `update-pace-calibration` drops them when preserving
  previous simulation metadata, so an observation refresh cannot reintroduce a
  track-specific pace backdoor.
- The parallel lap-time delta stack that fed the retired scales is removed:
  `projectedLapTime`, `lineDeviationPenaltySeconds`, `packFollowingLapTime`,
  the dirty-air/restart/setup/component seconds terms and
  `telemetry.performanceDeltaSeconds` no longer exist on the live path. Live
  gaps convert penalty-adjusted arc distance with road speed, and timed-session
  traffic uses metres and physical speed rather than `baseLapTime`.
- `docs/physics-calibration.md` records the policy, the parameter register with
  physical meaning and sensitivity per parameter, and the separate operational
  and behavioural constant register.

Verification:

- Full suite: 69 files / 767 tests passed in 814.10 s.
- Focused race/timed-session regression after the gap fix: 153 passed.
- `npx oxlint --deny-warnings`: passed.
- `npx tsc -b --pretty false`: passed.

Known limits:

- `projectedLapTime` is now a per-track/category reference datum rather than a
  per-car projection. Recorded lap times come from actual timing-line crossings
  and are unaffected; only the pre-lap projection column is less specific.
- `baseLapTime` survives in scheduling and display roles (formation lap length,
  safety-car spacing, practice program duration, `fuelEffectSeconds`). None of
  these feed speed, force or progress.

### Stage 5 - cleanup and final verification

Status: complete in the 2026-08-29 closure batch.

Final checks cover repository-wide legacy-symbol classification, tests, lint,
typecheck, production build, playtests, multi-seed determinism/stability,
long-run finite-state checks, final diff/status, and no generated `dist` in a
commit unless it was already tracked. The release gate remains the canonical
source of the final counts for each publication.
