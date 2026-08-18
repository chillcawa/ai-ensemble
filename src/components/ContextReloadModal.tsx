import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

export type ContextReloadMode = "keep_history" | "reset_history";

export function ContextReloadModal({
  open,
  contextCount,
  setName,
  onCancel,
  onReload,
}: {
  open: boolean;
  contextCount: number;
  setName?: string | null;
  onCancel: () => void;
  onReload: (mode: ContextReloadMode) => void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onCancel();
    }}>
      <section className="confirm-modal context-reload-modal" role="dialog" aria-modal="true" aria-labelledby="context-reload-title">
        <h3 id="context-reload-title">{t("Contextを再読込")}</h3>
        <p>
          {t("現在のInstruction / Reference / Context Set / Session Contextを再評価し、次の対話から適用します。")}
        </p>
        <div className="context-reload-summary">
          <span>{t("有効Context")}: <strong>{contextCount}</strong></span>
          <span>Context Set: <strong>{setName || t("未選択")}</strong></span>
        </div>
        <div className="context-reload-options">
          <button className="secondary-button context-reload-option" onClick={() => onReload("keep_history")}>
            <strong>{t("履歴を保持して再読込")}</strong>
            <small>{t("過去の会話履歴は引き続きAIへ渡します。Contextだけ現在の状態で再評価します。")}</small>
          </button>
          <button className="primary-button context-reload-option" onClick={() => onReload("reset_history")}>
            <strong>{t("以前の履歴を参照せず再読込")}</strong>
            <small>{t("この地点に境界を作り、次の対話から境界より前の会話履歴をAIへ送りません。")}</small>
          </button>
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} className="secondary-button" onClick={onCancel}>{t("キャンセル")}</button>
        </div>
      </section>
    </div>
  );
}
