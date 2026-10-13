# Formula Race Simulator Handoff

## Latest: KYOJO evidence correction and Juju67 (2026-10-13)

- User challenged unsupported KYOJO ordering and requested correction; Juju now67 explicitly. Prior64 and older KYOJO ordering are superseded.
- Confirmed official2026 standings through Rd3 and2025 final standings; reported Rd4 qualifying/Sprint/Final provide recent context. FSW apparent Rd4 PDF points to Rd2 sheet; excluded as mismatched evidence.
- Tomishita/Saito/Shimono70; Onaga/Ciconte69; Sato67; Miura66; Sasaki65; Matsui64; Raddatz/Kanemoto63; Burton/Shiraishi62; Hirakawa61. Other KYOJO priors remain, no unsupported large downgrade. Absolute scale and inherited axis splits remain editorial priors, not measured skill.
- Revision2026-10-13.2 includes21 v1 default snapshots for safe save migration across seats; preserve manual axes/potential/setup.106 focused tests across nine suites pass. No long tests. See docs/DRIVER_RATING_REVIEW.md for limits and evidence.

## Latest: Yukinakayama display name (2026-10-13)

- User requested 中山裕樹 be shown as `yukinakayama`. Runtime display identity now normalizes the same stable ID in F1, SF and the extra four categories, including old saves; ability120 and custom setup are preserved.
- Authored source CSV/import records and historical result snapshots retain their original spelling. Only current roster/profile labels change. Six focused suites123 tests pass, build/lint pass. No long tests. This change is included with the team-principal upgrade currently in progress.

## Latest: Shared absolute driver ratings (2026-10-13)

- User prioritized ratings over the pending team-principal upgrade. All six categories share one absolute person scale; ordinary maximum100, yuki_nakayama alone120.
- Explicit338-person review overlay,72 changed targetOVRs; ten legacy profiles retained (348 total). SF main83–87, KYOJO leaders67–70/midfield62–65, Juju64 per user, F1 elite95–98. Exact scores are editorial, not official or isolated-car skill estimates. Unverified inherited rows are labelled.
- Expanded runtime12-group mean aligns to reviewedOVR. Same person keeps axes across seats. Editors and saved inputs enforce identity limits. Whole old defaults migrate, manual edits/potential/setup remain. Original imported artifacts/history are preserved.
-103 focused checks pass across nine suites, TypeScript/lint pass. See docs/DRIVER_RATING_REVIEW.md. Standing user exception: publish with -SkipFullTestSuite -SkipPlaytest; no long tests. Existing SF coarse qualifying spread remains unresolved.

## Latest: Unassisted passing and category wake response

- User requested realistic passing for categories without F1 ERS. Extra four
  championships now consider observed braking/exit behaviour, public pace/tyre
  age and their own physical envelope when trapped at the leader's speed, rather
  than requiring greater public power/mass. Equal-car simultaneous acceleration
  still does not force an attack. No added grip/power/distance or automatic pass.
- Separate wake drag/downforce SIM priors for KYOJO, GT500, GT300, Hypercar,
  LMGT3, LMP2 and INDYCAR road/oval; low-speed ramp, gap/lateral/turn attenuation
  remain. Shared wake helper gets an explicit optional cap; native F1/SF defaults
  remain. Existing SF OTS, Indy hybrid/P2P and WEC combined caps are preserved.
- 99 focused tests pass across seven suites, including zero-power actual force
  response, four actual engine attack decisions with no boost, all six abrupt
  stop regressions and traffic/pit/grid/force constraints. TypeScript/lint pass.
- Additional 27 selected wake/driver/tyre/brake/gear checks pass across three
  suites, excluding full flying-lap cases (126 total focused checks).
- Official sources establish sporting/qualitative context, not measured wake
  coefficients. See docs/UNASSISTED_OVERTAKING.md for explicit SIM priors/limits.
  Team-principal upgrade remains on hold. Skip full tests/playtest per user.

## Latest: Six-category abrupt traffic stops (2026-10-12)

- User interrupted the authorized team-principal/season upgrade to prioritize
  abrupt traffic stops, then clarified these occur during ordinary running too.
  Team-principal implementation remains on hold; no files were changed for it.
- Reproduced GT/WEC/INDYCAR 90–180 km/h -> 0 in 0.1 s and large native occupancy
  speed drops. All six now check occupied corridors, anticipate closing merges,
  and synchronize accepted lateral constraints into retained handling state.
- Extra execution proposes a full immutable field then resolves lateral and
  longitudinal occupancy before travel-dependent bookkeeping/timing. Removed
  stale-neighbour movement projection and trapezoidal speed inversion after caps.
- Native traffic/occupancy/grid staging now use physical arc metres, including
  nonuniform centreline points and timing-line wraps. Preserve physical passing,
  stopped obstacles, flags and class-start 500 m separation. Launch allowance is
  4.5 s; following no longer remains blind for 10 s.
- 109 focused tests across 12 suites pass; short six-category start/mid-race
  fixtures include nonoverlap, motion and merge/escape guards. Extra timing tests
  also exposed/fixed pre-existing negative-zero telemetry save divergence.
- All 47 FP/Q/SQ passing/blue-flag tests pass (156 focused checks total); final
  extra road-edge synchronization passes the affected 61-test subset. TypeScript,
  lint and diff whitespace checks pass; publication builds production output.
- Baseline launch speed guards already failed at HEAD after prior pedal changes;
  adjusted broad minimum-speed guards to existing physical pace, preserving
  no-instant-stop checks. The coarse SF equal-car qualifying spread test already
  fails at HEAD (~43 s), remains a separate unresolved issue. No full suite,
  endurance, all-course pace or browser FPS claim. See docs/TRAFFIC_CONTINUITY_FIX.md.
- Standing publication exception remains `-SkipFullTestSuite -SkipPlaytest`.

## Latest: Race Engineer upgrade (2026-10-12)

- User accepted upgrade items 1–4 and explicitly excluded item 5 (lap collection).
  Shared SIM Engineer view now covers persistent person-specific pedal preferences,
  measured FP setup experiments, watch moments and strategy comparison/instructions.
- Explicit styles win; neutral profiles use versioned person-ID SIM preferences,
  identical across categories. These are labelled unmeasured, separate from ability.
  Nakayama 120 and authored axes remain. Pedals feed actual forces, with safety,
  slip and combined-load limits preserved.
- FP captures only aggregates from fresh complete valid non-pit timing records
  after stable setup/conditions. Before/after has condition/fuel/tyre disclosures.
  F1/SF retain six setup fields and parc ferme; extra drivers gain saved per-person
  brake/differential and supported wing adjustments (SIM coefficients, no KYOJO wing).
- Watch moments identify conditional closure, tyre differences, approaching mixed
  classes, PB and observed loss; buttons open map or paired Telemetry Lab.
- Now/+3/+5 forecasts expose class rejoin range, traffic, fuel safety and labelled
  heuristic uncertainty. Worker/fallback plans persist, cancel and settle on actual
  release. Existing F1 AI reasons/outcomes are shown; extra AI evaluates tyre
  economics once/lap, with hard fuel/crew/energy/compound constraints preserved.
- SF control-tyre-only SIM stops use operational SF speed and explicit path/7s crew
  estimate; no refuelling, F1 compounds or ERS. Tyre inventory is consumed once at
  release; SIM safety threshold is 28% life. This adds no official stop mandate.
- 51 focused tests pass across seven suites. Short synthetic interaction checks and
  actual paused-app six-category Engineer/FP navigation plus independent F1/GT
  setup edits pass; screenshots inspected, no page errors in successful checks.
  See docs/RACE_ENGINEER_UPGRADE.md for formulas and limitations. No full race,
  sustained FPS, all-course calibration or long test is claimed. Standing publish
  exception: npm run publish -- -SkipFullTestSuite -SkipPlaytest.

## Latest: Telemetry Lab (2026-10-12)

- Shared six-category telemetry UI now has independent A/B lap selection,
  self/previous-lap comparison, distance-aligned observed clock delta, clickable
  speed-colored circuit, shared/pinned cursor and keyboard slider, corner zoom,
  distance-weighted pedal summaries, sampled corner comparisons and CSV export.
- Four channel groups expose up to 24 values. Record four wheel surface heat,
  average core heat, brake heat, signed longitudinal G, yaw/roll/pitch, fuel,
  category tyre life and hardware-owned hybrid state alongside existing traces.
  No fake SF ERS; unavailable/legacy values remain absent. Three-lap/1,536-point
  bounds and GT/WEC delta worker snapshots remain unchanged.
- Add t3/t3z extended histories, level-1 zlib for larger saves and bounded
  decompression. t1/t2 remain readable. fflate 0.8.3 is now a direct dependency.
  See `docs/TELEMETRY_LAB.md` for units, interpolation, thresholds and limits.
