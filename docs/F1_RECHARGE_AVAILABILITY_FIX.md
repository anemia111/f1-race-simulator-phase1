# F1 ERS recharge availability — 2026-10-13

User reported no charging and supplied `9`, interpreted as9% SOC; exact track,
weather and session remain unspecified. Reproduced ordinary non-Free-Mode
qualifying/Sprint Qualifying with9% SOC, braking demand and zero recovery.

Cause: race runtime enabled its SIM recharge fallback only in Free Mode.
Without event PU input, timed sessions and race laps beginning with Overtake
received an unavailable recharge rule. The physical integrator correctly refused
all recovery under that unavailable rule. This was a runtime policy problem,
not a reason to bypass the physical integrator or assign battery percentages.

Added a shared simulationRechargeRuleFor policy for runtime and checkpoints.
Free Mode retains its existing policy; a known strict technical/event rule stays
unchanged. With no supplied event input and an otherwise unavailable context,
ordinary SIM gets the existing bounded model fallback under `sim-session-default`:
8.5MJ per lap,9.0MJ when Overtake was latched at the race/sprint lap start.
These defaults for absent event data are explicitly SIM, not a verified event
bulletin. Supplied event input still owns its contexts; unknown, ambiguous or
mismatched supplied inputs receive no fallback. The strict official resolver and
the physical generator, heat, SOC and lap recharge limits are unchanged.

Checkpoint validation accepts the exact old unavailable definition only where
the no-event SIM fallback now applies, then repairs its rule. Running snapshots
also receive that repair through telemetry on their next force step. Preserve
stored energy/SOC, temperatures, existing recharge usage, discharge and losses;
the repair itself credits no energy and does not start a fresh lap.

117 selected checks pass across five suites, excluding the independently failing
populated multi-lap checkpoint-size case. Seven short braking fixtures verify
positive recovery from9% in FP1/2/3, Q, SQ, race and sprint; additional cases cover
old checkpoint restore and live telemetry repair, retained lap usage, supplied
event boundaries and Overtake lap-start availability. Existing energy balance,
brake-work limits, rule and checkpoint corruption checks pass.

The separate populated checkpoint-size check reports5,685,360 UTF-16 bytes versus
a4,000,000-byte assertion, identically with the original pre-fix race.ts restored
for that test and with this fix. Current source was restored in finally. This is
a pre-existing storage-size regression, not fixed or hidden by this batch.
No endurance or full-suite run. Keep shortened publishing flags.
