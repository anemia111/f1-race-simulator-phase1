# Course elevation and shared race behaviour — 2026-10-09

## Implemented

- 58 selectable course IDs across F1, SF, KYOJO, SUPER GT, WEC and INDYCAR have a committed 192-station elevation/gradient profile. Shared circuits retain their category-specific control-line frame. There are 48 distinct physical layouts; category aliases are intentionally separate registrations.
- Existing national LiDAR/GSI observations are retained for Silverstone, Zandvoort and the Japanese SF circuits. Suzuka now prioritises the official July 2026 road longitudinal diagram. Other courses use public DEM observations, registered to reviewed geographic centreline traces. These are road-height estimates, **not surveyed circuit dossiers**. Trees/buildings, modified infrastructure and grid resolution limit their accuracy, especially on street courses.
- Suzuka's diagram and the native planar track have different distance origins. Registration matches the actual two planar crossing occurrences to the diagram's labelled UNDER PASS and OVER PASS. The bridge is above Degner's underpass, rather than assigning one ground height to both roads. This registration is reused by SF and SUPER GT.
- The renderer samples height at the original planar arc progress. Domain geometry, timing boundaries and lap distances are unchanged. One common datum is subtracted and metres are converted with the same scale as horizontal track distance; heights are not exaggerated.
- Road ribbons, edges, sector paths, aero/control lines, grid, pits, furniture and car positions retain road height. Labels remain broadcast annotations. Car marker size and shared UI layout are unchanged.
- A gentle default pitch exposes slopes. Existing wheel zoom, drag rotation, right-drag pan and reset remain available. Focus the map and use Left/Right for yaw, Up/Down for pitch, +/- for zoom, Home or double-click to reset.
- Native road input resolution uses the new profiles where national/official inputs were previously unavailable. Official MADRING gradient sections take priority. Extra-category braking and longitudinal force balance now include gravity along the grade; WEC virtual energy uses delivered tractive power, including hill climbing.
- Shared F1/SF wake coefficients and tyre-force ellipse replace the stronger independent extra-category approximation. Drivers use the existing seeded decision traits and observable speed/lap/vehicle context; they do not read a rival's exact fuel or future speed envelope. Passing retains its chosen side until clear. Blue flags use class hierarchy/lap advantage, avoiding instantaneous corner-speed inversions.
- Teams default to protecting their combined result, hold equivalent teammates and release a clearly faster teammate. Driver compliance is seeded separately. A team release is a team instruction, not a blue flag. Safe automated stops can be delayed to avoid double stacking; manual requests and fuel/weather/mandatory-stop emergencies retain priority. Native and extra categories use the same team decision policy.

## Reproduction and provenance

`npm run generate:course-elevations` exports canonical current course frames, then runs `scripts/generate-course-elevations.py` (Python + NumPy). The committed response cache makes repeat generation independent of live elevation-service availability. New or changed geographic requests use the documented [Open Topo Data API](https://www.opentopodata.org/api/): NED 10m in the US, EU-DEM 25m in Europe, and SRTM 30m fallback. Periodic median/weighted smoothing removes isolated grid spikes. Missing data, shape errors and implausible gradients fail into the review list; they are not replaced with made-up elevations.

Geographic F1 traces are the committed snapshot from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits); its scalar altitude properties are not used. The author's MIT notice is retained in `src/data/geodata/F1_GEOGRAPHIC_LICENSE.txt`. Expansion/street geography is © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Three schematic street routes use reviewed road-junction registration or the current OSM raceway, with approximate registration explicitly retained.

Suzuka's source is [the circuit's July 2026 course guide](https://www.suzukacircuit.jp/course_s/pdf/suzuka_courseguide.pdf). The committed `suzukaOfficialElevation.json` contains digitised vector anchors. The vertical axis is 10m at PDF y562.4702 and 60m at y535.5651; horizontal START/FINISH are x32.2996826/x813.5546875. The road diagram's under/over-pass stations are x335.2677/x656.1547. The original public-GSI profile remains intact as an independent source snapshot.

The geometry-bound resolver rejects arbitrary Free Mode shapes using a familiar circuit ID. Saves retain all authored driver ratings. No API credentials, source panels or category-specific UI are added.

## Validation

See `outputs/elevation-qa/` for screenshots and production/local browser reports. Automated tests cover all 58 registrations, periodic continuity, real metre scaling, Suzuka bridge separation, road edges following height, custom geometry rejection, team swaps/compliance/emergency pit priority, wake bounds, pedal slew, blue-flag trains, category race/pit/timing/persistence and native causal driver agents. The normal publisher also executes all six desktop acceptance playtests.