- 41 focused tests pass, including actual short recording in all six categories
  and save/worker/compression compatibility. A short isolated synthetic browser
  fixture passed tabs/map/keyboard/zoom/self-compare/CSV checks at 1280x900;
  screenshots were visually inspected. This is not a full application playtest
  or sustained FPS/pace validation. Standing no-long-tests exception applies.

## Latest: GT/WEC performance (2026-10-12)

- Share 512-station speed plans across value-identical hardware. Plan density
  follows local altitude at each station with current ambient temperature,
  avoiding a whole-course rebuild whenever a car changes elevation. Live force
  density and the 0.1 s physics step remain exact/current.
- Send incremental telemetry in worker snapshots; reconstruct identical bounded
  history on the UI. Worker-side automatic save serialization preserves the
  existing save format. Snapshot scheduling is 10 Hz with bounded work batches
  (30 worker ticks / 2 fallback ticks), which limits very high effective playback
  speed while improving command responsiveness.
- Short full-field compute measurements: GT43 warm five ticks 1,231.7 -> 88.9 ms;
  WEC62 454.5 -> 46.4 ms. These measure planner optimization, not browser FPS.
  See `docs/MOTORSPORT_PERFORMANCE.md` for method and limits.
- 101 focused tests pass (65 cache/snapshot/shared-physics/grid/ability/handling,
  33 short driving checks, 3 worker/save/performance checks); seven full flying
  lap cases excluded. TypeScript and lint pass. Publish uses the user's standing
  exception `-SkipFullTestSuite -SkipPlaytest`; no long test/browser playtest.

## Project

- Path: `C:\Users\yuuki\Documents\Codex\2026-07-09\files-mentioned-by-the-user-f1\outputs\f1-race-simulator-phase1`
- Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, OpenF1
- Dev URL: `http://127.0.0.1:5173/`

## User Intent

Build a PC-first F1/SUPER FORMULA observer, timing, and race-control
simulator. It should feel factual and operational rather than like an arcade
driving game.

- Do not add onboard cameras, replay, radio playback, highlights, video, or a
  multi-camera broadcast-production layer.
- Mobile support is intentionally out of scope.
- Use OpenF1/FIA data when it exists and label SIM, historical, live,
  fallback, and unavailable values truthfully.
- Cars remain on one racing line without artificial lateral attack, defence,
  blocking, or overtaking animation.
- Keep rendering light: primitives, no GLB cars, no heavy post-processing, and
  no expensive per-frame domain calculations.

## Data And Factuality

- `src/data/tracks.ts` exposes 24 selectable track packs. The amended FIA
  calendar has 22 championship rounds; Bahrain and Jeddah remain selectable
  but are visibly marked cancelled.
- `src/data/realTrackLayouts.ts` contains 23 OpenF1-derived centerlines and the
  official 2026 MADRING organizer vector. Do not hand-edit its point arrays.
- `src/data/measuredRoadProfiles.ts` contains reproducibly generated 96-station
  public-geodata profiles for Zandvoort, Silverstone, Suzuka, Motegi,
  Autopolis, Fuji, and SUGO. Elevation is observed/interpolated, grade is
  derived, and Zandvoort alone currently has low-confidence generated banking
  and a 10 m OSM width tag. These are not FIA circuit-dossier surveys.
- `src/data/f1Performance.csv` is the canonical F1 11-team/30-driver source on
  a 0-100 scale (22 fielded seats, two per team; the rest are `reserve` rows).
  Cadillac is present, and Ferrari `NAK` retains car number 31.
- `src/data/motorsportSeries2026.json` contains only executable F1/SF series
  packages. `src/data/historicalDriverPool2026.json` retains all 52 former
  F2/F3 identities as provenance-only history. The validated relational pool
  originally contained 110 unique people and 111 provenance records. The
  user-authorized `importedDriverRatings2026.json` adds 238 people from 338 CSV
  rows, yielding 348 people and 468 provenance records. All original abilities
  remain intact; new people use the exact supplied CSV axes and overall.
  Missing Potential stays null in the imported source and uses Overall only
  when materialized into the existing runtime schema. Unknown nationality is
  `UNK`. Category history does not assign a championship seat or make a new
  category executable.
- MADRING uses the issued FIA 5.414 km / 57-lap specification and 22 numbered
  model corners. Its 2026 sector distances are now source-backed; it still has
  no fabricated OpenF1 telemetry-coordinate projection.
- All 28 physical courses have source-backed timing references. F1 keeps three
  sectors; SF Suzuka, Motegi and SUGO use four (32 model mini-sectors). See
  `docs/SECTOR_BOUNDARY_AUDIT_20260921.md` for source dates and precision limits.
  Historical turn-relative positions and SF Suzuka remain map-derived.
  Support-course control-line alignment preserves the original geodata frame
  through `measuredRoadProgressOffset`. Do not remove that offset or manually
  rotate generated road-profile arrays. Checkpoint model is `2026.09.21.1`.
- OpenF1 collection covers drivers, grid/results, laps, sectors, mini-sectors,
  weather, pit/stints, race control, positions, intervals, overtakes, radio,
  car telemetry, location, and championship data when endpoints provide it.
- The top HUD always labels the core race engine `SIM`. Explicit `SIM`, `HIST`,
  and `LIVE` modes prevent observed timing from silently mixing into a SIM
  session; fields also carry source chips.
- Raw OpenF1 location is projected to centerline progress and screened for
  off-track/garage samples. The local lane model owns lateral placement.
- Missing API values use an explicitly labelled SIM estimate; never present a
  model value as observed or official.
- API requests share throttling, cache, retry, and nullable-record handling.
- OpenF1 requests select the actual FP/Q/SQ/Sprint/Race session, support an
  optional in-memory Bearer token, normalize known schema drift, and expose
  endpoint status without persisting credentials.
- Historical mode has one coherent target timestamp for laps, telemetry,
  position, intervals, weather, and race control instead of mixing latest
  samples from different moments.
- OpenF1 clean race laps enrich tire, stint, sector, and field calibration but
  never replace the neutral physical base lap. Those samples already include
  fuel, tire, traffic, and weather effects, so rebasing onto one and applying
  the simulation effects again would double-count pace loss.
- `src/data/fiaEventPacks2026.ts` tracks event-page and decision-document
  coverage. Links are not marked as normalized operational values.
- `src/data/calibration` stores versioned, source-backed 2026 event records for
  all 22 active F1 rounds and the current SUPER FORMULA circuits.
  `src/data/paceReferences2026.ts` is only the legacy adapter. Official Q3
  classifications, classified clean OpenF1 race laps, derived values, future
  estimates, and unavailable values retain separate status/confidence fields.
  The update and 100-seed inverse-calibration workflow is documented in
  `docs/PACE_CALIBRATION_2026.md`.

## Simulation State

- Sessions: FP1/FP2/FP3, Q1/Q2/Q3, SQ1/SQ2/SQ3, Sprint, and Race.
- Timed sessions start from pit boxes, distinguish out/attack/in laps, run the
  official Q/SQ clocks and breaks, freeze the clock during planned red flags,
  and reduce the 22-car F1 field to the measured top 16/top 10 rather than a
  precomputed order.
- Timed-session adjudication includes deleted track-limit laps, double-yellow
  invalidation, impeding/grid penalties, serialized pit-exit queues, chequered
  lap completion, and Q1 107% checks with explicit steward exemptions.
- Race starts use a moving formation lap, return to grid slots, five lights at
  one-second intervals, then a deterministic SIM starter hold of 0.2-3.0
  seconds after the fifth light before launch. Opening laps do not trigger an
  immediate strategy stop.
- Grid markings, staged cars, and live launch state share the same physical
  column offsets. A phase change alone cannot shift a stationary car sideways.
  Live lane-change speed is bounded by forward road speed, preventing sideways
  sliding at rest and excessive steering before the car has accelerated.
- Completed lap records use elapsed timing-line crossing timestamps. Sector
  and lap accounting now runs after field occupancy resolution, so a candidate
  crossing blocked by traffic cannot create a phantom lap or sector record.
  Real-time playback uses the same 50 ms integration step at every multiplier.
  Normal running has anticipatory following brake/throttle demand based on
  closing speed and measured lane separation; the initial ten-second launch
  and incident-avoidance manoeuvres retain their dedicated behavior.
  Yielding/blue flags no longer bypass body clearance. The bounded stationary
  lateral escape described below remains a SIM approximation: removing it
  without a reverse/steering manoeuvre model reintroduces a blocked queue.
  Sector
  records always sum to the measured lap. Each lap also persists 24 measured
  mini-sector intervals; the first car through is provisionally purple and a
  later faster interval moves the old purple to personal-best green. Race
  `GAP` and `INT` labels compare absolute passage times at the latest shared
  mini-sector line and remain frozen between lines; instantaneous physical
  gaps remain separate inputs for traffic, strategy, and overtaking.
