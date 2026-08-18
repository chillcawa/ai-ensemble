import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

export function PromptModal({
  open,
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel,
  existingNames = [],
  duplicateMessage,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  existingNames?: string[];
  duplicateMessage?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, initialValue, onCancel]);

  if (!open) return null;

  const trimmed = value.trim();
  const duplicate = existingNames.some((name) => name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  const canSubmit = trimmed.length > 0 && !duplicate;

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onCancel();
    }}>
      <section className="confirm-modal prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title">
        <h3 id="prompt-modal-title">{title}</h3>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onConfirm(trimmed);
        }}>
          <label className="prompt-modal-label">
            <span>{label}</span>
            <input
              ref={inputRef}
              value={value}
              placeholder={placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          {duplicate && <small className="prompt-modal-error">{duplicateMessage ?? t("同じ名前が既にあります。")}</small>}
          <div className="confirm-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>{t("キャンセル")}</button>
            <button type="submit" className="primary-button" disabled={!canSubmit}>{confirmLabel ?? t("作成")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
