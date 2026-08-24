# F1 2026 ERS-K, Energy Store, and superclip

## Runtime truth

The F1 runtime carries energy in MJ and integrates instantaneous power in kW.
Battery percentage is a display derived from the fixed 4 MJ usable Energy
Store window; it is not an independent state variable.

The model keeps three boundaries distinct:

1. MGU-K mechanical power at the shaft.
2. Electrical power measured at the CU-K HV DC bus.
3. Energy actually added to or removed from the Energy Store after battery
   conversion loss.

For propulsion, the C5.2.8 speed curve and 350 kW absolute cap apply first at
the DC bus. Mechanical output is then:

```text
P_MGU-K_mechanical = P_CU-K_discharge × eta_inverter × eta_motor
P_ES_removed = P_CU-K_discharge / eta_battery_discharge
```

For regeneration:

```text
P_CU-K_recharge = P_MGU-K_generator × eta_motor × eta_inverter
P_ES_stored = P_CU-K_recharge × eta_battery_charge
```

Battery, inverter, and motor losses are recorded independently. Each public
energy-system step returns an audit assembled from integrated power flows. It
checks both stored-energy balance and the complete conversion chain.

## Recharge authority and event input

C5.2.10 counts Recharge at the CU-K HV DC bus. The binding technical base is
8.5 MJ per lap, with event reductions and context supplied through Competition
Information. Low Grip behind the Safety Car is an unlimited override, not an
extra numeric allowance. Persisted state represents it as `kind: unlimited`
with a null maximum; JSON never stores `Infinity`.

The normalized 2026 Japanese Grand Prix Power Unit Information input is keyed
by event ID `f1-03` and records these complete totals:

| Context | Maximum CU-K recharge |
| --- | ---: |
| Race, Overtake inactive at the Line | 8.5 MJ |
| Race, Overtake active at the Line | 9.0 MJ |
| Qualifying | 8.0 MJ |
| Free Practice | 9.0 MJ |
| Non-Race out lap | 9.0 MJ |

The Race-active 9.0 MJ total is also represented as 8.5 MJ base plus 0.5 MJ
allowance for provenance. Consumers do not add the 0.5 MJ a second time.
Overtake recharge status is latched at the lap-start Line; pressing or
releasing Overtake later in the lap cannot rewrite the current ledger.
The same fresh-lap rule is established when a pit release, formation-to-race
transition, or red-flag re-formation carries a car through that Line. A
checkpoint persists the per-car lap-start Low Grip and Safety Car context, so
cars straddling a condition change are restored against their own valid rule.

Missing event or session context resolves as unavailable unless the technical
rule itself defines the complete case. Values are not borrowed by track ID.

## Operating modes

`ErsKOperatingMode` is derived from actual power flow:

- `propulsion`
- `braking-regeneration`
- `lift-coast-regeneration`
- `full-throttle-superclip`
- `inactive`

The MGU-K cannot be a motor and generator in the same integration substep.
Request magnitude alone never selects a mode.

Full-throttle superclip requires high throttle, positive ICE wheel power, and
actual MGU-K generator power. Net wheel power follows one topology:

```text
P_wheel =
  P_ICE_to_wheel
  + P_MGU-K_propulsion
  - P_MGU-K_generator
```

There is no second ICE `drivePowerScale`. The generator load itself creates
the acceleration/top-speed tradeoff, while the same physical flow raises the
CU-K recharge ledger and Energy Store state after losses.

The FIA's 2026-04-20 communication describes approximately 2–4 seconds of
superclip per lap as an objective. The Phase 4 invariant trace deliberately
does not claim to be a lap-level observation, so that comparison remains
`unavailable` until a complete-lap behavioural validation is added. Runtime
does not impose the range as a timer or per-track correction.

## Driver intent and authority boundary

The driver layer emits `F1EnergyIntent`: unitless scheduling preferences for
deployment, harvesting, lift/coast, superclip acceptance, end-of-straight
harvesting, attack/defend reserves, and qualifying spend. It cannot write SOC,
stored MJ, the C5.2.8 power curve, the 4 MJ window, or event recharge limits.
The physical and regulatory layers remain the only owners of actual power and
energy.

Phase 7.2 changes only dispatch ownership: `driverEnergyIntent.ts` remains the
exact pure numerical kernel, while superclipping, deployment requests,
regulatory gates, and Energy Store integration retain their existing authority.

Phase 7.4 also moves only the baseline requested ERS-mode selector. The same
pure `f1ErsModeIntentFor` result is returned on the legacy and category paths.
Telemetry retains standing-start, preparation/yield, superclip, and qualifying
overrides; all regulatory power, SOC, recharge, and physical owners are
unchanged. This is not a complete or observation-consuming ERS policy.

Phase 7.5 makes the legacy runtime's implicit always-use-when-permitted
Electrical Overtake request explicit and routes only that ephemeral action
through the category-agent switch. The request reads none of the regulatory or
physical inputs. `overtakeStatusFor` still owns Race Control, Low Grip, SOC,
remaining allowance, session/lap, detection-latch, and activation-line gates.
Power-curve selection, incremental allowance debit, lap-start recharge
latching, SOC/recharge accounting, and Energy Store integration remain
unchanged. This is compatibility ownership separation, not an operational
Overtake policy.

## Sources

- [FIA 2026 Technical Regulations, Issue 20](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf)
- [FIA 2026 Sporting Regulations, Issue 08](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_08_-_2026-08-05_7.pdf)
- [FIA 2026 energy-management refinements, 20 April 2026](https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders)
- [2026 Japanese Grand Prix Power Unit Information, document 4](https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_power_unit_information.pdf)

The source manifest stores the exact Japanese document hash and extracted
facts. Non-public FIA-F1-DOC-034 and FIA-F1-DOC-111 remain unavailable; the
public event instruction is not presented as a copy of either document.
