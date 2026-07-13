# Project Handoff

The canonical, current handoff is `../CLAUDE_HANDOFF.md`. Read it before
editing. This file remains as a compatibility entry point for older prompts.

## Snapshot

- Product: PC-first F1 observer and race-control simulator.
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1.
- Tracks: 23 OpenF1-derived real layouts plus a labelled Madrid fallback.
- Sessions: FP, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, Race.
- Model: tires, continuous weather/grip, telemetry, active aero/Overtake/ERS, strategy, pits,
  race control, incidents, penalties, classification, and championship.
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
```

The current unit baseline is 109 passing tests. `playtest` requires the Vite
server at `http://127.0.0.1:5173/`.

## Known Constraints

- Madrid remains fallback geometry until authoritative layout data exists.
- Circuit active-aero/Overtake, pit, and safety-car markers are lightweight derived data unless
  explicitly labelled otherwise.
- OpenF1 availability varies by session and year; never remove SIM fallback.
- The stable Three.js build emits a large-chunk warning. Avoid destabilizing
  the canvas merely to silence that warning.
