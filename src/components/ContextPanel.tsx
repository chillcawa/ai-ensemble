import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderSlot } from "../types/app";
import type { ContextItem, ContextScope, ContextProvenance } from "../context/types";
import type { ContextSet } from "../context/sets";
import { setTokenItems } from "../context/sets";
import { estimateContextTokens } from "../context/budget";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { localeTag, useI18n } from "../i18n";

function instructionValue(items: ContextItem[], sets: ContextSet[], selectedSet: ContextSet | null, scope: ContextScope, slotId?: string): string {
  const allSetItemIds = new Set(sets.flatMap((set) => set.itemIds));
  const selectedIds = new Set(selectedSet?.itemIds ?? []);
  return items.find((item) => {
    if (item.role !== "instruction" || item.scope !== scope || (scope === "slot" && item.slotId !== slotId)) return false;
    if (scope === "global") return true;
    return selectedSet ? selectedIds.has(item.id) : !allSetItemIds.has(item.id);
  })?.content ?? "";
}

function provenanceLabel(value: ContextProvenance, t: (key: string) => string): string {
  switch (value) {
    case "ai_generated": return `🤖 ${t("AI生成")}`;
    case "external_document": return `📄 ${t("外部資料")}`;
    case "imported_conversation": return "📦 Import";
    default: return `👤 ${t("ユーザー")}`;
  }
}

function scopeLabel(item: ContextItem, slots: ProviderSlot[], t: (key: string) => string): string {
  if (item.scope === "global") return "Global";
  if (item.scope === "project") return "Project";
  if (item.scope === "slot") return slots.find((slot) => slot.id === item.slotId)?.label ?? t("個別AI");
  return "Conversation Session";
}

