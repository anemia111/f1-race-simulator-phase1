# Next session: close the pace error

Paste the block below into a fresh session. It is written to be started cold,
and the reason for that is in the constraints: `physics-calibration.md` forbids
changing a parameter after reading its holdout error, and the session that
found this work read the holdout repeatedly. Starting clean is what makes the
next calibration admissible.

**The per-circuit holdout errors are deliberately absent from the prompt.** Do
not add them.

---

F1レースシミュレータの物理較正をやり直してほしい。

## 対象

`C:\Users\yuuki\Documents\Codex\2026-07-09\files-mentioned-by-the-user-f1\outputs\f1-race-simulator-phase1`
（React 19 + TS + Vite + Three.js、公開は `npm run publish` で https://anemia111.github.io/ へ）

作業前に `CLAUDE_HANDOFF.md` と `docs/physics-calibration.md` を必読。

## やってほしいこと

シミュレートされた予選ペースが、実測リファレンスに対して平均 +2.5 秒速い。
これを、以下の2つを**同時に**較正して閉じてほしい。片方だけでは反対側に振れる。

1. **MGU-K の1周エネルギー収支の強制**
   `validate:physics-calibration` の `deployment-energy-budget` ドメインを見ると、
   リファレンスラップは規則の 2.38 倍（14〜20 MJ 対 予選上限 7 MJ）を使っている。
   `REFERENCE_DEPLOYMENT_POLICY` 自身が「ライブのシミュレーションは Energy Store が
   許可した電力を渡さなければならない」と書いているが、`qualifying.ts` は
   カテゴリ上限をそのまま渡している。
   予算をどこで使うかの規則が要る（実際のドライバーは低速コーナーの立ち上がりに使い、
   均等には使わない）。

2. **直線抗力の再較正**
   1 を入れると全ラップが遅くなるので、`validate:speed-trap` の集計ゲート4項目が
   崩れる。現在は通っている（median MAE 7.66 / bias −1.08 / peak MAE 7.64 / bias −3.10）。
   関係するのは `straightAeroDragMultiplier`、トウ上限、セットアップ抗力レンジ、
   FIA 速度依存 MGU-K ランプ。直近の PR #11 にそれぞれの物理的根拠が書いてある。

## 制約

- **`docs/physics-calibration.md` の較正ポリシーに従うこと。**
  とくに「サーキット別のラップ合わせをしない」「ホールドアウト誤差を見た後に
  そのパラメータを変えない」。値は較正スプリットだけで決め、ホールドアウトは
  最後に一度だけ測って報告する。
- 前セッションはホールドアウトを繰り返し読んでしまったため、意図的にこのプロンプトには
  サーキット別の誤差を載せていない。**自分から先にホールドアウトを見に行かないこと。**
- 物理的・挙動的な意味が文書化できるパラメータだけを動かす。
- テストの削除や期待値の緩和で回避しない。テストが古い前提を固定している場合は、
  緩めるのではなく新しい根拠に結び直す。
- force push は原則使わない。未コミットの変更を勝手に破棄しない。
- 実装だけで終わらせず、検証・コミット・push・PR 作成・マージ・公開・本番確認まで通す。
- 公開URLにアクセスできない場合は公開完了と報告しない。
- 検証コマンドの終了コードは `| tail` や `| head` に通さず直接取ること。
  前セッションでこれを誤り、lint 失敗を「クリーン」と誤報告した。
- `npm run lint` は `--deny-warnings` を付けていない。自分の検証では
  `npx oxlint --deny-warnings` を使うこと。

## すでに否定済みの仮説（繰り返さないこと）

- **センターラインのノイズによる直線上の幻コーナー** — 直線長の 1.2〜1.4% しか
  速度制限がかからず、キャップも 256〜298 km/h。racing line の拡幅がノイズを吸収済み。
- **エネルギー収支でサーキット間のばらつきが説明できる** — 相関しない。
  最もエネルギーを使うサーキットが最も遅い。収支は平均のずれには効くが、
  ばらつきの軸には効かない。

## 未解決のまま残しているもの

- **サーキット間のばらつき（直線対コーナーの軸）** — 原因未特定。上の2件は否定済み。
  リファレンスラップにアクティブエアロが入っていない件は
  ブランチ `investigate/reference-lap-active-aero`（`1432e81`、未マージ）にある。
  ピーク速度誤差は 15.12 → 8.24 km/h に改善するが、ラップタイムのホールドアウトは
  2.65 → 3.06 秒に悪化する。マージするかは未判断。
- **ローカルイエロー時の順位保持** — どこにも強制がなくソルバの副産物。設計変更が要る。
- **検証18ドメイン中16に観測データなし**（加速・制動・コーナー最低速度など）。

## 検証コマンド

```bash
npm run validate:physics-calibration
```

```bash
npm run validate:speed-trap
```
