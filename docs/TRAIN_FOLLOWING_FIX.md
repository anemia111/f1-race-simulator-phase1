# Train following correction - 2026-10-13

The shared native F1/SF following controller previously treated a preferred
0.35-second headway as a braking threshold. At 300 km/h, 30 m centre spacing
and equal front/rear speed it requested 9.132 m/s2 deceleration and zero throttle.
Each car independently opened its gap, producing a severe braking wave.

Following now depends on closing speed, actual clear body distance and observed
front-car braking. Equal-speed trains outside a small physical clearance buffer
receive no brake or throttle intervention. Real closure requires removing the
relative kinetic speed before the remaining gap is consumed. A front car's
observed pedal demand is converted using the category brake capacity; its
remaining stopping travel is included when calculating the rear stopping demand.
An already stationary car has no remaining stopping travel. The final lateral
and longitudinal occupancy guards remain intact, as do lane-clear passing and
standing-launch exceptions. Thresholds are SIM assumptions, not official data.
No new ERS changes or power/gap bonuses are part of this fix.

Validation: 35 focused following, operational, tow-energy and geometric-traffic
checks pass. They cover matched speed at 60-350 km/h and 15-45 m spacing, real
closure, lead-car braking, low body clearance, passing lanes, stopping behind a
stationary car and a five-second abrupt-braking reproduction without overlap.

Reproduce the short eight-car force comparison with:
node scripts/validate-train-following.mjs

All eight three-second scenarios pass. The historical 30 m train baseline on
source 6e7fd56 was leader 307.27 and last 246.44 km/h. With following corrected,
the last car reaches 311.77 km/h without ERS saving and 305.78 with a forced save
request; neither case contains service-brake samples above 5%. Control runs with
following disabled agree. These are fixed-lane component experiments, not full
race forecasts: tactical plan selection and final occupancy are excluded to
isolate the control. Actual front-car brake coupling is checked separately.
See artifacts/train-following-validation.json for all inputs and outputs.

Lint, TypeScript, production build and diff checks pass. Publishing preserves
the user's shortened-test exception; no full race/weekend or endurance run is
required. Source work remains separate from the team-principal WIP patch.
