# Individual car setup

Open Setup and use the driver selector inside **Car setup**. Front/rear wing,
ride height, brake bias, differential and cooling belong to the selected car's
weekend setup. Teammates can use different values. Changes save automatically
with the current weekend and feed the existing FP, Q/SQ and race/sprint setup
consumers; a new event starts with that circuit's baseline.

Moving a slider or resetting to the circuit baseline selects manual mode for
that car. Practice still gathers confidence, but its recommendation does not
overwrite a manual setup. Enable **FP終了時に自動調整** to allow subsequent FP
completion to apply recommendations again. The toggle does not immediately
replace the current values. Parc ferme locks sliders, reset and the toggle.

`manualSetupByDriver` is optional for backward compatibility; missing entries
mean automatic. The persisted parser admits only current driver IDs and true
boolean manual flags. Setup edits normalize physical ranges and ignore
non-finite input. Selection and edits never change a teammate's setup.

Validation: independent edits, finite/range constraints, locked/unknown cars,
manual retention across FP, return to auto and save/load/legacy defaults.
Native browser confirmation used a fresh localhost origin: NAK rear wing 3,
HAM rear wing 8, and NAK still 3 after switching back. The existing saved Q
state separately confirmed parc ferme locks. No full-weekend tests were run.
