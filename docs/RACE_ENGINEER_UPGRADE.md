# Race Engineer upgrade

The shared SIM dashboard has an **Engineer** view in all six categories. It
connects driver pedal preferences, FP setup experiments, watch moments and
pit strategy. The user excluded the proposed lap collection feature; this
batch adds no archive, replay, additional trace retention or collection UI.

## Driver execution

Explicit braking aggression, corner-shape and rear-stability preferences take
priority. Imported neutral profiles receive stable SIM entry, rotation and
exit preferences in [0.2, 0.8], hashed from person ID and a versioned axis key.
The same person retains these preferences across categories and sessions.
These are labelled SIM preferences, **not measured real-driver styles**.
Authored ratings and the 120 ceiling are unchanged. Tyre preservation and
correction precision still come from the existing skill axes.

Preferences change live pedal commands before integration, not recorded clocks:

- Braking preview/timing varies by up to 0.035 seconds.
- Brake release rate varies with rotation preference, bounded to 0.75–1.25
  of the existing release rate.
- Throttle pickup varies with exit preference and becomes gentler as worn
  tyres meet preservation preference; bounded to 0.65–1.2 of the base rate.
- High lateral load can reduce the exit driver's target throttle by a small,
  bounded amount. Existing combined traction, slip feedback, gear interruption,
  collision controls and immediate safety braking remain authoritative.

All six use these commands in their existing shared force solver. No rating,
engine power, tyre capacity or lap time is rewritten to create personality.

## FP experiments and setups

Select a driver in Engineer and pause to change setup. F1/SF expose their six
existing setup controls with parc-ferme locks. Extra categories persist setup
on the active crew member; other crew members/entries are unchanged. KYOJO
offers brake bias and differential; GT/WEC/INDYCAR also offer rear wing. Rear
wing adjusts the extra-category machine's base drag/lift by SIM factors of
2%/2.5% per step relative to the default wing, with adjusted coefficients
explicitly relabelled simulation. Neutral aero setup fields prevent counting
the wing twice in the shared solver. KYOJO does not gain an adjustable wing.

Capture **変更前を測定**, change setup, observe a fresh full lap, then capture
**変更後を測定**. Only aggregate metrics are retained in the mounted workspace:
top speed, high-speed corner mean (lateral G > 1 and speed > 150 km/h), mean
drive slip, distance-weighted full-throttle/braking fractions, fuel and tyre
life. Driver/session changes reset the comparison. Closing this workspace
does not create a persistent experiment archive.

Measurement requires a full spatial record beginning after the workspace's
setup/condition epoch. A changed setup, weather or more than 0.02 grip drift
starts a new epoch. A recorded racing/practice timing result must also match:
F1/SF use actual valid non-pit attack-lap crossing windows, extra categories
use valid non-pit lap numbers for the active driver. Cooling, invalid and pit
laps are excluded. Legacy F1/SF laps without crossing timestamps cannot be
used as new FP measurements. Partial traces and gaps stay missing.

Before/after requires different laps and different setups. Differences in
weather, grip, mean fuel > 3 kg, tyre life > 5 percentage points or missing
fuel/tyre data are disclosed. Traffic/line effects are always disclosed; these
observations do not establish a causal setup improvement. Continuous grip
drift may postpone a usable comparison.

## Watch moments

The view ranks up to six current opportunities, using actual recent data:

- Same-class gaps below 6 s, with median-three-lap closure > 0.15 s/lap and
  estimated contact within four laps.
- Close same-class cars with at least 15 percentage points tyre-life contrast.
- Faster cars approaching another class within 90 s, using wrapped physical
  road separation and measured pace difference > 2 s/lap.
- A latest-lap personal best, or > 2 s loss against the quicker prior two laps.

Closure/traffic predictions are race-only, conditional on pace continuing.
Timing loss does not invent a cause. **マップで追う** selects the car and opens
the map; **2台の走りを比較** selects both cars in Telemetry Lab.

## Strategy forecasts, instructions and evidence

