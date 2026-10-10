# Restore SF championship races

SF championship sessions were filtered out unless the exact event supplied a
race-distance operation. Only substitute Round 3 had such an operation. The
normal round data therefore made Race disappear while FP/qualifying remained.

Add exact per-round overrides for all 12 active rounds. Keep the cancelled
Autopolis original event unavailable and keep the base/unknown-event guard.
No generic F1 distance or actual rain-shortened finishing distance is used.
The replacement retains 25 laps/50 minutes and its JAF notice. Other rounds
use their published scheduled distance and 75-minute limit; no unverified
overall interruption-time limit is invented.

Checked 2026-10-08:

| Rounds | Laps | Official schedule |
| --- | --- | --- |
| 1, 2 | 37 | https://superformula.net/sf3/race/24415/ |
| 4, 5 | 31 | https://superformula.net/sf3/race/24422/ |
| 3 substitute | 25 | https://superformula.net/sf3/race/24425/ |
| 6, 7 | 41 | https://superformula.net/sf3/race/24425/ |
| 8 | 51 | https://superformula.net/sf3/race/24428/ |
| 9, 10 | 41 | https://superformula.net/sf3/race/24431/ |
| 11, 12 | 31 | https://www.suzukacircuit.jp/superformula/2/schedule/ |

Provenance uses official-calendar authority. The JRP pages have no visible
first-publication date; publishedAt 2026-10-08 identifies the checked schedule
snapshot, not an asserted first-publication date. Suzuka's final-round schedule
explicitly dates its publication 2026-09-18 and remains subject to amendment.

Regression checks cover exact event resolution and preserve unavailable
unknown/cancelled event behavior. Browser coverage selects Race for each of
the 12 active events, checks scheduled lap count, starts the engine, and
requires race-clock progress without JavaScript errors. Existing UI is retained.
The browser fixture uses a checked clear-weather seed with one formation lap.
Random wet SC/aborted starts can legitimately reduce the displayed race distance
by extra formation laps; those operational reductions are not missing calendar data.