export function ContextPanel({
  open,
  slots,
  items,
  activeItems,
  conversationKey,
  sets,
  selectedSetId,
  onClose,
  onSetInstruction,
  onToggle,
  onRemove,
  onTogglePersistent,
  onCreateSet,
  onRenameSet,
  onDuplicateSet,
  onDeleteSet,
  onSelectSet,
  onToggleSetItem,
}: {
  open: boolean;
  slots: ProviderSlot[];
  items: ContextItem[];
  activeItems: ContextItem[];
  conversationKey: string;
  sets: ContextSet[];
  selectedSetId: string | null;
  onClose: () => void;
  onSetInstruction: (scope: "global" | "project" | "slot", content: string, slotId?: string, setId?: string | null) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onTogglePersistent: (id: string) => void;
  onCreateSet: (name: string) => void;
  onRenameSet: (id: string, name: string) => void;
  onDuplicateSet: (id: string) => void;
  onDeleteSet: (id: string) => void;
  onSelectSet: (id: string | null) => void;
  onToggleSetItem: (setId: string, itemId: string, included: boolean) => void;
}) {
  const { resolvedLocale, t } = useI18n();
  const numberLocale = localeTag(resolvedLocale);
  const [filter, setFilter] = useState<"all" | "active" | "persistent" | "ai">("all");
  const [deleteTarget, setDeleteTarget] = useState<ContextItem | null>(null);
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null);
  const [createSetOpen, setCreateSetOpen] = useState(false);
  const [renamingSet, setRenamingSet] = useState(false);
  const [renameSetName, setRenameSetName] = useState("");
  const [closeWarningOpen, setCloseWarningOpen] = useState(false);
  const [dirtyEditorKeys, setDirtyEditorKeys] = useState<Set<string>>(() => new Set());
  const [editorDrafts, setEditorDrafts] = useState<Record<string, string>>({});
  const saveEditorRefs = useRef<Map<string, () => void>>(new Map());

  const setEditorDirty = useCallback((editorKey: string, dirty: boolean) => {
    setDirtyEditorKeys((current) => {
      const alreadyDirty = current.has(editorKey);
      if (alreadyDirty === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(editorKey);
      else next.delete(editorKey);
      return next;
    });
  }, []);

  const setEditorDraft = useCallback((editorKey: string, value: string) => {
    setEditorDrafts((current) => current[editorKey] === value ? current : { ...current, [editorKey]: value });
  }, []);

  const registerEditorSave = useCallback((editorKey: string, save: () => void) => {
    saveEditorRefs.current.set(editorKey, save);
  }, []);

  const unregisterEditor = useCallback((editorKey: string) => {
    saveEditorRefs.current.delete(editorKey);
    setEditorDirty(editorKey, false);
  }, [setEditorDirty]);

  const requestClose = useCallback(() => {
    if (dirtyEditorKeys.size > 0) {
      setCloseWarningOpen(true);
      return;
    }
    onClose();
  }, [dirtyEditorKeys, onClose]);

  const saveAllAndClose = useCallback(() => {
    const keys = Array.from(dirtyEditorKeys);
    for (const key of keys) saveEditorRefs.current.get(key)?.();
    setCloseWarningOpen(false);
    onClose();
  }, [dirtyEditorKeys, onClose]);

  const discardAllAndClose = useCallback(() => {
    setCloseWarningOpen(false);
    onClose();
  }, [onClose]);

  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? null;
  const currentSetKey = selectedSet?.id ?? "manual";
  const effectiveInstructionText = useCallback((scope: "global" | "project" | "slot", slotId?: string) => {
    const key = scope === "global" ? "global" : scope === "project" ? `project:${currentSetKey}` : `slot:${slotId}:${currentSetKey}`;
    if (Object.prototype.hasOwnProperty.call(editorDrafts, key)) return editorDrafts[key];
    return instructionValue(items, sets, selectedSet, scope, slotId);
  }, [editorDrafts, items, sets, selectedSet, currentSetKey]);
  const refs = useMemo(() => items.filter((item) => item.role === "reference" && (item.scope !== "session" || item.conversationId === conversationKey)), [items, conversationKey]);
  const activeRefs = useMemo(() => activeItems.filter((item) => item.role === "reference" && item.enabled), [activeItems]);
  const activeInstructions = useMemo(() => activeItems.filter((item) => item.role === "instruction" && item.enabled), [activeItems]);
  const committedEstimated = estimateContextTokens([...activeInstructions, ...activeRefs]);
  const effectiveInstructionChars = selectedSet ? [
    effectiveInstructionText("global"),
    effectiveInstructionText("project"),
    ...slots.map((slot) => effectiveInstructionText("slot", slot.id)),
  ].reduce((sum, text) => sum + Array.from(text).length, 0) : 0;
  const effectiveReferenceChars = activeRefs.reduce((sum, item) => sum + Array.from(item.content).length, 0);
  const estimated = effectiveInstructionChars + effectiveReferenceChars === 0
    ? 0
    : Math.max(1, Math.ceil((effectiveInstructionChars + effectiveReferenceChars) / 2));
  const hasDraftTokenDifference = dirtyEditorKeys.size > 0 && estimated !== committedEstimated;

  const selectedSetTokenEstimate = useMemo(() => {
    if (!selectedSet) return 0;
    const selectedIds = new Set(selectedSet.itemIds);
    const referenceChars = items
      .filter((item) => item.enabled && item.role === "reference" && item.scope !== "global" && item.scope !== "session" && selectedIds.has(item.id))
      .reduce((sum, item) => sum + Array.from(item.content).length, 0);
    const instructionChars = [
      effectiveInstructionText("project"),
      ...slots.map((slot) => effectiveInstructionText("slot", slot.id)),
    ].reduce((sum, text) => sum + Array.from(text).length, 0);
    const chars = referenceChars + instructionChars;
    return chars === 0 ? 0 : Math.max(1, Math.ceil(chars / 2));
  }, [selectedSet, items, slots, effectiveInstructionText]);
  const filteredRefs = useMemo(() => refs.filter((item) => {
    const isActive = activeItems.some((active) => active.id === item.id && active.enabled);
    if (filter === "active") return isActive;
    if (filter === "persistent") return item.lifetime === "persistent";
    if (filter === "ai") return item.provenance === "ai_generated";
    return true;
  }), [refs, filter, activeItems]);

  if (!open) return null;

  return (
    <div className="context-overlay" role="dialog" aria-modal="true">
      <section className="context-window">
        <header className="context-header">
          <div>
            <strong>Context</strong>
            <small>{t("Set選択中はGlobalを全AIへ、Context Setを会話ごと、Session ContextをこのConversationだけに適用します。")}</small>
          </div>
          <button className="secondary-button" onClick={requestClose}>{t("閉じる")}</button>
        </header>

        <div className="context-summary-bar">
          <span><strong>{activeInstructions.length}</strong> Instruction</span>
          <span><strong>{activeRefs.length}</strong> Reference</span>
          <span>{t("現在の適用量 約")} <strong>{estimated.toLocaleString(numberLocale)}</strong> tokens{hasDraftTokenDifference ? <em className="context-token-draft">{t("（未更新を反映）")}</em> : null}</span>
          <span className="muted">{t("選択Set")}: {selectedSet?.name ?? t("Setなし（Context無効）")}</span>
        </div>

        <div className="context-body">
          <section className="context-section">
            <h3>Context Set</h3>
            <label>{t("このConversationで使用")}</label>
            <select value={selectedSetId ?? ""} onChange={(e) => onSelectSet(e.target.value || null)}>
              <option value="">{t("Setなし（Context無効）")}</option>
              {sets.map((set) => {
                const tokens = set.id === selectedSet?.id ? selectedSetTokenEstimate : estimateContextTokens(setTokenItems(items, set));
                return <option key={set.id} value={set.id}>{set.name} — {t("約")} {tokens.toLocaleString(numberLocale)} tokens{set.id === selectedSet?.id && dirtyEditorKeys.size > 0 ? " *" : ""}</option>;
              })}
            </select>
            <div className="context-set-actions context-set-actions-main">
              {selectedSet && (
                <>
                  <button className="secondary-button" onClick={() => { setRenameSetName(selectedSet.name); setRenamingSet((v) => !v); }}>{t("名前変更")}</button>
                  <button className="secondary-button" onClick={() => onDuplicateSet(selectedSet.id)}>{t("複製")}</button>
                  <button className="secondary-button danger-soft" onClick={() => setDeleteSetId(selectedSet.id)}>{t("削除")}</button>
                </>
              )}
              <span className="context-set-action-spacer" aria-hidden="true" />
              <button className="primary-button context-set-new-button" onClick={() => setCreateSetOpen(true)}>＋ {t("新規作成")}</button>
            </div>
            {selectedSet && (
              <>
                {renamingSet && <div className="context-set-create-row"><input autoFocus value={renameSetName} onChange={(e) => setRenameSetName(e.target.value)} /><button className="secondary-button" onClick={() => { const name = renameSetName.trim(); if (name) onRenameSet(selectedSet.id, name); setRenamingSet(false); }}>{t("保存")}</button><button className="secondary-button" onClick={() => setRenamingSet(false)}>{t("取消")}</button></div>}
              </>
            )}
            <div className="context-token-detail">
              <span>{t("Set本体 約")} <strong>{selectedSet ? selectedSetTokenEstimate.toLocaleString(numberLocale) : "—"}</strong>{selectedSet ? " tokens" : ""}</span>
              <span>{t("現在の適用量 約")} <strong>{estimated.toLocaleString(numberLocale)}</strong> tokens</span>
              {hasDraftTokenDifference && <span className="context-token-draft">{t("未更新のInstruction編集をリアルタイム反映中")}</span>}
            </div>
            <small className="muted">{t("Set本体はGlobal / Sessionを含みません。「現在の適用量」はGlobal + 選択Set + Session + AI別Instructionです。Setを切り替えてもContext実体は削除されません。")}</small>

            <h3 className="context-subheading">Instruction</h3>
            {selectedSet && (
              <>
                <SafeInstructionEditor
                  editorKey="global"
                  label="Global Instruction"
                  badge={t("Set外 / 全AI")}
                  committedValue={instructionValue(items, sets, selectedSet, "global")}
                  placeholder={t("すべてのAIに共通して適用する指示")}
                  onCommit={(content) => onSetInstruction("global", content)}
                  onDirtyChange={setEditorDirty}
                  onRegisterSave={registerEditorSave}
                  onUnregister={unregisterEditor}
                  onDraftChange={setEditorDraft}
                />
                <SafeInstructionEditor
                  editorKey={`project:${selectedSet.id}`}
                  label="Project Instruction"
                  badge="Project"
                  committedValue={instructionValue(items, sets, selectedSet, "project")}
                  placeholder={t("Project Instructionを入力")}
                  onCommit={(content) => onSetInstruction("project", content, undefined, selectedSet.id)}
                  onDirtyChange={setEditorDirty}
                  onRegisterSave={registerEditorSave}
                  onUnregister={unregisterEditor}
                  onDraftChange={setEditorDraft}
                />
                {slots.map((slot) => (
                  <SafeInstructionEditor
                    key={`${slot.id}:${selectedSet.id}`}
                    editorKey={`slot:${slot.id}:${selectedSet.id}`}
                    label={`${slot.label} ${t("専用 Instruction")}`}
                    badge={t("個別AI")}
                    committedValue={instructionValue(items, sets, selectedSet, "slot", slot.id)}
                    placeholder={`${slot.label} ${t("専用 Instructionを入力")}`}
                    onCommit={(content) => onSetInstruction("slot", content, slot.id, selectedSet.id)}
                    onDirtyChange={setEditorDirty}
                    onRegisterSave={registerEditorSave}
                    onUnregister={unregisterEditor}
                    onDraftChange={setEditorDraft}
                  />
                ))}
              </>
            )}
          </section>

          <section className="context-section context-reference-section">
            <div className="context-section-title-row">
              <h3>Reference</h3>
              {selectedSet && <small>{activeRefs.length} {t("active")} / {refs.length} {t("visible")}</small>}
            </div>
            {selectedSet && <><div className="context-filters" role="group" aria-label="Context filters">
              {([ ["all", "すべて"], ["active", "有効"], ["persistent", "保存済み"], ["ai", "AI生成"] ] as const).map(([key, label]) => (
                <button key={key} className={filter === key ? "context-filter-button active" : "context-filter-button"} onClick={() => setFilter(key)}>{t(label)}</button>
              ))}
            </div>
            {filteredRefs.length === 0 ? <div className="context-empty">{t("該当するReferenceはありません。")}</div> : (
              <div className="context-list">
                {filteredRefs.map((item) => {
                  const isActive = activeItems.some((active) => active.id === item.id && active.enabled);
                  const canBelongToSet = item.scope !== "session" && item.scope !== "global";
                  const included = !!selectedSet?.itemIds.includes(item.id);
                  return (
                    <article className={isActive ? "context-item" : "context-item context-item-disabled"} key={item.id}>
                      <div className="context-item-main">
                        <label className="context-toggle">
                          <input type="checkbox" checked={item.enabled} onChange={(e) => onToggle(item.id, e.target.checked)} />
                          <span><strong>{item.title}</strong></span>
                        </label>
                        <div className="context-badge-row">
                          <span className="context-badge">{provenanceLabel(item.provenance, t)}</span>
                          <span className="context-badge">{scopeLabel(item, slots, t)}</span>
                          <span className="context-badge">{item.lifetime === "persistent" ? `📌 ${t("保存済み")}` : t("今回のみ")}</span>
                          {selectedSet && canBelongToSet && <span className="context-badge">{included ? `✓ ${selectedSet.name}` : t("Set外")}</span>}
                        </div>
                        <small>{item.source?.provider ? `${item.source.provider} / ${item.source.model ?? ""}` : item.kind}</small>
                        <p>{item.content.replace(/\s+/g, " ").slice(0, 180)}{item.content.length > 180 ? "…" : ""}</p>
                      </div>
                      <div className="context-item-actions">
                        {selectedSet && canBelongToSet && <button className="secondary-button" onClick={() => onToggleSetItem(selectedSet.id, item.id, !included)}>{t(included ? "Setから外す" : item.scope === "session" ? "Setに保存" : "Setに追加")}</button>}
                        <button className="secondary-button" onClick={() => onTogglePersistent(item.id)}>{t(item.lifetime === "persistent" ? "保存解除" : "保存")}</button>
                        <button className="secondary-button danger-icon" onClick={() => setDeleteTarget(item)}>{t("削除")}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}</>}
          </section>
        </div>
      </section>
      <PromptModal
        open={createSetOpen}
        title={t("新しいContext Set")}
        label={t("名前")}
        placeholder={t("例: 基本資料")}
        confirmLabel={t("作成")}
        existingNames={sets.map((set) => set.name)}
        onCancel={() => setCreateSetOpen(false)}
        onConfirm={(name) => { onCreateSet(name); setCreateSetOpen(false); }}
      />
      <UnsavedContextModal
        open={closeWarningOpen}
        dirtyCount={dirtyEditorKeys.size}
        onSaveAll={saveAllAndClose}
        onDiscard={discardAllAndClose}
        onBack={() => setCloseWarningOpen(false)}
      />
      <ConfirmModal open={deleteTarget !== null} title={t("Contextを削除")} message={deleteTarget ? t("Context項目削除確認", { name: deleteTarget.title }) : ""} confirmLabel={t("削除")} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) onRemove(deleteTarget.id); setDeleteTarget(null); }} />
      <ConfirmModal open={deleteSetId !== null} title={t("Context Setを削除")} message={t("Setだけを削除します。中のContext Item自体は削除されません。")} confirmLabel={t("削除")} onCancel={() => setDeleteSetId(null)} onConfirm={() => { if (deleteSetId) onDeleteSet(deleteSetId); setDeleteSetId(null); }} />
    </div>
  );
}


function UnsavedContextModal({ open, dirtyCount, onSaveAll, onDiscard, onBack }: {
  open: boolean;
  dirtyCount: number;
  onSaveAll: () => void;
  onDiscard: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    backRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onBack]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(e) => {
      if (e.currentTarget === e.target) onBack();
    }}>
      <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="context-unsaved-title" aria-describedby="context-unsaved-message">
        <h3 id="context-unsaved-title">{t("未更新の編集があります")}</h3>
        <p id="context-unsaved-message">
          {t("未更新Context確認", { count: dirtyCount })}
        </p>
        <div className="confirm-actions context-unsaved-actions">
          <button ref={backRef} className="secondary-button" onClick={onBack}>{t("戻る")}</button>
          <button className="secondary-button danger-soft" onClick={onDiscard}>{t("無視して閉じる")}</button>
          <button className="primary-button" onClick={onSaveAll}>{t("全部更新する")}</button>
        </div>
      </section>
    </div>
  );
}

