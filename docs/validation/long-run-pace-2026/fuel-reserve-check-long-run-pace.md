# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T00:45:49.515Z
- Source commit: `b13c729449baae8a1582543a750b8148aac05bf9`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **WARN**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | WARN | 5 | 78.518 | 81.597 | 3.079 | 84.893 | 84.084 | 82.88 | 1.007 | 5.41% | street, high-speed-low-downforce, high-speed-high-downforce, low-speed-high-downforce, stop-and-go, high-degradation, low-degradation, high-temperature, low-temperature | clean same-stint P95 change exceeds 1.0s |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | WARN | 1 | 3.079 | 1.007 | 5.41% |
| High speed / high downforce | WARN | 1 | 3.079 | 1.007 | 5.41% |
| Low speed / high downforce | WARN | 1 | 3.079 | 1.007 | 5.41% |
| Street circuit | WARN | 1 | 3.079 | 1.007 | 5.41% |
| Stop and go | WARN | 1 | 3.079 | 1.007 | 5.41% |
| High degradation | WARN | 1 | 3.079 | 1.007 | 5.41% |
| Low degradation | WARN | 1 | 3.079 | 1.007 | 5.41% |
| High temperature | WARN | 1 | 3.079 | 1.007 | 5.41% |
| Low temperature | WARN | 1 | 3.079 | 1.007 | 5.41% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

