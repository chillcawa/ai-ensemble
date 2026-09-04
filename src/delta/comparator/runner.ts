import {
  buildComparatorEmptyReviewPrompt,
  buildComparatorRepairPrompt,
  buildComparatorUserPrompt,
  COMPARATOR_SYSTEM_PROMPT,
} from "./prompt";
import { parseComparatorOutput } from "./parser";
import { canonicalizeComparatorFragment } from "./canonicalize";
import type { ComparatorModel, ComparatorRunInput, ComparatorRunResult } from "./types";
import { validateComparatorFragmentCore } from "./validate";

function parseCanonicalValidate(input: ComparatorRunInput, raw: string) {
  const parsed = parseComparatorOutput(raw);
  const canonical = canonicalizeComparatorFragment({
    input,
    fragment: parsed.fragment as any,
    warnings: parsed.warnings as any,
  });

  const problems = validateComparatorFragmentCore({
    queryId: input.query.query_id,
    bundles: input.bundles,
    fragment: canonical.fragment as any,
  });

  return { canonical, problems };
}

function hasCrossActorClaimMaterial(input: ComparatorRunInput): boolean {
  return input.bundles.filter((bundle) => (bundle.claims || []).length > 0).length >= 2;
}

function comparisonFragmentIsEmpty(fragment: any): boolean {
  return (fragment?.relations?.length || 0) === 0
    && (fragment?.unresolved_states?.length || 0) === 0
    && (fragment?.resolution_candidates?.length || 0) === 0;
}

export async function runComparator(args: {
  input: ComparatorRunInput;
  model: ComparatorModel;
}): Promise<ComparatorRunResult> {
  if (args.input.bundles.length < 2) {
    throw new Error("Delta Comparator requires at least two valid Bundles");
  }

  const userPrompt = buildComparatorUserPrompt(args.input);

  const firstRaw = await args.model.complete({
    system: COMPARATOR_SYSTEM_PROMPT,
    user: userPrompt,
  });

  let raw = firstRaw;
  let attempt: ReturnType<typeof parseCanonicalValidate>;

  try {
    attempt = parseCanonicalValidate(args.input, raw);
  } catch (error) {
    attempt = {
      canonical: {
        fragment: {},
        warnings: [],
      },
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (attempt.problems.length > 0) {
    raw = await args.model.complete({
      system: COMPARATOR_SYSTEM_PROMPT,
      user: buildComparatorRepairPrompt({
        originalPrompt: userPrompt,
        validationProblems: attempt.problems,
        previousOutput: firstRaw,
      }),
    });
    attempt = parseCanonicalValidate(args.input, raw);
  }

  if (attempt.problems.length) {
    throw new Error(
      `Delta Comparator validation failed after canonicalization + one structural retry:\n- ${attempt.problems.join("\n- ")}`,
    );
  }

  // A valid empty result is allowed by Delta Protocol. However, some models are
  // overly conservative and return an empty comparison even when cross-Actor
  // Claims are clearly comparable. When there is material from at least two
  // source Actors, perform exactly one verification pass. This is NOT a forced
  // consensus/relation pass: the model may confirm the empty result.
  if (
    hasCrossActorClaimMaterial(args.input)
    && comparisonFragmentIsEmpty(attempt.canonical.fragment)
  ) {
    const firstValidEmpty = attempt;
    const firstValidEmptyRaw = raw;
    const reviewRaw = await args.model.complete({
      system: COMPARATOR_SYSTEM_PROMPT,
      user: buildComparatorEmptyReviewPrompt({
        originalPrompt: userPrompt,
        previousOutput: firstValidEmptyRaw,
      }),
    });

    try {
      const reviewed = parseCanonicalValidate(args.input, reviewRaw);
      if (reviewed.problems.length === 0) {
        attempt = reviewed;
        raw = reviewRaw;
        if (comparisonFragmentIsEmpty(attempt.canonical.fragment)) {
          const warnings = attempt.canonical.warnings as string[];
          if (warnings.length === 0) {
            warnings.push(
              "Comparator confirmed an empty result after explicit cross-Actor Claim review.",
            );
          }
        }
      } else {
        attempt = firstValidEmpty;
        raw = firstValidEmptyRaw;
        (attempt.canonical.warnings as string[]).push(
          `Empty-result verification was structurally invalid; retained the first valid empty result: ${reviewed.problems.join(" | ")}`,
        );
      }
    } catch (error) {
      attempt = firstValidEmpty;
      raw = firstValidEmptyRaw;
      (attempt.canonical.warnings as string[]).push(
        `Empty-result verification could not be parsed; retained the first valid empty result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    fragment: attempt.canonical.fragment as any,
    raw_model_output: raw,
    warnings: attempt.canonical.warnings,
  };
}
