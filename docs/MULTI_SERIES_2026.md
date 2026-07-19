# 2026 Multi-Series Data Contract

## Categories

| Category | Teams | Cars | Qualifying | Race format | Overtake |
| --- | ---: | ---: | --- | --- | --- |
| F1 Custom | 10 | 30 | Q1 18m: 30 to 20; Q2 15m: 20 to 10; Q3 13m | Grand Prix; sprint weekends where configured | 2026 active aero and Overtake |
| FIA Formula 2 | 11 | 22 | One 30-minute session; Monaco uses odd/even 16-minute groups | Reverse top 10 sprint; feature race with mandatory stop and both dry specs | DRS |
| FIA Formula 3 | 10 | 30 | One 30-minute session; Monaco/Monza use odd/even groups; Madrid has two sessions | Reverse top 12 sprint; no routine mandatory stop; Madrid has two feature races | DRS |
| SUPER FORMULA | 16 | 24 | Q1 groups A/B (10m each), top six from each to Q2 | JAF points; best two team cars score | 200-second OTS, available from the opening lap |

The source layer stores 110 unique people separately from season/series/team
assignments. A person can hold a regular seat in one category and a reserve
assignment in another without being duplicated.

## Rating Rules

- Every stored driver axis, overall, and potential value is 0-100.
- F2 and SUPER FORMULA values supplied as already adjusted stay as stored.
- F3 values supplied as already adjusted stay as stored.
- No category penalty or subtraction is applied at runtime.
- The UI edits the compact 12-axis profile; the simulation expands it into its
  detailed internal skill map.
- Team machine performance and driver ability remain independent inputs.

## Tire Mapping

- F1 uses Hard/Medium/Soft plus Intermediate/Wet and its standard/sprint set
  allocations.
- F2 maps the two nominated dry specifications to Prime (`H`) and Option (`S`),
  with three Prime and two Option sets represented for the weekend.
- F3 maps its single dry specification to `M` and provides four dry sets.
- SUPER FORMULA maps the single Yokohama dry specification to `M`. Its
  simulation inventory supports qualifying plus the mandatory race change.
- Internal letters are stable physics identifiers. Category labels in the UI
  state what the identifier means; absent dry specifications are not offered.

Used F2 Prime/Option sets remain reusable for the Feature Race after qualifying;
the inventory distinguishes a used set from a returned or unavailable set.

## Race And Points Rules

- F2 Sprint races exceed 120 km (Monaco 100 km) with a 45-minute limit. Feature
  races exceed 170 km (Monaco 140 km, Budapest 160 km) with a 60-minute limit.
- F3 uses event lap counts with 40-minute Sprint and 45-minute Feature limits.
- F2/F3 shortened-race points use the official under-25%, under-50%, under-75%,
  and full-distance tables. At least two green laps are required.
- F2/F3 award one fastest-lap point only when the overall fastest classified
  driver finishes in the top 10 and the winner completes at least 50%.
- F2/F3 DRS becomes eligible after one completed lap plus the detection line.
  SUPER FORMULA OTS is available from the opening racing lap.

## Event Overrides

- Championship saves use the calendar event ID, not only the circuit ID. Repeat
  races at Motegi, Fuji, and Suzuka therefore score as separate rounds.
- Madrid F3 exposes `FP1 -> Qualifying 1 -> Qualifying 2 -> Sprint -> Feature 1
  -> Feature 2`. The two qualifying classifications persist separate grids.
- The replacement SUPER FORMULA Round 3 is a race-only Fuji event: 25 laps,
  50-minute limit, no mandatory tyre change, and the under-150 km
  `12-9-7-6-5-4-3-2-1` points table. Its deterministic grid reference is taken
  from the Autopolis Round 3 qualifying package.
- A calendar event can replace the category qualifying format, segment times,
  advancement counts, and optional Q3. The runtime and registry validator use
  that bulletin only for the matching event; no Q3 is invented where the
  event package does not define one.
