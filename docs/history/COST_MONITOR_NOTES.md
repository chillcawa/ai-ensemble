# Usage / Cost Monitor v0.4

## 変更点

- SQLite (`rusqlite`, bundled) を導入
- アプリ起動時に `ai_ensemble.db` と `usage_records` テーブルを自動作成
- ChatGPT / Claude の成功したAPIリクエストをRust側で自動記録
- Streaming / non-streaming の両方を記録
- input/output tokens、推定USDコスト、経過時間を保存
- 「今日」「累計」「AI別累計」をUI表示
- 直近20件の履歴を表示
- 使用量履歴の全削除ボタンを追加

## DB保存場所

Tauriの `app_data_dir` 配下に `ai_ensemble.db` を作成する。
OSごとの具体的パスはTauriのApp Data Directoryに従う。

## 注意

表示される円換算は現在のMVP仕様どおり 1 USD = 150 JPY 固定の概算。
API事業者側の実請求額とは一致しない場合がある。

## 次の候補

- 月別集計
- モデル別集計
- 料金表の設定化
- 為替の自動/手動切替
- 会話履歴のSQLite保存
- Project / ContextのSQLite保存
