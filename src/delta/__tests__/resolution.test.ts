import { describe, expect, it } from "vitest";
import { createHumanResolution, reopenIssue } from "../resolution/controls";

function doc(): any {
  return {
    schema_version: "delta-protocol-schema-0.1",
    document_id: "doc:1",
    query: { query_id:"query:1", text:"Q?", actor_id:"actor:human-local" },
    actors: [
      { actor_id:"actor:human-local", actor_type:"human" },
      { actor_id:"actor:ai-a", actor_type:"ai" },
      { actor_id:"actor:comparator01", actor_type:"system" },
    ],
    original_inputs: [],
    sources: [],
    source_spans: [],
    bundles: [{
      bundle_id:"bundle:a", query_id:"query:1", actor_id:"actor:ai-a",
      original_input_id:"input:a",
      claims:[{ claim_id:"claim:a", actor_id:"actor:ai-a", text:"A" }],
      support:[], semantics:[], hypotheses:[], interpretations:[], dissents:[], counterpositions:[]
    }],
    relations: [],
    unresolved_states: [{
      state_id:"state:1", target_ids:["claim:a"], unresolved:true,
      states:["divergence"], note:"open"
    }],
    resolution_candidates: [{
      candidate_id:"candidate:1", actor_id:"actor:comparator01", actor_type:"system",
      proposal:"Accept A", target_ids:["claim:a"], suggested_decision:"accept",
      provenance:{ query_id:"query:1", original_input_ids:[], source_span_ids:[], derived_from_ids:["claim:a"], transformation:"comparison" }
    }],
    resolutions: [],
    revisions: [],
    decision_history: [],
    followups: [],
  };
}

describe("Delta P7-H Human Resolution", () => {
  it("rejects non-Human Resolution writer", () => {
    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:ai-a",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"accept",
    })).toThrow("only a registered Human Actor");
  });

  it("requires explicit decision and basis", () => {
    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:[],
    })).toThrow();
  });

  it("does not copy candidate suggested_decision", () => {
    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      candidate_id:"candidate:1",
    })).toThrow("decision must be explicitly selected");
  });

  it("accept appends Resolution/history/revision and closes overlapping unresolved", () => {
    const next = createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"accept",
      candidate_id:"candidate:1",
    }, "2026-09-02T00:00:00Z");

    expect(next.resolutions).toHaveLength(1);
    expect(next.decision_history).toHaveLength(1);
    expect(next.revisions).toHaveLength(1);
    expect(next.unresolved_states).toHaveLength(0);
    expect((next.resolutions[0] as any).decision).toBe("accept");
    expect((next.resolutions[0] as any).candidate_ids).toEqual(["candidate:1"]);
    expect((next.decision_history[0] as any).event_id).toBeTruthy();
    expect((next.revisions[0] as any).revision_number).toBe(1);
  });

  it("hold keeps unresolved", () => {
    const next = createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"hold",
    });
    expect(next.unresolved_states).toHaveLength(1);
  });

  it("requires explicit close/keep for decision=other", () => {
    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"other",
      decision_value:"custom",
    })).toThrow("requires explicit close_unresolved");

    const kept = createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"other",
      decision_value:"custom",
      close_unresolved:false,
    });
    expect(kept.unresolved_states).toHaveLength(1);
  });

  it("reopen retains old Resolution and creates a new Unresolved state", () => {
    const resolved = createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"accept",
    });

    const reopened = reopenIssue(resolved, {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      reason:"new evidence arrived",
    });

    expect(reopened.resolutions).toHaveLength(1);
    expect(reopened.unresolved_states).toHaveLength(1);
    expect(reopened.decision_history).toHaveLength(2);
    expect(reopened.revisions).toHaveLength(2);
  });
  it("rejects unknown target_id and basis_id", () => {
    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:missing"],
      basis_ids:["claim:a"],
      decision:"accept",
    })).toThrow("unknown target_id claim:missing");

    expect(() => createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:missing"],
      decision:"accept",
    })).toThrow("unknown basis_id claim:missing");
  });

  it("does not close a multi-target unresolved state on partial overlap", () => {
    const value = doc();
    value.bundles[0].claims.push({ claim_id:"claim:b", actor_id:"actor:ai-a", text:"B" });
    value.unresolved_states = [{
      state_id:"state:multi", target_ids:["claim:a", "claim:b"], unresolved:true,
      states:["divergence"], note:"open",
    }];

    const next = createHumanResolution(value, {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"accept",
    });

    expect(next.unresolved_states).toHaveLength(1);
    expect((next.unresolved_states[0] as any).state_id).toBe("state:multi");
  });

  it("rejects duplicate reopen when the same target is already unresolved", () => {
    const resolved = createHumanResolution(doc(), {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      basis_ids:["claim:a"],
      decision:"accept",
    });

    const reopened = reopenIssue(resolved, {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      reason:"new evidence arrived",
    });

    expect(() => reopenIssue(reopened, {
      human_actor_id:"actor:human-local",
      target_ids:["claim:a"],
      reason:"same issue again",
    })).toThrow("already represented by an open UnresolvedState");
  });

});
