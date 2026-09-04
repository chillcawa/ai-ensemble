import type { DeltaOriginalInput, DeltaSource } from "../types";
import { deltaIdSuffix, makeDeltaId } from "../id";

export const TRANSLATOR_SYSTEM_PROMPT = `
You are Delta Protocol Translator v0.1.

Core rule:
直さない。足さない。比べない。確定しない。

You receive exactly ONE OriginalInput.
Do not use or infer any other AI response.
Do not compare actors.
Do not create relations.
Do not create Resolution.
Do not create DecisionHistory.

Your output is parsed by software.
Return JSON only. No markdown. No prose outside JSON.

IMPORTANT:
- Copy all supplied IDs EXACTLY.
- Delta IDs use exactly ONE colon: prefix:suffix.
- Never place another colon inside the suffix.
- Never rename fields.
- Every required array must be present, even when empty.
- Do not invent semantic items merely to fill arrays.
- If an item cannot be grounded to the OriginalInput, omit it.
- Prefer line_range SourceSpan if exact character offsets are uncertain.
`.trim();

export function buildTranslatorUserPrompt(
  query: { query_id: string; text: string },
  actorId: string,
  input: DeltaOriginalInput,
  source: DeltaSource,
): string {
  const inputSuffix = deltaIdSuffix(input.input_id);
  const bundleId = makeDeltaId("bundle", inputSuffix);
  const spanId = makeDeltaId("span", `${inputSuffix}-1`);
  const claimId = makeDeltaId("claim", `${inputSuffix}-1`);

  return [
    "Translate the ONE OriginalInput below into the exact JSON shape.",
    "",
    "FIXED IDENTIFIERS — COPY EXACTLY:",
    `query_id = ${query.query_id}`,
    `actor_id = ${actorId}`,
    `original_input_id = ${input.input_id}`,
    `source_id = ${source.source_id}`,
    `bundle_id = ${bundleId}`,
    "",
    "DELTA ID GRAMMAR:",
    "- Exactly one colon is allowed.",
    "- Valid example: claim:message-ai-123-1",
    "- Invalid example: claim:message-ai-123:1",
    "",
    "SOURCE QUERY:",
    query.text,
    "",
    "ONLY ORIGINAL INPUT YOU MAY INSPECT:",
    input.content,
    "",
    "RETURN EXACTLY THIS SHAPE:",
    JSON.stringify({
      source_spans: [
        {
          source_span_id: spanId,
          source_id: source.source_id,
          locator: {
            kind: "line_range",
            line_start: 1,
            line_end: 1
          },
          quote_hint: "EXACT SOURCE EXCERPT OR null"
        }
      ],
      bundle: {
        bundle_id: bundleId,
        query_id: query.query_id,
        actor_id: actorId,
        original_input_id: input.input_id,
        claims: [
          {
            claim_id: claimId,
            actor_id: actorId,
            text: "SOURCE-GROUNDED CLAIM TEXT",
            provenance: {
              query_id: query.query_id,
              original_input_ids: [input.input_id],
              source_span_ids: [spanId],
              derived_from_ids: [],
              transformation: "extraction"
            },
            evidentiary_status: "not_assessed",
            assumption_ids: [],
            condition_ids: [],
            scope_ids: [],
            evidence_ids: [],
            observation_ids: []
          }
        ],
        support: [],
        semantics: [],
        hypotheses: [],
        interpretations: [],
        dissents: [],
        counterpositions: []
      },
      warnings: []
    }, null, 2),
    "",
    "RULES:",
    "- The example item counts are illustrative. Use zero or more items as justified.",
    "- If there are no defensible Claims, return claims: [].",
    "- If multiple items are needed, increment with -2, -3, etc. Never use a second colon.",
    "- Keep support/semantics/hypotheses/interpretations/dissents/counterpositions as [] unless the source explicitly supports such items.",
    "- Every extraction item must cite at least one source_span_id.",
    "- source_span.source_id must equal the fixed source_id exactly.",
    "- bundle/query/actor/original_input IDs must equal the fixed identifiers exactly.",
  ].join("\n");
}

export function buildTranslatorRepairPrompt(args: {
  originalPrompt: string;
  validationProblems: string[];
  previousOutput: string;
}): string {
  return [
    args.originalPrompt,
    "",
    "YOUR PREVIOUS OUTPUT FAILED STRUCTURAL VALIDATION.",
    "Do not add new meaning. Re-emit the SAME extraction using the exact required JSON structure.",
    "Remember: every Delta ID must use exactly one colon: prefix:suffix.",
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
