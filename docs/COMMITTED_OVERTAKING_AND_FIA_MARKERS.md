# Committed overtaking and FIA marker refresh (2026-10-13)

The user requested frequent ability-dependent overtaking, especially on straights
and while Overtake is actually active, with ERS use and no prolonged stable
side-by-side running. This supersedes the older one-line driving preference.

## Shared driving policy

- A physically observed closing-speed advantage can justify an attack even when
  the last recorded lap was slower. It adds no speed or engine power.
- Capable close attackers aim beyond the physical passing clearance. An active
  boost moves the pull-out threshold to 1.15 s and commits suitable drivers to
  full clearance within 1.1 s. Eligibility alone does not count as active boost.
- A braking opponent ends tow waiting. An already alongside defender holds its
  occupied lane instead of chasing the attacker sideways.
- After six continuous seconds within 6 m longitudinally and at least 1.6 m
  laterally, a shared contest policy chooses who abandons this attempt. Position
  advantage, closing speed, then overtaking/braking/racecraft/traction/awareness
  determine the choice. Exact ties use identity to keep both cars consistent.
  The choice is latched; the conceding driver holds its lane and requests at
  most 72% throttle until 14 m separation. Physical steering/occupancy still
  governs merging. Flags, pits, yielding and timed-session etiquette take
  priority. The timer is persisted and validated in both runtime families.
- F1 straight attack/tow intent requests ERS, scaled by ERS skill and actual SOC.
  Below 10% SOC this extra attack request is zero; it ramps over the next 20%.
  Deployment remains subject to the existing integrator, temperatures, energy
  ledger, power curve, start restrictions, grip and super-clipping gates.
  SF keeps OTS; other categories keep their existing hardware.

## FIA course operation evidence

Five FIA 2026 competition maps were downloaded and their circuit-map pages
rendered and inspected on 2026-10-13. Marker data is transcribed in
`src/data/officialTrackOperations2026.ts`, with the exact source URLs:

- Zandvoort: Doc 6, 20 August; two SM zones; detection 10 m before T13,
  activation 45 m after T14 entry.
- Monza: Doc 6, 3 September; four SM zones; detection at T11 entry,
  activation at T11.
- Madrid: Doc 6, 10 September; two SM zones; detection at T22 entry,
  activation 20 m after T22. Map length 5.414 km.
- Baku: Doc 8, 23 September; two SM zones; detection 90 m after T16,
  activation 20 m before T17. Low-grip main-straight activation is after T20,
  whereas normal-grip activation is after T19.
- Singapore: Doc 7, 8 October; five SM zones; detection at T17 entry,
  activation 30 m after T17. The T5 zone is unavailable in low grip.

All 24 existing F1 circuits have an Overtake detection/activation configuration.
16 now have FIA event-map marker data (including Monaco with no SM zones).
The remaining eight (COTA, Mexico, Interlagos, Las Vegas, Lusail, Yas Marina,
Sakhir and Jeddah) retain explicitly estimated geometry; no suitable 2026 map
for those physical venues was located in this research. Japanese additional
circuits remain F1 Free Mode SIM estimates, not official F1 operations or SF OTS
restrictions. No calendar or track catalogue expansion is included.

FIA gives corner-relative markers, not sampled coordinates on our centreline.
Projection remains approximate. Corner order now disambiguates adjacent road
branches (Baku T20 was incorrectly snapping near T6). Entry/exit references use
bounded visible bend geometry rather than a fixed +/-15 m; low-grip markers
constrain the normal exit projection. This also prevents Hungary's detection
and activation from collapsing to one projected point. The five added maps use
the next braking corner visible on the map as the zone run endpoint. Endpoints
are explicitly `endSource: derived`; actual braking/bodywork transition is still
controlled by the driving and aero models, not an FIA-published metre endpoint.
Baku and Singapore sector distances now use their 2026 map tables.

## Verification scope

Use focused unit/integration tests and the short zone geometry audit. Tests
exercise all six live runtime paths and save roundtrips, four 4.1 s straight
contest separations, active-boost pull-out, actual F1 electrical deployment,
SOC accounting, priority rules and all 24 detection configurations. Do not run
long weekend/endurance or full-lap collections. Historical all-course lap-time
audits are not current calibration evidence.
