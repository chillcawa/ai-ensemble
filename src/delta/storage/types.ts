import type { DeltaAnalysisControllerResult } from "../controller/analyzeSavedTurn";
import type { CanonicalDeltaDocument } from "../translator/types";

export type DeltaPersistedStatus =
  | "ready"
  | "partial"
  | "error"
  | "resolved"
  | "review_required"
  | "new_information";

export interface DeltaAnalysisRecord {
  analysis_id: string;
  parent_analysis_id?: string;
  conversation_id: string;
  turn_id: string;
  /** Integration-side cohort identity. Optional for backward compatibility with pre-fix records. */
  cohort_key?: string;
  context_lineage_key?: string;
  run_id: string;
  query_message_id: string;
  response_message_ids: string[];
  status: DeltaPersistedStatus;
  schema_version: string;
  document: CanonicalDeltaDocument;
  /** Persist analysis diagnostics so a saved partial/error state remains explainable after reload. */
  failures?: DeltaAnalysisControllerResult["failures"];
  warnings?: string[];
  created_at: string;
  updated_at: string;
}

export interface DeltaAnalysisStorage {
  save(record: DeltaAnalysisRecord): Promise<void>;
  get(analysisId: string): Promise<DeltaAnalysisRecord | undefined>;
  listByTurn(conversationId: string, turnId: string): Promise<DeltaAnalysisRecord[]>;
  getLatestByTurn(conversationId: string, turnId: string): Promise<DeltaAnalysisRecord | undefined>;
}
