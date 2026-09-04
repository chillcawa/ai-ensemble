import type { DeltaActor, DeltaDocumentSeed, DeltaOriginalInput, DeltaSource } from "../types";

export interface DeltaProvenance {
  query_id: string;
  original_input_ids: string[];
  source_span_ids: string[];
  derived_from_ids: string[];
  transformation: "manual" | "extraction" | "translation" | "comparison" | "revision" |
    "reextraction" | "retranslation" | "other" | null;
}

export interface DeltaSourceSpan {
  source_span_id: string;
  source_id: string;
  locator: {
    kind: "char_range" | "line_range" | "json_pointer" | "other";
    char_start?: number;
    char_end?: number;
    line_start?: number;
    line_end?: number;
    json_pointer?: string;
    value?: string;
  };
  quote_hint?: string | null;
}

export interface DeltaClaim {
  claim_id: string;
  actor_id: string;
  text: string;
  provenance: DeltaProvenance;
  evidentiary_status: "missing" | "insufficient" | "sufficient" | "not_assessed";
  assumption_ids: string[];
  condition_ids: string[];
  scope_ids: string[];
  evidence_ids: string[];
  observation_ids: string[];
  confidence?: unknown;
}

export interface DeltaIRBundle {
  bundle_id: string;
  query_id: string;
  actor_id: string;
  original_input_id: string;
  claims: DeltaClaim[];
  support: unknown[];
  semantics: unknown[];
  hypotheses: unknown[];
  interpretations: unknown[];
  dissents: unknown[];
  counterpositions: unknown[];
}

export interface TranslatorFragment {
  query: DeltaDocumentSeed["query"];
  actors: DeltaActor[];
  original_inputs: DeltaOriginalInput[];
  sources: DeltaSource[];
  source_spans: DeltaSourceSpan[];
  bundle: DeltaIRBundle;
}

export interface TranslatorModelRequest {
  system: string;
  user: string;
}

export interface TranslatorModel {
  complete(request: TranslatorModelRequest): Promise<string>;
}

export interface TranslatorRunResult {
  fragment: TranslatorFragment;
  raw_model_output: string;
  warnings: string[];
}

export interface CanonicalDeltaDocument {
  schema_version: string;
  document_id: string;
  created_at?: string;
  query: DeltaDocumentSeed["query"];
  actors: DeltaActor[];
  original_inputs: DeltaOriginalInput[];
  sources: DeltaSource[];
  source_spans: DeltaSourceSpan[];
  bundles: DeltaIRBundle[];
  relations: unknown[];
  unresolved_states: unknown[];
  resolution_candidates: unknown[];
  resolutions: unknown[];
  revisions: unknown[];
  decision_history: unknown[];
  followups: unknown[];
}


export type TranslatorItemStatus = "success" | "error";

export interface TranslatorBatchItemResult {
  input_id: string;
  actor_id: string;
  status: TranslatorItemStatus;
  fragment?: TranslatorFragment;
  raw_model_output?: string;
  warnings: string[];
  error?: string;
}

export interface TranslatorBatchResult {
  status: "translated" | "partial" | "error";
  total_inputs: number;
  success_count: number;
  error_count: number;
  items: TranslatorBatchItemResult[];
  fragments: TranslatorFragment[];
}
