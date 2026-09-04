import { describe, expect, it } from "vitest";
import { canonicalizeTranslatorOutput } from "../translator/canonicalize";

describe("Translator ID canonicalization", () => {
  it("repairs legacy extra-colon IDs and synchronized SourceSpan references", () => {
    const parsed: any = {
      source_spans: [
        {
          source_span_id: "span:m1:0",
          source_id: "source:m1",
          locator: { kind: "line_range", line_start: 1, line_end: 1 },
        },
      ],
      bundle: {
        bundle_id: "bundle:m1",
        query_id: "query:q1",
        actor_id: "actor:a",
        original_input_id: "input:m1",
        claims: [
          {
            claim_id: "claim:m1:0",
            actor_id: "actor:a",
            text: "x",
            provenance: {
              query_id: "query:q1",
              original_input_ids: ["input:m1"],
              source_span_ids: ["span:m1:0"],
              derived_from_ids: [],
              transformation: "extraction",
            },
            evidentiary_status: "not_assessed",
            assumption_ids: [],
            condition_ids: [],
            scope_ids: [],
            evidence_ids: [],
            observation_ids: [],
          },
        ],
        support: [],
        semantics: [],
        hypotheses: [],
        interpretations: [],
        dissents: [],
        counterpositions: [],
      },
      warnings: [],
    };

    const next = canonicalizeTranslatorOutput({
      parsed,
      queryId: "query:q1",
      actorId: "actor:a",
      inputId: "input:m1",
      sourceId: "source:m1",
    });

    expect(next.source_spans[0].source_span_id).toBe("span:m1-0");
    expect(next.bundle.claims[0].claim_id).toBe("claim:m1-0");
    expect(next.bundle.claims[0].provenance.source_span_ids).toEqual([
      "span:m1-0",
    ]);
  });
});
