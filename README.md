# AI Ensemble — ECHO v1.3.4

**Evaluation, Comparison & Hallucination Observation**

複数AIの回答を比較し、差異・誤認・ハルシネーションを人間が観測・検証するためのデスクトップツールです。AI Ensemble — ECHO自身が「どのAIが正しいか」「どの回答がハルシネーションか」を自動判定するものではありません。

複数の生成AIへ同じ質問を送り、回答を並べて比較するWindows / macOS向けデスクトップアプリです。
開発、調査、文章検討、アイデア比較などで、人間が判断するための補助を目的としています。

[English README](README.en.md)

**AI EnsembleはConsensus engineではありません。**
どのAIが正しいかを自動判定せず、各回答、参照条件、AI間参照の出所を保持します。

## 対応AI

現在、次の9事業者へ実送信できます。

- OpenAI / ChatGPT
- Anthropic / Claude
- DeepSeek
- Moonshot AI / Kimi
- Google / Gemini
- Alibaba Cloud Model Studio / Qwen
- Mistral AI
- Cohere
- xAI / Grok

利用するAIごとに、ご自身のAPIキーが必要です。すべて設定する必要はありません。
APIキーを保存したAIだけを送信対象として利用できます。

APIキーはRust側からOSのCredential Store（Windows Credential Manager / macOS Keychain）へ保存し、JavaScript側へキー本体を返しません。

## 言語

- 日本語、英語、簡体字中国語、韓国語に対応
- 初期値はOSの言語を自動判定（日本語、韓国語、簡体字中国語環境を判定し、それ以外は英語）
- 設定から「システム設定／日本語／英語／简体中文／한국어」をいつでも切り替え可能
- 言語設定はバックアップJSONにも保存され、別PCへの復元時に引き継がれます

翻訳対象はアプリのUIです。質問、AI回答、Context、Conversation、利用者が付けた名前などの
内容は翻訳せず、原文のまま保持します。Providerから返るエラー文も、診断情報を失わないよう
原文を表示する場合があります。

簡体字中国語と韓国語で未翻訳の低頻度文言は英語へフォールバックします。今後の追加候補は、
繁体字中国語、スペイン語、ブラジルポルトガル語です。ヒンディー語は余裕ができた段階で検討します。

## 主な機能

### 質問と回答比較

- 選択した複数AIへの同時送信とストリーミング表示
- 送信対象AIのPointerドラッグ（マウス／ペン／タッチ）／左右ボタンによる並べ替えと順序保存
- AIごとのモデル選択と公式APIからのモデル一覧更新
- 横スクロール型の送信対象一覧
- 回答カラムの横幅調整
- 上下で同期する回答ナビゲーション
- 通常ウィンドウでも利用可能な横幅全体を使うFluid layout
- ネイティブ全画面表示と通常表示の切り替え

### Conversation / Observation

- Turn単位のConversation Log
- 回答の並列比較
- Turn検索と絞り込み
- 人間によるObservation marker
- 最新回答または過去の通常回答から、他AIへの1ホップHandoff
- AI間参照の出所記録
- Context Reload boundaryと会話履歴のリセット

`他AIへ渡す`では元回答全文をReferenceとして送信します。ただし、受信AIが内容を正確に
読解、引用、反映することまでは保証しません。送信後の回答は人間が確認してください。

### Context

- InstructionとReferenceの分離
- Context Setの作成、複製、切り替え
- Context LibraryとProject管理
- Conversation単位のContext境界
- AI回答をReferenceとして追加
- Context上限の概算と警告
- Context Reload時の「履歴を保持／境界を作成／履歴をリセット」選択

Importした会話はArchive候補であり、自動的にContextへ昇格しません。
Context上限を超える場合も、アプリが内容を自動削除・自動要約することはありません。

Persistent Context、Context Sets、Context Library、ProjectsはSQLiteをsource of truthとします。

### Archive / Import

- Generic JSON / Markdown / Text
- ChatGPT export adapter
- Claude export adapter
- Adapter Registry
- Import内容のArchive確認と、選択した内容だけのContext追加

