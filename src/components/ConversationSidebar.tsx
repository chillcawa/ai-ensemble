import { useMemo, useState } from "react";
import type { ConversationSummary } from "../conversation/types";
import type { Project } from "../project/types";
import { formatDateTime } from "../time/display";
import { useI18n } from "../i18n";


export function ConversationSidebar({
  open,
  conversations,
  projects,
  currentProjectId,
  currentId,
  timeZone,
  onToggle,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onMove,
}: {
  open: boolean;
  conversations: ConversationSummary[];
  projects: Project[];
  currentProjectId: string;
  currentId: string | null;
  timeZone: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, targetProjectId: string) => void;
}) {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [moveTarget, setMoveTarget] = useState<ConversationSummary | null>(null);
  const [moveProjectId, setMoveProjectId] = useState("");
  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [conversations]);
  const moveProjects = projects.filter((project) => project.id !== currentProjectId);

  if (!open) {
    return <aside className="conversation-sidebar collapsed"><button className="sidebar-toggle" onClick={onToggle} title={t("Conversationを開く")}>☰</button><button className="sidebar-new compact" onClick={onNew} title={t("新しい会話")}>＋</button></aside>;
  }

  return <>
    <aside className="conversation-sidebar">
      <div className="sidebar-header"><strong>Conversations</strong><button className="sidebar-toggle" onClick={onToggle} title={t("折りたたむ")}>◀</button></div>
      <button className="sidebar-new" onClick={onNew}>＋ {t("新しい会話")}</button>
      <div className="sidebar-caption">{t("最新更新順")}</div>
      <div className="conversation-sidebar-list">
        {sorted.length === 0 && <div className="sidebar-empty">{t("まだ会話はありません。")}</div>}
        {sorted.map((conversation) => {
          const active = conversation.id === currentId;
          const renaming = renamingId === conversation.id;
          return <div className={active ? "conversation-sidebar-item active" : "conversation-sidebar-item"} key={conversation.id}>
            {renaming ? <form className="conversation-rename-form" onSubmit={(e) => { e.preventDefault(); const value = draft.trim(); if (value) onRename(conversation.id, value); setRenamingId(null); }}>
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }} />
              <button type="submit" title={t("保存")}>✓</button>
            </form> : <button className="conversation-sidebar-main" onClick={() => onSelect(conversation.id)}><span>{conversation.title}</span><small>{formatDateTime(conversation.updated_at, timeZone, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></button>}
            {!renaming && <div className="conversation-sidebar-actions">
              <button onClick={() => { setDraft(conversation.title); setRenamingId(conversation.id); }} title={t("名前変更")}>✎</button>
              {moveProjects.length > 0 && <button onClick={() => { setMoveTarget(conversation); setMoveProjectId(moveProjects[0]?.id ?? ""); }} title={t("別Projectへ移動")}>↗</button>}
              <button onClick={() => onDelete(conversation.id)} title={t("削除")}>×</button>
            </div>}
          </div>;
        })}
      </div>
    </aside>

    {moveTarget && <div className="modal-backdrop" onMouseDown={() => setMoveTarget(null)}>
      <section className="conversation-move-modal" onMouseDown={(e) => e.stopPropagation()}>
        <strong>{t("Conversationを移動")}</strong>
        <p>{t("会話を別Projectへ移動します", { title: moveTarget.title })}</p>
        <label>{t("移動先Project")}</label>
        <select value={moveProjectId} onChange={(e) => setMoveProjectId(e.target.value)}>{moveProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <small>{t("Conversation Session Contextは会話と一緒に移動します。Context Setの選択はProject境界を越えて引き継がず、移動先では「Setなし」になります。")}</small>
        <div className="conversation-move-actions"><button className="secondary-button" onClick={() => setMoveTarget(null)}>{t("キャンセル")}</button><button className="primary-button" disabled={!moveProjectId} onClick={() => { if (moveProjectId) onMove(moveTarget.id, moveProjectId); setMoveTarget(null); }}>{t("移動")}</button></div>
      </section>
    </div>}
  </>;
}
