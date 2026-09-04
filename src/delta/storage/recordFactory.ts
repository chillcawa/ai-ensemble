import type { DeltaAnalysisControllerResult } from "../controller/analyzeSavedTurn";
import type { DeltaAnalysisRecord, DeltaPersistedStatus } from "./types";

function statusFromController(result: DeltaAnalysisControllerResult): DeltaPersistedStatus {
  return result.status;
}

export function createDeltaAnalysisRecord(args: {
  analysisId: string;
  parentAnalysisId?: string;
  conversationId: string;
  turnId: string;
  cohortKey?: string;
  contextLineageKey?: string;
  queryMessageId: string;
  responseMessageIds: string[];
  result: DeltaAnalysisControllerResult;
  createdAt: string;
}): DeltaAnalysisRecord {
  if (!args.result.document || !args.result.run_id) {
    throw new Error("Delta Storage: canonical DeltaDocument and run_id are required");
  }

  return {
    analysis_id: args.analysisId,
    parent_analysis_id: args.parentAnalysisId,
    conversation_id: args.conversationId,
    turn_id: args.turnId,
    cohort_key: args.cohortKey,
    context_lineage_key: args.contextLineageKey,
    run_id: args.result.run_id,
    query_message_id: args.queryMessageId,
    response_message_ids: [...args.responseMessageIds],
    status: statusFromController(args.result),
    schema_version: args.result.document.schema_version,
    document: args.result.document,
    failures: args.result.failures.map((failure) => ({ ...failure })),
    warnings: [...args.result.warnings],
    created_at: args.createdAt,
    updated_at: args.createdAt,
  };
}
