Latest continuation (2026-10-17): see QUALITY_UPDATE_20261017.md for vegetation, barrier and facility detail, final measurements and preview publication b265175. The original acceptance assessment below remains open.

# Suzuka Cinematic implementation — acceptance remains open

Date: 2026-10-16. Base revision: 0ae1525795996f781fa52d313616989d633b26ba.

## Run and use

`npm ci`, `npm run dev`, select F1, Settings → Championship round → Suzuka,
close Settings, use SIM and 1x, then select Cinematic inside the map stage.
The six camera modes and High/Medium/Low are available in its toolbar.
Overview Map restores the original map. Other tracks, SF, observed modes and
accelerated playback use the original map. This restriction prevents invented
observed vehicle attitudes and sparse accelerated trajectories being presented
as accurate cinematic motion. The timing application and race engine are retained.

`npm run prepare:cinematic-car` rebuilds the licensed concept GLB from a pinned,
SHA-256-verified source. `node scripts/generate-cinematic-car.mjs` regenerates
the original shared rim/brake helper GLB.
This build tool requires Node with TypeScript stripping support (tested with the
workspace runtime); normal application builds read the checked-in GLB and do not
execute the generator. `node scripts/cinematic-playtest.mjs` tests a production
build and saves images/metrics to CINEMATIC_QA_DIR or ../../outputs/cinematic-qa.

## Implemented

- Separate lazy CinematicScene and read-only frame buffer; no simulation modules changed.
- Metric scale from the existing planar circuit and published 5,807m lap length.
- DEM-derived elevation, independent road branches at the crossing, structural
  bridge representation, width sections, painted edges, kerb segments, shoulders,
  gravel, pit-route visualization and a 40-slot grid.
- Licensed Qvist_designs F1 2026 concept (CC BY 4.0), adapted from the credited
  APEX/filan214 display derivative: bodywork, sidepods, floor, wings, Halo,
  cockpit, suspension and tires; original rim/brake/helmet helpers.
- Meshopt + quantization GLB (732,312 bytes) containing three body/wheel LODs
  (~93k/27k/7.5k triangles), shared decoded geometry and team palettes.
  Source and modifications are credited in public/cinematic/qvist-attribution.txt.
  No official team livery, team CAD or final regulation-compliance claim.
- Wheel rotation, curvature-derived steering and body attitude estimates; authoritative
  per-wing active-aero fractions; wet-state rain light (not a brake lamp).
- 6 camera modes, time-based damping, manual orbit, full-screen control.
- CC0 asphalt base/normal/roughness, grass base/normal and HDR environment, sky, directional
  contact shadows, distance fog, wetness-dependent surface roughness and lighting.
- Original estimated pit building, grandstand, wheel, forest, barriers/fences,
  roadside equipment; trees and repeated barriers use InstancedMesh.
- Distance/detail LOD tiers, shared GLB geometry, mesh merging for kerbs and
  buildings, standard Three frustum culling, DPR/shadow/tree presets.
- Actual render count, frame interval p95, draw calls including shadow pass,
  triangles, geometry/texture counts, CPU submission time, optional JS heap and
  renderer identity. Optional disjoint-safe WebGL2 GPU timer queries report null
  when unsupported. No false VRAM number.
- Local asset-error boundary so a failed Cinematic load can return to Map.

## Truth and missing data

This is a working reconstruction preview, **not a completed photoreal Phase 1**.
The on-screen caption identifies estimated dimensions and vehicle pose.

The course uses the existing MultiViewer/OpenF1-derived planar layout, scaled to
lap length. It is not a newly surveyed georeferenced centerline. Existing GSI
elevation has 96 stations, about 60.49m apart, smoothed and aligned to that layout.
Road Y comes from these samples. Local widths 11/12/14m fit the officially published
10–16m range, but no independent local-width survey is available. Banking is neutral.
The bridge is placed at the actual centerline intersection (~.4358 and .8446 lap
progress); its thickness/supports and DEM-derived clearance are estimates, not
surveyed bridge geometry. Surrounding terrain is nearest-road elevation artistic
infill, not a full GSI DEM terrain raster.

Kerbs are allocated around real corner markers but their exact sections and
runoff side/width require corner-by-corner photographic verification. Barriers,
fences and vegetation are estimated corridor placements. Pit route follows a
presentation offset of the track and the existing engine pit-progress contract;
it is not the real pit-centerline survey. Facilities are aligned relative to
the straight and official/photographic topology, but positions/dimensions have
not been geospatially calibrated. Parking, service roads, authentic marshal
posts, distance-sign text and detailed crowds are incomplete.

The licensed Qvist concept was published in April 2025 and expresses proposed
2026 category features; it does not reproduce any particular team's actual 2026
bodywork. The prepared model measures approximately 1.900m wide, 5.394m long,
1.055m high with 3.4m axle separation after deliberate metric normalization.
These are reconstruction dimensions, not measured team dimensions. Detailed
cockpit controls, driver arms, team-specific sidepod/wings, authentic tire markings,
wet tire meshes, damage, lockup, smoke, spray and pit crew are incomplete. Steering,
pitch/roll are presentation estimates rather than physical telemetry. Rain geometry
and local puddles are not implemented. The HDRI is a generic CC0 daylight source;
the fixed sun is a declared visual assumption, not an event-time astronomical solution.

