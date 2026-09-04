import type { ComparatorRunInput } from "./types";

type AnyRecord = Record<string, any>;

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((x): x is string => typeof x === "string" && x.length > 0))];
}

function resolveComparatorActorId(input: ComparatorRunInput, fragment: AnyRecord): string {
  const comparedActorIds = new Set(input.bundles.map((bundle) => bundle.actor_id));
  const actors = Array.isArray(fragment.actors) ? fragment.actors : [];

  const declaredComparator = actors.find(
    (actor: AnyRecord) =>
      actor?.actor_type === "system" &&
      typeof actor?.actor_id === "string" &&
      !comparedActorIds.has(actor.actor_id),
  );

  if (declaredComparator?.actor_id) {
    return declaredComparator.actor_id;
  }

  // Runtime fallback used only when the model omitted the Comparator registry entry.
  // This is a protocol identity, not semantic content.
  return "actor:delta-comparator";
}

function buildClaimIndex(input: ComparatorRunInput) {
  const index = new Map<string, {
    actorId: string;
    originalInputId: string;
    sourceSpanIds: string[];
  }>();

  for (const bundle of input.bundles) {
    for (const claim of bundle.claims || []) {
      index.set(claim.claim_id, {
        actorId: bundle.actor_id,
        originalInputId: bundle.original_input_id,
        sourceSpanIds: Array.isArray(claim.provenance?.source_span_ids)
          ? claim.provenance.source_span_ids
          : [],
      });
    }
  }
  return index;
}

/**
 * Deterministic structural normalization only.
 *
 * This function does NOT:
 * - change relation kind
 * - invent a replacement target
 * - turn same-Actor relation into cross-Actor relation
 * - create new semantic relations
 *
 * Invalid same-Actor / dangling-target relations are dropped with warnings.
 */
export function canonicalizeComparatorFragment(args: {
  input: ComparatorRunInput;
  fragment: AnyRecord;
  warnings?: unknown[];
}): { fragment: AnyRecord; warnings: string[] } {
  const { input } = args;
  const fragment: AnyRecord = structuredClone(args.fragment || {});
  const warnings = (args.warnings || [])
    .map((x) => typeof x === "string" ? x : JSON.stringify(x));

  const claimIndex = buildClaimIndex(input);
  const comparatorActorId = resolveComparatorActorId(input, fragment);

  const actors = Array.isArray(fragment.actors) ? fragment.actors : [];
  const hasComparatorActor = actors.some(
    (actor: AnyRecord) =>
      actor?.actor_id === comparatorActorId &&
      actor?.actor_type === "system",
  );

  if (!hasComparatorActor) {
    fragment.actors = [
      ...actors,
      {
        actor_id: comparatorActorId,
        actor_type: "system",
        display_name: "Delta Comparator",
      },
    ];
  } else {
    fragment.actors = actors;
  }

  const relations = Array.isArray(fragment.relations) ? fragment.relations : [];
  const validRelations: AnyRecord[] = [];

  for (const relation of relations) {
    const relationId = relation?.relation_id || "relation:unknown";
    const targetIds = uniqueStrings(
      Array.isArray(relation?.target_ids) ? relation.target_ids : [],
    );
    const targetMeta = targetIds
      .map((id) => ({ id, meta: claimIndex.get(id) }))
      .filter((x) => x.meta);

    if (targetMeta.length !== targetIds.length || targetIds.length < 2) {
      warnings.push(
        `${relationId}: dropped by canonicalizer; relation targets must be >=2 existing Claim IDs`,
      );
      continue;
    }

    const owners = new Set(targetMeta.map((x) => x.meta!.actorId));
    if (owners.size < 2) {
      warnings.push(
        `${relationId}: dropped by canonicalizer; same-Actor relation is invalid in Comparator v0.1`,
      );
      continue;
    }

    relation.actor_id = comparatorActorId;
    relation.target_ids = targetIds;
    relation.condition_ids = Array.isArray(relation.condition_ids) ? relation.condition_ids : [];
    relation.scope_ids = Array.isArray(relation.scope_ids) ? relation.scope_ids : [];

    if (relation.confidence && typeof relation.confidence === "object") {
      relation.confidence.type = "comparison";
    }

    const previousProv =
      relation.provenance && typeof relation.provenance === "object"
        ? relation.provenance
        : {};

    relation.provenance = {
      ...previousProv,
      query_id: input.query.query_id,
      original_input_ids: uniqueStrings(
        targetMeta.map((x) => x.meta!.originalInputId),
      ),
      source_span_ids: uniqueStrings(
        targetMeta.flatMap((x) => x.meta!.sourceSpanIds),
      ),
      derived_from_ids: targetIds,
      transformation: "comparison",
    };

    validRelations.push(relation);
  }

  fragment.relations = validRelations;

  const candidates = Array.isArray(fragment.resolution_candidates)
    ? fragment.resolution_candidates
    : [];

  for (const candidate of candidates) {
    // IMPORTANT:
    // Do not rewrite candidate.actor_id / actor_type.
    // Authorship is semantically significant. If a compared Actor authored a
    // Comparator-generated candidate, validation must reject it so the model
    // gets one repair attempt. Code must never "launder" authorship.

    const targetIds = uniqueStrings(
      Array.isArray(candidate.target_ids) ? candidate.target_ids : [],
    );
    candidate.target_ids = targetIds;

    const claimTargets = targetIds
      .map((id) => ({ id, meta: claimIndex.get(id) }))
      .filter((x) => x.meta);

    const previousProv =
      candidate.provenance && typeof candidate.provenance === "object"
        ? candidate.provenance
        : {};

    candidate.provenance = {
      ...previousProv,
      query_id: input.query.query_id,
      original_input_ids: uniqueStrings(
        claimTargets.map((x) => x.meta!.originalInputId),
      ),
      source_span_ids: uniqueStrings(
        claimTargets.flatMap((x) => x.meta!.sourceSpanIds),
      ),
      derived_from_ids: uniqueStrings([
        ...(Array.isArray(previousProv.derived_from_ids)
          ? previousProv.derived_from_ids
          : []),
        ...targetIds,
      ]),
      transformation: "comparison",
    };

    if (candidate.confidence && typeof candidate.confidence === "object") {
      candidate.confidence.type = "comparison";
    }
  }

  fragment.resolution_candidates = candidates;
  fragment.unresolved_states = Array.isArray(fragment.unresolved_states)
    ? fragment.unresolved_states
    : [];

  return { fragment, warnings };
}
