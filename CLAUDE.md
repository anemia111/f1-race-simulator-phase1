# Claude Collaboration Notes

Read `CLAUDE_HANDOFF.md` first. It is the canonical project status.

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
- The canonical F1 performance CSV supplies 10 teams and a 20-car field, two
  cars per team, on a 0-100 scale. Preserve every supplied value, including
  Ferrari `NAK` #31. Drivers without a seat stay in the file as `reserve` rows
  so their authored axes survive; they are pooled but never fielded.
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
- `src/data/f1Performance.csv`: canonical 10-team/30-driver F1 performance data.
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
