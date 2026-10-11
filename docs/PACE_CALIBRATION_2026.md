# Pace references and physical calibration

Current implementation and all-course coverage are documented in
[F1_ALL_COURSE_TIMES.md](F1_ALL_COURSE_TIMES.md).

The observation ledger retains 26 F1 category/course records and five SF
records. Five F1 qualifying references were refreshed from the official
Zandvoort, Monza, MADRING, Baku and Singapore classifications on 2026-10-11.
There are now 16 official F1 qualifying references; the other ten are estimates.
Race observations retain their own original dates and confidence. Updating a
qualifying classification does not manufacture a clean-race timing distribution.

Official classifications, classified observed laps and SIM targets are distinct:

| Status | Meaning |
| --- | --- |
| official | Published classification, with a primary source URL |
| observed | Measured lap distribution after pit/flag/weather/traffic filtering |
| derived | Calculation from published evidence, with the method retained |
| estimated | SIM estimate, including future rounds and F1 on foreign courses |
| unverified / unavailable | No suitable measured reference |

The usual qualifying reference is the median of the fastest three Q3 times.
Winner average race time is not a clean-lap reference: stops, weather, traffic
and neutralisation all affect it. Fuel and tyre degradation cannot be inferred
from a winner's average alone.

Category/course records are keyed by series and track, not round. Repeated SF
rounds on one course share its reference. Free Mode never converts a donor
category's lap time into an official F1 result. Fuji/Motegi/SUGO/Autopolis F1
targets are explicitly estimated project targets, not 2026 F1 observations.

The old `qualifyingPaceScale`, `racePaceScale`, `liveTimingPaceScale` and additive
race correction are retired. The schema rejects scales, the additive correction
remains zero, and the legacy writers now fail with a migration message. Old
100-seed controller-scale validation records were removed because they did not
describe the current force engine. Current actual-lap audits live separately in
`docs/validation`, with their conditions and source fingerprint.

Primary sources include [F1 results](https://www.formula1.com/en/results/2026/races),
[FIA event documents](https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072),
[OpenF1](https://openf1.org/) and [SF results](https://superformula.net/sf3/race_taxonomy/2026/).
Each observation keeps its source timestamps and status; a source link never
promotes an inferred field to an official measurement.

Commands:

```text
npm run update:pace-calibration
node scripts/refresh-f1-qualifying-references.mjs
npm run calibrate:f1-contact -- --write
npm run validate:f1-course-times
npm run validate:physics-calibration
```

The bulk observation updater and October qualifying snapshot have separate
purposes. Review generated observation changes before committing them, and
re-run contact calibration and independent-seed actual-lap validation after
changing reference targets, geometry or the force/controller model.
