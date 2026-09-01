# Formula Race Simulator Handoff

## Project

- Path: `C:\Users\yuuki\Documents\Codex\2026-07-09\files-mentioned-by-the-user-f1\outputs\f1-race-simulator-phase1`
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1
- Dev URL: `http://127.0.0.1:5173/`

## User Intent

Build a PC-first F1/SUPER FORMULA observer, timing, and race-control
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
- `src/data/measuredRoadProfiles.ts` contains reproducibly generated 96-station
  public-geodata profiles for Zandvoort, Silverstone, Suzuka, Motegi,
  Autopolis, Fuji, and SUGO. Elevation is observed/interpolated, grade is
  derived, and Zandvoort alone currently has low-confidence generated banking
  and a 10 m OSM width tag. These are not FIA circuit-dossier surveys.
- `src/data/f1Performance.csv` is the canonical F1 11-team/30-driver source on
  a 0-100 scale (22 fielded seats, two per team; the rest are `reserve` rows).
  Cadillac is present, and Ferrari `NAK` retains car number 31.
- `src/data/motorsportSeries2026.json` contains only executable F1/SF series
  packages. `src/data/historicalDriverPool2026.json` retains all 52 former
  F2/F3 identities as provenance-only history. The validated relational pool
  contains 110 unique people and 111 provenance records.
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
- OpenF1 clean race laps enrich tire, stint, sector, and field calibration but
  never replace the neutral physical base lap. Those samples already include
  fuel, tire, traffic, and weather effects, so rebasing onto one and applying
  the simulation effects again would double-count pace loss.
- `src/data/fiaEventPacks2026.ts` tracks event-page and decision-document
  coverage. Links are not marked as normalized operational values.
- `src/data/calibration` stores versioned, source-backed 2026 event records for
  all 22 active F1 rounds and the current SUPER FORMULA circuits.
  `src/data/paceReferences2026.ts` is only the legacy adapter. Official Q3
  classifications, classified clean OpenF1 race laps, derived values, future
  estimates, and unavailable values retain separate status/confidence fields.
  The update and 100-seed inverse-calibration workflow is documented in
  `docs/PACE_CALIBRATION_2026.md`.

## Simulation State

- Sessions: FP1/FP2/FP3, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race.
- Timed sessions start from pit boxes, distinguish out/attack/in laps, run the
  official Q/SQ clocks and breaks, freeze the clock during planned red flags,
  and reduce the 22-car F1 field to the measured top 16/top 10 rather than a
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
- SUPER FORMULA uses one Yokohama dry specification. Category labels and
  inventory are defined by the series registry, not inferred from F1.
- Cars carry bounded physical lateral position/velocity and reserve attack,
  defence, yield, and avoidance corridors. Battle outcomes are evaluated once
  per 1/12-lap segment and use the actual mapped activation-zone/sector
  position.
- A close pack below 1.9 seconds receives smoothly fading tow/pace support,
  capped at 0.9 seconds per lap. Once the train breaks, each car returns to its
  own projected pace. A formal pass outcome now converts the attacker's relative
  gain into bounded defender braking/line-concession loss; it never accelerates
  the attacker beyond the physical speed ceiling. Lateral occupancy must still
  clear and the pass event is emitted only after distance order crosses.
- Pit stops include entry/exit interpolation, boxes, tire-set consumption,
  double-stack delay, unsafe release, speed violations, repairs, and serving
  owed penalties. F1 teams use distinct pit-crew ratings derived from the
  official 2025 DHL fastest-stop results; legacy saves with the old uniform
  rating migrate automatically while non-uniform custom ratings are preserved.
- Race control includes yellow/VSC/SC/red, restart effects, track limits,
  investigations, penalties, retirement, and post-race classification.
- VSC compliance treats the delta as a minimum sector time. `vscPaceScaleForDelta`
  never commands more than `vscMinimumTimePace`, so banked delta buys a return to
  the delta pace and not to racing pace; `calculateCarTelemetry` caps the VSC
  target at the plain local reference speed, keeping straight-line headroom and
  car performance out of it; and `VSC_DEPLOYMENT_ALLOWANCE_SECTORS` in `race.ts`
  gives each car two marshalling sectors to reach the delta before judging
  starts, because braking from racing speed is not speeding. A car that keeps
  racing is still judged from the allowance onwards. Without these three, one VSC
  deployment penalised 17 of 20 cars.
- Local yellow and timed-session double-yellow states are published separately
  for sectors 1/2/3. Only the affected sector slows and suppresses racing; the
  dashboard and 3D trace show the same state. OpenF1 sector/scope fields map to
  the same display without mixing observed and SIM flag sources.
