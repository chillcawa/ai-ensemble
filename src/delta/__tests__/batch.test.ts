import { describe, expect, it } from "vitest";
import { createDeltaDocumentSeed } from "../seed";
import { runTranslatorBatch } from "../translator/batch";
import type { TranslatorModel } from "../translator/types";
import { canRunComparator, prepareAssemblerReadySet } from "../assembler/prepare";

function makeSeed() {
  return createDeltaDocumentSeed({
    run_id: "run:q1",
    run_type: "baseline",
    context_lineage_key: "ctx:none",
    query: { query_id: "query:q1", text: "Q?", actor_id: "actor:human-local" },
    providers: [
      { provider_id: "a", actor_id: "actor:a-model", actor_type: "ai", provider: "a", model: "model" },
      { provider_id: "b", actor_id: "actor:b-model", actor_type: "ai", provider: "b", model: "model" },
      { provider_id: "c", actor_id: "actor:c-model", actor_type: "ai", provider: "c", model: "model" },
    ],
    responses: [
      { response_message_id: "a1", provider_id: "a", actor_id: "actor:a-model", actor_type: "ai", status: "ok", content_type: "text", content: "Aです。", provider: "a", model: "model", run_type: "baseline", context_lineage_key: "ctx:none" },
      { response_message_id: "b1", provider_id: "b", actor_id: "actor:b-model", actor_type: "ai", status: "ok", content_type: "text", content: "Bです。", provider: "b", model: "model", run_type: "baseline", context_lineage_key: "ctx:none" },
      { response_message_id: "c1", provider_id: "c", actor_id: "actor:c-model", actor_type: "ai", status: "ok", content_type: "text", content: "Cです。", provider: "c", model: "model", run_type: "baseline", context_lineage_key: "ctx:none" },
    ],
  });
}

function goodModelFor(inputId: string, actorId: string): TranslatorModel {
  return {
    async complete() {
      const bundleId = `bundle:${inputId.replace(/^input:/, "")}`;
      return JSON.stringify({
        source_spans: [],
        bundle: {
          bundle_id: bundleId,
          query_id: "query:q1",
          actor_id: actorId,
          original_input_id: inputId,
          claims: [],
          support: [],
          semantics: [],
          hypotheses: [],
          interpretations: [],
          dissents: [],
          counterpositions: [],
        },
        warnings: [],
      });
    },
  };
}

describe("Delta P7-D Translator batch", () => {
  it("keeps successful fragments when one Actor fails", async () => {
    const seed = makeSeed();

    const batch = await runTranslatorBatch({
      seed,
      resolver: {
        resolve({ actorId, inputId }) {
          if (actorId === "actor:b-model") {
            return {
              async complete() {
                throw new Error("simulated translator provider failure");
              },
            };
          }
          return goodModelFor(inputId, actorId);
        },
      },
    });

    expect(batch.status).toBe("partial");
    expect(batch.success_count).toBe(2);
    expect(batch.error_count).toBe(1);
    expect(batch.fragments).toHaveLength(2);

    const set = prepareAssemblerReadySet(seed, batch);
    expect(set.status).toBe("partial");
    expect(set.failed_inputs).toHaveLength(1);
    expect(canRunComparator(set)).toBe(true);
  });

  it("returns translated when all Actors succeed", async () => {
    const seed = makeSeed();
    const batch = await runTranslatorBatch({
      seed,
      resolver: {
        resolve({ actorId, inputId }) {
          return goodModelFor(inputId, actorId);
        },
      },
    });

    expect(batch.status).toBe("translated");
    expect(batch.success_count).toBe(3);
    expect(batch.error_count).toBe(0);
    expect(canRunComparator(prepareAssemblerReadySet(seed, batch))).toBe(true);
  });

  it("blocks comparison when all Translators fail", async () => {
    const seed = makeSeed();
    const batch = await runTranslatorBatch({
      seed,
      resolver: {
        resolve() {
          return {
            async complete() {
              throw new Error("all failed");
            },
          };
        },
      },
    });

    expect(batch.status).toBe("error");
    const set = prepareAssemblerReadySet(seed, batch);
    expect(set.status).toBe("blocked");
    expect(set.fragments).toHaveLength(0);
    expect(canRunComparator(set)).toBe(false);
  });

  it("allows one valid Bundle without Comparator", async () => {
    const seed = makeSeed();
    const batch = await runTranslatorBatch({
      seed,
      resolver: {
        resolve({ actorId, inputId }) {
          if (actorId !== "actor:a-model") {
            return {
              async complete() {
                throw new Error("simulated failure");
              },
            };
          }
          return goodModelFor(inputId, actorId);
        },
      },
    });

    const set = prepareAssemblerReadySet(seed, batch);
    expect(set.fragments).toHaveLength(1);
    expect(set.status).toBe("partial");
    expect(canRunComparator(set)).toBe(false);
  });
});
