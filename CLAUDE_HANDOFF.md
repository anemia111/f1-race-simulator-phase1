# Formula Race Simulator Handoff

## Project

- Path: `C:\Users\yuuki\Documents\Codex\2026-07-09\files-mentioned-by-the-user-f1\outputs\f1-race-simulator-phase1`
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1
- Dev URL: `http://127.0.0.1:5173/`

## User Intent

Build a PC-first F1/F2/F3/SUPER FORMULA observer, timing, and race-control
simulator. It should feel factual and operational rather than like an arcade
driving game.

- Do not add onboard cameras, replay, radio playback, highlights, video, or a
  multi-camera broadcast-production layer.
- Mobile support is intentionally out of scope.
- Use OpenF1/FIA data when it exists and label SIM, historical, live,
  fallback, and unavailable values truthfully.
- Cars remain on one racing line without artificial lateral attack, defence,
  blocking, or overtaking animation.
- Keep rendering light: primitives, no GLB cars, no heavy post-processing, and
  no expensive per-frame domain calculations.

## Data And Factuality

- `src/data/tracks.ts` exposes 24 selectable track packs. The amended FIA
  calendar has 22 championship rounds; Bahrain and Jeddah remain selectable
  but are visibly marked cancelled.
- `src/data/realTrackLayouts.ts` contains 23 OpenF1-derived centerlines and the
  official 2026 MADRING organizer vector. Do not hand-edit its point arrays.
- `src/data/f1Performance.csv` is the canonical F1 10-team/30-driver source on
  a 0-100 scale (20 fielded seats, two per team; the rest are `reserve` rows).
  It includes Ferrari `NAK` car number 31.
- `src/data/motorsportSeries2026.json` is the versioned F2/F3/SF field,
  calendar, tire, points, and qualifying source. The validated relational pool
  contains 110 unique people; do not apply category subtraction at runtime.
- MADRING uses the official 5.416 km / 57-lap specification and 22 numbered
  corners. Its sector boundaries remain labelled derived until the FIA event
  circuit map is published, and it intentionally has no fabricated OpenF1
  telemetry-coordinate projection.
- OpenF1 collection covers drivers, grid/results, laps, sectors, mini-sectors,
  weather, pit/stints, race control, positions, intervals, overtakes, radio,
  car telemetry, location, and championship data when endpoints provide it.
- The top HUD always labels the core race engine `SIM`. Explicit `SIM`, `HIST`,
  and `LIVE` modes prevent observed timing from silently mixing into a SIM
  session; fields also carry source chips.
- Raw OpenF1 location is projected to centerline progress and screened for
  off-track/garage samples. The local lane model owns lateral placement.
- Missing API values use an explicitly labelled SIM estimate; never present a
  model value as observed or official.
- API requests share throttling, cache, retry, and nullable-record handling.
- OpenF1 requests select the actual FP/Q/SQ/Sprint/Race session, support an
  optional in-memory Bearer token, normalize known schema drift, and expose
  endpoint status without persisting credentials.
- Historical mode has one coherent target timestamp for laps, telemetry,
  position, intervals, weather, and race control instead of mixing latest
  samples from different moments.
- `src/data/fiaEventPacks2026.ts` tracks event-page and decision-document
  coverage. Links are not marked as normalized operational values.

## Simulation State

- Sessions: FP1/FP2/FP3, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race.
- Timed sessions start from pit boxes, distinguish out/attack/in laps, run the
  official Q/SQ clocks and breaks, freeze the clock during planned red flags,
  and reduce the 20-car field to the measured top 15/top 10 rather than a
  precomputed order.
- Timed-session adjudication includes deleted track-limit laps, double-yellow
  invalidation, impeding/grid penalties, serialized pit-exit queues, chequered
  lap completion, and Q1 107% checks with explicit steward exemptions.
- Race starts use a moving formation lap, return to grid slots, five lights,
  then launch. Opening laps do not trigger an immediate strategy stop.
- Completed lap records use elapsed timing-line crossing timestamps. Sector
  records always sum to the measured lap. Each lap also persists 24 measured
  mini-sector intervals; the first car through is provisionally purple and a
  later faster interval moves the old purple to personal-best green.
