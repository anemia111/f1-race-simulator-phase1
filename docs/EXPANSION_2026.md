# 2026 expansion — current runnable release

KYOJO, SUPER GT (GT500/GT300), WEC (including the 62-car Le Mans grid), and
INDYCAR are executable from Racing series. All 30 distinct courses have closed
geometry. The technical reference catalogue contains 43 records. User-supplied
driver ratings are preserved.

See [the current runtime guide](motorsport-2026-runtime.md) for event-specific
entries, physical assumptions, official references, controls, sporting-rule
coverage and known limitations. The notes below document the earlier foundation
checkpoint and are retained as implementation history, not current readiness.

---

# 2026 machine and course expansion — implementation status

This is an in-progress expansion. F1 and SUPER FORMULA remain the only
executable series. The Data screen exposes source-backed technical and geographic
assets with explicit missing-data labels. Driver abilities are maintained
separately by the user; this change does not calculate or overwrite them.

## Implemented

- A compact train of lapped cars prepares a common passing corridor relative
  to the actual lapping car. Courtesy propagates over gaps up to 0.8 reference
  seconds, within six reference seconds ahead. These are simulator policy values,
  not regulations. Formal blue flags retain the existing 1.5-second threshold.
  Physical clearance, yellow flags, neutralisation and emergency avoidance still
  take priority. A production-engine test clears three backmarkers in 15 seconds
  without stopping or teleporting; it does not guarantee a single uninterrupted
  pass at every circuit or during every flag condition.
- 26 technical variants: KC-MG01; all three GT500 and fifteen GT300 models in
  the 2026 GTA opening-round overview; Honda and Chevrolet INDYCAR configurations
  for road/street, short oval and speedway; Toyota TR010 Hybrid. Unknown fields
  remain null. PS and hp/bhp are converted separately. Lower bounds, ranges,
  reference masses and regulatory minima retain their meanings.
- 17 new OSM-derived closed centerlines: Okayama, Imola, Le Mans, St Petersburg,
  Phoenix, Barber, Long Beach, Indianapolis road course and oval, World Wide
  Technology Raceway, Road America, Mid-Ohio, Nashville Superspeedway, Portland,
  Markham, Milwaukee and Laguna Seca. Reviewed way chains retain OSM node
  identities; there is no hand-drawn geometry or scaling to force official length.
- Ten existing course layouts are reused by actual identity. The calendar union
  contains 30 physical courses, including three still missing a verified closed
  centerline: Arlington, Detroit and Washington DC. Milwaukee's double-header
  shares one layout, while Indianapolis road and oval are separate.
- Official entry snapshots: KYOJO 20; GT500 14; GT300 29; INDYCAR 33 directory
  records; WEC Imola provisional v1 17 Hypercar and 18 LMGT3. WEC crews and
  leading-zero numbers are preserved. These are scoped snapshots, not a complete
  season-wide replacement/substitute/Le Mans-entry history.
- Five KYOJO meetings, eight SUPER GT rounds, eighteen INDYCAR events and eight
  amended WEC events, including the published Motegi, Barcelona and Monza
  replacements. Reviewed bilingual identities link existing people; no fuzzy
  matching or generated driver ratings are used.

## Reproducible sources

Python with `lxml` and `pypdf`:

```
python scripts/import-expansion-catalog.py --as-of 2026-10-07
python scripts/import-expansion-machines.py --as-of 2026-10-07
python scripts/generate-expansion-courses.py
```

The first two commands fetch primary sources and write validated snapshots with
URLs, scope, verification dates and byte hashes. Inspect changed facts before
accepting refreshed data; dynamic HTML hashes can change without fact changes.
Course generation is offline and deterministic from the checked-in OSM snapshot.
An explicit `--refresh --as-of YYYY-MM-DD` fetches the reviewed way IDs again,
validates all chains and lengths before writing, and requires review of the diff.
OpenStreetMap contributors' ODbL attribution and source way URLs are retained.
No third-party requests occur during ordinary client startup.

## Conflicting sources and limits

- INDYCAR mass uses the 28 May 2026 rulebook §14.4: 1785/1770/1740 lb for
  road-street/short oval/speedway, excluding driver, equivalency ballast, fuel and
  drink. Driver equivalency is 185 lb, with the rule's overweight adjustment.
  Honda's introduction page still lists older 1630/1620/1590 lb approximations;
  those figures are not used as current regulatory mass. Chevrolet output is
  unknown and does not inherit Honda's 550–700 hp range.
- GTA's opening-round Supra GT500 overview lists RI4BG and 4725 mm, whereas
  Toyota's manufacturer material lists RI4AG and 4955 mm. This snapshot preserves
  the GTA overview as its explicitly scoped source. Resolving that discrepancy
  against homologation/event documents remains necessary before simulation use.
- Toyota TR010 reference mass/power depend on BoP. The 200 kW front motor is not
  added to the listed 520 kW to invent a 720 kW racing output.
- KC-MG01's 635 kg is manufacturer vehicle weight; model-year applicability and
  driver/fuel inclusion remain unconfirmed. The 2026 race report confirms removal
  of the hybrid system; the manufacturer's reference must not be treated as a
  verified 2026 non-hybrid race mass. Its aero and tyre curves are unmeasured.
- OSM lengths are compared with the cited published course lengths with a 4%
  rejection tolerance. This is an import sanity check, not a precision claim.
  Public-road centerlines, oval racing lines and survey quality cause differences.
  Phoenix's event-page 1.00-mile figure also differs from other official material
  using 1.022 miles. Both source precision and track geometry need calibration.
- New geometry has no verified control line, pit lane, width profile, elevation,
  banking or direction. Those fields remain unavailable and `simulationReady`
  is false. Shape previews are not operational race-course packs.

## Still required for the requested faithful simulator

- Remaining WEC car-specific physical data (seven Hypercar models and nine LMGT3
  models), event BoP, tyre/aero/drag/downforce maps and measured pace calibration.
  Matching brand/model names across GT championships does not establish identical
  race configuration, power or BoP.
- Three missing closed course geometries and operational data for new layouts;
  validated banking and oval-specific lines are particularly necessary for INDY.
- KYOJO sprint/final grid and points rules; SUPER GT mixed-class classification,
  driver changes, refuelling, success weight and fuel-flow restrictions; WEC timed
  endurance completion, stint/rest limits, hybrid deployment and FCY/SC rules;
  INDYCAR rolling starts, hybrid/push-to-pass, refuelling, oval qualifying and
  caution/lapped-car procedures.
- Crew-aware car identity across workers, persistence, results and championships.
  The current 40-car Free Mode cap cannot contain a full SUPER GT or Le Mans grid.

## Validation

Tests check actual train traversal and clearance; source counts, identities and
amended calendars; distinct engine generations; SI conversions and mass basis;
hybrid-output interpretation; source links; OSM node continuity and closure;
measured length bounds; distinct physical courses; and preview bounds. The
desktop playtest checks entry tables, technical cards, geometry previews and
explicit unsupported-series labels. Full publish validation is required before
claiming a completed deployment.
