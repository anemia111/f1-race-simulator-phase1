# Next session: close the straight-against-corner spread

Paste the block below into a fresh session. It is written to be started cold,
and the reason is in the constraints: `physics-calibration.md` forbids changing
a parameter after reading its holdout error.

**The per-circuit holdout errors are deliberately absent. Do not add them.** The
aggregate figures below are the published starting state and are safe to carry;
the per-circuit breakdown is not.

## History of this file

The first version sent a session to close a "+2.5 s mean pace error" by
enforcing the MGU-K energy budget and re-fitting straight-line drag together.
That session measured both premises and found them wrong, which is the right
outcome and the reason this file has been rewritten rather than reused:

- **There is no mean error to close.** The +2.5 s was a twenty-two circuit
  figure dominated by estimated references. On the calibration split the driven
  qualifying deviation is -0.18 s. The problem was always scatter.
- **The budget and the drag are not coupled.** Enforcing the energy budget left
  `validate:speed-trap` bit-identical. The budget lands on the reference lap;
  the speed trap measures driven laps, where deployment already comes from the
  Energy Store and drag from active aero. They share no parameter.

Both are now in the rejected list below so they are not re-derived.

---

F1レースシミュレータの物理較正を続けてほしい。

## 対象

`C:\Users\yuuki\Documents\Codex\2026-07-09\files-mentioned-by-the-user-f1\outputs\f1-race-simulator-phase1`
（React 19 + TS + Vite + Three.js、公開は `npm run publish` で https://anemia111.github.io/ へ）

作業前に `CLAUDE_HANDOFF.md` と `docs/physics-calibration.md` を必読。

## 現状

直前のセッションで2つの構造的欠陥を直して公開済み（PR #17）。

- **MGU-K のエネルギー収支を強制** — アタックラップ許容量 11 MJ（回生上限 7 + ストア 4）を、
  「秒/ジュール」の限界価値で配分する。低速コーナーの立ち上がりから使われ、
  直線の頂点に届く前に尽きる。規則の 2.38 倍 → 許容量の 0.93 倍。
- **リファレンスラップにアクティブエアロを導入** — 単体では天井が動くだけだが、
  天井に届くのにエネルギーが要るようになったことで、
  届けるサーキットだけが届くようになった。

その結果：

| | 前 | 現在 |
|---|---:|---:|
| ピーク速度 MAE | 15.12 | **7.82** km/h |
| ピーク速度の識別幅 | 2.2 | **26.3** km/h（実測 55） |
| 較正 MAE | 1.02 | **1.32** s |
| ホールドアウト MAE | 2.65 | **3.02** s |

**ラップタイムは悪化した状態で本番に出ている。** 埋め合わせていた誤差を
取り除いた結果なので方向は妥当だが、事実として残っている。

## やってほしいこと

**直線対コーナーのばらつきを閉じる。** ピーク速度の識別幅が 26.3 km/h に対し
実測は 55 km/h で、モデルはまだ長い直線と短い直線を十分に区別できていない。
同じ軸でラップタイムの散らばりが残っている。

水準ではなく**散らばり**が対象であることに注意。較正スプリットの平均偏差は
-0.18 秒で、水準はほぼ合っている。

## 制約

- **`docs/physics-calibration.md` の較正ポリシーに従うこと。**
  「サーキット別のラップ合わせをしない」「ホールドアウト誤差を見た後に
  そのパラメータを変えない」。値は較正スプリットだけで決め、
  ホールドアウトは最後に一度だけ測って報告する。
- **自分から先にホールドアウトの個別誤差を見に行かないこと。** 上の集計値は
  公開済みの出発点なので使ってよいが、サーキット別の内訳は見ない。
- 物理的・挙動的な意味が文書化できるパラメータだけを動かす。
- テストの削除や期待値の緩和で回避しない。テストが古い前提を固定している場合は、
  緩めるのではなく新しい根拠に結び直す。
- force push は原則使わない。未コミットの変更を勝手に破棄しない。
- 実装だけで終わらせず、検証・コミット・push・PR 作成・マージ・公開・本番確認まで通す。
- 公開URLにアクセスできない場合は公開完了と報告しない。
- **検証コマンドの終了コードは `| tail` や `| head` に通さず直接取ること。**
  過去に2度これを誤り、失敗を「クリーン」と誤報告している。
- `npm run lint` は `--deny-warnings` を付けていない。自分の検証では
  `npx oxlint --deny-warnings` を使うこと。

## すでに否定済みの仮説（繰り返さないこと）

- **平均 +2.5 秒の水準誤差がある** — ない。較正スプリットの実測では -0.18 秒。
  +2.5 秒は推定リファレンスに引きずられた22サーキットの数字。
- **エネルギー収支と直線抗力は連動している** — しない。収支を強制しても
  `validate:speed-trap` はビット単位で同一。収支はリファレンスラップに、
  speed trap は実走ラップに効く。共有パラメータがない。
- **エネルギー収支でサーキット間のばらつきが説明できる** — 相関しない。
  最もエネルギーを使うサーキットが最も遅い。
- **センターラインのノイズによる直線上の幻コーナー** — 直線長の 1.2〜1.4% しか
  速度制限がかからず、キャップも 256〜298 km/h。racing line の拡幅が吸収済み。
- **`straightAeroDragMultiplier` を 0.56 にする** — 較正スプリットの2つの観測は
  そこで同時に最小になるが、この定数は実走経路と共有されており、
  `validate:speed-trap` の4ゲート中3つが落ちる
  （median MAE 9.73/8、median bias +5.16/±5、peak MAE 8.99/8）。
- **`trackDynamics.buildProfile` にエアロゾーンを入れる** — speed trap の
  median が 7.66 → 8.36 に動いてゲートが落ちる。あれは幾何分類器であって
  フラップの開く場所に依存してはいけない。

## 検証コマンドについての注意

```bash
npm run validate:speed-trap
```

**このコマンドは master でも exit 1 する。** 集計ゲート4項目は通るが、
Silverstone と Hungaroring のサーキット別許容幅（18 km/h）超過が残っているため。
「通っている」と言えるのは集計4項目だけ。新しいサーキット別失敗を
増やしていないかで判断すること。

```bash
npm run validate:physics-calibration
```

`fitPerformed: false` と `trackSpecificMultiplierCount: 0` が保たれていることを
毎回確認すること。どちらかが変わったら較正ポリシーを破っている。

## そのほか未解決のもの

- **ローカルイエロー時の順位保持** — どこにも強制がなくソルバの副産物。設計変更が要る。
- **検証18ドメイン中16に観測データなし**（加速・制動・コーナー最低速度など）。
- **playtest の `inspectSeriesModes` が30秒待ちで散発的に落ちる** — 同一ビルドで
  落ちたり通ったりする。公開のたびに1回捨てて再実行する運用になっている。
- **`npm run lint` が `--deny-warnings` を付けていない** — 公開ゲートが警告を通す。
