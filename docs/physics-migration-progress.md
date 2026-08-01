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

Status: complete; commit pending at the time of this entry.

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

Status: pending.

Planned boundaries: category-keyed physical track profile; physical planning
limits in `trackDynamics`; actual energy-store deployment into `drivetrain`;
force integration in `vehicleDynamics`/`telemetry`; coherent persisted gear and
RPM; removal of legacy lap-time and speed calibration layers.

### Stage 3 - lateral state and driver decisions (Issue #5)

Status: pending.

Planned boundaries: continuous, width-constrained per-car lateral state;
racing/overtake/defence/avoidance/pit line choice; occupancy constraints;
seeded driver control and risk decisions; no direct ACE pace multiplier.

### Stage 4 - physics calibration and validation (Issue #6)

Status: pending.

Planned boundaries: documented physical/behavioural parameters, explicit
calibration/validation split, and metrics covering lap/vehicle/category,
energy, tyres, drivers, traffic, determinism and long-run stability.

### Stage 5 - cleanup and final verification

Status: pending.

Planned checks: repository-wide legacy-symbol classification, tests, lint,
typecheck, production build, playtests, multi-seed determinism/stability,
long-run finite-state checks, final diff/status, and no generated `dist` in a
commit unless it was already tracked.
