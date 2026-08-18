import type { AIModel } from "../types/ai";
import type { ModelRecommendation } from "../models/recommendation";
import { capabilityBadges } from "../models/capabilities";
import { useI18n } from "../i18n";

export function QuestionComposer({
  question,
  onQuestionChange,
  onSend,
  busy,
  activeCount,
  totalCount,
  estimateText,
  estimateLabel,
  recommendations,
  recommendationsEnabled,
  onToggleRecommendations,
  onUseRecommendation,
  onOpenModelPicker,
  contextCount,
  contextTokens,
  contextWarning,
  contextPreview,
  onOpenContext,
  contextReady,
  contextStorageError,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  activeCount: number;
  totalCount: number;
  estimateText: string;
  estimateLabel: string;
  recommendations: ModelRecommendation[];
  recommendationsEnabled: boolean;
  onToggleRecommendations: (enabled: boolean) => void;
  onUseRecommendation: (slotId: string, model: AIModel) => void;
  onOpenModelPicker: (slotId: string) => void;
  contextCount: number;
  contextTokens: number;
  contextWarning?: string | null;
  contextPreview: string[];
  onOpenContext: () => void;
  contextReady: boolean;
  contextStorageError?: string | null;
}) {
  const { t, resolvedLocale } = useI18n();
  return (
    <>
      <div className="recommendation-toolbar">
        <label className="recommendation-toggle">
          <input
            type="checkbox"
            checked={recommendationsEnabled}
            onChange={(e) => onToggleRecommendations(e.target.checked)}
          />
          {t("💡 モデル推薦を表示")}
        </label>
      </div>

      {recommendationsEnabled && recommendations.length > 0 && (
        <section className="recommendation-panel">
          <div className="recommendation-panel-header">
            <div>
              <strong>{t("💡 今の質問におすすめ")}</strong>
              <small>{t("Provider横断の1位ではなく、各AIごとに候補を推薦します。モデルは自動変更しません。")}</small>
            </div>
          </div>
          <div className="recommendation-grid">
            {recommendations.map((recommendation) => {
              const alreadySelected = recommendation.slot.model.id === recommendation.model.id;
              return (
                <article className="recommendation-item" key={recommendation.slot.id}>
                  <div className="recommendation-item-title">
                    <strong>{recommendation.slot.label}</strong>
                    <span>{recommendation.slot.key}</span>
                  </div>
                  <div className="recommendation-model">{t("推奨")}: {recommendation.model.name}</div>
                  <code className="recommendation-model-id">{recommendation.model.id}</code>
                  <div className="capability-badges recommendation-capabilities">
                    {capabilityBadges(recommendation.model).map((badge) => (
                      <span key={badge.label} className={`capability-badge ${badge.tone}`}>{badge.label}</span>
                    ))}
                  </div>
                  <p className="recommendation-reason">{recommendation.reason}</p>
                  <button
                    className="secondary-button"
                    onClick={() => alreadySelected
                      ? onOpenModelPicker(recommendation.slot.id)
                      : onUseRecommendation(recommendation.slot.id, recommendation.model)}
                  >
                    {alreadySelected ? t("現在選択中 ▾") : t("このモデルに変更")}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="composer">
        <div className="context-strip">
          <button className="secondary-button" onClick={onOpenContext} disabled={!contextReady}>🧩 Context</button>
          {!contextReady
            ? <span className={contextStorageError ? "context-warning" : ""}>{contextStorageError ? `⚠ ${t("Context読込エラー")}` : t("Context読込中…")}</span>
            : <span>{contextCount} {t("items / 約")} {contextTokens.toLocaleString(resolvedLocale)} tokens</span>}
          {contextPreview.map((label) => <span className="context-mini-chip" key={label}>{label}</span>)}
          {contextCount > contextPreview.length && <span className="context-mini-chip">+{contextCount - contextPreview.length}</span>}
          {contextWarning && <span className="context-warning">⚠ {contextWarning}</span>}
        </div>
        <textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t("質問を入力...")}
          rows={2}
        />
        <div className="send-row">
          <div className="estimate">{estimateText}</div>
          <button className="send-button" onClick={onSend} disabled={!contextReady || busy || activeCount === 0 || !question.trim()}>
            {!contextReady ? t("Context読込待ち") : (busy ? t("送信中...") : sendButtonLabel(activeCount, totalCount, estimateLabel, t))}
          </button>
        </div>
      </section>
    </>
  );
}

function sendButtonLabel(selected: number, total: number, estimateLabel: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (selected === 0) return t("AIを選択してください");
  const target = selected === total ? t("全員に送信") : t("AIに送信", { count: selected });
  return `${target}${estimateLabel}`;
}
