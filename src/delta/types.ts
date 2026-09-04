/**
 * Delta Protocol / ECHO integration sidecar types.
 * Phase 7 P7-A/P7-B/P7-C.
 * These are integration types, not Formal Schema additions.
 */

export type DeltaRunType = "baseline" | "derived";

export type DeltaProviderResponseStatus =
  | "ok"
  | "error"
  | "timeout"
  | "empty"
  | "refused";

export interface DeltaRunQuery {
  query_id: string;
  text: string;
  actor_id: string;
}

export interface DeltaRunProvider {
  provider_id: string;
  actor_id: string;
  actor_type: "ai";
  provider?: string;
  model?: string;
  label?: string;
}

export interface DeltaRunResponse {
  response_message_id: string;
  provider_id: string;
  actor_id: string;
  actor_type: "ai";
  status: DeltaProviderResponseStatus;
  content_type: "text";
  content: string | null;
  received_at?: string;
  model?: string;
  provider?: string;
  label?: string;
  applied_context_ids?: string[];
  applied_ai_reference_sources?: string[];
  run_type: DeltaRunType;
  context_lineage_key: string;
}

export interface EnsembleRun {
  run_id: string;
  run_type: DeltaRunType;
  query: DeltaRunQuery;
  providers: DeltaRunProvider[];
  responses: DeltaRunResponse[];
  context_lineage_key: string;
  parent_run_id?: string;
}

export interface EchoConversationMessageLike {
  id: string;
  role: "user" | "assistant" | string;
  kind?: string | null;
  content: string;
  slotId?: string | null;
  slot_id?: string | null;
  provider?: string | null;
  model?: string | null;
  nickname?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  appliedContextIds?: string[] | null;
  applied_context_ids?: string[] | null;
  appliedAiReferenceSources?: string[] | null;
  applied_ai_reference_sources?: string[] | null;
  responseStatus?: DeltaProviderResponseStatus | null;
  response_status?: DeltaProviderResponseStatus | null;
}

export interface BuildEnsembleRunOptions {
  humanActorId?: string;
  runId?: string;
  parentRunId?: string;
  cohortKey?: string;
}

export interface DeltaActor {
  actor_id: string;
  actor_type: "human" | "ai" | "system";
  display_name?: string | null;
  provider?: string | null;
  model?: string | null;
}

export interface DeltaOriginalInput {
  input_id: string;
  query_id: string;
  actor_id: string;
  content_type: "text";
  content: string;
  content_hash?: string;
  created_at?: string;
}

export interface DeltaSource {
  source_id: string;
  source_type: "original_input";
  input_id: string;
  label?: string;
}

export interface DeltaDocumentSeed {
  seed_version: "echo-delta-seed-0.1";
  document_id: string;
  schema_version: string;
  created_at?: string;
  query: DeltaRunQuery;
  actors: DeltaActor[];
  original_inputs: DeltaOriginalInput[];
  sources: DeltaSource[];
  response_statuses: Array<{
    response_message_id: string;
    provider_id: string;
    actor_id: string;
    status: DeltaProviderResponseStatus;
  }>;
  run_metadata: {
    run_id: string;
    run_type: DeltaRunType;
    context_lineage_key: string;
    parent_run_id?: string;
  };
}
