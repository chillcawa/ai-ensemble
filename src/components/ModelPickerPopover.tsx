import type { AIModel } from "../types/ai";
import type { ProviderSlot } from "../types/app";
import { capabilityBadges } from "../models/capabilities";
import { useI18n } from "../i18n";

export function ModelPickerPopover({ slot, models, recommendedModelId, onSelect, onClose, onOpenSettings }: {
  slot: ProviderSlot;
  models: AIModel[];
  recommendedModelId?: string;
  onSelect: (model: AIModel) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="model-picker-backdrop" onMouseDown={onClose}>
      <section className="model-picker-popover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="model-picker-header">
          <div>
            <strong>{slot.label}</strong>
            <span>{slot.key}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("閉じる")}>×</button>
        </div>
        <div className="model-picker-current">{t("現在")}: <code>{slot.model.id}</code></div>
        <div className="model-picker-list">
          {models.map((model) => {
            const current = model.id === slot.model.id;
            const recommended = model.id === recommendedModelId;
            const available = model.capabilities.availableNow;
            return (
              <button
                className={`model-picker-option${current ? " current" : ""}${!available ? " unavailable" : ""}`}
                onClick={() => { if (available) { onSelect(model); onClose(); } }}
                key={model.id}
                disabled={!available}
                title={!available ? model.capabilities.unavailableReason : undefined}
              >
                <span className="model-picker-main">
                  <strong>{model.name}</strong>
                  <code>{model.id}</code>
                  <span className="capability-badges">
                    {capabilityBadges(model).map((badge) => (
                      <em key={`${model.id}-${badge.label}`} className={`capability-badge ${badge.tone}`} title={badge.title}>{badge.label}</em>
                    ))}
                  </span>
                  {!available && <small className="model-unavailable-reason">{model.capabilities.unavailableReason ?? t("現在のAdapterでは利用できません")}</small>}
                </span>
                <span className="model-picker-badges">
                  {recommended && <em>★ {t("推奨")}</em>}
                  {current && <em>{t("現在")}</em>}
                  {!available && <em>{t("未対応")}</em>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="capability-source-note">{t("能力表示はProvider metadata / curated / inferredを区別して保持します。推定値は断定ではありません。")}</div>
        <button className="secondary-button model-picker-settings" onClick={onOpenSettings}>⚙ {t("詳細設定へ")}</button>
      </section>
    </div>
  );
}