KTX2 GPU texture compression, a complete GPU-byte ledger, automatic
adaptive presets, context-loss recovery, event-aware TV director, camera collision
proof over the full lap and endurance stability are not complete. Current JPG
textures reduce transfer size, but are not GPU-compressed textures.

## Reference photographs and quality assessment

Two 2026 photographs were inspected as independent references, not used as textures:

1. BWard 1997, **Suzuka Circuit Grandstands 24-5-2026 - 1.jpg**, captured
   2026-05-24, CC BY 4.0. File page:
   https://commons.wikimedia.org/wiki/File:Suzuka_Circuit_Grandstands_24-5-2026_-_1.jpg
2. BWard 1997, **Suzuka Circuit Ferris Wheel 24-5-2026 - 1.jpg**, captured
   2026-05-24, CC BY 4.0. File page:
   https://commons.wikimedia.org/wiki/File:Suzuka_Circuit_Ferris_Wheel_24-5-2026_-_1.jpg

Photograph license: https://creativecommons.org/licenses/by/4.0/ . Reference copies
in the QA deliverable are unmodified. Screenshots are independent original renders;
photographic pixels were not converted into textures or models.

The photographs show a continuous multi-storey pit façade, substantial black
catch-fence uprights with overhanging heads, densely structured grandstands and
red wheel supports/cabins with fine cross-bracing. The original scene reproduces
only coarse topology and basic forms. Inspection prompted red wheel supports/cabins
and corrected pit/stand camera placement. The pit façade curvature, exact stand
sections, fence spacing/profile, wheel cross-bracing, crowds and microdetail still
differ substantially. No photographic likeness pass is claimed. Image capture
does not certify photographic camera calibration; exact photo pose is unavailable.

No Google imagery extraction or logos copied from photos are included. The
third-party Qvist concept is CC BY 4.0 and is not a team-specific vehicle. Models, code and publicly sourced road data have separate provenance.

## Verification scope

Meaningful added tests cover wrap interpolation, reset/pit discontinuities, no
snapshot mutation, normalized metric road frames, DEM branch separation, road
winding, and quantized-GLB geometry scale. Existing publish pipeline runs lint,
the full Vitest suite, build and legacy playtest. The separate cinematic test
visits all 6 cameras, 3 qualities and 22/40-car fields and returns to Map.

The default headless browser uses SwiftShader, which falls far short of 60fps.
A separate `CINEMATIC_HARDWARE=1` run verified Intel Iris Xe / D3D11 with timer
queries (driver 32.0.101.7088). The latest run collects 10 separate approximately
1-second render windows for each scenario, with both 22 and 40 cars fullscreen.
The final per-scenario results are in the delivered cinematic-hardware-qa/results.json;
High renders at 1920×1080 and Medium at 1632×918. These are short moving-race
samples, not an all-lap or 2-hour acceptance result. Presets can lower internal
resolution, and the actual buffer dimensions are saved. GPU timing is conditional;
VRAM is not measured. Quality comparisons are not controlled at identical race
states, so these runs do not quantify the performance benefit of each preset.
An earlier run shared load with system tests. The final camera verification run
was performed after the long-running simulation suite was stopped.

The full publish pipeline reached race.test.ts (163 tests, 11 failures and 9 skips
reported). Three fast assertion failures were reproduced in an unchanged detached
checkout of 0ae1525: surface rubber traversal accounting, formation skip returning
formation instead of grid, and VSC clamped movement speed. The remaining full suite
was stopped after this pre-existing gate failure was established. No full-suite
pass or public deployment is claimed. A separate legacy playtest run also failed
to observe a requested pit stop within its wall-clock deadline under concurrent
load; an isolated retry is recorded separately. Simulation sources were not changed.

## Next acceptance work

1. Complete cockpit/driver, authentic team bodywork and approved liveries using
   the asset contract in ASSET_SPEC.md; retain the licensed concept as a category
   preview, with its CC BY attribution.
2. Acquire independent local road-width/bank/deck and facility position evidence,
   then replace per-feature estimated definitions with source-labelled surveyed data.
3. Build full DEM terrain and real pit path; calibrate against independent anchors.
4. Match at least 8 licensed reference views with stored camera poses; address
   cockpit, fence, facade, wheel, vegetation and surface differences.
5. Measure 22/40 at full-screen 1080p on identified real GPUs, implement KTX2/
   resource ledger, and pass 2-hour endurance and route/camera coverage tests.

## Final hardware sample

| 車両数 | カメラ | 品質 | 内部解像度 | 平均render fps | 計測窓平均GPU ms |
|---|---|---|---|---:|---:|
| 22 | tv | medium | 1632×918 | 60.01 | 7.28 |
| 22 | trackside | medium | 1632×918 | 60.01 | 8.01 |
| 22 | chase | medium | 1632×918 | 60.04 | 8.43 |
| 22 | onboard | medium | 1632×918 | 60.01 | 5.94 |
| 22 | helicopter | medium | 1632×918 | 60.01 | 4.56 |
| 22 | free | medium | 1632×918 | 60.01 | 5.11 |
| 22 | chase | high | 1920×1080 | 59.07 | 11.78 |
| 22 | chase | low | 1286×723 | 60.03 | 8.27 |
| 40 | chase | low | 1286×723 | 60.01 | 7.91 |
| 40 | chase | medium | 1632×918 | 59.62 | 11.34 |
| 40 | chase | high | 1920×1080 | 56.85 | 14.64 |

GPU columns average available per-window timer means. Short samples only; High 40-car performance and stable 60fps acceptance remain unmet.
