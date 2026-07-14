# F1 Race Simulator

PC-first F1 race-control and timing simulator built with React, TypeScript,
Vite, Three.js, and React Three Fiber. It is an observer simulation, not a
driving game or a broadcast-video renderer.

## Current Features

- 24 selectable circuit packs with 23 OpenF1-derived centerlines. The current
  FIA calendar is 22 rounds after Bahrain/Jeddah cancellation; Madrid is an
  explicitly labelled geometry fallback.
- FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race session flows.
- Moving formation lap, grid return, five-light start, and timed line-crossing
  lap records, including aborted starts, pit-lane starts, and standing/rolling
  red-flag restarts.
- Fixed-tick Worker race model for pace, tires, Rain Hazard/Low Grip control,
  2026 active aero, Overtake, ERS, battery,
  brakes, expected-loss strategy, pit stops, flags, incidents, procedural
  penalties, and stewarding.
- FIA 2026 public ERS power curves, 4 MJ usable SOC window, recharge limits,
  wet Safety Car starts, full-wet mandates, blue-flag yielding, and a visible
  Safety Car leading the queue. See
  [`docs/FIA_2026_REGULATION_COVERAGE.md`](docs/FIA_2026_REGULATION_COVERAGE.md)
  for article-level coverage and non-public-document boundaries.
- One normal racing line; lateral movement appears only during close attacks
  and defence. Battle checks run in 12 lightweight track segments per lap.
- Dense live timing with lap-numbered CPU sector measurements, progressive
  comparative mini-sectors, telemetry, source chips, race control,
  classification, analysis, and manual strategy controls.
- Independent S1/S2/S3 flag states for local yellow, double yellow, VSC, SC,
  and red phases, synchronized between pace control, OpenF1 race control,
  dashboard status, and the 3D circuit trace.
- Driver abilities use a 150-point extensible scale; every configured 2026
  driver remains at or below 100.
- Explicit SIM/HIST/LIVE modes for OpenF1 timing, telemetry, weather,
  race-control, position, pit/stint, radio,
  result, and championship enrichment with SIM/HIST/LIVE source separation.
- FIA 2026 standard/sprint tire allocations, 90% race classification, and
  championship race-result countback. PU/gearbox condition and replacement
  penalties carry across rounds.
- Qualifying lap deletion, double-yellow invalidation, impeding, pit-exit
  queues, 107% checks, and steward exemptions.
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
private. Run `scripts/publish-web-app.ps1` to verify the source, build the PWA,
sync only generated assets, and push a new deployment.

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
npm run benchmark
```

`npm run playtest` expects the dev server to be running. It checks 1440x900 and
1280x720 PC layouts, WebGL pixels, overlay controls, and panel overlap. Screenshots
go to the OS temporary directory by default; set `QA_ARTIFACT_DIR` to retain them
at a specific location.
`npm run benchmark` records 60x frame rate, long tasks, DOM size, canvas pixels,
renderer identity, and optional Chromium heap usage. It prints JSON to stdout and
only writes a file when `BENCHMARK_REPORT` specifies a path.
Software renderers such as SwiftShader are recorded but are not treated as a
hardware frame-rate pass/fail signal. Set `BENCHMARK_STRICT=1` for a real-GPU
threshold run.

## Data Truthfulness

- The race engine always remains `SIM`.
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
