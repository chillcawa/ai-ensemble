import { useMemo } from "react";
import { useI18n } from "../../i18n";
import type { ConversationMessage } from "../../conversation/types";
import { buildDeltaTurnCohorts } from "../echoBridge";

export function DeltaConversationInspector(props: {
  messages: ConversationMessage[];
}) {
  const { t } = useI18n();
  const cohorts = useMemo(
    () => buildDeltaTurnCohorts(props.messages),
    [props.messages],
  );

  return (
    <section style={{
      border: "1px solid rgba(127,127,127,.3)",
      borderRadius: 10,
      padding: 12,
      margin: "12px 0",
    }}>
      <strong>Delta Protocol — {t("統合確認")}</strong>
      <p style={{ opacity: .75 }}>
        {t("保存済みConversationのcohort一覧。原文全文は表示しません。")}
      </p>

      {cohorts.length === 0 ? (
        <p>{t("解析可能な保存済みTurnはありません。")}</p>
      ) : (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {cohorts.map((cohort, index) => {
            const queryId = String((cohort.queryMessage as { id?: string }).id || index);
            const preview = String((cohort.queryMessage as { content?: string }).content || "").slice(0, 72);
            return (
              <li key={`${queryId}:${cohort.cohortKey}`}>
                {cohort.runType.toUpperCase()} · {cohort.assistantMessages.length} {t("回答")}
                {preview ? ` · ${preview}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
