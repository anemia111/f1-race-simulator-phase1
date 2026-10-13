# Albert Park pit loss correction - 2026-10-13

User identified F1 Albert Park. A short deterministic dry tyre-stop reproduction
compares a pitting car with an identical no-stop control to the same downstream
course point. The pre-fix observed loss was 16.5 s in this fixture; the pit-box
animation alone lasted 8.25 s despite a normal service of roughly 3.5 s.

Two problems were confirmed:
- pitLaneMotionAt allocated a fixed 48% of every pit visit to stationary service,
  so the visual crew work grew with the lane time.
- A running car retained pitPhase=exit for four seconds after release. The driver
  context treated every non-none phase as a new pit-entry instruction, restricting
  throttle to about 55% and steering toward the pits after already rejoining.

F1 race pit motion now derives its stationary interval from total scheduled time
minus the existing lane allowance. This retains service variance, repairs,
penalties and holds. The remaining motion is divided around the selected garage.
Timed-session and SF motion timing retain the existing model; no SF pit-speed,
service-duration or transit calibration change is made here. A running exit car
no longer receives a pit-entry driving instruction solely for its visual phase;
a car still inside the lane retains that instruction. The shared context fix
also naturally applies to running SF exit cars. Manual entry requests still work.

The existing total pit timer, lane speed limits, penalty durations, release safety,
energy gates and track geometry are unchanged. This corrects presentation and
unwanted post-release control, not the circuit's underlying physical pit survey.
The retained F1 lane positions remain model geometry, not exact surveyed routes.

Validation: 18 focused pit-lane, operational and pit-release energy checks pass.
The same short Albert Park stop now displays 3.5 s of box service; measured loss
is 14.5 s because exit acceleration is no longer unnecessarily restricted. These
numbers are a SIM component reproduction, not a claimed official race pit loss.
No full races/weekends or endurance tests. Lint, types/build and diff checks pass.
Reproduce: node scripts/validate-albert-pit-loss.mjs
Evidence: artifacts/albert-pit-loss-validation.json
