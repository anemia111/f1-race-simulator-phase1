# Stateful vehicle handling and driver pedals

The live F1, SUPER FORMULA, KYOJO CUP, SUPER GT, FIA WEC and INDYCAR paths use
the shared longitudinal solver plus `vehicleHandling.ts`. This is a reduced-order
SIM model with bounded parameters, not a measured tyre map or a full multibody
vehicle model. Category-specific machine specifications and sporting operations
remain in their existing adapters.

## Control and forces

- Driver intent supplies a lateral target. Steering, yaw rate, heading error,
  body lateral velocity and offset evolve through front/rear tyre forces.
  Body slip and yaw error feed countersteering; steering has a finite rate.
  Existing track-edge, collision and qualifying clearance constraints remain
  the safety authority. The vehicle cannot teleport through an occupied lane.
- Driver pedals retain their previous position. Throttle pickup slows with
  lateral utilisation; excess driven-wheel slip produces a lift. Brake slip
  produces pressure release. This models driver correction, not an electronic
  TC/ABS system. There is no claim of measured individual reaction latency.
- Hydraulic demand is derived from brake hardware capacity and pressure, then
  constrained by tyre capacity. Unmet demand remains visible to the slip model.
  Brake bias changes the front/rear demand. Engine braking dissipates energy
  separately from service braking and earns no regenerative energy credit.
- Four wheels retain normal load, longitudinal slip, slip angle, surface/core
  temperature, slip work and local wear. Load transfer, load sensitivity and
  the remaining longitudinal/lateral friction ellipse affect their response.
  Differential locking changes the distribution of driven-wheel demand.
- Roll, pitch and heave follow damped responses to acceleration/downforce.
  Pitch, heading and excessive heave feed bounded aero corrections. Explicit
  gear and pending shift state create a finite torque interruption; live RPM
  follows the actual gear. Safety-constrained F1 travel reconciles RPM with
  final speed.

The handling integrator subdivides into at most 0.01-second steps. The surrounding
F1/SF and additional-category schedulers keep their existing tick sizes. Handling
feedback is applied on the next outer tick, so this is not a fully simultaneous
four-wheel force/torque solve. Longitudinal slip is a force-demand equilibrium
with relaxation, rather than wheel angular velocity integrated from rotational
inertia. The global compound/wear/thermal model still owns base tyre grip; local
slip, temperature spread and wear add bounded corrections. Slip heat is an
engineering approximation, not a closed thermodynamic energy budget.

## Environment and persistence

Additional-category configuration can carry finite air/track temperatures, wind
speed/direction and surface water. Local altitude and air temperature determine
density; wind is resolved into headwind and crosswind at each station. Existing
dry/wet defaults apply to older configurations. F1/SF use their live temperatures,
water model and deterministic simulated wind. Neither wind defaults nor
unavailable road roughness are described as measured observations.

Handling state is optional in old saves and initialized on the next live tick.
New saves validate and retain all four wheels, gearbox and chassis state. A tyre
change resets only wheel slip/heat/wear; a stationary F1/SF pit release also
resets the stopped car's steering/yaw and selects first gear. Additional-category
pit motion advances through the same solver.

## Telemetry

The existing speed, throttle, brake and gear comparison now offers a checkbox
for driven-wheel slip, braking slip, lateral G and steering angle. Values come
from live simulation state. Up to 512 spatial bins per lap and three laps
(1536 samples) are retained. Compact `t2` records preserve optional channels;
legacy `t1` records still load. Missing old channels stay blank. The maximum
F1 field/history checkpoint remains below the tested 5 MiB browser quota.

## Validation boundaries

Short tests cover live state/persistence in all six categories, steering response
and disturbance recovery, constant-condition substep consistency, lock demand
and brake bias, slip heat/wet cooling, pedal correction, shift torque interruption,
pit merge and integrated hybrid braking energy. Selected straight and Suzuka
qualifying courtesy cases exercise successive attackers. Short additional-category
driving checks exclude complete flying laps.

The user declined long tests. No current full-weekend, endurance, all-course lap
calibration or full browser playtest is claimed. Earlier lap-time calibration
results predate this model and must not be presented as current accuracy evidence.
Measured supplier tyre curves, independent wheel inertia, full suspension/linkage
geometry, measured roughness and aero maps remain future fidelity work. Reusing
one live solver does not imply that offline pace planning uses every transient
state or that all categories have identical tyres and vehicle parameters.
