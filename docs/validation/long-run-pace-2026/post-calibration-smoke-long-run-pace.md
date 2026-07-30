# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T01:32:04.943Z
- Source commit: `b13c729449baae8a1582543a750b8148aac05bf9+working-tree`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | WARN | 1 | 78.518 | 81.506 | 2.988 | 84.971 | 83.996 | 82.497 | 1.003 | 5.39% | street, high-speed-low-downforce, high-speed-high-downforce, stop-and-go | clean same-stint P95 change exceeds 1.0s |
| Chinese Grand Prix | PASS | 1 | 92.064 | 95.545 | 3.481 | 98.92 | 97.92 | 96.684 | 0.81 | 0.45% | low-speed-high-downforce, high-degradation | Within acceptance |
| Japanese Grand Prix | PASS | 1 | 88.778 | 92.474 | 3.696 | 94.998 | 94.857 | 93.236 | 0.793 | 1.05% | high-speed-high-downforce, low-temperature | Within acceptance |
| Bahrain International Circuit | FAIL | 1 | 92 | 98.952 | 6.952 | 102.025 | 101.132 | 100.531 | 0.854 | 3.27% | high-temperature | race fastest is more than 3.0s slower than its calibrated target; qualifying and race references are estimated |
| Jeddah Corniche Circuit | FAIL | 1 | 91 | 98.548 | 7.548 | 101.268 | 100.486 | 100.026 | 0.94 | 4.35% | street, high-speed-low-downforce, high-speed-high-downforce, low-degradation | race fastest is more than 3.0s slower than its calibrated target; qualifying and race references are estimated |
| Miami Grand Prix | PASS | 1 | 87.798 | 91.742 | 3.944 | 94.994 | 93.81 | 92.52 | 0.855 | 2.25% |  | Within acceptance |
| Canadian Grand Prix | FAIL | 1 | 72.578 | 76.088 | 3.51 | 80.459 | 79.998 | 78.929 | 1.67 | 19.36% | high-speed-low-downforce, stop-and-go, low-degradation | clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Monaco Grand Prix | PASS | 1 | 72.051 | 75.952 | 3.901 | 79.46 | 78.47 | 77.475 | 0.796 | 2.57% | street, low-speed-high-downforce | Within acceptance |
| Spanish Grand Prix | PASS | 1 | 74.679 | 79.391 | 4.712 | 83.436 | 82.04 | 81.484 | 0.779 | 1.55% | high-degradation, low-temperature | Within acceptance |
| Austrian Grand Prix | PASS | 1 | 66.113 | 69.937 | 3.824 | 72.445 | 71.505 | 70.833 | 0.67 | 0.97% | stop-and-go | Within acceptance |
| British Grand Prix | PASS | 1 | 88.111 | 93.479 | 5.368 | 96.272 | 95.136 | 94.458 | 0.822 | 1.78% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Belgian Grand Prix | PASS | 1 | 104.361 | 108.301 | 3.94 | 111.549 | 110.527 | 109.916 | 0.821 | 2.26% | high-speed-low-downforce, high-speed-high-downforce, high-temperature | Within acceptance |
| Hungarian Grand Prix | PASS | 1 | 77.207 | 80.051 | 2.844 | 83.5 | 82.509 | 81.545 | 0.782 | 1.83% | low-speed-high-downforce, high-degradation | Within acceptance |
| Dutch Grand Prix | PASS | 1 | 71.534 | 74.192 | 2.658 | 77.168 | 76.079 | 74.894 | 0.714 | 0.56% | low-speed-high-downforce, high-degradation, high-temperature | Within acceptance |
| Italian Grand Prix | WARN | 1 | 81.923 | 83.463 | 1.54 | 86.59 | 85.446 | 84.502 | 0.641 | 0.53% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 2.0s behind qualifying |
| Spanish Grand Prix at MADRING | WARN | 1 | 92 | 97.579 | 5.579 | 100.275 | 100.247 | 98.45 | 1.036 | 9.68% | low-speed-high-downforce, high-degradation, low-temperature | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Azerbaijan Grand Prix | FAIL | 1 | 104.159 | 108.178 | 4.019 | 112.385 | 111.164 | 109.902 | 1.438 | 16.58% | street, stop-and-go, low-degradation, low-temperature | clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Singapore Grand Prix | WARN | 1 | 91.513 | 97.305 | 5.792 | 101.114 | 99.509 | 98.349 | 1.05 | 6.21% | street, stop-and-go, high-temperature | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| United States Grand Prix | WARN | 1 | 96.665 | 98.656 | 1.991 | 101.518 | 100.657 | 99.77 | 1.012 | 5.62% | low-speed-high-downforce | race fastest is less than 2.0s behind qualifying; clean same-stint P95 change exceeds 1.0s |
| Mexico City Grand Prix | PASS | 1 | 77.542 | 80.025 | 2.483 | 83.093 | 82.438 | 81.498 | 0.853 | 3.79% | low-degradation | Within acceptance |
| Sao Paulo Grand Prix | FAIL | 1 | 72.587 | 73.587 | 1 | 76.354 | 75.967 | 74.721 | 0.7 | 0.74% | low-temperature | race fastest is less than 1.5s behind qualifying |
| Las Vegas Grand Prix | FAIL | 1 | 94.657 | 102.155 | 7.498 | 105.995 | 104.523 | 103.588 | 0.763 | 2.00% | street, low-degradation, low-temperature | race fastest is more than 3.0s slower than its calibrated target |
| Qatar Grand Prix | PASS | 1 | 82.573 | 86.201 | 3.628 | 88.224 | 87.486 | 86.76 | 0.682 | 1.35% | high-speed-high-downforce, high-degradation, high-temperature | Within acceptance |
| Abu Dhabi Grand Prix | PASS | 1 | 85.84 | 88.489 | 2.649 | 92.303 | 91.11 | 89.986 | 0.96 | 3.75% | high-temperature | Within acceptance |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | FAIL | 6 | 3.725 | 0.881 | 3.30% |
| High speed / high downforce | FAIL | 6 | 3.818 | 0.821 | 2.02% |
| Low speed / high downforce | WARN | 6 | 3.162 | 0.803 | 2.20% |
| Street circuit | FAIL | 6 | 4.905 | 0.971 | 4.87% |
| Stop and go | FAIL | 6 | 3.667 | 1.026 | 5.80% |
| High degradation | WARN | 6 | 3.554 | 0.78 | 1.45% |
| Low degradation | FAIL | 6 | 3.764 | 0.896 | 4.07% |
| High temperature | FAIL | 6 | 3.784 | 0.837 | 2.76% |
| Low temperature | FAIL | 6 | 4.365 | 0.786 | 1.77% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

