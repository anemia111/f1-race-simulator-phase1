# 鈴鹿 Cinematic View 実装・検証報告

2026-10-16。基準コミット：`0ae1525795996f781fa52d313616989d633b26ba`。

## 判定

動作する独立Cinematic Viewを実装し、Intel Iris Xe / Direct3D 11で描画・GPU時間を測定した。ただし、**要求されたフォトリアルPhase 1は未完了**。現状はライセンス付き独立コンセプト車両と推定景観を含む再構築プレビューである。実車モデル・実測施設・実写較正の完成とは扱わない。公開ゲートも未通過で、公開サイトは更新していない。

## 実装した内容

- 従来のOverview Mapを残し、独立したlazy描画レイヤー、スナップショットの読み取り専用補間、SIM/HIST/LIVEとカテゴリーの境界を実装した。
- Qvist_designs氏の2026 F1コンセプト（CC BY 4.0）を採用し、出典・改変を表示。APEX/filan214派生アセットの固定コミットとSHA-256を検証し、独立した加工スクリプトで3段階LOD（約9.3万／2.7万／0.75万triangle）、メートル変換、車輪pivot、翼の分離、Meshopt圧縮・量子化を実施した。GLBは732,312 bytes。翼、ノーズ、サイドポッド、フロア、Halo、コックピット、サスペンション、タイヤを含み、独自リム・ブレーキ補助GLBを併用。チームの色パレットを適用した。各チームの実車CAD・正式リバリーではない。
- 車輪回転、曲率から推定したステアリング、推定ピッチ・ロール、既存の前後翼アクティブエアロ状態、ピット状態、雨天状態のレインライトを接続した。順位・タイム・物理状態を書き換えない。
- 鈴鹿の既存中心線を5,807mの宣言周長へ変換し、96点の既存GSI標高プロファイルへ接続。路面、白線、縁石、芝・グラベル、バリア・フェンス、ピット表示、立体交差、ピットビル・スタンド・観覧車を追加した。
- CC0のアスファルト・草地PBR素材、HDR環境、空、接地影、霧、濡れ状態による材質・照明の変更を導入した。
- TV Broadcast、Trackside、Chase、Onboard、Helicopter、Free Camera、全画面表示、High/Medium/Lowを実装した。
- LOD、共有geometry/material、建築・縁石のmesh結合、樹木・バリアのインスタンシング、カリングを適用した。
- 実render頻度、p95フレーム間隔、draw call、triangle、geometry/texture個数、CPU送信時間、ブラウザheap、条件付きGPU timer queryを記録する。GPUメモリの実測値は得ていない。

`src/simulation`、`src/workers`、`src/data`、`src/services`に差分はない。生成されたWorkerのファイル名／ハッシュも既存と同じ`raceWorker-CWRbgfXD.js`である。

## 起動

同梱ソースを展開したディレクトリで：

```powershell
npm ci
npm run dev
```

画面のSettingsでF1の鈴鹿を選択し、SIM・1xにして、マップ内のCinematicを選ぶ。他コース、SF、HIST/LIVE、高速再生では従来のマップへ戻す。

追加コマンド：

```powershell
npm run prepare:cinematic-car
# 補助リム・ブレーキモデルの再生成：npm run generate:cinematic-car
npm run validate:cinematic-assets
npm run build
$env:CINEMATIC_HARDWARE='1'
npm run playtest:cinematic
```

モデル再生成はTypeScript strippingを扱えるNodeが必要。通常起動ではチェックインされたGLBを利用する。

## 性能計測

ソフトウェア描画のSwiftShaderと、実GPUのIntel Iris Xe / D3D11を分けて保存した。実GPUのドライバーは32.0.101.7088。ブラウザviewportは1920×1080。最新の実GPU走行は22台・40台とも全画面で、各シナリオに約1秒の計測窓を10個保存している。Highは1920×1080、Mediumは1632×918、Lowは1286×723の内部描画。

| 車両数 | カメラ | 品質 | 内部解像度 | 平均render fps | 計測窓平均GPU ms |
|---|---|---|---|---:|---:|
| 22 | tv | medium | 1632×918 | 60.01 | 7.28 |
| 22 | trackside | medium | 1632×918 | 60.01 | 8.01 |
| 22 | chase | medium | 1632×918 | 60.04 | 8.43 |
| 22 | onboard | medium | 1632×918 | 60.01 | 5.94 |
| 22 | helicopter | medium | 1632×918 | 60.01 | 4.56 |
| 22 | free | medium | 1632×918 | 60.01 | 5.11 |
| 22 | chase | high | 1920×1080 | 59.07 | 11.78 |
| 22 | chase | low | 1286×723 | 60.03 | 8.27 |
| 40 | chase | low | 1286×723 | 60.01 | 7.91 |
| 40 | chase | medium | 1632×918 | 59.62 | 11.34 |
| 40 | chase | high | 1920×1080 | 56.85 | 14.64 |