- Tire wear is percentage-based with compound, pace, weather, thermal, damage,
  and driver-management effects. Strategy reads measured wear and brake heat.
- Rain intensity and track grip transition continuously rather than jumping at
  four-minute boundaries. Inters and wets use different crossover ranges.
- 2026 active aero and electrical Overtake are separate systems. The Energy
  Store tracks MJ, SOC, charge/discharge power, conversion losses, recovery,
  deployment, and component temperatures. Speed, throttle, brake, RPM, gear, tire
  temperature, wear, and brake temperature are live car state. OpenF1 `drs`
  remains visibly labelled as a raw historical/API field.
- Strategy includes traffic, undercut/overcut, SC/VSC, weather forecast,
  tire-condition, brake-cooling, damage, and manual calls. A short-horizon
  expected-loss model compares degradation, control-phase savings, rejoin
  traffic, and double-stacking once per lap.
- F1 FIA 2026 tire allocations:
  - Standard: `H2/M3/S8/I5/W2`
  - Sprint: `H2/M4/S6/I6/W2`
- F2 uses Prime/Option (`H3/S2`), F3 uses four sets of one dry specification,
  and SUPER FORMULA uses one Yokohama dry specification. Category labels and
  inventory are defined by the series registry, not inferred from F1.
- Cars stay centered on one racing line. Battle outcomes are evaluated once
  per 1/12-lap segment and use actual mapped DRS-zone/sector position without
  adding lateral presentation offsets.
- Pit stops include entry/exit interpolation, boxes, tire-set consumption,
  double-stack delay, unsafe release, speed violations, repairs, and serving
  owed penalties.
- Race control includes yellow/VSC/SC/red, restart effects, track limits,
  investigations, penalties, retirement, and post-race classification.
- Local yellow and timed-session double-yellow states are published separately
  for sectors 1/2/3. Only the affected sector slows and suppresses racing; the
  dashboard and 3D trace show the same state. OpenF1 sector/scope fields map to
  the same display without mixing observed and SIM flag sources.
- Drive-through and stop-and-go penalties use dedicated pit services, service
  deadlines, and disqualification when unserved. Low-power starts trigger a
  rear warning light and an MGU-K event.
- Contact investigations resolve deterministically to no further action, +5s,
  or +10s; independent penalties remain additive and can be served at stops.
- Event history retains 100 SIM events; the scrollable UI exposes the newest
  30 or the newest 30 OpenF1 race-control messages.
- Local championship scoring uses finishing position, the FIA 90% classified
  distance threshold, and race-result countback for tied points.
- Component condition, allocations, replacement penalties, and pending grid
  drops persist in season garage state between rounds.

## 3D And UI

- `RaceScene` is lazy-loaded and uses lightweight Three.js primitives for cars, track, kerbs,
  runoff, barriers, pit lane/boxes, grid slots, corner numbers, marshal posts,
  DRS markers, and safety-car lines.
- Scene text uses canvas sprites rather than font geometry. Overview mode uses
  reduced vehicle detail for unselected cars, while kerb/runoff, grid, pit-box,
  and marshal geometry is instanced to reduce draw calls.
- Sector boards, live timing, OpenF1, race control, classification, analysis,
  and setup start closed.
- The map overlays a five-column start gantry during the grid, sequential red
  light, and lights-out phases. Safety Car rolling starts suppress it.
- Timing includes lap/gap/interval, tire/age, sectors, progressive mini-sectors,
  battery, speed, throttle, brake, RPM, gear, active aero/Overtake, temperature,
  and source labels. Purple is session best, green personal best, yellow slower.
- Mini-sector states use distinct patterns as well as colors and expose an
  accessible per-sector summary. Forced-colors mode remains legible.
- The race-control panel exposes S1/S2/S3 status independently, and active
  local flags thicken and relabel the affected 3D sector trace.
- Analysis includes tire condition, strategy outlook, manual box compound,
  push/standard/save/defend pace, lap history, championship, and track profile.
- A dedicated Web Worker owns a deterministic 50ms fixed tick and publishes
  immutable snapshots at 10Hz. A main-thread fallback uses the same cadence.

## Important Files