- Tire wear is percentage-based with compound, pace, weather, thermal, damage,
  and driver-management effects. Strategy reads measured wear and brake heat.
- Rain intensity and track grip transition continuously rather than jumping at
  four-minute boundaries. Inters and wets use different crossover ranges.
- 2026 active aero and electrical Overtake are separate systems. The Energy
  Store tracks MJ, SOC, charge/discharge power, conversion losses, recovery,
  deployment, and component temperatures. Speed, throttle, brake, RPM, gear, tire
  temperature, wear, and brake temperature are live car state. OpenF1 `drs`
  remains visibly labelled as a raw historical/API field.
- Strategy includes traffic, undercut/overcut, SC/VSC, weather forecast,
  tire-condition, brake-cooling, damage, and manual calls. A short-horizon
  expected-loss model compares degradation, control-phase savings, rejoin
  traffic, and double-stacking once per lap.
- F1 FIA 2026 tire allocations:
  - Standard: `H2/M3/S8/I5/W2`
  - Sprint: `H2/M4/S6/I6/W2`
- SUPER FORMULA uses one Yokohama dry specification. Category labels and
  inventory are defined by the series registry, not inferred from F1.
- Cars carry bounded physical lateral position/velocity and reserve attack,
  defence, yield, and avoidance corridors. Battle outcomes are evaluated once
  per 1/12-lap segment and use the actual mapped activation-zone/sector
  position.
- A running car blocked by another moving car inherits the queue's forward
  movement instead of being parked for one frame to recreate a pre-existing
  safety margin. The occupancy resolver still stops for actual body-overlap
  risk and for a genuinely stationary obstruction; normal defence therefore
  remains rolling while red flags, pit boxes, and incidents can still stop a car.
- A close pack below 1.9 seconds receives smoothly fading tow/pace support,
  capped at 0.9 seconds per lap. Once the train breaks, each car returns to its
  own projected pace. A formal pass outcome now converts the attacker's relative
  gain into a temporary defender pace request, with at most a 12% concession
  applied to pedal demand and reference speed before force integration. The
  event's loss budget is a SIM estimate, not an exact measured delay. Travel
  uses the full physics step; repeatedly shortening travel and feeding that
  reduced speed back into the next tick previously brought cars almost to rest.
  Formal battle outcomes wait until the 4.5-second standing launch is
  complete; physical position crossings still determine passes. Lateral
  occupancy must clear and the pass event is emitted after distance order crosses.
  Red-flag standing restarts record a separate launch timestamp without changing
  the original race clock. Actual inward lane changes wait for an occupied
  corridor to clear before longitudinal resolution, preventing cut-in stops.
  Healthy followers avoiding an incident retain a bounded 0.4 m/s low-speed
  lateral manoeuvring envelope even when the longitudinal collision guard
  briefly stops them. This is a SIM escape allowance, not grid-start steering
  or permission to overlap the stopped car. Avoidance starts up to three
  seconds ahead and remains active until the obstacle is fully behind.
  User-requested calmer racing scales battle contact probability to 40% of its
  previous value and halves standalone driver-error probability. Of those
  errors, 70% are minor and 5% terminal; mechanical failure rates are unchanged.
- Pit stops include entry/exit interpolation, boxes, tire-set consumption,
  double-stack delay, unsafe release, speed violations, repairs, and serving
  owed penalties. F1 teams use distinct pit-crew ratings derived from the
  official 2025 DHL fastest-stop results; legacy saves with the old uniform
  rating migrate automatically while non-uniform custom ratings are preserved.
- Race control includes yellow/VSC/SC/red, restart effects, track limits,
  investigations, penalties, retirement, and post-race classification.
- VSC compliance treats the delta as a minimum sector time. `vscPaceScaleForDelta`
  never commands more than `vscMinimumTimePace`, so banked delta buys a return to
  the delta pace and not to racing pace; `calculateCarTelemetry` caps the VSC
  target at the plain local reference speed, keeping straight-line headroom and
  car performance out of it; and `VSC_DEPLOYMENT_ALLOWANCE_SECTORS` in `race.ts`
  gives each car two marshalling sectors to reach the delta before judging
  starts, because braking from racing speed is not speeding. A car that keeps
  racing is still judged from the allowance onwards. Without these three, one VSC
  deployment penalised 17 of 20 cars.
- Local yellow and timed-session double-yellow states are published separately
  for sectors 1/2/3. Only the affected sector slows and suppresses racing; the
  dashboard and 3D trace show the same state. OpenF1 sector/scope fields map to
  the same display without mixing observed and SIM flag sources.
- Single and double yellow have distinct map labels and pace reductions. A
  disabled, off-track, or incident-delayed car is excluded from neutralisation
  queue ordering, allowing the entire following field to clear the obstruction
  while preserving order behind the last unaffected car. Explicit on-track and
  off-track stopped states drive the staged response: local double yellow first,
  then SC for a track obstruction or VSC for an off-track recovery under the
  simulator's race-director policy.
- Off-track cars wait at the excursion point until a deterministic recovery
  delay has elapsed and traffic gaps ahead and behind are safe, then rejoin at
  reduced speed. Blue flags use physical proximity to the next lapping
  boundary and appear only once the lapping car is within three seconds, rather
  than firing merely because a one-lap deficit exists.
- Q1/Q2/Q3 and SQ1/SQ2/SQ3 use the dedicated qualifying machine and driver
  performance axes. FP, Sprint, and Race use the long-run/race axes, so setup
  data can change single-lap and race pace independently.
- Fixed-seed pace acceptance uses 100 qualifying seeds and, for completed
  races, 100 race seeds. Official top-three Q3 medians stay within 0.3 seconds,
  pole within 0.351 seconds, field spread within 0.6 seconds, and classified
  clean green-race pace within 0.7 seconds. Winner event averages remain
  contextual because they include stops and neutralisations.
- Drive-through and stop-and-go penalties use dedicated pit services, service
  deadlines, and disqualification when unserved. Low-power starts trigger a
  rear warning light and an MGU-K event.
- Contact investigations resolve deterministically to no further action, +5s,
  or +10s; independent penalties remain additive and can be served at stops.
- Event history retains 100 SIM events; the scrollable UI exposes the newest
  30 or the newest 30 OpenF1 race-control messages.
- Local championship scoring uses finishing position, the FIA 90% classified
  distance threshold, and race-result countback for tied points.
- Component condition, allocations, replacement penalties, and pending grid
  drops persist in season garage state between rounds.

## 3D And UI

- Phase 2 foundation adds TEAM and DECISIONS to the existing pit-wall overlay.
  TEAM handles the actual number of same-team entrants (including Free Mode),
  with named per-car commands using the existing eligibility checks. F1 pit
  decisions are recorded at execution in `src/simulation/decisionLog.ts`,
  settled on the first ranked snapshot after physical pit exit, and restored
  through the bounded checkpoint parser. Invalid optional logs are discarded
  without rejecting an otherwise valid race. Predicted pit loss is the engine
  estimate at the call; actual call-to-exit elapsed time is a separate quantity.
  Neither rejoin position nor elapsed service time is labelled net strategy gain.
  No alternative-future simulation or expanded SF pit model is implemented yet.

- `RaceScene` is lazy-loaded and uses lightweight Three.js primitives for cars, track, kerbs,
  runoff, barriers, pit lane/boxes, grid slots, corner numbers, marshal posts,
  DRS markers, and safety-car lines.
- Scene text uses canvas sprites rather than font geometry. Overview mode uses
  reduced vehicle detail for unselected cars, while kerb/runoff, grid, pit-box,
  and marshal geometry is instanced to reduce draw calls.
- The workspace is two columns: the leaderboard on the left, the circuit map
  filling the right. The sidebar holds only Data and Settings; Data toggles the
  right-hand area between the map and the source ledger.
- The leaderboard is the timing tower: position, tyre and life, gap/interval,
  last and best lap, the three measured sector times each with its own eight
  mini-sectors as a bar beneath it, completed stops, compounds used, speed and
  battery. Purple is session best, green personal best, yellow slower.
- Mini-sector states use distinct patterns as well as colors and expose an
  accessible per-sector summary. Forced-colors mode remains legible.
- The map overlays a five-column start gantry during the grid, sequential red
  light, and lights-out phases. Safety Car rolling starts suppress it.
- Active local flags thicken and relabel the affected 3D sector trace, and the
  map header carries the current flag state.
- The separate Timing, Telemetry, Track, Tyres, Messages, Drivers and Season
  destinations, the right-hand rail (race control, conditions, message log,
  fastest lap) and the `?layout=legacy` layout were all removed as duplicates of
  the leaderboard and the map. Do not reintroduce them without a reason the
  leaderboard cannot serve.
