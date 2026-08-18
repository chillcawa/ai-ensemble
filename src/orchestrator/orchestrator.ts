import type {
  AIModel,
  AIProvider,
  ChatMessage,
  RequestStatus,
} from "../types/ai";

// 一括質問モードの心臓部。
// 1モデルの失敗・遅延が他モデルを止めない(仕様書 §24-25)。

export interface BroadcastResult {
  slotId: string;
  model: AIModel;
  status: RequestStatus;
  content: string;
  error?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  truncated?: boolean;
}

export interface BroadcastTarget {
  slotId: string;
  provider: AIProvider;
  model: AIModel;
  messages?: ChatMessage[];
}

export function userFacingProviderError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("rate limit") || lower.includes("quota")) {
    return `このAIは現在、利用上限またはレート制限に達しています。他のAIの回答はそのまま続行します。\n詳細: ${detail}`;
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("authentication")) {
    return `APIキーを確認してください。他のAIの回答はそのまま続行します。\n詳細: ${detail}`;
  }
  if (lower.includes("403") || lower.includes("forbidden") || lower.includes("permission")) {
    return `このAPIキーではモデルを利用できない可能性があります。契約・権限・リージョンを確認してください。\n詳細: ${detail}`;
  }
  if (lower.includes("404") || lower.includes("not found") || lower.includes("no longer available")) {
    return `選択中のモデルが提供終了または利用対象外の可能性があります。「モデル一覧を更新」して選び直してください。\n詳細: ${detail}`;
  }
  if (/\b5\d\d\b/.test(lower) || lower.includes("service unavailable") || lower.includes("overloaded")) {
    return `AI事業者側で一時的な障害または混雑が発生しています。他のAIの回答はそのまま続行します。\n詳細: ${detail}`;
  }
  if (lower.includes("network") || lower.includes("connection") || lower.includes("timed out") || lower.includes("timeout")) {
    return `通信に失敗しました。ネットワーク接続を確認して再試行してください。\n詳細: ${detail}`;
  }
  return detail;
}

export async function broadcastQuestion(
  targets: BroadcastTarget[],
  question: string,
  onUpdate: (result: BroadcastResult) => void,
  opts?: { streaming?: boolean }
): Promise<BroadcastResult[]> {
  const fallbackMessages: ChatMessage[] = [{ role: "user", content: question }];

  const tasks = targets.map(async ({ slotId, provider, model, messages }) => {
    const start = Date.now();
    onUpdate({ slotId, model, status: "sending", content: "" });

    try {
      if (opts?.streaming && model.capabilities.streaming) {
        let acc = "";
        onUpdate({ slotId, model, status: "streaming", content: "" });
        const res = await provider.stream({ model, messages: messages ?? fallbackMessages }, (token) => {
          acc += token;
          onUpdate({ slotId, model, status: "streaming", content: acc });
        });
        const result: BroadcastResult = {
          slotId,
          model,
          status: "completed",
          content: res.content,
          elapsedMs: Date.now() - start,
          inputTokens: res.usage?.inputTokens,
          outputTokens: res.usage?.outputTokens,
          costUsd: res.usage?.costUsd,
          truncated: res.truncated,
        };
        onUpdate(result);
        return result;
      } else {
        const res = await provider.chat({ model, messages: messages ?? fallbackMessages });
        const result: BroadcastResult = {
          slotId,
          model,
          status: "completed",
          content: res.content,
          elapsedMs: Date.now() - start,
          inputTokens: res.usage?.inputTokens,
          outputTokens: res.usage?.outputTokens,
          costUsd: res.usage?.costUsd,
          truncated: res.truncated,
        };
        onUpdate(result);
        return result;
      }
    } catch (err) {
      const result: BroadcastResult = {
        slotId,
        model,
        status: "error",
        content: "",
        error: userFacingProviderError(err),
        elapsedMs: Date.now() - start,
      };
      onUpdate(result);
      return result;
    }
  });

  // Promise.allSettled相当: 一つが例外を投げてもtry/catchで包んでいるので
  // ここはPromise.allで安全に全件を待てる。
  return Promise.all(tasks);
}
