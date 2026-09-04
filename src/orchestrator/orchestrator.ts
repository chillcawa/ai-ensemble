import type {
  AIModel,
  AIProvider,
  ChatMessage,
  RequestStatus,
} from "../types/ai";
import { cancelActiveStream } from "../providers/tauriProvider";

// 一括質問モードの心臓部。
// 1モデルの失敗・遅延が他モデルを止めない(仕様書 §24-25)。
//
// [Phase 1修正] 従来はPromise.all配下の各タスクが「一度もsettleしない」場合
// (プロバイダAPIが応答なくハングし続けるケース)、Promise.all自体が永遠に
// 解決せず、broadcastQuestion()の呼び出し元(App.tsx)がフリーズしていた。
// これにより、既に完了していた他のAIの結果までDB保存されずに失われる、
// UIのbusy状態が解除されず操作不能になる、という不具合が発生していた。
// 対策として、各タスクに「開始からの無応答」「stream中のchunk無応答」の
// 二段階タイムアウトを設け、必ずいずれかの状態でsettleするようにする。

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
  /** [Phase 1継続 項目3/4] このrunを一意に識別するID。個別停止(cancel_stream_run)の
   *  対象指定に使う。streaming中のみ意味を持つ(非streaming経路ではundefined)。 */
  requestId?: string;
}

export interface BroadcastTarget {
  slotId: string;
  provider: AIProvider;
  model: AIModel;
  messages?: ChatMessage[];
  /** [Phase 1継続] stream_runs永続化のためRust側へ伝える。呼び出し元(App.tsx)が設定する。 */
  conversationId?: string;
}

export interface BroadcastTimeoutOptions {
  /** 接続開始からこの時間、最初の応答(チャンクまたは完了)が無ければタイムアウトとする */
  noResponseSinceStartMs?: number;
  /** stream中、この時間チャンクが届かなければタイムアウト(stalled)とする */
  noChunkDuringStreamMs?: number;
}

const DEFAULT_NO_RESPONSE_SINCE_START_MS = 60_000;
const DEFAULT_NO_CHUNK_DURING_STREAM_MS = 90_000;

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

/** stallタイマー。resetするたびに再カウント、firedを返す前にcancelできる。 */
class StallTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;
  constructor(private readonly ms: number, private readonly onFire: () => void) {}
  reset() {
    if (this.fired) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.fired = true;
      this.onFire();
    }, this.ms);
  }
  cancel() {
    this.fired = true; // これ以降reset()を呼ばれても再始動しない
    if (this.timer) clearTimeout(this.timer);
  }
}