- Analysis includes tire condition, strategy outlook, manual box compound,
  push/standard/save/defend pace, lap history, championship, and track profile.
- The footer PIT WALL button opens a race-engineering overlay for the selected
  car: OVERVIEW, LAP LOG, STRATEGY, CAR SYSTEMS, WEATHER & TRACK, and RACE
  CONTROL tabs over a persistent BOX S/M/H/I/W and PUSH/STD/SAVE/DEFEND command
  bar. It closes on Escape and is mutually exclusive with Classification and
  Race analysis.
- The pit wall is available in every session and in Free Mode, not only the
  race. `pitWallSessionFor` in `src/domain/pitWall.ts` is the single place that
  decides what a session may show: practice and qualifying have no race
  distance, so the stint plan, rejoin projection, grid slot, and lap-of-total
  counter report `N/A` instead of being computed against a distance the session
  will never run. The pit-lane transit cost, the pit lane state, and the tyre
  allocation are physical facts and stay live in every session.
- The panel covers the timing tower rather than the 3D map, because the track
  picture has no substitute elsewhere on screen. That makes the tower
  unclickable while it is open, so the panel header carries its own
  previous/next car selector, which moves the app-wide selection too.
- LAP LOG lists every completed lap with its three measured splits, tyre, and
  position. The car's own fastest lap and fastest split are marked, and a
  deleted lap is struck through and can never own a personal best.
- Every pit-wall read-out carries a source chip and shows `--`, `N/A`, or
  `UNAVAILABLE` rather than a value the simulator does not hold. F1-only
  systems (hybrid Energy Store, 2026 active aero) report `N/A` outside F1.
  Electrical Overtake is labelled separately from active aero.
- `src/hooks/usePitStrategyOutlook.ts` is the single owner of the pit-loss,
  rejoin, and `strategyOutlookFor` read-out shared by race analysis and the pit
  wall. `src/domain/pitWall.ts` owns the component-condition thresholds, the
  session capability set, the lap-log derivation, and the race-control
  classification; do not re-derive any of them in a component.
- A dedicated Web Worker owns a deterministic 50ms fixed tick and publishes
  immutable snapshots at 10Hz. A main-thread fallback uses the same cadence.

## Free Mode

- Free Mode is `ApplicationMode = 'free'`, not a `SeriesId`. Championship mode
  remains the owner of points, calendar progress, OpenF1 enrichment, and
  category-specific saved configuration.
- The builder supports F1/SUPER FORMULA, the deduplicated F1 plus SF
  physical-track union, Practice/Qualifying/Race, 1-40 entrants, weather,
  distance/time, seed, manual/random/qualifying grids, all 110 pool drivers,
  repeated source vehicles, and optional equal cars.
- Driver identity and car number must be unique. Source teams may repeat; each
  entrant receives a deep-cloned synthetic team so mutable race state never
  leaks between duplicate vehicles.
- Cross-category circuits retain the selected category's tire, overtake,
  active-aero, qualifying, and machine rules. Non-native lap pace and any
  generated control zones carry `simulated`/`fallback` provenance in the Data
  view instead of pretending to be official.
- A cross-category circuit that has its own category x course baseline uses it
  and reports `freeModeProvenance.pace = 'category-reference'`. Motegi, Fuji,
  SUGO, and Autopolis carry F1 baselines of their own, so an F1 Free Mode
  session there no longer inherits the SUPER FORMULA base lap time. Validate
  with `node scripts/validate-f1-support-circuits.mjs --enforce`; the target
  windows, seed counts, and twelve measured families live in
  `docs/PACE_CALIBRATION_2026.md`.
