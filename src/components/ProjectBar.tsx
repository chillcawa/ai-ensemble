import { useState } from "react";
import type { Project } from "../project/types";
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { useI18n } from "../i18n";

export function ProjectBar({ projects, currentProjectId, onSelect, onCreate, onRename, onDelete, onOpenLibrary, onOpenArchive }: {
  projects: Project[];
  currentProjectId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  onOpenArchive: () => void;
}) {
  const { t } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const current = projects.find((p) => p.id === currentProjectId);
  return <>
    <div className="project-bar">
      <span className="project-bar-label">Project</span>
      <select value={currentProjectId} onChange={(e) => onSelect(e.target.value)}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <button className="secondary-button" onClick={() => setCreateOpen(true)}>＋ {t("新規")}</button>
      <button className="secondary-button" disabled={!current} onClick={() => setRenameOpen(true)}>{t("名前変更")}</button>
      <button className="secondary-button danger-soft" disabled={!current || current.id === "workspace-default" || projects.length <= 1} onClick={() => setDeleteOpen(true)}>{t("削除")}</button>
      <span className="project-bar-spacer" />
      <button className="secondary-button" onClick={onOpenArchive}>🗃 Conversation Archive</button>
      <button className="primary-button" onClick={onOpenLibrary}>📚 Context Library</button>
    </div>
    <PromptModal open={createOpen} title={t("新しいProject")} label={t("Project名")} placeholder={t("例: 新規プロジェクト")} confirmLabel={t("作成")} existingNames={projects.map((p) => p.name)} onCancel={() => setCreateOpen(false)} onConfirm={(name) => { onCreate(name); setCreateOpen(false); }} />
    <PromptModal open={renameOpen} title={t("Project名を変更")} label={t("Project名")} placeholder={current?.name ?? ""} initialValue={current?.name ?? ""} confirmLabel={t("変更")} existingNames={projects.filter((p) => p.id !== currentProjectId).map((p) => p.name)} onCancel={() => setRenameOpen(false)} onConfirm={(name) => { onRename(currentProjectId, name); setRenameOpen(false); }} />
    <ConfirmModal open={deleteOpen} title={t("Projectを削除")} message={t("Project削除確認", { name: current?.name ?? "" })} confirmLabel={t("削除")} onCancel={() => setDeleteOpen(false)} onConfirm={() => { onDelete(currentProjectId); setDeleteOpen(false); }} />
  </>;
}