### Usage / Cost

- SQLiteによるUsage履歴
- Provider／モデル別token usage
- DeepSeekのcache-aware・適用日付き料金推定
- 各AI事業者の公式Usage／Billing画面へのリンク
- ローカル推定額と公式請求額の明確な分離

Gemini、Qwen、Mistral、Cohere、Grokなど、契約・無料枠・モデル条件をAPI応答だけで
確定できないProviderについては、請求額のような断定表示を行いません。最終的な使用量、
無料枠、残高、請求は各事業者の公式画面で確認してください。

### データの移行 / バックアップ

設定の「対話ログ・個人設定を書き出す」から、Conversation、AI回答、Context、Project、
Import Archive、Usage、Text Pad、表示設定を1つのJSONファイルへ書き出せます。
ファイルはOSのダウンロードフォルダへ保存され、Credential Storeに保存したAPIキー、
キー保存状態、入力途中のキードラフトは含まれません。ただし、会話やContext本文へ利用者が
入力したAPIキー等の文字列は自動検出・削除されません。

書き出したファイルには会話やContextなどの機密情報が含まれる可能性があります。
第三者へ送信・共有する前に内容と共有先を確認してください。

「書き出しファイルから復元」では、v0.15.0以降で作成したJSONを選択して別PCなどへ
データを移行できます。復元すると、現在のConversation、回答、Context、Project、Archive、
Usage、Text Pad、個人設定はファイルの内容で全置換されます。実行前に確認画面を表示し、
処理途中で失敗した場合はSQLiteの変更をロールバックします。

Credential StoreのAPIキーは書き出し・復元の対象外です。別PCでは各AIのAPIキーを改めて
設定してください。同じPCで復元する場合、現在保存されているAPIキーは変更されません。

## データの流れ

- 質問、有効なContext、必要な会話履歴は、選択したAI事業者の公式APIへ端末から直接送信されます。
- AI Ensemble独自の中継サーバーや運営者サーバーは使用しません。
- APIキー本体はOSのCredential Storeへ保存され、アプリ画面へ再表示されません。
- Conversation、Context、利用履歴などのアプリデータは端末内へ保存されます。
- 各AI事業者側での保存、学習利用、データ処理は、利用者の契約、プラン、設定、各社規約に従います。

## 業務利用時の注意

所属組織の規程と各AI事業者との契約・データ設定を確認し、外部AIでの処理が許可された
範囲で入力してください。個人情報や機密情報を扱う場合は、目的に必要な範囲へ絞り、
匿名化・マスキングを推奨します。

生成内容は誤りや推測を含む場合があります。重要な判断には原資料の確認と人によるレビューが必要です。

## 現在の制限

- 個人開発のソフトウェアであり、動作、生成内容、外部AIの継続提供を保証するものではありません。
- AI事業者によるモデル変更や提供終了により、一時的に送信できなくなる場合があります。
- あるAIの失敗は、他のAIへの送信を停止しません。
- GrokはAPIキーを設定できますが、通常はプリペイド残高または請求権限が必要です。
- CohereのEvaluation Keyは評価・試用向けです。本番業務では契約条件を確認してください。
- 自動アップデート機能はありません。新しい版は手動でインストールしてください。
- アンインストール後もCredential StoreのAPIキーや端末内データが残る場合があります。
- 復元は現在データを全置換します。実行前に現在のデータも書き出してください。

## Stack

- Tauri 2
- React
- TypeScript
- Rust
- SQLite

## Development

必要環境：Node.js 20以上、npm、stable Rust toolchain、Tauri 2のWindows向け前提環境。

```bash
npm ci
npm run verify
npm run tauri:dev
```

Windows向けインストーラを作成する場合：

```bash
npm run tauri:build
```

このコマンドはNSISのみを生成します。Rustのビルド元パスを匿名化し、release symbolを
除去したうえで、完成したexeにユーザー情報、既知のAPIキーパターン、Console subsystemが
残っていないか自動検査します。検査に失敗した場合は配布しないでください。