- A practice session runs FP1, FP2, or FP3, chosen in the builder and defaulting
  to FP1 so stored version-1 configurations keep their behaviour. The sessions
  are not interchangeable: FP1 starts from an unlearned setup on heavy fuel
  (`practiceBestOffset` 2.4s against FP3's 0.35s), so a representative
  light-fuel attack belongs to FP2/FP3. At Fuji the same 20-car field reads
  1:23.4 in FP1, 1:19.0 in FP2 and 1:20.8 in FP3; a single session varies by
  around a second and a half, and the 100-seed FP3 median is 1:19.0.
- Qualifying adapts to entrant count. Standard fields preserve the familiar
  22→16→10 and 20→15→10 shapes; small fields collapse safely to fewer
  segments. A compatible completed result can seed a later Free race.
- Free sessions force `SIM`, disable HIST/LIVE and OpenF1 requests, award no
  championship points, and use a separate race checkpoint.
- Version-1 current state, presets, and checkpoint keys are
  `race-sim-free-mode-v1`, `race-sim-free-mode-presets-v1`, and
  `race-sim-free-race-checkpoint-v1`. Invalid, oversized, duplicate, stale,
  and category-mismatched payloads are rejected or safely discarded.
- The 40-car UI is internally scrollable and shows both driver code and unique
  car number. Runtime tests cover one-car timed sessions, 30/40-car sessions,
  cross-category tracks, race-control procedures, and a full-field pit wave.

## Important Files

- `src/App.tsx`: orchestration, data-source labels, timing and controls.
- `src/types.ts`: domain types.
- `src/components/FreeModeBuilder.tsx`: desktop session builder and preset UI.
- `src/freeMode/types.ts`: independent mode/configuration contracts.
- `src/freeMode/freeModeRegistry.ts`: registry union, scalable rules, and
  validated conversion into the existing `RaceConfig`.
- `src/freeMode/freeModeValidation.ts`: bounded parser and semantic validation.
- `src/freeMode/freeModePersistence.ts`: isolated state, presets, and
  checkpoint keys.
- `src/data/tracks.ts`: calendar and derived operational markers.
- `src/data/paceReferences2026.ts`: factual/estimated qualifying and
  full-event race-average pace benchmarks.
- `src/data/calendar2026.ts`, `trackAudit.ts`, `sourceRegistry.ts`: amended
  calendar, 24-pack validation, and source ledger.
- `src/data/realTrackLayouts.ts`: generated real circuit geometry.
- `src/data/measuredRoadProfiles.ts`: generated public elevation/grade and
  partial banking/width profiles for seven circuits.
- `src/data/f1Performance.csv`: canonical F1 11-team/30-driver source values.
- `src/data/motorsportSeries2026.json`: executable F1/SF category rules and SF
  field; `historicalDriverPool2026.json`: former F2/F3 pool provenance.
- `src/series/seriesRegistry.ts`: validated packages, pool, and assignments.
- `src/data/performanceCsv.ts`: strict parser, validator, and domain mapping.
- `src/data/f1PitCrewCalibration.ts`: source-backed F1 pit-crew calibration.
- `scripts/generate-real-track-layouts.mjs`: layout generator.
- `scripts/generate-measured-road-profiles.mjs`: reproducible OSM/AHN/EA/GSI
  physical-road profile generator (`npm run generate:road-profiles`).
- `src/services/openF1.ts`: OpenF1 request/bundle logic.
- `src/services/openF1Location.ts`: sample projection to track progress.
- `src/services/openF1Performance.ts`: factual field calibration inputs.
- `src/services/openF1Timeline.ts`: coherent historical playback range/target.
- `src/data/fiaEventPacks2026.ts`: FIA event document coverage ledger.
- `src/simulation/race.ts`: core state advance loop.
- `src/simulation/energySystem.ts`: physical Energy Store state and power flow.
- `src/domain/sectorTiming.ts`: measured best/personal-best classification and
  timed-lap eligibility.
- `src/workers/raceWorker.ts`: fixed-tick simulation ownership.
- `src/domain/dataMode.ts`: SIM/HIST/LIVE contract.
- `src/domain/startSignal.ts`: five-light and lights-out presentation state.
- `src/persistence.ts`: V3 save migration and nested season-garage normalization.
- `src/simulation/overtaking.ts`: mapped close-battle outcomes.
- `src/simulation/incidentTraffic.ts`: stopped-car location and queue rules.
- `src/simulation/trackRejoin.ts`: deterministic traffic-gap checks for safe
  off-track recovery.
- `src/simulation/strategy.ts`: pit and strategy rules.
- `src/simulation/weather.ts`: continuous weather/grip and forecast.
- `src/simulation/qualifying.ts`: timed-session and grid model.
- `src/simulation/weekendTires.ts`: FIA tire allocation and weekend plan.
- `src/simulation/season.ts`: classification, points, countback.
- `src/three/RaceScene.tsx`: scene and vehicle presentation.
- `src/simulation/race.test.ts`: primary simulation regressions.
- `docs/FIA_2026_REGULATION_COVERAGE.md`: article-level official coverage and
  explicit non-public-document boundaries.

## Verification Baseline

```bash
npm run lint
npm run build
npm test
npm run playtest
npm run validate:montecarlo
npm run benchmark
```

- Lint: passed
- Build: passed; the main UI and lazy Three.js scene chunks still emit the
  expected large-chunk warning
- Tests: 621 passed across 61 files. The heaviest suites
  (`retirementCalibration`, `raceStability`, `race`, `freeModeRuntime`) assert
  against per-test timeouts, so under a saturated machine they time out rather
  than fail an assertion. Re-run those files alone before treating a timeout as
  a regression
- Playtest: 1440x900 and 1280x720 PC layouts, initial gray timing cells,
  provisional purple timing, S1/S2/S3 control status, WebGL pixels, overlay
  controls, no clipping, no page overflow, plus a valid and scrollable 40-car
  Free Mode build with unique visible numbers and SIM-only data mode
- Playtest also drives the pit wall: every tab, the race-control filters, an
  applied BOX call and pace instruction read back off simulation state, Escape
  and close-button dismissal, the in-panel car selector moving the app-wide
  selection, the lap log's measured lap and sector columns, an untouched track
  map, the `N/A` race-only rows in FP1 and qualifying, the panel opening in
  Free Mode, and `N/A` F1-only systems in SF. `npm run playtest` previews
  the existing `dist`, so run `npm run build` first after any UI or CSS change
- Monte Carlo: 6 acceptance groups passed across 10,000 matched-condition
  production-model samples
- Benchmark: records the normal field and 40-car Free Mode, including renderer
  identity. The latest Chromium SwiftShader run measured about 58 fps for 22
  cars and 43 fps for 40 cars at 60x, with no page errors; use
  `BENCHMARK_STRICT=1` only with real GPU rendering.

`npm run playtest` starts an isolated preview server. It locates weekend buttons by the
`Set weekend stage to X` title prefix, so preserve that prefix.

## Honest Remaining Limits

1. Active-aero/Overtake, pit, and safety-car operational markers are derived unless a source is
   explicitly labelled authoritative.
2. OpenF1 location/telemetry availability varies by session; keep the SIM and
   unavailable states even when testing with a data-rich historical race.
3. SC/red procedures still simplify some race-director discretion and detailed
   delta enforcement.
4. FIA event packs provide a truthful document ledger. Values absent from the
   normalized supplied packs remain closed as unavailable; they must not be
   inferred from another event or circuit.
5. Public DSM/DEM road profiles are lower-confidence physical inputs, not FIA
   homologation survey data. Exact circuit friction, drainage, kerb/runoff
   geometry, and F1/SF tyre relaxation parameters remain unavailable.
6. The lazy Three.js scene is about 0.93 MB minified. It no longer blocks the
   initial UI bundle, but Three.js remains the largest download.

## Guardrails

- Preserve user changes; never reset the worktree.
- Use `apply_patch` for manual edits.
- Keep simulation state separate from render objects.
- Keep OpenF1 values nullable and source-labelled.
- Derive randomness from the seed helpers.
- Add numeric realism tests for model changes.
- Run all six verification commands before handoff.
- Read exit codes directly. Piping a verification command into `tail` or `head`
  reports the pipe's status, not the command's, and has already produced a
  false "clean" for a failing lint.

## Closure state

The straight-against-corner investigation is complete and archived in
`docs/NEXT_SESSION_PACE_CALIBRATION.md`: complete-lap marginal MGU-K allocation
reduced calibration lap MAE to 1.181 s and the one-time holdout MAE to 2.646 s
without changing a production coefficient or adding a track multiplier.

Phase 6 measured inputs are either source-backed or explicitly unavailable.
Its public-geodata follow-up now supplies seven elevation/grade profiles plus
partial Zandvoort banking/width with per-field provenance; unpublished numeric
friction and tyre-transient values remain fail-closed.
Phase 7 now consumes its causal inbox, persists bounded category experience and
the latest decision record, and retains `legacy-direct` as rollback. Local
yellow order is explicitly enforced while passable obstructions remain
exempt. No known implementation phase remains open; the numbered limits above
are source/discretion/bundle boundaries, not hidden completion claims.
# Tyre degradation and age follow-up

- F1 C1–C5 and I/W degradation now share explicit SIM stint targets. Default
  H/M/S uses C2/C3/C4 consistently with the thermal model. These rates are
  simulator policy, not published Pirelli degradation measurements.
- Representative pre-cliff pace slopes (s/lap before driver management) are
  C1 .035, C2 .050, C3 .070, C4 .095, C5 .125, I .065, W .045. Base cliff
  ages are 40/32/25/18/13/26/34 laps respectively. Physical wear reaches 70%
  at the management-adjusted cliff before track, fuel, pace and thermal loads.
- Live remaining life uses measured SIM wear plus irreversible thermal stress;
  age only estimates life if wear state is unavailable. The timing tower shows
  completed laps on the fitted set beside life, including SF set age.
- Carcass heat now contributes to overheating and permanent thermal damage
  after surface cooling. Carcass equilibrium stays closer to the surface;
  reversible overheating still cools, while wear and thermal stress persist.
- SF retains its separate control-tyre availability boundary; no F1 wear or
  thermal coefficients are applied to it.
- `tireDegradation.test.ts` covers every family, controlled stints, push/save,
  heat/cooling, wet-tyre cooling loss, allocation consistency and observed-rate
  confidence. Desktop playtest also checks age text and column clipping.

## User-authored circuit compound pace gaps

- `data/tirePaceGaps.ts` preserves the user's 24 fresh-tyre pace targets in
  seconds/lap. Medium is zero, Hard is +hardToMedium, Soft is -mediumToSoft.
  Values are user-authored SIM inputs, not Pirelli or observed race data.
- 23 entries attach to current selectable courses. Imola is retained in the
  table without creating a new track pack. Spain means Barcelona; unprovided
  Madrid keeps its prior live behaviour.
- `tireCompoundPace.ts` fits bounded dry grip coefficients to force-based,
  isolated reference laps once per immutable track object. Only F1 live tyre
  force consumes them. Wet tyres and SF remain outside this dry-pace fit.
- Live timing and gaps are never forced to these values. Slipstream, dirty
  air, Electrical Overtake, ERS, fuel, execution, weather and tyre condition
  still determine the actual trajectory and timing. The offline reference
  excludes active-aero zones and uses the unbounded capability energy policy;
  it is a tuning reference rather than a prediction for every race lap.
- Numeric acceptance covers all 23 course targets to 0.005 s on the reference
  model, live compound traction, and retained slipstream effects.

## Road grade and local-altitude force follow-up

- Live road gravity already existed, but its ±3.5% clamp flattened the sourced
  8% MADRING grade. Shared `roadEnvironment.roadGradeForceN` now retains source
  grades through ±20%, using mg sin(atan(rise/run)); invalid input stays neutral.
- Live atmosphere now reads absolute source-labelled point elevation first,
  then track altitude, then the explicit 100 m SIM fallback. Rendering Y is
  never an altitude input. Temperature still modifies density. Missing profile
  grade remains 0%; this change does not invent new elevation surveys.
- Density feeds both drag and downforce. The physical reference-lap forward
  sweep now subtracts road gravity and the backward braking sweep includes
  its signed contribution. Both use local density, so offline and live paths
  consume the same environmental inputs without adding gravity twice.
- Reference atmosphere defaults to 15 C unless an air temperature is provided;
  simplified qualifying passes simulated air temperature, while explicit
  density overrides remain available for controlled benchmarks. Peak downforce
  reporting now uses per-point density too.
- Numeric tests cover 8% uphill/downhill acceleration, density/drag/downforce
  ratios at 2200 m, source precedence, unavailable/invalid fallbacks, local
  reference inputs and continued circuit compound-pace calibration.

## 2026-10-09 all-category elevation and motion follow-up

Work from the deployed category branch, not outdated master. See
`docs/CATEGORY_MOTION_AND_ELEVATION.md` for the 58-layout elevation ledger,
MADRING official anchors, Baku exclusion, display height controls and category
road/pit/lateral interpolation. The existing WEC/GT/INDY/KYOJO category engine
owns all motion; its actual lanes and continuous pit distance now reach the
map. `scripts/course-elevation-playtest.mjs` is included in the publish gate.
# Full-suite qualifying assertion follow-up

Additional baseline0461fd4 failures reproduced in isolated baseline tests:
speedCalibration's three running-car fixtures inherited throttle0 from the grid,
so the pedal slew limit correctly returned20% at100ms and prevented deployment.
They now start with throttle100; all original force, power and pedal assertions
remain. The F1 tyre lap test compared newly fitted tyres after a compulsory
compound stop; its controlled stint now starts with the compound obligation met
and asserts zero pit stops. The SF round6 UI expectation now matches its existing
verified schedule snapshot instead of expecting unavailable data. Corrected
speed regressions3/3 and tyre/UI19/19 pass. No runtime changes in these repairs.

The dry qualifying ERS test failed identically on baseline 0461fd4: attack peak
340km/h vs preparation peak340.41km/h. Both phases can reach the physical speed
ceiling, so a strict peak-speed comparison does not establish ERS deployment.
The test now compares the minimum battery level between attack and preparation,
alongside the existing harvest/deploy, battery depletion and full run-cycle
assertions. The isolated regression and lint pass. Runtime physics is unchanged.
The normal full publish gate must be rerun after this test correction.

## Six-category integration continued, 2026-10-10

Merged the six-category elevation/motion branch with the pit-wall, tyre and road-environment work. See docs/SIX_CATEGORY_CROSS_VALIDATION.md for driver/course interchange, Nakayama 110, SF effective-grip calibration, live pace measurements and limitations. All six tyre badges show set age. Additional-category aero forces now use local elevation-derived density. Full normal publish gate is required and its result remains pending.

Post-integration checks: all six tyre badges now have readable backgrounds and set-age labels; 110-point driver slider assertions match the explicit Nakayama request. Imola imported from WEC now receives the supplied 0.3s/0.125s F1 fresh-tyre targets; all 28 compound tests pass. The tyre-force fixture starts at full throttle so the merged pedal slew limit does not mask the requested traction comparison. The integrated speed regression now measures actual ERS power/energy and charge depletion instead of an arbitrary 70% remaining-charge cutoff (Las Vegas yielded 71%); its isolated regression passes. Native desktop, additional-category race/Free Mode/Le Mans and SF OTS preflight checks pass; the remaining UI/calendar/elevation preflight and normal full publication gate still require completion.

## Nakayama ability update, 2026-10-11

User requested Yuki Nakayama 120. The canonical F1 CSV now sets all 14 authored
values to 120; shared driver pools and editor limits follow that source.
Untouched saved 105/110 profiles migrate to 120 in F1/SF and additional-category
saves, preserving custom skill edits and seat/crew metadata. Existing 120 saves
remain 120. The focused source/migration/cross-category checks passed (34 tests)
and lint passed. The normal full publish gate is required for this batch.

## F1 all-course timing follow-up, 2026-10-11

The requested scope includes all 49 selectable layouts, including Fuji,
Motegi, SUGO, Autopolis, Imola and both Monza geometries. See
`docs/F1_ALL_COURSE_TIMES.md` for provenance and reproduction. Imported Free
Mode courses use the native generator's 156 equal-distance samples. The shared
geometry stencil counts each local heading change once and separates
opposite-turn chicanes. F1 lift area is 5.6 m²; drag remains at scale 1.0 after
independent straight-speed checks rejected the larger drag.

`f1CourseCalibration.ts` supplies an explicit SIM effective-contact profile to
live driving, simplified qualifying and compound fitting. Thirty layouts use
reference targets (17 official-reference layouts, 13 estimates); 19 have no
suitable F1 reference and retain the common physical estimate. This contact fit
is not measured tyre/road friction or independent validation of the original
vehicle holdout. It never scales clocks, distance, fuel or battery accounting.
Fresh tyre targets, driver 120, traffic, weather, thermal degradation, elevation
and fuel/energy effects remain active. SF retains its own grip calibration.

Five later official Q3 observations replace estimates. Sakhir, Jeddah and Imola
use explicitly labelled 2025-based estimates; the October Bahrain-named event
at Sepang is not a Sakhir timing reference. Obsolete script writers that could
restore hidden lap-time scales have been retired. Stale stored validation was
removed rather than relabelled as current measurements.

Final actual-lap audits use calibration seed 0 plus independent seeds 1 and 2
over all 49 layouts. Their production-input fingerprint is checked by a
regression test, so later production changes require fresh measurements.
The user subsequently instructed that long-running tests are unnecessary.
The in-progress full suite was stopped at their request. Publish this batch
with `-SkipFullTestSuite -SkipPlaytest`, using the completed focused checks,
147 actual-lap runs and native desktop preflight. This is an explicit user
exception to the repository's usual unskipped completion gate, not a claim
that the full suite or all publication playtests passed.

The final 147 layout/seed runs all recorded a valid timed lap. Thirty targeted
layouts improved from 3.763 s before mean absolute error to 0.201 s for the
three-seed median (maximum 0.602 s); independent seeds 1 and 2 achieved 0.244 s
mean and 0.820 s maximum error. No coefficient was bounded. The 19 unreferenced
layouts remain estimates. These are isolated dry qualifying results, not
independent validation of fuel-heavy races. See `docs/validation/F1_COURSE_TIMES.md`.
Focused physics/tyre/speed/data/geometry checks passed 102 tests; the persisted
source-fingerprint and three-seed audit checks passed another two tests.

## Final-corner out-lap courtesy exception, 2026-10-11

At the user's request, an out-lap car stops giving way when it reaches the
existing final-corner launch zone. This clears an already active hold for
multiple attackers as well as preventing a new courtesy lift. Earlier out-lap
traffic, in laps and cooldowns retain their existing etiquette; collision and
flag decisions remain independent. FP/Q/SQ boundary and train regressions pass.
Keep using the user's shortened publication checks; do not restart long tests.

The prior 147-run timing audit now explicitly records source revision 6cc4e08.
Its test verifies that immutable Git revision's production fingerprint. It is
historical evidence, not a claim that a later runtime was fully remeasured.
Fresh reports without a recorded revision still check current production inputs.

## Passing transit traffic without following its refuge, 2026-10-11

The user's report of getting stuck behind out/in laps was reproduced in three
of 18 short FP/Q/SQ integration cases. Attackers followed the transit car's
lateral tow/wake alignment into its refuge, closing the passing corridor.
Higher-priority timed-session traffic now retains its line instead of aligning
laterally with lower-priority traffic. Physical aero effects, vehicle footprint
constraints and flag priorities remain active; race/sprint battles are unchanged.
Courtesy detection also keeps a still-behind attacker inside 0.1 s instead of
dropping it before it passes. Preserve the final-corner out-lap launch exception.
The 18-case passing reproduction now passes. Continue the user's short-check
publication exception (`-SkipFullTestSuite -SkipPlaytest`); no long tests.
Focused traffic, lap preparation, driver decision, lateral dynamics and historical
timing-audit checks passed 69 tests across six files. Lint and diff checks passed.

## Three F1 qualifying broadcast cards, 2026-10-11

The lower map area now has three live timing slots in F1 SIM Q/SQ. Direction
uses flying-lap finish ETA; displayed finishers remain for three wall-clock
seconds before switching to the next approaching car. Compare safe drivers to
the top and outside/no-time drivers to the last configured safe place. The
leader uses their prior best. References remain frozen through each displayed
attempt and final result. Sector deltas are measured, not predictions. Deleted
laps are explicitly labelled. Optional LapRecord.completedAtSeconds records
the physical timed-lap crossing for reliable finish detection.
See docs/QUALIFYING_BROADCAST_CARDS.md for source/editorial boundaries. Exact FOM
selection/duration rules were not verified; the supplied photo and user policy
define this overlay. Nine direction tests plus related checks pass 22 tests;
lint/types pass. Native browser Q2/Q3 checks exercised three live cards, final
delta, expiry and focus. Width checks at 1440/1280 had no clipped numeric text
or horizontal overflow; browser errors were empty. design-qa.md records the
joint reference/implementation visual comparison. Continue the user's short
publication exception; do not restart long audits or the full playtest suite.
The initial publication build exceeded the existing 2,500,000-byte precache
per-file limit by 581 bytes. Lazy extraction increased the main bundle because
of shared-module regrouping, so retain the direct overlay import and increase
the bounded per-file cache allowance to 2,600,000 bytes. This preserves offline
availability; keep production publication verification.

## Knockout-zone tint, 2026-10-11

F1 SIM Q1/Q2 (also SQ1/SQ2) leaderboard rows below the configured advancement
cutoff now have a translucent red background. Selected and hovered rows retain
the red tint. Other segments/session types have no knockout tint. The existing
live display position drives the range; no fixed 16/10 assumption is introduced.
Native browser Q1 verification showed exactly P17-P22 tinted at rgba(224,35,52,.18)
for the 22-car field; lint/diff checks pass. Keep the user's shortened publish.

## Earlier qualifying clearance through corner sequences, 2026-10-11

The remaining blocking report reproduced a late-yield failure at Hungaroring:
transit cars waited for a straight throughout a corner sequence. Q/Q2/SQ now
recognize priority traffic within 16 s and start moving aside through corners.
Use the local reference line and retain the refuge side while yielding, rather
than chase the trailing car's offset in a previous corner. Apply the additional
strong throttle cap only after physical lateral clearance exists. Preserve
footprint/collision constraints and the final-corner out-lap launch exception.
Out-lap spacing adds predicted lap-pace closure to the 6-9 s baseline, capped
at 20 s. No timing/position rewriting is introduced.
Short integration coverage now exercises 42 scenarios: the existing 18 straight
cases plus four corner tracks, out/in phases and three initial lateral offsets.
All reproduce physical passage of two attackers. Focused unit cases cover early
corner clearance, pace-aware spacing and the unchanged final-corner exception.
Continue publishing with -SkipFullTestSuite -SkipPlaytest; the user explicitly
does not want long tests or a repeat of the historical all-course timing audit.

## Full-field qualifying traffic losses, 2026-10-11

The user clarified that the odd results meant strong entrants dropping low,
not simply the valid Q3/Q2/Q1 classification grouping. A short dry Fuji field
reproduction found RUS at 90.995 s and NOR at 82.122 s on their first attacks:
transit refuge offsets still flipped with reservations/corner-line changes,
and cars merged out of the pits immediately ahead of flying traffic.
Persist the optional timedTrafficYieldSide until the train clears; timed refuge
intent uses the safe track edge, and an approaching priority car shares lateral
clearance on the opposite side. Existing footprint/flag/launch rules remain.
Timed pit exits wait for flying or final-corner-launch traffic within 12 s.
Six focused suites pass 97 tests, including 42 physical passing cases and a
short 22-car Fuji regression constraining the measured RUS/NOR laps below 80 s.
Intermediate diagnosis improved them to 77.100/77.064 s; those numbers describe
that working diagnosis, not a fresh all-course or complete-weekend audit.
The tower now labels each driver's attained qualifying segment so older Q1/Q2
times cannot be mistaken for Q3 ranking times. No strength-based position or
clock correction is applied. Keep the user's short publication exception.

## Live qualifying cutoff references, 2026-10-12

The user requested the displayed knockout reference follow changing Q1/Q2
positions. Active cards now resolve the reference from the latest segment
ranking every update, including a new cutoff driver, a new best by the same
driver and transitions between safe/outside positions. Use configured quotas
(standard 22-car Q1 P16 / Q2 P10); do not change advancement rules based on the
user's illustrative mention of P11. The last live reference remains fixed only
for the completed result's three-second hold, preventing self-comparison after
promotion. This supersedes the earlier full-attempt reference freeze. Preserve
short publication checks; no full suite or long simulation is needed.

## Runtime and editor ability ceiling 120, 2026-10-12

The user explicitly requested maximum 120 after finding Nakayama's live
abilities saturated at 100. This supersedes the DA-11 saturation contract.
All driver tune sliders now allow 120 and the heading reports MAX 120. The
series data manager's individual abilities, bulk edit and potential also allow
120; machine and pit-crew scales remain their separate existing ranges.
Named raw abilities and execution traits retain up to 1.2; performance blends
extend the existing slope to 1.09 without changing any 0..100 input mapping.
Energy intent outputs, style traits and physical tyre utilisation stay bounded.
Error envelopes floor at zero. Remove the separate offline aggregate recovery
so the extended abilities are not counted twice. Nakayama's authored 120 stays.
Six focused suites pass 69 tests; the final live/offline paired regression
was rerun after adding non-negative offline loss and improved execution checks.
The solo Fuji comparison measured 100 at 77.054711 s and 120 at 77.088607 s:
it proves live sensitivity, not guaranteed lap-time improvement. Thermal and
control effects can outweigh reduced errors on an individual lap. Do not claim
120 makes the car 20% faster or guarantees pole. Lint/types pass. Retain the
user-authorized -SkipFullTestSuite -SkipPlaytest publication exception.

## Individual car setup and visible 120 pace advantage, 2026-10-12

The user requested independent driver setups, then clarified that Nakayama
120 should have a realistic but dominant advantage. Setup now names the target
driver in its own section. Six engineering sliders, a course-baseline reset
and FP automatic-setup toggle affect only that driver. Manual edits persist via
optional manualSetupByDriver, survive save/load and are not replaced by FP
recommendations. Old saves default to automatic. Parc ferme blocks edits,
resets and mode changes; practice completion also preserves locked setups.

The earlier ability ceiling change still saturated physical tyre utilisation
at 100. F1 now reserves 3% of the existing force envelope at ability 100 and
reaches the full envelope at 120: 0.82 + 0.18 * clampedAbility / 1.2. It is a
SIM driver-execution policy, not observed human performance data. It changes
ordinary F1 driver utilisation too, while retaining the source/performance
mapping and all physical maximums. SF retains its previous utilisation policy.
The same utilisation feeds cornering, braking and the longitudinal force
ellipse. No hardware, lap-clock or position bonus is introduced.

Short equal-car dry solo Fuji qualifying measured 95: 77.626466 s, 100:
77.224601 s, 120: 77.088607 s (one fixed seed, first attack, identical Ferrari).
This verifies a 0.537860 s advantage over 95 in that scenario, not every circuit
or guaranteed pole. The old 147-run course audit remains historical; do not
present it as a current live-pace audit after this change. The user declined
long tests. Seven focused suites pass 74 tests, lint/types pass. Browser checks
showed NAK rear wing 3 while HAM retained 8, NAK's manual mode held on driver
switches, and Q parc ferme disabled every editing control. Screenshot:
outputs/driver-setup-ui.png. Keep shortened publication checks.

## Shared six-category live vehicle solver, 2026-10-12

The user explicitly requested the remaining four categories use F1/SF driving
calculations. Additional categories now call the actual shared longitudinal
solver for road and pit movement. Their planner uses shared load-sensitive
cornering and axle brake capacities. Remove the legacy display gearbox; live
gear/RPM and optional persisted clutch/spool come from the force calculation.
Absolute machine specifications, fuel, course grade/bank/density, tyre state
and wake feed the shared model. Keep fixed bodywork, Hypercar combined power,
gated LMH front assist, LMDh rear drive, INDYCAR hybrid/P2P and category
operations. F1/SF defaults retain their existing behavior. See
docs/SHARED_SIX_CATEGORY_VEHICLE_SOLVER.md for SIM parameter boundaries.
Old all-course timing results predate this change. Keep the user's shortened
publish exception and do not run complete weekends or endurance simulations.
Five focused suites pass 89 tests. An additional 33 short driving checks pass;
seven complete flying-lap cases were deliberately excluded. Types/lint pass.

## Coupled handling, wheel slip and driver pedals, 2026-10-12

The user authorized the physics audit improvements and specifically requested
human throttle/brake/traction control. Live paths in all six categories now own
optional persisted VehicleHandlingState: steering, yaw, body lateral velocity,
four-wheel slip/load/heat/local wear, damped roll/pitch/heave, brake temperature
and finite gearbox shifts. Intent supplies a steering target; the former extra-
category lateral position controller no longer moves the car. Existing safety
and qualifying occupancy constraints retain authority. Steering feedback must
include body slip and yaw damping: omitting them caused runaway yaw in the short
Suzuka courtesy regression and was corrected before publication.

Pedals use lateral utilisation and previous wheel slip for pickup/lift/pressure
release. Brake demand uses hardware pressure then tyre clipping; unclipped demand
feeds lock detection. Differential locking and brake bias affect wheel demand.
Engine braking does not receive regenerative credit. Shift torque interruption
affects delivered force and requested tyre torque. F1 final-speed gear/RPM remain
consistent after occupancy clipping. Tyre changes reset wheel state, and stopped
F1 pit release resets yaw/steering and first gear.

Additional categories accept optional temperature, wind and water configuration,
resolve local density/head/crosswind and retain brake temperature. Old saves omit
handling safely; new state and all environment fields are validated. Telemetry
optionally adds drive/brake slip, lateral G and steering, with 512 bins/lap,
three laps and legacy t1/new t2 compact history. A full-field maximum-history
checkpoint still passes the 5 MiB quota check.

Read docs/COUPLED_VEHICLE_HANDLING.md before extending this model. It is explicitly
reduced-order: slip demand relaxation, not independent wheel angular inertia;
bounded suspension/aero responses, not measured multibody geometry or CFD maps.
Global compound thermal/wear grip remains authoritative, with bounded local
corrections. No closed thermodynamic budget, supplier curves or measured road
roughness is claimed. Offline planning is not the full live transient model.
Historical all-course timing audits are invalid as current pace evidence. Keep
the user's no-long-tests exception: shortened publish, no full weekends,
endurance, all-course recalibration or complete flying-lap test collection.

Final focused checks: seven suites/86 tests, 12 selected FP2/Suzuka courtesy
cases and 33 short additional-category driving cases pass (131 total). The
remaining courtesy variants and seven complete flying-lap cases were excluded.

## Ability 120 reflected in all six categories, 2026-10-12

The user requested Nakayama's 120 apply across every category. SF still used a
tyre-utilisation function saturating at 100; replace it with the shared
driverTyreEnvelopeUtilisation used by F1. Additional categories now apply the
same utilisation to live grip/force capacity and planning, rather than only a
square-root target-speed factor. Remove that separate ability speed factor to
avoid double counting. Ability 100 uses 0.97 of the physical tyre envelope;
120 reaches 1.0. Hardware maxima stay unchanged. This is a SIM execution policy
and also affects ordinary SF/additional-category drivers; historical course
pace audits still do not establish current lap-time accuracy.

Canonical Nakayama pool axes and additional-category free selection retain 120.
Existing untouched 105/110 save migration remains; manually edited ratings are
preserved. Four short focused suites pass 63 tests, including 19 cross-category
force-routing/pool/save checks. No long or complete-lap tests were run.

## Mixed-class start separation, 2026-10-12

The user requested each lower class's first car start 500 m behind the last car
of the preceding class. startingGridPositions groups WEC as Hypercar/LMP2/LMGT3
and SUPER GT as GT500/GT300, preserving configured order within each class and
9 m per-car spacing. Missing classes add no empty group. Each class resets its
two-column pole side. Positions are actual signed road distances, not a visual
offset or timing bonus. Configuration and car identity order remain unchanged.
Formation completion/skip retain those positions; spacing can evolve after green.
Single-class grids retain their spacing, and FP/qualifying still use pit release.
This is user-requested SIM policy, not an assertion of official start regulations.
Existing in-progress saves preserve their positions; reset/new race uses the new
grid. Three focused suites pass 47 tests plus one short formation regression.
Types/lint pass. Keep the shortened publication and no-long-tests exception.

## Yuki Nakayama display name and NAK code, 2026-10-13

User superseded `yukinakayama` with `Yuki Nakayama`, timing code `NAK`.
The stable identity remains `yuki_nakayama`; all ability axes remain 120.
Canonical names/codes apply to factory/pool profiles, saved driver settings,
new F1/SF snapshots and recovered checkpoints. The additional-category timing
adapter explicitly resolves NAK by identity. Historical result snapshots retain
their stored names. Original authored import evidence remains unchanged.
Focused name/profile and compatible-checkpoint checks pass (16 tests).
A broader raceSession run exposed existing optional engineeringPlan undefined
property equality differences and a 5.79 MB checkpoint against its 4 MB test
limit; that unrelated long storage test was not repeated. Keep shortened publish.
Team-principal UI work is unfinished and preserved separately in
`../team-principal-wip.patch`; it is not part of this display-name release.

## Detailed execution, difficulty and shared measured gaps, 2026-10-13

User requested stronger exit/tow skill differences, granular race abilities,
category machine demands with large deficits for inadequate skill, and common
F1/SF timing UI for all categories. See docs/DRIVER_EXECUTION_AND_DIFFICULTY.md.
The existing 30 skills now have common independent editors in all six category
settings, and a readout in Engineer. Extra categories optionally persist a
complete detailed skills object; manual edits survive review migration and
old saves still derive their profile from the pool. Existing ratings, normal
100 ceiling and Yuki Nakayama's 120 ceiling are unchanged.

Shared pedals consume separate throttle and braking precision. Traction pickup
and correction now express skill; tow skill changes physical alignment and
pull-out timing without changing drag coefficients. SIM machine thresholds
conservatively reduce used grip and pickup rate when required control axes are
insufficient. This is intentionally a substantial live pace penalty; old course
timing audits are not evidence of current accuracy.

F1/SF measured mini-sector gaps are extracted to a shared domain helper. Extra
tower and classification no longer divide distance by current speed. Missing
measurements or old-order checkpoints after a pass show -- until a common valid
crossing is available. Class leader/ahead references, previous-lap timing,
lap deficits, timed-session best laps and final penalties remain distinct.
Instantaneous physical gaps used for driving remain independent of UI timing.

56 focused checks and six-category browser slider/independent-edit checks pass;
lint/types/build pass. No long/full-session tests. Keep shortened publish with
-SkipFullTestSuite -SkipPlaytest. The separate unfinished team-principal patch
remains outside this batch.

## Committed straights, finite wheel battles and updated FIA markers, 2026-10-13

User requested aggressive skill-dependent straight passing, ERS use and stronger
commitment during active Overtake, without endless side-by-side running; then
requested real course detection/Straight Mode locations. Read
`docs/COMMITTED_OVERTAKING_AND_FIA_MARKERS.md`. Shared decisions now establish
passing clearance earlier for capable/boosted attacks, release tow when a rival
brakes and hold defensive lanes once overlap exists. Both runtime families use
persisted, validated physical-overlap memory; a six-second unresolved contest
ends with a controlled lane-preserving lift by the disadvantaged driver until
clear. F1 live attack requests actual ERS within the existing physical ledger
and gates. No hardware power, distance or position bonus was added.

FIA PDFs for Zandvoort/Monza/Madrid/Baku/Singapore were downloaded, rendered and
visually checked; marker counts, offsets and low-grip restrictions are now in
the operations table. 16 of 24 existing F1 courses use official event markers;
eight and the Japanese F1 Free Mode circuits still use labelled SIM estimates.
Do not claim every circuit is official or projected entry/exit/endpoints exact.
Monaco still has no Straight Mode but has Overtake detection. Projection fixes
ordered corner branches at Baku and separated coincident Hungary markers.
Endpoints remain explicitly derived; five new maps use the mapped next braking
corner as the end of the run. Baku/Singapore sector tables use 2026 sources.

Preserve shortened publishing (-SkipFullTestSuite -SkipPlaytest) and no long
sessions. The team-principal WIP remains separate and must not be reapplied here.

Validation: 79 focused tests passed (74 shared/data/runtime checks and five selected existing track-system regressions); lint, production build and the enforced short active-aero audit passed. No full-lap, full-weekend or endurance checks were run.


## Wet F1 rolling-start ERS and SF standing starts, 2026-10-13

User confirmed Australia in rain: low-grip ERS was intentionally failed closed
because FIA-F1-DOC-111 event curves were unavailable, leaving positive ERS at
zero after rolling release. Official data remains unavailable. Live telemetry
now uses an explicitly SIM-only half-normal (or specified-sector) envelope,
maximum 175 kW, with existing pedals/traction/energy/thermal/standing gates.
Low Grip Overtake remains disabled. Pit-wall Deployment tooltip labels this
fallback. Do not claim this numeric envelope is an official FIA wet curve.
User also explicitly requested no SF Safety Car starts: automatic wet SC
formation is now F1-only; SF rain uses grid/lights. Mid-race SC and manually
chosen Free Mode rolling starts are retained. Existing sessions need restarting
to change their already-chosen formation procedure. No persistence schema change.
Keep shortened publish and no long tests.

Validation: 87 focused checks passed, including 24 short dry rolling releases, the Australian wet F1 release, wet SF grid procedure, standing MGU-K gates, regulations and aero/overtaking regression checks. Lint, production build and diff checks pass. No long/full-session tests.


## Restore missing SF races in existing saved calendars, 2026-10-13

Registry distances were already restored on 2026-10-08, but browser-stored
series configuration retains its older full calendar. Missing event raceDistance
operations overwrote the registry, and App filtered Race out. Parsing now fills
only undefined distances from the exact current active event with matching ID,
round and venue. Explicit custom/unavailable distances, moved/cancelled events,
teams, drivers, rules and weekend stages are preserved. No data reset needed;
reload applies the migration, which persists normally and is idempotent.
Unknown/cancelled event operations remain unavailable. Keep shortened publish.

Validation: 31 focused configuration/registry tests pass, including legacy
calendar migration, override protection, cancelled/moved events and reload
idempotence. Short built-browser regression confirms legacy localStorage reload
restores Race and correct first/final lap counts; all 12 stored distances and
edited team survive with no JS errors. Build/lint/diff checks pass. No race laps
or full sessions run. Re-run with node scripts/sf-saved-calendar-playtest.mjs.


## All-course Straight Mode lengths and Free Mode recovery, 2026-10-13

Read docs/STRAIGHT_MODE_LENGTH_REVIEW.md. All 49 selectable physical course IDs
now appear in the enforced audit and its Markdown distance table. All 16 FIA
maps were rechecked visually. Every nonempty official zone has its next mapped
corner; remove reliance on the old 8%-lap endpoint fallback. Anchor metre
offsets now follow arc length; estimated start/end precision is six decimals.
Expansion Free Mode uses shared geometry screening instead of sector+10%-lap
zones; Monaco unavailable status is preserved. No safe estimated run returns
unavailable. Do not describe derived bend-entry endpoints as official braking
coordinates or estimates on rough/oval layouts as verified F1 operations.

Free Mode race/sprint recharge adds 0.5 MJ only for Overtake at lap start;
verified event inputs retain precedence. Legacy stricter 8.5 MJ Free Mode ledger
is accepted for its current lap. No retroactive energy credit or power boost.
130 focused tests, all-course audit, lint/build/diff pass. No long tests. Preserve
shortened publish -SkipFullTestSuite -SkipPlaytest and separate principal WIP.
