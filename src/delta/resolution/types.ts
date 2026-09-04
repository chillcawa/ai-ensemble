export type HumanDecision = "accept" | "reject" | "hold" | "other";

export interface HumanResolutionDraft {
  human_actor_id: string;
  target_ids: string[];
  basis_ids: string[];
  decision?: HumanDecision;
  decision_value?: string;
  candidate_id?: string;
  note?: string;
  close_unresolved?: boolean;
}

export interface DeltaResolutionRecord {
  resolution_id: string;
  decided_by_actor_id: string;
  decided_by_actor_type: "human";
  decision: HumanDecision;
  decision_value?: string;
  text?: string | null;
  target_ids: string[];
  basis_ids: string[];
  candidate_ids?: string[];
  created_at?: string;
}

export interface DeltaDecisionHistoryRecord {
  event_id: string;
  resolution_id: string;
  actor_id: string;
  actor_type: "human";
  from_decision: HumanDecision | null;
  to_decision: HumanDecision;
  note?: string | null;
  created_at?: string;
}

export interface DeltaRevisionRecord {
  revision_id: string;
  target_id: string;
  actor_id: string;
  revision_number: number;
  previous_revision_id?: string | null;
  change_type:
    | "create"
    | "edit"
    | "reextract"
    | "retranslate"
    | "reclassify"
    | "other";
  reason?: string | null;
  created_at?: string;
}

export interface DeltaReopenRequest {
  human_actor_id: string;
  target_ids: string[];
  reason: string;
}
