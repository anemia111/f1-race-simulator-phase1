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
| Raw published-scale skill | `driverDecision.ts` and `driverPublishedAbilityValue` | Clamped to 0..1 per named consumer; values above 100 do not increase generic traits or tyre-condition previews | intent, pedal/line execution, continuous control errors and tyre UI projections |
| Performance-normalized skill | `driverAbility.ts` | 0..100 maps to 0.55..1.00 and every named path saturates at 100 | physics execution, strategy, incidents, race control |
| Direct bounded energy blend | `driverEnergyIntent.ts` | Each raw skill is clamped to 0..1 before the weighted blend | F1 scheduling preferences only |
| Limit-break aggregate | `driverAbility.ts` | Mean excess above 100 across all 30 skills | recovery of part of the timed physical reference's transient concession |
| Display aggregate | `driverAbility.ts` | Twelve UI groups or configured source overall | setup UI and season history; no runtime lap-time read |

The coexistence of raw behavior and performance-normalized domains is current
simulator behavior. Phase 7.8A documents it but does not claim that the combined
sensitivity has been calibrated or that using a skill in both domains is
automatically justified.

## Production dependency/consumer map

| Path | Ability inputs | Intermediate signal | Outcome owner and cadence | Status |
| --- | --- | --- | --- | --- |
| Live generic decision | pace, control, corner, consistency, awareness, racecraft skills plus all six styles | `DriverBehaviorTraits` and `DriverDecision` | `race.ts` evaluates every simulation advance; decision hashes are namespaced to the current 1/12-lap window, while cues may change between advances. Attack/defend cues exist only for race-distance sessions | Primary behavior path |
| Offline timed generic decision | the same skills and styles | `DriverBehaviorTraits` and `DriverDecision` | `qualifying.ts`, exactly 12 existing window evaluations per lap | Primary behavior path |
| Live grip and pedals | decision tyre-limit, brake and throttle requests | utilized grip and final pedal controls | `telemetry.ts`, every physics tick; physical limits remain downstream | Decision execution |
| Live line execution | decision line request | reserved target and integrated lateral state | `race.ts` reserves the request and `advanceLateralState` executes/holds it during live advancement | Decision execution |
| Fuel use | fuel management and throttle control | fuel-use multiplier | `vehicleDynamics.ts`; `race.ts` debits fuel | Physical state |
| Tyre state | tyre management, throttle control, precision and wet skill | wear, temperature, cliff and selection signals | `race.ts`, `telemetry.ts`, `strategy.ts`, `weekendTires.ts` | Multi-owner review item |
| Start | start skill, traction control, pressure handling and awareness | launch quality and start-error risk | `race.ts`, start transition only | Event decision |
| Race control/compliance | awareness, consistency and pressure handling | VSC compliance, warning/penalty/permission rolls | `race.ts`, at the owning event or sector cadence | Rule outcome |
| Battle resolution | overtaking, defending, error-control, wet, adaptability and tyre-management skills | attempt, pass, defend, contact and tyre edge | `overtaking.ts`, race-only battle windows | Formal outcome owner; DA-05 tyre edge pending |
| Independent incidents | consistency, mistake resistance, pressure, precision, awareness and wet skills | incident probability/disposition | `incidents.ts`, lap incident cadence | Sequential review item |
| F1 energy scheduling | ERS management, awareness, precision, adaptability, consistency, wet and braking skills | energy intent, deployment request, wet recovery and superclipping response | `driverEnergyIntent.ts`, `telemetry.ts`, `superClipping.ts`; Energy Store owns SOC/power | Sequential review item |
| Automatic pursuit pace | overtaking, ERS management and awareness | requested pace mode | `race.ts` / `racePace.ts`; clear-race planning uses the existing 24 mini-sector windows per lap and a lap-keyed pursuit roll, while local-control phases re-evaluate the retained/current mode on each simulation advance | Strategy request |
| Pit/tyre strategy | tyre management, overtaking, awareness and traffic management | cliff, undercut and overcut choice | `strategy.ts`, strategy cadence | Strategy outcome |
| Offline timed execution | generic decision plus a wet-skill-only rain overlay and a consistency/precision/pressure assembly overlay | execution loss and run-wide variation | `qualifying.ts`, 12 windows plus one run-wide draw | Resolved owner split |
| Qualifying release | none; machine qualifying rating, pit-crew speed and deterministic team planning own release order | release order | `qualifyingStrategy.ts`, scheduled run planning | Resolved team owner |
| Qualifying permission | qualifying pace | general performance evidence | `race.ts`, no-time/deleted Q1 steward simulation | Rule outcome |
| Practice/setup | consistency and car-balance adaptation | programme execution score, feedback confidence and setup convergence | `qualifying.ts` and `engineering.ts`, practice-run cadence | Resolved owner split |

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
| `qualifyingPace` | no-time/deleted-Q1 permission evidence | named |
| `racePace` | none for the final skill outside source expansion/display | aggregate-only |
| `brakingSkill` | generic braking traits, live brake fallback and wet Energy Store recovery | named |
| `lowSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `mediumSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `highSpeedCornerSkill` | generic cornering/line/tyre-limit traits | named |
| `tractionControl` | generic throttle trait and race launch | named |
| `throttleControl` | generic throttle trait, fuel use and tyre temperature | named |
| `tireManagement` | generic tyre-limit trait, tyre state, battle tyre edge, tyre/pit strategy and start tyre choice | named |
| `tireWarmupSkill` | none outside source expansion/display | aggregate-only |
| `wetSkill` | timed rain overlay, battle, incidents, start tyre choice and Energy Store recovery | named |
| `intermediateSkill` | light-rain incident risk | named |
| `overtakingSkill` | generic racecraft/attack, battle, pursuit pace and undercut choice | named |
| `defendingSkill` | generic racecraft/defence and battle | named |
| `racecraft` | generic racecraft/attack/defence traits | named |
| `consistency` | generic control/error, timed run variation, incidents, VSC and superclipping response | named |
| `mistakeResistance` | generic control/error, incidents and battle error | named |
| `pressureHandling` | generic control/error, timed variation, incidents, battle, launch, VSC and brake fallback | named |
| `trafficManagement` | generic awareness/racecraft and undercut choice | named |
| `dirtyAirManagement` | none outside source expansion/display | aggregate-only |
| `fuelManagement` | physical fuel-use multiplier | named |
| `ersManagement` | F1 energy chain and automatic pursuit pace | named |
| `restartSkill` | none outside source expansion/display | aggregate-only |
| `startSkill` | generic reaction and race launch | named |
| `confidence` | generic tyre-limit, aggression and risk traits | named |
| `precision` | generic control, F1 energy, timed variation, incidents, battle, brake fallback and tyre temperature | named |
| `adaptability` | generic traits, battle wet skill, F1 energy and wet recovery | named |
| `raceAwareness` | generic traits, F1 energy, qualifying abort, race control, pursuit, VSC, strategy, incidents and battle | named |
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
| DA-01 | Generic attack intent followed by formal battle resolution | resolved single stochastic owner in Phase 7.8B | Generic decisions own intent and physical controls only; `overtaking.ts` alone owns attempt, pass/defend, contact and crash rolls, and is called only for attack intent |
| DA-02 | Window-level control/error followed by independent lap incident rolls | resolved distinct-cadence contract in Phase 7.8B | Generic decisions return bounded continuous controls and no damage/time/retirement/flag outcome; `incidentForLap` accepts no decision, skips lap 1 and owns rare lap-level outcomes under independent deterministic keys |
| DA-03 | ERS skill in intent, deployment, recovery and superclipping response | sequential compound / review required | Regulatory/physical authority is separated; repeated ability sensitivity remains unexplained |
| DA-04 | Timed decision control followed by a rain multiplier | resolved single owner in Phase 7.8B | Generic decision windows retain adaptability, braking and throttle control; the rain overlay reads only `wetSkill`, with its existing severity and risk envelope fixed by a pure helper test |
| DA-05 | Tyre skill in grip utilisation, temperature, wear, battle edge and strategy | sequential compound / review required | Local mechanisms are distinct; combined sensitivity is not documented as calibrated |
| DA-06 | Practice programme execution followed by setup feedback and convergence | resolved owner split in Phase 7.8B | `consistency` alone owns the programme score; final `carBalanceAdaptation` alone owns feedback, completeness and convergence. Compact-source expansion remains a separate DA-14 construction review |
| DA-07 | Driver execution/awareness skills influencing team qualifying release order | resolved team owner in Phase 7.8B | Release order now reads no driver ability: machine qualifying rating, pit-crew speed and the existing deterministic planning hashes remain, without reallocating removed driver weights |
| DA-08 | Per-window control plus one run-wide consistency variation | resolved contract in Phase 7.8B | Twelve windows own local execution; one deterministic-key draw owns only a bounded non-negative whole-run assembly shortfall, with symmetry and bounds held by a pure helper test |
| DA-09 | Decision brake pressure versus telemetry skill fallback | resolved mutually exclusive fallback in Phase 7.8B | An explicit decision scale short-circuits the skill blend; the skill path is evaluated only when no decision exists |
| DA-10 | Fuel multiplier used by prediction and actual debit | resolved shared value in Phase 7.8B | One cached multiplier feeds both fuel-to-finish prediction and the single actual debit during the same car advancement |
| DA-11 | Above-100 all-skill recovery plus named performance paths | resolved in Phase 7.8B | Named performance and energy paths now saturate each input at 100; only the bounded all-skill limit-break fraction consumes authored excess |
| DA-12 | Generic control/awareness followed by independent qualifying abort/deletion and live timed yellow/track-limit rolls | sequential compound / review required | Continuous control and adjudication events have separate owners, but overlapping awareness sensitivity is unexplained |
| DA-13 | Live timed sessions inheriting race attack/defend cues while formal battle resolution is race-only | resolved session boundary in Phase 7.8B | Attack and defend cues are gated to race-distance sessions; timed-session tow, dirty-air avoidance and yield cues remain as traffic-management controls |
| DA-14 | One compact axis fans out to multiple final skills that can rejoin the same blend, such as identical expanded `brakingSkill`/`precision` inputs in braking or `overtakingSkill`/`defendingSkill` rejoining their aggregate `racecraft` | construction-time duplicate / review required | The 12-to-30 expansion is explicit, but repeated sensitivity after fan-out has not been justified or calibrated |