- Single and double yellow have distinct map labels and pace reductions. A
  disabled, off-track, or incident-delayed car is excluded from neutralisation
  queue ordering, allowing the entire following field to clear the obstruction
  while preserving order behind the last unaffected car. Explicit on-track and
  off-track stopped states drive the staged response: local double yellow first,
  then SC for a track obstruction or VSC for an off-track recovery under the
  simulator's race-director policy.
- Off-track cars wait at the excursion point until a deterministic recovery
  delay has elapsed and traffic gaps ahead and behind are safe, then rejoin at
  reduced speed. Blue flags use physical proximity to the next lapping
  boundary and appear only once the lapping car is within three seconds, rather
  than firing merely because a one-lap deficit exists.
- Q1/Q2/Q3 and SQ1/SQ2/SQ3 use the dedicated qualifying machine and driver
  performance axes. FP, Sprint, and Race use the long-run/race axes, so setup
  data can change single-lap and race pace independently.
- Fixed-seed pace acceptance uses 100 qualifying seeds and, for completed
  races, 100 race seeds. Official top-three Q3 medians stay within 0.3 seconds,
  pole within 0.351 seconds, field spread within 0.6 seconds, and classified
  clean green-race pace within 0.7 seconds. Winner event averages remain
  contextual because they include stops and neutralisations.
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
- The workspace is two columns: the leaderboard on the left, the circuit map
  filling the right. The sidebar holds only Data and Settings; Data toggles the
  right-hand area between the map and the source ledger.
- The leaderboard is the timing tower: position, tyre and life, gap/interval,
  last and best lap, the three measured sector times each with its own eight
  mini-sectors as a bar beneath it, completed stops, compounds used, speed and
  battery. Purple is session best, green personal best, yellow slower.
- Mini-sector states use distinct patterns as well as colors and expose an
  accessible per-sector summary. Forced-colors mode remains legible.
- The map overlays a five-column start gantry during the grid, sequential red
  light, and lights-out phases. Safety Car rolling starts suppress it.
- Active local flags thicken and relabel the affected 3D sector trace, and the
  map header carries the current flag state.
- The separate Timing, Telemetry, Track, Tyres, Messages, Drivers and Season
  destinations, the right-hand rail (race control, conditions, message log,
  fastest lap) and the `?layout=legacy` layout were all removed as duplicates of
  the leaderboard and the map. Do not reintroduce them without a reason the
  leaderboard cannot serve.
- Analysis includes tire condition, strategy outlook, manual box compound,
  push/standard/save/defend pace, lap history, championship, and track profile.
- The footer PIT WALL button opens a race-engineering overlay for the selected
  car: OVERVIEW, LAP LOG, STRATEGY, CAR SYSTEMS, WEATHER & TRACK, and RACE
  CONTROL tabs over a persistent BOX S/M/H/I/W and PUSH/STD/SAVE/DEFEND command
  bar. It closes on Escape and is mutually exclusive with Classification and
  Race analysis.
- The pit wall is available in every session and in Free Mode, not only the
  race. `pitWallSessionFor` in `src/domain/pitWall.ts` is the single place that
  decides what a session may show: practice and qualifying have no race
  distance, so the stint plan, rejoin projection, grid slot, and lap-of-total
  counter report `N/A` instead of being computed against a distance the session
  will never run. The pit-lane transit cost, the pit lane state, and the tyre
  allocation are physical facts and stay live in every session.
- The panel covers the timing tower rather than the 3D map, because the track
  picture has no substitute elsewhere on screen. That makes the tower
  unclickable while it is open, so the panel header carries its own
  previous/next car selector, which moves the app-wide selection too.
- LAP LOG lists every completed lap with its three measured splits, tyre, and
  position. The car's own fastest lap and fastest split are marked, and a
  deleted lap is struck through and can never own a personal best.
- Every pit-wall read-out carries a source chip and shows `--`, `N/A`, or
  `UNAVAILABLE` rather than a value the simulator does not hold. F1-only
  systems (hybrid Energy Store, 2026 active aero) report `N/A` outside F1.
  Electrical Overtake is labelled separately from active aero.
- `src/hooks/usePitStrategyOutlook.ts` is the single owner of the pit-loss,
  rejoin, and `strategyOutlookFor` read-out shared by race analysis and the pit
  wall. `src/domain/pitWall.ts` owns the component-condition thresholds, the
  session capability set, the lap-log derivation, and the race-control
  classification; do not re-derive any of them in a component.
