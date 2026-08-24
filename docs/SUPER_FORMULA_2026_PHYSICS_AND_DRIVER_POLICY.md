# SUPER FORMULA 2026 physics and driver policy

## Purpose and status

This document records the source-bound SUPER FORMULA behaviour implemented in
Phase 5.  It is an implementation-policy document, not a replacement for a
championship regulation, an event supplementary regulation, or an official
notice.  Where a value belongs to an individual event and no provenance-bearing
event document is loaded, the simulator leaves it unavailable rather than
estimating it from F1, a track profile, a prior season, or an explanatory
article.

## Binding base-rule provenance

The operational base rules are pinned to the JAF **2026 SUPER FORMULA Unified
Regulations**, source id `jaf-sf-2026-unified-regulations`:

- Published: 2026-01-23; effective from: 2026-01-01.
- URL: <https://motorsports.jaf.or.jp/-/media/1/3375/3379/3400/3462/3466/3492/2026_touitsu_kisoku_superformula_20260101.pdf>
- SHA-256: `9e5eb324f2f4c8660d9b716cbf35a1874247fc6baa8706ae2b2539630ae2369a`.

The runtime attaches this provenance to the applicable base-rule values.  A
later event special regulation or official notice can supply an event operation
only when it is identified, dated, URL-backed, and checksum-backed.  It does
not silently replace the base rule merely because it is newer or convenient.

## Vehicle and runtime boundary

The SUPER FORMULA branch is a single-make SF23 category implementation: the
runtime uses the `dallara-sf23-2026` vehicle package with an SF23 fixed-aero
scope and a 405 kW combustion-power baseline.  It is not a team-specific
hardware model and it does not turn SF into an F1-compatible vehicle.

In particular, the SUPER FORMULA runtime has no F1 ERS or state-of-charge,
MGU-K deployment, active aero, Pirelli compound family, F1 component pool, or
F1 tyre-temperature/wear coefficient state.  Its supported state is limited to
the sourced engine ledger, Yokohama control-tyre inventory and fitted
dry/wet state, OTS policy, refuelling safety/task status, and an explicitly
unavailable gearbox-allocation/wear model.

`405 kW` is the category physics baseline used by the simulator; it is not a
claim that all otherwise-derived aerodynamic or tyre-force coefficients are
published official values.  Those derived physics values must not be presented
as rulebook parameters.

## Control tyres

JAF Article 23.2 provides a maximum of **six dry sets per car per race** and
Article 23.4 provides a maximum of **six wet sets per car per race**.  The
runtime represents these as Yokohama one-specification dry and wet control
tyres and keeps source-bound set accounting.

This is deliberately not an F1 `H/M/S/I/W` allocation.  The published input
used here does not provide a dry or wet sub-compound split, a Yokohama grip,
wear, thermal, or other physical coefficient set.  Those physical inputs are
therefore represented as unavailable: the simulator may show the fitted
surface and laps on that set, but must not manufacture a control-tyre
coefficient model.

## OTS

Article 24.3.8 delegates the exact OTS operation to an event special regulation
or official notice.  The JAF base package consequently supplies no executable
activation condition, allocation, boost power, or cooldown.

A 2026 Yokohama explanatory reference mentions a 200-second OTS allocation.
Phase 5 retains that only as explanatory context; it is not a binding
event-specific parameter and is never promoted to a simulator default.  In
particular, the runtime must not infer 200 seconds, a boost-power value, a
cooldown, or activation conditions from that reference.

An executable OTS path requires one complete, provenance-bearing event pack
from an event special regulation or official notice containing all of the
following:

- activation conditions;
- allocation seconds;
- boost power in kW; and
- cooldown seconds.

Even a complete accepted pack begins inactive until the race runtime has an
event-condition evaluation for it.  Missing, malformed, incomplete, or
unprovenanced input leaves OTS unavailable and inactive.

