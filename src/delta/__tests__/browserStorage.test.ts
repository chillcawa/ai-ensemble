import { describe, expect, it } from "vitest";
import { newDeltaAnalysisId } from "../storage/browserStorage";

describe("Delta browser persistence helpers", () => {
  it("generates unique append-only analysis ids", () => {
    const a = newDeltaAnalysisId();
    const b = newDeltaAnalysisId();
    expect(a.startsWith("analysis:")).toBe(true);
    expect(b.startsWith("analysis:")).toBe(true);
    expect(a).not.toBe(b);
  });
});
