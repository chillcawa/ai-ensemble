import type {
  BuildEnsembleRunOptions,
  DeltaProviderResponseStatus,
  DeltaRunProvider,
  DeltaRunResponse,
  DeltaRunType,
  EchoConversationMessageLike,
  EnsembleRun,
} from "./types";

function stablePart(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function appliedContextIds(m: EchoConversationMessageLike): string[] {
  return m.appliedContextIds ?? m.applied_context_ids ?? [];
}
function appliedAiReferenceSources(m: EchoConversationMessageLike): string[] {
  return m.appliedAiReferenceSources ?? m.applied_ai_reference_sources ?? [];
}
function createdAt(m: EchoConversationMessageLike): string | undefined {
  return m.createdAt ?? m.created_at ?? undefined;
}
function explicitStatus(m: EchoConversationMessageLike): DeltaProviderResponseStatus | undefined {
  return m.responseStatus ?? m.response_status ?? undefined;
}
function actorIdFor(m: EchoConversationMessageLike): string {
  const slotIdentity = m.slotId || m.slot_id || "unknown-slot";
  return `actor:${stablePart(m.provider || "unknown-provider")}-${stablePart(m.model || "unknown-model")}-${stablePart(slotIdentity)}`;
}
function providerIdFor(m: EchoConversationMessageLike): string {
  return stablePart(m.provider || m.slotId || m.slot_id || "unknown-provider");
}
function responseRunType(m: EchoConversationMessageLike): DeltaRunType {
  const kind = String(m.kind || "normal").toLowerCase();
  return kind !== "normal" || appliedAiReferenceSources(m).length > 0 ? "derived" : "baseline";
}
function responseContextLineageKey(m: EchoConversationMessageLike): string {
  const ctx = [...appliedContextIds(m)].sort();
  const refs = [...appliedAiReferenceSources(m)].sort();
  return `ctx:${ctx.join(",") || "none"}|refs:${refs.join(",") || "none"}`;
}

export function deltaCohortKeyForMessage(m: EchoConversationMessageLike): string {
  return `${responseRunType(m)}|${responseContextLineageKey(m)}`;
}

export function groupAssistantMessagesByDeltaCohort(
  assistantMessages: EchoConversationMessageLike[],
): Map<string, EchoConversationMessageLike[]> {
  const groups = new Map<string, EchoConversationMessageLike[]>();
  for (const m of assistantMessages.filter((x) => x.role === "assistant")) {
    const key = deltaCohortKeyForMessage(m);
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  return groups;
}

function makeRunId(queryMessageId: string): string {
  const suffix =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `run:${queryMessageId}:${suffix}`;
}

export function buildEnsembleRunFromSavedTurn(
  queryMessage: EchoConversationMessageLike,
  assistantMessages: EchoConversationMessageLike[],
  options: BuildEnsembleRunOptions = {},
): EnsembleRun {
  if (queryMessage.role !== "user") throw new Error("Delta P7-A: queryMessage must be role=user");

  const groups = groupAssistantMessagesByDeltaCohort(assistantMessages);
  if (groups.size === 0) throw new Error("Delta P7-A: no assistant responses in saved turn");

  let cohortKey = options.cohortKey;
  if (!cohortKey) {
    if (groups.size > 1) {
      throw new Error(
        "Delta P7-A: mixed Baseline/Derived or context lineages detected; select one cohort explicitly",
      );
    }
    cohortKey = Array.from(groups.keys())[0];
  }

  const usable = groups.get(cohortKey);
  if (!usable?.length) throw new Error(`Delta P7-A: unknown or empty cohortKey: ${cohortKey}`);

  const runType = responseRunType(usable[0]);
  const lineage = responseContextLineageKey(usable[0]);
  const providersByActor = new Map<string, DeltaRunProvider>();
  const responses: DeltaRunResponse[] = [];

  for (const message of usable) {
    const actorId = actorIdFor(message);
    const providerId = providerIdFor(message);
    const itemType = responseRunType(message);
    const itemLineage = responseContextLineageKey(message);
    if (itemType !== runType || itemLineage !== lineage) {
      throw new Error("Delta P7-A: cohort contains mixed run type or context lineage");
    }

    if (!providersByActor.has(actorId)) {
      providersByActor.set(actorId, {
        provider_id: providerId,
        actor_id: actorId,
        actor_type: "ai",
        provider: message.provider ?? undefined,
        model: message.model ?? undefined,
        label: message.nickname ?? undefined,
      });
    }

    const content = typeof message.content === "string" ? message.content : "";
    const status = explicitStatus(message) ?? (content.length > 0 ? "ok" : "empty");

    responses.push({
      response_message_id: message.id,
      provider_id: providerId,
      actor_id: actorId,
      actor_type: "ai",
      status,
      content_type: "text",
      content: content.length > 0 ? content : null,
      received_at: createdAt(message),
      provider: message.provider ?? undefined,
      model: message.model ?? undefined,
      label: message.nickname ?? undefined,
      applied_context_ids: appliedContextIds(message),
      applied_ai_reference_sources: appliedAiReferenceSources(message),
      run_type: itemType,
      context_lineage_key: itemLineage,
    });
  }

  return {
    run_id: options.runId ?? makeRunId(queryMessage.id),
    run_type: runType,
    parent_run_id: options.parentRunId,
    query: {
      query_id: `query:${queryMessage.id}`,
      text: queryMessage.content,
      actor_id: options.humanActorId ?? "actor:human-local",
    },
    providers: Array.from(providersByActor.values()),
    responses,
    context_lineage_key: lineage,
  };
}

export function splitBaselineAndDerived(assistantMessages: EchoConversationMessageLike[]) {
  const baseline: EchoConversationMessageLike[] = [];
  const derived: EchoConversationMessageLike[] = [];
  for (const m of assistantMessages.filter((x) => x.role === "assistant")) {
    (responseRunType(m) === "derived" ? derived : baseline).push(m);
  }
  return { baseline, derived };
}
