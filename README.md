# AI Ensemble — ECHO v1.3.5

**Evaluation, Comparison & Hallucination Observation**

AI Ensemble — ECHO は、複数のAI回答を並べて、人間が差異・誤認・ハルシネーションの可能性を観察・検証するためのデスクトップツールです。**どのAIが正しいかを自動判定するツールではなく、回答を自動的に「ハルシネーション」と認定するものでもありません。**

同じ質問を複数の生成AIプロバイダへ送り、回答を横並びで比較できます。開発、調査、文章作成、アイデア検討などにおける人間の判断補助を目的としています。

[English README](README.en.md)

**AI Ensemble はコンセンサス・エンジンではありません。**  
AIの回答、参照条件、AI間参照の来歴を見える状態に保ち、最終的な評価は人間が行います。

## 対応AIプロバイダ

現在、以下9社の組み込みプロバイダへ送信できます。

- OpenAI / ChatGPT
- Anthropic / Claude
- DeepSeek
- Moonshot AI / Kimi
- Google / Gemini
- Alibaba Cloud Model Studio / Qwen
- Mistral AI
- Cohere
- xAI / Grok

利用するプロバイダごとに、自分のAPIキーが必要です。すべてを設定する必要はありません。
APIキーはRustバックエンドからOSの資格情報ストア（Windows Credential Manager / macOS Keychain）へ保存され、フロントエンドへ平文キーを戻しません。

### Custom Provider（β）

v1.3.5では、9社の組み込みプロバイダに加え、**OpenAI互換 Chat Completions API** を持つエンドポイントをCustom Providerとして追加できます。LM Studio、OpenAI互換モードのOllama、vLLM、Open WebUI、その他の互換ゲートウェイなどを想定しています。

Custom Providerはβ機能です。Claude公式APIやGemini公式APIなど、OpenAI互換ではない独自API形式をそのまま登録することはできません。ローカルエンドポイントではAPIキー不要の場合があります。リモートサービスでは各サービスのセキュリティ要件に従ってください。

## UI言語

- 日本語 / English / 简体中文 / 한국어
- 初回起動時にOS言語を検出し、日本語・韓国語・簡体字中国語に該当しない場合は英語を使用
- Settingsからいつでも切替可能
- 選択したUI言語はバックアップJSONに含まれ、別PCへの復元時にも引き継がれます

翻訳対象はアプリUIです。質問、AI回答、Context、Conversation、ユーザーが付けた名前などは元の言語を保持します。診断上必要な場合、プロバイダ由来のエラー文を原文のまま表示することがあります。

## 初回起動と利用上の注意

初回起動時にUI言語を選択し、利用上の注意を確認します。開始には次の両方への確認が必要です。

- 「18歳以上です」
- 「上記の注意事項を確認しました」

生年月日や年齢値そのものは保存しません。

AIは、自分自身のモデル名・開発元・プロバイダ・参照元を誤認することがあります。ECHOでは生成文中の自己申告よりも、アプリが保持するProvider / Modelのルーティング情報を優先して表示します。

AI間Handoffは**人間が承認した1ホップのみ**です。自律的・反復的なAI-to-AIチェーンは作成しません。

## 主な機能

### 質問と回答比較

- 選択した複数AIへ並列送信し、ストリーミング表示
- AIターゲットをポインタ操作または左右ボタンで並べ替え、順序を保存
- プロバイダごとのモデル選択とモデル一覧取得
- 横スクロール可能なAIターゲット一覧
- 回答カラム幅の変更
- 上下の横スクロールナビゲーション同期
- ウィンドウ幅を使う可変レイアウト
- ネイティブ全画面 / 通常ウィンドウ切替
- 長い画面から戻る `↑ Top` ボタン

### Delta Protocol（実験機能・任意ON）

v1.3.5には、**Delta Protocolの実験的な解析サイドカー**が含まれています。初期状態はOFFで、OFFのままなら従来のECHO送受信動作は変わりません。

Delta解析は、先に保存されたConversationを対象にします。

- 保存済みAI回答を構造化された中間表現（IR）へ変換
- 主張を比較し、一致だけでなく不一致・未解決状態も保持
- provenance、Relations、Dissent、Counterpositions等を確認
- Humanによる明示的な最終Resolutionと履歴保存
- 現在利用可能なモデルから1つをDelta処理AIとして選択し、Translator / Comparatorに使用

