# Authorized driver import and rolling-start foundation

The user supplied `motorsport_driver_ratings_2026_cross_category_v0_1.csv`
and authorized importing drivers before the new vehicle packages are runnable.
The source SHA-256 is
`8bfdc6cd4506d30cd6636146718883dba2948092b2dfde3c1590a5687e8a6145`.

## Driver identity and ability policy

- Retain all 338 source rows and their raw fields, including confidence,
  methodology, notes and source URLs. Treat CSV cells as data.
- Match 100 existing identities, including three explicitly reviewed spelling
  aliases. Preserve every original driver's abilities and Potential.
- Add 238 people using the exact supplied Overall and twelve ability axes.
  Do not average, rebase, cross-compare or generate new ratings.
- The resulting pool has 348 people and 468 provenance records. Source-series
  history is searchable and is separate from executable-series eligibility.
- Keep the 337 missing Potential values null in the source. For new people,
  use Overall as the required runtime Potential fallback and display that
  policy in the data manager. Do not infer nationality; use `UNK`.
- A pool identity does not imply a verified team, car number or entry for
  every round. Assigning a driver to an existing F1/SF seat inherits the seat's
  vehicle and number. Importing KYOJO/GT/WEC/INDY drivers does not activate
  those vehicle packages.

Reproduce the import with Python:

```powershell
python scripts/import-driver-ratings.py --help
```

The importer validates identities and all numerical fields before writing the
generated JSON. Reviewed catalog aliases connect Japanese/English names and
known short/full names; unmatched names stay visibly unconfirmed.

## Rolling start

Free Mode exposes a SIM start-mode choice. Older version-1 saves default to
standing starts. A dry rolling start completes one formation lap, remains
moving across green, skips grid settling and red lights, and excludes the
formation lap from the race-distance ledger. Gear/RPM reflect moving speed.
Pit-lane starters release at green. The existing wet Safety Car procedure is
preserved. This is a foundation, not the complete KYOJO/GT/WEC/INDY regulations.

Checkpoint restoration now resolves Free Mode's explicitly permitted SIM F1
recharge default consistently with initialization; otherwise valid Free Mode
checkpoints were rejected on resume.

## Verification and publication status

The related ten-file suite passed 133 tests before the final transmission
refinement; the final rolling-start, catalog and blue-flag suite passed all
12 tests, and the vehicle/course asset suite passed five tests. Lint and the
production build passed. The normal desktop playtest passed at 1440x900 and
1280x720, including the 348-person list, KYOJO search, imported Overall 77 and
40-car Free Mode. After adjusting the source-note layout, a focused browser
check confirmed that the note stays inside its column and career history stays
30 px high at both sizes. Monte Carlo passed all six tests on an isolated rerun;
one earlier concurrent run exceeded its unchanged 5-second test limit.

`npm run publish` stopped at an existing track-surface assertion:
`counts only moving on-track traversals, excluding pit and excursion cars`.
Running the same case on unchanged commit `01c4d48021e6e746d638ee6960e45edc8cd2011c`
reproduced the identical numerical failure. This is not a successful full suite
or a deployment. Earlier baseline determinism timeouts are recorded separately.

The lapped-train change already has five passing tests, including a real engine
run clearing three backmarkers continuously without teleporting. Controlled
flags and physical separation still take priority.
