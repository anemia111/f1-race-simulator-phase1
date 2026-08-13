# Phase 0 Baseline and Source Freeze

Cutoff: 2026-08-08 JST

Source commit: `09b1d61fa9fc54dc17cc181a619198592ef8cb9e`

The local `master`, `origin/master`, and the commit named in the request were identical at the start. The worktree had no pre-existing user changes. Raw command logs and command metadata are stored in `artifacts/baseline/`; the normalized result is `artifacts/baseline/summary.json`. The complete physics-calibration log remains local because it contains per-circuit holdout rows; its public metadata and summary retain only aggregate values until Phase 17.

## Baseline result

- Dependency install, oxlint with warnings denied, production build, physics-calibration validation, playtest, and benchmark completed with exit code 0.
- The first full Vitest run exceeded a 30-minute explicit limit. The same command with streamed output and a 60-minute limit passed 70 files and 807 tests in about 14 minutes. This is recorded as a performance flake, not an assertion failure.
- Speed-trap validation completed in about 33 minutes with exit code 1. Aggregate median/peak MAE and bias gates passed; the documented 18 km/h per-circuit exceptions at Silverstone and Hungaroring reproduced.
- Long-run quick exited 0, but its generated report verdict is `FAIL`: the fastest race lap is too close to qualifying and two clean-lap variation gates fail.
- Monte Carlo passed once and hit the same fixed 5-second test timeout twice in three executions. No statistical assertion mismatch was observed.
- The non-strict SwiftShader benchmark measured 54.53 FPS for the standard field and 48.88 FPS for 40-car Free Mode.

The baseline is intentionally not described as fully green. Exit codes, report verdicts, timeouts, and flaky timing gates are separate fields in the artifact.

## Calibration and holdout policy

`validate:physics-calibration` reported `fitPerformed: false` and `trackSpecificMultiplierCount: 0`. Calibration/holdout aggregate metrics are retained. The required validator also emitted per-circuit holdout rows, and one such row was accidentally relayed during artifact summarization. `artifacts/holdout-access-log.jsonl` records this disclosure. It must not influence parameter selection; no further per-circuit holdout inspection is allowed before Phase 17.

## Source authority

The current FIA 2026 listing is category 2182, not the older category 110 umbrella page. At the cutoff, the current binding F1 documents were Sporting Issue 08, Technical Issue 20, and Operational Issue 10, all published 2026-08-05 after 2026-08-03 WMSC approval. Technical Issue 20 changes the qualifying recharge floor to 4 MJ, while Sporting Issue 08 limits sub-5-MJ use to four of at most twelve affected competitions.

For SUPER FORMULA, the source freeze includes the consolidated JAF regulations, correction notice 2026-WEB011, Race Championship Bulletin 003-2026, and substitute Round 3 notice 2026-WEB056. JRP and Yokohama pages are explanatory inputs, not binding regulations.

The manifest stores URLs, dates, status, hashes where captured, narrow extracted facts, and licensing-aware cache policy. It does not mirror source documents. FIA-F1-DOC-034, FIA-F1-DOC-058, and FIA-F1-DOC-111 were not publicly available at the cutoff; their delegated event values remain `unavailable` and must not be invented.

## Mechanical inventories

Run:

```bash
node scripts/generate-phase0-audits.mjs
```

The command produces:

- `artifacts/series-scope-baseline.json`
- `artifacts/direct-result-correction-inventory.json`
- `artifacts/agent-decision-inventory.json`
- `artifacts/world-truth-access-audit.json`

These are inventories, not proof that every match is an active authority. Phase 1 and later commits must classify matches before deleting compatibility, UI, validation, or data-provenance uses.
