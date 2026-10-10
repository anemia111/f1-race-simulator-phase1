# Circuit presentation and registration repair — 2026-10-09

Extra-category course assets use local east/north coordinates; Three.js maps use east/south (X/Z). The dashboard adapter previously copied north directly into Z. Shared Fuji, Suzuka and other layouts consequently appeared reflected relative to the native F1/SF packs. The adapter now negates north at the presentation boundary. Course motion, physical distances, weather, and series rules do not depend on that rendering transform.

The display already rotates the road to make its control-line tangent horizontal. Corner furniture did not receive that rotation. Both overview and detailed markers now receive the same rigid transform. Camera zoom/rotation/pan controls and the existing dashboard layout are preserved.

Officially numbered spatial anchors replace curvature-minimum C1/C2 labels in extra-category telemetry. One dataset feeds map labels and telemetry. Domestic SF packs now carry those same numbered anchors. Laguna Seca 8A and Hungaroring 1A/12A are retained as unique labels without altering the numerical operational-marker identifiers. The native layout generator preserves future source marker letters. No generated native geometry arrays were hand-edited.

`cornerReferenceDefinitions.json` records source diagrams and authored arc registration on the original geometry. `node scripts/generate-corner-references.mjs` reproduces the spatial dataset. These locations are diagram registrations on public polylines, not surveyed corner apexes. No additional source/catalog panels are added to the UI.

Official course/timing-diagram registration also corrects reversed Barber, Indianapolis road, Mid-Ohio and Okayama source chains. Indianapolis road, Mid-Ohio and Okayama control anchors are relocated to their actual home straights. Imola uses the WEC FINISH line, independently of the offset START line and the F1 operational pack. Turn labels retain the official numbering even when a series control line falls after an early numbered bend.

Recognizable older catalogue saves migrate on load: physical car locations and completed laps are preserved along with fuel, tyres, crews and race state. Partial lap/sector/telemetry traces are invalidated because they cross a direction/origin change. User-authored FREE geometries are excluded. Existing finished-lap records are preserved; results recorded while running the old reversed configuration cannot be retroactively corrected.

Validation includes all 30 extra-course map handedness/label coverage, Fuji consistency across KYOJO/GT/WEC/SF, four corrected road-course turn sequences, suffix labels, legacy timing-array migration, custom FREE preservation, shared track display transforms, extra-category race/traffic/sector/energy/pit/endurance tests, lint/build and the normal six desktop publication playtests.
