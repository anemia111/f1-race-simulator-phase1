# Telemetry, energy systems and race operations — 2026-10-08

The existing dashboard, FREE builder and category classification remain the entry points. Analysis now includes two-car distance-aligned speed, throttle, brake and gear traces. Corner tables show sampled entry/minimum/exit speed within ±2.5% of course length. These are simulation outputs, not measured driver inputs or official corner speed targets. Additional-category corner markers identify modeled curvature minima, not official turn numbers.

History retains at most 256 spatial samples per lap over the current and two previous laps. Missing intervals remain blank. Fast-forward uses physics ticks. Native and additional-category checkpoints use a versioned base-36 trace encoding, lossless at recorder precision, to retain the existing browser storage budget. Older object-based traces and additional-category tuples remain readable. SF checkpoint validation accepts only the course-specific OTS specification and bounded remaining/cooldown state. Legacy SF saves from before OTS simulation was available receive the initial course-specific budget; already spent budgets and cooldowns remain intact. No historical data is invented.

## Category systems and evidence boundaries

- F1 retains its existing ERS and active-aero implementation.
- SF uses the manufacturer-published 200-second race OTS budget and cooldowns: Suzuka/Autopolis 100s, SUGO 110s, Fuji/Motegi 120s. The boost estimate is 37kW and visibly SIM. The official event-pack resolver remains separate and unavailable without a verified pack. Unknown-course OTS stays unavailable. Use ends in pits/neutralisation and consumes only actual active time.
- WEC hybrid cars deploy and regenerate inside their individual modeled storage/power limits. Hypercar electrical output remains inside the combined power cap. LMDh regeneration limit is 200kW; nominal common battery reference is 1.35kWh / 4.86MJ. Nominal capacity is not a verified usable SOC window. LMH 190km/h deployment gate is a SIM approximation based on a manufacturer reference, not verified 2026 event BoP.
- INDYCAR retains separate push-to-pass and electrical hybrid power. The hybrid reference is 60hp / 44.74kW. The 0.32MJ storage window and control strategy remain SIM estimates, not a certified event allowance.
- Non-hybrid cars receive neither energy deployment nor recovery. 2026 KYOJO follows the existing season specification with hybrid removed/disabled. SUPER GT, LMGT3, LMP2 and Valkyrie do not acquire an invented hybrid system.

Sources:
- https://toyotagazooracing.com/jp/superformula/cars/2026/
- https://www.bosch.fr/actualites/2026/24h-du-mans/
- https://newsroom.porsche.com/en_US/2025/company/porsche-963-rsp-39683.html
- https://www.indycar.com/News/2024/07/07-01-Hybrid-Intro
- https://www.ferrari.com/en-CA/magazine/articles/a-tale-of-two-thoroughbreds-499p-296-challenge

## Requested behavior corrections

Matched-speed following no longer suppresses throttle solely for being inside a preferred gap; closure still requires braking. Timed lap completion cannot randomly create a yellow without a modeled obstruction. Moving minor contacts/wall clips no longer automatically request a yellow; modeled stopped hazards retain flags. Pit releases serialize, including race stops, and the exit blend cannot be used to complete a pass. Main-track traffic remains able to pass cars in the pit lane.

The explicit user request changes NAK #31 中山裕樹 from 120 to 105 on all canonical ability axes. His identity, car number and other drivers remain intact. Native persisted profiles that exactly match the obsolete all-120 default migrate to 105; other custom edits remain authored values.

## Verification

Operational tests cover matched-speed/closing traffic, hazard-only yellows, pit queue releases and exit-order protection, SF force-solver OTS activation and budget/cooldown, history bounds and line-edge samples. Energy tests check discharge/regeneration balance and non-hybrid behavior, with compact-save round trips. Built UI playtests cover both desktop sizes, additional-category normal/FREE flows, telemetry traces and SF systems display. Full-suite and publication evidence are saved in the task outputs after completion.
