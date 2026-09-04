import type { DeltaDocumentSeed } from "../types";
import {
  buildTranslatorRepairPrompt,
  buildTranslatorUserPrompt,
  TRANSLATOR_SYSTEM_PROMPT,
} from "./prompt";
import { parseTranslatorOutput } from "./parser";
import type { ParsedTranslatorOutput } from "./parser";
import { canonicalizeTranslatorOutput } from "./canonicalize";
import type {
  TranslatorFragment,
  TranslatorModel,
  TranslatorRunResult,
} from "./types";
import { validateTranslatorFragmentCore } from "./validate";

function canonicalizeAndValidate(args: {
  seed: DeltaDocumentSeed;
  input: DeltaDocumentSeed["original_inputs"][number];
  source: DeltaDocumentSeed["sources"][number];
  parsed: ParsedTranslatorOutput;
}): { parsed: ParsedTranslatorOutput; problems: string[] } {
  const parsed = canonicalizeTranslatorOutput({
    parsed: args.parsed,
    queryId: args.seed.query.query_id,
    actorId: args.input.actor_id,
    inputId: args.input.input_id,
    sourceId: args.source.source_id,
  });

  const problems = validateTranslatorFragmentCore({
    queryId: args.seed.query.query_id,
    actorId: args.input.actor_id,
    input: args.input,
    source: args.source,
    spans: parsed.source_spans,
    bundle: parsed.bundle,
  });

  return { parsed, problems };
}

/**
 * One OriginalInput only.
 *
 * Machine-controlled identifiers are canonicalized before validation.
 *
 * A single structural retry is still allowed for failures that cannot be
 * repaired mechanically:
 * - same OriginalInput
 * - same source actor
 * - same fixed identifiers
 * - no sibling AI response
 */
export async function runTranslatorForInput(args: {
  seed: DeltaDocumentSeed;
  inputId: string;
  model: TranslatorModel;
}): Promise<TranslatorRunResult> {
  const input = args.seed.original_inputs.find(
    (x) => x.input_id === args.inputId,
  );
  if (!input) {
    throw new Error(
      `Delta Translator: OriginalInput not found: ${args.inputId}`,
    );
  }

  const source = args.seed.sources.find(
    (x) => x.input_id === input.input_id,
  );
  if (!source) {
    throw new Error(
      `Delta Translator: Source not found for ${input.input_id}`,
    );
  }

  const actor = args.seed.actors.find(
    (x) => x.actor_id === input.actor_id,
  );
  if (!actor) {
    throw new Error(
      `Delta Translator: Actor not found: ${input.actor_id}`,
    );
  }

  const userPrompt = buildTranslatorUserPrompt(
    args.seed.query,
    input.actor_id,
    input,
    source,
  );

  const firstRaw = await args.model.complete({
    system: TRANSLATOR_SYSTEM_PROMPT,
    user: userPrompt,
  });

  let raw = firstRaw;
  let parsed: ParsedTranslatorOutput;
  let problems: string[];

  try {
    const first = canonicalizeAndValidate({
      seed: args.seed,
      input,
      source,
      parsed: parseTranslatorOutput(firstRaw),
    });
    parsed = first.parsed;
    problems = first.problems;
  } catch (error) {
    parsed = {
      source_spans: [],
      bundle: {} as any,
      warnings: [],
    };
    problems = [
      error instanceof Error ? error.message : String(error),
    ];
  }

  if (problems.length > 0) {
    raw = await args.model.complete({
      system: TRANSLATOR_SYSTEM_PROMPT,
      user: buildTranslatorRepairPrompt({
        originalPrompt: userPrompt,
        validationProblems: problems,
        previousOutput: firstRaw,
      }),
    });

    const repaired = canonicalizeAndValidate({
      seed: args.seed,
      input,
      source,
      parsed: parseTranslatorOutput(raw),
    });
    parsed = repaired.parsed;
    problems = repaired.problems;
  }

  if (problems.length) {
    throw new Error(
      `Delta Translator validation failed after canonicalization + one structural retry:\n- ${problems.join(
        "\n- ",
      )}`,
    );
  }

  const fragment: TranslatorFragment = {
    query: args.seed.query,
    actors: [actor],
    original_inputs: [input],
    sources: [source],
    source_spans: parsed.source_spans,
    bundle: parsed.bundle,
  };

  return {
    fragment,
    raw_model_output: raw,
    warnings: parsed.warnings,
  };
}
