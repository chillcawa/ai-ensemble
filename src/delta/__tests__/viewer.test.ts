import { describe, expect, it } from "vitest";
import { buildDeltaOverviewViewModel } from "../ui/overviewViewModel";
import { traceClaimToSource } from "../ui/trace";

const document: any = {
  schema_version: "delta-protocol-schema-0.1",
  document_id: "doc:1",
  query: { query_id: "query:1", text: "Q?", actor_id: "actor:human-local" },
  actors: [
    { actor_id: "actor:a", actor_type: "ai", display_name: "A" },
    { actor_id: "actor:b", actor_type: "ai", display_name: "B" },
    { actor_id: "actor:comparator01", actor_type: "system" },
  ],
  original_inputs: [
    { input_id: "input:a", query_id: "query:1", actor_id: "actor:a", content_type: "text", content: "A text" },
  ],
  sources: [{ source_id: "source:a", source_type: "original_input", input_id: "input:a" }],
  source_spans: [{
    source_span_id: "span:a",
    source_id: "source:a",
    locator: { kind: "char_range", char_start: 0, char_end: 6 },
    quote_hint: "A text",
  }],
  bundles: [{
    bundle_id: "bundle:a",
    query_id: "query:1",
    actor_id: "actor:a",
    original_input_id: "input:a",
    claims: [{
      claim_id: "claim:a",
      actor_id: "actor:a",
      text: "A claim",
      provenance: {
        query_id: "query:1",
        original_input_ids: ["input:a"],
        source_span_ids: ["span:a"],
        derived_from_ids: [],
        transformation: "extraction",
      },
      evidentiary_status: "not_assessed",
      assumption_ids: [], condition_ids: [], scope_ids: [],
      evidence_ids: [], observation_ids: [],
    }],
    support: [], semantics: [], hypotheses: [], interpretations: [],
    dissents: [], counterpositions: [],
  }],
  relations: [],
  unresolved_states: [],
  resolution_candidates: [],
  resolutions: [],
  revisions: [],
  decision_history: [],
  followups: [],
};

describe("Delta P7-G viewer models", () => {
  it("builds overview counts without inventing protocol meaning", () => {
    const vm = buildDeltaOverviewViewModel({
      status: "ready",
      document,
      failures: [],
      warnings: [],
    } as any);
    expect(vm.actor_count).toBe(3);
    expect(vm.bundle_count).toBe(1);
    expect(vm.relation_count).toBe(0);
  });

  it("traces Claim -> SourceSpan -> OriginalInput", () => {
    const trace = traceClaimToSource(document, "claim:a");
    expect(trace.source_spans.map((s: any) => s.source_span_id)).toEqual(["span:a"]);
    expect(trace.original_inputs.map((i: any) => i.input_id)).toEqual(["input:a"]);
  });
});
