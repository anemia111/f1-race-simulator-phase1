# Overtaking and category wake response

The user asked for realistic passing in categories without F1 ERS. Passing
still requires physical speed, actual tyre forces and lateral body clearance.
This change adds no ERS, invented boost or automatic completed pass.

## Observed opportunities

The extra four championships previously needed a positive instantaneous speed
difference or a greater public power/mass ratio to start an attack. A follower
already regulated down to a same-hardware leader's speed could remain trapped,
even with newer tyres or observed braking/poor corner exit by the leader.

`motorsport/overtaking.ts` accepts actual closure, an existing attempt, lapping,
or the driver's own free speed envelope exceeding the opponent's observed speed
by 1.5 m/s with one of: public best-lap advantage >0.25 s, tyre-set age advantage
>4 laps, public power/mass advantage, observed brake >5%, or throttle <60%.
No perfect rival future envelope or hidden fuel/grip is queried. New attempts
require a bounded 15–90 m window (1.8 s of current speed). Equal cars accelerating
together with no observable advantage do not automatically start a move. Flags,
team instructions, blue flags, combined tyre budgets and traffic geometry still
take precedence. Recognizing an opportunity never guarantees its completion.

## Aerodynamic priors

Extra categories previously shared drag sensitivity 0.063 and downforce
sensitivity 0.9. The shared wake function now accepts an explicit drag cap;
native F1/SF calls retain their existing default 0.07 cap and machine sensitivity.
Extra classes use the following bounded **SIM estimates**, not measured maps:

| Class | Peak drag-coefficient reduction | Downforce sensitivity |
|---|---:|---:|
| KYOJO | 14% | 0.30 |
| GT500 | 10% | 1.25 |
| GT300 | 14% | 0.70 |
| Hypercar | 9% | 1.30 |
| LMGT3 | 14% | 0.70 |
| LMP2 | 10% | 1.35 |
| INDYCAR road/street | 9% | 1.40 |
| INDYCAR oval | 14% | 1.40 |

Peak drag values only apply near an aligned car on a straight, at sufficient
speed. Exposure ramps from zero at 8 m/s to full at 30 m/s; aerodynamic force
also retains its physical air-density and relative-speed-squared dependence.
The shared model attenuates drag benefit with lateral offset/time gap and removes
it on tight turns. Downforce loss also depends on gap/alignment/curvature and
retains the existing 0.88 floor. Leaving the wake trades draft for clear air.
None of these percentages is a speed bonus, manufacturer measurement or a claim
of calibrated real lap/sector times. Per-car wake maps and full banked-oval wake
physics remain unmeasured. Current mixed-class wake response follows the trailing
car's class; no measured source-body wake geometry is inferred.

## Sporting sources and boundaries

- [SUPER GT official 2025 fun book](https://supergt.net/wp-content/uploads/2025/06/SUPER-GT-FUNBOOK-2025_en.pdf)
  describes mixed-class overtaking and acceleration/braking effects of weight.
  It supplies qualitative context, not the above aerodynamic coefficients.
- [Toyota's 2026 SF vehicle explanation](https://toyotagazooracing.com/jp/superformula/cars/2026/)
  distinguishes SF23 wake reduction and engine fuel-flow OTS (200 s total) from
  electric ERS. Existing native SF operations remain separate and unchanged.
- [INDYCAR car explanation](https://www.indycar.com/Fan-Info/INDYCAR-101/Cars)
  describes push-to-pass on road/street circuits; existing hybrid/P2P gates remain
  hardware-owned. Neither assistance is made a prerequisite for an attack.
- [FIA WEC regulations](https://www.fiawec.com/en/page/regulations/18)
  distinguish Hypercar/LMGT3 and BoP. Hybrid Hypercar retains its combined-power
  limit; this change adds no F1-like overtaking allocation to WEC.

## Short checks

99 focused tests across seven suites pass: opportunity observations, no equal-car
automatic move, all seven classes' actual drag force and coasting response at
zero combustion/electric power, off-wake/far/stationary cases, category/oval
response, actual four-championship same-hardware attack decisions with all boost
disabled, traffic/flags, class spacing, pit merge, shared solver and six-category
abrupt-stop regressions. An additional 27 selected wake/driver/tyre/brake/gear
checks pass across three suites (complete-flying-lap cases excluded). TypeScript
and lint pass. No long race or full playtest is required by the user.
