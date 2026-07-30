# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T00:57:24.112Z
- Source commit: `b13c729449baae8a1582543a750b8148aac05bf9`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | PASS | 1 | 78.518 | 81.933 | 3.415 | 85.163 | 84.025 | 82.671 | 0.808 | 2.33% | street, high-speed-low-downforce, high-speed-high-downforce, stop-and-go, high-temperature, low-temperature | Within acceptance |
| Chinese Grand Prix | FAIL | 1 | 92.064 | 91.835 | -0.229 | 94.039 | 93.035 | 92.518 | 0.913 | 2.79% | low-speed-high-downforce, high-degradation, high-temperature, low-temperature | race fastest is less than 1.5s behind qualifying |
| Japanese Grand Prix | PASS | 1 | 88.778 | 91.46 | 2.682 | 94.767 | 94.181 | 92.54 | 0.739 | 1.31% | high-speed-high-downforce, high-temperature, low-temperature | Within acceptance |
| Bahrain International Circuit | WARN | 1 | 92 | 98.952 | 6.952 | 102.025 | 101.128 | 100.531 | 0.854 | 3.27% | high-temperature, low-temperature | qualifying and race references are estimated |
| Jeddah Corniche Circuit | WARN | 1 | 91 | 98.548 | 7.548 | 101.268 | 100.486 | 100.026 | 0.94 | 4.35% | street, high-speed-low-downforce, high-speed-high-downforce, low-degradation, high-temperature, low-temperature | qualifying and race references are estimated |
| Miami Grand Prix | PASS | 1 | 87.798 | 92.788 | 4.99 | 95.497 | 94.503 | 93.488 | 0.901 | 2.78% | high-temperature, low-temperature | Within acceptance |
| Canadian Grand Prix | FAIL | 1 | 72.578 | 72.423 | -0.155 | 75.512 | 75.12 | 74.324 | 1.616 | 23.47% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 1.5s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Monaco Grand Prix | FAIL | 1 | 72.051 | 73.522 | 1.471 | 76.49 | 75.992 | 74.996 | 0.967 | 4.31% | street, low-speed-high-downforce | race fastest is less than 1.5s behind qualifying |
| Spanish Grand Prix | PASS | 1 | 74.679 | 80.997 | 6.318 | 85.302 | 83.999 | 83.435 | 0.732 | 1.70% | high-degradation | Within acceptance |
| Austrian Grand Prix | PASS | 1 | 66.113 | 72.936 | 6.823 | 75.249 | 75 | 74.119 | 0.741 | 0.68% | stop-and-go | Within acceptance |
| British Grand Prix | PASS | 1 | 88.111 | 93.489 | 5.378 | 96.153 | 95.516 | 94.508 | 0.854 | 3.98% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Belgian Grand Prix | PASS | 1 | 104.361 | 109.306 | 4.945 | 112.466 | 111.483 | 110.049 | 0.982 | 5.10% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Hungarian Grand Prix | PASS | 1 | 77.207 | 84.007 | 6.8 | 86.667 | 85.523 | 84.988 | 0.77 | 0.52% | low-speed-high-downforce, high-degradation | Within acceptance |
| Dutch Grand Prix | PASS | 1 | 71.534 | 78.443 | 6.909 | 81.476 | 81.004 | 79.689 | 0.736 | 0.30% | low-speed-high-downforce, high-degradation | Within acceptance |
| Italian Grand Prix | WARN | 1 | 81.923 | 83.584 | 1.661 | 86.505 | 86.378 | 84.462 | 0.711 | 1.01% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 2.0s behind qualifying |
| Spanish Grand Prix at MADRING | WARN | 1 | 92 | 97.458 | 5.458 | 102.007 | 100.029 | 98.491 | 1.026 | 6.81% | low-speed-high-downforce, high-degradation | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Azerbaijan Grand Prix | FAIL | 1 | 104.159 | 108.813 | 4.654 | 113.002 | 112.096 | 110.437 | 1.213 | 16.20% | street, stop-and-go, low-degradation | clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Singapore Grand Prix | PASS | 1 | 91.513 | 98.651 | 7.138 | 102.005 | 101.131 | 99.921 | 0.818 | 1.64% | street, stop-and-go | Within acceptance |
| United States Grand Prix | PASS | 1 | 96.665 | 103.947 | 7.282 | 107.499 | 106.01 | 104.612 | 0.94 | 2.63% | low-speed-high-downforce | Within acceptance |
| Mexico City Grand Prix | WARN | 1 | 77.542 | 80.823 | 3.281 | 84.065 | 83.591 | 82.432 | 1.022 | 6.02% | low-degradation | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Sao Paulo Grand Prix | PASS | 1 | 72.587 | 78.255 | 5.668 | 80.504 | 80.196 | 78.992 | 0.689 | 0.00% |  | Within acceptance |
| Las Vegas Grand Prix | PASS | 1 | 94.657 | 98.49 | 3.833 | 102.984 | 101.296 | 99.801 | 0.844 | 0.71% | street, low-degradation | Within acceptance |
| Qatar Grand Prix | PASS | 1 | 82.573 | 91.822 | 9.249 | 94.177 | 93.503 | 92.474 | 0.762 | 1.50% | high-speed-high-downforce, high-degradation | Within acceptance |
| Abu Dhabi Grand Prix | PASS | 1 | 85.84 | 92.662 | 6.822 | 96.068 | 95.501 | 93.978 | 0.904 | 3.32% |  | Within acceptance |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | FAIL | 6 | 4.18 | 0.897 | 4.16% |
| High speed / high downforce | WARN | 6 | 5.162 | 0.831 | 3.15% |
| Low speed / high downforce | FAIL | 6 | 6.129 | 0.926 | 2.71% |
| Street circuit | FAIL | 6 | 4.244 | 0.892 | 3.32% |
| Stop and go | FAIL | 6 | 4.034 | 0.813 | 1.98% |
| High degradation | FAIL | 6 | 6.559 | 0.766 | 1.60% |
| Low degradation | FAIL | 6 | 3.557 | 0.981 | 5.18% |
| High temperature | FAIL | 6 | 4.203 | 0.877 | 2.78% |
| Low temperature | FAIL | 6 | 4.203 | 0.877 | 2.78% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

