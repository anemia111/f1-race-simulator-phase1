## Published integrated preview — 2026-10-17

The user explicitly authorized publication. Deployment a5ead34 / release
20261017T060437Z is live at https://anemia111.github.io/?release=a5ead34.
Read docs/PUBLISHED_INTEGRATED_20261017.md for validation and known limitations.
The final npm run publish -- -SkipFullTestSuite succeeded with browser playtest
ENABLED. Fixed two stale harness assumptions: 21-second pit deadline and only
2 category options. Both viewport pit-stop checks and 40-car Free Mode passed.
Live public category/telemetry/CSV/Suzuka Onboard checks passed with no page errors.
Source repository is still uncommitted/unpushed; generated deployment only.
This authorization covers this release, not arbitrary future deployments.
## Publication authorization — 2026-10-17

The user explicitly requested "公開して" after reviewing the integrated runtime,
telemetry and motion fixes. This authorizes deploying the current working source
as a preview to anemia111.github.io and updating the existing desktop shortcut.
It supersedes the local-only publication restriction below for this release.
Do not automatically commit or push the source repository. The known failed and
incomplete full-suite baseline is recorded in outputs/physics-full-tests-status.json;
the current full-suite attempt was interrupted, not passed. Publish uses the
existing SkipFullTestSuite option, keeping lint/build/browser playtest enabled.
See the latest publication report for the actual released revision and checks.
## Latest update: integrated category runtimes, telemetry and continuous motion, 2026-10-17

The user's later "あわせて" explicitly supersedes the earlier data-only scope
for WEC/SUPER GT/KYOJO/INDYCAR. Their original runtime dependency closure is now
under src/restored20261010 (198 recovered source files, source HEAD recorded in
recovery-manifest.json). AppShell routes current F1/SF and these actual runtimes
inside the same application. Namespaced CSS and separate worker implementations
preserve current F1 physics and Cinematic. F2/F3 remain catalog-only as requested.

Telemetry comparison (driver/lap/distance cursor/channel groups/CSV) is restored.
Current F1/SF traces record received SIM snapshots, last 3 laps/1536 points;
original motorsport traces use physics ticks. Missing current F1 steering/body
angles/four-wheel temperatures and HIST/LIVE trace history remain unavailable.
Do not fabricate these channels. Session history is in memory.

Both map implementations now use shared ReceivedMotionBuffer, observed positions
and a common marker/camera playback clock. Valid hardware measurements are in
outputs/map-motion-f1-qa and non-F1 entries of outputs/map-motion-qa. Earlier F1
entries in map-motion-qa have zero moving samples and are INVALID; exclude them.
See docs/INTEGRATED_RUNTIME_MOTION_20261017.md for final evidence and limitations.
This batch remains local-only. Do not run publish, commit or push automatically.
The historical notes below describe their dates, not the latest runtime scope.
# Claude Collaboration Notes

Read `CLAUDE_HANDOFF.md` first. It is the canonical project status.

## Official F1 lineup requested 2026-10-17

The latest user request replaces the shipped custom race-seat arrangement with
all 22 official 2026 F1 drivers and numbers. This supersedes the older direction
to keep NAK in a Ferrari race seat. NAK retains the authored #31/120-point profile
in the unseated custom pool, not as an official Ferrari reserve claim. Tsunoda
also stays outside the default race grid. Preserve ability edits and custom
lineups; migrate only the exact former shipped seat arrangement. Local only.

## Physics scope requested 2026-10-17

The latest user attachment explicitly authorizes changes to simulation,
ERS, following, racing lines and physical battles. It supersedes the old
single-line restriction and the earlier cinematic-only engine freeze for this
work. Preserve user ratings, category boundaries and deterministic operation.
This batch is local only: the user's no-new-publication instruction overrides
the publish completion gate. Never deploy these engine changes automatically.
See `docs/physics/ERS_AUDIT_JA.md` for measured results and unresolved work.

## Cinematic scope requested 2026-10-16

The user now explicitly requests an independent Suzuka cinematic layer, GLB
vehicles and Onboard/TV cameras. That request supersedes the legacy rendering
restrictions below for this layer. Preserve the race engine and original Map.
See `docs/cinematic/PHASE1_STATUS.md`: the working reconstruction is a preview,
not a completed photoreal Phase 1. Estimated road/facility data must stay labelled.

## Product Direction

- Build a PC-first F1/F2/F3/SUPER FORMULA observer, timing, and race-control simulator.
- Keep the core race engine deterministic and testable outside Three.js.
- Prefer factual OpenF1/FIA data when available and label every fallback.
- Cars remain on one racing line without artificial lateral attack, defence,
  blocking, or overtaking animation.
- Keep rendering light: Three.js primitives, no GLB cars, video, replay,
  multi-camera production, or expensive post-processing.
- Mobile support is intentionally out of scope.

## Current Baseline

- 24 verified tracks: 23 OpenF1-derived centerlines plus the official 2026
  MADRING organizer vector, with the amended 22-round championship status.
- The canonical F1 performance CSV supplies 11 teams and a 22-car field,
  including Cadillac, with two cars per team on a 0-100 scale. Preserve every
  supplied value, including Ferrari `NAK` #31. Drivers without a seat stay in
  the file as `reserve` rows so their authored axes survive; they are pooled
  but never fielded.
