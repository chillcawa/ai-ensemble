import { describe, expect, it } from "vitest";
import {
  buildEnsembleRunFromSavedTurn,
  groupAssistantMessagesByDeltaCohort,
} from "../adapter";

const user = { id:"u1", role:"user", content:"Q?" };

describe("P7 review fixes — Adapter", () => {
  it("does not silently mix baseline and derived responses", () => {
    expect(() => buildEnsembleRunFromSavedTurn(user, [
      { id:"a", role:"assistant", kind:"normal", provider:"a", model:"m", content:"A", appliedAiReferenceSources:[] },
      { id:"b", role:"assistant", kind:"normal", provider:"b", model:"m", content:"B", appliedAiReferenceSources:["a"] },
    ])).toThrow("mixed Baseline/Derived");
  });

  it("separates distinct derived lineages", () => {
    const groups = groupAssistantMessagesByDeltaCohort([
      { id:"a", role:"assistant", kind:"normal", provider:"a", model:"m", content:"A", appliedAiReferenceSources:["x"] },
      { id:"b", role:"assistant", kind:"normal", provider:"b", model:"m", content:"B", appliedAiReferenceSources:["y"] },
    ]);
    expect(groups.size).toBe(2);
  });

  it("preserves explicit refused status with text", () => {
    const run = buildEnsembleRunFromSavedTurn(user, [{
      id:"r1", role:"assistant", provider:"a", model:"m",
      content:"I cannot help with that.", responseStatus:"refused"
    }]);
    expect(run.responses[0].status).toBe("refused");
    expect(run.responses[0].content).toBe("I cannot help with that.");
  });
});