通常の生成先：

```text
src-tauri/target/release/bundle/nsis/
```

OSS公開前の一括検査は、Windowsで `RUN_OSS_RELEASE_CHECK.bat` をダブルクリックしてください。
フロント検査、依存監査、`Cargo.lock` 生成、Rust自動整形・test・Clippy、NSISビルドと
完成exeの検査を順番に実行します。生成された `src-tauri/Cargo.lock` はリポジトリへ含めます。
依存監査はproductionのhigh以上と、全依存のcriticalを停止条件にします。開発専用依存の
moderate/high警告も表示されるため、公開前に内容を確認してください。
全工程が通ると、最終監査へ返すための `AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip` も
プロジェクト直下へ生成されます。
一括検査ではWindowsのファイルロックと長いパスを避けるため、Rust生成物を
`%LOCALAPPDATA%\AI-Ensemble-Build\` 以下の短いフォルダへ出し、並列ビルド数を1に
制限します。再実行時は直近のビルドキャッシュを再利用します。検査済みインストーラは
プロジェクト直下の `release-output` へコピーされます。

Windows実機の `typecheck / build / tauri:dev` と、生成されたインストーラでの起動確認を
最終確認環境とします。

### macOS試用版

Macを持っていなくても、GitHub Actionsの `Build macOS Trial` を手動実行すれば、
Apple Silicon版とIntel版のDMGを作成できます。GitHubのActions画面で対象workflowを開き、
`Run workflow` を実行してください。完了後、Artifactsから該当CPU版をダウンロードします。

ローカルのMacで作成する場合：

```bash
npm run tauri:build
```

macOSでは `.app` と `.dmg` を生成します。試用版はad-hoc署名で、Appleの公証は行いません。
初回起動時にmacOSがブロックした場合は、「システム設定」→「プライバシーとセキュリティ」から
利用者自身で起動を許可してください。正式配布にはApple Developer ID署名と公証が必要です。

画面幅1024px以下ではサイドバーをオーバーレイ化し、AI選択・回答カラムを横スワイプできる
タブレット幅レイアウトへ切り替えます。現時点ではmacOSアプリの狭幅・タッチ操作対応であり、
iPadOS / Androidのネイティブ版ではありません。

## Design boundaries

- Comparison Aid ≠ Comparison Conclusion
- Search Aid ≠ Relevance Judgment
- Navigation ≠ Reordering
- Estimated Cost ≠ Billed Cost
- Registered Provider ≠ Usable Provider
- Reference sent ≠ Reference followed
- AI-Referenced Observation ≠ Independent Observation

## Next candidates

- 簡体字中国語・韓国語の翻訳レビューと、繁体字中国語などの追加言語
- Android版に向けたCredential Store、ファイル入出力、画面構成のモバイル抽象化
- iOS版（Mac / Xcode / Apple署名環境が必要）
- App state-hubの段階的な分割と保守性改善
- Provider固有のreasoning／state境界の整理
- 公式モデル変更に対する互換性テストの強化
- ローカルモデル／追加Providerの検討
- 署名、自動アップデート、正式配布フローの検討

## Contributing / Security

開発へ参加する場合は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。脆弱性や認証情報に関わる問題は公開Issueへ書かず、[SECURITY.md](SECURITY.md) の非公開報告手順を使ってください。

変更履歴は [CHANGELOG.md](CHANGELOG.md)、今後の方向性は [ROADMAP.md](ROADMAP.md) にあります。
料金概算の根拠と確認日は [PRICING_SOURCES.md](PRICING_SOURCES.md) に記録しています。
公開タグを作る前に [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) の全項目を確認してください。

## License

Copyright 2026 AI Ensemble contributors.

Apache License 2.0で公開します。全文は [LICENSE](LICENSE) を参照してください。AI事業者名・製品名は各権利者に帰属し、AI Ensembleはいずれの事業者からも承認・後援を受けたプロジェクトではありません。詳しくは [TRADEMARKS.md](TRADEMARKS.md) を参照してください。
