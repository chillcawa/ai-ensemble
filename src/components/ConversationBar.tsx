import type { ConversationSummary } from "../conversation/types";
import { useI18n } from "../i18n";

export function ConversationBar({ conversations, currentId, onSelect, onNew, onDelete }: {
  conversations: ConversationSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="conversation-bar">
      <div className="conversation-title-block">
        <strong>💬 Conversation</strong>
        <span>{t("通常対話はSQLiteへ保存され、再起動後も続きから再開できます。")}</span>
      </div>
      <div className="conversation-controls">
        <select value={currentId ?? ""} onChange={(e) => e.target.value && onSelect(e.target.value)}>
          <option value="">{t("新しい会話（未保存）")}</option>
          {conversations.map((conversation) => (
            <option value={conversation.id} key={conversation.id}>{conversation.title}</option>
          ))}
        </select>
        <button className="secondary-button" onClick={onNew}>＋ {t("新しい会話")}</button>
        <button className="secondary-button danger-soft" onClick={onDelete} disabled={!currentId}>{t("削除")}</button>
      </div>
    </section>
  );
}
