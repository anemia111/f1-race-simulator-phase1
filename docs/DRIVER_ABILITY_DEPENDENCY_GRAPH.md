# Driver ability dependency graph

## Phase 7.8A boundary

This document records a static production dependency/consumer graph from
authored or imported driver data to simulation reads and outcome owners. Phase
7.8A changes no production calculation, coefficient, seed, random key or
cadence, category rule, physical authority, runtime field, or checkpoint. The
graph is now documented; dynamic sensitivity and causal necessity are not
proven, and the unexplained compound effects in the review register are
**not** resolved by this slice. Their explanation, sensitivity validation, and
removal remain Phase 7.8B or later work.

The graph distinguishes four things that must not be collapsed:

- authored or derived skill inputs;
- style preferences that affect execution but never create car performance;
- displayed/source overall metadata; and
- the executable `seriesId` / `vehicleEraId` policy identity.

## Construction and runtime boundary

```text
F1 12-axis authored ratings ------------------------------┐
Driver-pool compact ratings ------------------------------+-->
raw overall-only records -> estimated/corrected ratings --┘
                         expandedDriverSkills -> 30 skills
persisted/group-editor 30-skill profiles -> validated/migrated 30 skills
                                                        |
                 +------------------+-------------------+------------------+
                 |                  |                                      |
       raw 0..1 behavior      performance-normalized                all-skill mean
          trait inputs         execution inputs                    above-100 excess
                 |                  |                                      |
       intent/control/risk   physics/strategy/rules          timed-session recovery

six style preferences -> behavior traits only
materialized displayed/derived overall -> UI and season history only
series/vehicle era -> category policy validation, never a pace multiplier
```

`src/data/driverProfiles.ts` expands auditable compact ratings into the 30
skills in `DriverSkillProfile`. Normal F1 CSV rows keep their authored compact
axes and store `Overall` separately. Overall-only records, including bundled SF
drivers and synthetic F1 reserves, use `src/series/seriesRegistry.ts` to
estimate and correct compact axes before expansion. Driver-pool materialization
also expands its selected compact ratings.

Persisted or group-editor series configurations are a distinct input path.
`src/data/seriesConfiguration.ts` validates their already-complete 30-skill
profile and normally passes it directly to the runtime. Only recognized legacy
fingerprints are replaced with the current base profile during load migration.
Not every executable profile therefore passes through `expandedDriverSkills`
in the current process.

Overall can be a construction, import/migration, or profile-selection ancestor:

- overall-only SF and F1 reserve records seed compact ratings;
- `mergePoolRecord` selects the higher-overall record's complete ratings when
  duplicate pool identities are merged;
- Free Mode uses source overall to choose one complete duplicate driver profile;
  and
- the legacy support-profile migration predicate reads base overall when
  deciding whether an imported 30-skill profile should be replaced.

After a driver is materialized, race, timed-session, physics, and strategy code
does not read overall as another pace multiplier. The selected or migrated
skills and style run normally.

Historical source-series provenance is identity/history input only. It does
not choose an executable category policy or alter the materialized skill/style
profile. Executable category comes from the explicit race configuration.

## Compact-axis expansion

This table is the full inverse map of `expandedDriverSkills`. A final skill can
have multiple compact ancestors because several outputs are arithmetic means.
The final `DriverSkillProfile.racePace` node must not be confused with the
compact `racePace` source axis, which also constructs other active skills.

| Compact source axis | Final 30-skill outputs |
| --- | --- |
| `adaptability` | `adaptability`, `lowSpeedCornerSkill`, `mediumSpeedCornerSkill`, `highSpeedCornerSkill`, `tireWarmupSkill`, `intermediateSkill`, `trafficManagement`, `ersManagement`, `carBalanceAdaptation` |
| `consistency` | `consistency`, `pressureHandling` |
| `defending` | `defendingSkill`, `racecraft`, `dirtyAirManagement`, `raceAwareness` |
| `errorControl` | `brakingSkill`, `tractionControl`, `throttleControl`, `mistakeResistance`, `pressureHandling`, `precision`, `raceAwareness` |
| `experience` | `racecraft`, `pressureHandling`, `trafficManagement`, `dirtyAirManagement`, `restartSkill`, `confidence`, `raceAwareness` |
| `overtaking` | `overtakingSkill`, `racecraft`, `trafficManagement` |
| `qualifyingPace` | `qualifyingPace`, `rawPace`, `brakingSkill`, `mediumSpeedCornerSkill`, `highSpeedCornerSkill`, `confidence`, `precision` |
| `racePace` | `racePace`, `rawPace`, `lowSpeedCornerSkill`, `mediumSpeedCornerSkill`, `tractionControl`, `throttleControl`, `dirtyAirManagement`, `confidence` |
| `raceStart` | `tractionControl`, `tireWarmupSkill`, `restartSkill`, `startSkill` |
| `technicalFeedback` | `fuelManagement`, `ersManagement`, `carBalanceAdaptation` |
| `tyreManagement` | `tireManagement`, `throttleControl`, `tireWarmupSkill`, `fuelManagement` |
| `wetSkill` | `wetSkill`, `intermediateSkill` |

