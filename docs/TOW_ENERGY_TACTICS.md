# Tow energy tactics - 2026-10-13

F1 race/sprint drivers can now bank Energy Store charge in an aligned slipstream,
then attack on a usable straight and continue deployment against the passed rival.
This is a deterministic SIM driver policy, not a claim about real driver software.
No new regulatory eligibility, power, energy, speed or position bonus is supplied.

The plan is optional on CarSnapshot and stores the target driver, save/attack/escape
phase, start times and target SOC. Checkpoint validation checks identity, category,
finite bounded values and timestamps. Older checkpoints without a plan still load.
No F1 energy ledger or subsystem is added to SF or other categories.

Save starts only with measurable physical tow drag reduction and sufficient
strategic ability (ERS management, awareness, racecraft and overtaking). While the
aligned tow keeps pace, positive deployment is capped; the car still accelerates
through the common force integrator. A speed deficit above 4 km/h or losing the
actual tow releases the cap. Normal braking recovery remains physical; this policy
does not manufacture charge or force full-throttle generator drag. The plan can
remain through intervening corners while deployment follows normal controls.

Attack considers own SOC, observed relative speed, remaining straight and the next
mapped detection line. SOC targets differ by ability. A simplified SIM prediction
prefers creating a 1.15-second escape before detection; it can defer a pass that
would fall just before detection without that margin. An 18-second waiting escape
allows a feasible pass even when the ideal timing is unavailable. Clear overlap,
a large closing speed, a braking rival, a close rear threat and the final lap all
cancel voluntary waiting. Entry/exit thresholds retain the burst across small SOC
changes rather than alternate saving/attacking every physics tick.

The passed opponent remains the target even if another car is now ahead. Escape
requests positive deployment on suitable straight sections until physical distance
corresponds to 1.15 seconds, low SOC, or ten seconds in the escape phase. This is
an instantaneous driving estimate, independent of the tower's measured timing.
The physical result and actual detection-line eligibility remain authoritative:
there is no guaranteed one-second gap or removal of the rival's already-latched
Overtake permission. Race control, rain/low-grip, pits, yielding, start restrictions,
traction, superclipping, battery, thermal and regulatory limits retain precedence.

Validation: 126 focused tactic, wheel-battle, energy-intent, physical-energy and
active-aero checks pass; two focused F1/SF runtime boundary checks pass. Tests cover
short live race ticks, determinism, actual energy saved/deployed and energy balance,
post-pass continuation, detection timing, fall-back recovery of pace and checkpoint
compatibility. Lint/types/production build/diff checks pass. No long/full-lap tests.
