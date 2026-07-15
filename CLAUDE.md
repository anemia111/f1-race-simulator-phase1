# Claude Collaboration Notes

Read `CLAUDE_HANDOFF.md` first. It is the canonical project status.

## Product Direction

- Build a PC-first F1 observer, timing, and race-control simulator.
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
- The canonical performance CSV supplies 15 teams and 30 drivers. Preserve
  every supplied value; its only deliberate correction is `NAK` car number 31.
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
- Verification baseline: build and lint pass; 249 Vitest tests pass; desktop
  playtest passes at 1440x900 and 1280x720.

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
- `src/data/f1Performance.csv`: canonical 15-team/30-driver performance data.
- `src/data/performanceCsv.ts`: strict CSV validation and domain mapping.
- `src/services/openF1.ts`: throttled, nullable OpenF1 data client.
- `src/domain/dataMode.ts`: strict SIM/HIST/LIVE selection.
- `src/persistence.ts`: V2 save migration.
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
