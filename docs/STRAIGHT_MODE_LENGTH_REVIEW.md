# Straight Mode length review - 2026-10-13

All 49 selectable physical course IDs were audited: 24 F1 calendar circuits,
4 additional Japanese circuits and 21 expansion course IDs. The 16 available
FIA event maps were downloaded and visually checked against corner labels.
Their source URLs remain in officialTrackOperations2026.ts.

Previously, ten nonempty official map definitions had no explicit end corner.
The resolver reused nearby geometry runs or silently ended 8% of a lap after
activation. This truncated Australia A4 and allowed Spa A1 to overlap A2.
Every official zone now identifies its next mapped corner; its visible bend
entry supplies the SIM endpoint. There is no arbitrary percentage endpoint.
FIA start offsets are applied in metres along the centerline, including wrap,
rather than assuming uniform distance between samples. Estimated endpoints
retain six decimal places so published length evidence matches runtime.

Expansion Free Mode previously created zones at sector starts with a fixed
10% lap span. It now uses the shared curvature, physical lateral-load and
400 ms transition screening model, with at least 300 m usable length. Low-grip
operation of these expansion estimates remains disabled. No qualifying run
means unavailable, rather than a fabricated activation zone. Monaco's official
unavailable status is preserved in Free Mode. Geometry-only screening is not
proof of suitability for a real F1 event, especially on coarse layouts/ovals.
The audit lists such estimates and unavailable courses explicitly.

See artifacts/active-aero-zone-lengths.md for every course and zone. The JSON
audit also records physical normal/low-grip lengths, projected ending turns,
source classifications and invariants. Lengths are model measurements scaled
to the published lap distance. Starts from FIA maps are projected onto model
corner anchors; endpoints are SIM bend-entry projections, not official metre
coordinates or speed-dependent driver braking points. Eight F1 calendar tracks
and all added tracks remain estimates; do not call them official.

Free Mode recharge follow-up: race/sprint Overtake latched at lap start now adds
0.5 MJ to the SIM 8.5 MJ recharge ceiling. This does not fill the battery or
increase instantaneous recovery power. Verified event rules take precedence;
missing championship event context remains unavailable. Older Free Mode saves
may retain their stricter 8.5 MJ ledger until the next lap without retroactive
energy credit.

Validation: 129 focused data, geometry, Free Mode, regulation and active-aero
tests plus one focused legacy-checkpoint test pass. All 49 course length,
low-grip containment, no-overlap and estimated basis-length checks pass. Lint,
production build and diff checks pass. No full races, laps or long tests run.
Publish uses the user's persistent shortened-test exception.
