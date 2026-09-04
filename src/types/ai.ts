// AI Ensemble — Provider Interface (v0.1)
// 初期案とレビューを反映した、差し替え可能なProvider向けの最小型定義。
// ここが「AIを差し替え可能にする」ためのコアコントラクト。
// OpenAI/Anthropic固有の実装詳細は、この型の外(Adapter内部)に閉じ込める。

export type ProviderId =
  | "openai"
  | "anthropic"
  | "xai"
  | "deepseek"
  | "kimi"
  | "google"
  | "qwen"
  | "mistral"
  | "cohere";

export type ApiMode = "chat_completions" | "responses" | "messages";
export type CapabilitySource = "provider_metadata" | "curated" | "inferred" | "unknown";
export type PerformanceClass = "frontier" | "balanced" | "fast" | "unknown";

export interface ModelCapabilities {
  streaming: boolean;
  vision: boolean;
  tools: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  maxContextTokens?: number;

  /** API surfaces the model is known or inferred to support. */
  apiModes: ApiMode[];
  /** API surface this app would prefer once an adapter exists. */
  preferredApiMode?: ApiMode;
  /** Whether the current AI Ensemble adapter can execute this model right now. */
  availableNow: boolean;
  /** Human-readable reason when the model is not executable yet. */
  unavailableReason?: string;
  /** Where the capability metadata came from. */
  source: CapabilitySource;
  /** Broad operational tier used by recommendation without parsing model names. */
  performanceClass: PerformanceClass;
}

export interface AIModel {
  id: string; // provider固有のモデルID (例: "gpt-4o", "claude-sonnet-4-6")
  // [Phase CP-1 MVP] Custom Providerを許容するためProviderIdからstringへ拡張。
  // ProviderIdはstringのサブタイプなので既存9社の利用箇所には影響しない
  // (`m.provider === slot.key`等の等価比較のみで、網羅的なswitchは無いことを確認済み)。
  provider: string;
  name: string; // UI表示名
  capabilities: ModelCapabilities;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: AIModel;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** [Phase 1継続] stream_runsテーブルへの永続化のため、呼び出し元の文脈をRust側へ伝える。
   *  会話に属さない一時的な送信(コスト見積り等)ではundefinedのままでよい。 */
  conversationId?: string;
  slotId?: string;
  /** [Phase 1継続 項目3/4] orchestrator.tsが発行するID。Rust側stream_runsのPKと一致させ、
   *  個別キャンセル(cancel_stream_run)の対象指定に使う。 */
  requestId?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  truncated?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

// 一括質問モードで使う、モデル単位の状態管理 (仕様書 §25 エラー処理)
export type RequestStatus =
  | "idle"
  | "sending"
  | "streaming"
  | "completed"
  | "error"
  | "cancelled";

export interface AIProvider {
  // [Phase CP-1 MVP] Custom Providerを許容するためProviderIdからstringへ拡張。
  readonly id: string;
  readonly name: string;

  listModels(): Promise<AIModel[]>;

  chat(request: ChatRequest): Promise<ChatResponse>;

  stream(
    request: ChatRequest,
    onToken: (token: string) => void
  ): Promise<ChatResponse>;
}
