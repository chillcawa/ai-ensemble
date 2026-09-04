import type { DeltaDocumentSeed } from "../types";
import { runTranslatorForInput } from "./runner";
import type {
  TranslatorBatchItemResult,
  TranslatorBatchResult,
  TranslatorModel,
} from "./types";

export interface TranslatorModelResolver {
  /**
   * Resolve a Translator model for exactly one source OriginalInput.
   * The resolver receives only actor/input identity, not sibling response content.
   */
  resolve(args: {
    actorId: string;
    inputId: string;
  }): TranslatorModel;
}

/**
 * P7-D:
 * Run Translator independently for every OriginalInput in a Seed.
 *
 * Failure isolation:
 * - one Actor failure does not discard successful fragments
 * - all successful fragments remain assembler-ready
 * - zero successes => status=error
 * - some successes + some failures => status=partial
 * - all successes => status=translated
 */
export async function runTranslatorBatch(args: {
  seed: DeltaDocumentSeed;
  resolver: TranslatorModelResolver;
}): Promise<TranslatorBatchResult> {
  const items: TranslatorBatchItemResult[] = [];

  for (const input of args.seed.original_inputs) {
    try {
      const model = args.resolver.resolve({
        actorId: input.actor_id,
        inputId: input.input_id,
      });

      const result = await runTranslatorForInput({
        seed: args.seed,
        inputId: input.input_id,
        model,
      });

      items.push({
        input_id: input.input_id,
        actor_id: input.actor_id,
        status: "success",
        fragment: result.fragment,
        raw_model_output: result.raw_model_output,
        warnings: result.warnings,
      });
    } catch (error) {
      items.push({
        input_id: input.input_id,
        actor_id: input.actor_id,
        status: "error",
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const fragments = items
    .filter((item) => item.status === "success" && item.fragment)
    .map((item) => item.fragment!);

  const successCount = fragments.length;
  const errorCount = items.length - successCount;

  const status: TranslatorBatchResult["status"] =
    successCount === 0
      ? "error"
      : errorCount > 0
        ? "partial"
        : "translated";

  return {
    status,
    total_inputs: items.length,
    success_count: successCount,
    error_count: errorCount,
    items,
    fragments,
  };
}