- `motorsportSeries2026.json` supplies the F2/F3/SF fields and rule packages;
  preserve the 110-person relational pool and never subtract ratings at runtime.
- Driver `overall` is one absolute scale shared by every category, so a driver
  keeps their own rating wherever they race. The support-series fields are
  stored already rebased against F1: F1 78-100, SF 66-79, F2 65-75, F3 54-66.
  Rebase in the JSON if the ladder needs adjusting, never at runtime.
- Any pool driver can take a seat in any category from the data manager. Fields
  are fixed at `carCount`, so signing replaces a seat rather than adding one and
  the incoming driver inherits that seat's car number and team.
- Complete FP/qualifying/sprint/race weekend surface with persisted setup,
  grids, tire inventory, and local championship state.
- Free Mode is an independent application mode over the existing F1/F2/F3/SF
  packages and race engine. It supports 1-40 cars from all 110 people and the
  F1/SF track union, stays SIM-only, and must not mutate championship progress
  or OpenF1 state.
- Formation/grid/lights flow, real crossing-time lap records, measured Q/SQ
  elimination, segmented overtaking, strategy, weather, tires, 2026 active
  aero/Overtake/ERS, pits, incidents, flags,
  penalties, classification, and season countback.
- OpenF1 data is an enrichment layer. The top HUD must continue to identify
  the race engine as `SIM` even when an OpenF1 sample is live.
- Sector boards, timing, OpenF1, race control, classification, and analysis
  start closed.
- The simulation runs in a fixed-tick Web Worker with a main-thread fallback.
- Verification baseline: build, lint, full Vitest, and the 1440x900/1280x720
  desktop playtest must pass before publishing.

## Commands

```bash
npm run dev -- --host 127.0.0.1
npm run lint
npm run build
npm test
npm run playtest
npm run publish
```

`npm run playtest` opens the latest production build on an isolated local
preview server. `npm run playtest:dev` targets an already-running server.

## Completion Publishing

Every completed coding batch must end with `npm run publish`. It verifies the
app, deploys the PWA to `https://anemia111.github.io/`, waits for the release to
become available, and refreshes the desktop `F1 Race Simulator` shortcut. Do
not report completion while that command is failing. Source commits and pushes
remain intentional, separate steps so unrelated work is never swept in.

## Architecture

- `src/App.tsx`: orchestration, source-labelled HUD, and overlay controls.
- `src/types.ts`: shared domain state.
- `src/data/tracks.ts`: calendar and operational markers.
- `src/data/realTrackLayouts.ts`: generated real layouts; do not hand-edit.
- `src/data/f1Performance.csv`: canonical 11-team/30-driver F1 performance data.
- `src/components/FreeModeBuilder.tsx`, `src/freeMode/`: Free Mode UI,
  validation, persistence, and conversion into the existing `RaceConfig`.
- `src/components/PitWallPanel.tsx`, `src/components/pitWall/`: race-engineering
  overlay for the selected car, available in every session and in Free Mode.
- `src/domain/pitWall.ts`: pit-wall derivations, component-condition
  thresholds, per-session capabilities, the lap log, and race-control
  classification.
- `src/hooks/usePitStrategyOutlook.ts`: the shared strategy read-out behind
  both race analysis and the pit wall.
- `src/data/motorsportSeries2026.json`: category fields, calendars, and rules.
- `src/series/seriesRegistry.ts`: validated multi-series domain packages.
- `src/data/performanceCsv.ts`: strict CSV validation and domain mapping.
- `src/services/openF1.ts`: throttled, nullable OpenF1 data client.
- `src/domain/dataMode.ts`: strict SIM/HIST/LIVE selection.
- `src/domain/startSignal.ts`: standing-start signal presentation state.
- `src/persistence.ts`: versioned multi-series save migration.
- `src/workers/raceWorker.ts`: fixed-tick worker engine.
- `src/simulation/race.ts`: deterministic frame and lap progression.
- `src/simulation/energySystem.ts`: Energy Store, recovery, deployment, and
  thermal state.
- `src/simulation/overtaking.ts`: close-battle outcomes and mapped DRS zones.
- `src/simulation/strategy.ts`: pit decisions and strategy outlook.
- `src/simulation/weather.ts`: continuous seeded rain/grip and forecast.
- `src/simulation/qualifying.ts`: FP/Q/SQ timing and grids.
- `src/simulation/season.ts`: FIA-style points, 90% classification, countback.
- `src/simulation/weekendTires.ts`: FIA 2026 tire allocation and usage plan.
- `src/three/RaceScene.tsx`: lightweight track and car rendering.
- `src/simulation/race.test.ts`: main simulation regression suite.

## Editing Rules

- Preserve user work and keep changes scoped.
- Keep external values nullable and maintain a labelled SIM fallback.
- Never call inferred geometry, telemetry, performance, or weather official.
- Derive simulation randomness from the seed helpers.
- Add numeric realism tests for model changes, not only snapshot tests.
- Run lint, build, tests, and playtest after behavior or UI changes.
- Do not commit `node_modules`, `dist`, logs, or QA screenshots.