最終測定値は上記の表と`cinematic-hardware-qa/results.json`を正本とする。GPU時間は各窓の値を保存し、最終窓だけを全走行平均と呼ばない。

これは短い走行試験であり、全周・全イベント・2時間耐久・全GPUでの60fps保証ではない。品質ごとに同一車両位置・同一時刻へ固定した比較ではないため、設定による性能改善量は算出していない。初期測定には既存テストとの同時実行条件が含まれる。最終カメラ検証では長時間のシミュレーションテストを停止済み。

## 検証結果

| 検証 | 結果 |
|---|---|
| Production build | 成功。既存同様、大きなJS chunkの警告あり |
| Lint | 成功 |
| 描画・座標・標高・観測位置の対象テスト | 8ファイル、34テスト成功 |
| GLB構造検証 | 車両GLB 2個ともerrors 0、warnings 0、info各2。Meshopt拡張内部はvalidator非対応のため、別途実デコード検証 |
| アセット整合性 | 全8アセットのSHA-256とbyte数一致。転送素材合計5,444,913 bytes |
| Cinematic実行試験 | 6カメラ、3品質、22台／40台。画像とJSONを保存。最終実行結果は専用ログ参照 |
| 従来画面playtest | 同時負荷下でピット指示の制限時間判定に一度失敗。負荷分離後の再実行はexit code 0で成功 |
| `npm run publish` | **失敗・公開未完了**。全テストで既存`race.test.ts`の11件失敗を検出 |

全テストは`race.test.ts`（163ケース、11失敗、9skip）の結果が出た後、残りを中断した。全suite成功とは報告しない。短時間で失敗する次の3ケースは、**描画変更を一切含まない基準コミット**の別チェックアウトでも再現した。

1. 路面ラバーの移動・停止・ピット車両計上。
2. フォーメーション省略後に`grid`を期待するが`formation`が返る。
3. VSC距離補正後、速度表示と実移動距離が一致しない。

今回の範囲を守り、これらを直すためのエンジン変更は行っていない。他の失敗をすべて既存不具合と断定したわけではない。未変更コミット比較と公開ログを同梱している。

## 実写比較と品質未達

比較ページ`visual-comparison.html`に、メインストレート周辺の実写と同施設群の独立レンダリングを収録した。写真はBWard 1997氏、2026-05-24撮影、CC BY 4.0。出典とライセンスはページ内に明記した。写真をテクスチャやモデルの抽出に使っていない。

視点は近い施設群を望む推定カメラであり、現地カメラ位置・焦点距離の数値較正は未完了。画素一致率や測量精度は主張しない。比較で次の差を確認した。

- ピット建物の曲面・階層・窓・設備、スタンドの分節と観客が不足。
- 実物のフェンス支柱・張り出し・間隔、観覧車の細かい交差構造が不足。
- 樹木は軽量な推定形状であり、実景の樹種・分布・密度の再現ではない。
- 車体は2025年4月公開の独立コンセプトで、各チームの実車形状、正式リバリー、詳細なコックピットとドライバーは未完成。
- 局所幅・バンク・縁石断面・ピット経路・橋のdeck高・施設座標の実測根拠が不足。
- 周辺地形は道路標高からの補完で、全面DEMメッシュではない。
- 日時に基づく太陽較正、雲の動的影、雨粒・spray・水たまり、pit crew、KTX2圧縮、完全なGPU容量台帳、イベント指向TVディレクター、2時間耐久は未完了。

これらを理由に、フォトリアル完成判定は不合格／保留とする。制作を継続するため、ソース内`docs/cinematic/ASSET_SPEC.md`に、Blender制作・LOD・node/socket・PBR・寸法・Web配布権の具体的契約を保存した。

## 主な証拠

- `cinematic-hardware-qa/`：実GPUの6カメラ・40台のPNG、計測窓付きJSON。
- `cinematic-qa/`：SwiftShaderの結果。実GPU結果と混同しない。
- `cinematic-focused-tests.log`：34テストの結果。
- `cinematic-assets-validation.json`：整合性・デコード・glTF検証。
- `cinematic-baseline-failure-check.log`：未変更コミットでの3アサーション失敗。
- `cinematic-publish.log`：公開ゲート失敗と中断の記録。
- `cinematic-regression.log`／`cinematic-regression-retry.log`：従来画面の失敗と再実行。

公開サイトを更新した成果物ではなく、ローカルで動作する実装と、達成範囲・未達・検証証拠の提出である。

車両モデルの公開ライセンス確認記録は`qvist-license-evidence.json`、加工の固定ソース・変更内容はソース内`public/cinematic/qvist-attribution.txt`と`qvist-preparation.json`に収録した。車体は約1.900m幅、5.394m長、1.055m高に正規化したもので、実車測定値ではない。
