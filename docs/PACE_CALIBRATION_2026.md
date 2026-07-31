# 2026 Pace Calibration

## Purpose

The simulator keeps three different kinds of pace information separate:

1. Official classification values, such as a published qualifying result.
2. Observed timing samples, such as OpenF1 lap, stint, weather, pit, interval,
   and race-control records.
3. Simulator calibration values, produced from deterministic fixed-seed runs.

None of these values is presented as a prediction of an uncompleted event.
Future rounds remain estimates with lower confidence and explicit ranges.

The checked-in calibration version is `2026.07.26.1`, retrieved on
2026-07-26. It contains 22 F1 event records and 5 SUPER FORMULA event records.
Eleven F1 events have an observed 2026 qualifying reference, while ten also
have an observed race sample. The remaining rounds are estimates until their
sessions have taken place and the update workflow is run again.

## Source Boundary

Primary references:

- [Formula 1 2026 results](https://www.formula1.com/en/results/2026/races)
- [Formula 1 2026 calendar](https://www.formula1.com/en/racing/2026)
- [FIA 2026 Formula One event documents](https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072)
- [OpenF1 API](https://openf1.org/)
- [SUPER FORMULA 2026 calendar and event results](https://superformula.net/sf3/race_taxonomy/2026/)
- [JAF 2026 SUPER FORMULA standings](https://motorsports.jaf.or.jp/results/standings/race/2026/superformula)

Each generated event record stores its own source URLs, retrieval timestamp,
and a SHA-256 content hash for imported OpenF1 result documents. A source link
does not make every field official. Status and confidence are recorded
separately for qualifying and race data.

Status meanings:

| Status | Meaning |
| --- | --- |
| `official` | Taken from an official published classification. |
| `observed` | Calculated from measured timing records after classification. |
| `derived` | Calculated from a published result with an explicit method. |
| `estimated` | Pre-event model estimate, not an observed 2026 result. |
| `unverified` | No adequate race sample is available. |

SUPER FORMULA does not currently expose an OpenF1-equivalent, public
machine-readable all-lap feed. Its qualifying classifications can therefore be
official while a race reference is derived, estimated, or unverified. The
Autopolis record keeps the completed official qualifying result but leaves the
cancelled race unverified; that grid was later used for the replacement race
at Fuji. The UI keeps those distinctions visible.

## Reference Definitions

The qualifying target is the median of the fastest three official Q3 result
times. This is less sensitive than a single pole lap to one exceptional lap,
deleted laps, or a session-specific interruption. Pole, top-five, theoretical
best, and field-spread values are retained for validation.

The race target is a representative clean green-flag lap, not the winner's
event time divided by laps. Winner average includes pit stops, formation and
neutralisation effects, traffic, weather, and any shortened running. It is
stored as a separate contextual value.

Observed race laps are classified before aggregation. The classifier excludes
or separates:

- pit entry, pit exit, and pit-lane laps;
- Safety Car, VSC, local-yellow, and red-flag windows;
- wet or transitional conditions from the dry reference;
- invalid, incomplete, or implausible timing records;
- traffic laps using interval proximity;
- management laps using sector consistency and pace windows.

The remaining clean samples produce P10, median, P90, early/middle/late stint,
compound, pit-loss, and clean-air versus traffic values. Fuel and tyre effects
remain separate where the samples can support that split. The runtime never
downloads these records or silently rebases a live race.

## Straight-Line Speed Reference

Each event record may carry a `speed` section. It exists to calibrate the
aerodynamic drag model, which a lap time alone cannot constrain: a lap time can
be reached with the wrong split between straight-line speed and cornering, and
the session controller scales will absorb the difference.

Two different observables are kept apart, because they are not interchangeable.

**The FIA speed trap is a fixed point on one straight.** It measures the car
only where the trap happens to be. At Suzuka the 2026 race trap read 308 km/h
while the same cars peaked at 349 km/h elsewhere on the lap, a 41 km/h
difference. Trap values are therefore retained as published context and are
never used as a peak. Where the trap does sit near the fastest point, as at
Barcelona, it agrees with the telemetry peak to within about 2 km/h.

**The peak is taken from OpenF1 car telemetry** over the whole classified field.
It is recorded twice:

- `*FieldPeakKph` is the maximum over every car. It is the like-for-like
  comparison for a simulated maximum, but it is a single draw from the tail of
  an extreme-value distribution and is sensitive to how many cars a session put
  into the sample.
- `*DriverPeakMedianKph` takes each car's own peak first and then the median, so
  one car in an exceptional tow does not define the circuit.

Qualifying and race are stored separately. They are not the same physical state:
qualifying runs low fuel and an attack setup in clear air, while a race peak
includes fuel, tow, and Overtake trains. In 2026 the race peak is consistently
the higher of the two, by 8 to 27 km/h.

Status follows the same rules as the rest of the file. A telemetry aggregate is
calculated from measured records, so it is `observed`, not `official`. A record
whose sessions have not run carries no `speed` section at all, rather than an
estimate: there is no equivalent of the historical same-circuit forecast used
for lap time, because a regulation change moves straight-line speed more than it
moves lap time.

### Observed 2026 F1 straight-line speed

All values are km/h. `Q` and `R` are the qualifying and race field peaks; the
median is the median of the individual cars' peaks.

| Circuit | Q peak | Q median | R peak | R median | Race trap max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Albert Park | 333 | 325 | 343 | 333 | 321 |
| Shanghai | 343 | 337 | 352 | 345 | 353 |
| Suzuka | 339 | 332 | 349 | 339 | 308 |
| Miami | 346 | 344 | 350 | 346 | 334 |
| Montreal | 337 | 332 | 350 | 339 | 348 |
| Monaco | 291 | 288 | 292 | 284 | 287 |
| Barcelona | 344 | 341 | 360 | 352 | 358 |
| Red Bull Ring | 331 | 326 | 347 | 333 | 334 |
| Silverstone | 323 | 316 | — | — | 351 |
| Spa | 344 | 331 | 349 | 342 | 323 |
| Hungaroring | 345 | 336 | 357 | 349 | — |

Silverstone has no race telemetry sample and Hungary no race trap sample. Those
fields stay null rather than being filled from the other session.

### Validating the model against it

```bash
npm run validate:speed-trap
```

The script measures a modeled qualifying peak per team in attack trim and a
modeled race peak through the complete race loop, then compares both the field
peak and the driver-peak median against the reference.

Acceptance is on the aggregate, not a tight per-circuit band: this is one
physical drag model fitted to every circuit at once, and a tight per-circuit
band could only be satisfied by adding per-circuit factors, which is the
modelling fault the calibration exists to remove. The limits are a mean absolute
error of 8 km/h, a bias within 5 km/h, and no single circuit past 18 km/h.

## Completed F1 Sample

All values below are seconds. `Clean laps` is the number of classified
green-flag race samples used by the event calibration.

| Event | Q top 3 | Clean race | Winner average | Clean laps |
| --- | ---: | ---: | ---: | ---: |
| Australia | 78.811 | 83.434 | 85.979 | 491 |
| China | 92.286 | 97.392 | 99.922 | 418 |
| Japan | 89.076 | 94.374 | 99.687 | 409 |
| Miami | 87.964 | 93.542 | 98.233 | 494 |
| Canada | 72.646 | 76.427 | 77.879 | 555 |
| Monaco | 72.094 | 78.123 | 110.401 | 402 |
| Spain | 74.743 | 82.329 | 84.062 | 441 |
| Austria | 66.349 | 71.728 | 73.211 | 703 |
| Britain | 88.286 | 94.776 | 100.603 | 469 |
| Belgium | 104.678 | 110.243 | 115.511 | 394 |

The large Monaco winner-average difference is retained rather than forced
toward clean pace. It is a useful example of why full-event average and a
representative green lap are not interchangeable.

## Simulator Calibration

`scripts/calibrate-race-pace.mjs` runs production simulation code through Vite
SSR. Qualifying uses 100 deterministic seeds and inverse-calibrates the neutral
track baseline to the event's top-three reference. Observed race events then
calibrate a separate model residual against a representative mid-race,
green-flag state. A final 100-seed validation is written into each record.

Acceptance limits:

- qualifying top-three median error: at most 0.30 seconds;
- observed pole error: at most 0.351 seconds;
- observed qualifying field-spread error: at most 0.60 seconds;
- observed clean-race error: at most 0.70 seconds;
- qualifying and race validation: at least 100 fixed seeds where applicable.

The current ten observed F1 race references validate within 0.20 seconds. The
calibration changes track-neutral pace and an explicit race-model residual. It
does not hard-code a displayed lap time or bypass fuel, tyre, weather, traffic,
ERS, machine, driver, and race-control effects.

## Category x Course Keying

A pace baseline belongs to a category and a course, never to a calendar round.
Motegi hosts Super Formula rounds 1-2, Suzuka 4/5/11/12 and Fuji 3/6/7/9/10, and
every round of a circuit reads the same course record; `selectPaceCalibration`
filters by series and `trackId` only. Two categories on the same circuit keep
separate records: Suzuka is 89.076 s for F1 and 97.605 s for Super Formula.

Each session family owns its own dimensionless controller scale:

- `simulation.qualifyingPaceScale` corrects the timed-session controller (free
  practice and qualifying);
- `simulation.racePaceScale` corrects the green-flag race controller;
- `simulation.raceModelCorrectionSeconds` is legacy and must stay at 0. It was a
  single additive term that silently calibrated qualifying *and* the race, so
  splitting the race scale out of it left qualifying several seconds slow until
  each family got its own scale.

Both scales are guarded to 0.75-1.25 in `src/data/paceCalibration.ts`. A course
that needs more than that is exposing a modelling fault, which belongs in the
physics rather than in a correction factor.

Free Mode may run a category on a circuit that is not on that category's
calendar. `trackForConfiguration` then loads the category x course baseline and
marks provenance `category-reference`; it never scales the other category's base
lap time by a category multiplier. The four Super Formula circuits therefore
carry F1 records of their own:

| Course | F1 qualifying reference | Target window | Super Formula reference |
| --- | --- | --- | --- |
| Mobility Resort Motegi | 86.000 s | 84-88 s | 90.369 s |
| Fuji Speedway | 77.000 s | 75.5-78.5 s | 82.815 s |
| Sportsland SUGO | 60.500 s | 59-62 s | 64.500 s |
| Autopolis | 80.400 s | 78.4-82.4 s | 86.139 s |

F1 has never run these circuits, so these are project target windows rather than
observed results, recorded with `estimated` status and low confidence. The
cross-check is the F1-to-Super-Formula lap-time ratio: 91.3 % at Suzuka, the only
2026 course both categories run, against 93-95 % for these windows.

Autopolis is cancelled on the 2026 Super Formula calendar. It is Free Mode
reference material only: it is measured, but it never gates a validation run.

Validate with:

```bash
node scripts/validate-f1-support-circuits.mjs --enforce
```

That run covers twelve families per course - free-practice light-fuel attack,
free-practice high-fuel long run, qualifying attack, race fastest lap, normal
long run, sector times, top speed, average speed, fuel-burn improvement, track
evolution, tire wear and same-stint lap variation - at 30 seeds for Motegi, 50
for Suzuka, 100 for Fuji, 50 for SUGO and 20 for Autopolis. Out laps, in laps and
post-chequered cool-down laps are excluded from every measured population, and
same-stint variation uses clear-air laps only.

## Updating

Run the complete workflow after a new event or corrected source becomes
available:

```bash
npm run update:pace-calibration
npm run calibrate:pace
npm run calibrate:qualifying
npm run validate:pace-calibration
npm run validate:speed-trap
npm run lint
npm run build
npm test
```

A change to the drag or power model is not a pace change with a local effect. It
moves straight-line speed, which moves lap time, which invalidates every solved
controller scale. Re-derive the whole set in that case, including
`node scripts/validate-f1-support-circuits.mjs --calibrate`, rather than
adjusting the circuits that moved most.

Generated offline data lives in:

- `src/data/calibration/f1PaceCalibration2026.json`
- `src/data/calibration/superFormulaPaceCalibration2026.json`
- `src/data/calibration/paceCalibrationManifest.json`

The update script uses bounded requests, retry with exponential backoff,
`Retry-After`, a temporary response cache, nullable-field handling, and
deterministic aggregation. The application imports only the checked-in JSON.
An API outage therefore cannot make the simulator unusable.

Do not hand-edit a measured source value to make a test pass. Correct the
source mapping or classification, regenerate, recalibrate, and retain the
record's provenance. A previously calibrated simulation section is preserved
only when the underlying observation fingerprint is unchanged.

## Known Limits

- Future F1 rounds remain estimates until official classifications and timing
  records are available. Except for new-circuit MADRING, they use 2025
  same-circuit qualifying and classified race timing, a 2024 qualifying
  comparison where available, and the median 2026 change for a matching
  circuit profile. Those inputs widen the range; they do not become official
  2026 values.
- MADRING has no completed event timing. Its wide race range and low confidence
  are intentional.
- Sector and mini-sector comparisons require compatible timing records and are
  not inferred from a result classification alone.
- Public SUPER FORMULA result coverage is less granular than OpenF1, so the
  race references are deliberately more conservative.
- The drag area the model settles on sits at the lower end of published F1 CdA
  estimates. This is a consequence of where the model spends electrical energy
  rather than of the aerodynamic fit: by the time a modeled car reaches peak
  speed its deployment request has fallen away and it is accelerating on the
  400 kW internal combustion unit almost alone, so it needs less drag than a
  real car to reach the same speed. Correcting that means reworking the energy
  allocation model, not the drag terms, and it would move lap time everywhere.
- The 2026 moveable-wing drag reduction is fitted to observed straight-line
  speed, not published. The FIA has not released a drag-area delta for the wing
  modes, and neither has any junior series for its overtake aid, so
  `straightAeroDragMultiplier` and `partialAeroDragMultiplier` must stay
  labelled derived. The MGU-K cutoff speeds themselves are published; the shape
  of the ramp reaching them is not, and is likewise derived.
- The modeled field is more uniform in straight-line speed than the real one.
  After raising the drag response to the aerodynamic machine axes the modeled
  gap between the quickest car and the typical car is about 4 km/h against an
  observed 8. Circuits therefore tend to sit slightly high on the median
  comparison while the field peak matches.
- Monaco, Silverstone qualifying, and the Miami and Montreal races carry the
  largest residuals, 12 to 16 km/h. Silverstone's 2026 qualifying was dry, so
  its unusually low observed peak is a real property of the session rather than
  a weather artefact. These are left as residuals of one shared model instead of
  being removed with per-circuit factors.
