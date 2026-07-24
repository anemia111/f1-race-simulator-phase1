# Formula Race Simulator

PC-first F1, Formula 2, Formula 3, and SUPER FORMULA race-control and timing
simulator built with React, TypeScript, Vite, Three.js, and React Three Fiber.
It is an observer simulation, not a driving game or a broadcast-video renderer.

## Current Features

- Four selectable 2026 categories with independent fields, calendars,
  qualifying, points, tire rules, overtake systems, and saved championships.
  The relational driver pool contains 110 unique people.
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
- A canonical checked-in F1 performance CSV supplies 10 teams and a 20-car
  field, two per team. Its 0-100 values are retained verbatim, including Yuki
  Nakayama (`NAK`) at Ferrari car number 31. Drivers without a seat stay in the
  file as `reserve` rows, so they keep their authored ability axes and remain
  available in the pool. F2/F3/SF fields live in the versioned series registry.
- FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race session flows. Madrid F3 adds a
  second qualifying and second Feature Race with independent grids. The 20-car
  F1 qualifying field runs 18/15/13-minute periods and cuts to 15, then 10.
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
  for article-level coverage and non-public-document boundaries.
- One normal racing line with no artificial lateral weaving. Battle checks run
  in 12 lightweight track segments per lap.
- Dense live timing with lap-numbered CPU sector measurements, progressive
  comparative mini-sectors, telemetry, source chips, race control,
  classification, analysis, and manual strategy controls.
- Independent S1/S2/S3 flag states for local yellow, double yellow, VSC, SC,
  and red phases, synchronized between pace control, OpenF1 race control,
  dashboard status, and the 3D circuit trace.
- Minor contact remains a sector-local yellow. VSC, Safety Car, and red-flag
  escalation requires a stopped or obstructing car, and cars in clear sectors
  retain green-flag pace.
- Neutralised-race strategy prices SC and VSC pit loss separately, rejects a
  VSC opportunity that will end before pit entry, preserves the VSC tyre-only
  service restriction, and splits calls by traffic, track position, tyre state,
  team profile, available sets, and double-stack risk.
- Integrated acceleration now produces representative dry maxima above the old
  260 km/h plateau, while 420-class speed remains limited to favorable long
  straights with low drag, low fuel, tow, and ERS deployment.
- Each category tops out near its real machine. Extra straight-line drag, which
  rises with speed and so bites only at the top end, brings race top speeds to
  roughly F1 360, F2 335, SUPER FORMULA 315, and F3 300 km/h without changing
  the cornering pace the lap-time multipliers already set.
- Driver abilities use one 0-100 source scale across all categories without
  runtime category subtraction. Machine and driver performance stay separate.
  The stored support-series ratings are already rebased against the F1 field, so
  the ladder reads F1 78-100, SUPER FORMULA 66-79, F2 65-75, and F3 54-66. A
  driver carries their own rating into whichever category they race in.
- Any of the 110 pool drivers can be signed into any category from the data
  manager. Each field is fixed at its `carCount`, so signing replaces an
  existing seat and the incoming driver inherits that car number and team.
  Drivers who already hold a rated seat keep their authored ability axes rather
  than having them re-estimated from `overall`.
- Machine pace axes keep their CSV values for display and auditing. The
  physical simulation expands axis deviations by 35% around the reference car
  and applies a wider local response so team differences are clearer in
  corners, acceleration, braking, and speed.
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
npm run benchmark
```

`npm run playtest` serves the latest `dist` build on an isolated local preview.
Use `npm run playtest:dev` to target an already-running server. It checks 1440x900 and
1280x720 PC layouts, WebGL pixels, overlay controls, and panel overlap. Screenshots
go to the OS temporary directory by default; set `QA_ARTIFACT_DIR` to retain them
at a specific location.
`npm run benchmark` records 60x frame rate, long tasks, DOM size, canvas pixels,
renderer identity, and optional Chromium heap usage. It prints JSON to stdout and
only writes a file when `BENCHMARK_REPORT` specifies a path.
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

## Collaboration

Read `CLAUDE_HANDOFF.md` before editing with Claude Code or another agent.
`CLAUDE.md` contains the short editing contract, and
`docs/CLAUDE_START_PROMPT.md` contains a ready-to-send handoff prompt.
The multi-series source and rule boundary is documented in
[`docs/MULTI_SERIES_2026.md`](docs/MULTI_SERIES_2026.md).
