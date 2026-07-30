# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T01:03:58.316Z
- Source commit: `b13c729449baae8a1582543a750b8148aac05bf9`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | WARN | 1 | 78.518 | 80.907 | 2.389 | 83.996 | 83.076 | 81.623 | 1.031 | 6.35% | street, high-speed-low-downforce, high-speed-high-downforce, stop-and-go, high-temperature, low-temperature | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Chinese Grand Prix | PASS | 1 | 92.064 | 94.562 | 2.498 | 97.944 | 96.72 | 95.388 | 0.758 | 1.15% | low-speed-high-downforce, high-degradation, high-temperature, low-temperature | Within acceptance |
| Japanese Grand Prix | PASS | 1 | 88.778 | 92.647 | 3.869 | 94.969 | 94.862 | 93.081 | 0.686 | 0.51% | high-speed-high-downforce, high-temperature, low-temperature | Within acceptance |
| Bahrain International Circuit | WARN | 1 | 92 | 98.952 | 6.952 | 102.025 | 101.128 | 100.531 | 0.854 | 3.27% | high-temperature, low-temperature | qualifying and race references are estimated |
| Jeddah Corniche Circuit | WARN | 1 | 91 | 98.548 | 7.548 | 101.268 | 100.486 | 100.026 | 0.94 | 4.35% | street, high-speed-low-downforce, high-speed-high-downforce, low-degradation, high-temperature, low-temperature | qualifying and race references are estimated |
| Miami Grand Prix | PASS | 1 | 87.798 | 91.469 | 3.671 | 94.365 | 93.023 | 92.291 | 0.804 | 1.76% | high-temperature, low-temperature | Within acceptance |
| Canadian Grand Prix | FAIL | 1 | 72.578 | 72.376 | -0.202 | 76.157 | 75.383 | 74.086 | 1.595 | 20.83% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 1.5s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Monaco Grand Prix | WARN | 1 | 72.051 | 74.014 | 1.963 | 77.943 | 77.03 | 76.099 | 1.044 | 8.00% | street, low-speed-high-downforce | race fastest is less than 2.0s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Spanish Grand Prix | FAIL | 1 | 74.679 | 79.255 | 4.576 | 82.767 | 81.517 | 80.906 | 0.789 | 1.03% | high-degradation | unexplained 2.0s+ same-stint changes remain |
| Austrian Grand Prix | PASS | 1 | 66.113 | 69.937 | 3.824 | 72.445 | 71.505 | 70.833 | 0.67 | 0.97% | stop-and-go | Within acceptance |
| British Grand Prix | PASS | 1 | 88.111 | 92.517 | 4.406 | 95.14 | 94.977 | 93.931 | 0.923 | 3.15% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Belgian Grand Prix | PASS | 1 | 104.361 | 107.949 | 3.588 | 111.274 | 110.032 | 108.5 | 0.757 | 1.42% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Hungarian Grand Prix | FAIL | 1 | 77.207 | 77.974 | 0.767 | 81.728 | 80.857 | 79.511 | 0.693 | 1.21% | low-speed-high-downforce, high-degradation | race fastest is less than 1.5s behind qualifying |
| Dutch Grand Prix | FAIL | 1 | 71.534 | 72.442 | 0.908 | 76.007 | 74.98 | 73.367 | 0.815 | 3.06% | low-speed-high-downforce, high-degradation | race fastest is less than 1.5s behind qualifying |
| Italian Grand Prix | FAIL | 1 | 81.923 | 81.935 | 0.012 | 84.936 | 83.965 | 83.017 | 0.741 | 1.42% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 1.5s behind qualifying |
| Spanish Grand Prix at MADRING | PASS | 1 | 92 | 96.972 | 4.972 | 99.99 | 98.533 | 97.959 | 0.988 | 5.20% | low-speed-high-downforce, high-degradation | Within acceptance |
| Azerbaijan Grand Prix | FAIL | 1 | 104.159 | 105.806 | 1.647 | 110.531 | 109.09 | 107.36 | 1.525 | 19.15% | street, stop-and-go, low-degradation | race fastest is less than 2.0s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Singapore Grand Prix | PASS | 1 | 91.513 | 97.023 | 5.51 | 100.31 | 99.412 | 97.796 | 0.841 | 2.68% | street, stop-and-go | Within acceptance |
| United States Grand Prix | FAIL | 1 | 96.665 | 98.137 | 1.472 | 101.045 | 99.772 | 99.005 | 1.087 | 7.64% | low-speed-high-downforce | race fastest is less than 1.5s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Mexico City Grand Prix | PASS | 1 | 77.542 | 80.025 | 2.483 | 83.093 | 82.438 | 81.498 | 0.853 | 3.79% | low-degradation | Within acceptance |
| Sao Paulo Grand Prix | FAIL | 1 | 72.587 | 72.3 | -0.287 | 75.323 | 74.496 | 73.439 | 0.596 | 0.30% |  | race fastest is less than 1.5s behind qualifying |
| Las Vegas Grand Prix | FAIL | 1 | 94.657 | 94.479 | -0.178 | 97.996 | 96.936 | 95.883 | 1.113 | 8.14% | street, low-degradation | race fastest is less than 1.5s behind qualifying; clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Qatar Grand Prix | PASS | 1 | 82.573 | 84.997 | 2.424 | 88.036 | 87.285 | 86.656 | 0.748 | 1.65% | high-speed-high-downforce, high-degradation | Within acceptance |
| Abu Dhabi Grand Prix | FAIL | 1 | 85.84 | 86.71 | 0.87 | 89.015 | 88.696 | 87.164 | 0.745 | 1.89% |  | race fastest is less than 1.5s behind qualifying |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | FAIL | 6 | 2.989 | 0.931 | 3.75% |
| High speed / high downforce | WARN | 6 | 3.729 | 0.84 | 2.40% |
| Low speed / high downforce | FAIL | 6 | 1.718 | 0.901 | 4.13% |
| Street circuit | FAIL | 6 | 2.176 | 1.038 | 7.17% |
| Stop and go | FAIL | 6 | 2.018 | 0.936 | 4.51% |
| High degradation | FAIL | 6 | 2.461 | 0.774 | 1.43% |
| Low degradation | FAIL | 6 | 0.83 | 1.026 | 6.24% |
| High temperature | WARN | 6 | 3.77 | 0.829 | 2.51% |
| Low temperature | WARN | 6 | 3.77 | 0.829 | 2.51% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

