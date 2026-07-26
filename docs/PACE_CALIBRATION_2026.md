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

## Updating

Run the complete workflow after a new event or corrected source becomes
available:

```bash
npm run update:pace-calibration
npm run calibrate:pace
npm run validate:pace-calibration
npm run lint
npm run build
npm test
```

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
