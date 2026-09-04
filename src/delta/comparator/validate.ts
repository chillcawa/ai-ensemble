import type { DeltaIRBundle } from "../translator/types";
import type { ComparatorFragment } from "./types";

export function validateComparatorFragmentCore(args: {
  queryId: string;
  bundles: DeltaIRBundle[];
  fragment: ComparatorFragment;
}): string[] {
  const { queryId, bundles, fragment } = args;
  const problems: string[] = [];
  const claimOwners = new Map<string, string>();

  for (const b of bundles) {
    for (const c of b.claims || []) claimOwners.set(c.claim_id, b.actor_id);
  }

  const comparatorActorIds = new Set(
    fragment.actors
      .filter((a) => a.actor_type === "system")
      .map((a) => a.actor_id),
  );

  for (const rel of fragment.relations) {
    if (!comparatorActorIds.has(rel.actor_id)) {
      problems.push(`${rel.relation_id}: relation actor is not registered Comparator system Actor`);
    }

    const owners = new Set<string>();
    for (const tid of rel.target_ids || []) {
      const owner = claimOwners.get(tid);
      if (owner) owners.add(owner);
    }
    if (owners.size < 2) {
      problems.push(`${rel.relation_id}: relation is not cross-Actor`);
    }

    if (rel.provenance?.query_id !== queryId) {
      problems.push(`${rel.relation_id}: provenance.query_id mismatch`);
    }
    if (rel.provenance?.transformation !== "comparison") {
      problems.push(`${rel.relation_id}: provenance.transformation must be comparison`);
    }
    if (rel.confidence && rel.confidence.type !== "comparison") {
      problems.push(`${rel.relation_id}: confidence.type must be comparison`);
    }
    if (rel.kind === "conditional_agreement") {
      const grounded =
        Boolean(rel.condition_ids?.length) ||
        Boolean(rel.scope_ids?.length) ||
        Boolean(rel.note);
      if (!grounded) problems.push(`${rel.relation_id}: conditional_agreement lacks grounding`);
    }
  }

  for (const cand of fragment.resolution_candidates) {
    if (!comparatorActorIds.has(cand.actor_id)) {
      problems.push(`${cand.candidate_id}: candidate actor must be Comparator system Actor`);
    }
    if (cand.actor_type !== "system") {
      problems.push(`${cand.candidate_id}: comparator-generated candidate actor_type must be system`);
    }
    if (cand.provenance?.query_id !== queryId) {
      problems.push(`${cand.candidate_id}: provenance.query_id mismatch`);
    }
    if (cand.provenance?.transformation !== "comparison") {
      problems.push(`${cand.candidate_id}: provenance.transformation must be comparison`);
    }
    if (cand.confidence && cand.confidence.type !== "comparison") {
      problems.push(`${cand.candidate_id}: confidence.type must be comparison`);
    }
  }

  for (const state of fragment.unresolved_states) {
    if (state.unresolved !== true) problems.push(`${state.state_id}: unresolved must be true`);
    if (typeof state.note === "string" && /human decision not yet recorded/i.test(state.note)) {
      problems.push(`${state.state_id}: Human Resolution absence alone cannot justify Unresolved`);
    }
  }

  return problems;
}