Delta解析はConversationの正本を置き換えたり書き換えたりしません。解析が失敗またはpartialになっても、元のAI回答は保持されます。実験機能のため、将来のリリースでUIや保存形式が変更される可能性があります。

### Conversation / Observation

- Turn単位のConversation Log
- 並列回答比較
- Turn検索・フィルタ
- 人間が付けるObservationマーカー
- 最新回答または保存済み通常回答から他AIへの1ホップHandoff
- AI間参照のprovenance記録
- Context Reload境界と会話履歴リセット

「他AIへ送る」は元回答全文をReferenceとして渡します。ただし、受信側AIがそのReferenceを正確に読み、引用し、従うことをECHOは保証しません。結果は必ず人間が確認してください。

### Context

- InstructionとReferenceを分離
- Context Setの作成・複製・切替
- Context Library / Project管理
- Conversation単位のContext境界
- AI回答をReferenceへ追加
- Context上限の概算と警告
- Context Reload時に履歴維持 / 境界作成 / 履歴リセットを選択

インポートした会話はArchive候補であり、自動的に有効Contextにはなりません。Context上限を超えても、ユーザーの内容を勝手に削除・要約しません。永続Context、Context Set、Context Library、ProjectはSQLiteを正本として扱います。

Archiveに保存しただけではAIへ送信されません。AIへ渡すには、ArchiveからContext Libraryへ追加し、Context SetのReferenceとして設定し、そのSetを対象Conversationで有効化する必要があります。

### Archive / Import

- 一般JSON / Markdown / Text
- ChatGPT export adapter
- Claude export adapter
- Adapter Registry
- Import内容を確認してから選択した素材をContextへ追加

### Usage / Cost

- SQLiteベースのUsage履歴
- Provider / Model別Token使用量
- DeepSeekのcache-aware・適用日ベース価格推定
- 各社公式Usage / Billingページへのリンク
- ローカル推定額と公式請求額を明確に分離
- 表示通貨: USD / JPY / EUR / GBP / CNY / KRW
- プロバイダ価格は内部ではUSD基準を保持し、非USD表示はユーザー設定の手動為替レートを使用

API応答だけでは無料枠・契約プラン・最終請求条件を判断できないプロバイダについて、ECHOは確定請求額として表示しません。最終的な利用量・残高・請求は各プロバイダの公式画面で確認してください。

### データ移行 / バックアップ

Settings →「会話ログ / 個人設定をエクスポート」から、Conversation、AI回答、Context、Project、Import Archive、Usage、Text Pad、表示設定を1つのJSONへ保存できます。保存先はOSのDownloadsフォルダです。

エクスポートにはOS資格情報ストアのAPIキー、APIキー保存状態フラグ、入力途中のAPIキードラフトは含まれません。ただしConversationやContext本文にユーザー自身が秘密情報を書いた場合、その文字列をECHOが自動検出・除去することはありません。共有前に内容と送付先を確認してください。

復元は現在のConversation、回答、Context、Project、Archive、Usage、Text Pad、個人設定をファイル内容で置き換えます。事前に確認ダイアログを表示し、SQLite更新途中で失敗した場合はロールバックします。APIキーは復元対象ではありません。

## データフロー

- 質問、有効Context、必要な会話履歴はユーザー端末から選択したAIプロバイダのAPIへ直接送信
- ECHO運営者の中継サーバーは使用しない
- APIキーはOS資格情報ストアに保存し、UIへ再表示しない
- Conversation、Context、Usage履歴は端末ローカルに保存
- プロバイダ側の保持・学習利用・データ処理は、ユーザーの契約、設定、各社規約に従う

## 業務利用

所属組織のルールと各AIプロバイダとの契約・データ設定に従ってください。外部AIサービスで処理してよい情報だけを入力してください。個人情報や機密情報は必要最小限にし、必要に応じて匿名化・マスキングを検討してください。

生成内容には誤りや推測が含まれる可能性があります。重要な判断では一次情報と人間の確認が必要です。

## 現在の制限

