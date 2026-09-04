import type { CanonicalDeltaDocument } from "../translator/types";
import type {
  DeltaDecisionHistoryRecord,
  DeltaReopenRequest,
  DeltaResolutionRecord,
  DeltaRevisionRecord,
  HumanDecision,
  HumanResolutionDraft,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function newStableId(prefix: string): string {
  const suffix =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

function actorType(
  doc: CanonicalDeltaDocument,
  actorId: string,
): string | undefined {
  return (doc.actors as any[]).find((a) => a.actor_id === actorId)?.actor_type;
}

function assertHuman(doc: CanonicalDeltaDocument, actorId: string) {
  if (actorType(doc, actorId) !== "human") {
    throw new Error(
      "Delta Resolution: only a registered Human Actor may create Resolution",
    );
  }
}

const DOCUMENT_IDENTITY_FIELDS = new Set([
  "document_id",
  "actor_id",
  "query_id",
  "input_id",
  "source_id",
  "source_span_id",
  "bundle_id",
  "claim_id",
  "support_id",
  "semantic_id",
  "hypothesis_id",
  "interpretation_id",
  "dissent_id",
  "counterposition_id",
  "relation_id",
  "state_id",
  "candidate_id",
  "resolution_id",
  "revision_id",
  "event_id",
  "followup_id",
]);

function collectDocumentIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectDocumentIds(item, ids);
    return ids;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // Only collect identity fields, never reference-only fields such as target_ids,
    // basis_ids, previous_revision_id, or derived_from_ids. Otherwise one dangling
    // reference could incorrectly make another dangling reference look valid.
    if (DOCUMENT_IDENTITY_FIELDS.has(key) && typeof item === "string") {
      ids.add(item);
    }
    collectDocumentIds(item, ids);
  }
  return ids;
}

function assertKnownIds(
  doc: CanonicalDeltaDocument,
  kind: "target_id" | "basis_id",
  values: string[],
) {
  const knownIds = collectDocumentIds(doc);
  for (const value of values) {
    if (!knownIds.has(value)) {
      throw new Error(`Delta Resolution: unknown ${kind} ${value}`);
    }
  }
}

function validateDraft(
  doc: CanonicalDeltaDocument,
  draft: HumanResolutionDraft,
) {
  assertHuman(doc, draft.human_actor_id);

  if (!draft.decision) {
    throw new Error(
      "Delta Resolution: decision must be explicitly selected by Human",
    );
  }
  if (!draft.target_ids.length) {
    throw new Error("Delta Resolution: target_ids must not be empty");
  }
  if (!draft.basis_ids.length) {
    throw new Error(
      "Delta Resolution: Human must explicitly select at least one basis_id",
    );
  }
  assertKnownIds(doc, "target_id", draft.target_ids);
  assertKnownIds(doc, "basis_id", draft.basis_ids);
  if (draft.decision === "other" && !draft.decision_value?.trim()) {
    throw new Error(
      "Delta Resolution: decision_value is required for decision=other",
    );
  }
  if (
    draft.decision === "other" &&
    draft.close_unresolved === undefined
  ) {
    throw new Error(
      "Delta Resolution: decision=other requires explicit close_unresolved true/false",
    );
  }

  if (draft.candidate_id) {
    const exists = (doc.resolution_candidates as any[]).some(
      (candidate) => candidate.candidate_id === draft.candidate_id,
    );
    if (!exists) {
      throw new Error(
        `Delta Resolution: unknown candidate_id ${draft.candidate_id}`,
      );
    }
  }
}

function closeOverlappingUnresolved(
  doc: CanonicalDeltaDocument,
  targetIds: string[],
  shouldClose: boolean,
): CanonicalDeltaDocument["unresolved_states"] {
  if (!shouldClose) return doc.unresolved_states;

  const targetSet = new Set(targetIds);
  return (doc.unresolved_states as any[]).filter((state) => {
    if (targetSet.has(state.state_id)) return false;
    const stateTargets = (state.target_ids || []) as string[];
    const fullyCovered =
      stateTargets.length > 0 && stateTargets.every((id) => targetSet.has(id));
    return !fullyCovered;
  });
}

function latestOverlappingResolution(
  doc: CanonicalDeltaDocument,
  targetIds: string[],
): any | undefined {
  const targets = new Set(targetIds);
  const matches = (doc.resolutions as any[]).filter((resolution) =>
    (resolution.target_ids || []).some((id: string) => targets.has(id)),
  );
  return matches.length ? matches[matches.length - 1] : undefined;
}

function nextRevision(
  doc: CanonicalDeltaDocument,
  args: {
    targetId: string;
    actorId: string;
    changeType: DeltaRevisionRecord["change_type"];
    reason?: string;
    createdAt: string;
  },
): DeltaRevisionRecord {
  const related = (doc.revisions as any[])
    .filter((revision) => revision.target_id === args.targetId)
    .sort(
      (a, b) =>
        Number(a.revision_number || 0) - Number(b.revision_number || 0),
    );

  const previous = related.length ? related[related.length - 1] : undefined;

  return {
    revision_id: newStableId("revision"),
    target_id: args.targetId,
    actor_id: args.actorId,
    revision_number: Number(previous?.revision_number || 0) + 1,
    previous_revision_id: previous?.revision_id || null,
    change_type: args.changeType,
    reason: args.reason || null,
    created_at: args.createdAt,
  };
}

