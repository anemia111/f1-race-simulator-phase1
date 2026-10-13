# Category tyre degradation and real lap timing

## Scope and evidence

The previous expansion model depleted every class using the same 80–260 km
distance denominator and linear 18% grip loss. SF recorded set laps but never
changed force capacity. F1 already had thermal/wear force physics, but its
live wear integration explicitly passed no observed calibration even when
fuel-corrected clean-stint slopes were available.

The user requested tyre degradation and its actual lap-time effect in every
category, authorising a separate SF SIM model. No screen layout was changed.
Supplier input remains unavailable where unpublished. Numerical profiles
below are simulator parameters, not claimed tyre-company measurements.

Primary constraints checked on 2026-10-08:

- Michelin's 2026 Le Mans report describes double/triple/quadruple stints,
  including over 600 km on a set. This constrains endurance longevity; it
  does not establish the entire pace-loss curve for every WEC circuit.
  https://news.motorsport.michelin.com/en/articles/victory-and-more-records-for-michelin-at-le-mans
- Goodyear's 2026 Le Mans notes identify Medium for LMGT3 and LMP2, a broad
  operating window, and possible four-stint/600 km usage. These classes do
  not inherit an F1 soft/medium/hard degradation curve.
  https://news.goodyear.eu/goodyear-racing-notes--wec-24-hours-of-le-mans/
- INDYCAR's 2026 competition update explicitly identifies higher drop-off
  on alternates. Primary/alternate are differentiated on road/street courses;
  oval tyres have a separate profile, without inventing an alternate option.
  https://www.indycar.com/news/2026/02/02-23-competition-update-2026
- SF's 2026 Suzuka report distinguishes cold-tyre performance, degradation,
  and overheating rain tyres on a drying course.
  https://superformula.net/sf3/race/24422/
- GT's official 2026 race reports include four/two/no-tyre-change strategies.
  Their feasibility must not be eliminated by borrowing F1 tyre life.
  https://supergt.net/wp-content/uploads/2026/04/31_rd1_Okayama_rep.pdf
- Pirelli's 2026 Suzuka preview explains surface changes and degradation;
  F1 retains circuit nominations and the existing clean, fuel-corrected
  OpenF1 stint calibration. No raw race-lap slope is called pure tyre loss.
  https://press.pirelli.com/the-suzuka-challenge-with-the-hardest-trio-in-the-range/

## Model and limits

`raceTyres.ts` separately tracks physical distance, equivalent tyre work,
life, surface/core temperatures, irreversible heat damage and recoverable
graining. Distance/work, tyre load, mass, driver management, pace mode,
temperature and dry use of rain tyres influence wear. Cold/overheated tyres
lose grip transiently; cooling does not repair worn rubber or heat damage.
New physical sets reset this state; refuelling/driver changes alone do not.

Reference equivalent distance to zero life: SF 290 km, KYOJO 220 km, GT500
350 km, GT300 480 km, Hypercar 1050 km, LMGT3/LMP2 1000 km, INDY road/street
240 km, oval 380 km. INDY alternate is 0.62 times the road/street life with
3% fresh grip and steeper late wear; wet life is 0.85 times reference.
These are bounded SIM starting parameters. The endurance values are chosen
to admit the documented long stints; none is a guaranteed stint length.
Work and temperature conditions move the actual attainable distance.
GT supplier-specific and event BoP/compound maps remain unavailable.

Grip loss affects the shared longitudinal/cornering force budget and brake
planning. Actual line-crossing lap times emerge from the driven trajectory;
there is no cosmetic fixed seconds-per-lap addition or double charging of
the same wear in the timer. F1 now also consumes its existing observed
degradation calibration in live wear, subject to the existing clean-stint
and fuel-isolation filters and sample threshold.
Expansion speed planning interpolates adjacent cached grip envelopes. The
old 5% rounding could abruptly lower the planned speed for an infinitesimal
change in tyre condition, overwhelming the intended degradation curve.

The existing source-bound SF `physicalModel` describes unpublished supplier
data and stays unavailable. `simulatedPerformance` is independent and
persisted/validated. Older saves without the optional state remain readable.
Legacy SF lap-count saves receive a SIM distance-based wear estimate rather
than a fresh set. Expansion saves retain their previous life/temperature when adopting the
new state. They never reset worn tyres merely on a reload.

This does not identify confidential tyre friction/temperature/pressure maps,
per-wheel wear, or exact seconds of tyre-only loss from unlabelled public
laps. Tests isolate fuel, traffic and driver to verify that a used tyre
actually costs time, and distinguish that from observed-data accuracy.
