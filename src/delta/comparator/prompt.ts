import type { ComparatorRunInput } from "./types";

export const COMPARATOR_SYSTEM_PROMPT = `
You are Delta Protocol Comparator v0.1.

Core rule:
差を発見する。差を消さない。勝者を決めない。

Compare only the supplied validated Bundles.
Do not inspect or infer any raw sibling response outside this payload.
Do not invent new source Claims.
Do not write Resolution.
Do not use majority as truth.
Do not collapse minority or dissent.

Return JSON only. No markdown. No prose outside JSON.

STRUCTURAL RULES:
- The Comparator system Actor ID is exactly: actor:delta-comparator
- Every Comparator-generated relation.actor_id must be actor:delta-comparator
- Every Comparator-generated ResolutionCandidate.actor_id must be actor:delta-comparator
- Every Comparator-generated ResolutionCandidate.actor_type must be system
- Every relation must compare Claims owned by at least TWO DISTINCT source Actors
- provenance.query_id must exactly match the supplied query_id
- provenance.transformation must be exactly "comparison"
- comparison confidence, when present, must use type "comparison"
- Human Resolution not yet existing is NOT by itself a reason to create Unresolved
- If no defensible relation exists, return relations: []
- If no defensible candidate exists, return resolution_candidates: []
- If no justified Unresolved exists, return unresolved_states: []

Classification order:
1. contradiction
2. agreement
3. conditional_agreement
4. mismatch
5. if comparison cannot be determined, emit no relation and add a warning
`.trim();

function claimCatalog(input: ComparatorRunInput) {
  return input.bundles.flatMap((bundle) =>
    (bundle.claims || []).map((claim) => ({
      claim_id: claim.claim_id,
      actor_id: bundle.actor_id,
      original_input_id: bundle.original_input_id,
      text: claim.text,
      source_span_ids: claim.provenance?.source_span_ids || [],
    })),
  );
}

export function buildComparatorUserPrompt(input: ComparatorRunInput): string {
  const claims = claimCatalog(input);

  return [
    "Compare only the validated Delta IR below.",
    "",
    "FIXED IDENTIFIERS:",
    `query_id = ${input.query.query_id}`,
    "comparator_actor_id = actor:delta-comparator",
    "",
    "CLAIM OWNERSHIP CATALOG:",
    JSON.stringify(claims, null, 2),
    "",
    "VALIDATED BUNDLES:",
    JSON.stringify(input.bundles, null, 2),
    "",
    "SOURCE SPANS:",
    JSON.stringify(input.source_spans, null, 2),
    "",
    "RETURN EXACTLY THIS TOP-LEVEL SHAPE:",
    JSON.stringify({
      actors: [
        {
          actor_id: "actor:delta-comparator",
          actor_type: "system",
          display_name: "Delta Comparator",
        },
      ],
      relations: [],
      unresolved_states: [],
      resolution_candidates: [],
      warnings: [],
    }, null, 2),
    "",
    "WHEN YOU EMIT A RELATION, USE THIS EXACT FIELD SHAPE:",
    JSON.stringify({
      relation_id: "relation:UNIQUE_ID",
      kind: "agreement | conditional_agreement | mismatch | contradiction",
      actor_id: "actor:delta-comparator",
      target_ids: ["CLAIM_ID_FROM_ACTOR_A", "CLAIM_ID_FROM_DIFFERENT_ACTOR_B"],
      condition_ids: [],
      scope_ids: [],
      confidence: {
        type: "comparison",
        qualitative: "low | medium | high",
        basis: "brief comparison basis",
      },
      provenance: {
        query_id: input.query.query_id,
        original_input_ids: ["ORIGINAL_INPUT_IDS_OF_TARGET_CLAIMS"],
        source_span_ids: ["SOURCE_SPAN_IDS_OF_TARGET_CLAIMS"],
        derived_from_ids: ["TARGET_CLAIM_IDS"],
        transformation: "comparison",
      },
      note: "optional",
    }, null, 2),
    "",
    "RELATION RULES:",
    "- target_ids must contain existing claim_id values from the catalog.",
    "- target_ids must include Claims owned by at least two distinct actor_id values.",
    "- Do not compare two Claims owned by the same actor.",
    "- relation.actor_id is always actor:delta-comparator.",
    "- provenance.query_id is the fixed query_id above.",
    '- provenance.transformation is always "comparison".',
    "- provenance.original_input_ids/source_span_ids/derived_from_ids must be grounded in the selected target Claims.",
    "- conditional_agreement must include condition_ids, scope_ids, or a grounding note.",
    "",
    "RESOLUTION CANDIDATE RULES:",
    "- Candidate is only an AI proposal, never a Resolution.",
    "- actor_id must be actor:delta-comparator.",
    '- actor_type must be "system".',
    "- provenance follows the same fixed query_id/comparison rules.",
    "",
    "If the supplied Claims are not safely comparable, return empty relations and explain briefly in warnings.",
  ].join("\n");
}

export function buildComparatorRepairPrompt(args: {
  originalPrompt: string;
  validationProblems: string[];
  previousOutput: string;
}): string {
  return [
    args.originalPrompt,
    "",
    "YOUR PREVIOUS OUTPUT FAILED DELTA COMPARATOR STRUCTURAL VALIDATION.",
    "Do not add new source meaning.",
    "Re-emit the same comparison using the exact required structure and fixed identifiers.",
    "",
    "VALIDATION ERRORS:",
    ...args.validationProblems.map((problem) => `- ${problem}`),
    "",
    "PREVIOUS OUTPUT:",
    args.previousOutput,
    "",
    "Return corrected JSON only.",
  ].join("\n");
}

export function buildComparatorEmptyReviewPrompt(args: {
  originalPrompt: string;
  previousOutput: string;
}): string {
  return [
    args.originalPrompt,
    "",
    "EMPTY-RESULT VERIFICATION PASS.",
    "Your previous output was structurally valid but contained no relations, unresolved states, or resolution candidates.",
    "An empty comparison is allowed and MUST remain empty if no relation is defensible.",
    "Before confirming that result, explicitly review plausible Claim pairs owned by DISTINCT source Actors.",
    "For each plausible pair, test in this order: contradiction, agreement, conditional_agreement, mismatch.",
    "Do NOT force a relation, invent source meaning, or use majority as truth.",
    "If at least one pair is defensibly classifiable, emit the justified relation(s) using the required structure.",
    "If no pair is safely classifiable, keep the comparison arrays empty and include a brief reason in warnings.",
    "This is a verification pass, not an instruction to manufacture a comparison.",
    "",
    "PREVIOUS VALID EMPTY OUTPUT:",
    args.previousOutput,
    "",
    "Return JSON only.",
  ].join("\n");
}