No `review required` row may be relabelled intentional merely because its
modules have separate authorities. Resolution needs a dedicated sensitivity
study and acceptance criteria; it must not use holdout or documentation
validation values for tuning.

## Dead and incomplete sinks

- `WeekendContext.setupBonusByDriver` is accumulated/persisted but has no
  production consumer.
- `racePace`, `tireWarmupSkill`, `dirtyAirManagement`, and `restartSkill` have
  no named normal-scale consumer and are aggregate-only.
These are inventory findings, not authorization to wire a value into pace or
delete saved state. Each change needs its own migration, replay, and acceptance
scope.

### Phase 7.8B cleanup log

The first behavior-neutral cleanup removes the unused `driverAbilityDeficit`
export and renames only the positional track-limit helper parameter to
`raceAwarenessAbility`, matching its production caller. The exported legacy
`trackLimitConsistencyWeight` tuning key, its value, the formula, argument
order, seed, and hash key remain unchanged. This naming correction does not
decide whether race awareness is the final intended policy input and does not
resolve DA-12.

The next behavior-neutral cleanup removes only the redundant returned
`DriverDecision.decisionWindow` field. The local decision-window value remains
the input to `absoluteDecisionWindow`, so the 12-window cadence, arithmetic,
seed/hash inputs, random evaluations, and every production-consumed decision
value remain unchanged. This narrows an internal return surface; it does not
resolve a duplicate-effect review item.

