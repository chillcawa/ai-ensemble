import { useEffect, useMemo, useRef, useState } from "react";
import type { ContextItem } from "../context/types";
import { estimateContextTokens } from "../context/budget";
import { importArchiveFileDetailed } from "../archive/importer";
import { deleteArchiveConversation, listArchiveConversations, loadArchiveMessages, saveArchiveConversation, updateArchiveSourceMapping } from "../archive/storage";
import type { ArchiveConversation, ArchiveMessage } from "../archive/types";
import type { Project } from "../project/types";
import type { ProviderSlot } from "../types/app";
import { ConfirmModal } from "./ConfirmModal";
import { formatDateTime } from "../time/display";
import { localeTag, useI18n } from "../i18n";

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roleLabel(role: ArchiveMessage["role"]): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return "Unknown";
}


export function ConversationArchive({ open, project, slots, timeZone, onClose, onAddContext, onOpenLibrary }: {
  open: boolean;
  project: Project | null;
  slots: ProviderSlot[];
  timeZone: string;
  onClose: () => void;
  onAddContext: (item: ContextItem) => void;
  onOpenLibrary: () => void;
}) {
  const { resolvedLocale, t } = useI18n();
  const numberLocale = localeTag(resolvedLocale);
  const [archives, setArchives] = useState<ArchiveConversation[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ArchiveMessage[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveConversation | null>(null);
  const [lastSavedTitle, setLastSavedTitle] = useState<string | null>(null);
  const [lastImportAdapter, setLastImportAdapter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId) ?? null;
  const visibleArchives = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return archives;
    return archives.filter((archive) => `${archive.title}\n${archive.source}\n${archive.fileName ?? ""}`.toLocaleLowerCase().includes(q));
  }, [archives, query]);
  const selectedMessages = useMemo(() => messages.filter((message) => selectedMessageIds.has(message.id)), [messages, selectedMessageIds]);
  const selectedText = useMemo(() => selectedMessages.map((message) => `[${roleLabel(message.role)}]${message.author ? ` ${message.author}` : ""}\n${message.content}`).join("\n\n"), [selectedMessages]);

  useEffect(() => {
    if (!open || !project) return;
    let cancelled = false;
    setError(null);
    void listArchiveConversations(project.id).then((items) => {
      if (cancelled) return;
      setArchives(items);
      setSelectedArchiveId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
    }).catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [open, project?.id]);

  useEffect(() => {
    if (!open || !selectedArchiveId) { setMessages([]); setSelectedMessageIds(new Set()); return; }
    let cancelled = false;
    void loadArchiveMessages(selectedArchiveId).then((items) => {
      if (cancelled) return;
      setMessages(items);
      setSelectedMessageIds(new Set());
    }).catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [open, selectedArchiveId]);

  if (!open) return null;

  async function refreshArchives(selectId?: string) {
    if (!project) return;
    const items = await listArchiveConversations(project.id);
    setArchives(items);
    if (selectId && items.some((item) => item.id === selectId)) setSelectedArchiveId(selectId);
    else if (selectedArchiveId && items.some((item) => item.id === selectedArchiveId)) setSelectedArchiveId(selectedArchiveId);
    else setSelectedArchiveId(items[0]?.id ?? null);
  }

  async function handleImport(files: FileList | null) {
    if (!files || !project) return;
    setBusy(true);
    setError(null);
    setLastSavedTitle(null);
    setLastImportAdapter(null);
    try {
      let lastId: string | undefined;
      for (const file of Array.from(files)) {
        const imported = await importArchiveFileDetailed(file);
        setLastImportAdapter(`${imported.adapterName} (${Math.round(imported.confidence * 100)}%)`);
        for (const conversation of imported.conversations) {
          const saved = await saveArchiveConversation(project.id, conversation);
          lastId = saved.id;
        }
      }
      await refreshArchives(lastId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggleMessage(id: string) {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedMessageIds(new Set(messages.map((message) => message.id)));
  }

  function clearSelection() {
    setSelectedMessageIds(new Set());
  }

  async function handleSourceMapping(slotId: string) {
    if (!selectedArchive) return;
    setError(null);
    try {
      const slot = slots.find((candidate) => candidate.id === slotId);
      const updated = await updateArchiveSourceMapping(selectedArchive.id, slot ? {
        provider: slot.key,
        model: slot.model.id,
        mappedSlotId: slot.id,
        nickname: slot.label,
      } : {});
      setArchives((prev) => prev.map((archive) => archive.id === updated.id ? updated : archive));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addSelectionToContext() {
    if (!project || !selectedArchive || selectedMessages.length === 0) return;
    const now = new Date().toISOString();
    const item: ContextItem = {
      id: uid("imported-conversation"),
      kind: "conversation",
      role: "reference",
      scope: "project",
      lifetime: "persistent",
      provenance: "imported_conversation",
      reviewState: "approved",
      editedByUser: false,
      title: `${selectedArchive.title} — ${t("選択件数", { count: selectedMessages.length })}`,
      content: selectedText,
      enabled: true,
      projectId: project.id,
      source: {
        conversationId: selectedArchive.id,
        archiveId: selectedArchive.id,
        archiveSource: selectedArchive.source,
        sourceKind: "ai_archive",
        provider: selectedArchive.sourceProvider,
        model: selectedArchive.sourceModel,
        slotId: selectedArchive.mappedSlotId,
        nickname: selectedArchive.sourceNickname,
        capturedAt: now,
        fileName: selectedArchive.fileName,
      },
      createdAt: now,
      updatedAt: now,
    };
    onAddContext(item);
    setLastSavedTitle(item.title);
  }

  return <div className="context-overlay" role="dialog" aria-modal="true">
    <section className="context-window archive-window">
      <header className="context-header">
        <div>
          <strong>Conversation Archive</strong>
          <small>{project?.name ?? t("Project未選択")} — {t("ImportしただけではContextになりません")}</small>
        </div>
        <button className="secondary-button" onClick={onClose}>{t("閉じる")}</button>
      </header>

      <div className="archive-toolbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("会話名 / source / ファイル名を検索")} />
        <input ref={inputRef} hidden multiple type="file" accept=".json,.md,.markdown,.txt,application/json,text/plain,text/markdown" onChange={(e) => void handleImport(e.target.files)} />
        <button className="primary-button" disabled={busy || !project} onClick={() => inputRef.current?.click()}>{busy ? t("Import中…") : "+ Import"}</button>
      </div>

      {error && <div className="library-error">⚠ {error}</div>}
      {lastImportAdapter && <div className="archive-import-adapter">{t("翻訳機")}: {lastImportAdapter}</div>}
      {lastSavedTitle && <div className="archive-success">✓ {t("Archive保存完了", { name: lastSavedTitle })} <button className="secondary-button" onClick={onOpenLibrary}>{t("Libraryを開く")}</button></div>}

      <div className="archive-layout">
        <aside className="archive-list">
          {visibleArchives.length === 0 && <div className="context-empty">{t("Archiveはまだありません。JSON / Markdown / TXTをImportできます。")}</div>}
          {visibleArchives.map((archive) => <button key={archive.id} className={`archive-list-item ${selectedArchiveId === archive.id ? "active" : ""}`} onClick={() => setSelectedArchiveId(archive.id)}>
            <strong>{archive.title}</strong>
            <small>{archive.source} ・ {archive.messageCount} messages ・ Candidate</small>
            <small>{archive.fileName ?? ""}</small>
          </button>)}
        </aside>

        <div className="archive-detail">
          {!selectedArchive && <div className="context-empty">{t("左からArchiveを選択してください。")}</div>}
          {selectedArchive && <>
            <div className="archive-detail-head">
              <div><h3>{selectedArchive.title}</h3><small>{selectedArchive.source} ・ {selectedArchive.fileName ?? ""} ・ {formatDateTime(selectedArchive.createdAt, timeZone)}</small></div>
              <button className="secondary-button danger-soft" onClick={() => setDeleteTarget(selectedArchive)}>{t("Archive削除")}</button>
            </div>
            <div className="archive-source-mapping">
              <div>
                <strong>Source identity</strong>
                <small>{t("ArchiveはCandidate。AI mappingの変更は今後のContext昇格だけに適用され、過去の観測snapshotは変わりません。")}</small>
              </div>
              <label>
                AI mapping
                <select value={selectedArchive.mappedSlotId ?? ""} onChange={(e) => void handleSourceMapping(e.target.value)}>
                  <option value="">{t("未設定")} / AI-Referenced Unknown</option>
                  {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label} — {slot.key} / {slot.model.id}</option>)}
                </select>
              </label>
              <span className="context-badge">{selectedArchive.mappedSlotId ? t("AI紐付け", { name: selectedArchive.sourceNickname ?? selectedArchive.mappedSlotId }) : t("Source slot 未確定")}</span>
            </div>
            <div className="archive-selection-bar">
              <span><strong>{selectedMessageIds.size}</strong> / {messages.length} {t("選択")}</span>
              <span>{t("選択範囲 約")} <strong>{estimateContextTokens(selectedText ? [{ content: selectedText } as ContextItem] : []).toLocaleString(numberLocale)}</strong> tokens</span>
              <span className="archive-selection-spacer" />
              <button className="secondary-button" onClick={selectAll}>{t("すべて選択")}</button>
              <button className="secondary-button" onClick={clearSelection}>{t("解除")}</button>
              <button className="primary-button" disabled={selectedMessageIds.size === 0} onClick={addSelectionToContext}>{t("選択範囲をContext Libraryへ")}</button>
            </div>
            <div className="archive-messages">
              {messages.map((message) => <label key={message.id} className={`archive-message ${selectedMessageIds.has(message.id) ? "selected" : ""}`}>
                <input type="checkbox" checked={selectedMessageIds.has(message.id)} onChange={() => toggleMessage(message.id)} />
                <div>
                  <div className="archive-message-meta"><strong>{roleLabel(message.role)}</strong>{message.author && <span>{message.author}</span>}{message.createdAt && <span>{formatDateTime(message.createdAt, timeZone)}</span>}</div>
                  <pre>{message.content}</pre>
                </div>
              </label>)}
            </div>
          </>}
        </div>
      </div>
    </section>

    <ConfirmModal open={deleteTarget !== null} title={t("Archiveを削除")} message={t("Archive削除確認", { name: deleteTarget?.title ?? "" })} confirmLabel={t("削除")} onCancel={() => setDeleteTarget(null)} onConfirm={() => {
      const id = deleteTarget?.id;
      setDeleteTarget(null);
      if (!id) return;
      void deleteArchiveConversation(id).then(() => refreshArchives()).catch((err) => setError(String(err)));
    }} />
  </div>;
}
