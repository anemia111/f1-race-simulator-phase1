# F1 preparation-lap and pit charging — 2026-10-13

User requested strong charging on out/in laps and full ERS charge in the pit.
This is an explicit SIM operating choice, not a claim about real F1 pit service.

On out/in/cooldown laps, driver harvest/lift preferences are1, no electrical
deployment is requested, and the physical recovery request scale is1.25.
Below98% SOC, the car can lift to35% requested throttle shortly before braking
(2.2s travel +30m lookahead). Actual generator torque and conversion efficiency
still own the recovered energy. It does not invent stored charge on-track.
The final8% of an out lap retains its launch rather than adding this coast.
Physical flags, traffic, brake work, grip, temperature and recharge caps remain.

Normal F1 service fills the store at the actual pit box, and release retains100%
including FP programs that previously selected78/88% charge. A release-time
fallback handles short/coarse steps which missed the box sample. Pending BOX
instructions and pit-lane travel do not fill the battery; penalty-only stops
do not get service. No SF energy store or extra-category hybrid change.

External pit energy is recorded in the optional pitChargedEnergyThisLapMJ field.
The energy balance includes it separately from generator recharge, preserving
lap limits, losses and energy use. It resets at the next energy lap, and repeated
box ticks at100% add nothing. Checkpoints accept bounded finite optional values;
older saves without the field remain compatible. Original lap-start energy stays
within its physical capacity instead of hiding pit charge in that baseline.

124 selected checks pass in5 suites, with the previously diagnosed unrelated
populated-checkpoint-size case excluded. Actual short checks cover out/in-lap
recovery from9%, FP/Q/race pit box and full-charge release, continued live energy
balance and checkpoint round trip. Existing driver energy intent, physical store
and recharge-policy tests pass. No long tests; shortened publication remains.
