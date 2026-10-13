# SC-start timing correction — 2026-10-08

Observed on the user's F1 Albert Park screen: ANT and several followers had
0:01.000 PBs; ANT's history included L2 with fabricated 0.332/0.268/0.400
splits. The leader had a normal approximately 89 s PB. A two-lap SC formation
reproduced the short follower records in the native engine.

SC rolling release retains its formation distance offset. The green handler
previously left processedLap at 1. Followers crossed the release line within
seconds of green, and the race lap handler accepted that as a completed lap,
clamping the short elapsed time to one second. The leader, already on the
line, avoided this crossing, explaining why the error affected followers.

At green, initialise the processed crossing ledger to the release line for
each grid position. The release crossing is excluded; the next completed lap
is measured from green. Standing and explicit dry rolling starts keep their
existing one-line baseline. Race-distance and SC-formation counting are not
changed by this correction.

Checkpoint restoration removes the impossible opening records from the old
SC-start path and recomputes best/last timing from remaining valid history.
The opening-lap number restriction plus a generous 600 km/h travel bound
protects valid older lap numbering. Progress, positions, fuel and tyre state
remain intact. When only a stale crossing ledger needs repair, timing history
and PBs remain untouched. Personal sector bests derive from the corrected
history. No storage-key or model-version reset discards the user's race.

Regression exercises F1/SF with two and three SC formation laps, early release
and first genuine full lap, checkpoint ledger repair, invalid saved record
removal, idempotence and protection of valid older-numbered laps.
