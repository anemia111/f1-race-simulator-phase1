# 統合版の公開確認（2026-10-17）

公開URL: https://anemia111.github.io/?release=a5ead34
公開リポジトリのコミット: a5ead34
リリースID: 20261017T060437Z
ソース基点: 0ae1525-working（ソースリポジトリはコミット・pushしていない）
公開サイトのbuildId: 20261017T060437Z-2026-10-17T06:05:23.145Z

ユーザーの「公開して」により、直前までのローカル限定指示を今回の公開に限って更新した。生成済みPWAを既存GitHub Pagesリポジトリに配信し、公開release.json / build-info.jsonとの一致を確認。デスクトップのF1 Race Simulatorショートカットも今回の公開版へ更新した。

公開内容は、現行F1/SFとWEC・SUPER GT・KYOJO・INDYCAR実行機能の統合、テレメトリー比較とCSV、MapとCinematicの連続描画、2026 F1メンバー・回収マシン情報、PWAの画面更新通知。

## 公開チェック

npm run publish -- -SkipFullTestSuite が成功した。lint、TypeScriptを含むproduction build、通常のブラウザーplaytestを実行し、desktop / desktop-compact両方のピット指示完了、SFの4セクター表示、40台Free Mode完走とChampionship保存状態の維持、6カテゴリーのメニューを確認した。最終ログは outputs/integrated-publish-final-20261017.log、構造化結果は integrated-publish-final-playtest/results.json。

初回のbrowser playtestはピット待機が21秒で不足して失敗した。固定ステップの処理が指定60xを実時間で保証しないため、実際の完了判定を維持して最大待機を120秒へ延長した。2回目ではピットとFree Modeは成功したが、旧テストのカテゴリー期待値が2種類だったため失敗した。現行の6種類へ更新し、最終の通し実行が成功した。シミュレーション本体は今回の公開作業では変更していない。

全テストスイートには既知の失敗・長時間試験が残る。今回の全スイート試行は途中で中止し、全件合格とはしていない。以前の失敗/未完走の記録は physics-full-tests-status.json、今回の中止は integrated-publish-20261017.log。関連142テストと最終motion 14テストの成功、および公開ブラウザー確認を根拠とするプレビュー公開。フォトリアル品質や常時1080p60fpsの全面達成を示すものではない。

## 公開サイト上での再確認

新規ブラウザーセッションで実サイトを操作し、F1テレメトリー履歴・4チャンネル群・CSVダウンロード、WEC35台・SUPER GT43台・KYOJO18台・Indy25台の時計進行とテレメトリー履歴、F1鈴鹿Cinematic Onboardへの復帰を確認。ページ例外は0。台数は選択したイベントのもの。結果・スクリーンショット・CSVは outputs/integrated-public-qa/。

既存のin-appブラウザーでも古いキャッシュから更新し、6カテゴリーと復元したサイドバー・実データを伴うテレメトリーの表示を確認した。保存されていたMADRINGの観戦状態は維持されていた。公開版のタブをユーザー向けに残した。
