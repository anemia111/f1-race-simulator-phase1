# Claude Start Prompt

```text
Please continue this PC-first F1 race-control simulator.

Before editing, read:
- CLAUDE_HANDOFF.md
- CLAUDE.md
- README.md
- docs/FIA_2026_REGULATION_COVERAGE.md

Important constraints:
- The race engine is SIM; OpenF1 is a separately labelled LIVE/HIST/SIM layer.
- Preserve all 24 verified layouts, including the official MADRING vector and
  its explicit lack of an OpenF1 telemetry-coordinate projection.
- Preserve fixed-tick Worker ownership and the explicit SIM/HIST/LIVE contract.
- Preserve measured 24-part mini-sector timing and provisional purple-to-green
  transitions; never recolor from projected lap time.
- Preserve independent S1/S2/S3 yellow and double-yellow state in SIM and
  observed OpenF1 modes.
- Qualifying promotion and grids must use measured Q1/Q2/Q3 or SQ results.
- Normal running is one racing line; lateral movement is only for close battles.
- Do not add onboard/replay/radio playback/multi-camera broadcast features.
- Do not add mobile work, GLB cars, video, post-processing, or heavy frame work.
- Keep simulation logic deterministic and separate from Three.js rendering.
- Preserve existing changes and add numeric regression tests for model edits.

Before handing back, run:
- npm run lint
- npm run build
- npm test
- npm run playtest (with the dev server running)
- npm run benchmark (with the dev server running)

Summarize changed files, verified behavior, and any honest remaining limits.
```
