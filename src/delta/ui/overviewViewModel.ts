import type { DeltaAnalysisControllerResult } from "../controller/analyzeSavedTurn";

export interface DeltaOverviewViewModel {
  status: "ready" | "partial" | "error";
  actor_count: number;
  bundle_count: number;
  relation_count: number;
  unresolved_count: number;
  candidate_count: number;
  translator_failures: number;
  comparator_failed: boolean;
  warnings: string[];
}

export function buildDeltaOverviewViewModel(
  result: DeltaAnalysisControllerResult,
): DeltaOverviewViewModel {
  const doc = result.document;
  return {
    status: result.status,
    actor_count: doc?.actors?.length || 0,
    bundle_count: doc?.bundles?.length || 0,
    relation_count: doc?.relations?.length || 0,
    unresolved_count: doc?.unresolved_states?.length || 0,
    candidate_count: doc?.resolution_candidates?.length || 0,
    translator_failures: result.failures.filter((f) => f.stage === "translator").length,
    comparator_failed: result.failures.some((f) => f.stage === "comparator"),
    warnings: result.warnings,
  };
}
