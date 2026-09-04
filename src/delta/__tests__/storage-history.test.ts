import { describe, expect, it } from "vitest";
import { InMemoryDeltaAnalysisStorage } from "../storage/memoryStorage";
import { derivePostResolutionStatus } from "../history/reviewState";
import { buildDeltaHistoryViewModel } from "../history/viewModel";

function doc(): any {
  return {
    schema_version:"delta-protocol-schema-0.1",
    document_id:"doc:1",
    query:{query_id:"query:1",text:"Q?",actor_id:"actor:human-local"},
    actors:[],
    original_inputs:[],
    sources:[],
    source_spans:[],
    bundles:[{bundle_id:"bundle:1",query_id:"query:1",actor_id:"actor:a",original_input_id:"input:a",
      claims:[],support:[],semantics:[],hypotheses:[],interpretations:[],dissents:[],counterpositions:[]}],
    relations:[],
    unresolved_states:[],
    resolution_candidates:[],
    resolutions:[],
    revisions:[],
    decision_history:[],
    followups:[],
  };
}

describe("Delta P7-I persistence/history", () => {
  it("enforces append-only analysis_id storage", async () => {
    const storage = new InMemoryDeltaAnalysisStorage();
    const record: any = {
      analysis_id:"analysis:1",
      conversation_id:"conv:1",
      turn_id:"turn:1",
      run_id:"run:1",
      query_message_id:"q1",
      response_message_ids:["a1"],
      status:"ready",
      schema_version:"delta-protocol-schema-0.1",
      document:doc(),
      created_at:"2026-09-02T00:00:00Z",
      updated_at:"2026-09-02T00:00:00Z",
    };
    await storage.save(record);
    await expect(storage.save(record)).rejects.toThrow("append-only violation");
  });

  it("marks new info after Resolution as review_required without deleting Resolution", () => {
    const d = doc();
    d.resolutions.push({ resolution_id:"resolution:1" });
    const status = derivePostResolutionStatus({
      document:d,
      newInformation:{ new_response_ids:["resp:new"], reason:"provider regenerated" },
    });
    expect(status).toBe("review_required");
    expect(d.resolutions).toHaveLength(1);
  });

  it("marks new info without Resolution as new_information", () => {
    const status = derivePostResolutionStatus({
      document:doc(),
      newInformation:{ new_response_ids:["resp:new"], reason:"new provider response" },
    });
    expect(status).toBe("new_information");
  });

  it("builds append-only history presentation", () => {
    const d = doc();
    d.resolutions.push({
      resolution_id:"resolution:1", actor_id:"actor:human-local",
      decision:"accept", created_at:"2026-09-02T00:00:01Z"
    });
    d.decision_history.push({
      history_id:"history:1", actor_id:"actor:human-local",
      event_type:"resolution_created", created_at:"2026-09-02T00:00:02Z"
    });
    d.revisions.push({
      revision_id:"revision:1", actor_id:"actor:human-local",
      change_type:"resolution", created_at:"2026-09-02T00:00:03Z"
    });

    const items = buildDeltaHistoryViewModel(d);
    expect(items.map((x) => x.kind)).toEqual([
      "resolution", "decision_history", "revision"
    ]);
  });
});