- 独立開発ソフトウェアであり、動作、生成内容、外部AIサービスの継続提供を保証しません
- プロバイダ側のモデル変更・提供終了で一時的に送信できなくなる場合があります
- 1社の送信失敗は他社への送信を停止しません
- GrokはAPIキーを設定できても、一般に残高または課金設定が必要です
- Cohere Evaluation Keyは評価・試用用途を前提とするため、本番利用では契約条件を確認してください
- 自動アップデーターはありません。新バージョンは手動でインストールします
- アンインストール後もOS資格情報ストアのAPIキーやローカルデータが残る場合があります
- Restoreは現在データを置き換えます。事前にExportしてください
- 為替レートは自動取得しません。非USD表示は手動設定です
- Delta Protocolは実験機能です。解析結果そのものを真実・最終結論として扱わないでください

## 技術スタック

- Tauri 2
- React
- TypeScript
- Rust
- SQLite

## 開発

必要環境: Node.js 20+、npm、stable Rust toolchain、Tauri 2のWindows前提環境。

```bash
npm ci
npm run verify
npm run tauri:dev
```

Windowsインストーラ:

```bash
npm run tauri:build
```

このコマンドはNSISインストーラを生成します。Release pipelineではRustビルドパスの匿名化、release symbolのstrip、最終exe内のユーザー情報・既知APIキーパターン・意図しないConsole subsystemを検査します。検証に失敗したbuildは配布しないでください。

典型的な出力先:

```text
src-tauri/target/release/bundle/nsis/
```

OSS公開前にはWindowsで `RUN_OSS_RELEASE_CHECK.bat` を実行します。frontend verification、dependency audit、`Cargo.lock`、Rust format/test/Clippy、NSIS build、exe inspectionを実行します。

Release Gateが成功すると、その時点の `package.json` のバージョンを使って、プロジェクトルートへ監査用ソースZIPを生成します。v1.3.5では次の名前です。

```text
AI-Ensemble-ECHO-v1.3.5-OSS-VERIFIED-SOURCE.zip
```

このファイル名はRelease Gate通過後の正式な監査用ソースアーカイブ名です。作業中のPUBLIC-CANDIDATE ZIP名とは別です。

最終検証はWindows実機でtypecheck / build / `tauri:dev` を通した後、新規生成したinstallerを実際にインストールして起動確認します。

### macOS試験ビルド

GitHub Actionsの `Build macOS Trial` workflow、またはMac上の `npm run tauri:build` で `.app` / `.dmg` を生成できます。試験buildはad-hoc signingで、Apple notarization済みではありません。正式配布にはDeveloper ID署名とnotarizationが必要です。

1024px以下ではsidebarをoverlay化し、AI選択 / 回答カラムを横スワイプできます。これは狭幅・タッチ対応のmacOSアプリ挙動であり、native iPadOS / Androidアプリではありません。

## Design boundaries

- Comparison Aid ≠ Comparison Conclusion
- Search Aid ≠ Relevance Judgment
- Navigation ≠ Reordering
- Estimated Cost ≠ Billed Cost
- Registered Provider ≠ Usable Provider
- Reference sent ≠ Reference followed
- AI-Referenced Observation ≠ Independent Observation

## 次の候補

- 简体中文 / 한국어の継続レビューと、繁體中文・スペイン語・ブラジルポルトガル語等の検討
- Android向けcredential storage / file I/O / layoutの抽象化
- iOS版（Mac / Xcode / Apple署名環境が必要）
- アプリ状態ハブの段階的分割
- Provider固有reasoning / state境界の明確化
- Provider model / API変更に対する互換性テスト強化
- Custom Provider互換性とローカルモデル連携の拡張
- 署名・自動更新・正式release workflowの改善

## Contributing / Security

Contribution前に [CONTRIBUTING.md](CONTRIBUTING.md) を確認してください。
脆弱性や資格情報関連の問題は公開Issueに書かず、[SECURITY.md](SECURITY.md) のprivate reporting手順を利用してください。

関連文書:

- [CHANGELOG.md](CHANGELOG.md)
- [ROADMAP.md](ROADMAP.md)
- [PRICING_SOURCES.md](PRICING_SOURCES.md)
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

## ライセンス

Copyright 2026 AI Ensemble contributors.

[Apache License 2.0](LICENSE) に基づき公開します。第三者依存関係のライセンス一覧は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) を参照してください。

各プロバイダ名・製品名の権利はそれぞれの権利者に帰属します。AI Ensembleは記載されたAIプロバイダと提携・承認関係にありません。詳細は [TRADEMARKS.md](TRADEMARKS.md) を参照してください。
