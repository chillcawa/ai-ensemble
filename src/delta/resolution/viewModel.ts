import type { CanonicalDeltaDocument } from "../translator/types";

export function resolutionCandidatesForTargets(
  doc: CanonicalDeltaDocument,
  targetIds: string[],
): any[] {
  const targetSet = new Set(targetIds);
  return (doc.resolution_candidates as any[]).filter((candidate) =>
    (candidate.target_ids || []).some((id: string) => targetSet.has(id)),
  );
}

export function activeUnresolvedForTargets(
  doc: CanonicalDeltaDocument,
  targetIds: string[],
): any[] {
  const targetSet = new Set(targetIds);
  return (doc.unresolved_states as any[]).filter((state) =>
    state.unresolved === true &&
    (state.target_ids || []).some((id: string) => targetSet.has(id)),
  );
}
