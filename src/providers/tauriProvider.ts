import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AIModel,
  AIProvider,
  ChatRequest,
  ChatResponse,
  ProviderId,
  ApiMode,
  CapabilitySource,
  PerformanceClass,
} from "../types/ai";

// Web版のOpenAIProvider/AnthropicProviderと違い、これはAPIキーを一切持たない。
// キーの保存・読み出し・実際のHTTP通信はすべてRust側(src-tauri)に閉じている。
// JS側はTauriコマンドを呼ぶだけの薄いラッパー。

interface StreamTokenEvent {
  requestId: string;
  token: string;
}

let listenerPromise: Promise<UnlistenFn> | null = null;
const pendingStreams = new Map<string, (token: string) => void>();

function ensureListener() {
  if (listenerPromise) return listenerPromise;
  listenerPromise = listen<StreamTokenEvent>("stream-token", (event) => {
    const handler = pendingStreams.get(event.payload.requestId);
    if (handler) handler(event.payload.token);
  });
  return listenerPromise;
}

function newRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class TauriProvider implements AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  private modelCatalog: AIModel[];

  constructor(id: ProviderId, name: string, modelCatalog: AIModel[]) {
    this.id = id;
    this.name = name;
    this.modelCatalog = modelCatalog;
  }

  async listModels(): Promise<AIModel[]> {
    return this.modelCatalog;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await invoke<{
      content: string;
      model: string;
      input_tokens?: number;
      output_tokens?: number;
      cost_usd?: number;
      truncated?: boolean;
    }>("chat_completion", {
      provider: this.id,
      model: request.model.id,
      messages: request.messages,
      maxTokens: request.maxOutputTokens,
      temperature: request.temperature,
      apiMode: request.model.capabilities.preferredApiMode,
    });

    return {
      content: res.content,
      model: res.model,
      truncated: res.truncated,
      usage: {
        inputTokens: res.input_tokens,
        outputTokens: res.output_tokens,
        costUsd: res.cost_usd,
      },
    };
  }

  async stream(
    request: ChatRequest,
    onToken: (token: string) => void
  ): Promise<ChatResponse> {
    await ensureListener();
    const requestId = newRequestId();
    pendingStreams.set(requestId, onToken);

    try {
      const res = await invoke<{
        content: string;
        model: string;
        input_tokens?: number;
        output_tokens?: number;
        cost_usd?: number;
        truncated?: boolean;
      }>("stream_chat_completion", {
        requestId,
        provider: this.id,
        model: request.model.id,
        messages: request.messages,
        maxTokens: request.maxOutputTokens,
        temperature: request.temperature,
        apiMode: request.model.capabilities.preferredApiMode,
      });
      return {
        content: res.content,
        model: res.model,
        truncated: res.truncated,
        usage: {
          inputTokens: res.input_tokens,
          outputTokens: res.output_tokens,
          costUsd: res.cost_usd,
        },
      };
    } finally {
      pendingStreams.delete(requestId);
    }
  }
}

// --- APIキー管理 (Rust側keyringを呼ぶだけ。キー本体はJSに一切戻ってこない) ---

export async function saveApiKey(provider: ProviderId, key: string): Promise<void> {
  await invoke("save_api_key", { provider, key });
}

export async function hasApiKey(provider: ProviderId): Promise<boolean> {
  return invoke<boolean>("has_api_key", { provider });
}

export async function deleteApiKey(provider: ProviderId): Promise<void> {
  await invoke("delete_api_key", { provider });
}

export interface AvailableModelInfo {
  id: string;
  name: string;
  maxContextTokens?: number;
  apiModes: ApiMode[];
  preferredApiMode?: ApiMode;
  streaming: boolean;
  vision: boolean;
  tools: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  availableNow: boolean;
  unavailableReason?: string;
  capabilitySource: CapabilitySource;
  performanceClass: PerformanceClass;
}

export async function listAvailableModels(provider: ProviderId): Promise<AIModel[]> {
  const models = await invoke<AvailableModelInfo[]>("list_provider_models", { provider });
  return models.map((model) => ({
    id: model.id,
    provider,
    name: model.name || model.id,
    capabilities: {
      streaming: model.streaming,
      vision: model.vision,
      tools: model.tools,
      audioInput: model.audioInput,
      audioOutput: model.audioOutput,
      maxContextTokens: model.maxContextTokens,
      apiModes: model.apiModes,
      preferredApiMode: model.preferredApiMode,
      availableNow: model.availableNow,
      unavailableReason: model.unavailableReason,
      source: model.capabilitySource,
      performanceClass: model.performanceClass,
    },
  }));
}

// --- モデルカタログ (Rust側は文字列のprovider/modelを受け取るだけなので、
//     カタログ自体はJS側で管理して良い) ---