## Normalization domains

| Domain | Owner | Range and purpose | Main consumers |
| --- | --- | --- | --- |
| Raw behavior skill | `driverDecision.ts` | Clamped to 0..1 for generic traits; values above 100 do not increase these traits | intent, pedal/line execution, error and contact requests |
| Performance-normalized skill | `driverAbility.ts` | 0..100 maps to 0.55..1.00; the authored limit-break ceiling can reach 1.09 | physics execution, strategy, incidents, race control |
| Direct bounded energy blend | `driverEnergyIntent.ts` | Raw skill blend clamped to 0..1 | F1 scheduling preferences only |
| Limit-break aggregate | `driverAbility.ts` | Mean excess above 100 across all 30 skills | recovery of part of the timed physical reference's transient concession |
| Display aggregate | `driverAbility.ts` | Twelve UI groups or configured source overall | setup UI and season history; no runtime lap-time read |

The coexistence of raw behavior and performance-normalized domains is current
simulator behavior. Phase 7.8A documents it but does not claim that the combined
sensitivity has been calibrated or that using a skill in both domains is
automatically justified.

## Production dependency/consumer map

| Path | Ability inputs | Intermediate signal | Outcome owner and cadence | Status |
| --- | --- | --- | --- | --- |
| Live generic decision | pace, control, corner, consistency, awareness, racecraft skills plus all six styles | `DriverBehaviorTraits` and `DriverDecision` | `race.ts` evaluates every simulation advance; decision hashes are namespaced to the current 1/12-lap window, while cues may change between advances | Primary behavior path |
| Offline timed generic decision | the same skills and styles | `DriverBehaviorTraits` and `DriverDecision` | `qualifying.ts`, exactly 12 existing window evaluations per lap | Primary behavior path |
| Live grip and pedals | decision tyre-limit, brake and throttle requests | utilized grip and final pedal controls | `telemetry.ts`, every physics tick; physical limits remain downstream | Decision execution |
| Live line execution | decision line request | reserved target and integrated lateral state | `race.ts` reserves the request and `advanceLateralState` executes/holds it during live advancement | Decision execution |
| Fuel use | fuel management and throttle control | fuel-use multiplier | `vehicleDynamics.ts`; `race.ts` debits fuel | Physical state |
| Tyre state | tyre management, throttle control, precision and wet skill | wear, temperature, cliff and selection signals | `race.ts`, `telemetry.ts`, `strategy.ts`, `weekendTires.ts` | Multi-owner review item |
| Start | start skill, traction control, pressure handling and awareness | launch quality and start-error risk | `race.ts`, start transition only | Event decision |
| Race control/compliance | awareness, consistency and pressure handling | VSC compliance, warning/penalty/permission rolls | `race.ts`, at the owning event or sector cadence | Rule outcome |
| Battle resolution | overtaking, defending, error-control, wet, adaptability and tyre-management skills | attempt, pass, contact and tyre edge | `overtaking.ts`, race-only battle windows | Sequential review item |
| Independent incidents | consistency, mistake resistance, pressure, precision, awareness and wet skills | incident probability/disposition | `incidents.ts`, lap incident cadence | Sequential review item |
| F1 energy scheduling | ERS management, awareness, precision, adaptability, consistency, wet and braking skills | energy intent, deployment request, wet recovery and superclipping response | `driverEnergyIntent.ts`, `telemetry.ts`, `superClipping.ts`; Energy Store owns SOC/power | Sequential review item |
| Automatic pursuit pace | overtaking, ERS management and awareness | requested pace mode | `race.ts` / `racePace.ts`; clear-race planning uses the existing 24 mini-sector windows per lap and a lap-keyed pursuit roll, while local-control phases re-evaluate the retained/current mode on each simulation advance | Strategy request |
| Pit/tyre strategy | tyre management, overtaking, awareness and traffic management | cliff, undercut and overcut choice | `strategy.ts`, strategy cadence | Strategy outcome |
| Offline timed execution | generic decision plus wet, consistency, precision and pressure overlays | execution loss and run-wide variation | `qualifying.ts`, 12 windows plus one run-wide draw | Sequential review item |
| Qualifying release | qualifying pace, pressure, traffic and awareness | release confidence/order | `qualifyingStrategy.ts`, scheduled run planning | Ownership review item |
| Qualifying permission | qualifying pace | general performance evidence | `race.ts`, no-time/deleted Q1 steward simulation | Rule outcome |
| Practice/setup | adaptability, consistency and car-balance adaptation | programme score, feedback confidence and setup convergence | `qualifying.ts` and `engineering.ts`, practice-run cadence | Sequential review item |

