import { describe, expect, it } from "vitest";
import { runComparator } from "../comparator/runner";
import type { ComparatorModel } from "../comparator/types";

const bundles: any[] = [
  {
    bundle_id: "bundle:a", query_id: "query:q1", actor_id: "actor:a",
    original_input_id: "input:a",
    claims: [{ claim_id: "claim:a1", actor_id: "actor:a", text: "X",
      provenance: { query_id: "query:q1", original_input_ids:["input:a"], source_span_ids:["span:a"], derived_from_ids:[], transformation:"extraction" },
      evidentiary_status:"not_assessed", assumption_ids:[], condition_ids:[], scope_ids:[], evidence_ids:[], observation_ids:[] }],
    support:[], semantics:[], hypotheses:[], interpretations:[], dissents:[], counterpositions:[]
  },
  {
    bundle_id: "bundle:b", query_id: "query:q1", actor_id: "actor:b",
    original_input_id: "input:b",
    claims: [{ claim_id: "claim:b1", actor_id: "actor:b", text: "not X",
      provenance: { query_id: "query:q1", original_input_ids:["input:b"], source_span_ids:["span:b"], derived_from_ids:[], transformation:"extraction" },
      evidentiary_status:"not_assessed", assumption_ids:[], condition_ids:[], scope_ids:[], evidence_ids:[], observation_ids:[] }],
    support:[], semantics:[], hypotheses:[], interpretations:[], dissents:[], counterpositions:[]
  }
];

function goodModel(): ComparatorModel {
  return {
    async complete() {
      return JSON.stringify({
        actors: [{ actor_id:"actor:comparator01", actor_type:"system", display_name:"Comparator" }],
        relations: [{
          relation_id:"relation:r1", kind:"contradiction", actor_id:"actor:comparator01",
          target_ids:["claim:a1","claim:b1"], condition_ids:[], scope_ids:[],
          confidence:{ type:"comparison", qualitative:"high" },
          provenance:{ query_id:"query:q1", original_input_ids:["input:a","input:b"], source_span_ids:["span:a","span:b"], derived_from_ids:["claim:a1","claim:b1"], transformation:"comparison" }
        }],
        unresolved_states: [],
        resolution_candidates: [],
        warnings: []
      });
    }
  };
}

describe("Delta P7-E Comparator", () => {
  it("produces a validated cross-Actor relation", async () => {
    const result = await runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles, source_spans:[] },
      model: goodModel(),
    });
    expect(result.fragment.relations).toHaveLength(1);
    expect(result.fragment.relations[0].actor_id).toBe("actor:comparator01");
  });

  it("rejects Comparator use with only one Bundle", async () => {
    await expect(runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles:[bundles[0]], source_spans:[] },
      model: goodModel(),
    })).rejects.toThrow("at least two valid Bundles");
  });

  it("rejects candidate authored by compared Actor", async () => {
    const model: ComparatorModel = {
      async complete() {
        return JSON.stringify({
          actors: [{ actor_id:"actor:comparator01", actor_type:"system" }],
          relations: [],
          unresolved_states: [],
          resolution_candidates: [{
            candidate_id:"candidate:c1",
            actor_id:"actor:a",
            actor_type:"ai",
            proposal:"Choose A",
            target_ids:["claim:a1","claim:b1"],
            provenance:{ query_id:"query:q1", original_input_ids:["input:a","input:b"], source_span_ids:[], derived_from_ids:["claim:a1","claim:b1"], transformation:"comparison" }
          }],
          warnings:[]
        });
      }
    };
    await expect(runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles, source_spans:[] },
      model,
    })).rejects.toThrow("candidate actor must be Comparator system Actor");
  });

  it("rechecks a structurally valid empty comparison once and accepts a defensible relation", async () => {
    let calls = 0;
    const model: ComparatorModel = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          return JSON.stringify({
            actors: [{ actor_id:"actor:delta-comparator", actor_type:"system" }],
            relations: [],
            unresolved_states: [],
            resolution_candidates: [],
            warnings: []
          });
        }
        return JSON.stringify({
          actors: [{ actor_id:"actor:delta-comparator", actor_type:"system" }],
          relations: [{
            relation_id:"relation:reviewed", kind:"contradiction", actor_id:"actor:delta-comparator",
            target_ids:["claim:a1","claim:b1"], condition_ids:[], scope_ids:[],
            confidence:{ type:"comparison", qualitative:"high" },
            provenance:{ query_id:"query:q1", original_input_ids:["input:a","input:b"], source_span_ids:["span:a","span:b"], derived_from_ids:["claim:a1","claim:b1"], transformation:"comparison" }
          }],
          unresolved_states: [],
          resolution_candidates: [],
          warnings: []
        });
      }
    };

    const result = await runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles, source_spans:[] },
      model,
    });

    expect(calls).toBe(2);
    expect(result.fragment.relations).toHaveLength(1);
    expect(result.fragment.relations[0].relation_id).toBe("relation:reviewed");
  });

  it("keeps a confirmed empty comparison valid and records why it is empty", async () => {
    let calls = 0;
    const model: ComparatorModel = {
      async complete() {
        calls += 1;
        return JSON.stringify({
          actors: [{ actor_id:"actor:delta-comparator", actor_type:"system" }],
          relations: [],
          unresolved_states: [],
          resolution_candidates: [],
          warnings: calls === 2 ? ["No cross-Actor Claim pair is safely classifiable."] : []
        });
      }
    };

    const result = await runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles, source_spans:[] },
      model,
    });

    expect(calls).toBe(2);
    expect(result.fragment.relations).toEqual([]);
    expect(result.warnings).toContain("No cross-Actor Claim pair is safely classifiable.");
  });

  it("rejects Unresolved created only because Human has not decided", async () => {
    const model: ComparatorModel = {
      async complete() {
        return JSON.stringify({
          actors: [{ actor_id:"actor:comparator01", actor_type:"system" }],
          relations: [],
          unresolved_states: [{
            state_id:"state:s1", target_ids:["claim:a1","claim:b1"], unresolved:true,
            states:["divergence"], note:"Human decision not yet recorded."
          }],
          resolution_candidates: [],
          warnings:[]
        });
      }
    };
    await expect(runComparator({
      input: { query:{query_id:"query:q1", text:"Q?"}, bundles, source_spans:[] },
      model,
    })).rejects.toThrow("Human Resolution absence alone cannot justify Unresolved");
  });
});
