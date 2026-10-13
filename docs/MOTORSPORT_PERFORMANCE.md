# Large-field motorsport performance

SUPER GT and WEC share physical speed plans by machine specifications rather
than entry object identity. Each course retains at most 64 hardware keys with
256 condition variants per key. Existing conservative mass/grip/aero bins are
retained. Hardware keys include every machine input consumed by this planner;
different hardware, setup/aero demand, grip and mass still get distinct plans.

The whole-course planner resolves air density separately at every sampled road
elevation with the current ambient temperature. Previously the current car's
local density was used across the entire plan, and its continuously changing
value caused repeated 512-station solves. Explicit-density-only callers retain
their previous constant-density behavior. Actual force integration still uses
exact local density and the existing 0.1 s fixed step. This changes the spatial
atmosphere treatment in the planner; bit-identical old trajectories or official
lap-time accuracy are not claimed.

Worker snapshots send only newly recorded telemetry samples. The UI restores
the same three-lap/1,536-sample history, including pruning, reset and clearing.
The worker keeps complete history for saves. Automatic save serialization and
checksum generation now run in the worker; the final localStorage write still
runs on the UI thread. Saves retain the existing format.

UI snapshots are requested at most 10 times per second. Existing Three.js
motion extrapolation continues between snapshots. Worker requests contain at
most 30 simulation ticks, and fallback main-thread requests at most two, so
control commands do not wait behind the former 600-tick requests. This limits
maximum effective playback speed (at most 30x with a 100 ms scheduler, before
CPU overhead); very high requested speeds can run slower than selected.
No cars, physics steps, tyre/slip/heat calculations or telemetry spatial bins
are removed.

## Short measurement

Measured on the development PC in separate Vitest processes, using the same
default SUPER GT field and WEC Le Mans field. Each case starts in the racing
phase, advances one cold tick, then measures five further ticks (0.5 simulated
seconds). Values below compare the previous planner with the shared cache;
they do not measure browser rendering or the subsequent messaging changes.

| Field | Cars | Cold tick before/after | Five warm ticks before/after |
| --- | ---: | ---: | ---: |
| SUPER GT | 43 | 1,373.9 / 239.6 ms | 1,231.7 / 88.9 ms |
| WEC Le Mans | 62 | 1,453.2 / 165.2 ms | 454.5 / 46.4 ms |

The warm measurements are about 13.9x and 9.8x faster respectively. These are
short CPU measurements with cache/JIT variation, not sustained FPS or a
guarantee for every machine, course, weather or playback speed.

## Focused verification

- Shared planning distinguishes hardware and ambient temperature while sharing
  identical hardware and varying local-density inputs for the same atmosphere.
- A maximum-history 62-car snapshot reconstructs exactly after structured
  cloning, append/pruning, clearing and generation reset. Its one-sample delta
  is less than 10% of the equivalent full-state JSON size.
- Worker init/advance/save/reset preserves complete save history and rejects a
  stale generation.
- 101 focused tests pass, including shared vehicle physics, class start grids,
  all-category driver abilities and short driving dynamics; seven full flying
  lap cases are excluded. TypeScript, lint and production build are checked.
- The user declined long testing. No full test suite, full endurance/weekend,
  all-course audit or browser playtest is part of this batch.
