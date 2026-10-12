# Telemetry Lab

The shared comparison component is available in all six categories through the
broadcast telemetry panel and race analysis. It uses recorded SIM state only.

## Explore a lap

- Select comparison car or the selected driver's own other lap. A and B have
  independent selectors, with current, preceding, explicit and latest fully
  observed lap choices. Self comparison defaults to one lap before A, rather
  than silently comparing the same lap.
- The circuit uses cumulative centerline distance. Click the map to inspect a
  location; its colors identify the higher recorded speed there, not lap-time
  superiority. Gray means one/both observations are unavailable.
- Graphs share a distance cursor, click-to-pin behavior, an accessible range
  slider and corner zoom/reset controls. Arrow keys operate the slider.
- Actual timestamp differences are aligned at the first common observed
  distance. Negative A-minus-B means A took less time from that origin. This is
  a relative observed-interval delta, not an official finish-line lap delta.
  Interpolation is limited to adjacent observations separated by at most 3%
  of course distance. Missing samples are never extrapolated across pit gaps.
- Distance-weighted summaries show recorded maximum speed and full throttle,
  braking and coasting portions. Thresholds are throttle >=95%, brake >=5%,
  and both pedals <5% for coasting. Only observed distance is the denominator.
- Corner tables report sampled entry/minimum/exit speed within +/-2.5% of the
  model corner position, the first observed brake >=5% in that window and the
  first throttle >=95% after the corner position. These are sampled locations,
  not precision brake-onset measurements. Windows do not wrap end-to-start.
- CSV exports both chosen traces and all recorded channels. Missing values
  remain empty and text names are quoted and spreadsheet-formula escaped.

## Channels and storage

Four tabs expose up to 24 numeric channels: speed, throttle, brake, gear, RPM;
drive/brake slip, absolute lateral G, signed longitudinal G, front-wheel steer,
yaw rate, roll, pitch; four wheel surface temperatures, average wheel core
temperature, remaining tyre life and brake temperature; fuel, energy-store
percentage, electric deployment and recovery. Wheel values come from the
existing reduced-order handling model; they are not measured supplier data.
Tyre life comes from the category's authoritative global tyre model.

Hybrid channels are recorded only for actual modeled hybrid hardware. SF has
no fabricated ERS values. Old/unavailable channels display a dash and acquire
data on subsequent driving. This update changes instrumentation, not forces.

Recording remains at 512 spatial bins/lap with a maximum of 1,536 samples per
car (two preceding laps plus the recorded lap). Optional numeric channels are
rounded to two decimals at recording. Existing t1/t2 histories are readable;
t3 holds additional channels and histories over 8 KiB use level-1 zlib t3z
compression when smaller. Expansion is bounded to 512 KiB per imported
history. Encoding preserves declared recorder precision and requires no
reduction in sample count. fflate 0.8.3 is now a direct dependency (already in
the dependency tree before this change). Complete save formats remain
backward-readable by the updated application; older application versions
cannot read t3/t3z histories.

The GT/WEC incremental worker protocol and 0.1 s physics steps remain in use.
Rendered chart paths are memoized separately from pointer movement. History
stays bounded rather than recording a full endurance race in browser memory.
Storage capacity still depends on browser quota and the complete save size;
the synthetic compression test does not guarantee every possible save fits.

## Verification

41 focused tests across seven suites cover analysis, actual one-tick recording
in all six categories, compact save round trips, maximum-history compression,
legacy t1/t2 compatibility, bounded bad imports, worker delta reconstruction,
vehicle handling and short large-field compute checks. The tests do not
simulate full laps or full races.

A short isolated browser fixture at 1280x900 verified tabs, cursor pinning,
map click, keyboard distance selection, independent/self lap comparison,
corner zoom/reset and CSV download without page errors or horizontal document
overflow. Two screenshots were visually inspected. This uses synthetic display
data, not lap accuracy/FPS evidence and not a full application playtest.
TypeScript, lint and the production build are checked at publication. The
user's standing no-long-tests instruction excludes full-suite/endurance and
full browser playtest runs (`-SkipFullTestSuite -SkipPlaytest`).
