import { useRef, useState } from "react";
import type { BroadcastResult } from "../orchestrator/orchestrator";
import type { DisplayCurrency, ProviderSlot } from "../types/app";
import { formatCostCurrency } from "../format";
import { useI18n } from "../i18n";
import { providerDefaultNickname } from "../providers/registry";

export function ResultBoard({ slots, results, columnWidths, onResize, displayCurrency, currencyRate, onAddContext, onHandoff, onOpenModelPicker }: {
  slots: ProviderSlot[];
  results: Record<string, BroadcastResult>;
  columnWidths: number[];
  onResize: (index: number, startX: number) => void;
  displayCurrency: DisplayCurrency;
  currencyRate: number;
  onAddContext: (slot: ProviderSlot, result: BroadcastResult) => void;
  onHandoff: (slot: ProviderSlot, result: BroadcastResult) => void;
  onOpenModelPicker: (slotId: string) => void;
}) {
  const { t } = useI18n();
  const visible = slots.filter((s) => s.enabled);
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLElement | null>(null);
  const syncingScrollRef = useRef<"top" | "bottom" | null>(null);

  function syncHorizontalScroll(source: "top" | "bottom", scrollLeft: number) {
    if (syncingScrollRef.current && syncingScrollRef.current !== source) return;
    syncingScrollRef.current = source;
    const target = source === "top" ? bottomScrollRef.current : topScrollRef.current;
    if (target && Math.abs(target.scrollLeft - scrollLeft) > 1) {
      target.scrollLeft = scrollLeft;
    }
    window.requestAnimationFrame(() => {
      if (syncingScrollRef.current === source) syncingScrollRef.current = null;
    });
  }

  function jumpToAi(index: number) {
    const left = visible.slice(0, index).reduce((sum, _slot, widthIndex) => sum + (columnWidths[widthIndex] ?? 420) + 10, 0);
    topScrollRef.current?.scrollTo({ left, behavior: "smooth" });
    bottomScrollRef.current?.scrollTo({ left, behavior: "smooth" });
  }

  async function copyAnswer(slotId: string, content: string) {
    await navigator.clipboard.writeText(content);
    setCopiedSlotId(slotId);
    window.setTimeout(() => setCopiedSlotId((current) => current === slotId ? null : current), 1400);
  }

  return (
    <section className="result-board">
      <div className="results-sticky-nav">
        <div className="results-sticky-caption">
          <strong>{t("AI Navigation")}</strong>
          <small>{t("上・下の横スクロールは同期します")}</small>
        </div>
        <div
          className="results-top-scroll"
          ref={topScrollRef}
          onScroll={(event) => syncHorizontalScroll("top", event.currentTarget.scrollLeft)}
        >
          <div className="results-top-track">
            {visible.map((slot, index) => (
              <div
                className="results-top-mirror"
                style={{ width: columnWidths[index] ?? 420 }}
                key={`nav-${slot.id}`}
              >
                <button type="button" onClick={() => jumpToAi(index)} title={t("AIへ移動", { name: slot.label })}>
                  <strong>{slot.label}</strong>
                  <span>{slot.model.id}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="results-scroll"
        ref={bottomScrollRef}
        onScroll={(event) => syncHorizontalScroll("bottom", event.currentTarget.scrollLeft)}
      >
        <div className="results-row">
        {visible.map((slot, index) => {
          const result = results[slot.id];
          return (
            <div className="result-column" style={{ width: columnWidths[index] ?? 420 }} key={slot.id}>
              <div className="result-card">
                <div className="result-header">
                  <div><strong>{slot.label}</strong><button className="model-caption model-shortcut" onClick={() => onOpenModelPicker(slot.id)} title={t("モデルを切り替える")}>{slot.model.id} ▾</button></div>
                  {result && <span className={`status status-${result.status}`}>{statusLabel(result.status, t)}{result.elapsedMs ? ` (${result.elapsedMs}ms)` : ""}</span>}
                </div>
                {result?.error && <div className="error">{result.error}</div>}
                {result && (result.status === "streaming" || result.status === "completed") && (
                  <div className="response-identity-warning">{t("注意：このレスは {name} によるものです。", { name: providerDefaultNickname(slot.key) })}</div>
                )}
                {result?.truncated && <div className="output-limit-warning">{t("⚠ 出力上限に達したため、回答が途中で終了しました。")}</div>}
                <div className="answer">{result?.content}</div>
                {result?.status === "completed" && (
                  <>
                    <div className="result-actions">
                      <button className="secondary-button" onClick={() => void copyAnswer(slot.id, result.content)}>{copiedSlotId === slot.id ? t("✓ コピー済み") : t("コピー")}</button>
                      <button className="secondary-button" onClick={() => onAddContext(slot, result)}>{t("＋ Contextに追加")}</button>
                      <button className="secondary-button" onClick={() => onHandoff(slot, result)}>{t("⇢ 他AIへ渡す")}</button>
                    </div>
                    <div className="result-meta">
                      {t("入力")} {result.inputTokens ?? t("取得不可")} / {t("出力")} {result.outputTokens ?? t("取得不可")} tokens
                      {result.costUsd != null
                        ? <> — {t("推定")} {formatCostCurrency(result.costUsd, displayCurrency, currencyRate)}{displayCurrency !== "USD" ? ` ($${result.costUsd.toFixed(6)})` : ""}</>
                        : result.inputTokens != null && result.outputTokens != null
                          ? <> — {t("コスト計算不可（未登録モデル）")}</>
                          : <> — {t("コスト/使用量をAPIから取得できませんでした")}</>}
                    </div>
                  </>
                )}
              </div>
              {index < visible.length - 1 && (
                <div className="resize-handle" title={t("ドラッグしてカラム幅を変更")} onPointerDown={(e) => {
                  e.preventDefault();
                  onResize(index, e.clientX);
                }} />
              )}
            </div>
          );
        })}
        </div>
      </section>
    </section>
  );
}

function statusLabel(status: BroadcastResult["status"], t: (key: string) => string): string {
  switch (status) {
    case "sending": return t("送信中");
    case "streaming": return t("生成中");
    case "completed": return t("完了");
    case "error": return t("エラー");
    case "cancelled": return t("中断");
    default: return "";
  }
}
