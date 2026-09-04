import { expect, it } from "vitest";
import { createDeltaDocumentSeed } from "../seed";
import { runTranslatorForInput } from "../translator/runner";
import { promoteSeedWithFragments } from "../promote";
import type { TranslatorModel } from "../translator/types";

function seed() {
  return createDeltaDocumentSeed({
    run_id: "run:q1",
    run_type: "baseline",
    context_lineage_key: "ctx:none",
    query: { query_id: "query:q1", text: "Q?", actor_id: "actor:human-local" },
    providers: [{
      provider_id: "grok", actor_id: "actor:grok-model", actor_type: "ai",
      provider: "grok", model: "model",
    }],
    responses: [{
      response_message_id: "m1", provider_id: "grok", actor_id: "actor:grok-model",
      actor_type: "ai", status: "ok", content_type: "text",
      content: "Deadlockは既定値ではない。", provider: "grok", model: "model",
      run_type: "baseline", context_lineage_key: "ctx:none",
    }],
  });
}

it("translator receives one OriginalInput and promotes Seed to canonical document", async () => {
  let seenUser = "";
  const model: TranslatorModel = {
    async complete(req) {
      seenUser = req.user;
      return JSON.stringify({
        source_spans: [{
          source_span_id: "span:m1:0",
          source_id: "source:m1",
          locator: { kind: "char_range", char_start: 0, char_end: 16 },
          quote_hint: "Deadlockは既定値ではない",
        }],
        bundle: {
          bundle_id: "bundle:m1",
          query_id: "query:q1",
          actor_id: "actor:grok-model",
          original_input_id: "input:m1",
          claims: [{
            claim_id: "claim:m1:0",
            actor_id: "actor:grok-model",
            text: "Deadlockは既定値ではない。",
            provenance: {
              query_id: "query:q1",
              original_input_ids: ["input:m1"],
              source_span_ids: ["span:m1:0"],
              derived_from_ids: [],
              transformation: "extraction",
            },
            evidentiary_status: "not_assessed",
            assumption_ids: [], condition_ids: [], scope_ids: [],
            evidence_ids: [], observation_ids: [],
          }],
          support: [], semantics: [], hypotheses: [], interpretations: [],
          dissents: [], counterpositions: [],
        },
        warnings: [],
      });
    }
  };

  const s = seed();
  const result = await runTranslatorForInput({ seed: s, inputId: "input:m1", model });
  expect(seenUser).toContain('"original_input_id": "input:m1"');
  expect(seenUser).not.toContain("sibling");
  expect(result.fragment.bundle.actor_id).toBe("actor:grok-model");

  const doc = promoteSeedWithFragments(s, [result.fragment]);
  expect(doc.bundles).toHaveLength(1);
  expect(doc.relations).toEqual([]);
});

it("rejects extraction without SourceSpan", async () => {
  const model: TranslatorModel = {
    async complete() {
      return JSON.stringify({
        source_spans: [],
        bundle: {
          bundle_id: "bundle:m1", query_id: "query:q1", actor_id: "actor:grok-model",
          original_input_id: "input:m1",
          claims: [{
            claim_id: "claim:bad", actor_id: "actor:grok-model", text: "幻Claim",
            provenance: {
              query_id: "query:q1", original_input_ids: ["input:m1"],
              source_span_ids: [], derived_from_ids: [], transformation: "extraction",
            },
            evidentiary_status: "not_assessed",
            assumption_ids: [], condition_ids: [], scope_ids: [], evidence_ids: [], observation_ids: [],
          }],
          support: [], semantics: [], hypotheses: [], interpretations: [],
          dissents: [], counterpositions: [],
        },
        warnings: [],
      });
    }
  };
  await expect(runTranslatorForInput({ seed: seed(), inputId: "input:m1", model }))
    .rejects.toThrow("extraction without SourceSpan");
});

it("rejects a quote_hint that is not the exact source slice", async () => {
  const model: TranslatorModel = {
    async complete() {
      return JSON.stringify({
        source_spans: [{
          source_span_id: "span:bad", source_id: "source:m1",
          locator: { kind: "char_range", char_start: 0, char_end: 8 },
          quote_hint: "ぜんぜん違う",
        }],
        bundle: {
          bundle_id: "bundle:m1", query_id: "query:q1", actor_id: "actor:grok-model",
          original_input_id: "input:m1", claims: [],
          support: [], semantics: [], hypotheses: [], interpretations: [],
          dissents: [], counterpositions: [],
        },
        warnings: [],
      });
    }
  };
  await expect(runTranslatorForInput({ seed: seed(), inputId: "input:m1", model }))
    .rejects.toThrow("quote_hint is not exact source slice");
});
