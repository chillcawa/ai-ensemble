import type { DeltaDocumentSeed } from "../types";
import type { TranslatorFragment, CanonicalDeltaDocument } from "../translator/types";
import type { ComparatorFragment } from "../comparator/types";

function mergeUnique<T>(items: T[], id: (x: T) => string, label: string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = id(item);
    const old = map.get(key);
    if (old && JSON.stringify(old) !== JSON.stringify(item)) {
      throw new Error(`Delta Assembler: ${label} ID collision: ${key}`);
    }
    map.set(key, item);
  }
  return Array.from(map.values());
}

export function assembleWithComparator(args: {
  seed: DeltaDocumentSeed;
  fragments: TranslatorFragment[];
  comparator?: ComparatorFragment;
}): CanonicalDeltaDocument {
  if (args.fragments.length < 1) {
    throw new Error("Delta Assembler requires at least one validated TranslatorFragment");
  }

  for (const f of args.fragments) {
    if (JSON.stringify(f.query) !== JSON.stringify(args.seed.query)) {
      throw new Error("Delta Assembler: fragment query mismatch");
    }
  }

  const actors = [
    ...args.seed.actors,
    ...args.fragments.flatMap((f) => f.actors),
    ...(args.comparator?.actors || []),
  ];

  return {
    schema_version: args.seed.schema_version,
    document_id: args.seed.document_id,
    created_at: args.seed.created_at,
    query: args.seed.query,
    actors: mergeUnique(actors, (x) => x.actor_id, "Actor"),
    original_inputs: mergeUnique(
      [...args.seed.original_inputs, ...args.fragments.flatMap((f) => f.original_inputs)],
      (x) => x.input_id, "OriginalInput",
    ),
    sources: mergeUnique(
      [...args.seed.sources, ...args.fragments.flatMap((f) => f.sources)],
      (x) => x.source_id, "Source",
    ),
    source_spans: mergeUnique(
      args.fragments.flatMap((f) => f.source_spans),
      (x) => x.source_span_id, "SourceSpan",
    ),
    bundles: mergeUnique(
      args.fragments.map((f) => f.bundle),
      (x) => x.bundle_id, "Bundle",
    ),
    relations: args.comparator?.relations || [],
    unresolved_states: args.comparator?.unresolved_states || [],
    resolution_candidates: args.comparator?.resolution_candidates || [],
    resolutions: [],
    revisions: [],
    decision_history: [],
    followups: [],
  };
}
