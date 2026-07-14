# FIA 2026 regulation coverage

Audited against the latest public documents available on 2026-07-14:

- Sporting Regulations, Issue 07, 2026-06-25
- Technical Regulations, Issue 19, 2026-06-25
- Formula 1 Driving Standards Guidelines, v01, 2026-02-26

The app treats FIA rules, FIA event directives, observed OpenF1 data, and
simulation estimates as different provenance classes. A value is not labelled
FIA when the corresponding competition document is not public or normalized.

## Implemented race-affecting rules

| Area | FIA reference | Simulator behaviour |
| --- | --- | --- |
| Rain Hazard | B1.5.11 | Declaration when forecast probability exceeds 40%, or when the simulated Race Director declares it after rain begins. |
| Low Grip Conditions | B1.5.12 | Stateful Race Director declaration with drying hysteresis. Qualifying cannot return to Normal Grip with five minutes or less remaining in a period. |
| Active aero | B7.1.1-B7.1.2 | Normal Grip permits full activation in mapped zones. Low Grip prohibits full activation and permits front-wing-only partial activation in mapped Low Grip zones. |
| Overtake | B7.2.2-B7.2.3 | Disabled at a race start, under Safety Car, and in Low Grip. Detection-line eligibility is latched and activation-line use is modelled. |
| ERS-K power | C5.2.7-C5.2.8 | 350 kW absolute cap and exact public standard, Overtake, and specified-sector speed curves. Standard deployment is zero from 345 km/h; Overtake deployment is zero from 355 km/h. |
| Energy Store | C5.2.9 | Battery percentage maps to the public 4 MJ usable state-of-charge window. |
| Recharge | C5.2.10 | Public 8.5 MJ per-lap maximum by default, optional event override, 5 MJ qualifying floor, and no recharge limit behind the Safety Car in Low Grip. |
| Standing start ERS | C5.2.12 | MGU-K deployment is blocked below 50 km/h, except for the existing SECU low-power-start safety state. |
| Race and Sprint distance | B2.3/B2.5 | Sprint exceeds 100 km; Grand Prix uses the official event lap count and time limits. |
| Qualifying format | B2.4 | Q1/Q2/Q3 run for 18/15/13 minutes with seven-minute intervals. |
| Sprint Qualifying | B2.2, B6.3.9 | SQ1/SQ2 use Medium and SQ3 uses Soft in dry conditions. |
| Tyre allocation | B6.2.4 | Standard H2/M3/S8/I5/W2 and alternative H2/M4/S6/I6/W2 allocations. |
| Race tyre rule | B6.3.6 | Two dry specifications are required unless Intermediate or Wet tyres were used. |
| Wet Safety Car start | B5.10, B6.3.7 | Severe-rain starts can run formation laps behind the Safety Car; when mandated, all cars use Wet tyres until the Safety Car returns. |
| VSC | B5.12 | Cars follow a marshalling-sector delta rather than a fixed speed cap; overtaking is disabled. |
| Safety Car | B5.13 | Queue spacing, no overtaking, lapped-car procedure, pit restrictions, and post-SC Overtake re-enable targets are modelled. |
| Defending | Driving Standards G/H | One defensive direction change and no defensive line change after deceleration begins. |

## Public-data boundaries

- `FIA-F1-DOC-111` contains the competition-specific Low Grip ERS curves but is
  not part of the public regulation PDF. The app uses a conservative 250 kW
  estimate and labels it as unavailable/estimated.
- Activation zones, detection lines, recharge reductions, and specified ERS
  sectors may be amended in event documents. They remain calibrated or
  simulated until an official event pack is normalized.
- Financial Regulations, factory operations, homologation drawings, material
  tests, and physical scrutineering do not alter the live race simulation and
  are intentionally outside runtime scope.

## Official sources

- https://www.fia.com/regulation/category/110
- https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf
- https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_19_-_2026-06-25.pdf
- https://www.fia.com/sites/default/files/2026_f1_driving_standards_guidelines.pdf
