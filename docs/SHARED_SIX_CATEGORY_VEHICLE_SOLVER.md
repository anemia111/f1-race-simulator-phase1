# Shared vehicle solver across six categories

2026-10-12 user request: move KYOJO CUP, SUPER GT, FIA WEC and INDYCAR
to the same physical driving calculation as F1 and SUPER FORMULA.

The additional four categories now call `integrateVehicleLongitudinalStep`
from `src/simulation/vehicleDynamics.ts` for on-track and pit-lane movement.
This is the same live force solver used by F1/SF telemetry. The former
constant-power Euler integration and separate display-only gearbox are removed
from their live path. Gear, RPM, clutch and spool come from the force result.
Clutch/spool states persist; legacy saves can omit them.

`motorsport/sharedVehiclePhysics.ts` maps each machine's absolute power, vehicle
mass plus occupant/ballast, fuel, gear count, CdA, lift area and tyre friction
into a cached physical profile. A neutral rating adapter prevents F1 team
ratings from modifying these specifications. Absolute CdA bypasses the old
F1/SF rating-based drag clamp. The existing F1/SF profiles retain their previous
drag and active-aero behavior. Additional classes have fixed bodywork.

The speed planner now uses the shared load-sensitive tyre cornering solve and
axle brake capacities, including fuel, tyre state, wake, bank and air density.
The integrator evaluates torque/RPM, launch clutch, load transfer, the combined
tyre-force ellipse, aerodynamic drag/downforce, rolling resistance and road
grade. Pedal demand uses the same gearbox force instead of constant `P/v` at
launch. This matters on uphill pit exits: the previous pedal calculation could
under-command throttle enough to stall the new torque-based model.

Category operations remain in `motorsport/race.ts`: multi-class traffic,
refueling, crew changes, pit service, flags, tyre compound rules, measured
crossings and endurance accounting. Hypercar hybrid output replaces ICE power
inside the combined cap; INDYCAR hybrid adds power, and road/street P2P remains
separate combustion boost. LMH front assist is allowed only for profiles with
the existing front-deployment speed gate. LMDh remains rear drive. Recovery is
bounded by the shared solver's integrated brake work and the category's store
and recovery limits. No F1 energy allocation or movable wings are enabled for
these four categories.

Unpublished wheelbase/track/CG, tyre load sensitivity, gear spread/design speed,
brake ceilings and bounded aero sensitivities are SIM priors, explicitly
documented in the adapter. Existing machine evidence labels are retained.
KYOJO and LMP2 bypass turbo spool lag; other power units retain the shared
response approximation pending individual engine maps. Shared physics does
not establish official lap-time accuracy or merge all category sporting logic.

Validation deliberately uses short solver, actual session-routing, launch,
pit-merge, traffic, energy and save-state checks. The user declined long tests;
no complete endurance race, weekend, all-course pace calibration or browser
playtest is claimed. Historical cross-category timing audits predate this
solver migration and are not current pace validation.