The third behavior-neutral cleanup removes the terminal
`F1EnergyIntent.qualifyingSpendBias` calculation and returned field, plus only
the redundant returned `endOfStraightHarvestBias` field. The local
end-of-straight value still contributes to `superclipAcceptance`; qualifying
phase still changes consumed intent outputs. No coefficient, formula feeding a
consumer, seed/hash input, random evaluation, SOC/energy authority, or saved
state changes. This return-shape cleanup does not resolve DA-03.

The fourth behavior-neutral cleanup removes the uncalled
`qualifyingSetupPenaltySeconds` export and its private constant. The separate
`setupCompletenessPercent` helper and its `SetupPanel` consumer remain intact;
no timed-session setup penalty is added or changed. Runtime values, seeds, random
evaluations, persisted setup state, and results remain unchanged.

The fifth cleanup resolves DA-11 by saturating every named raw, performance, and
direct energy-skill input at the published 100-point ceiling. Authored values up
to 120 remain visible and validated, but their excess has one runtime owner:
the existing bounded `driverLimitBreakFraction` recovery of the timed physical
reference's transient concession. No coefficient is refitted, and the 0..100
field is unchanged; above-100 named-path behavior intentionally narrows.

The sixth cleanup closes DA-08 without changing a value or hash key. Twelve
decision windows retain local brake, throttle, line, control, and error losses.
The separate `lap-execution` draw is named and tested as one non-negative
whole-run assembly shortfall: opposite draw signs are equivalent, a zero draw
adds zero, and the existing consistency endpoints bound it. Limit-break recovery
remains the only route to a negative total adjustment.

