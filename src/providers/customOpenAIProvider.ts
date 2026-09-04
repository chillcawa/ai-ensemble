import { invoke } from "@tauri-apps/api/core";
import type { AIModel, AIProvider, ChatRequest, ChatResponse } from "../types/ai";

// [Phase CP-1 MVP] Custom Provider（ユーザー追加のOpenAI互換エンドポイント）用アダプタ。
//
// TauriProvider(既存9社用)とほぼ同じ構造だが、baseUrlをinvoke呼び出しに含める点だけが違う。
// Phase 1で実装した停止・再試行・timeout・requestId・CancellationTokenの仕組みは、
// invoke("stream_chat_completion", ...)を経由する限り、Built-inとまったく同じ経路
// (Rust側のtokio::select! + StreamCancellationRegistry)を通るため、追加実装なしで
// Custom Providerにもそのまま適用される。

// tauriProvider.ts内のpendingStreams/ensureListenerは同一のstream-tokenイベントを
// 使い回すため、このファイルからも同じイベント購読の仕組みに相乗りする。
// (二重にensureListenerを呼んでも、tauriProvider.ts側は一度しか登録しないため安全)
import { __ensureStreamListenerForCustomProvider, __registerPendingStream, __unregisterPendingStream } from "./tauriProvider";

/** モデル名の文字列だけから、既存9社の`curated`モデルと同型のAIModelを合成する。
 *  MVPでは自動取得を行わないため、capabilitiesは保守的な既定値にする
 *  (streaming: true以外は不明・非対応寄りにしておき、過大な期待をUIに出さない)。 */
export function makeCustomAIModel(providerId: string, modelName: string): AIModel {
  return {
    id: modelName,
    provider: providerId,
    name: modelName,
    capabilities: {
      streaming: true,
      vision: false,
      tools: false,
      audioInput: false,
      audioOutput: false,
      apiModes: ["chat_completions"],
      preferredApiMode: "chat_completions",
      availableNow: true,
      source: "unknown",
      performanceClass: "unknown",
    },
  };
}

export class CustomOpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  private readonly baseUrl: string;
  private readonly modelCatalog: AIModel[];

  constructor(id: string, name: string, baseUrl: string, modelName: string) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl;
    this.modelCatalog = [makeCustomAIModel(id, modelName)];
  }

  async listModels(): Promise<AIModel[]> {
    // [Phase CP-1 MVP] モデル一覧自動取得は範囲外。設定されたモデル名を1件返すのみ。
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
      baseUrl: this.baseUrl,
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
    await __ensureStreamListenerForCustomProvider();
    const requestId = request.requestId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    __registerPendingStream(requestId, onToken);

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
        conversationId: request.conversationId,
        slotId: request.slotId,
        baseUrl: this.baseUrl,
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
      __unregisterPendingStream(requestId);
    }
  }
}
