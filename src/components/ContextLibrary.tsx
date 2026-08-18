import { useMemo, useRef, useState } from "react";
import type { ContextItem } from "../context/types";
import type { ContextSet } from "../context/sets";
import type { Project } from "../project/types";
import { estimateContextTokens } from "../context/budget";
import { importContextFile, importedFileToContext, type ImportedContextFile } from "../context/fileImport";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { formatDateTime } from "../time/display";
import { localeTag, useI18n } from "../i18n";


function formatBytes(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(item: ContextItem): string {
  if (item.kind === "markdown") return "MD";
  if (item.kind === "document") return "PDF / Document";
  if (item.kind === "text") return "TXT";
  return item.kind.toUpperCase();
}

export function ContextLibrary({
  open,
  project,
  timeZone,
  items,
  sets,
  selectedSetId,
  capacityTargets,
  onClose,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onToggleItem,
  onDisableAiReferenceAndReset,
  onToggleSetItem,
}: {
  open: boolean;
  project: Project | null;
  timeZone: string;
  items: ContextItem[];
  sets: ContextSet[];
  selectedSetId: string | null;
  capacityTargets: Array<{ label: string; maxContextTokens?: number }>;
  onClose: () => void;
  onAddItem: (item: ContextItem, addToSetId?: string | null) => void;
  onUpdateItem: (id: string, patch: Partial<ContextItem>) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string, enabled: boolean) => void;
  onDisableAiReferenceAndReset: (id: string) => void;
  onToggleSetItem: (setId: string, itemId: string, included: boolean) => void;
}) {
  const { resolvedLocale, t } = useI18n();
  const numberLocale = localeTag(resolvedLocale);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "text" | "markdown" | "document">("all");
  const [membershipFilter, setMembershipFilter] = useState<"all" | "current" | "outside">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContextItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<ContextItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<ContextItem | null>(null);
  const [reloadTarget, setReloadTarget] = useState<ContextItem | null>(null);
  const [pendingReload, setPendingReload] = useState<{ target: ContextItem; imported: ImportedContextFile } | null>(null);
  const [aiDisableTarget, setAiDisableTarget] = useState<ContextItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reloadInputRef = useRef<HTMLInputElement>(null);

  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? null;
  const projectItems = useMemo(
    () => items.filter((item) => item.lifetime === "persistent" && item.scope === "project" && item.projectId === project?.id && item.role === "reference"),
    [items, project?.id],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return projectItems.filter((item) => {
      if (q && !`${item.title}\n${item.content}\n${item.source?.fileName ?? ""}`.toLocaleLowerCase().includes(q)) return false;
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (enabledFilter === "enabled" && !item.enabled) return false;
      if (enabledFilter === "disabled" && item.enabled) return false;
      const included = !!selectedSet?.itemIds.includes(item.id);
      if (selectedSet) {
        if (membershipFilter === "current" && !included) return false;
        if (membershipFilter === "outside" && included) return false;
      }
      return true;
    });
  }, [projectItems, query, kindFilter, enabledFilter, membershipFilter, selectedSet]);

  const selectedSetItems = useMemo(
    () => selectedSet ? projectItems.filter((item) => selectedSet.itemIds.includes(item.id) && item.enabled) : [],
    [selectedSet, projectItems],
  );
  const selectedSetTokens = estimateContextTokens(selectedSetItems);

  if (!open) return null;

  async function importFiles(files: FileList | null) {
    if (!files || !project) return;
    setImporting(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const imported = await importContextFile(file);
        onAddItem(importedFileToContext(imported, project.id), selectedSetId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function readReloadFile(files: FileList | null) {
    if (!files?.[0] || !reloadTarget) return;
    setError(null);
    try {
      const imported = await importContextFile(files[0]);
      setPendingReload({ target: reloadTarget, imported });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReloadTarget(null);
      if (reloadInputRef.current) reloadInputRef.current.value = "";
    }
  }

  function replaceExisting() {
    if (!pendingReload) return;
    const { target, imported } = pendingReload;
    onUpdateItem(target.id, {
      kind: imported.kind,
      content: imported.content,
      source: { ...(target.source ?? {}), fileName: imported.fileName, fileSize: imported.fileSize, mimeType: imported.mimeType },
      updatedAt: new Date().toISOString(),
    });
    setPendingReload(null);
  }

  function addAsNewVersion() {
    if (!pendingReload || !project) return;
    const { target, imported } = pendingReload;
    const next = importedFileToContext(imported, project.id);
    next.title = `${target.title} (${t("新しい版")})`;
    onAddItem(next, null);
    for (const set of sets) {
      if (set.itemIds.includes(target.id)) onToggleSetItem(set.id, next.id, true);
    }
    setPendingReload(null);
  }

  return <div className="context-overlay" role="dialog" aria-modal="true">
    <section className="context-window context-library-window">
      <header className="context-header">
        <div><strong>Context Library</strong><small>{project?.name ?? t("Project未選択")} — {t("Project Referenceの保管庫")}</small></div>
        <button className="secondary-button" onClick={onClose}>{t("閉じる")}</button>
      </header>

      <div className="library-toolbar">
        <input className="library-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("タイトル / 本文 / 元ファイル名を検索")} />
        <input ref={inputRef} hidden multiple type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => void importFiles(e.target.files)} />
        <input ref={reloadInputRef} hidden type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => void readReloadFile(e.target.files)} />
        <button className="primary-button" disabled={importing || !project} onClick={() => inputRef.current?.click()}>{importing ? t("読み込み中…") : `＋ ${t("ファイル追加")}`}</button>
      </div>

      <div className="library-filter-row">
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
          <option value="all">{t("形式: すべて")}</option><option value="text">TXT</option><option value="markdown">MD</option><option value="document">PDF / Document</option>
        </select>
        <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as typeof enabledFilter)}>
          <option value="all">{t("状態: すべて")}</option><option value="enabled">{t("有効のみ")}</option><option value="disabled">{t("無効のみ")}</option>
        </select>
        <select value={membershipFilter} disabled={!selectedSet} onChange={(e) => setMembershipFilter(e.target.value as typeof membershipFilter)}>
          <option value="all">{t("Set所属: すべて")}</option><option value="current">{t("現在のSetのみ")}</option><option value="outside">{t("現在のSet外")}</option>
        </select>
      </div>

      {error && <div className="library-error">⚠ {error}</div>}
      <div className="context-summary-bar">
        <span><strong>{projectItems.length}</strong> References</span>
        <span>Library {t("約")} <strong>{estimateContextTokens(projectItems).toLocaleString(numberLocale)}</strong> tokens</span>
        <span>{t("選択Set")}: <strong>{selectedSet?.name ?? t("なし")}</strong></span>
        {selectedSet && <span>{t("有効Reference 約")} <strong>{selectedSetTokens.toLocaleString(numberLocale)}</strong> tokens</span>}
      </div>

      {selectedSet && capacityTargets.length > 0 && <div className="library-capacity-row">
        <span className="muted">{t("Reference占有目安（会話履歴・Instruction・質問は別）")}</span>
        {capacityTargets.map((target) => {
          const ratio = target.maxContextTokens ? selectedSetTokens / target.maxContextTokens : null;
          const level = ratio != null && ratio > 1 ? "danger" : ratio != null && ratio > 0.8 ? "warning" : "normal";
          return <span key={target.label} className={`capacity-chip ${level}`}>
            {target.label}: {ratio == null ? t("上限不明") : `${Math.round(ratio * 100)}%`}
          </span>;
        })}
      </div>}

      <div className="library-list">
        {visible.length === 0 && <div className="context-empty">{t("条件に一致するProject Referenceはありません。")}</div>}
        {visible.map((item) => {
          const included = !!selectedSet?.itemIds.includes(item.id);
          const memberships = sets.filter((set) => set.itemIds.includes(item.id));
          return <article className="library-item" key={item.id}>
            <div className="library-item-main">
              <div className="library-item-title"><strong>{item.title}</strong><span className="context-badge">{kindLabel(item)}</span><span className="context-badge">{t("約")} {estimateContextTokens([item]).toLocaleString(numberLocale)} tokens</span></div>
              <small>{item.source?.fileName ?? "Reference"} · {t("更新日時")} {formatDateTime(item.updatedAt, timeZone)}</small>
              <div className="library-memberships">{memberships.length ? memberships.map((set) => <span className="context-badge" key={set.id}>Set: {set.name}</span>) : <span className="context-badge">{t("Set未所属")}</span>}</div>
              <p>{item.content.replace(/\s+/g, " ").slice(0, 240)}{item.content.length > 240 ? "…" : ""}</p>
            </div>
            <div className="library-item-actions">
              <label className="context-toggle"><input type="checkbox" checked={item.enabled} onChange={(e) => {
                if (!e.target.checked && item.provenance === "imported_conversation") setAiDisableTarget(item);
                else onToggleItem(item.id, e.target.checked);
              }} /> {t("有効")}</label>
              <button className="secondary-button" onClick={() => setDetailTarget(item)}>{t("詳細 / Preview")}</button>
              <button className="secondary-button" onClick={() => setRenameTarget(item)}>{t("タイトル変更")}</button>
              {item.source?.fileName && <button className="secondary-button" onClick={() => { setReloadTarget(item); window.setTimeout(() => reloadInputRef.current?.click(), 0); }}>{t("ファイル再読込")}</button>}
              {selectedSet && <button className="secondary-button" onClick={() => onToggleSetItem(selectedSet.id, item.id, !included)}>{t(included ? "Setから外す" : "Setに追加")}</button>}
              <button className="secondary-button danger-soft" onClick={() => setDeleteTarget(item)}>{t("削除")}</button>
            </div>
          </article>;
        })}
      </div>
      <footer className="library-footer"><small>{t("PDFは埋め込みテキストのみ抽出します。画像PDF/OCR、表構造の完全再現はまだ未対応です。Context上限超過時も自動削除・自動要約はしません。")}</small></footer>
    </section>

    {detailTarget && <div className="modal-backdrop" onMouseDown={() => setDetailTarget(null)}>
      <section className="library-detail-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><strong>{detailTarget.title}</strong><small>{kindLabel(detailTarget)} / {t(detailTarget.enabled ? "有効" : "無効")}</small></div><button className="secondary-button" onClick={() => setDetailTarget(null)}>{t("閉じる")}</button></header>
        <dl className="library-detail-meta">
          <div><dt>{t("元ファイル")}</dt><dd>{detailTarget.source?.fileName ?? "—"}</dd></div>
          <div><dt>{t("ファイルサイズ")}</dt><dd>{formatBytes(detailTarget.source?.fileSize)}</dd></div>
          <div><dt>MIME</dt><dd>{detailTarget.source?.mimeType ?? "—"}</dd></div>
          <div><dt>{t("追加日時")}</dt><dd>{formatDateTime(detailTarget.createdAt, timeZone)}</dd></div>
          <div><dt>{t("更新日時")}</dt><dd>{formatDateTime(detailTarget.updatedAt, timeZone)}</dd></div>
          <div><dt>{t("概算Token")}</dt><dd>{estimateContextTokens([detailTarget]).toLocaleString(numberLocale)}</dd></div>
          <div><dt>{t("所属Set")}</dt><dd>{sets.filter((set) => set.itemIds.includes(detailTarget.id)).map((set) => set.name).join(" / ") || t("なし")}</dd></div>
        </dl>
        <pre className="library-preview">{detailTarget.content}</pre>
      </section>
    </div>}

    {aiDisableTarget && <div className="modal-backdrop" onMouseDown={() => setAiDisableTarget(null)}>
      <section className="library-reload-modal" onMouseDown={(e) => e.stopPropagation()}>
        <strong>{t("AI Archive Referenceを無効化")}</strong>
        <p>{t("AI Archive Reference無効化確認", { name: aiDisableTarget.title })}</p>
        <div className="library-reload-actions">
          <button className="secondary-button" onClick={() => setAiDisableTarget(null)}>{t("キャンセル")}</button>
          <button className="secondary-button" onClick={() => { onToggleItem(aiDisableTarget.id, false); setAiDisableTarget(null); }}>{t("参照だけOFF")}</button>
          <button className="primary-button" onClick={() => { onDisableAiReferenceAndReset(aiDisableTarget.id); setAiDisableTarget(null); }}>{t("OFFして独立観測へ戻る")}</button>
        </div>
      </section>
    </div>}

    <PromptModal open={renameTarget !== null} title={t("Referenceタイトルを変更")} label={t("タイトル")} initialValue={renameTarget?.title ?? ""} confirmLabel={t("変更")} onCancel={() => setRenameTarget(null)} onConfirm={(title) => { if (renameTarget) onUpdateItem(renameTarget.id, { title, updatedAt: new Date().toISOString() }); setRenameTarget(null); }} />
    <ConfirmModal open={deleteTarget !== null} title={t("Libraryから削除")} message={deleteTarget ? t("Library削除確認", { name: deleteTarget.title }) : ""} confirmLabel={t("削除")} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) onRemoveItem(deleteTarget.id); setDeleteTarget(null); }} />

    {pendingReload && <div className="modal-backdrop" onMouseDown={() => setPendingReload(null)}>
      <section className="library-reload-modal" onMouseDown={(e) => e.stopPropagation()}>
        <strong>{t("ファイル再読込")}</strong>
        <p>{t("ファイル再読込確認", { title: pendingReload.target.title, file: pendingReload.imported.fileName })}</p>
        <small>{t("差し替えは現在のReference IDとSet所属を維持します。「新しい版」は元Referenceを残し、同じSetにも追加します。")}</small>
        <div className="library-reload-actions"><button className="secondary-button" onClick={() => setPendingReload(null)}>{t("戻る")}</button><button className="secondary-button" onClick={addAsNewVersion}>{t("新しい版として追加")}</button><button className="primary-button" onClick={replaceExisting}>{t("差し替える")}</button></div>
      </section>
    </div>}
  </div>;
}