The seventh cleanup resolves DA-04 without adding or refitting a coefficient.
The existing generic decision windows remain the owners of adaptability,
braking and throttle-control execution. The separate rain overlay now reads
only `wetSkill` while preserving the existing clear/light/heavy severities and
the same 1.00..1.625 risk envelope. Decision-window count, contexts, hashes,
run-wide draw, return shape, and saved state are unchanged; dry execution is
exactly unchanged and wet results intentionally lose the duplicate axes.

The eighth cleanup resolves DA-06 without replacing removed weight. Practice
programme execution now reads `consistency` alone, while final
`carBalanceAdaptation` alone owns setup feedback, completeness and convergence.
The direct final-skill `adaptability` reads are removed from both setup stages;
its compact-source contribution to expanded `carBalanceAdaptation` remains
explicitly tracked under DA-14. Existing setup hashes, evaluation count,
cadence, return types, and saved shape remain unchanged. Setup results
intentionally lose the duplicate final-skill sensitivity.

The ninth cleanup resolves DA-07 by making qualifying pit release a team-owned
operation. The four direct driver-ability reads are removed from ordering;
machine qualifying rating, pit-crew speed, teammate de-stacking, and the
existing deterministic planning variations remain. Removed driver weights are
not reassigned. Hash keys, evaluation order/count, schedule shape, traffic-gap
rules, suspension handling, and cadence remain unchanged; dry and wet release
orders intentionally become invariant to driver skills.

The tenth cleanup is behavior-neutral. It closes DA-02 with an executable
cadence/output contract: generic decisions expose continuous controls but no
damage, time-loss, retirement or flag outcome, while the stateless lap incident
owner accepts no decision and remains inactive on lap 1. It closes DA-09 by
making the existing nullish brake fallback lazy and testing that an explicit
decision short-circuits skill evaluation. It closes DA-10 by caching the
unchanged fuel-use multiplier once per car advancement for both prediction and
the one debit. Finally, the unconsumed returned
`DriverDecision.nominalLateralOffsetM` and `errorRisk` fields are removed while
their local values continue to feed desired line, error trigger and contact
risk. Formulas, hashes, random evaluations, cadence, state and consumed results
remain unchanged.

The eleventh cleanup resolves DA-13 at the caller boundary. Live attack and
defend cues are supplied only during race-distance sessions, matching the
race-only formal battle owner. Timed-session tow alignment, dirty-air avoidance,
blue-flag yield, pit, emergency and flag controls remain available. The helper
is pure; race cue values, decision hashes, window cadence, downstream battle
hashes, state and schemas are unchanged. Timed sessions intentionally stop
selecting race battle intents.

The twelfth cleanup resolves DA-01 with one stochastic battle owner. Generic
decisions retain attack/defend intent, lateral placement and pedal/control
error, but no longer roll or return attempted overtake, attempted defence, or
contact risk. The race loop invokes `overtaking.ts` only for attack intent, and
that formal resolver alone owns attempt, pass/defend, contact and crash rolls.
Its duplicate decision-contact input is removed without reallocating weight.
The deleted generic hash calls were stateless, so formal hash keys/cadence and
all unrelated random results remain unchanged; battle outcomes intentionally
change to the single-owner model.

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
