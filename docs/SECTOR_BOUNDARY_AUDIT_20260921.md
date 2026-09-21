# Sector boundary audit — 2026-09-21

Scope: all 28 selectable physical courses (24 F1 + four domestic courses),
plus the separate SUPER FORMULA timing configuration at Suzuka. Timing,
mini-sectors, flags, the map, leaderboard and pit wall now consume the same
course/category sector count. Mini-sectors are eight subdivisions per sector,
not official FIA mini-sector loops: 24 per F1 lap and 32 on four-sector courses.

## F1

The complete source URLs and checked dates are in
[`sectorBoundaries.ts`](../src/data/sectorBoundaries.ts), with the first eleven
2026 papers retained in
[`officialTrackOperations2026.ts`](../src/data/officialTrackOperations2026.ts).
Distances below are individual sector lengths, in km. Official distances do
not make the rendered approximate centreline a surveyed timing installation.

| Course | Source year | S1 / S2 / S3 km |
|---|---|---|
| Albert Park | 2026 | 1.753 / 1.413 / 2.112 |
| Shanghai | 2026 | 1.430 / 1.569 / 2.452 |
| Suzuka (F1) | 2026 | 2.184 / 2.526 / 1.097 |
| Miami | 2026 | 1.866 / 1.730 / 1.816 |
| Montreal | 2026 | 1.092 / 1.396 / 1.873 |
| Monaco | 2026 | 1.051 / 1.419 / 0.867 |
| Barcelona | 2026 | 1.619 / 1.765 / 1.273 |
| Austria | 2026 | 1.215 / 1.697 / 1.414 |
| Silverstone | 2026 | 1.823 / 2.464 / 1.604 |
| Spa | 2026 | 2.254 / 2.820 / 1.930 |
| Hungary | 2026 | 1.736 / 1.542 / 1.103 |
| Monza | 2026 | 1.909 / 1.823 / 2.061 |
| Zandvoort | 2026 | 1.483 / 1.452 / 1.324 |
| Madrid | 2026 | 1.839 / 2.049 / 1.526 |

Madrid's issued FIA map v3 (10 September) supersedes the pre-event 5.416 km
organizer figure with **5.414 km**. Zandvoort's PDF text extraction reads the
distance rows out of order; the visible table was checked before transcription.

The remaining courses use the available 2025 FIA maps, explicitly historical.
The map provides a turn-relative location, not a sector length. These are
projected onto the approximate layout and labelled **derived**, not official
numeric distances. Turn anchors themselves have finite positional precision.

| Course | S1 end | S2 end |
|---|---|---|
| Bahrain | At T5 | 48 m before T13 |
| Jeddah | 265 m before T13 | 120 m before T22 |
| Baku | 46 m before T5 | 56 m before T16 |
| Singapore | 150 m before T7 | 140 m before T14 |
| COTA | 55 m before T7 | 65 m before T13 |
| Mexico City | 136 m before T4 | 242 m before T12 |
| Interlagos | 168 m before T4 | 85 m before T12 |
| Las Vegas | 90 m after T5 | 140 m after T12 |
| Lusail | 80 m before T6 | 75 m before T12 |
| Yas Marina | 205 m before T5 | 100 m before T9 |

Singapore uses the source map's 4.927 km. Projection is by cumulative road
distance, including the closing edge, not by vertex index: the scene uses
arc-length sampling. Official event distances are divided by the official lap
length, with no curvature/time-thirds fallback.

## Domestic / SUPER FORMULA

| Course | Sectors | Cumulative timing lines from control, metres | Source |
|---|---:|---|---|
| Motegi | 4 | 1235.2 / 2576.7 / 3762.7 / 4801.3 | [Operator measurement points, undated](https://www.mr-motegi.jp/mcom/pdf/measurement_point.pdf) |
| Autopolis | 3 | 1089 / 2561.44 / 4674 | [2026 official event guide, page 1](https://autopolis.jp/ap/wp-content/uploads/2026/04/2026-sf-flier-01.pdf) |
| Fuji | 3 | 1305 / 2828 / 4563 | [2026 general competition regulations, printed page 52](https://www.fsw.tv/freeinfo/pdf-cms/6d29dfc71374015d52fdf769da9a76dfaa830c26.pdf) |
| SUGO | 4 | 833 / 1821 / 2568 / 3586 | [2026 four-wheel course map](https://www.sportsland-sugo.co.jp/assets/docs/course/c-racing/2026_racing-course_layout.pdf) |
| Suzuka (SF) | 4 | Reverse bank / Degner exit / 200 m before 130R / control | [Operator sector diagram, drawing dated 2009](https://www.suzukacircuit.jp/result_s/2016/clubman/suzuka-sector-point.pdf), corroborated by [official SF 2021 guide, printed page 34](https://superformula.net/sf/media/21release/SFMEDIAGUIDE_2021.pdf) |

Suzuka SF has no verified numeric-distance transcription in this batch.
Reverse-bank and Degner-exit boundaries are registered between the adjacent
model corners (40% of T6–T7 and 50% of T9–T10); 130R uses the published 200 m
offset against the model T15 anchor. These remain approximate/map-derived.
The older source date is visible in the app; no 2026 survey is claimed.

The old support generator chose two-thirds of the longest straight for every
course. This put Motegi's origin on the downhill **back** straight. Its official
control-line GPS (140.22673 E, 36.53298 N) was projected into the generator's
OSM coordinate frame. The fetched OSM geometry matched the committed 156-point
layout exactly. Reanchoring moves the origin by 0.215656 of the old lap; the
three other GPS points agree with the published splits within 12 model metres.

Fuji distinguishes the **control line (0/4563 m)** from the **starting line
(307 m)**. Fuji and Autopolis control-line registration was read from their
official diagrams on the approximate model geometry, not surveyed GPS. Their
spatial precision remains approximate, despite exact source timing distances.
SUGO's existing home-straight origin agrees with the operator diagram at model
resolution; its new four-wheel 3586 m layout, not the motorcycle chicane layout,
is used.

`supportTiming.ts` aligns the runtime geometry without editing generated point
arrays. Active-aero estimates are regenerated against that aligned geometry.
Elevation/grade/width sampling translates progress back to the original
geodata frame, so changing the control line does not move hills or gradients.
Future OSM regeneration requires rechecking these registrations.

## Verification / persistence

- Boundary ordering, all-course coverage, source lengths, and arc projection.
- Four-sector timing totals and 32 mini-sectors; single/double yellow in S4.
- F1/SF Suzuka separation; unchanged physical placement of measured road data.
- Four-sector checkpoint round-trip and rejection of three-sector mismatch.
- Pit-wall personal-best flags use array indices, including S4.
- The model version is bumped to `2026.09.21.1`: pre-change live checkpoints
  cannot silently resume with incompatible timing lines. Saved configuration
  and championship results are not deleted.
- Weather/surface summaries retain three physical model regions; they are
  labelled zones rather than pretending to be the four timing sectors.
- Desktop publish playtest includes four-sector columns/32 mini-sectors at
  1440×900 and 1280×720, in addition to the normal F1 and Free Mode checks.