- F2 Monaco runs two 16-minute odd/even car-number groups. F3 does the same at
  Monaco and runs two 10-minute groups at Monza. Their final grids alternate
  the two group classifications, beginning with the group containing the
  overall fastest driver. SUPER FORMULA keeps balanced groups and is not
  accidentally switched to car-number parity.

## Source Boundary

- F1 field: `src/data/f1Performance.csv`.
- F2/F3/SF fields, calendars, rule packages, and source URLs:
  `src/data/motorsportSeries2026.json`.
- Runtime validation and relational assignments:
  `src/series/seriesRegistry.ts`.
- OpenF1 is enabled only for F1. It never supplies F2, F3, or SUPER FORMULA
  values and never turns the deterministic core engine into observed data.
- Support-category vehicle pace is a one-make baseline with a small, explicit
  team-operations effect. It is a simulation estimate, not a claimed official
  dyno value.

Primary references are linked from each package in the JSON registry. They
include FIA F2/F3 sporting regulations, Formula 2/3 official teams and
calendars, the JAF SUPER FORMULA regulations, and official series team lists.

## Persistence

- Selected category is stored independently.
- Weekend state includes `seriesId`; a save from another category is rejected.
- Weekend state also includes `eventId`; legacy track-only saves migrate to the
  first matching calendar event.
- Driver tuning and championship state use category-scoped storage keys.
- Legacy F1 150-scale tuning is migrated once to 0-100; current data is never
  rescaled on load.
- Complete team and driver configuration uses `saveVersion: 1`, a category ID,
  exact relational IDs, and a bounded `migrationHistory`. Invalid JSON,
  missing IDs, duplicate car numbers, out-of-range values, and cross-category
  backups fail closed to the bundled category baseline.
- Completed race and sprint records retain immutable driver identity, team,
  machine profile, ability profile, classification, and awarded-point
  snapshots. A later seat or performance edit cannot rewrite past results.

## Data Manager

Open **Data -> Manage series data** in the broadcast dashboard.

- The driver directory contains all 110 unique people and supports series,
  current-team, nationality, role, rank, and text filters. Multiple active
  assignments are displayed without creating duplicate people.
- Current-category drivers expose identity, car number, team, seat role,
  potential, overall, and all 12 grouped ability controls. A filtered set can
  be adjusted or set in one operation.
- Team records expose names, colors, pit-crew performance, and every machine
  axis. Machine equalisation keeps team identity while setting every field to
  the current field mean.
- Driver and machine CSV files use stable IDs and 0-100 editor values. Imports
  require the exact category field and are rejected before state mutation when
  schema, range, team reference, or uniqueness validation fails.
- JSON backups include the complete editable category configuration,
  qualifying/points/tire/race rules, exact calendar event overrides, and
  migration history. The registry validator runs again before import. The last
  successful import can be rolled back in memory; **Official baseline**
  restores the checked-in registry package.
- The Rules view directly edits practice duration, mandatory-stop and
  two-compound requirements, championship team scoring, tyre-set allocation,
  qualifying breaks, segment durations/advancement, and all points tables.
  Selecting a calendar row exposes event race count, lap and time limits,
  cancellation, mandatory-stop override, and event points. Remaining fields
  can be changed in the same exported JSON schema without a source-code edit.

## Statistical Acceptance

`npm run validate:montecarlo` executes 10,000 matched-condition samples for
each statistical contract. It verifies:

- a 100-rated driver remains clearly faster than a 70-rated driver in the same
  car and conditions;
- F1 long-run machine order remains correlated with the source data while wet
  specialties can change the order;
- F2/F3 one-make fields remain compact without an artificial team cliff;
- reliability, error control, wet skill, tyre management, overtaking, and
  defending alter outcome distributions through the production simulation
  functions rather than fixed result bonuses.

Heavy- and light-rain machine pace now applies the wet/intermediate rating as a
specialty relative to that machine's normal race pace. Dry running therefore
does not accidentally include a wet-performance blend, while a genuinely good
or poor wet car can move in the order without replacing its baseline car pace.
