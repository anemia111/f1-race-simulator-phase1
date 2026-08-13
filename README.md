# Formula Race Simulator

PC-first F1 and SUPER FORMULA race-control and timing simulator built with
React, TypeScript, Vite, Three.js, and React Three Fiber. Formula 2 and Formula
3 identities remain available in the historical driver pool, but those series
are not executable. It is an observer simulation, not a driving game or a
broadcast-video renderer.

## Current Features

- Two executable 2026 series—F1 and SUPER FORMULA—with independent fields,
  calendars, qualifying, points, tyre rules, overtake systems, and saved
  championships. The relational driver pool contains 110 unique people,
  including provenance-only F2/F3 identities.
- 24 selectable F1 circuit packs: 23 OpenF1-derived centerlines plus the official
  2026 MADRING organizer vector. The current FIA calendar is 22 rounds after
  the Bahrain/Jeddah cancellation.
- The domestic support-series circuits (Motegi, Autopolis, Fuji, SUGO) use
  surveyed OpenStreetMap centerlines rather than placeholder vectors. Each
  generated chain is length-checked against the published lap distance before it
  is written out, and every one currently lands within 0.9%. Progress 0 sits
  about two thirds of the way down the pit straight, which is located from the
  geometry, calibrated against the official Fuji layout: its distance profile
  puts turn one roughly 0.5 km past the line, and the generated centerline
  reproduces that at 0.53 km. Each circuit derives its own timing sectors by
  splitting the lap into three roughly equal stretches of running time. Both are
  derived values, not published timing-line positions. Regenerate with
  `npm run generate:support-tracks`. Track geometry is © OpenStreetMap
  contributors under the ODbL.
- A canonical checked-in F1 performance CSV supplies 11 teams, including
  Cadillac, and a 22-car field, two per team. Its 0-100 values are retained
  verbatim, including Yuki Nakayama (`NAK`) at Ferrari car number 31. Drivers
  without a seat stay in the file as `reserve` rows, so they keep their
  authored ability axes and remain available in the pool. SUPER FORMULA is the
  second executable series; F2/F3 identities live only in the historical pool.
- FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race session flows. The 22-car
  F1 qualifying field runs 18/15/13-minute periods and cuts to 16, then 10.
  Each dry qualifying attempt uses a Soft-tyre out lap, full-attack lap, and
  in lap before returning to the garage, with attack-specific ERS deployment.
- Moving formation lap, grid return, five-light start, and timed line-crossing
  lap records, including aborted starts, pit-lane starts, and standing/rolling
  red-flag restarts.
- A map-overlay start gantry follows the actual grid and five-light phases,
  illuminates one red group per second, and clears at lights out.
- Fixed-tick Worker race model for pace, tires, Rain Hazard/Low Grip control,
  2026 active aero, Overtake, ERS, battery,
  brakes, expected-loss strategy, pit stops, flags, incidents, procedural
  penalties, and stewarding.
- FIA 2026 public ERS power curves, a physical 4 MJ usable Energy Store,
  charge/discharge efficiency, thermal derating, recharge limits,
  wet Safety Car starts, full-wet mandates, blue-flag yielding, and a visible
  Safety Car leading the queue. See
  [`docs/FIA_2026_REGULATION_COVERAGE.md`](docs/FIA_2026_REGULATION_COVERAGE.md)
  for article-level coverage and non-public-document boundaries, and
  [`docs/F1_ERS_ENERGY_SUPERCLIPPING.md`](docs/F1_ERS_ENERGY_SUPERCLIPPING.md)
  for the CU-K/shaft/Energy Store accounting boundaries.
- One normal racing line with no artificial lateral weaving. Battle checks run
  in 12 lightweight track segments per lap.
- The leaderboard is the timing tower: order, tyre life, gap/interval, last and
  best lap, the three measured sector times, and each sector's eight
  progressive mini-sectors as a bar under its own sector time, plus speed and
  battery. The whole 24-part lap is read where the field order is read.
- Two columns: the leaderboard on the left and the circuit map filling the
  right. Both stay deliberately dense. The sidebar is down to Data and
  Settings; Data toggles the right-hand area between the circuit map and the
  source ledger, and everything else the sidebar used to reach was either
  duplicated by the leaderboard or removed.
