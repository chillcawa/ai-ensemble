import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { readStorage, writeStorage } from "../storage/localSettings";
import {
  createTextDocument,
  deleteTextDocument,
  listTextDocuments,
  updateTextDocument,
  type TextDocument,
} from "../textpad/storage";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { formatDateTime } from "../time/display";
import { localeTag, useI18n } from "../i18n";

interface PastedSnippet {
  id: string;
  text: string;
  createdAt: string;
  pinned?: boolean;
}

type ConfirmTarget = { type: "delete-document"; id: string } | { type: "delete-snippet"; id: string } | null;
type PromptTarget = { type: "new" } | { type: "rename" } | null;

function trimSnippets(items: PastedSnippet[]): PastedSnippet[] {
  const pinned = items.filter((item) => item.pinned);
  const regular = items.filter((item) => !item.pinned).slice(0, 30);
  return [...pinned, ...regular].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function makeId(): string {
  return `textdoc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fallbackTitle(base: string, index = 1): string {
  return index <= 1 ? base : `${base} ${index}`;
}

export function TextPad({
  timeZone,
  onClose,
  onInsertQuestion,
  onSaveLibrary,
}: {
  timeZone: string;
  onClose: () => void;
  onInsertQuestion: (text: string) => void;
  onSaveLibrary?: (title: string, text: string) => void;
}) {
  const { resolvedLocale, t } = useI18n();
  const untitled = t("無題");
  const [documents, setDocuments] = useState<TextDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => readStorage<string | null>("ai-ensemble-textpad-active-id", null));
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<PastedSnippet[]>(() =>
    trimSnippets(readStorage<PastedSnippet[]>("ai-ensemble-pasted-snippets", []))
  );
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [promptTarget, setPromptTarget] = useState<PromptTarget>(null);
  const saveTimer = useRef<number | null>(null);
  const loadedDocumentId = useRef<string | null>(null);

  const activeDocument = documents.find((doc) => doc.id === activeId) ?? null;

  useEffect(() => writeStorage("ai-ensemble-pasted-snippets", trimSnippets(snippets)), [snippets]);
  useEffect(() => writeStorage("ai-ensemble-textpad-active-id", activeId), [activeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next = await listTextDocuments();
        const migrated = readStorage("ai-ensemble-textpad-doc-migrated-v0911", false);
        if (next.length === 0 && !migrated) {
          const legacyText = readStorage<string>("ai-ensemble-textpad", "");
          const created = await createTextDocument(makeId(), untitled, legacyText);
          next = [created];
          writeStorage("ai-ensemble-textpad-doc-migrated-v0911", true);
        } else if (next.length === 0) {
          const created = await createTextDocument(makeId(), untitled, "");
          next = [created];
        }
        writeStorage("ai-ensemble-textpad-doc-migrated-v0911", true);
        if (cancelled) return;
        setDocuments(next);
        const wanted = activeId && next.some((doc) => doc.id === activeId) ? activeId : next[0].id;
        setActiveId(wanted);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Initial load only. activeId is intentionally read from initial state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untitled]);

  useEffect(() => {
    if (!activeDocument) return;
    if (loadedDocumentId.current !== activeDocument.id) {
      loadedDocumentId.current = activeDocument.id;
      setText(activeDocument.content);
      setSaveState("saved");
    }
  }, [activeDocument]);

  useEffect(() => {
    if (!activeDocument || loadedDocumentId.current !== activeDocument.id) return;
    if (text === activeDocument.content) return;
    setSaveState("saving");
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void updateTextDocument(activeDocument.id, activeDocument.title, text)
        .then((updated) => {
          setDocuments((prev) => prev.map((doc) => doc.id === updated.id ? updated : doc));
          setSaveState("saved");
        })
        .catch((e) => {
          setError(String(e));
          setSaveState("error");
        });
    }, 450);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [text, activeDocument]);

  async function persistActiveNow(): Promise<void> {
    if (!activeDocument || text === activeDocument.content) return;
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaveState("saving");
    const updated = await updateTextDocument(activeDocument.id, activeDocument.title, text);
    setDocuments((prev) => prev.map((doc) => doc.id === updated.id ? updated : doc));
    setSaveState("saved");
  }

  async function handleClose() {
    try {
      await persistActiveNow();
      onClose();
    } catch (e) {
      setError(String(e));
      setSaveState("error");
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData("text").trim();
    if (!pasted) return;
    setSnippets((prev) => {
      const existing = prev.find((item) => item.text === pasted);
      const next: PastedSnippet = existing
        ? { ...existing, createdAt: new Date().toISOString() }
        : { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: pasted, createdAt: new Date().toISOString(), pinned: false };
      return trimSnippets([next, ...prev.filter((item) => item.id !== next.id && item.text !== pasted)]);
    });
  }

  function togglePin(id: string) {
    setSnippets((prev) => trimSnippets(prev.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item)));
  }

  async function createDocument(title: string) {
    try {
      await persistActiveNow();
      const created = await createTextDocument(makeId(), title, "");
      setDocuments((prev) => [created, ...prev]);
      loadedDocumentId.current = null;
      setActiveId(created.id);
      setPromptTarget(null);
    } catch (e) { setError(String(e)); }
  }

  async function renameDocument(title: string) {
    if (!activeDocument) return;
    try {
      const updated = await updateTextDocument(activeDocument.id, title, text);
      setDocuments((prev) => prev.map((doc) => doc.id === updated.id ? updated : doc));
      setPromptTarget(null);
      setSaveState("saved");
    } catch (e) { setError(String(e)); }
  }

  async function applyConfirm() {
    if (confirmTarget?.type === "delete-snippet") {
      setSnippets((prev) => prev.filter((item) => item.id !== confirmTarget.id));
      setConfirmTarget(null);
      return;
    }
    if (confirmTarget?.type === "delete-document") {
      try {
        await deleteTextDocument(confirmTarget.id);
        let next = documents.filter((doc) => doc.id !== confirmTarget.id);
        if (next.length === 0) {
          const created = await createTextDocument(makeId(), untitled, "");
          next = [created];
        }
        setDocuments(next);
        loadedDocumentId.current = null;
        setActiveId(next[0].id);
      } catch (e) { setError(String(e)); }
    }
    setConfirmTarget(null);
  }

  const confirmCopy = useMemo(() => {
    if (confirmTarget?.type === "delete-snippet") {
      return { title: t("貼り付け履歴を削除"), message: t("この貼り付け履歴を削除しますか？") };
    }
    return { title: t("文書を削除"), message: t("この文書を削除します。この操作は元に戻せません。") };
  }, [confirmTarget, t]);

  const existingTitles = documents
    .filter((doc) => promptTarget?.type !== "rename" || doc.id !== activeId)
    .map((doc) => doc.title);

  return (
    <div className="textpad-overlay" role="dialog" aria-modal="true">
      <section className="textpad-window">
        <header className="textpad-header">
          <div>
            <strong>{t("簡易テキストエディタ")}</strong>
            <small>{t("文書はSQLiteへ自動保存。必要な文書だけContext Libraryへ送れます。")}</small>
          </div>
          <button className="secondary-button" onClick={() => void handleClose()}>{t("閉じる")}</button>
        </header>

        <div className="textpad-document-toolbar">
          <label className="textpad-document-select">
            <span>{t("文書")}</span>
            <select value={activeId ?? ""} disabled={loading || documents.length === 0} onChange={(e) => {
              const nextId = e.target.value;
              void (async () => {
                try {
                  await persistActiveNow();
                  loadedDocumentId.current = null;
                  setActiveId(nextId);
                } catch (err) {
                  setError(String(err));
                  setSaveState("error");
                }
              })();
            }}>
              {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
            </select>
          </label>
          <div className="textpad-document-actions">
            <button className="secondary-button" onClick={() => setPromptTarget({ type: "rename" })} disabled={!activeDocument}>{t("名前変更")}</button>
            <button className="secondary-button danger-soft" onClick={() => activeDocument && setConfirmTarget({ type: "delete-document", id: activeDocument.id })} disabled={!activeDocument}>{t("削除")}</button>
            <button className="primary-button" onClick={() => setPromptTarget({ type: "new" })}>＋ {t("新規作成")}</button>
          </div>
        </div>

        {error && <div className="textpad-error">{error}</div>}
        <div className="textpad-body">
          <div className="textpad-editor">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              placeholder={t("ここに文章を貼り付けたり、メモを書いたりできます。")}
              disabled={!activeDocument}
              autoFocus
            />
            <div className="textpad-actions">
              <span>{text.length.toLocaleString(localeTag(resolvedLocale))} {t("文字")} · {t(saveState === "saving" ? "保存中…" : saveState === "error" ? "保存エラー" : "保存済み")}</span>
              <div>
                <button className="secondary-button" disabled={!text.trim() || !activeDocument} onClick={() => activeDocument && onSaveLibrary?.(activeDocument.title, text)}>{t("Context Libraryに保存")}</button>
                <button className="primary-button" disabled={!text.trim()} onClick={() => {
                  void (async () => {
                    try {
                      await persistActiveNow();
                      onInsertQuestion(text);
                    } catch (e) {
                      setError(String(e));
                      setSaveState("error");
                    }
                  })();
                }}>{t("質問欄へ送る")}</button>
              </div>
            </div>
          </div>
          <aside className="snippet-panel">
            <div className="snippet-title-row">
              <div className="snippet-title">{t("貼り付け履歴")}</div>
              <small>{t("📌 は自動整理の対象外")}</small>
            </div>
            {snippets.length === 0 ? (
              <div className="muted">{t("ここに貼り付けたテキストが残ります。")}</div>
            ) : (
              <div className="snippet-list">
                {snippets.map((snippet) => (
                  <div key={snippet.id} className={`snippet-item ${snippet.pinned ? "snippet-pinned" : ""}`}>
                    <button className="snippet-content" onClick={() => setText(snippet.text)} title={t("エディタへ復元")}>
                      <span>{snippet.text.replace(/\s+/g, " ").slice(0, 120)}{snippet.text.length > 120 ? "…" : ""}</span>
                      <small>{formatDateTime(snippet.createdAt, timeZone)}</small>
                    </button>
                    <div className="snippet-actions">
                      <button className="icon-button" title={t(snippet.pinned ? "ピン留めを解除" : "消したくない履歴としてピン留め")} onClick={() => togglePin(snippet.id)}>{snippet.pinned ? "📌" : "📍"}</button>
                      <button className="icon-button danger-icon" title={t("貼り付け履歴項目を削除")} onClick={() => setConfirmTarget({ type: "delete-snippet", id: snippet.id })}>{t("削除")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>

      <PromptModal
        open={promptTarget !== null}
        title={t(promptTarget?.type === "rename" ? "文書名を変更" : "新しい文書")}
        label={t("文書名")}
        placeholder={t("例: アイデアメモ")}
        initialValue={promptTarget?.type === "rename" ? activeDocument?.title ?? "" : fallbackTitle(untitled, documents.length + 1)}
        confirmLabel={t(promptTarget?.type === "rename" ? "変更" : "作成")}
        existingNames={existingTitles}
        duplicateMessage={t("同じ名前の文書が既にあります。")}
        onCancel={() => setPromptTarget(null)}
        onConfirm={(value) => void (promptTarget?.type === "rename" ? renameDocument(value) : createDocument(value))}
      />
      <ConfirmModal
        open={confirmTarget !== null}
        title={confirmCopy.title}
        message={confirmCopy.message}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => void applyConfirm()}
      />
    </div>
  );
}
