# SF OTS location and continuous use - 2026-10-13

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