- Duplicated destinations and panels were dropped rather than shown twice: the
  Timing, Telemetry, Track, Tyres, Messages, Drivers and Season destinations
  are gone, along with the old right-hand rail (race-control status,
  conditions, message log, fastest lap).
- The leaderboard also carries completed pit stops and the compounds each car
  has used, so the strategy picture reads from the timing tower.
- Source chips, classification, analysis, and manual strategy controls remain
  available from the footer controls and the Data destination.
- Independent S1/S2/S3 flag states for local yellow, double yellow, VSC, SC,
  and red phases, synchronized between pace control, OpenF1 race control,
  dashboard status, and the 3D circuit trace.
- Running wide is common, but only a small share of track-limit infringements
  escalates into leaving the circuit and waiting for a safe gap, so a race
  reads as racing rather than a run of excursions.
- A single yellow lifts the field about twenty km/h through the marshalling
  zone rather than reducing it to a crawl; a double yellow slows it further.
  Any car carrying accident damage stops acting as the queue reference, so the
  field drives around it instead of the whole train bunching up behind one
  car's incident.
- A car that has gone off rejoins as soon as nothing is within three seconds
  behind it, and in any case within five seconds of the accident, so an
  excursion costs time rather than the race. On the opening lap the field is
  still one bunch, so a car that goes off there waits for the whole pack to go
  by and rejoins at the back instead. Cars caught in the same accident never
  count as traffic for each other, and a crashed car that has dropped out of
  the pack is not part of the pack to wait for.
- Minor contact remains a sector-local yellow. VSC, Safety Car, and red-flag
  escalation requires a stopped or obstructing car, and cars in clear sectors
  retain green-flag pace. A collision both cars drive away from is worked under
  a local yellow: nothing is stranded, so the race is not neutralised.
- Neutralised-race strategy prices SC and VSC pit loss separately, rejects a
  VSC opportunity that will end before pit entry, preserves the VSC tyre-only
  service restriction, and splits calls by traffic, track position, tyre state,
  team profile, available sets, and double-stack risk.
- A Safety Car stop is taken on the lap the Safety Car is called, while the
  field is still strung out. Once the queue has formed, the cars that stayed
  out are nose to tail and a stop a lap later rejoins behind all of them, so
  only cars near the tail of the field still take it.
- Lapped cars are waved past under the Safety Car: eligibility is frozen at the
  prescribed Safety Car Line crossing, only the named cars may pass, and the
  restart waits for them to rejoin the back of the queue.
- Blue flags wait until the lapping car is genuinely on the gearbox rather than
  merely a lap ahead somewhere on the circuit.
- Wet-weather tyres are fitted from the measured state of the racing line, not
  from a forecast: a dry line never receives intermediates or wets, and a
  forecast can only bring a stop forward once rain is falling or water is
  already standing.
- Integrated acceleration now produces representative dry maxima above the old
  260 km/h plateau, while 420-class speed remains limited to favorable long
  straights with low drag, low fuel, tow, and ERS deployment.
- F1 and SUPER FORMULA use separate physical vehicle packages. Their lap pace
  is a model result; the runtime contains no series-level lap-time multiplier.
- Driver abilities use one 0-100 source scale across all categories without
  runtime category subtraction. Machine and driver performance stay separate.
  F2/F3 ratings retained from the former registry are explicitly marked
  synthetic, with source season/team/number history. A driver carries the same
  ratings into either executable category without an origin-series modifier.
- Any of the 110 pool drivers can be signed into either category from the data
  manager. Each field is fixed at its `carCount`, so signing replaces an
  existing seat and the incoming driver inherits that car number and team.
  Drivers who already hold a rated seat keep their authored ability axes rather
  than having them re-estimated from `overall`.
- Machine pace axes keep their CSV values for display and auditing. The
  physical simulation expands axis deviations by 35% around the reference car
  and applies a wider local response so team differences are clearer in
  corners, acceleration, braking, and speed.
- A genuine top-of-the-scale ace (race pace in the very top ~97-100 band) gains
  an extra pace tier on top of the normal calibration, so a standout number-one
  driver can win on pure skill even in a car that is not the fastest. The bonus
  is zero from the midfield down, leaving junior categories and the rest of the
  F1 field on their normal spread. Ferrari `NAK` (car 31, race pace 100) is that
  number-one and dominates by driver skill while Ferrari itself stays a
  second-tier machine; his team-mate in the same car runs midfield. Because a
  field-dominating leader runs in clean air and shortens the race a little,
  total field attrition sits toward the low end of the modern range.
