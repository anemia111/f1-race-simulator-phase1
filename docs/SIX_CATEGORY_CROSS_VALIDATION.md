# Six-category integration, 2026-10-10

The pit-wall/tyre/environment work is integrated with the six-category runtime
from `feat/all-category-elevation-motion` (`5ce08c4`). F1, SUPER FORMULA,
KYOJO CUP, SUPER GT, FIA WEC and INDYCAR retain their category hardware and
rules when drivers and courses are selected in Free Mode.

## Driver and course interchange

- All 348 authored people retain their ratings and expanded decision skills
  through the shared driver adapter. Nakayama Yuki (`yuki_nakayama`, NAK #31)
  now has 110 on all 14 authored axes. Values above 100 are intentional.
- F1/SF course selection and its start validator now include the registered
  additional-category courses. Common physical layouts are deduplicated.
  The additional four categories already import the F1/SF course pool.
- The cross-category integration test exercises actual Free Mode construction
  and forward physical movement on every selectable course in all six
  categories, with imported drivers. This is startup/movement coverage, not a
  claim that every strategy and full-distance combination has been sampled.
- Course geometry, unavailable timing marks and estimated pit data keep their
  provenance. A scheduling estimate does not set the integrated lap clock.

## SUPER FORMULA qualifying

The former uncalibrated physical model produced simplified qualifying best
times of 98.06s at Motegi, 90.59s at Autopolis, 99.96s at Suzuka, 88.45s at Fuji
and 74.75s at SUGO. The registered SF references are respectively 90.369s,
86.139s, 97.605s, 82.815s and 64.5s. The SUGO reference remains an estimate.

`superFormulaGripCalibration.ts` inversely fits one effective dry contact
coefficient per SF reference layout using a 676kg, 405kW, no-hybrid reference
lap at 25°C. This coefficient enters the physical force envelope in simplified
qualifying, live qualifying and races. It never overwrites lap times or gaps.
Foreign courses retain the SF baseline rather than borrowing an F1 reference.
Explicitly supplied custom hardware profiles remain intact.

This is a SIM calibration, not a measured Yokohama friction coefficient.
Timing alone cannot identify tyre friction independently from coarse layout
curvature. The supplier-model availability boundary remains unavailable.

Live first valid laps with the first native SF entrant and fixed test
seeds measured 85.773s / 84.219s / 96.571s / 81.328s / 64.370s in the same
course order. The live controller and quasi-steady solver still differ, most
noticeably at Motegi (4.596s faster than the reference). The regression bounds
live pace between 94% and 104% of the reference; it does not assert exact
official pace. Tyre temperature, fuel, weather and driver execution remain
causal inputs. Further controller fidelity work must not force crossing times.

Live cornering-limit caches now distinguish exact physics profiles, preventing
calibrated profiles with the same category identity from sharing stale limits.

## Tyres and road environment

All six timing-board tyre badges include completed laps on the current set
beside remaining SIM life. F1 uses its C1–C5/I/W wear and carcass thermal damage;
SF uses its separate control-tyre SIM model. The additional four categories
retain their own tyre specifications and thermal models.

The user-provided H→M/M→S fresh tyre gaps remain physical grip calibration
inputs for F1. Slipstream, dirty air and category overtaking systems continue
to affect real race gaps.

Additional-category speed planning, downforce, live drag and braking load now
use local air density from the registered absolute elevation profile. Where
the profile is unavailable, altitude is explicitly a SIM fallback. Air
temperature is 25°C in that runtime. Signed road grade continues to enter the
gravity force; rendered map height is not used as a survey.

## Validation

Focused validation covers SF reference and live laps, profile cache isolation,
driver ratings, course selection and start validation, cross-category driving,
local density, tyre dynamics and dashboard adaptation. The normal mandatory
`npm run publish` gate must pass lint, the complete test suite, production build,
all desktop playtests and deployment verification before this batch is called
published. Publication status is recorded separately after that command.
