# Shared driver rating review — 2026-10-13

All six visible categories use one absolute current-ability scale. Ordinary people are capped at 100 in editors, saved inputs and named runtime abilities; user-defined yuki_nakayama alone retains 120. A move between seats/categories preserves the person's axes. Machine performance remains separate. No category-dependent runtime deduction is applied.

The explicit review overlay covers 338 imported people; 72 target overall scores changed in v1 (see v2 correction below). Ten additional legacy people retain their existing profiles, giving 348 selectable identities. Retained-unverified rows are not independent reassessments. The 12-group expanded execution mean is aligned to the reviewed overall using a common offset to compact axes, with identity-specific limits; inherited relative skill splits are SIM priors. Exact scores are editorial judgments, not official ratings or a statistical separation of car and driver.

Anchors: Verstappen 98; Antonelli 96; Russell/Leclerc/Norris 95; Hamilton/Piastri 93; Palou 95. SF main drivers approximately 83–87 (Ohta 87, Iwasa/Tsuboi 86, Makino/Nojiri 85). KYOJO leaders 67–70 and midfield 62–65. Juju 67 is the user's explicit calibration. These anchors do not guarantee finishing order.

## Evidence and boundaries

- F1: https://www.formula1.com/en/results/2026/drivers and https://www.formula1.com/en/results/2025/drivers
- SF: https://superformula.net/sf3/driver_taxonomy/2026/?standings= and https://superformula.net/sf2/race2025/standings
- GT: https://supergt.net/driver_ranking and https://supergt.net/driver_ranking?series=2025
- INDYCAR: https://www.indycar.com/Standings and https://www.indycar.com/standings/2025
- WEC: https://www.fiawec.com/en/season/2025 and https://www.fiawec.com/en/news/giovinazzi-we-ve-made-our-dream-come-true/8561
- KYOJO v1 used the 2025 leading trio and insufficient evidence for remaining order. The v2 correction below supersedes those provisional values.

Original supplied CSV/JSON artifacts remain intact. Runtime defaults and pool records apply the explicit driverRatingsReview2026.json overlay and record its provenance. The UI shows common current ability, initial rating, date, status and available evidence links. Source OVR and current edited ability are distinct.

Old saves update only when the entire stored ability profile matches a recognizable old factory profile. Any manually changed skill preserves the custom profile; custom potential and setup remain. Previously saved classification/lap times are not recalculated. Ordinary over-limit input is clamped to 100; Yuki remains eligible for 120. Unknown or partial profiles are conservatively preserved.

## Verification

103 focused tests across nine suites pass: all six category routing, identity and caps, old-default migration, manual edit retention, relational pool/provenance, configuration/save parsing and short actual force execution. TypeScript and lint pass. Production build uses a bounded 3 MB precache asset allowance for the 2.81 MB bundle including review evidence. No full suite, long simulation, all-course pace or statistical driver/cars fit was run. Existing coarse SF qualifying spread remains a separate unresolved baseline issue. Team-principal upgrade is on hold.

Short paused production-browser check passes in all six categories: native setup and extra-category Engineer show common rating evidence; Yuki120/120, Max98/100, Juju67/100. No page errors. Native horizontal overflow checks and F1/SF screenshot inspection pass. This is not a long browser playtest.

## KYOJO correction v2 · 2026-10-13

The earlier KYOJO ordering underweighted 2026 results, especially Tomishita, Ciconte and Sato. Checked the complete 2026 Rd3 standings and 2025 final standings published by TOYOTA GAZOO Racing, plus Motorsport Forum reported Rd4 qualifying/Sprint/Final results (10–11 October). The official standings page explicitly stops at Rd3; do not present it as an updated Rd4 championship table. FSW's apparent Rd4 PDF link returned a sheet headed Rd2/19 July when visually inspected; exclude that mismatched document as Rd4 evidence.

Sources:
- https://toyotagazooracing.com/jp/kyojocup/ranking/2026/
- https://toyotagazooracing.com/jp/kyojocup/ranking/2025/
- https://www.fmotor.jp/2026-kyojo-cup-round-4-fuji-qualifying-result
- https://www.fmotor.jp/2026-kyojo-cup-round-4-fuji-final-result
- https://www.fmotor.jp/kyojo (Rd4 Sprint report)

Current form and repeat competitive finishes inform the editorial relative ordering; previous championship/season results retain a stabilizing role. A retirement or missed start alone does not establish poor pace. This is not a points-to-skill formula. No isolated race-pace/qualifying-gap fit or full driver/car separation has been performed. Absolute category placement and relative detailed skill splits remain SIM priors. Uniform offsets update all detailed axes along with OVR; individual axes are not claimed to be measured. Do not infer precise wet/style/technical-feedback abilities from a finish position.

Juju67 is the latest explicit user request, superseding64. This is shared across categories, with no claim of verified equivalence. Yuki120 and the ordinary100 limit remain.

| Driver | Previous v1 | Current v2 |
|---|---:|---:|
| Aimi Saito | 68 | 70 |
| Riona Tomishita | 67 | 70 |
| Rio Shimono | 70 | 70 |
| Joanne Ciconte | 64 | 69 |
| Miki Onaga | 69 | 69 |
| Kokoro Sato | 63 | 67 |
| Juju Noda | 64 | 67 |
| Ai Miura | 66 | 66 |
| Rami Sasaki | 63 | 65 |
| Sara Matsui | 62 | 64 |
| Paige Raddatz | 60 | 63 |
| Kilei Kanemoto | 61 | 63 |
| Hana Burton | 61 | 62 |
| Itsumo Shiraishi | 59 | 62 |
| Mako Hirakawa | 60 | 61 |
| Kelsey Pinkowski | 59 | 59 |
| Rina Ito | 59 | 59 |
| Marie Iwaoka | 58 | 58 |
| Ryu Yamamoto | 57 | 57 |
| Sitarvee Limnantharak | 57 | 57 |
| Zhao Yun Qing | 56 | 56 |

The21 affected identities retain a compact snapshot of v1 for exact whole-default save migration, including when seated in a different category. A single changed skill preserves manual tuning; custom potential/setup remain. Non-KYOJO identities other than Juju retain their prior review.106 focused checks across nine suites pass, including v1-to-v2 migration in native and extra-category saves and all reviewed execution means. No long tests.

Production paused UI check passes in all six categories after v2. KYOJO Engineer explicitly verifies Tomishita70, Ciconte69, Sato67; SF setup verifies Juju67. No page errors. KYOJO screenshot inspected.