- Explicit SIM/HIST/LIVE modes for OpenF1 timing, telemetry, weather,
  race-control, position, pit/stint, radio,
  result, and championship enrichment with SIM/HIST/LIVE source separation.
- FIA 2026 standard/sprint tire allocations, 90% race classification, support
  series reduced-distance and fastest-lap points, and championship race-result
  countback. Calendar-event save keys keep repeated SUPER FORMULA rounds
  separate; its replacement Round 3 is 25 laps at Fuji using the Autopolis
  qualifying reference. PU/gearbox condition and replacement penalties carry
  across rounds.
- Grid tire choices vary by available sets, stint demand, team/driver risk,
  and the wet crossover while remaining legal for the current track state.
- The Tyres view adds a race-session stint timeline: one compound-coloured bar
  per driver rebuilt from measured lap records, split at pit stops (including
  same-compound changes), with the live stint marked and stop counts alongside
  the per-car tyre table.
- The classification overlay includes a toggleable position-by-lap chart drawn
  from each car's measured lap-line crossings, grid slot included, with the
  second team car dashed so teammates sharing a colour stay readable.
- A Season view in the dashboard sidebar lists the full driver and team
  championship tables for the selected category, ranked with the same FIA
  race-result countback the title uses, with win counts. A driver or team that
  has since left their seat keeps the identity they scored under via the
  immutable result archive.
- Versioned weekend, championship, driver-rating, and OpenF1 cache inputs are
  bounded and schema-checked, so stale or corrupted browser data falls back
  without freezing startup or contaminating standings and calibration.
- Desktop series-data manager for the 110-person relational directory,
  individual and filtered bulk ability edits, full machine edits, team/seat
  changes, validated driver/machine CSV, versioned JSON backup, import rollback,
  machine equalisation, and official-baseline restore. Complete editable
  configurations persist separately for each category.
- Qualifying lap deletion, double-yellow invalidation, impeding, pit-exit
  queues, no-time classification, and steward permissions.
- Historical OpenF1 timeline scrubbing and observed sector, pit-transit,
  maximum-speed, and tire-degradation calibration.
- Date-bounded 2026 OpenF1 standings snapshots through the British Grand Prix
  keep the offline field prior factual without leaking later results into an
  earlier weekend. Fresh API standings replace the bundled snapshot online.
- Overview-mode vehicle LOD plus instanced kerbs, runoff, grid boxes, pit
  boxes, paved pit lane, and marshal equipment for lower draw-call pressure.

## Free Mode

Free Mode is an independent application mode, not a fifth racing category.
Open it with `FREE` in the top bar, build a session, and return to the saved
championship with `CHAMP`.

- Categories: F1 and SUPER FORMULA. Category rules continue to own
  vehicle performance, tires, qualifying format, and overtake/active-aero
  behavior.
- Tracks: the deduplicated union of the F1 and SUPER FORMULA physical circuit
  registries. A non-native category/track combination keeps the chosen
  category's car systems while using a category-specific reference when one is
  available, otherwise an unscaled SIM fallback, and
  explicitly `SIM`-labelled fallback control zones where native markers do not
  exist.
- Field: 1-40 cars selected from all 110 registered people. A vehicle/team may
  be reused by multiple entries, but each driver identity and car number must
  remain unique.
- Sessions: timed Practice, scalable Qualifying, or Race. The standard
  three-part format scales around the normal 22→16→10 and 20→15→10 flows;
  very small fields fall back to fewer segments rather than eliminating every
  entrant.
- Controls: manual, seeded-random, or saved qualifying grid; configurable
  weather, laps or practice duration, seed, category presets, driver/vehicle
  randomization, equal cars, and version-1 JSON import/export.
- Isolation: Free Mode is always `SIM`. It neither reads OpenF1 into the
  session nor awards championship points, advances the calendar, or overwrites
  championship weekend saves. Its checkpoint is also separate.
- Persistence: the current version-1 configuration and compatible qualifying
  result use `race-sim-free-mode-v1`; named presets use
  `race-sim-free-mode-presets-v1`; the running-session checkpoint uses
  `race-sim-free-race-checkpoint-v1`. Imported and restored data is bounded and
  schema-validated before use.
