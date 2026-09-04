import { describe, expect, it } from "vitest";
import { analyzeSavedTurn } from "../controller/analyzeSavedTurn";
import { buildDeltaOverviewViewModel } from "../ui/overviewViewModel";
import type { TranslatorModel } from "../translator/types";
import type { ComparatorModel } from "../comparator/types";

function translatorModel(inputId: string, actorId: string): TranslatorModel {
  return {
    async complete() {
      const rawText = inputId.includes("a1") ? "Aです。" : "Bです。";
      return JSON.stringify({
        source_spans: [{
          source_span_id: `span:${inputId}`,
          source_id: `source:${inputId.replace(/^input:/, "")}`,
          locator: { kind: "char_range", char_start: 0, char_end: rawText.length },
          quote_hint: rawText,
        }],
        bundle: {
          bundle_id: `bundle:${inputId}`,
          query_id: "query:u1",
          actor_id: actorId,
          original_input_id: inputId,
          claims: [{
            claim_id: `claim:${inputId}`,
            actor_id: actorId,
            text: rawText,
            provenance: {
              query_id: "query:u1",
              original_input_ids: [inputId],
              source_span_ids: [`span:${inputId}`],
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
    },
  };
}

const comparator: ComparatorModel = {
  async complete() {
    return JSON.stringify({
      actors: [{ actor_id: "actor:comparator01", actor_type: "system" }],
      relations: [{
        relation_id: "relation:r1",
        kind: "mismatch",
        actor_id: "actor:comparator01",
        target_ids: ["claim:input-a1", "claim:input-b1"],
        condition_ids: [],
        scope_ids: [],
        provenance: {
          query_id: "query:u1",
          original_input_ids: ["input:a1", "input:b1"],
          source_span_ids: ["span:input-a1", "span:input-b1"],
          derived_from_ids: ["claim:input-a1", "claim:input-b1"],
          transformation: "comparison",
        },
      }],
      unresolved_states: [],
      resolution_candidates: [],
      warnings: [],
    });
  },
};

describe("Delta P7-F analysis controller", () => {
  it("runs Turn -> Translator N -> Comparator -> Assembler", async () => {
    const result = await analyzeSavedTurn({
      queryMessage: { id: "u1", role: "user", content: "Q?" },
      assistantMessages: [
        { id: "a1", role: "assistant", provider: "a", model: "m", content: "Aです。" },
        { id: "b1", role: "assistant", provider: "b", model: "m", content: "Bです。" },
      ],
      deps: {
        translatorResolver: {
          resolve({ actorId, inputId }) {
            return translatorModel(inputId, actorId);
          },
        },
        comparatorModel: comparator,
      },
    });

    expect(result.status).toBe("ready");
    expect(result.document?.bundles).toHaveLength(2);
    expect(result.document?.relations).toHaveLength(1);

    const vm = buildDeltaOverviewViewModel(result);
    expect(vm.bundle_count).toBe(2);
    expect(vm.relation_count).toBe(1);
  });

  it("returns partial when one Translator fails but one Bundle survives", async () => {
    const result = await analyzeSavedTurn({
      queryMessage: { id: "u1", role: "user", content: "Q?" },
      assistantMessages: [
        { id: "a1", role: "assistant", provider: "a", model: "m", content: "Aです。" },
        { id: "b1", role: "assistant", provider: "b", model: "m", content: "Bです。" },
      ],
      deps: {
        translatorResolver: {
          resolve({ actorId, inputId }) {
            if (inputId === "input:b1") {
              return { async complete() { throw new Error("translator B failed"); } };
            }
            return translatorModel(inputId, actorId);
          },
        },
        comparatorModel: comparator,
      },
    });

    expect(result.status).toBe("partial");
    expect(result.document?.bundles).toHaveLength(1);
    expect(result.document?.relations).toHaveLength(0);
    expect(result.failures.some((f) => f.stage === "translator")).toBe(true);
  });

  it("returns partial when Comparator fails but translated Bundles remain", async () => {
    const result = await analyzeSavedTurn({
      queryMessage: { id: "u1", role: "user", content: "Q?" },
      assistantMessages: [
        { id: "a1", role: "assistant", provider: "a", model: "m", content: "Aです。" },
        { id: "b1", role: "assistant", provider: "b", model: "m", content: "Bです。" },
      ],
      deps: {
        translatorResolver: {
          resolve({ actorId, inputId }) { return translatorModel(inputId, actorId); },
        },
        comparatorModel: {
          async complete() { throw new Error("comparator unavailable"); },
        },
      },
    });

    expect(result.status).toBe("partial");
    expect(result.document?.bundles).toHaveLength(2);
    expect(result.document?.relations).toHaveLength(0);
    expect(result.failures.some((f) => f.stage === "comparator")).toBe(true);
  });

  it("returns error when all Translators fail", async () => {
    const result = await analyzeSavedTurn({
      queryMessage: { id: "u1", role: "user", content: "Q?" },
      assistantMessages: [
        { id: "a1", role: "assistant", provider: "a", model: "m", content: "Aです。" },
      ],
      deps: {
        translatorResolver: {
          resolve() {
            return { async complete() { throw new Error("translator unavailable"); } };
          },
        },
      },
    });

    expect(result.status).toBe("error");
    expect(result.document).toBeUndefined();
  });
});
