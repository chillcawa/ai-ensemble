import { useState } from "react";
import type { BroadcastResult } from "../orchestrator/orchestrator";
import type { DisplayCurrency, ProviderSlot } from "../types/app";
import { formatCostCurrency } from "../format";
import type { HandoffSourceMeta } from "./HandoffModal";
import { useI18n } from "../i18n";
import { providerDefaultNickname } from "../providers/registry";

export interface HandoffRun {
  id: string;
  sourceSlotId: string;
  sourceMeta: HandoffSourceMeta;
  instruction: string;
  createdAt: string;
  results: Record<string, BroadcastResult>;
}

export function HandoffResults({ runs, slots, displayCurrency, currencyRate, onAddContext }: {
  runs: HandoffRun[];
  slots: ProviderSlot[];
  displayCurrency: DisplayCurrency;
  currencyRate: number;
  onAddContext: (slot: ProviderSlot, result: BroadcastResult, run: HandoffRun) => void;
}) {
  const { t } = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [collapsedRuns, setCollapsedRuns] = useState<Set<string>>(() => new Set());
  if (runs.length === 0) return null;
  const slotName = (id: string) => slots.find((s) => s.id === id)?.label ?? id;

  function toggleRun(id: string) {
    setCollapsedRuns((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyAnswer(key: string, content: string) {
    await navigator.clipboard.writeText(content);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1400);
  }

  return (
    <section className="handoff-results-section">
      <div className="handoff-results-title-row">
        <h2>{t("AI相互参照")}</h2>
        <small>{t("Reference送信済み。受信AIによる正確な読解・引用は保証されません。")}</small>
      </div>
      {runs.map((run) => {
        const collapsed = collapsedRuns.has(run.id);
        return (
        <article className={`handoff-run${collapsed ? " collapsed" : ""}`} key={run.id}>
          <button className="handoff-run-header" type="button" onClick={() => toggleRun(run.id)} aria-expanded={!collapsed}>
            <span className="handoff-run-chevron">{collapsed ? "▶" : "▼"}</span>
            <span className="handoff-run-header-copy">
              <strong>{run.sourceMeta.nickname} / {run.sourceMeta.provider} / {run.sourceMeta.model} → {t("他AI")}</strong>
              {run.sourceMeta.originalQuestion && <small>{t("元の質問")}: {run.sourceMeta.originalQuestion}</small>}
              <small>{t("依頼")}: {run.instruction}</small>
            </span>
          </button>
          {!collapsed && <div className="handoff-result-grid">
            {Object.entries(run.results).map(([slotId, result]) => {
              const slot = slots.find((s) => s.id === slotId);
              const copyKey = `${run.id}:${slotId}`;
              return (
                <div className="result-card handoff-result-card" key={slotId}>
                  <div className="handoff-reference-line">← {t("Referenceとして送信済み", { source: `${run.sourceMeta.nickname} / ${run.sourceMeta.provider} / ${run.sourceMeta.model}` })}</div>
                  <div className="result-header"><div><strong>{slotName(slotId)}</strong><span className="model-caption">{result.model.id}</span></div><span className={`status status-${result.status}`}>{result.status}</span></div>
                  {result.error && <div className="error">{result.error}</div>}
                  {slot && (result.status === "streaming" || result.status === "completed") && (
                    <div className="response-identity-warning">{t("注意：このレスは {name} によるものです。", { name: providerDefaultNickname(slot.key) })}</div>
                  )}
                  {result.truncated && <div className="output-limit-warning">{t("⚠ 出力上限に達したため、回答が途中で終了しました。")}</div>}
                  <div className="answer">{result.content}</div>
                  {result.status === "completed" && (
                    <>
                      <div className="result-actions">
                        <button className="secondary-button" onClick={() => void copyAnswer(copyKey, result.content)}>{copiedKey === copyKey ? t("✓ コピー済み") : t("コピー")}</button>
                        {slot && <button className="secondary-button" onClick={() => onAddContext(slot, result, run)}>{t("＋ Contextに追加")}</button>}
                        <span className="one-hop-badge">{t("1ホップ完了")}</span>
                      </div>
                      <div className="result-meta">{t("入力")} {result.inputTokens ?? t("取得不可")} / {t("出力")} {result.outputTokens ?? t("取得不可")} tokens{result.costUsd != null ? <> — {t("推定")} {formatCostCurrency(result.costUsd, displayCurrency, currencyRate)}</> : null}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>}
        </article>
        );
      })}
    </section>
  );
}
