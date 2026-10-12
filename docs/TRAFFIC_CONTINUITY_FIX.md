# Six-category traffic continuity

The user reported abrupt stops during ordinary driving as well as after starts.
Short full-field reproductions showed GT/WEC/INDYCAR cars dropping from roughly
90–180 km/h to zero in one 0.1 s tick, and F1/SF occupancy corrections causing
large 0.05 s speed drops. KYOJO is covered by the same corrected execution path.

## Changes

- Following checks all cars in the occupied corridor, so an adjacent-lane car
  cannot hide a slower same-lane car. Native following uses physical arc metres.
- Separate-lane merges retain braking room: safety-expanded body length plus
  0.35 s at the greater road speed, 0.6 s of closing speed and closing-speed
  squared / 8. The latter is a SIM 4 m/s² relative braking allowance. These are
  simulator policies, not measured driver reaction or regulatory requirements.
  Cars already sharing a corridor may steer out; physical swept-body protection
  still applies. Outward escapes and genuinely clear passes remain available.
- Extra categories now propose motion for the entire field, resolve lateral
  sweeps then longitudinal occupancy against accepted neighbour movement, and
  only then settle travel-dependent fuel, tyres, telemetry and timing. This
  removes the old projection from a neighbour's previous speed. Clipped travel
  limits speed to accepted average travel rather than applying
  `2 * distance / dt - oldSpeed`, which generated alternating zero-speed ticks.
- Both engine families synchronize retained handling coordinates after road-edge
  or traffic steering constraints. Unaccepted inward motion no longer reappears
  from stale internal lateral position/heading on the next tick.
- F1/SF traffic, occupancy and grid placement use signed unwrapped profile arc
  metres, with an inverse conversion for retained profile progress. Uneven
  centreline point spacing and timing-line wraps no longer change body clearance.
  Native standing launch retains a 4.5 s launch allowance; the previous 10 s
  following blind period is removed.
- Normalized negative-zero telemetry fields now survive compact save round trips
  exactly. This pre-existing serialization discrepancy surfaced during timing
  regression checks.

## Short verification

- `trafficContinuity.test.ts`: all six full fields through 16 s of start/corner
  motion; separate two-second mid-race packs at three positions including the
  timing line; monotonic travel, no >18 km/h per-tick drops in these fixtures,
  and no body overlaps in mid-race packs. Also checks merge/escape and signed
  physical-coordinate round trips on all native tracks.
- Launch/restart, lateral/longitudinal occupancy, rolling starts, operational
  following, extra traffic, class grids, pits, sectors, common solver and short
  compute checks: 109 tests across 12 suites pass.
- Timed courtesy fixtures now place their 35/70 m gaps in physical arc metres.
  All 47 short FP/Q/SQ passing and blue-flag train tests pass (156 total focused
  checks). After the final extra road-edge state synchronization, the affected
  61-test subset also passes. TypeScript, lint and diff whitespace checks pass.
- Launch minimum-speed guards were stale before this patch: HEAD already reached
  approximately 85 km/h in the normal three-second launch and 70 km/h in the
  SC-prepared restart fixture after finite pedal/style changes. Guards now allow
  that existing pace while retaining abrupt-stop and monotonic-travel assertions.
- The existing coarse one-second SF qualifying equal-car lap-spread test remains
  an independent known failure: approximately 43 s spread on both HEAD and this
  patch. It is not counted as passing or repaired by this traffic change.

These checks do not establish all-course pace calibration, endurance stability
or sustained browser FPS. No long race/full-suite/playtest run was requested.
Publish with the standing user exception:
`npm run publish -- -SkipFullTestSuite -SkipPlaytest`.
