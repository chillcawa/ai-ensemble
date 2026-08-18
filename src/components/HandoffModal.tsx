import { useMemo, useState } from "react";
import type { ProviderSlot } from "../types/app";
import type { BroadcastResult } from "../orchestrator/orchestrator";
import { useI18n } from "../i18n";

export interface HandoffSourceMeta {
  nickname: string;
  provider: string;
  model: string;
  slotId: string;
  originalQuestion?: string;
  sourceMessageId?: string;
}

export interface HandoffRequest {
  sourceSlotId: string;
  sourceResult: BroadcastResult;
  sourceMeta: HandoffSourceMeta;
  targetSlotIds: string[];
  instruction: string;
}

const PRESETS = [
  ["参照確認", "参照確認依頼"],
  ["批判", "批判依頼"],
  ["検証", "検証依頼"],
  ["改善", "改善依頼"],
  ["要約", "要約依頼"],
] as const;

export function HandoffModal({ sourceSlot, sourceResult, sourceMeta, slots, onClose, onSend }: {
  sourceSlot: ProviderSlot;
  sourceResult: BroadcastResult;
  sourceMeta: HandoffSourceMeta;
  slots: ProviderSlot[];
  onClose: () => void;
  onSend: (request: HandoffRequest) => void;
}) {
  const { t } = useI18n();
  const candidates = useMemo(() => slots.filter((s) => s.id !== sourceSlot.id && s.keySaved), [slots, sourceSlot.id]);
  const [selected, setSelected] = useState<string[]>(candidates.filter((s) => s.enabled).map((s) => s.id));
  const [instruction, setInstruction] = useState<string>(() => t(PRESETS[0][1]));
  const [confirmSend, setConfirmSend] = useState(false);

  return (
    <div className="context-overlay" role="dialog" aria-modal="true">
      <section className="handoff-window">
        <header className="context-header">
          <div>
            <strong>{t("AI回答を他AIへ渡す", { name: sourceSlot.label })}</strong>
            <small>{t("1ホップのみ。受信AIには元AI・モデル・元の質問をReferenceの出典情報として渡します。")}</small>
          </div>
          <button className="secondary-button" onClick={onClose}>{t("閉じる")}</button>
        </header>
        <div className="handoff-body">
          <div className="handoff-origin-card">
            <strong>{t("元のAI")}</strong>
            <span>{sourceMeta.nickname} / {sourceMeta.provider} / {sourceMeta.model}</span>
            {sourceMeta.originalQuestion && <><strong>{t("元の質問")}</strong><span>{sourceMeta.originalQuestion}</span></>}
          </div>
          <div className="handoff-source-preview">{sourceResult.content.slice(0, 700)}{sourceResult.content.length > 700 ? "…" : ""}</div>
          <div className="handoff-reliability-note">
            <strong>{t("参照追従について")}</strong>
            <span>{t("元回答全文はReferenceとして送信されますが、受信AIが正しく読解・引用することは保証されません。内容を補完・推測する場合もあります。重要な確認では「参照確認」プリセットを先にお試しください。")}</span>
          </div>
          <div>
            <strong>{t("送信先")}</strong>
            <div className="handoff-targets">
              {candidates.map((slot) => (
                <label key={slot.id}><input type="checkbox" checked={selected.includes(slot.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, slot.id] : prev.filter((id) => id !== slot.id))} /> {slot.label} <small>{slot.model.id}</small></label>
              ))}
            </div>
          </div>
          <div>
            <strong>{t("依頼")}</strong>
            <div className="handoff-presets">{PRESETS.map(([label, text]) => <button key={label} className="secondary-button" onClick={() => setInstruction(t(text))}>{t(label)}</button>)}</div>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </div>
          <div className="handoff-actions">
            <button className="secondary-button" onClick={onClose}>{t("キャンセル")}</button>
            <button className="primary-button" disabled={selected.length === 0 || !instruction.trim()} onClick={() => setConfirmSend(true)}>{t("AIに送信", { count: selected.length })}</button>
          </div>
        </div>
      </section>
      {confirmSend && (
        <div className="confirm-overlay handoff-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-confirm-title">
          <section className="confirm-modal handoff-confirm-modal">
            <h3 id="handoff-confirm-title">{t("1ホップ制限の確認")}</h3>
            <p>{t("AI同士の参照を繰り返すと、誤認やハルシネーションが連鎖・増幅する可能性があります。そのためAI Ensembleは、この操作を1ホップで終了します。")}</p>
            <p>{t("受信AIは、参照元AIや自分自身の開発元・モデル名を誤って説明することがあります。誰の回答かを確認するときは、AI本文の自己申告ではなく、AI Ensembleが表示する識別ラベルを基準にしてください。")}</p>
            <div className="handoff-confirm-route">
              <strong>{t("送信経路")}</strong>
              <span>{sourceMeta.nickname} → {selected.map((id) => slots.find((slot) => slot.id === id)?.label ?? id).join(", ")}</span>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setConfirmSend(false)}>{t("キャンセル")}</button>
              <button className="primary-button" onClick={() => {
                setConfirmSend(false);
                onSend({ sourceSlotId: sourceSlot.id, sourceResult, sourceMeta, targetSlotIds: selected, instruction: instruction.trim() });
              }}>{t("了承してAIに送信")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
