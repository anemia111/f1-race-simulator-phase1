# 2026 F1 Long-run Pace Validation

- Generated: 2026-07-30T05:52:48.205Z
- Source commit: `52fa5784d98c8cdd408b0d2a75028bf0e4a65d63+working-tree`
- Physics step: 3s maximum
- Australia seeds: 100
- Other F1 circuit seeds: 20
- Result: **FAIL**

Clean laps exclude rain, flags, pits, off-track running, new damage and the tire cliff. Strict clean-air variation also excludes close traffic and active battles.

| Circuit | Result | Seeds | Qualifying | Race fastest P50 | Gap | Early | Middle | Late | Clean delta P95 | 1s+ rate | Characteristics | Reason |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Australian Grand Prix | FAIL | 100 | 78.518 | 81.874 | 3.356 | 84.994 | 84.051 | 82.912 | 1.037 | 6.00% | street, high-speed-low-downforce, high-speed-high-downforce, stop-and-go | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s; Australia race fastest median is outside 1:21.9-1:22.8 |
| Chinese Grand Prix | FAIL | 20 | 92.064 | 95.708 | 3.644 | 98.248 | 97.556 | 96.706 | 0.813 | 2.06% | low-speed-high-downforce, high-degradation | unexplained 2.0s+ same-stint changes remain |
| Japanese Grand Prix | PASS | 20 | 88.778 | 92.685 | 3.907 | 95.041 | 94.484 | 93.386 | 0.818 | 1.93% | high-speed-high-downforce, high-temperature | Within acceptance |
| Bahrain International Circuit | FAIL | 20 | 92 | 99.02 | 7.02 | 102.237 | 101.454 | 100.431 | 0.995 | 4.90% |  | race fastest is more than 3.0s slower than its calibrated target; qualifying and race references are estimated |
| Jeddah Corniche Circuit | FAIL | 20 | 91 | 98.57 | 7.57 | 101.273 | 100.478 | 99.946 | 0.844 | 1.77% | street, high-speed-low-downforce, high-speed-high-downforce, low-degradation, low-temperature | race fastest is more than 3.0s slower than its calibrated target; qualifying and race references are estimated |
| Miami Grand Prix | PASS | 20 | 87.798 | 91.684 | 3.886 | 94.816 | 93.937 | 92.49 | 0.899 | 2.98% |  | Within acceptance |
| Canadian Grand Prix | FAIL | 20 | 72.578 | 76.865 | 4.287 | 80.26 | 79.903 | 78.588 | 1.735 | 21.11% | high-speed-low-downforce, stop-and-go, low-degradation, low-temperature | clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Monaco Grand Prix | FAIL | 20 | 72.051 | 75.966 | 3.915 | 78.941 | 78.379 | 77.48 | 0.935 | 2.83% | street, low-speed-high-downforce | unexplained 2.0s+ same-stint changes remain |
| Spanish Grand Prix | FAIL | 20 | 74.679 | 79.361 | 4.682 | 82.889 | 81.989 | 81.297 | 0.781 | 1.58% | high-degradation | unexplained 2.0s+ same-stint changes remain |
| Austrian Grand Prix | PASS | 20 | 66.113 | 69.643 | 3.53 | 72.193 | 71.501 | 70.66 | 0.669 | 0.63% | stop-and-go | Within acceptance |
| British Grand Prix | PASS | 20 | 88.111 | 93.212 | 5.101 | 96.015 | 95.276 | 94.18 | 0.905 | 3.16% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Belgian Grand Prix | PASS | 20 | 104.361 | 108.441 | 4.08 | 111.547 | 110.592 | 109.146 | 0.784 | 1.52% | high-speed-low-downforce, high-speed-high-downforce | Within acceptance |
| Hungarian Grand Prix | FAIL | 20 | 77.207 | 80.325 | 3.118 | 83.369 | 82.589 | 81.628 | 0.784 | 1.45% | low-speed-high-downforce, high-degradation, low-temperature | unexplained 2.0s+ same-stint changes remain |
| Dutch Grand Prix | FAIL | 20 | 71.534 | 74.23 | 2.696 | 77.073 | 76.44 | 75.053 | 0.713 | 0.96% | low-speed-high-downforce, high-degradation, high-temperature | unexplained 2.0s+ same-stint changes remain |
| Italian Grand Prix | WARN | 20 | 81.923 | 83.886 | 1.963 | 86.634 | 85.547 | 84.968 | 0.784 | 1.27% | high-speed-low-downforce, stop-and-go, low-degradation | race fastest is less than 2.0s behind qualifying |
| Spanish Grand Prix at MADRING | WARN | 20 | 92 | 97.449 | 5.449 | 100.515 | 99.947 | 98.094 | 1.03 | 6.84% | low-speed-high-downforce, high-degradation | clean same-stint P95 change exceeds 1.0s; more than 6% of clean same-stint changes exceed 1.0s |
| Azerbaijan Grand Prix | FAIL | 20 | 104.159 | 108.028 | 3.869 | 112.452 | 111.437 | 109.98 | 1.518 | 21.68% | street, stop-and-go, low-degradation, high-temperature | clean same-stint P95 change exceeds 1.0s; more than 12% of clean same-stint changes exceed 1.0s |
| Singapore Grand Prix | FAIL | 20 | 91.513 | 97.122 | 5.609 | 100.86 | 99.539 | 98.313 | 1.011 | 5.33% | street, stop-and-go, low-temperature | clean same-stint P95 change exceeds 1.0s; unexplained 2.0s+ same-stint changes remain |
| United States Grand Prix | WARN | 20 | 96.665 | 98.76 | 2.095 | 101.462 | 100.535 | 99.785 | 1.015 | 5.41% | low-speed-high-downforce | clean same-stint P95 change exceeds 1.0s |
| Mexico City Grand Prix | PASS | 20 | 77.542 | 79.971 | 2.429 | 83.031 | 82.693 | 81.495 | 0.89 | 2.98% | low-degradation, high-temperature | Within acceptance |
| Sao Paulo Grand Prix | FAIL | 20 | 72.587 | 73.858 | 1.271 | 76.586 | 75.944 | 74.878 | 0.65 | 0.64% | low-temperature | race fastest is less than 1.5s behind qualifying |
| Las Vegas Grand Prix | FAIL | 20 | 94.657 | 102.573 | 7.916 | 106.066 | 104.885 | 104.012 | 0.833 | 2.08% | street, low-degradation, high-temperature | race fastest is more than 3.0s slower than its calibrated target |
| Qatar Grand Prix | PASS | 20 | 82.573 | 85.966 | 3.393 | 88.371 | 87.488 | 86.693 | 0.702 | 0.83% | high-speed-high-downforce, high-degradation, high-temperature | Within acceptance |
| Abu Dhabi Grand Prix | PASS | 20 | 85.84 | 89.065 | 3.225 | 92.468 | 91.456 | 90.021 | 0.973 | 4.19% | low-temperature | Within acceptance |

