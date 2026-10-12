# Shared driver rating review — 2026-10-13

All six visible categories use one absolute current-ability scale. Ordinary people are capped at 100 in editors, saved inputs and named runtime abilities; user-defined yuki_nakayama alone retains 120. A move between seats/categories preserves the person's axes. Machine performance remains separate. No category-dependent runtime deduction is applied.

The explicit review overlay covers 338 imported people; 72 target overall scores change. Ten additional legacy people retain their existing profiles, giving 348 selectable identities. Retained-unverified rows are not independent reassessments. The 12-group expanded execution mean is aligned to the reviewed overall using a common offset to compact axes, with identity-specific limits; inherited relative skill splits are SIM priors. Exact scores are editorial judgments, not official ratings or a statistical separation of car and driver.

Anchors: Verstappen 98; Antonelli 96; Russell/Leclerc/Norris 95; Hamilton/Piastri 93; Palou 95. SF main drivers approximately 83–87 (Ohta 87, Iwasa/Tsuboi 86, Makino/Nojiri 85). KYOJO leaders 67–70 and midfield 62–65. Juju 64 is the user's explicit calibration. These anchors do not guarantee finishing order.

## Evidence and boundaries

- F1: https://www.formula1.com/en/results/2026/drivers and https://www.formula1.com/en/results/2025/drivers
- SF: https://superformula.net/sf3/driver_taxonomy/2026/?standings= and https://superformula.net/sf2/race2025/standings
- GT: https://supergt.net/driver_ranking and https://supergt.net/driver_ranking?series=2025
- INDYCAR: https://www.indycar.com/Standings and https://www.indycar.com/standings/2025
- WEC: https://www.fiawec.com/en/season/2025 and https://www.fiawec.com/en/news/giovinazzi-we-ve-made-our-dream-come-true/8561
- KYOJO: https://ms.bridgestone.co.jp/4/kyojocup/about/ confirms the 2025 leaders. Full 2026 KYOJO field rankings were not verified. Other order and skill splits retain imported editorial priors.

Original supplied CSV/JSON artifacts remain intact. Runtime defaults and pool records apply the explicit driverRatingsReview2026.json overlay and record its provenance. The UI shows common current ability, initial rating, date, status and available evidence links. Source OVR and current edited ability are distinct.

Old saves update only when the entire stored ability profile matches a recognizable old factory profile. Any manually changed skill preserves the custom profile; custom potential and setup remain. Previously saved classification/lap times are not recalculated. Ordinary over-limit input is clamped to 100; Yuki remains eligible for 120. Unknown or partial profiles are conservatively preserved.

## Verification

103 focused tests across nine suites pass: all six category routing, identity and caps, old-default migration, manual edit retention, relational pool/provenance, configuration/save parsing and short actual force execution. TypeScript and lint pass. Production build uses a bounded 3 MB precache asset allowance for the 2.81 MB bundle including review evidence. No full suite, long simulation, all-course pace or statistical driver/cars fit was run. Existing coarse SF qualifying spread remains a separate unresolved baseline issue. Team-principal upgrade is on hold.

Short paused production-browser check passes in all six categories: native setup and extra-category Engineer show common rating evidence; Yuki120/120, Max98/100, Juju64/100. No page errors. Native horizontal overflow checks and F1/SF screenshot inspection pass. This is not a long browser playtest.
