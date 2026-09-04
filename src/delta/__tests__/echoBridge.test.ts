import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "../../conversation/types";
import {
  buildDeltaTurnCohorts,
  buildEnsembleRunsFromConversation,
} from "../echoBridge";

function msg(value: any): ConversationMessage {
  return value as ConversationMessage;
}

describe("ECHO v1.3.5 Delta bridge", () => {
  it("groups one saved user turn into a baseline EnsembleRun", () => {
    const runs = buildEnsembleRunsFromConversation([
      msg({ id:"u1", role:"user", kind:"normal", content:"Q?" }),
      msg({ id:"a1", role:"assistant", kind:"normal", provider:"openai", model:"m1", content:"A", applied_ai_reference_sources:[], applied_context_ids:[] }),
      msg({ id:"a2", role:"assistant", kind:"normal", provider:"anthropic", model:"m2", content:"B", applied_ai_reference_sources:[], applied_context_ids:[] }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].run_type).toBe("baseline");
    expect(runs[0].responses).toHaveLength(2);
    expect(runs[0].query.query_id).toBe("query:u1");
  });

  it("separates derived response from independent baseline responses", () => {
    const cohorts = buildDeltaTurnCohorts([
      msg({ id:"u1", role:"user", content:"Q?" }),
      msg({ id:"a1", role:"assistant", kind:"normal", provider:"openai", model:"m1", content:"A", applied_ai_reference_sources:[] }),
      msg({ id:"a2", role:"assistant", kind:"normal", provider:"anthropic", model:"m2", content:"B", applied_ai_reference_sources:[] }),
      msg({ id:"a3", role:"assistant", kind:"handoff", provider:"grok", model:"m3", content:"C", applied_ai_reference_sources:["a1"] }),
    ]);

    expect(cohorts.map((c) => c.runType).sort()).toEqual(["baseline", "derived"]);
    expect(cohorts.find((c) => c.runType === "baseline")?.assistantMessages).toHaveLength(2);
    expect(cohorts.find((c) => c.runType === "derived")?.assistantMessages).toHaveLength(1);
  });

  it("does not cross the next user message boundary", () => {
    const runs = buildEnsembleRunsFromConversation([
      msg({ id:"u1", role:"user", content:"Q1" }),
      msg({ id:"a1", role:"assistant", kind:"normal", provider:"p1", model:"m", content:"A1" }),
      msg({ id:"u2", role:"user", content:"Q2" }),
      msg({ id:"a2", role:"assistant", kind:"normal", provider:"p2", model:"m", content:"A2" }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0].query.text).toBe("Q1");
    expect(runs[1].query.text).toBe("Q2");
  });
  it("keeps real applied_ai_reference_sources snapshots distinct and stable", () => {
    const cohorts = buildDeltaTurnCohorts([
      msg({ id:"u1", role:"user", kind:"normal", content:"Q?" }),
      msg({
        id:"a1", role:"assistant", kind:"normal", slot_id:"slot-a", provider:"openai", model:"m1", content:"A",
        applied_context_ids:[],
        applied_ai_reference_sources:[{
          contextId:"ctx-ref-1", provenance:"imported_conversation", archiveId:"arc-1",
          provider:"anthropic", model:"m2", slotId:"slot-b", capturedAt:"2026-09-04T00:00:00Z",
        }],
      }),
      msg({
        id:"a2", role:"assistant", kind:"normal", slot_id:"slot-a", provider:"openai", model:"m1", content:"B",
        applied_context_ids:[],
        applied_ai_reference_sources:[{
          contextId:"ctx-ref-2", provenance:"imported_conversation", archiveId:"arc-2",
          provider:"anthropic", model:"m2", slotId:"slot-b", capturedAt:"2026-09-04T00:00:01Z",
        }],
      }),
    ]);

    expect(cohorts).toHaveLength(2);
    expect(cohorts[0].cohortKey).not.toContain("[object Object]");
    expect(cohorts[1].cohortKey).not.toContain("[object Object]");
    expect(cohorts[0].cohortKey).not.toBe(cohorts[1].cohortKey);
  });

  it("separates baseline cohorts with the same query but different context lineage", () => {
    const cohorts = buildDeltaTurnCohorts([
      msg({ id:"u1", role:"user", kind:"normal", content:"Q?" }),
      msg({ id:"a1", role:"assistant", kind:"normal", slot_id:"slot-a", provider:"openai", model:"m1", content:"A", applied_context_ids:[], applied_ai_reference_sources:[] }),
      msg({ id:"a2", role:"assistant", kind:"normal", slot_id:"slot-b", provider:"anthropic", model:"m2", content:"B", applied_context_ids:["ctx:foo"], applied_ai_reference_sources:[] }),
    ]).filter((cohort) => cohort.runType === "baseline");

    expect(cohorts).toHaveLength(2);
    expect(cohorts.map((cohort) => cohort.cohortKey).sort()).toEqual([
      "baseline|ctx:ctx:foo|refs:none",
      "baseline|ctx:none|refs:none",
    ]);
  });

});
