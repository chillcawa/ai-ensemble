import { useI18n } from "../../i18n";
import type { CanonicalDeltaDocument } from "../translator/types";
import { buildDeltaHistoryViewModel } from "../history/viewModel";

function localizeHistorySummary(summary: string, t: (key: string) => string): string {
  if (summary.startsWith("Resolution:")) {
    return summary.replace(/^Resolution:/, `${t("解決（Resolution）")}:`);
  }
  if (summary.startsWith("DecisionHistory:")) {
    return summary.replace(/^DecisionHistory:/, `${t("決定履歴（DecisionHistory）")}:`);
  }
  if (summary.startsWith("Decision:")) {
    return summary.replace(/^Decision:/, `${t("決定（Decision）")}:`);
  }
  if (summary.startsWith("Revision #")) {
    return summary.replace(/^Revision #/, `${t("改訂（Revision）")} #`);
  }
  return summary;
}

export function DeltaHistoryView(props: {
  document: CanonicalDeltaDocument;
}) {
  const { t } = useI18n();
  const items = buildDeltaHistoryViewModel(props.document);

  if (!items.length) {
    return <p>{t("履歴はまだありません。")}</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <section
          key={`${item.kind}:${item.id}`}
          style={{
            border: "1px solid rgba(127,127,127,.25)",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <strong>{
            item.kind === "resolution"
              ? t("解決（Resolution）")
              : item.kind === "decision_history"
                ? t("決定履歴（DecisionHistory）")
                : t("改訂（Revision）")
          }</strong>
          <div>{localizeHistorySummary(item.summary, t)}</div>
          <small style={{ opacity: .7 }}>
            {item.actor_id || t("不明なActor")}
            {item.created_at ? ` · ${item.created_at}` : ""}
          </small>
        </section>
      ))}
    </div>
  );
}