- `src/App.tsx`: orchestration, data-source labels, timing and controls.
- `src/types.ts`: domain types.
- `src/data/tracks.ts`: calendar and derived operational markers.
- `src/data/calendar2026.ts`, `trackAudit.ts`, `sourceRegistry.ts`: amended
  calendar, 24-pack validation, and source ledger.
- `src/data/realTrackLayouts.ts`: generated real circuit geometry.
- `src/data/f1Performance.csv`: canonical F1 10-team/30-driver source values.
- `src/data/motorsportSeries2026.json`: F2/F3/SF data and category rules.
- `src/series/seriesRegistry.ts`: validated packages, pool, and assignments.
- `src/data/performanceCsv.ts`: strict parser, validator, and domain mapping.
- `scripts/generate-real-track-layouts.mjs`: layout generator.
- `src/services/openF1.ts`: OpenF1 request/bundle logic.
- `src/services/openF1Location.ts`: sample projection to track progress.
- `src/services/openF1Performance.ts`: factual field calibration inputs.
- `src/services/openF1Timeline.ts`: coherent historical playback range/target.
- `src/data/fiaEventPacks2026.ts`: FIA event document coverage ledger.
- `src/simulation/race.ts`: core state advance loop.
- `src/simulation/energySystem.ts`: physical Energy Store state and power flow.
- `src/domain/sectorTiming.ts`: measured best/personal-best classification and
  timed-lap eligibility.
- `src/workers/raceWorker.ts`: fixed-tick simulation ownership.
- `src/domain/dataMode.ts`: SIM/HIST/LIVE contract.
- `src/domain/startSignal.ts`: five-light and lights-out presentation state.
- `src/persistence.ts`: V3 save migration and nested season-garage normalization.
- `src/simulation/overtaking.ts`: mapped close-battle outcomes.
- `src/simulation/strategy.ts`: pit and strategy rules.
- `src/simulation/weather.ts`: continuous weather/grip and forecast.
- `src/simulation/qualifying.ts`: timed-session and grid model.
- `src/simulation/weekendTires.ts`: FIA tire allocation and weekend plan.
- `src/simulation/season.ts`: classification, points, countback.
- `src/three/RaceScene.tsx`: scene and vehicle presentation.
- `src/simulation/race.test.ts`: primary simulation regressions.
- `docs/FIA_2026_REGULATION_COVERAGE.md`: article-level official coverage and
  explicit non-public-document boundaries.

## Verification Baseline

```bash
npm run lint
npm run build
npm test
npm run playtest
npm run benchmark
```

- Lint: passed
- Build: passed; the main UI and lazy Three.js scene chunks still emit the
  expected large-chunk warning
- Tests: 391 passed across 44 files
- Playtest: 1440x900 and 1280x720 PC layouts, initial gray timing cells,
  provisional purple timing, S1/S2/S3 control status, WebGL pixels, overlay
  controls, no clipping, and no page overflow
- Benchmark: records renderer identity and does not fail normal runs on
  Chromium SwiftShader; use `BENCHMARK_STRICT=1` only with real GPU rendering

`npm run playtest` starts an isolated preview server. It locates weekend buttons by the
`Set weekend stage to X` title prefix, so preserve that prefix.

## Honest Remaining Limits

1. Active-aero/Overtake, pit, and safety-car operational markers are derived unless a source is
   explicitly labelled authoritative.
2. OpenF1 location/telemetry availability varies by session; keep the SIM and
   unavailable states even when testing with a data-rich historical race.
3. SC/red procedures still simplify some race-director discretion and detailed
   delta enforcement.
4. FIA event packs currently provide a truthful document ledger; most values
   are not yet parsed from PDFs into normalized machine-readable markers.
5. The lazy Three.js scene is about 0.93 MB minified. It no longer blocks the
   initial UI bundle, but Three.js remains the largest download.

## Guardrails

- Preserve user changes; never reset the worktree.
- Use `apply_patch` for manual edits.
- Keep simulation state separate from render objects.
- Keep OpenF1 values nullable and source-labelled.
- Derive randomness from the seed helpers.
- Add numeric realism tests for model changes.
- Run all five verification commands before handoff.