- A dedicated Web Worker owns a deterministic 50ms fixed tick and publishes
  immutable snapshots at 10Hz. A main-thread fallback uses the same cadence.

## Free Mode

- Free Mode is `ApplicationMode = 'free'`, not a `SeriesId`. Championship mode
  remains the owner of points, calendar progress, OpenF1 enrichment, and
  category-specific saved configuration.
- The builder supports F1/SUPER FORMULA, the deduplicated F1 plus SF
  physical-track union, Practice/Qualifying/Race, 1-40 entrants, weather,
  distance/time, seed, manual/random/qualifying grids, all 110 pool drivers,
  repeated source vehicles, and optional equal cars.
- Driver identity and car number must be unique. Source teams may repeat; each
  entrant receives a deep-cloned synthetic team so mutable race state never
  leaks between duplicate vehicles.
- Cross-category circuits retain the selected category's tire, overtake,
  active-aero, qualifying, and machine rules. Non-native lap pace and any
  generated control zones carry `simulated`/`fallback` provenance in the Data
  view instead of pretending to be official.
- A cross-category circuit that has its own category x course baseline uses it
  and reports `freeModeProvenance.pace = 'category-reference'`. Motegi, Fuji,
  SUGO, and Autopolis carry F1 baselines of their own, so an F1 Free Mode
  session there no longer inherits the SUPER FORMULA base lap time. Validate
  with `node scripts/validate-f1-support-circuits.mjs --enforce`; the target
  windows, seed counts, and twelve measured families live in
  `docs/PACE_CALIBRATION_2026.md`.
