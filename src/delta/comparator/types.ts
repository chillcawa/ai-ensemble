import type { DeltaIRBundle, DeltaSourceSpan } from "../translator/types";

export interface DeltaRelation {
  relation_id: string;
  kind: "agreement" | "conditional_agreement" | "mismatch" | "contradiction";
  actor_id: string;
  target_ids: string[];
  condition_ids?: string[];
  scope_ids?: string[];
  confidence?: {
    type: "comparison";
    value?: number;
    unit?: "percent";
    qualitative?: "low" | "medium" | "high";
    basis?: string;
  };
  provenance: {
    query_id: string;
    original_input_ids: string[];
    source_span_ids: string[];
    derived_from_ids: string[];
    transformation: "comparison";
  };
  note?: string;
}

export interface DeltaUnresolvedState {
  state_id: string;
  target_ids: string[];
  unresolved: true;
  states: Array<"unknown" | "divergence" | "deadlock">;
  note?: string;
}

export interface DeltaResolutionCandidate {
  candidate_id: string;
  actor_id: string;
  actor_type: "ai" | "system";
  proposal: string;
  target_ids: string[];
  suggested_decision?: "accept" | "reject" | "hold" | "other";
  provenance: {
    query_id: string;
    original_input_ids: string[];
    source_span_ids: string[];
    derived_from_ids: string[];
    transformation: "comparison";
  };
  confidence?: {
    type: "comparison";
    value?: number;
    unit?: "percent";
    qualitative?: "low" | "medium" | "high";
    basis?: string;
  };
}

export interface ComparatorFragment {
  actors: Array<{
    actor_id: string;
    actor_type: "system";
    display_name?: string;
  }>;
  relations: DeltaRelation[];
  unresolved_states: DeltaUnresolvedState[];
  resolution_candidates: DeltaResolutionCandidate[];
}

export interface ComparatorRunInput {
  query: { query_id: string; text: string };
  bundles: DeltaIRBundle[];
  source_spans: DeltaSourceSpan[];
}

export interface ComparatorModel {
  complete(request: { system: string; user: string }): Promise<string>;
}

export interface ComparatorRunResult {
  fragment: ComparatorFragment;
  raw_model_output: string;
  warnings: string[];
}