Race scenarios compare the next stop opportunity with extending three or five
laps. Rival progress is projected from the median of the latest three valid
non-pit lap times; absent pace uses a labelled 90 s assumption. Position and
traffic are within the same class. The estimate assumes rivals continue and
does not simulate their subsequent pit stops.

Cost is a short horizon (at most eight remaining laps) estimate: pit loss,
2 s if a rival is within 2 s of the projected rejoin, 1.2 s warm-up allowance,
and a SIM tyre penalty `max(0, .75-life)*2 + max(0, .35-life)^2*24` per lap.
Observed tyre-life slope supplies wear where available; otherwise 2.5 percentage
points/lap is an explicit prior. These policy constants do not alter live
physics. Reported seconds compare allowed scenarios against the cheapest.

Uncertainty is a **heuristic**, not a statistical confidence interval: 2 s
with three pace laps, otherwise 5 s, plus 0.9 s per extended lap and 3 s during
neutralisation. The UI converts it to a range of same-class rejoin positions.
SC/VSC/FCY use a SIM 0.65 pit-loss factor. Future flags/weather are held fixed.
Fuel permits extension only with an additional 0.8-lap reserve; elapsed fuel
is not returned merely by changing a stop plan. Mandatory category work can
disable extension. Actual work/traffic can exceed the displayed heuristic.

F1 estimates use the existing transit-loss model plus 3 s service allowance;
the existing AI retains condition/compound/penalty/mandatory-stop logic. A
manual extension holds off opportunistic undercut/overcut/traffic/SC stops,
while safety and mandatory stops can override it. Available sets supply a
manual replacement compound, and no unavailable set is fabricated.

SF stops use **only control tyres**, the operational SF pit speed and an
explicit SIM path estimate from entry/exit fractions plus 7 s service. The
operational rule must be enabled. There is no refuelling or F1 compound/ERS
injection. A SIM tyre-life safety threshold below 28% can request a stop.
Inventory is consumed once at actual release. No official SF service time
or event stop mandate is claimed.

Extra-category forecasts use the existing physical pit path/speed and pitWork,
including required crew work when already due. Instructions request tyres
and full-target fuel where supported, with existing automatic safety/crew/
energy/compound requirements taking precedence. Existing KYOJO championship
routine-stop restriction remains; Free Mode permits user stops. The extra
AI evaluates measured tyre economics once per car/lap and boxes only if the
now estimate beats both extensions by more than its uncertainty. Existing
hard constraints still act immediately.

Plans travel through both workers and their fallback paths, retain bounded
validated fields in existing saves and support cancellation. Status becomes
in-pit on actual pit motion; the first ranked physical release records actual
class position once. Later position changes do not rewrite that outcome.
Existing F1 decision logs and extra-category BOX reasons are exposed in the
view. An earlier safety/rule override is recorded in the plan reason.

## Validation and practical limits

- 51 focused tests across seven suites cover forecasts/constraints, missing
  FP data/eligible timing, style/pedals, cross-category identity, setup/save
  bounds, actual F1/SF crossing-to-pit and SF single-set release, extra AI and
  mandatory crew precedence, both worker command paths, and existing short
  operational/shared-physics/telemetry behavior.
- Short isolated synthetic UI checks cover watch/compare, BOX/cancel and
  before/setup/after measurement. Actual paused-app checks open Engineer/FP
  in all six categories and verify independent F1 and GT setup edits. Screenshots
  were inspected; no browser page errors occurred in successful checks.
- TypeScript, lint and production build are required for publication. No full
  race, full weekend, endurance, sustained FPS or all-course pace verification
  is claimed. The user's no-long-tests exception uses publication flags
  `-SkipFullTestSuite -SkipPlaytest`.
- Existing three-lap/1,536-point retention, GT/WEC delta worker messages,
  background saves and bounded tick batches remain. New plans cause additional
  class ranking only while a plan is active; AI economics is evaluated at most
  once per lap. No trace archive or extra simulation loop is added.