export async function broadcastQuestion(
  targets: BroadcastTarget[],
  question: string,
  onUpdate: (result: BroadcastResult) => void,
  opts?: { streaming?: boolean; timeouts?: BroadcastTimeoutOptions }
): Promise<BroadcastResult[]> {
  const fallbackMessages: ChatMessage[] = [{ role: "user", content: question }];
  const noResponseSinceStartMs = opts?.timeouts?.noResponseSinceStartMs ?? DEFAULT_NO_RESPONSE_SINCE_START_MS;
  const noChunkDuringStreamMs = opts?.timeouts?.noChunkDuringStreamMs ?? DEFAULT_NO_CHUNK_DURING_STREAM_MS;

  const tasks = targets.map(async ({ slotId, provider, model, messages, conversationId }) => {
    const start = Date.now();
    // [Phase 1継続 項目3/4] requestIdをここで生成し、以降の全onUpdateに含める。
    // UIが「このAIだけ停止」ボタンから現在アクティブなrequestIdを参照できるようにする。
    const requestId = crypto.randomUUID();
    onUpdate({ slotId, model, status: "sending", content: "", requestId });

    // settledより後に届いたonToken/結果は無視する(タイムアウト後に遅れて
    // 本来の応答が来た場合、UIの状態表示が"timeout"から勝手に"streaming"へ
    // 巻き戻るのを防ぐ)。将来的にはこの分岐でquarantined_response_log相当の
    // 永続化を行う(ロードマップPhase 2)。
    let settled = false;
    // [Phase 1継続 項目4] キャンセル時、catchブロックからも参照できるよう
    // ここ(タスクスコープ)で保持する。ストリーミングでない経路では常に空。
    let accumulatedContent = "";

    return new Promise<BroadcastResult>((resolve) => {
      let startTimer: StallTimer;
      let stallTimer: StallTimer | null = null;

      const finish = (result: BroadcastResult) => {
        if (settled) return;
        settled = true;
        startTimer.cancel();
        stallTimer?.cancel();
        onUpdate({ ...result, requestId });
        resolve({ ...result, requestId });
      };

      const cancelTimedOutStream = () => {
        if (!(opts?.streaming && model.capabilities.streaming)) return;
        // UIだけをtimeout扱いにしてRust/HTTP streamを裏で走らせ続けない。
        // cancel側の失敗はtimeout結果そのものを覆さない。
        void cancelActiveStream(requestId).catch((error) => {
          console.warn(`failed to cancel timed-out stream ${requestId}`, error);
        });
      };

      // 「開始から無応答」のタイムアウト。最初のトークンまたは完了で解除される。
      startTimer = new StallTimer(noResponseSinceStartMs, () => {
        cancelTimedOutStream();
        finish({
          slotId,
          model,
          status: "error",
          content: "",
          error: `応答がありません(${Math.round(noResponseSinceStartMs / 1000)}秒無応答のためタイムアウト)。他のAIの回答はそのまま続行します。`,
          elapsedMs: Date.now() - start,
        });
      });
      startTimer.reset();

      (async () => {
        try {
          if (opts?.streaming && model.capabilities.streaming) {
            let firstTokenReceived = false;
            onUpdate({ slotId, model, status: "streaming", content: "", requestId });

            const res = await provider.stream({ model, messages: messages ?? fallbackMessages, conversationId, slotId, requestId }, (token) => {
              if (settled) return; // タイムアウト確定後に届いた遅延トークンは無視
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                startTimer.cancel();
                stallTimer = new StallTimer(noChunkDuringStreamMs, () => {
                  cancelTimedOutStream();
                  finish({
                    slotId,
                    model,
                    status: "error",
                    content: accumulatedContent,
                    error: `stream中に${Math.round(noChunkDuringStreamMs / 1000)}秒応答が無かったためタイムアウトしました。他のAIの回答はそのまま続行します。`,
                    elapsedMs: Date.now() - start,
                  });
                });
              }
              stallTimer?.reset();
              accumulatedContent += token;
              onUpdate({ slotId, model, status: "streaming", content: accumulatedContent, requestId });
            });

            finish({
              slotId,
              model,
              status: "completed",
              content: res.content && res.content.length > 0 ? res.content : accumulatedContent,
              elapsedMs: Date.now() - start,
              inputTokens: res.usage?.inputTokens,
              outputTokens: res.usage?.outputTokens,
              costUsd: res.usage?.costUsd,
              truncated: res.truncated,
            });
          } else {
            const res = await provider.chat({ model, messages: messages ?? fallbackMessages });
            finish({
              slotId,
              model,
              status: "completed",
              content: res.content,
              elapsedMs: Date.now() - start,
              inputTokens: res.usage?.inputTokens,
              outputTokens: res.usage?.outputTokens,
              costUsd: res.usage?.costUsd,
              truncated: res.truncated,
            });
          }
        } catch (err) {
          // [Phase 1継続 項目4] Rust側でユーザーが「このAIだけ停止」を押した場合、
          // stream_chat_completionは"cancelled_by_user"という文字列でrejectする。
          // これを一般的なエラーとして扱うと、UIに紛らわしいエラーメッセージが
          // 出てしまう(実際には停止が正しく成功しているにもかかわらず)ため、
          // 既存のRequestStatus「cancelled」へ振り分ける。
          const errorText = err instanceof Error ? err.message : String(err);
          if (errorText === "cancelled_by_user") {
            finish({
              slotId,
              model,
              status: "cancelled",
              content: accumulatedContent,
              elapsedMs: Date.now() - start,
            });
            return;
          }
          finish({
            slotId,
            model,
            status: "error",
            content: "",
            error: userFacingProviderError(err),
            elapsedMs: Date.now() - start,
          });
        }
      })();
    });
  });

  // Promise.allSettled相当: 各タスクは内部で必ずいずれかの状態にsettleする
  // (finish()経由)ため、ここはPromise.allで安全に全件を待てる。
  // タイムアウト機構により、1つのプロバイダが無応答のままでも、
  // 遅くともnoResponseSinceStartMs+noChunkDuringStreamMs程度で必ず解決する。
  return Promise.all(tasks);
}