- A practice session runs FP1, FP2, or FP3, chosen in the builder and defaulting
  to FP1 so stored version-1 configurations keep their behaviour. The sessions
  are not interchangeable: FP1 starts from an unlearned setup on heavy fuel
  (`practiceBestOffset` 2.4s against FP3's 0.35s), so a representative
  light-fuel attack belongs to FP2/FP3. At Fuji the same 20-car field reads
  1:23.4 in FP1, 1:19.0 in FP2 and 1:20.8 in FP3; a single session varies by
  around a second and a half, and the 100-seed FP3 median is 1:19.0.
- Qualifying adapts to entrant count. Standard fields preserve the familiar
  22→16→10 and 20→15→10 shapes; small fields collapse safely to fewer
  segments. A compatible completed result can seed a later Free race.
- Free sessions force `SIM`, disable HIST/LIVE and OpenF1 requests, award no
  championship points, and use a separate race checkpoint.
- Version-1 current state, presets, and checkpoint keys are
  `race-sim-free-mode-v1`, `race-sim-free-mode-presets-v1`, and
  `race-sim-free-race-checkpoint-v1`. Invalid, oversized, duplicate, stale,
  and category-mismatched payloads are rejected or safely discarded.
- The 40-car UI is internally scrollable and shows both driver code and unique
  car number. Runtime tests cover one-car timed sessions, 30/40-car sessions,
  cross-category tracks, race-control procedures, and a full-field pit wave.

## Important Files

- `src/App.tsx`: orchestration, data-source labels, timing and controls.
- `src/types.ts`: domain types.
- `src/components/FreeModeBuilder.tsx`: desktop session builder and preset UI.
- `src/freeMode/types.ts`: independent mode/configuration contracts.
- `src/freeMode/freeModeRegistry.ts`: registry union, scalable rules, and
  validated conversion into the existing `RaceConfig`.
- `src/freeMode/freeModeValidation.ts`: bounded parser and semantic validation.
- `src/freeMode/freeModePersistence.ts`: isolated state, presets, and
  checkpoint keys.
- `src/data/tracks.ts`: calendar and derived operational markers.
- `src/data/paceReferences2026.ts`: factual/estimated qualifying and
  full-event race-average pace benchmarks.
- `src/data/calendar2026.ts`, `trackAudit.ts`, `sourceRegistry.ts`: amended
  calendar, 24-pack validation, and source ledger.
- `src/data/realTrackLayouts.ts`: generated real circuit geometry.
- `src/data/measuredRoadProfiles.ts`: generated public elevation/grade and
  partial banking/width profiles for seven circuits.
- `src/data/f1Performance.csv`: canonical F1 11-team/30-driver source values.
- `src/data/motorsportSeries2026.json`: executable F1/SF category rules and SF
  field; `historicalDriverPool2026.json`: former F2/F3 pool provenance.
- `src/series/seriesRegistry.ts`: validated packages, pool, and assignments.
- `src/data/performanceCsv.ts`: strict parser, validator, and domain mapping.
- `src/data/f1PitCrewCalibration.ts`: source-backed F1 pit-crew calibration.
- `scripts/generate-real-track-layouts.mjs`: layout generator.
- `scripts/generate-measured-road-profiles.mjs`: reproducible OSM/AHN/EA/GSI
  physical-road profile generator (`npm run generate:road-profiles`).
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
- `src/simulation/incidentTraffic.ts`: stopped-car location and queue rules.
- `src/simulation/trackRejoin.ts`: deterministic traffic-gap checks for safe
  off-track recovery.
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
npm run validate:montecarlo
npm run benchmark
```

- Lint: passed
- Build: passed; the main UI and lazy Three.js scene chunks still emit the
  expected large-chunk warning
- Tests: 621 passed across 61 files. The heaviest suites
  (`retirementCalibration`, `raceStability`, `race`, `freeModeRuntime`) assert
  against per-test timeouts, so under a saturated machine they time out rather
  than fail an assertion. Re-run those files alone before treating a timeout as
  a regression
- Playtest: 1440x900 and 1280x720 PC layouts, initial gray timing cells,
  provisional purple timing, S1/S2/S3 control status, WebGL pixels, overlay
  controls, no clipping, no page overflow, plus a valid and scrollable 40-car
  Free Mode build with unique visible numbers and SIM-only data mode
- Playtest also drives the pit wall: every tab, the race-control filters, an
  applied BOX call and pace instruction read back off simulation state, Escape
  and close-button dismissal, the in-panel car selector moving the app-wide
  selection, the lap log's measured lap and sector columns, an untouched track
  map, the `N/A` race-only rows in FP1 and qualifying, the panel opening in
  Free Mode, and `N/A` F1-only systems in SF. `npm run playtest` previews
  the existing `dist`, so run `npm run build` first after any UI or CSS change
- Monte Carlo: 6 acceptance groups passed across 10,000 matched-condition
  production-model samples
- Benchmark: records the normal field and 40-car Free Mode, including renderer
  identity. The latest Chromium SwiftShader run measured about 58 fps for 22
  cars and 43 fps for 40 cars at 60x, with no page errors; use
  `BENCHMARK_STRICT=1` only with real GPU rendering.

`npm run playtest` starts an isolated preview server. It locates weekend buttons by the
`Set weekend stage to X` title prefix, so preserve that prefix.

## Honest Remaining Limits

1. Active-aero/Overtake, pit, and safety-car operational markers are derived unless a source is
   explicitly labelled authoritative.
2. OpenF1 location/telemetry availability varies by session; keep the SIM and
   unavailable states even when testing with a data-rich historical race.
3. SC/red procedures still simplify some race-director discretion and detailed
   delta enforcement.
4. FIA event packs provide a truthful document ledger. Values absent from the
   normalized supplied packs remain closed as unavailable; they must not be
   inferred from another event or circuit.
5. Public DSM/DEM road profiles are lower-confidence physical inputs, not FIA
   homologation survey data. Exact circuit friction, drainage, kerb/runoff
   geometry, and F1/SF tyre relaxation parameters remain unavailable.
6. The lazy Three.js scene is about 0.93 MB minified. It no longer blocks the
   initial UI bundle, but Three.js remains the largest download.

## Guardrails

- Preserve user changes; never reset the worktree.
- Use `apply_patch` for manual edits.
- Keep simulation state separate from render objects.
- Keep OpenF1 values nullable and source-labelled.
- Derive randomness from the seed helpers.
- Add numeric realism tests for model changes.
- Run all six verification commands before handoff.
- Read exit codes directly. Piping a verification command into `tail` or `head`
  reports the pipe's status, not the command's, and has already produced a
  false "clean" for a failing lint.

## Closure state

The straight-against-corner investigation is complete and archived in
`docs/NEXT_SESSION_PACE_CALIBRATION.md`: complete-lap marginal MGU-K allocation
reduced calibration lap MAE to 1.181 s and the one-time holdout MAE to 2.646 s
without changing a production coefficient or adding a track multiplier.

Phase 6 measured inputs are either source-backed or explicitly unavailable.
Its public-geodata follow-up now supplies seven elevation/grade profiles plus
partial Zandvoort banking/width with per-field provenance; unpublished numeric
friction and tyre-transient values remain fail-closed.
Phase 7 now consumes its causal inbox, persists bounded category experience and
the latest decision record, and retains `legacy-direct` as rollback. Local
yellow order is explicitly enforced while passable obstructions remain
exempt. No known implementation phase remains open; the numbered limits above
are source/discretion/bundle boundaries, not hidden completion claims.
