# F1 all-course lap-time calibration — 2026-10-11

The live measurements below are historical. The 2026-10-12 driver-execution
follow-up changes F1 force-envelope utilisation to retain performance headroom
through ability 120. Only a short equal-car Fuji comparison was rerun; these
49-course results are not a fresh audit of the current live engine. Course
contact coefficients and reference provenance remain the same.

Scope is every one of the 49 selectable Free Mode layouts, including Fuji,
Motegi, SUGO, Autopolis, Okayama, Imola, both Monza geometries, Le Mans and the
IndyCar roads/streets/ovals. Native F1 courses are not the coverage boundary.

## Model and provenance

Imported Free Mode polylines now use the native generator's 156 equally spaced
samples. Irregular OSM vertex spacing otherwise fed millimetre-scale direction
noise into a three-vertex curvature stencil, especially at Imola. Sampling
interpolates on the source polyline; it does not invent corner positions or
fit geometry to a requested lap time. Road-input progress now also follows
the same distance sampling convention as native layouts.

The road geometry previously counted the local turn twice and accumulated
opposite-turn chicanes into one corner. It now counts each heading change once
and stops at a direction change. Closed same-direction neighbourhoods cannot
double-count a vertex. The coarse-layout line realisation convention is 0.14.
The fixed five-course development split was used for the common F1 aero work
(lift area 5.6 m²). Drag area scale remains 1.0 to retain the independent
straight-line speed envelope; power, regulated mass rules and base
tyre friction were not changed. The old holdout membership remains frozen.

`f1CourseCalibration.ts` adds a separate **SIM effective contact model** for
the observer engine. Coarse geometry and unknown contact properties cannot be
identified independently from a lap time. Its effective coefficient therefore
must not be described as measured Pirelli friction, measured road grip or a
validated vehicle parameter. It is bounded to 0.8–2.5, with residuals retained
when a target cannot be reached within that envelope. A failed or bounded
target must not be hidden by changing elapsed time.

The contact authoring tool starts from a force-derived reference and then
measures actual crossings in the production engine: isolated driver 100,
neutral machine axes 0.86, dry qualifying, real out/attack/in-lap controllers,
fuel, setup, thermal tyres and energy system. It measures the first two valid
Q1 laps at calibration seed 0 and keeps the best measured bounded candidate.
Independent seeds must be reported separately from fitting data. These are
standardised SIM benchmarks, not predictions of an official top-three field.

The pure category-model physics audit remains separate. Its original holdout
cannot be claimed as independent validation of the contact fit, because the
production contact table intentionally uses course reference targets, including
those courses. The inverse-fit reference residual is also not an accuracy test.

The effective profile enters tyre/contact forces, brake and acceleration
planning in FP, qualifying, sprint qualifying, sprint and race. There is no
session time scale or forced finish time. Dirty air, slipstream, driver ability,
ERS/Overtake, fuel, weather, elevation, tyre wear and permanent thermal damage
continue to affect actual pace. Nakayama remains 120. SF keeps its own control
tyres and calibration; other-category engines retain their vehicle profiles.
Fresh H/M/S deltas are refitted against the F1 course contact profile so the
user's compound-gap inputs survive this change.

## Reference coverage

Thirty layouts have reference targets: 17 official-reference layouts (Monza
has two geometries), and 13 SIM estimates. Nineteen layouts have no suitable
F1 timing reference and use the common physical model with explicit unavailable
status. They still receive actual-lap coverage; this is not evidence that their
pace matches an observed F1 lap. No donor-series result is relabelled as F1.

Five new official Q3 references:

| Course | Fastest-three median | Source |
| --- | ---: | --- |
| Zandvoort | 71.265 s | [Official qualifying](https://www.formula1.com/en/results/2026/races/1292/netherlands/qualifying) |
| Monza | 81.846 s | [Official qualifying](https://www.formula1.com/en/results/2026/races/1293/italy/qualifying) |
| MADRING | 91.835 s | [Official qualifying](https://www.formula1.com/en/results/2026/races/1294/spain/qualifying) |
| Baku | 103.363 s | [Official qualifying](https://www.formula1.com/en/results/2026/races/1295/azerbaijan/qualifying) |
| Singapore | 91.427 s | [Official qualifying](https://www.formula1.com/en/results/2026/races/1296/singapore/qualifying) |

Sakhir, Jeddah and Imola use the 2025 fastest-three median plus an explicitly
chosen SIM generation allowance of 3.5%; this is an estimate, not an observed
2026 evolution. Source URLs and the method are stored in
`f1SupplementalCourseReferences.json`. The October 2026 Bahrain-named event
ran at Sepang; its time is ineligible for the Sakhir geometry. The four SF
foreign-course F1 targets remain estimated (Fuji 77 s, Motegi 86 s, SUGO 60.5 s,
Autopolis 80.4 s). Other unobserved courses are not assigned invented official
results.

## Actual-lap results

All 49 layouts recorded at least one valid timed lap on each of three seeds
(147 layout/seed runs, recorded production source `6cc4e08`). Later traffic
changes were not remeasured. The 30 targeted layouts improved from 3.763 s mean
absolute error on the previous runtime's seed 0 to 0.201 s for the new
three-seed median; the maximum median error was 0.602 s. Independent seeds 1
and 2 produced 0.244 s mean and 0.820 s maximum absolute error. No fitted
coefficient was bounded. Nineteen layouts remain unreferenced estimates.

| Course | Target | Before seed 0 | After three-seed median | Reference status |
| --- | ---: | ---: | ---: | --- |
| Fuji | 77.000 s | 82.968 s | 76.878 s | SIM estimate |
| Motegi | 86.000 s | 89.267 s | 85.807 s | SIM estimate |
| SUGO | 60.500 s | 70.224 s | 60.272 s | SIM estimate |
| Autopolis | 80.400 s | 85.292 s | 80.363 s | SIM estimate |
| Imola | 77.319 s | 94.950 s | 77.468 s | 2025-based SIM estimate |
| Suzuka | 89.076 s | 93.593 s | 88.635 s | Official reference |

The [49-layout table](validation/F1_COURSE_TIMES.md) and underlying JSON retain
every seed, reference status, coefficient and valid-lap count. These results
establish the dry isolated qualifying benchmark. Fuel-heavy race laps,
traffic and weather are not independently calibrated by this benchmark.

## Reproduction

```text
npm run calibrate:f1-contact -- --write
node scripts/validate-f1-course-times.mjs --seed=0 --output=docs/validation/f1-course-times-seed0.json
node scripts/validate-f1-course-times.mjs --seed=1 --output=docs/validation/f1-course-times-seed1.json
node scripts/validate-f1-course-times.mjs --seed=2 --output=docs/validation/f1-course-times-seed2.json
node scripts/summarize-f1-course-times.mjs
```

The audit uses production Free Mode conversion, including foreign-course SIM
active-aero zones. `--baseline=c2a6750` replays the previous runtime source for
before/after comparison against the same reference snapshot. Every JSON row
retains target status, coefficient, actual valid-lap count and residual; missing
times and out-of-envelope targets are failures or explicit limitations, never
silently dropped. For this batch the user explicitly declined long-running
tests. The in-progress full suite was stopped; publication uses the already
completed 104 focused tests, 147 actual-lap runs and native desktop preflight,
with the full-suite and repeated publication-playtest stages skipped. The
normal repository policy remains an unskipped gate for future batches unless
the user directs otherwise.
