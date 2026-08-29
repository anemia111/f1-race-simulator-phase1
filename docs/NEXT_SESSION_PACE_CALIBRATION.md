# Straight-against-corner calibration closure

## Status

Completed on 2026-08-29. This file is retained as the closure record; it is no
longer a next-session prompt.

The investigation used only the fixed five-circuit calibration split while
selecting the implementation. The six holdout circuits were read once after
the structural change was fixed. No track-specific multiplier was introduced,
`fitPerformed` remains `false`, and `trackSpecificMultiplierCount` remains `0`.

## Root cause and change

The reference-lap MGU-K allocator ranked each segment by its immediate local
seconds per joule. It therefore ignored speed carried from one segment into
the rest of a long acceleration run and overvalued short low-speed exits.

`physicalLap.ts` now removes each candidate segment's deployment, resolves the
complete closed lap, and ranks the complete-lap time benefit per joule. The
forward sweep also permits drag to decelerate the car over distance instead of
using a terminal-equilibrium speed as an instantaneous pointwise clamp. No
production coefficient was changed: `liftAreaM2` remains 5.0.

## Fixed result

Calibration-only development result:

| Metric | Before structural fix | After |
| --- | ---: | ---: |
| Lap MAE | 1.329 s | 1.181 s |
| Lap bias | +0.806 s | +0.693 s |
| Modelled peak range | 5.1 km/h | 8.3 km/h |
| Peak MAE | 11.8 km/h | 3.4 km/h |
| Peak bias | -11.8 km/h | +0.9 km/h |

Final one-time holdout report, with the code and parameters already fixed:

| Set | Mean absolute error | Mean percentage bias |
| --- | ---: | ---: |
| Calibration | 1.181 s | +0.813% |
| Holdout | 2.646 s | +0.091% |
| Overall | 1.980 s | — |

The overall observed-peak MAE is 7.527 km/h with +3.919 km/h bias. The remaining
scatter is reported as model/data limitation rather than tuned away. Future
work requires new independent corner traces, acceleration/braking traces, or
vehicle/tyre measurements; it must not reuse the holdout to choose a value.
