import type { DeltaDocumentSeed } from "./types";
import type { CanonicalDeltaDocument, TranslatorFragment } from "./translator/types";

function mergeUnique<T>(items: T[], id: (x: T) => string, label: string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = id(item);
    const old = map.get(key);
    if (old && JSON.stringify(old) !== JSON.stringify(item)) {
      throw new Error(`Delta promotion: ${label} ID collision: ${key}`);
    }
    map.set(key, item);
  }
  return Array.from(map.values());
}

/**
 * Promote pre-canonical Seed into a canonical-shape DeltaDocument once at least
 * one validated TranslatorFragment exists.
 *
 * Formal JSON Schema validation still belongs to the schema validation layer.
 */
export function promoteSeedWithFragments(
  seed: DeltaDocumentSeed,
  fragments: TranslatorFragment[],
): CanonicalDeltaDocument {
  if (fragments.length < 1) throw new Error("Delta promotion requires at least one validated Bundle");

  for (const f of fragments) {
    if (JSON.stringify(f.query) !== JSON.stringify(seed.query)) {
      throw new Error("Delta promotion: fragment query mismatch");
    }
  }

  return {
    schema_version: seed.schema_version,
    document_id: seed.document_id,
    created_at: seed.created_at,
    query: seed.query,
    actors: mergeUnique(
      [...seed.actors, ...fragments.flatMap((f) => f.actors)],
      (x) => x.actor_id, "Actor",
    ),
    original_inputs: mergeUnique(
      [...seed.original_inputs, ...fragments.flatMap((f) => f.original_inputs)],
      (x) => x.input_id, "OriginalInput",
    ),
    sources: mergeUnique(
      [...seed.sources, ...fragments.flatMap((f) => f.sources)],
      (x) => x.source_id, "Source",
    ),
    source_spans: mergeUnique(
      fragments.flatMap((f) => f.source_spans),
      (x) => x.source_span_id, "SourceSpan",
    ),
    bundles: mergeUnique(
      fragments.map((f) => f.bundle),
      (x) => x.bundle_id, "Bundle",
    ),
    relations: [],
    unresolved_states: [],
    resolution_candidates: [],
    resolutions: [],
    revisions: [],
    decision_history: [],
    followups: [],
  };
}