Phase 7.6 extracts the unchanged simulator-side driver-use predicate into
`driverOtsIntent.ts` and routes it through the category-agent switch only after
the existing downstream OTS availability gate passes. The predicate uses the
same final brake/throttle, straightness, gap, battle-phase, pace-mode, and
final-lap compatibility inputs. Its thresholds are not official JAF or event
activation conditions. Event-pack provenance, runtime eligibility,
preparation/session, Race Control, flag, running status, effective status, and
sourced boost power remain downstream authorities. Because the event-condition
evaluator is still unavailable, this slice does not make OTS executable or add
an allocation, cooldown, boost, budget, or distinct attack/defend policy.

## Pit lane and engine ledger

- **Pit lane:** Article 26.9 supplies a verified **60 km/h** limit.  The SF
  runtime enforces that sourced value rather than an F1 or track fallback.
- **Engines:** Article 24.2.3 permits a maximum of **two declared engines per
  entrant per season**.  The SF ledger tracks that entrant-season allocation;
  it is not an F1 component-pool substitute.

## Penalty points

Article 5 is modelled as a separate, driver-specific SUPER FORMULA ledger,
not as an alias of the FIA/F1 penalty-point field.  A point entry is valid for
the continuous **12 months** following its assessment.  The sourced
next-event suspension thresholds are **6 points** initially, **4 points**
after the first served suspension, and **2 points** after subsequent served
suspensions.

Assessing a threshold creates a pending next-event suspension but does not
erase points.  Only an explicit record that the suspension was served and
lifted clears the entries relevant to that suspension.  Newer entries and
chronological history remain intact, which makes the escalation auditable and
deterministic.

## Refuelling

Article 25 establishes the circumstances and safeguards under which refuelling
may be permitted.  The runtime requires the available Article 25 safety
evidence before it can release a numerical refuelling task.  That evidence
covers the installed/protected cowl, the designated working area, inspected and
secured equipment, dedicated fire safety coverage, and the required
post-refuelling leak check.

The base rule does **not** supply a universal service duration, fuel-transfer
rate, or fuel-mass change.  All three must come together from a verified event
special regulation or official notice; no one value is derived from the other
two.  Without both the safety evidence and a complete provenance-bearing event
pack, a refuelling task is unavailable and cannot alter fuel state.

## Event-only race operations

The base SUPER FORMULA package contains no generic category or track default
for race distance or mandatory pit stops.

- A championship race can start only with a verified event race-distance
  operation.  The runtime rejects an SF race with no exact event distance
  rather than falling through to an F1-derived lap heuristic.
- A mandatory-pit-stop rule remains unavailable unless a verified event
  operation explicitly supplies it.  The F1 mandatory-stop and multiple-dry-
  compound rules are never applied to SF.
- Free Mode is separate: its lap count is a clearly labelled user choice, not
  evidence of a championship event rule.

## Official rules versus simulator policy

| Kind | Current treatment |
| --- | --- |
| Binding JAF base rule | Article 23 dry/wet set maxima, Article 24.2.3 engine allowance, Article 25 safety conditions, Article 26.9 pit-lane speed, and Article 24.3.8's delegation of OTS operation are source-pinned. |
| Event official input | OTS values and conditions, numerical refuelling task inputs, race distance, and mandatory-pit-stop requirements require a complete event special regulation or official notice with provenance. |
| Simulator policy | Fail closed when required event input is absent; preserve the strict SF/F1 runtime boundary; label unavailable state rather than filling it with historical, F1, or track-derived assumptions. |
| Free Mode policy | A user may choose race laps for an independent session.  This is deliberately not carried into the championship-rule surface. |

## Explicit non-goals and missing inputs

This implementation does not claim or attempt to provide:

- a generic 2026 SF OTS allocation, boost, cooldown, or event-rule eligibility/
  activation predicate;
- a numeric refuelling duration, rate, or fuel gain without an event document;
- a generic SF race distance or mandatory pit stop;
- Yokohama control-tyre physical coefficients, sub-compounds, or a Pirelli-like
  compound strategy model;
- an SF gearbox allocation or wear rule; or
- a team-specific SF23 hardware, full official vehicle specification, or a
  substitute performance-calibration source.

Until those inputs are present with suitable official provenance, unavailable
is the intended and safe simulator result.
