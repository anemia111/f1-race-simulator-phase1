# Project Handoff

The canonical, current handoff is `../CLAUDE_HANDOFF.md`. Read it before
editing. This file remains as a compatibility entry point for older prompts.

## Snapshot

- Product: PC-first F1 observer and race-control simulator.
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1.
- Tracks: 23 OpenF1-derived layouts plus the official 2026 MADRING vector.
- Sessions: FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, Race.
- Model: tires, continuous weather/grip, telemetry, active aero/Overtake/ERS, strategy, pits,
  sector-scoped yellow/double-yellow control, incidents, penalties,
  classification, and championship.
- Source policy: core race is SIM; OpenF1 is a separately labelled enrichment
  layer and may be LIVE, HIST, unavailable, or replaced by a SIM estimate.
- Visual policy: lightweight primitives, one racing line except during close
  battles, no broadcast-video feature set, no mobile requirement.

## Verification

```bash
npm run lint
npm run build
npm test
npm run playtest
npm run benchmark
```

The current unit baseline is 184 passing tests across 22 files. `playtest` requires the Vite
server at `http://127.0.0.1:5173/`.

## Known Constraints

- MADRING sector lines remain derived until the FIA event circuit map is
  published; no OpenF1 telemetry projection is fabricated for its official SVG.
- Circuit active-aero/Overtake, pit, and safety-car markers are lightweight derived data unless
  explicitly labelled otherwise.
- OpenF1 availability varies by session and year; never remove SIM fallback.
- The stable Three.js build emits a large-chunk warning. Avoid destabilizing
  the canvas merely to silence that warning.