## Characteristic Coverage

| Characteristic | Result | Circuits | Race/qualifying gap P50 | Clean delta P95 P50 | 1s+ rate P50 |
|---|---:|---:|---:|---:|---:|
| High speed / low downforce | FAIL | 6 | 4.184 | 0.875 | 2.46% |
| High speed / high downforce | FAIL | 6 | 3.994 | 0.831 | 1.85% |
| Low speed / high downforce | FAIL | 6 | 3.381 | 0.874 | 2.44% |
| Street circuit | FAIL | 6 | 4.762 | 0.973 | 4.08% |
| Stop and go | FAIL | 6 | 3.7 | 1.024 | 5.67% |
| High degradation | FAIL | 6 | 3.518 | 0.782 | 1.52% |
| Low degradation | FAIL | 6 | 4.078 | 0.867 | 2.53% |
| High temperature | FAIL | 6 | 3.631 | 0.825 | 2.00% |
| Low temperature | FAIL | 6 | 3.756 | 0.908 | 2.98% |
| High altitude | PASS | 0 | - | - | 0.00% |

## Method

Each seed runs the production race engine to the chequered flag with the full F1 field on a dry track. Lap and sector times come from physical timing-line crossings; map movement and telemetry use the same integrated road speed. The report records control exposure, traffic, tire state, fuel, rubber, ERS recovery and pace mode so large changes can be attributed.

The early, middle and late windows are 9-18%, 35-60% and 78-100% of scheduled distance. Phase pace uses strict clean laps from cars running in the top five. Circuit characteristics are ranked from the production track-load model; degradation and temperature groups use the upper and lower quartiles of the registered F1 calendar.

