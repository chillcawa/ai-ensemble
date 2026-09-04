import { DELTA_ID_PATTERN, makeDeltaId } from "../id";
import type { ParsedTranslatorOutput } from "./parser";

const ITEM_ID_KEYS: Record<string, string> = {
  claims: "claim_id",
  support: "support_id",
  semantics: "semantic_id",
  hypotheses: "hypothesis_id",
  interpretations: "interpretation_id",
  dissents: "dissent_id",
  counterpositions: "counterposition_id",
};

function normalizeExistingId(value: unknown, fallbackPrefix: string): string {
  const raw = String(value || "").trim();

  if (DELTA_ID_PATTERN.test(raw)) return raw;

  const colon = raw.indexOf(":");
  if (colon > 0) {
    const prefix = raw.slice(0, colon);
    const suffix = raw.slice(colon + 1).replace(/:+/g, "-");
    return makeDeltaId(prefix, suffix);
  }

  return makeDeltaId(fallbackPrefix, raw || "unknown");
}

function normalizeIdArray(
  values: unknown,
  fallbackPrefix: string,
  remap?: Map<string, string>,
): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      if (remap?.has(value)) return remap.get(value)!;
      return normalizeExistingId(value, fallbackPrefix);
    });
}

/**
 * Canonicalizes machine-controlled Delta IDs only.
 *
 * It does NOT:
 * - add or delete semantic claims
 * - alter text
 * - alter item classification
 * - compare sibling actors
 *
 * It DOES:
 * - normalize illegal extra-colon IDs into Formal-Schema-compatible IDs
 * - keep SourceSpan references synchronized
 * - force the fixed query/actor/input/source ownership supplied by the runtime
 */
export function canonicalizeTranslatorOutput(args: {
  parsed: ParsedTranslatorOutput;
  queryId: string;
  actorId: string;
  inputId: string;
  sourceId: string;
}): ParsedTranslatorOutput {
  const parsed = structuredClone(args.parsed);

  const spanMap = new Map<string, string>();

  parsed.source_spans = (parsed.source_spans || []).map((span, index) => {
    const oldId = String(span.source_span_id || "");
    const newId = normalizeExistingId(
      oldId || `span:${args.inputId}-${index + 1}`,
      "span",
    );
    if (oldId) spanMap.set(oldId, newId);

    return {
      ...span,
      source_span_id: newId,
      source_id: args.sourceId,
    };
  });

  parsed.bundle.bundle_id = normalizeExistingId(
    parsed.bundle.bundle_id || `bundle:${args.inputId}`,
    "bundle",
  );
  parsed.bundle.query_id = args.queryId;
  parsed.bundle.actor_id = args.actorId;
  parsed.bundle.original_input_id = args.inputId;

  for (const [arrayName, idKey] of Object.entries(ITEM_ID_KEYS)) {
    const items = (parsed.bundle as any)[arrayName];
    if (!Array.isArray(items)) continue;

    (parsed.bundle as any)[arrayName] = items.map(
      (item: Record<string, any>, index: number) => {
        const next = { ...item };

        next[idKey] = normalizeExistingId(
          next[idKey] || `${arrayName}:${args.inputId}-${index + 1}`,
          arrayName.replace(/s$/, ""),
        );

        // Translator is structurally isolated to exactly one source Actor.
        next.actor_id = args.actorId;

        for (const key of [
          "assumption_ids",
          "condition_ids",
          "scope_ids",
          "evidence_ids",
          "observation_ids",
        ]) {
          if (key in next) {
            next[key] = normalizeIdArray(
              next[key],
              key.replace(/_ids$/, ""),
            );
          }
        }

        if (
          next.provenance &&
          typeof next.provenance === "object"
        ) {
          next.provenance = {
            ...next.provenance,
            query_id: args.queryId,
            original_input_ids: [args.inputId],
            source_span_ids: normalizeIdArray(
              next.provenance.source_span_ids,
              "span",
              spanMap,
            ),
            derived_from_ids: normalizeIdArray(
              next.provenance.derived_from_ids,
              "item",
            ),
          };
        }

        return next;
      },
    );
  }

  return parsed;
}
