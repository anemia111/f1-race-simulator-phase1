# BOX intent and qualifying-to-race pit calibration - 2026-10-13

Pending manual BOX requests formerly selected pit-entry driving anywhere on the
lap, including its early straights. That reduced pedal aggression and changed
lateral target immediately. The request now stays a strategic queue until actual
pit motion; only an existing physical pit phase requests pit-entry driving.
The request still executes at the existing pit decision point. This does not
change the simplified native pit entry geometry or introduce a new braking map.

The OpenF1 hook retained the previous stage's data while loading a new stage,
including on the immediate qualifying-to-race transition. Calibration calculated
pit lane transit from all sessions, and accepted missing stationary time as zero.
A qualifying garage dwell could therefore become a race pit duration. Changes:
- hide stale stage/year data synchronously and clear uncached transition data;
  retain same-session background refresh data;
- estimate pit transit only from Race-type sessions (including Sprint), requiring
  finite known stop duration and plausible lane-minus-stop time;
- reject nonfinite, nonpositive and garage-length cached transit at the runtime
  loss resolver, reverting to the circuit's checked-in observations;
- repair existing F1 race pit deadlines when their nonqueue duration exceeds
  180 s, using the normal deterministic crew/lane rule and penalties served in
  the current visit. Explicit pit-exit queue time is preserved. Timed-session
  garage waiting is not repaired as if it were a race stop.

The 5-90 s transit and 180 s corrupted-stop screens are broad SIM data-quality
bounds, not published FIA rules. No real qualifying dataset from the user's
browser was inspected; the failure path is established by code and synthetic
stage/dwell examples. Existing penalties, lane speed limits and inventories stay.

26 focused checks pass, including identical short F1/SF running snapshots with
BOX on/off, stage cache isolation, missing-stop and garage-dwell rejection, race
pit calibration fallback and repair of a saved 900 s wait while retaining a
900 s exit queue. The short Albert tyre-stop comparison still executes the
pending manual request and passes (roughly 14.75 s downstream loss, fixture only).
Lint, types/build and diff checks pass. No full races/weekends or endurance runs.
