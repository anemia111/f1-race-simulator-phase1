# FIA 2026 regulation coverage

Audited against the latest public documents available on 2026-07-15:

- General Provisions, Issue 03, 2026-06-25
- Sporting Regulations, Issue 07, 2026-06-25
- Technical Regulations, Issue 19, 2026-06-25
- FIA 2026 power-unit and superclip refinements, 2026-04-20
- Formula 1 Driving Standards Guidelines, v01, 2026-02-26
- Formula 1 Penalty Guidelines, v01, 2026

The app treats FIA rules, FIA event directives, observed OpenF1 data, and
simulation estimates as different provenance classes. A value is not labelled
FIA when the corresponding competition document is not public or normalized.

## Implemented race-affecting rules

| Area | FIA reference | Simulator behaviour |
| --- | --- | --- |
| Rain Hazard | B1.5.11 | Declaration when forecast probability exceeds 40%, or when the simulated Race Director declares it after rain begins. |
| Heat Hazard | B1.5.10, C4.6 | Heat Index is calculated from air temperature and humidity. A declared Sprint/Race adds 5 kg for the cooling system; other sessions at that Competition add 2 kg. |
| Low Grip Conditions | B1.5.12 | Stateful Race Director declaration with drying hysteresis. Qualifying cannot return to Normal Grip with five minutes or less remaining in a period. |
| Active aero | B7.1.1-B7.1.2 | Normal Grip permits full activation in mapped zones. Low Grip prohibits full activation and permits front-wing-only partial activation in mapped Low Grip zones. |
| Overtake | B7.2.2-B7.2.3 | Disabled at a race start, under Safety Car, and in Low Grip. Detection-line eligibility is latched and activation-line use is modelled. |
| ERS-K power | C5.2.7-C5.2.8, FIA 2026 refinement | 350 kW is available in identified acceleration sectors, with 250 kW elsewhere. Overtake can add at most 150 kW without exceeding the 350 kW absolute cap. Low Grip remains a separately labelled estimate where event curves are not public. |
| Energy Store | C5.2.9 | Battery percentage maps to the public 4 MJ usable state-of-charge window. |
| Recharge | C5.2.10, FIA 2026 refinement | Public 8.5 MJ per-lap maximum by default, optional event override, 7 MJ qualifying recharge, and no recharge limit behind the Safety Car in Low Grip. |
| Standing start ERS | C5.2.12 | MGU-K deployment is blocked below 50 km/h, except for the existing SECU low-power-start safety state. |
| Race and Sprint distance | B2.3/B2.5 | Sprint exceeds 100 km; Grand Prix uses the official event lap count and time limits. |
| Qualifying format | B2.4 | Q1/Q2/Q3 run for 18/15/13 minutes with seven-minute intervals. |
| Sprint Qualifying | B2.2, B6.3.9 | SQ1/SQ2 use Medium and SQ3 uses Soft in dry conditions. |
| Tyre allocation | B6.2.4 | Standard H2/M3/S8/I5/W2 and alternative H2/M4/S6/I6/W2 allocations. |
| Race tyre rule | B6.3.6 | Two dry specifications are required unless Intermediate or Wet tyres were used. |
| Wet Safety Car start | B5.10, B6.3.7 | Severe-rain starts can run formation laps behind the Safety Car; when mandated, all cars use Wet tyres until the Safety Car returns. |
| VSC | B5.12 | Cars follow a marshalling-sector delta rather than a fixed speed cap; overtaking is disabled. `VSC ENDING` starts a deterministic 10-15 second wait before the panels turn green. |
| Neutralised pit strategy | B5.12-B5.14 | Relative pit loss is lower under VSC and lower again behind the Safety Car, but the strategy remains car-specific. VSC service is tyre-only; damage repair is deferred. Red-flag tyre changes are recalculated from weather, tyre condition, remaining sets and track position rather than applied to every car. |
| VSC infringements | B5.12.2, Penalty Guidelines v01 | Delta is sampled only when a car completes one of the 24 timing mini-sectors. Two/three completed red sectors produce 5s, four 10s, five a drive-through, and six a 10s stop-and-go. A red end-delta produces 5s, rising to 10s above 3s and a drive-through above 5s. CPU pace first establishes a small positive margin, then closed-loop control returns toward the minimum time. |
| Safety Car | B5.13 | Yellow is shown before deployment. The leader catches the SC, the field forms a queue, the SC may route the field through the pit lane, and the physical SC returns through Pit Entry Road. Final-lap SC finishes remain under yellow. |
| SC lapped-car procedure | B5.13.4-B5.13.5 | Eligibility is frozen at the prescribed second SC1 crossing. Only named eligible cars pass, the pit exit may close, cars rejoin at the tail without racing, and withdrawal normally follows at the end of the following lap. |
| SC spacing and restart | B5.13.2, B5.13.6 | Ten-car-length spacing is used, rising to twenty in low visibility. After `SAFETY CAR IN THIS LAP`, the leader controls a stable restart pace and overtaking remains prohibited until the Line. |
| Defending | Driving Standards G/H | One defensive direction change and no defensive line change after deceleration begins. |
| Track limits | B1.8.6, Penalty Guidelines v01 | White lines define the track. The first two race infringements are strikes, the third shows the black-and-white flag, and the fourth plus every additional infringement adds 5s. Timed-session laps are deleted. |
| Off-track advantage and unsafe rejoin | B1.8.6/B1.9.6, ISC App. L IV 2(c) | Ordinary track-limit strikes are separated from retained sporting advantage and unsafe rejoins. Evidence is held as a steward case before a 5s/10s/drive-through decision. |
| Contact and accidents | ISC App. L IV 2(d), Penalty Guidelines v01 | Contact is classified as an incident; safety-relevant wall contact or a crash is classified as an accident. Responsibility, consequence and mitigation determine no further action, 5s, 10s, drive-through or stop-and-go. |
| Yellow and blue flags | B1.8.4, ISC App. H 2.5.5 | Failure to slow for a single yellow produces 10s or a drive-through; double yellow produces a 10s stop-and-go. Persistent blue-flag non-compliance scales from 5s to a drive-through. |
| Pit-lane offences | B1.6.2-B1.6.3, Penalty Guidelines v01 | Race speeding below 6 km/h excess is 5s, 6-15 km/h is a drive-through, and above 15 km/h is a 10s stop-and-go. Unsafe release scales from 5s to a drive-through and only gives driver points when driver fault is modelled. |
| Start infringements | B5.11.1, Penalty Guidelines v01 | False-start movement scales through 5s, 10s, drive-through and mandatory 10s stop-and-go outcomes. |
| Serving penalties | B1.9.6 | Time penalties are served at the next ordinary stop. Drive-through and stop-and-go penalties allow two Line crossings, three when issued in the final three laps; SC/VSC crossings extend the allowance and the penalty cannot normally be served under neutralisation. |
| Race-control escalation | B5.12-B5.14 | Incidents begin with sector yellow or double yellow. Obstruction and recovery conditions then determine VSC, SC or red flag rather than jumping directly from green. |
| Sprint points threshold | B2.6 | No Sprint points are awarded below 50% distance or without at least two consecutive green-flag laps. |

