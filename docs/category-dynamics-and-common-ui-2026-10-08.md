# Category driving physics and shared UI — 2026-10-08

## Common screen contract

The existing F1 design remains the reference. F1, SF and the four expansion
championships share SetupPanelHeader, FreeModeHeader and FreeModeSearch React
components and the same setup field, Free Mode table, toolbar and preset styles.
The additional categories retain genuinely different data: crews and classes,
up to 100 cars, energy/fuel parameters and endurance distance controls.
Crew editors expand on demand without increasing the normal entry row height.

Expansion FREE now supports bulk vehicle insertion, seeded driver/vehicle
shuffle, class-preserving equal cars, clear/reset, and preset rename/copy/delete.
Championship and FREE persistence remain independent. Rating inputs are not
recomputed or rebased. The six-category UI playtest compares computed header,
field and row styles against F1 at 1440x900 and 1280x720, exercises crew and bulk
insertion, and checks that the start footer remains inside the viewport.

## Physical corrections

Applies to KYOJO, GT500, GT300, Hypercar, LMGT3, LMP2 and INDYCAR. Native F1/SF
already have their separate detailed dynamics, energy, tyre and drivetrain
models; their physical coefficients are not overwritten by these corrections.

- Recompute the anticipatory braking/corner speed envelope for current fuel
  mass, fitted compound, temperature, wear, weather and aerodynamic wake.
  Bounded conservative envelope bins avoid recalculating all 512 stations on
  every worker tick. Integration uses the actual unquantized state.
- Use a shared lateral/longitudinal tyre force budget. Turning consumes grip
  that is unavailable for simultaneous braking or acceleration. Aerodynamic
  load and banking feed the same force law and the braking preview.
- Tow reduces drag; close following also reduces downforce. Lateral separation
  and distance attenuate both. Wake coefficients remain explicit SIM estimates,
  not claimed wind-tunnel data or a universal measured loss percentage.
- Bound positive wheel force by the target speed, available wheel power and
  driven-axle traction. Coasting drag is not reported as a brake command.
- Shift through a fixed simulated ratio ladder with hysteresis. Gear and RPM
  no longer depend on the speed limit of the current corner.
- Debit electrical energy for the commanded electrical contribution; recover
  from mechanical brake demand, not from aerodynamic coasting. Hypercar hybrid
  output stays inside its combined power cap. INDYCAR P2P requires green running,
  acceleration demand, remaining time and a road/street configuration.
- Brake toward pit-entry speed in advance and accelerate progressively after
  pit service. The existing no-pass pit queue and service order are retained.

## Primary references and precision limits

- [INDYCAR car configurations](https://www.indycar.com/Fan-Info/INDYCAR-101/Cars)
  documents road/street, short-oval and speedway aero configurations.
- [INDYCAR glossary](https://www.indycar.com/Fan-Info/INDYCAR-101/Glossary)
  describes slipstream, drag and downforce.
- [INDYCAR 2026 P2P update](https://www.indycar.com/news/2026/05/05-05-p2p)
  describes approximately 60hp and restart availability. Exact alternate-start
  lines and per-event activation/allocation limits remain unavailable in this
  engine; the present event-wide 200s allocation is still a SIM initial value.
- [INDYCAR 2026 hybrid strategy](https://www.indycar.com/news/2026/05/05-15-buzz)
  distinguishes electrical deployment from turbo P2P. Per-lap official deploy
  allowances and driver-selectable charging on ovals remain unimplemented.
- [WEC Hypercar powertrain](https://www.fiawec.com/en/news/peugeot-sport-and-total-reveal-technical-details-of-new-hypercar/6942)
  explains combined engine/electrical control. Manufacturer reference outputs
  are not a substitute for each event's current BoP table.
- [Pirelli on combined steering/braking](https://press.pirelli.com/the-malaysian-grand-prix-from-a-tyre-point-of-view/)
  describes the shared tyre demands. The present temperature curves and gear
  ratios remain SIM estimates, not supplier maps or telemetry measurements.

These changes correct physical mechanisms; they do not establish measured lap
or corner-speed accuracy for every car and venue. A four-lap, full-fuel solo SIM
probe is saved with the verification artifacts. It is not equivalent to an
observed qualifying lap. As a reference, the official 2026 St Petersburg pole
was 60.5426s, while the current default full-fuel solo race probe is about 79s.
This discrepancy remains uncalibrated and must not be presented as a validated
reproduction. Manufacturer BoP, tyre maps, racing-line geometry, track grip,
elevation and some operational inputs still need event-level calibration.

Official comparison: [2026 St Petersburg qualifying](https://www.indycar.com/news/2026/02/02-28-nics-quals-stpete).
The SIM label remains visible. At the user’s request, the source/assumption
button and lengthy explanation table have been removed from the setup UI.
Provenance remains in internal data, exported configurations and this audit.


## Pedal controller correction

Both native F1/SF and expansion physics now consume stateful pedal commands.
Throttle pickup is limited to 200 percent/second, release to 1200; brake
application to 650 for carbon-brake classes or 450 otherwise, release to 260.
These rates are SIM parameters, not measured driver-specific pedal traces.
Red flags and immobilized cars retain an immediate stop override.

Expansion driving replaces one-tick speed-error correction with envelope-slope
feedforward and a 0.55 s response. Requested throttle respects the driven-axle
combined-grip budget, rather than reporting full pedal while silently clipping
all the drive force. Brake percentage uses fixed hardware capacity sized at a
SIM 85 m/s reference, so falling aerodynamic load does not by itself increase
the displayed pressure. The same pedal commands drive force and telemetry;
hybrid deployment and recovery continue to use delivered mechanical power.
Native corner throttle now depends on lateral grip utilisation instead of an
arbitrary 34 percent minimum. Existing native machine coefficients remain.

Verification includes a complete flying lap for each of seven expansion
classes, progressive throttle and brake release assertions, and 12 raw 10 Hz
lap traces (Fuji, Okayama, Imola, Le Mans, St Petersburg, Indianapolis and native F1/SF Suzuka).
Trace data and plots are captured from actual simulation ticks without a
visual smoothing filter. These establish controller behaviour, not agreement
with measured driver telemetry. Remaining geometry artefacts and event-level
pace calibration must still be distinguished from real measured reproduction.
