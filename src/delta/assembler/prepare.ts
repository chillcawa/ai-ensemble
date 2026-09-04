import type { DeltaDocumentSeed } from "../types";
import type { TranslatorBatchResult, TranslatorFragment } from "../translator/types";

export interface AssemblerReadySet {
  query_id: string;
  fragments: TranslatorFragment[];
  failed_inputs: Array<{
    input_id: string;
    actor_id: string;
    error: string;
  }>;
  status: "ready" | "partial" | "blocked";
}

/**
 * Convert Translator batch output into an Assembler-ready set.
 *
 * This function does not merge the fragments yet.
 * It only enforces the minimum Phase 6a entry conditions.
 */
export function prepareAssemblerReadySet(
  seed: DeltaDocumentSeed,
  batch: TranslatorBatchResult,
): AssemblerReadySet {
  const seenActors = new Set<string>();
  const seenBundles = new Set<string>();

  for (const fragment of batch.fragments) {
    if (fragment.query.query_id !== seed.query.query_id) {
      throw new Error("Delta P7-D: fragment query mismatch");
    }

    const actorId = fragment.bundle.actor_id;
    if (seenActors.has(actorId)) {
      throw new Error(`Delta P7-D: multiple Bundles for same Actor: ${actorId}`);
    }
    seenActors.add(actorId);

    const bundleId = fragment.bundle.bundle_id;
    if (seenBundles.has(bundleId)) {
      throw new Error(`Delta P7-D: duplicate bundle_id: ${bundleId}`);
    }
    seenBundles.add(bundleId);
  }

  const failedInputs = batch.items
    .filter((item) => item.status === "error")
    .map((item) => ({
      input_id: item.input_id,
      actor_id: item.actor_id,
      error: item.error || "unknown translator error",
    }));

  return {
    query_id: seed.query.query_id,
    fragments: batch.fragments,
    failed_inputs: failedInputs,
    status:
      batch.fragments.length === 0
        ? "blocked"
        : failedInputs.length > 0
          ? "partial"
          : "ready",
  };
}

/**
 * Comparator is allowed only when at least two valid Bundles exist.
 * One valid Bundle is still a valid Delta document path, just without comparison.
 */
export function canRunComparator(set: AssemblerReadySet): boolean {
  return set.fragments.length >= 2;
}