## Public-data boundaries

- `FIA-F1-DOC-111` contains the competition-specific Low Grip ERS curves but is
  not part of the public regulation PDF. The app uses a conservative 250 kW
  estimate and labels it as unavailable/estimated.
- Activation zones, detection lines, recharge reductions, and specified ERS
  sectors may be amended in event documents. They remain calibrated or
  simulated until an official event pack is normalized.
- The Penalty Guidelines are guidelines rather than automatic mandatory
  outcomes unless expressly marked mandatory. The simulation therefore keeps
  responsibility, consequence, mitigating circumstances, and steward review
  separate from the underlying incident event.
- Offences the autonomous cars are designed never to commit, including ignoring
  a black flag, crossing a red pit-exit light, or deliberately racing under a
  red flag, are not injected merely to create spectacle. They remain outside
  the stochastic incident generator until the corresponding physical procedure
  can be represented without a fake fixed event.
- Financial Regulations, factory operations, homologation drawings, material
  tests, and physical scrutineering do not alter the live race simulation and
  are intentionally outside runtime scope.

## Official sources

- https://www.fia.com/regulation/category/110
- https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders
- https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf
- https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_19_-_2026-06-25.pdf
- https://www.fia.com/sites/default/files/2026_f1_driving_standards_guidelines.pdf
- https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf
