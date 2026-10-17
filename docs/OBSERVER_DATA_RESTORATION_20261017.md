> 追加調査による訂正: 10月10日の別作業フォルダにWEC/GT/KYOJO/INDYCARの旧実装とマシン情報が存在した。43仕様と関連7ファイルを回収済み。詳しくはMACHINE_DATA_RECOVERY_20261017.mdを参照。

# 観戦メニューとカテゴリー別データの復元

2026-10-17 / ローカル反映。公開・pushは実施していない。

## 確認した原因

このリポジトリの既存履歴 b213aaa でTelemetry / Track / Tyres / Messages /
Drivers / Seasonが削除され、Dataだけになっていた。今回のF1メンバー更新で
消したものではない。F2/F3は3c1f971で実行カテゴリーから外されていた。
調査したローカルファイル・コミット件名からWEC/GT/KYOJO/INDYCARの旧実装は
確認できなかったため、これらは公式情報に基づくデータ閲覧として追加した。

## 実装

左メニューにTelemetry、Track、Tyres、Messages、Drivers、Season、Mapを復元。
Telemetryは全車の速度・スロットル・ブレーキ・ギア・RPM・F1のSOCなどを表示。
SIM/OBS/UNAVAILABLEを区別し、SUPER FORMULAにF1のSOCを表示しない。
Trackはコースと気象、Tyresは現在のタイヤ情報、Messagesはレースコントロール、
Driversは出走車情報、SeasonはローカルSIMの選手・チームポイントを表示。
過去の画面をそのまま戻すのではなく、現在のカテゴリ別データ構造に対応した。
旧タイヤスティント棒グラフの復元は今回含まない。

Categoriesメニューから下記9区分を閲覧できる。検索・出典リンク・資料日付を表示。
カテゴリー閲覧を切り替えてもレースエンジンのカテゴリーや状態を変更しない。

|カテゴリー|登録単位数|データの扱い|
|---|---:|---|
|F1|22|現在の標準登録データ|
|SUPER FORMULA|24|現在の標準登録データ|
|F2|22|保存済み2026-07-29の履歴データ|
|F3|30|保存済み2026-07-29の履歴データ|
|SUPER GT GT500|14|公式2026シリーズエントリー|
|SUPER GT GT300|29|公式2026シリーズエントリー|
|WEC|35|公式2026グリッドと各車両詳細|
|KYOJO CUP|20|公式2026プロフィール掲載者|
|INDYCAR|33|公式2026ドライバー一覧・スポット参戦を含む|

WEC/GTの単位は車両・クルー、KYOJO/INDYCARは掲載プロフィール単位。
公式ページ掲載の全員が全戦出走することを意味しない。KYOJOの独立したチーム名や
INDYCARの車種など取得していない項目は空欄とし、マシン名から推測していない。
F2/F3は最新の公式出走者一覧として扱わない。能力値は編集・推定データ。

## 出典・取り扱い

- SUPER GT: https://supergt.net/teams_and_drivers?gt_class=gt500&series=2026
- SUPER GT GT300: https://supergt.net/teams_and_drivers?gt_class=gt300&series=2026
- WEC: https://www.fiawec.com/en/page/grid および各2026車両詳細ページ
- KYOJO: https://kyojocup.jp/profile/ および各2026プロフィール
- INDYCAR: https://www.indycar.com/Drivers

確認日は2026-10-17。氏名・番号・所属・車両など事実項目を抽出・正規化した。
画像・ロゴ・写真・紹介本文は転用していない。公式ページの著作権は各運営者に帰属し、
本作業がサイト素材の包括的利用許諾を取得したという意味ではない。
scripts/import-category-catalog.pyで取得処理を保存。BeautifulSoup4が必要。
HTML原本は作業領域work/catalog-source-cacheに保持し、ハッシュを
outputs/category-catalog-source-manifest.jsonに保存。

## 検証

関連6ファイル52テスト成功。Lintと本番ビルド成功。
実ブラウザで8つの観戦画面、9カテゴリー全件数、ドライバー検索を検証。
F1 22台とSF24台のテレメトリーを確認。SFのF1 SOC非表示とcontrol tyre表示を確認。
1280×720でメニュー・設定ボタンが操作可能で、ページエラーは0件。
全テストスイート・実ネットワークのHIST/LIVE動作は今回未検証。
スクリーンショットと結果はoutputs/sidebar-restoration/に保存。
