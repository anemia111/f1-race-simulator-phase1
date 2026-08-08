# 2026 Series and Driver-Pool Architecture

The simulator has two executable 2026 series. Formula 2 and Formula 3 are
historical driver sources, not runnable categories.

| Executable series | Teams | Cars | Tyres | Overtake system |
| --- | ---: | ---: | --- | --- |
| Formula 1 | 11 | 22 | Pirelli | 2026 active aero plus electrical Overtake |
| SUPER FORMULA | 16 | 24 | Yokohama control dry/wet | OTS |

`SeriesId` is therefore limited to `f1-custom | super-formula`. Runtime
calendar, qualifying, tyre, vehicle-physics, scoring, Free Mode, and weekend
persistence paths accept only those IDs. A persisted explicit F2/F3 series ID
is rejected; only old saves with no series ID receive the legacy F1 default.

## Driver Pool

The canonical 2026 pool contains 110 identities and 111 provenance records.
It includes all 22 former F2 and all 30 former F3 drivers from the pre-migration
registry. Those 52 records are stored in
`src/data/historicalDriverPool2026.json` with:

- the exact migrated identity, overall, potential, and twelve compact ratings;
- an explicit `synthetic` rating source and deterministic method version;
- source season, series, team snapshot, role, and car number;
- career history whose source team is never a live `Team` foreign key.

The historical car number is searchable metadata only. When a pool driver is
assigned to F1 or SUPER FORMULA, the target seat supplies the live team, car
number, role, and start offset. Source-series provenance never changes vehicle
physics or driver skills.

The assignment validator enforces existing teams, executable series, season,
unique active car numbers, team/grid capacity, and at most one active regular
seat per driver and season. Reserve, development, substitute, and test records
remain distinct from a regular race seat.

## Free Mode and Data Manager

Free Mode offers F1 and SUPER FORMULA machinery on the deduplicated physical
track union, with 1–40 entrants selected from all 110 pool identities. F2/F3
source series, teams, and numbers remain searchable as visibly labelled
history. They are never offered as a vehicle category and their old car number
is never inherited by a new entry.

The data manager likewise separates active F1/SF affiliations from historical
provenance. A swap exchanges occupants while each runtime seat retains its
team, car number, role, and grid offset. Series configuration backups accept
any canonical pool identity and round-trip the target seat.

## Vehicle Eras

Vehicle eras are explicit and separate from source-series history:

- `f1-2026-current` — executable F1 era;
- `sf-2026` — executable SUPER FORMULA era;
- `f1-2025-tpc` — validation-only TPC anchor, rejected by runtime resolution.

The effective-rule resolver selects official sources by series/event/session
scope, effective date, authority, and supersession. Equal-precedence conflicts
stay unresolved. Official rules, official guidance, observed inference, and
simulator policy remain separate evidence lanes.

## Physical and Data Boundaries

- `baseLapTimeMultiplier` is absent from `SeriesRules`, production data, and
  the physical/Free Mode path.
- SUPER FORMULA team operations can affect pit-crew execution, but every SF23
  machine receives the same base PU, aero, grip, tyre-management, and
  reliability profile.
- OpenF1 enrichment remains F1-only. Its raw legacy `drs` telemetry channel is
  retained as observation data and is not a runnable 2026 DRS rules package.
- Missing official observations remain unavailable; provenance metadata is not
  converted into a hidden pace correction.

## Source Boundary

The current F1 field comes from `src/data/f1Performance.csv`. Executable series
metadata and the SUPER FORMULA field come from
`src/data/motorsportSeries2026.json`. Frozen regulation metadata, checksums,
licensing notes, and unavailable authorities are recorded in
`artifacts/source-manifest.json` and `artifacts/regulation-authority-audit.json`.
