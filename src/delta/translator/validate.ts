import type { DeltaOriginalInput, DeltaSource } from "../types";
import { isValidDeltaId } from "../id";
import type { DeltaIRBundle, DeltaSourceSpan } from "./types";

const DIRECT_ARRAYS = [
  "claims",
  "support",
  "semantics",
  "hypotheses",
  "interpretations",
  "dissents",
  "counterpositions",
] as const;

const ITEM_ID_KEYS: Record<string, string> = {
  claims: "claim_id",
  support: "support_id",
  semantics: "semantic_id",
  hypotheses: "hypothesis_id",
  interpretations: "interpretation_id",
  dissents: "dissent_id",
  counterpositions: "counterposition_id",
};

function validateId(value: unknown, label: string, problems: string[]) {
  if (!isValidDeltaId(value)) {
    problems.push(
      `${label} must match Delta ID grammar prefix:suffix with exactly one colon`,
    );
  }
}

export function validateTranslatorFragmentCore(args: {
  queryId: string;
  actorId: string;
  input: DeltaOriginalInput;
  source: DeltaSource;
  spans: DeltaSourceSpan[];
  bundle: DeltaIRBundle;
}): string[] {
  const { queryId, actorId, input, source, spans, bundle } = args;
  const problems: string[] = [];

  if (bundle.query_id !== queryId) problems.push("bundle.query_id mismatch");
  if (bundle.actor_id !== actorId) problems.push("bundle.actor_id mismatch");
  if (bundle.original_input_id !== input.input_id) problems.push("bundle.original_input_id mismatch");

  validateId(bundle.bundle_id, "bundle.bundle_id", problems);
  validateId(bundle.query_id, "bundle.query_id", problems);
  validateId(bundle.actor_id, "bundle.actor_id", problems);
  validateId(bundle.original_input_id, "bundle.original_input_id", problems);

  const spanMap = new Map(spans.map((s) => [s.source_span_id, s]));
  for (const span of spans) {
    validateId(span.source_span_id, `${span.source_span_id || "span"}: source_span_id`, problems);
    validateId(span.source_id, `${span.source_span_id || "span"}: source_id`, problems);

    if (span.source_id !== source.source_id) {
      problems.push(`${span.source_span_id}: source_id mismatch`);
    }

    if (span.locator?.kind === "char_range") {
      const start = span.locator.char_start;
      const end = span.locator.char_end;
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start! < 0 ||
        end! < start! ||
        end! > input.content.length
      ) {
        problems.push(`${span.source_span_id}: invalid char_range`);
        continue;
      }

      if (
        typeof span.quote_hint === "string" &&
        input.content.slice(start!, end!) !== span.quote_hint
      ) {
        problems.push(`${span.source_span_id}: quote_hint is not exact source slice`);
      }
    }
  }

  for (const arrName of DIRECT_ARRAYS) {
    const items = (bundle as any)[arrName];
    if (!Array.isArray(items)) {
      problems.push(`bundle.${arrName} must be array`);
      continue;
    }

    const idKey = ITEM_ID_KEYS[arrName];

    for (const item of items) {
      validateId(item?.[idKey], `${arrName}.${idKey}`, problems);
      validateId(item?.actor_id, `${arrName}.actor_id`, problems);

      const prov = item?.provenance;
      if (!prov) continue;

      if (prov.query_id !== queryId) {
        problems.push(`${arrName}: provenance.query_id mismatch`);
      }

      validateId(prov.query_id, `${arrName}.provenance.query_id`, problems);

      if (
        !Array.isArray(prov.original_input_ids) ||
        !prov.original_input_ids.includes(input.input_id)
      ) {
        problems.push(`${arrName}: provenance missing original_input_id`);
      } else {
        for (const id of prov.original_input_ids) {
          validateId(id, `${arrName}.provenance.original_input_ids`, problems);
        }
      }

      if (prov.transformation === "extraction") {
        if (
          !Array.isArray(prov.source_span_ids) ||
          prov.source_span_ids.length === 0
        ) {
          problems.push(`${arrName}: extraction without SourceSpan`);
        } else {
          for (const sid of prov.source_span_ids) {
            validateId(sid, `${arrName}.provenance.source_span_ids`, problems);
            if (!spanMap.has(sid)) {
              problems.push(`${arrName}: unknown SourceSpan ${sid}`);
            }
          }
        }
      }
    }
  }

  return problems;
}
