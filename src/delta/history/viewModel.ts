import type { CanonicalDeltaDocument } from "../translator/types";

export interface DeltaHistoryItem {
  kind: "resolution" | "decision_history" | "revision";
  id: string;
  actor_id?: string;
  created_at?: string;
  summary: string;
}

export function buildDeltaHistoryViewModel(
  doc: CanonicalDeltaDocument,
): DeltaHistoryItem[] {
  const items: DeltaHistoryItem[] = [];

  for (const resolution of doc.resolutions as any[]) {
    items.push({
      kind: "resolution",
      id: resolution.resolution_id,
      actor_id:
        resolution.decided_by_actor_id || resolution.actor_id,
      created_at: resolution.created_at,
      summary: `Resolution: ${resolution.decision}${
        resolution.decision_value
          ? ` (${resolution.decision_value})`
          : ""
      }`,
    });
  }

  for (const history of doc.decision_history as any[]) {
    items.push({
      kind: "decision_history",
      id: history.event_id || history.history_id,
      actor_id: history.actor_id,
      created_at: history.created_at,
      summary:
        history.event_type
          ? `DecisionHistory: ${history.event_type}`
          : `Decision: ${history.from_decision ?? "none"} → ${
              history.to_decision
            }${history.note ? ` · ${history.note}` : ""}`,
    });
  }

  for (const revision of doc.revisions as any[]) {
    items.push({
      kind: "revision",
      id: revision.revision_id,
      actor_id: revision.actor_id,
      created_at: revision.created_at,
      summary: `Revision #${
        revision.revision_number ?? "?"
      }: ${revision.change_type}${
        revision.reason ? ` · ${revision.reason}` : ""
      }`,
    });
  }

  return items.sort((a, b) =>
    String(a.created_at || "").localeCompare(
      String(b.created_at || ""),
    ),
  );
}
