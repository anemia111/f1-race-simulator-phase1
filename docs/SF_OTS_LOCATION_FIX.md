# SF OTS location and continuous use - 2026-10-13

## Race-budget spending policy

User requested using roughly the whole 200 s allocation each race. Previously,
an isolated standard-pace car had no use intent until the final lap. The actual
race now passes its finish target into telemetry and the SF decision predicate.
Remaining physical distance / target defines the planned remaining allocation;
nominal track lap time estimates time to finish. Scheduled solo uses group the
budget into 8-25 s bursts derived from race duration and circuit cooldown, with
separate start/hold thresholds to avoid brief on/off cycles. Existing tactical
uses can spend earlier; the schedule catches any subsequent underspend.
When estimated time to finish is below remaining use + cooldown +15 s, the driver
keeps using rather than risking a late cooldown. It starts on useful throttle,
continues through bends, and respects existing physical and regulatory gates.
Explicit save pace does not add scheduled solo use. The finish target follows
an early checkered flag. No new persistent state or checkpoint migration.

29 focused checks in five suites pass. Fast arithmetic decision-clock fixtures
at all five SF tracks include a neutralised interval, repeated cooldown checks,
several separate uses and zero remaining allocation at finish. An actual short
telemetry tick verifies scheduled solo use reaches the live OTS budget. These
are not complete physics races. Rain, neutralisation, insufficient remaining
race time or fuel saving can still leave unused OTS; the policy never overrides
those conditions or invents consumed time.

## Screenshot specification integration

User requested applying the supplied 200-second/track-cooldown/~50 PS screenshot.
Rechecked the manufacturer page below: 200 s per race, Suzuka/Autopolis 100 s,
SUGO 110 s, Fuji/Motegi 120 s are explicitly published. These values were already
in the runtime and remain; allocation and boost now have named shared constants.
The 37 kW (~50 PS) boost remains a SIM estimate, not a measured manufacturer value.

Race fuel accounting now also debits extra combustion fuel when OTS is consumed:
actual consumed OTS seconds * current ordinary kg/lap / nominal lap seconds *
boost kW / ordinary combustion kW * throttle fraction. This assumes equal engine
efficiency and uses the existing averaged fuel model; it is a SIM estimate, not
an official fuel-flow figure. Partial budget exhaustion consumes only the actual
remaining duration; no use, cooldown or closed throttle adds no boost fuel.
The existing ordinary distance-based burn still applies. This adds no battery
or charge mechanism to SF, and does not alter F1 fuel accounting.

Pit Wall Overview and Systems now show remaining /200 s, remaining cooldown plus
the circuit's configured interval, and the combustion power increase (~50 PS).
22 focused checks in four suites pass, including an actual race tick which
exhausts the final 0.04 s budget and verifies additional fuel consumption.
No long tests. Publication uses the standing shortened flags.

User clarified that OTS can be used anywhere on the circuit within its available
allocation. Manufacturer reference rechecked:
https://toyotagazooracing.com/jp/superformula/cars/2026/
The page states a 200-second race budget and event cooldowns of 100/110/120 s.
The existing geography-independent runtime budget/cooldown remains unchanged.

The SIM driver request previously required straightness >=0.72, throttle >=88%
and brake <=3%. Entering a curve or lifting therefore released OTS, starting a
long cooldown. The straightness requirement is removed. A tactical request may
start at throttle >=55% with brake <=3%, allowing acceleration out of bends.
This lower pedal threshold is a SIM driver choice, not an official activation
rule. The straightness input is retained only for call compatibility.

An already-active use remains requested through cornering, lifting or braking
while the tactical reason remains (attack/defence, close gap, push or final lap).
It still spends time while held even if the throttle delivers little or no useful
extra power. Physical engine/traction/pedal limits decide the actual acceleration.
The decision may release when its tactical reason ends; no forced permanent use.
Race-control, low-grip, pit and session gates are unchanged. This does not add
OTS to qualifying/practice or transfer any F1 detection-zone requirement to SF.

24 focused OTS intent, category ownership, runtime availability and operational
checks pass. Live telemetry starts OTS on a curved section and retains it through
braking, debiting 0.1 s each step without a false cooldown. Exhausted budget and
cooldown still prevent activation. Lint/types/build/diff pass. No full laps,
races or long tests. Preserve shortened publishing.
