# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T00:14:51.141Z
- Source commit: `b13c729449baae8a1582543a750b8148aac05bf9`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Australian Grand Prix | FAIL | 1 | 78.518 | 81.533 | 3.015 | 84.753 | 84.033 | 82.468 | 3.51 | 14.54% | clean same-stint P95 change exceeds 2.0s; more than 12% of clean same-stint changes exceed 1.0s; unexplained 2.0s+ same-stint changes remain |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five.

