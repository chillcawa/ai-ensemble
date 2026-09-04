import type {
  BuildEnsembleRunOptions,
  EchoConversationMessageLike,
} from "../types";
import { buildEnsembleRunFromSavedTurn } from "../adapter";
import { createDeltaDocumentSeed } from "../seed";
import { runTranslatorBatch } from "../translator/batch";
import type {
  CanonicalDeltaDocument,
  TranslatorBatchResult,
} from "../translator/types";
import type { TranslatorModelResolver } from "../translator/batch";
import { prepareAssemblerReadySet, canRunComparator } from "../assembler/prepare";
import { runComparator } from "../comparator/runner";
import type { ComparatorModel, ComparatorRunResult } from "../comparator/types";
import { assembleWithComparator } from "../assembler/assemble";

export type DeltaAnalysisStage =
  | "not_started"
  | "seeded"
  | "translating"
  | "translated"
  | "partial"
  | "comparing"
  | "ready"
  | "error";

export interface DeltaAnalysisProgressEvent {
  stage: DeltaAnalysisStage;
  message?: string;
  actor_id?: string;
  input_id?: string;
}

export interface DeltaAnalysisFailure {
  stage: "adapter" | "seed" | "translator" | "comparator" | "assembler";
  message: string;
}

export interface DeltaAnalysisControllerResult {
  status: "ready" | "partial" | "error";
  run_id?: string;
  document?: CanonicalDeltaDocument;
  translator_batch?: TranslatorBatchResult;
  comparator_result?: ComparatorRunResult;
  failures: DeltaAnalysisFailure[];
  warnings: string[];
}

export interface DeltaAnalysisControllerDeps {
  translatorResolver: TranslatorModelResolver;
  comparatorModel?: ComparatorModel;
  onProgress?: (event: DeltaAnalysisProgressEvent) => void;
}

/**
 * P7-F first end-to-end Delta analysis pipeline.
 *
 * Safety boundary:
 * - caller supplies already-saved ECHO messages
 * - this function never mutates Conversation
 * - one Translator failure does not erase sibling successes
 * - Comparator only runs with 2+ valid Bundles
 * - no Human Resolution is created here
 */
export async function analyzeSavedTurn(args: {
  queryMessage: EchoConversationMessageLike;
  assistantMessages: EchoConversationMessageLike[];
  deps: DeltaAnalysisControllerDeps;
  runOptions?: BuildEnsembleRunOptions;
  seedOptions?: {
    documentId?: string;
    schemaVersion?: string;
    createdAt?: string;
    humanDisplayName?: string;
  };
}): Promise<DeltaAnalysisControllerResult> {
  const failures: DeltaAnalysisFailure[] = [];
  const warnings: string[] = [];
  const progress = args.deps.onProgress || (() => {});

  let run;
  try {
    run = buildEnsembleRunFromSavedTurn(
      args.queryMessage,
      args.assistantMessages,
      args.runOptions,
    );
  } catch (error) {
    failures.push({
      stage: "adapter",
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", failures, warnings };
  }

  let seed;
  try {
    seed = createDeltaDocumentSeed(run, args.seedOptions);
    progress({ stage: "seeded", message: "DeltaDocumentSeed created" });
  } catch (error) {
    failures.push({
      stage: "seed",
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", run_id: run.run_id, failures, warnings };
  }

  progress({ stage: "translating", message: "Translator batch started" });

  const translatorBatch = await runTranslatorBatch({
    seed,
    resolver: args.deps.translatorResolver,
  });

  for (const item of translatorBatch.items) {
    if (item.status === "error") {
      failures.push({
        stage: "translator",
        message: `${item.actor_id} / ${item.input_id}: ${item.error || "translator failed"}`,
      });
    }
    for (const w of item.warnings) warnings.push(`${item.actor_id}: ${w}`);
  }

  if (translatorBatch.status === "error") {
    progress({ stage: "error", message: "No valid Translator fragments" });
    return {
      status: "error",
      run_id: run.run_id,
      translator_batch: translatorBatch,
      failures,
      warnings,
    };
  }

  progress({
    stage: translatorBatch.status === "partial" ? "partial" : "translated",
    message: `${translatorBatch.success_count}/${translatorBatch.total_inputs} Translator inputs valid`,
  });

  const readySet = prepareAssemblerReadySet(seed, translatorBatch);
  let comparatorResult: ComparatorRunResult | undefined;

  if (canRunComparator(readySet)) {
    if (!args.deps.comparatorModel) {
      failures.push({
        stage: "comparator",
        message: "Comparator model is not configured",
      });
    } else {
      progress({ stage: "comparing", message: "Comparator started" });
      try {
        comparatorResult = await runComparator({
          input: {
            query: {
              query_id: seed.query.query_id,
              text: seed.query.text,
            },
            bundles: readySet.fragments.map((f) => f.bundle),
            source_spans: readySet.fragments.flatMap((f) => f.source_spans),
          },
          model: args.deps.comparatorModel,
        });
        warnings.push(...comparatorResult.warnings.map((w) => `comparator: ${w}`));
      } catch (error) {
        failures.push({
          stage: "comparator",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  let document: CanonicalDeltaDocument;
  try {
    document = assembleWithComparator({
      seed,
      fragments: readySet.fragments,
      comparator: comparatorResult?.fragment,
    });
  } catch (error) {
    failures.push({
      stage: "assembler",
      message: error instanceof Error ? error.message : String(error),
    });
    progress({ stage: "error", message: "Assembler failed" });
    return {
      status: "error",
      run_id: run.run_id,
      translator_batch: translatorBatch,
      comparator_result: comparatorResult,
      failures,
      warnings,
    };
  }

  const hasPartial =
    translatorBatch.status === "partial" ||
    (canRunComparator(readySet) && !comparatorResult);

  progress({
    stage: "ready",
    message: hasPartial ? "DeltaDocument ready with partial analysis" : "DeltaDocument ready",
  });

  return {
    status: hasPartial ? "partial" : "ready",
    run_id: run.run_id,
    document,
    translator_batch: translatorBatch,
    comparator_result: comparatorResult,
    failures,
    warnings,
  };
}