- Scale: pit boxes, grid placement, timing rows, map markers, qualifying cuts,
  SC/VSC/red procedures, and pit processing use the actual entrant count.
  Automated runtime coverage exercises 1, 22, 30, and 40-car fields, including
  cross-category tracks and all 40 cars making a pit stop.

## Run

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Permanent Web App

The permanent production app is published at `https://anemia111.github.io/`
from a separate public deployment repository. The source repository remains
private. Run `npm run publish` to lint, test, build, playtest, sync only
generated assets, push a new deployment, wait for GitHub Pages, and refresh the
desktop shortcut. Codex and Claude completion notes both require this command
at the end of each completed coding batch.

After one complete online load, the simulator shell can reopen from its cache
without a temporary Vite server. OpenF1 network responses are not pre-cached,
so LIVE/HIST data still requires a connection and is never silently presented
as fresh while offline.

## Verify

```bash
npm run lint
npm run build
npm test
npm run playtest
npm run validate:montecarlo
npm run validate:f1-current-generation
npm run validate:energy-balance
npm run validate:superclip
npm run benchmark
```

`npm run playtest` serves the latest `dist` build on an isolated local preview.
Use `npm run playtest:dev` to target an already-running server. It checks 1440x900 and
1280x720 PC layouts, WebGL pixels, overlay controls, and panel overlap. Screenshots
go to the OS temporary directory by default; set `QA_ARTIFACT_DIR` to retain them
at a specific location.
`npm run benchmark` serves the latest `dist` build on an isolated preview and
records 60x frame rate, long tasks, DOM size, canvas pixels, renderer identity,
and optional Chromium heap usage for both the normal F1 field and a 40-car Free
Mode field. Use `npm run benchmark:dev` for an already running server. It prints
JSON to stdout and only writes a file when `BENCHMARK_REPORT` specifies a path.
Software renderers such as SwiftShader are recorded but are not treated as a
hardware frame-rate pass/fail signal. Set `BENCHMARK_STRICT=1` for a real-GPU
threshold run.
The race-engine suite also runs full-distance stability checks at Monaco,
Monza, and Singapore to catch non-finite state, broken ordering, and races
that fail to finish under contrasting circuit and weather demands.
The dedicated Monte Carlo acceptance suite runs 10,000 matched-condition
samples through production pace, tyre, incident, reliability, overtaking, and
defending functions, including one-make field-spread and weather-specialty
checks.

## Data Truthfulness

- The race engine always remains `SIM`.
- OpenF1 enrichment is enabled only for the F1 category; support categories
  use their own registry sources and explicitly labelled simulation values.
- OpenF1 samples are separately labelled `LIVE`, `HIST`, or `SIM` fallback.
- Bundled standings are labelled `SNAP`; API standings are labelled `CAL`.
- Layouts are labelled `Real` or `Fallback`.
- Missing API values never silently become official values; the local model is
  shown as an estimate.
- FIA event pages and decision documents are source links until a field is
  explicitly normalized. A linked document is not treated as imported data.

## 2026 Pace Calibration

Event pace is sourced from the checked-in, versioned calibration records under
`src/data/calibration`. Official qualifying classifications, classified
OpenF1 race samples, derived values, future estimates, and unavailable values
retain separate status and confidence fields. Runtime simulation stays fully
offline and never waits for an API to produce its base pace.

Qualifying is calibrated against the official top-three Q3 median with 100
fixed seeds. Race calibration uses classified clean green-flag laps rather
than winner time divided by race laps, then validates another 100 fixed seeds.
Pit, SC/VSC, yellow, wet, invalid, traffic, and management laps are separated
before the dry race reference is calculated. The dashboard Data panel exposes
the selected values, sample counts, source date, status, and confidence.

```bash
npm run update:pace-calibration
npm run calibrate:pace
npm run validate:pace-calibration
```

See
[`docs/PACE_CALIBRATION_2026.md`](docs/PACE_CALIBRATION_2026.md)
for source boundaries, definitions, completed-event values, acceptance limits,
and the update procedure.

## Collaboration

Read `CLAUDE_HANDOFF.md` before editing with Claude Code or another agent.
`CLAUDE.md` contains the short editing contract, and
`docs/CLAUDE_START_PROMPT.md` contains a ready-to-send handoff prompt.
The multi-series source and rule boundary is documented in
[`docs/MULTI_SERIES_2026.md`](docs/MULTI_SERIES_2026.md).
