# Driver execution, detailed skills and machine difficulty

All six live categories share `advancePedals`, driver decisions and the
machine-difficulty policy. Higher skill changes control execution and physical
positioning; it does not add engine power or increase wake coefficients.

## Individual skills

The existing 30-axis `DriverSkillProfile` is now individually editable through
the shared `DriverSkillEditor` in F1/SF Driver tune and the four additional
categories' settings. The engineer view shows the same breakdown. Group sliders
remain a quick way to change a whole group. A single-axis edit preserves all
other axes. Ordinary maximum is 100; Yuki Nakayama alone retains maximum 120.
Initial detailed values remain SIM expansions of the reviewed 12 source axes,
not 30 independently measured real-world assessments.

Additional-category saves optionally store a complete detailed skills object.
Old saves continue deriving skills from the existing pool. Manually edited
profiles survive review migration and are validated for complete, finite,
identity-bounded values. The live additional-category planner reads edited pace
and tyre axes; behavior, pedal execution and difficulty read the detailed profile.
Edits are made while paused, preserve race state, and apply to matching crew
identities within that configuration. They do not rewrite the global catalogue.

Throttle pickup now consumes throttle/traction precision rather than general
pace/tyre-envelope skill. At high lateral load, a lower-skilled driver leaves
more unused torque and opens the throttle more slowly. Higher skill detects
wheelspin earlier and lifts more strongly. Brake release uses a separate braking
precision input. Straight-line demand can still reach full throttle at every
skill; the force solver retains torque, tyre and collision limits.

Tow positioning uses traffic management, racecraft, awareness and precision.
Higher-skilled drivers align more closely and hold the wake until a smaller
perceived gap before pulling out. An already-offset car, close approach, defence,
flags, pit, emergency or yielding instruction retains its existing priority.
F1/SF observation cycles also refresh as the perceived tow gap crosses 0.2-second
bands, so the preparation decision does not wait for the next spatial window.

## Machine difficulty

These are user-requested SIM thresholds, not official qualifications or measured
category lap-time penalties:

| Machine | Level | Required control skill |
|---|---:|---:|
| F1 | 6 | 88 |
| SUPER FORMULA | 5 | 80 |
| INDYCAR | 5 | 82 |
| WEC Hypercar | 5 | 80 |
| SUPER GT GT500 | 5 | 78 |
| WEC LMP2 | 4 | 74 |
| SUPER GT GT300 / WEC LMGT3 | 3 | 64 |
| KYOJO CUP | 1 | 52 |

Demand is evaluated separately against braking, traction, throttle, precision,
car adaptation and awareness. High unrelated pace cannot erase a weak control
axis. Weighted shortfall grows quadratically to a 25-point deficit. At its cap,
the driver uses 68% of the previous grip envelope and 55% of the throttle pickup
rate. This intentionally creates substantial losses when ability is far below
the machine demand. Meeting all demands adds no penalty. Driver ratings,
physical engine power and tyre specifications remain the same across categories.

The policy applies to live practice, qualifying and race driving, including
sprint sessions using that solver. It is a reduced-order conservative execution
model, not measured novice adaptation, fatigue or a full learning progression.
Existing all-course audits do not validate lap times after these changes. No
full lap/weekend/endurance recalibration was run.

## Shared measured timing

F1/SF's mini-sector passage reconstruction is extracted to
`domain/measuredTimingGap.ts`. Additional categories adapt their measured timing
state to that same function. The tower GAP/INT and additional-category
classification share `motorsportTimingGap` and the common timing formatter.
No displayed race gap is computed from current speed. Unmeasured data displays
`--`; the preceding lap remains available across the timing line. When a pass
reverses the order at the last common checkpoint, wait for a new checkpoint
instead of taking the absolute value of a negative old-order gap.

Mixed-class tower references remain class leader / preceding car in the same
class. Classification can explicitly use the overall leader. Full lap deficits,
timed-session best-lap differences and final crossing times plus penalties have
separate handling. F1/SF instantaneous distance/speed estimates remain available
to physical following and battle logic; they are not timing display values.

Verification: 56 focused checks pass, including short live handling ticks in all
six categories, measured gaps at zero speed and across the line, independent
pedals/tow decisions, old rating behavior and new detailed-save validation.
Browser checks at 1440×900 confirm 30 independent controls in all six categories.
No full suite, long driving test or full desktop playtest was run.