/**
 * Human-only, append-only Resolution creation.
 *
 * Formal Schema v0.1 alignment:
 * - candidate_ids[] (not singular candidate_id)
 * - note is stored as Resolution.text
 * - DecisionHistory uses decisionEvent shape
 * - Revision uses Formal Schema revision shape
 */
export function createHumanResolution(
  doc: CanonicalDeltaDocument,
  draft: HumanResolutionDraft,
  createdAt = nowIso(),
): CanonicalDeltaDocument {
  validateDraft(doc, draft);

  const previous = latestOverlappingResolution(doc, draft.target_ids);
  const resolution: DeltaResolutionRecord = {
    resolution_id: newStableId("resolution"),
    decided_by_actor_id: draft.human_actor_id,
    decided_by_actor_type: "human",
    decision: draft.decision!,
    decision_value:
      draft.decision === "other"
        ? draft.decision_value?.trim()
        : undefined,
    text: draft.note?.trim() || null,
    target_ids: [...draft.target_ids],
    basis_ids: [...draft.basis_ids],
    candidate_ids: draft.candidate_id ? [draft.candidate_id] : [],
    created_at: createdAt,
  };

  const history: DeltaDecisionHistoryRecord = {
    event_id: newStableId("decision-event"),
    resolution_id: resolution.resolution_id,
    actor_id: draft.human_actor_id,
    actor_type: "human",
    from_decision: (previous?.decision as HumanDecision | undefined) || null,
    to_decision: draft.decision!,
    note: draft.note?.trim() || null,
    created_at: createdAt,
  };

  const revision = nextRevision(doc, {
    targetId: resolution.resolution_id,
    actorId: draft.human_actor_id,
    changeType: "create",
    reason: draft.note?.trim() || undefined,
    createdAt,
  });

  const closeUnresolved =
    draft.decision === "accept" || draft.decision === "reject"
      ? true
      : draft.decision === "hold"
        ? false
        : Boolean(draft.close_unresolved);

  return {
    ...doc,
    unresolved_states: closeOverlappingUnresolved(
      doc,
      draft.target_ids,
      closeUnresolved,
    ),
    resolutions: [...doc.resolutions, resolution],
    decision_history: [...doc.decision_history, history],
    revisions: [...doc.revisions, revision],
  };
}

/**
 * Human-only reopen.
 *
 * Formal Schema does not define a dedicated `reopen` DecisionHistory event.
 * v0.1 records Human Reopen as:
 * - new UnresolvedState
 * - Revision(change_type="other", reason="REOPEN: ...")
 * - DecisionHistory transition to hold, tied to the retained old Resolution
 *
 * The old Resolution is never deleted or rewritten.
 */
export function reopenIssue(
  doc: CanonicalDeltaDocument,
  request: DeltaReopenRequest,
  createdAt = nowIso(),
): CanonicalDeltaDocument {
  assertHuman(doc, request.human_actor_id);

  const reason = request.reason.trim();
  if (!reason) throw new Error("Delta Reopen: reason is required");
  if (!request.target_ids.length) {
    throw new Error("Delta Reopen: target_ids must not be empty");
  }
  assertKnownIds(doc, "target_id", request.target_ids);

  const requestedTargets = new Set(request.target_ids);
  const alreadyOpen = (doc.unresolved_states as any[]).some((state) => {
    if (!state?.unresolved) return false;
    const stateTargets = new Set<string>(state.target_ids || []);
    return Array.from(requestedTargets).every((id) => stateTargets.has(id));
  });
  if (alreadyOpen) {
    throw new Error(
      "Delta Reopen: target is already represented by an open UnresolvedState",
    );
  }

  const previous = latestOverlappingResolution(doc, request.target_ids);
  if (!previous) {
    throw new Error(
      "Delta Reopen: an overlapping existing Resolution is required",
    );
  }

  const newState = {
    state_id: newStableId("state"),
    target_ids: [...request.target_ids],
    unresolved: true as const,
    states: ["divergence"] as Array<
      "unknown" | "divergence" | "deadlock"
    >,
    note: `Reopened by Human: ${reason}`,
  };

  const history: DeltaDecisionHistoryRecord = {
    event_id: newStableId("decision-event"),
    resolution_id: previous.resolution_id,
    actor_id: request.human_actor_id,
    actor_type: "human",
    from_decision: previous.decision as HumanDecision,
    to_decision: "hold",
    note: `REOPEN: ${reason}`,
    created_at: createdAt,
  };

  const revision = nextRevision(doc, {
    targetId: previous.resolution_id,
    actorId: request.human_actor_id,
    changeType: "other",
    reason: `REOPEN: ${reason}`,
    createdAt,
  });

  return {
    ...doc,
    unresolved_states: [...doc.unresolved_states, newState],
    decision_history: [...doc.decision_history, history],
    revisions: [...doc.revisions, revision],
  };
}