function SafeInstructionEditor({ editorKey, label, badge, committedValue, placeholder, onCommit, onDirtyChange, onRegisterSave, onUnregister, onDraftChange }: {
  editorKey: string;
  label: string;
  badge: string;
  committedValue: string;
  placeholder: string;
  onCommit: (content: string) => void;
  onDirtyChange: (editorKey: string, dirty: boolean) => void;
  onRegisterSave: (editorKey: string, save: () => void) => void;
  onUnregister: (editorKey: string) => void;
  onDraftChange: (editorKey: string, draft: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(committedValue);
  const [baseline, setBaseline] = useState(committedValue);
  const [undoValue, setUndoValue] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const localCommitRef = useRef(false);
  const previousKeyRef = useRef(editorKey);

  useEffect(() => {
    const switchedEditor = previousKeyRef.current !== editorKey;
    previousKeyRef.current = editorKey;

    if (switchedEditor) {
      localCommitRef.current = false;
      setBaseline(committedValue);
      setDraft(committedValue);
      setUndoValue(null);
      setConfirmUpdate(false);
      setConfirmUndo(false);
      return;
    }

    if (committedValue !== baseline) {
      setBaseline(committedValue);
      setDraft(committedValue);
      if (!localCommitRef.current) setUndoValue(null);
      localCommitRef.current = false;
    }
  }, [committedValue, baseline, editorKey]);

  const dirty = draft !== baseline;
  const saveCurrentRef = useRef<() => void>(() => undefined);

  function commitDraft() {
    const before = baseline;
    localCommitRef.current = true;
    setUndoValue(before);
    onCommit(draft);
    setConfirmUpdate(false);
  }

  saveCurrentRef.current = commitDraft;

  useEffect(() => {
    onDirtyChange(editorKey, dirty);
    onDraftChange(editorKey, draft);
  }, [editorKey, dirty, draft, onDirtyChange, onDraftChange]);

  useEffect(() => {
    onRegisterSave(editorKey, () => saveCurrentRef.current());
    return () => onUnregister(editorKey);
  }, [editorKey, onRegisterSave, onUnregister]);

  function restorePrevious() {
    if (undoValue === null) return;
    const previous = undoValue;
    localCommitRef.current = true;
    setUndoValue(null);
    onCommit(previous);
    setConfirmUndo(false);
  }

  return (
    <div className="slot-instruction context-safe-editor" data-editor-key={editorKey}>
      <div className="context-editor-label-row">
        <label>{label} <span className="context-badge">{badge}</span></label>
        <span className={dirty ? "context-edit-status dirty" : "context-edit-status"}>{t(dirty ? "未保存の変更" : "保存済み")}</span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey;
          if (isUndo && !dirty && undoValue !== null) {
            e.preventDefault();
            setConfirmUndo(true);
          }
        }}
        placeholder={placeholder}
      />
      <div className="context-editor-actions">
        <button className="secondary-button" disabled={!dirty} onClick={() => setDraft(baseline)}>{t("編集をキャンセル")}</button>
        <button className="primary-button" disabled={!dirty} onClick={() => setConfirmUpdate(true)}>{t("更新")}</button>
        <small className="muted">{t("編集中のCtrl+Zは通常の文字編集。更新後はCtrl+Zで直前の確定内容へ1回戻せます。")}</small>
      </div>
      <ConfirmModal
        open={confirmUpdate}
        title={t("Instruction更新タイトル", { label })}
        message={t("現在の編集内容でContextを更新します。よろしいですか？")}
        confirmLabel={t("更新する")}
        cancelLabel={t("戻る")}
        danger={false}
        onCancel={() => setConfirmUpdate(false)}
        onConfirm={commitDraft}
      />
      <ConfirmModal
        open={confirmUndo}
        title={t("一つ前の編集に戻す")}
        message={t("Instruction復元確認", { label })}
        confirmLabel={t("元に戻す")}
        cancelLabel={t("キャンセル")}
        danger={false}
        onCancel={() => setConfirmUndo(false)}
        onConfirm={restorePrevious}
      />
    </div>
  );
}
