# Broadcast Dashboard Design QA

Reference: `codex-clipboard-c963d84e-0415-4a4c-988e-2e51125e1c31.png`

Current prototype capture: `C:\Users\yuuki\AppData\Local\Temp\f1-simulator-qa\broadcast-compact.png`

Automated verification: `npm run playtest`

## P0 - Fixed

- No viewport overflow or panel overlap at 1440x900 and 1280x720.
- All core controls, tabs, close/restore actions, driver selection, playback controls, and secondary panels work.
- The redundant Overview destination is absent; Timing is the initial active view and renders all 22 drivers.
- Leaderboard and Timing lists both expose working vertical scroll ranges at 1280x720.
- The WebGL circuit map renders nonblank and remains interactive.
- The former lap comparison, duplicate live-sector, fuel-load, and next-events panels are absent; the map now uses the released center-column space.

## P1 - Fixed

- Three-column broadcast hierarchy matches the reference: classification, live timing/map, race control.
- The real-layout circuit is thin, sector-colored, and uses compact circular driver markers.
- Official event naming, broadcast wind units, and source provenance are visible and consistent.
- Weather crossover calls are staggered. A full 57-lap accelerated audit produced two individual VSC infringements rather than a field-wide penalty wave.
- Tyre circles show remaining life, start at 100, and fell into the 69-78 range during the accelerated in-app race check.
- The setup panel exposes all 12 driver ability controls and their arithmetic-mean OVR; the Drivers view exposes the same OVR value.

## P2 - Fixed

- Typography, borders, spacing, compact tables, and chart density follow the supplied F1TV-style reference.
- Live timing, telemetry, tires, weather, messages, track data, and reliability views use the same panel system.
- Compact desktop rendering has no clipped button labels.
- The supplied reference and current implementation were reviewed together. The information hierarchy, dense timing treatment, thin circuit line, restrained borders, and persistent race-control rail remain aligned.
- The supplied Overview-button crop and the latest compact prototype capture were reviewed together; removing the duplicate destination leaves the sidebar balanced and keeps Timing one click from every other data view.

## P3 - Accepted

- The reference uses an aerial circuit backdrop; the simulator keeps a clean dark map so all 24 circuit layouts remain lightweight and consistently legible.
- Brand artwork is intentionally represented by the app's own broadcast mark rather than copied commercial artwork.

final result: passed
