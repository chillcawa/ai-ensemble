// AI Ensemble — Provider Interface (v0.1)
// チャッピー案 + クラウ補足(capabilities先入れ)を反映した最小型定義。
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
  provider: ProviderId;
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
  readonly id: ProviderId;
  readonly name: string;

  listModels(): Promise<AIModel[]>;

  chat(request: ChatRequest): Promise<ChatResponse>;

  stream(
    request: ChatRequest,
    onToken: (token: string) => void
  ): Promise<ChatResponse>;
}
