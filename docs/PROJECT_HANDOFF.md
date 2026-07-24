# Project Handoff

The canonical, current handoff is `../CLAUDE_HANDOFF.md`. Read it before
editing. This file remains as a compatibility entry point for older prompts.

## Snapshot

- Product: PC-first F1/F2/F3/SUPER FORMULA observer and race-control simulator.
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1.
- Tracks: 23 OpenF1-derived layouts plus the official 2026 MADRING vector.
- Fields: F1 10 teams/20 cars (from a 30-driver CSV with reserves), F2 11/22,
  F3 10/30, and SUPER FORMULA 16/24, backed by a 110-person relational pool.
  Ferrari `NAK` is car 31.
- Sessions: FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, Race.
- Model: tires, continuous weather/grip, telemetry, active aero/Overtake/ERS, strategy, pits,
  sector-scoped yellow/double-yellow control, incidents, penalties,
  classification, and championship.
- Source policy: core race is SIM; OpenF1 is a separately labelled enrichment
  layer and may be LIVE, HIST, unavailable, or replaced by a SIM estimate.
- Visual policy: lightweight primitives, one racing line without lateral
  battle offsets, no broadcast-video feature set, no mobile requirement.

## Verification

```bash
npm run lint
npm run build
npm test
npm run playtest
npm run benchmark
```

`playtest` starts an isolated preview server for the latest production build.

## Known Constraints

- MADRING sector lines remain derived until the FIA event circuit map is
  published; no OpenF1 telemetry projection is fabricated for its official SVG.
- Circuit active-aero/Overtake, pit, and safety-car markers are lightweight derived data unless
  explicitly labelled otherwise.
- OpenF1 availability varies by session and year; never remove SIM fallback.
- The stable Three.js build emits a large-chunk warning. Avoid destabilizing
  the canvas merely to silence that warning.
