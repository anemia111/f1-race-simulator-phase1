# 2026 F1 Long-run Pace Validation

- Generated: 2026-08-08T11:12:07.200Z
- Source commit: `09b1d61fa9fc54dc17cc181a619198592ef8cb9e+working-tree`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | FAIL | 3 | 78.518 | 79.691 | 1.173 | 82.537 | 81.354 | 80.684 | 1.299 | 12.59% | street, high-speed-low-downforce, high-speed-high-downforce, low-speed-high-downforce, stop-and-go, high-degradation, low-degradation, high-temperature, low-temperature | race fastest is less than 1.5s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| High speed / high downforce | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| Low speed / high downforce | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| Street circuit | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| Stop and go | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| High degradation | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| Low degradation | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| High temperature | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| Low temperature | FAIL | 1 | 1.173 | 1.299 | 12.59% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

