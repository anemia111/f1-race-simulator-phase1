# Category motion and road elevation

This change starts from deployed revision `0461fd4` on
`codex/2026-traffic-and-category-catalog`. Master does not contain the executable
WEC, SUPER GT, INDYCAR and KYOJO engines; publishing master would remove them.

All 58 selectable layouts already have geographically registered 192-station
profiles. The registration gate binds the data to both course geometry and
official distance, including normalized dashboard geometry. It rejects custom
Free Mode layouts that merely reuse a registered id. Suzuka retains its official
longitudinal diagram and separated underpass/overpass.

MADRING now uses the organizer's T2=671m and T7=697m absolute anchors. The
published 8% climb gaining 10m and subsequent 5% descent establish inferred
segment endpoints; all remaining heights are periodic interpolation. These
are not 22 surveyed corner elevations. Baku uses the supplied T1–T19 instead
of the DEM's suspect final-sector rise. T20=2m stays in `cornerElevations.ts`
and the report's original-value column, but is excluded from road geometry.
The supplied values retain unverified provenance. Other national/DEM profiles
are retained as estimates, not homologation measurements.

The shared map offers 2D/1x/3x/5x height, defaulting to 3x. This changes road,
markers and furniture together and never changes physical course length,
speed, timing or elevation used by the engine. Geometry is stable between
snapshots and disposed when replaced.

The category adapter now passes the physical lateral position (with the
correct XY-to-XZ normal sign) instead of forcing every marker onto the same
line. Its continuous pit distance drives a smooth entry/exit blend, including
service at the actual distance. It no longer inherits F1's unrelated garage
slot position. Pit furniture uses category entry/exit and speed-limit markers.
Practice/qualifying releases are spaced on the pit path and initialize road
distance from that same path, so each car rejoins at the registered exit instead
of inheriting a grid-relative distance at the control line.
Only the existing engine's passing decisions are displayed; no cosmetic pass
or position gain is generated.

Category markers interpolate unwrapped progress and then evaluate the road,
instead of easing across a Cartesian chord. This keeps them on hairpins,
ovals and elevated road sections. Updates use the selected simulation rate;
pause, red suspension and session replacement reset safely. F1/SF retain
their existing marker motion path.

The category engine integrates lateral velocity with a 4m/s² acceleration
limit, anticipates slower traffic with a stopping-distance target, and applies
rear clearance to same-lane green-flag traffic as well as neutralisation.
Pit cars brake before the service box and integrate the trapezoidal travel
distance used on the road. All parameters remain explicit SIM approximations.

Regenerate and inspect data with:

```
npm run generate:course-elevations
node scripts/export-course-elevation-report.mjs
node scripts/audit-category-motion.mjs
```

The report exports 58 layouts, 859 registered corners and 11,136 stations.
`MOTION_FULL_FIELD=1` additionally runs one-lap full-field checks. Source
references, grades, supplied values and excluded-corner notes remain in CSV.
The UI gate checks every available calendar event in six categories at
1440x900 and 1280x720, including all four display scales. Numeric regressions
cover slower-traffic approach, lateral acceleration, pit braking and release,
finish-line interpolation, pause/reset, map registration and official anchors.

The 24-hour full-field endurance tests remain mandatory in `npm run publish`;
short checks do not replace them. The short full-field race test has a 30s
wall-clock budget because it shares machines with browser/long-run QA; its
completion and all-car finishing assertions are unchanged.