export const OPENAI_MODELS: AIModel[] = [
  {
    id: "gpt-4o",
    provider: "openai",
    name: "ChatGPT (GPT-4o)",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 128_000,
      apiModes: ["chat_completions", "responses"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
];

export const ANTHROPIC_MODELS: AIModel[] = [
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    name: "Claude (Sonnet 5)",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 1_000_000,
      apiModes: ["messages"],
      preferredApiMode: "messages",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
];


export const DEEPSEEK_MODELS: AIModel[] = [
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    name: "DeepSeek V4 Pro",
    capabilities: {
      streaming: true,
      vision: false,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 1_000_000,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "frontier",
    },
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    name: "DeepSeek V4 Flash",
    capabilities: {
      streaming: true,
      vision: false,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 1_000_000,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "fast",
    },
  },
];


export const KIMI_MODELS: AIModel[] = [
  {
    id: "kimi-k3",
    provider: "kimi",
    name: "Kimi K3",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "frontier",
    },
  },
  {
    id: "kimi-k2.6",
    provider: "kimi",
    name: "Kimi K2.6",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 262_144,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
];


export const GEMINI_MODELS: AIModel[] = [
  {
    id: "gemini-3.7-flash",
    provider: "google",
    name: "Gemini 3.7 Flash",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: true,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
  {
    id: "gemini-3.6-flash",
    provider: "google",
    name: "Gemini 3.6 Flash",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: true,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
  {
    id: "gemini-3.5-flash",
    provider: "google",
    name: "Gemini 3.5 Flash",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: true,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "google",
    name: "Gemini 3.5 Flash-Lite",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: true,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "fast",
    },
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "google",
    name: "Gemini 3.1 Flash-Lite",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: true,
      audioOutput: false,
      maxContextTokens: 1_048_576,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "fast",
    },
  },
];

export const QWEN_MODELS: AIModel[] = [
  {
    id: "qwen3.7-plus",
    provider: "qwen",
    name: "Qwen 3.7 Plus",
    capabilities: {
      streaming: true,
      vision: false,
      tools: true,
      audioInput: false,
      audioOutput: false,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
  {
    id: "qwen3.6-flash",
    provider: "qwen",
    name: "Qwen 3.6 Flash",
    capabilities: {
      streaming: true,
      vision: false,
      tools: true,
      audioInput: false,
      audioOutput: false,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "fast",
    },
  },
];

export const MISTRAL_MODELS: AIModel[] = [
  {
    id: "mistral-small-2603",
    provider: "mistral",
    name: "Mistral Small 4",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 256_000,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "balanced",
    },
  },
  {
    id: "ministral-8b-2512",
    provider: "mistral",
    name: "Ministral 3 8B",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 256_000,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "fast",
    },
  },
  {
    id: "mistral-medium-3-5",
    provider: "mistral",
    name: "Mistral Medium 3.5",
    capabilities: {
      streaming: true,
      vision: true,
      tools: true,
      audioInput: false,
      audioOutput: false,
      maxContextTokens: 256_000,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "curated",
      performanceClass: "frontier",
    },
  },
];

export const COHERE_MODELS: AIModel[] = [
  {
    id: "command-a-plus-05-2026",
    provider: "cohere",
    name: "Cohere Command A+",
    capabilities: {
      streaming: true, vision: true, tools: true, audioInput: false, audioOutput: false,
      maxContextTokens: 128_000, apiModes: ["chat_completions"], preferredApiMode: "chat_completions",
      availableNow: true, source: "curated", performanceClass: "frontier",
    },
  },
  {
    id: "command-a-reasoning-08-2025",
    provider: "cohere",
    name: "Cohere Command A Reasoning",
    capabilities: {
      streaming: true, vision: false, tools: true, audioInput: false, audioOutput: false,
      maxContextTokens: 256_000, apiModes: ["chat_completions"], preferredApiMode: "chat_completions",
      availableNow: true, source: "curated", performanceClass: "frontier",
    },
  },
];

export const XAI_MODELS: AIModel[] = [
  {
    id: "grok-4.20-0309-non-reasoning",
    provider: "xai",
    name: "Grok 4.20 (Non-Reasoning)",
    capabilities: {
      streaming: true, vision: true, tools: true, audioInput: false, audioOutput: false,
      maxContextTokens: 1_000_000, apiModes: ["chat_completions"], preferredApiMode: "chat_completions",
      availableNow: true, source: "curated", performanceClass: "balanced",
    },
  },
  {
    id: "grok-4.5",
    provider: "xai",
    name: "Grok 4.5",
    capabilities: {
      streaming: true, vision: true, tools: true, audioInput: false, audioOutput: false,
      maxContextTokens: 500_000, apiModes: ["chat_completions"], preferredApiMode: "chat_completions",
      availableNow: true, source: "curated", performanceClass: "frontier",
    },
  },
];
