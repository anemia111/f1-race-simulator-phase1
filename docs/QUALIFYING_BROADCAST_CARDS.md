# F1 qualifying timing cards

F1 SIM qualifying and sprint qualifying show three timing slots below the map.
Only active flying laps compete for free slots, ordered by estimated time to the
finish (remaining lap fraction × the car's pace). This is display direction,
not a change to vehicle physics, timing or classification. Cards can focus a car.

## Comparisons and timing

- Rank valid completed laps in the current segment and active participant field.
  Use the configured segment advancement count, including custom field sizes,
  rather than hard-coding P16/P10.
- Drivers outside the advancement places, including no-time drivers, compare
  with the last safe place. Drivers inside compare with the leader. The leader
  compares with their own prior best. The final segment compares with the leader.
- If the cutoff has no recorded lap yet, fall back to the recorded leader. With
  no reference, show NO TIME and no invented delta.
- Freeze the reference lap for the displayed attempt; beating it must not
  replace the reference with the same new lap and produce a zero delta.
- Running clocks use the actual lap-start clock. S1/S2 deltas use completed
  cumulative measured sectors. There is no invented continuous predicted delta.
- At the actual timing-line crossing, show the final difference prominently,
  the measured lap time, resulting position and completed sector times.
  Deleted laps show DELETED, their measured time and no improvement delta.
- Hold each displayed result for three wall-clock seconds, including in fast
  forward or while paused. Then select the next approaching flying lap. Multiple
  displayed finishers keep their own timers. A reset clears stale attempts.
- Q/SQ segments never borrow reference laps from another segment. Legacy saves
  may omit the optional lap completion timestamp; newly completed timed laps
  record the physical crossing time.

## Source and editorial boundaries

The user's broadcast photo supplies the visual reference: dark card, driver and
position header, team colour rule, tyre compound, large clock/final delta,
reference time/driver, and three coloured sector bars. The user requested three
cards, the cutoff/top comparison policy and the three-second hold.

The [official F1 glossary](https://www.formula1.com/en/latest/article/f1-glossary-p-t.GBhLQtpeu9b8LrK5VM0F1)
describes three timing sectors and purple/green/yellow for overall best/personal
best/slower splits. It also describes the 22-car Q1/Q2 elimination structure.
The card policy follows the app's configured quotas. No public primary source
located during this change specifies the exact world-feed selection algorithm,
reference-switch policy or on-screen duration. Those are explicitly this SIM's
requested presentation, not claimed to be an exact FOM production rule.

## Short verification

Nine focused direction tests cover selection, cutoff/top/no-time/final-segment
references, measured cumulative deltas, frozen final comparisons, simultaneous
finishers, three-second wall-time retention, intervals/resets, deleted laps and
segment isolation. Related traffic and historical timing-audit checks bring the
focused run to 22 passing tests. Type checking and lint pass.

Native in-app browser verification exercised actual Q2/Q3 running and finishing
cards, result expiry and click-to-focus. Three cards fit 1440×900 and 1280×720
without horizontal scrolling or clipped numeric text. Browser error logs were
empty. No long simulation audit or full suite was rerun, per the user's request.