The table records dependencies, not permission for a future agent to write the
outcome. Physical integration, Energy Store accounting, tyre state, race
control, stewarding, release schedules, traffic, strategy, and classification
remain their current authorities.

## Skill coverage

“Named paths” means a production consumer reads that final skill by name. Every
skill also participates in the above-100 all-skill limit-break aggregate.

| Skill | Named production paths | Coverage |
| --- | --- | --- |
| `rawPace` | generic tyre-limit utilisation | named |
| `qualifyingPace` | qualifying release and no-time/deleted-Q1 permission evidence | named |
| `racePace` | none for the final skill outside source expansion/display | aggregate-only |
| `brakingSkill` | generic braking traits, timed wet control, live brake fallback, wet Energy Store recovery | named |
| `lowSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `mediumSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `highSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `tractionControl` | generic throttle trait and race launch | named |
| `throttleControl` | generic throttle trait, timed wet control, fuel use and tyre temperature | named |
| `tireManagement` | generic tyre-limit trait, tyre state, battle tyre edge, tyre/pit strategy and start tyre choice | named |
| `tireWarmupSkill` | none outside source expansion/display | aggregate-only |
| `wetSkill` | timed wet control, battle, incidents, start tyre choice and Energy Store recovery | named |
| `intermediateSkill` | light-rain incident risk | named |
| `overtakingSkill` | generic racecraft/attack, battle, pursuit pace and undercut choice | named |
| `defendingSkill` | generic racecraft/defence and battle | named |
| `racecraft` | generic racecraft/attack/defence traits | named |
| `consistency` | generic control/error, timed run variation, incidents, VSC and superclipping response | named |
| `mistakeResistance` | generic control/error, incidents and battle error | named |
| `pressureHandling` | generic control/error, timed variation, incidents, battle, release, launch, VSC and brake fallback | named |
| `trafficManagement` | generic awareness/racecraft, qualifying release and undercut choice | named |
| `dirtyAirManagement` | none outside source expansion/display | aggregate-only |
| `fuelManagement` | physical fuel-use multiplier | named |
| `ersManagement` | F1 energy chain and automatic pursuit pace | named |
| `restartSkill` | none outside source expansion/display | aggregate-only |
| `startSkill` | generic reaction and race launch | named |
| `confidence` | generic tyre-limit, aggression and risk traits | named |
| `precision` | generic control, F1 energy, timed variation, incidents, battle, brake fallback and tyre temperature | named |
| `adaptability` | generic traits, timed wet/practice, setup, battle wet skill, F1 energy and wet recovery | named |
| `raceAwareness` | generic traits, F1 energy, release/abort, race control, pursuit, VSC, strategy, incidents and battle | named |
| `carBalanceAdaptation` | generic tyre-limit trait and practice setup feedback | named |

The four aggregate-only final skills are not described as unused because a value
above 100 still changes the all-skill limit-break mean. They currently have no
normal-scale, named production reader.

## Style coverage

All six styles are read only by `driverBehaviorTraits`:

- `brakingAggression`, `frontEndPreference`, and `cornerShapePreference` feed
  aggression and attack commitment;
- `rearStabilityNeed` feeds defence tendency; and
- `oversteerTolerance` and `understeerTolerance` form balance tolerance for
  risk preference.

They affect bounded decision/execution outputs. They do not modify grip,
power, mass, tyre coefficients, reliability, or category identity.

Current bundled F1, SF, reserve, and driver-pool construction initializes these
fields from the neutral style profile. Series-configuration loading retains the
selected base style. The six fields therefore have production readers but no
current authored per-driver variation; Phase 7.8A does not invent one.

## Duplicate-effect review register

| ID | Relationship | Classification | Phase 7.8A conclusion |
| --- | --- | --- | --- |
| DA-01 | Generic attack/contact request followed by battle attempt/pass/contact skills | sequential compound / review required | Intent and outcome have separate owners, but sensitivity allocation is unexplained |
| DA-02 | Window-level control/error followed by independent lap incident rolls | sequential compound / review required | Continuous error and discrete incident roles differ, but overlap is not bounded by a shared contract |
| DA-03 | ERS skill in intent, deployment, recovery and superclipping response | sequential compound / review required | Regulatory/physical authority is separated; repeated ability sensitivity remains unexplained |
| DA-04 | Timed decision control followed by a wet multiplier reusing adaptability, braking and throttle skills | sequential compound / review required | Wet skill is unique to the overlay; the repeated axes need allocation review |
| DA-05 | Tyre skill in grip utilisation, temperature, wear, battle edge and strategy | sequential compound / review required | Local mechanisms are distinct; combined sensitivity is not documented as calibrated |
| DA-06 | Adaptability in practice score, car-balance derivation and setup feedback | sequential compound / review required | Setup ownership is clear; repeated source-axis influence is not |
| DA-07 | Execution/awareness skills also influence team qualifying release order | independent outcome / ownership review | Current behavior is recorded without claiming release is a driver-agent decision |
| DA-08 | Per-window control plus one run-wide consistency variation | separate cadence / partially justified | Source comments distinguish local execution from whole-lap variation; combined weight remains unreviewed |
| DA-09 | Decision brake pressure versus telemetry skill fallback | mutually exclusive fallback | Not doubled on the normal live path |
| DA-10 | Fuel multiplier used by prediction and actual debit | shared read-only calculation | One common multiplier keeps estimates aligned; fuel is debited once |
| DA-11 | Above-100 all-skill recovery plus named performance paths | sequential compound / review required | Recovery is bounded to the transient concession, but above-100 skills may still affect named normalized paths |
| DA-12 | Generic control/awareness followed by independent qualifying abort/deletion and live timed yellow/track-limit rolls | sequential compound / review required | Continuous control and adjudication events have separate owners, but overlapping awareness sensitivity is unexplained |
| DA-13 | Live timed sessions inherit race attack/defend/tow/dirty-air cues while formal battle resolution is race-only | ownership overlap / review required | Existing shared generic cues are documented; no timed-session racecraft policy is claimed |
| DA-14 | One compact axis fans out to multiple final skills that can rejoin the same blend, such as identical expanded `brakingSkill`/`precision` inputs in braking or `overtakingSkill`/`defendingSkill` rejoining their aggregate `racecraft` | construction-time duplicate / review required | The 12-to-30 expansion is explicit, but repeated sensitivity after fan-out has not been justified or calibrated |

No `review required` row may be relabelled intentional merely because its
modules have separate authorities. Resolution needs a dedicated sensitivity
study and acceptance criteria; it must not use holdout or documentation
validation values for tuning.

## Dead and incomplete sinks

- `F1EnergyIntent.qualifyingSpendBias` is produced but has no production
  consumer.
- the returned `F1EnergyIntent.endOfStraightHarvestBias` field has no downstream
  consumer after its local value has already contributed to another intent
  field.
- `WeekendContext.setupBonusByDriver` is accumulated/persisted but has no
  production consumer.
- `racePace`, `tireWarmupSkill`, `dirtyAirManagement`, and `restartSkill` have
  no named normal-scale consumer and are aggregate-only.
- `DriverDecision.attemptedDefence` is produced but has no production consumer.
- the returned `DriverDecision.decisionWindow`, `nominalLateralOffsetM`, and
  `errorRisk` fields have no downstream production reader. Their local values
  already contribute to other decision calculations before return.
- `driverAbilityDeficit` is an exported helper with no production caller.
- `qualifyingSetupPenaltySeconds` is an exported helper with no production
  caller. Its internal `setupCompletenessPercent` input also has an independent
  `SetupPanel` UI consumer, but no connected timed-session consumer.
- A track-limit helper names one input `consistency` while a production caller
  supplies `raceAwareness`; the semantic ownership needs review before any
  behavioral change.

These are inventory findings, not authorization to wire a value into pace or
delete saved state. Each change needs its own migration, replay, and acceptance
scope.

## Invariants

- displayed/derived overall cannot be reread after materialization as a race or
  timed-session pace multiplier; its construction/import/migration/profile-
  selection ancestry must remain explicit;
- historical source series cannot select the executable policy or alter pace;
- the category policy cannot infer identity from track, tyre, driver source,
  or displayed overall;
- driver outputs cannot raise physical or regulatory limits;
- graph documentation cannot change random keys, cadence, state, or result;
- a new production ability read must be added to this graph and classified for
  duplicate interaction before it is treated as reviewed; and
- Phase 7 remains incomplete until the review-required compounds are resolved
  and operational category policies consume bounded observations.
