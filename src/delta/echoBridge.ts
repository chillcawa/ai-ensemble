import type { ConversationMessage } from "../conversation/types";
import {
  buildEnsembleRunFromSavedTurn,
  groupAssistantMessagesByDeltaCohort,
} from "./adapter";
import type {
  EchoConversationMessageLike,
  EnsembleRun,
} from "./types";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function aiReferenceSourceTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];

    const ref = item as Record<string, unknown>;
    const contextId = typeof ref.contextId === "string" ? ref.contextId : "";
    const slotId = typeof ref.slotId === "string" ? ref.slotId : "";
    const archiveId = typeof ref.archiveId === "string" ? ref.archiveId : "";
    const provider = typeof ref.provider === "string" ? ref.provider : "";
    const model = typeof ref.model === "string" ? ref.model : "";

    const stableParts = [
      contextId ? `context:${contextId}` : "",
      slotId ? `slot:${slotId}` : "",
      archiveId ? `archive:${archiveId}` : "",
      provider ? `provider:${provider}` : "",
      model ? `model:${model}` : "",
    ].filter(Boolean);

    return stableParts.length ? [stableParts.join("|")] : [];
  });
}

/**
 * Map the actual ECHO ConversationMessage into Delta's integration-facing
 * tolerant shape without changing the authoritative Conversation record.
 *
 * `as any` is deliberate here: ECHO's storage boundary may expose some fields
 * in snake_case while write-side calls use camelCase. The adapter keeps both
 * spellings isolated to this bridge.
 */
export function echoConversationMessageToDeltaLike(
  message: ConversationMessage,
): EchoConversationMessageLike {
  const m = message as any;
  const appliedContexts = stringArray(
    m.appliedContextIds ?? m.applied_context_ids,
  );
  const appliedReferences = aiReferenceSourceTokens(
    m.appliedAiReferenceSources ?? m.applied_ai_reference_sources,
  );
  return {
    id: String(m.id),
    role: String(m.role),
    kind: m.kind ?? null,
    content: typeof m.content === "string" ? m.content : "",
    slotId: m.slotId ?? null,
    slot_id: m.slot_id ?? null,
    provider: m.provider ?? null,
    model: m.model ?? null,
    nickname: m.nickname ?? null,
    createdAt: m.createdAt ?? null,
    created_at: m.created_at ?? null,
    appliedContextIds: appliedContexts,
    applied_context_ids: appliedContexts,
    appliedAiReferenceSources: appliedReferences,
    applied_ai_reference_sources: appliedReferences,
    responseStatus: m.responseStatus ?? null,
    response_status: m.response_status ?? null,
  };
}

export interface EchoDeltaTurnCohort {
  queryMessage: ConversationMessage;
  assistantMessages: ConversationMessage[];
  cohortKey: string;
  runType: "baseline" | "derived";
  contextLineageKey: string;
}

/**
 * Convert saved ECHO conversation history into Delta-safe Turn cohorts.
 *
 * Rule:
 * A user message opens a Turn. Subsequent assistant messages belong to that
 * Turn until the next user message. Within that Turn, Baseline / Derived /
 * context-reference lineages are further separated into distinct cohorts.
 */
export function buildDeltaTurnCohorts(
  messages: ConversationMessage[],
): EchoDeltaTurnCohort[] {
  const result: EchoDeltaTurnCohort[] = [];

  let currentQuery: ConversationMessage | undefined;
  let assistants: ConversationMessage[] = [];

  function flush() {
    if (!currentQuery || assistants.length === 0) {
      assistants = [];
      return;
    }

    const deltaAssistants = assistants.map(echoConversationMessageToDeltaLike);
    const grouped = groupAssistantMessagesByDeltaCohort(deltaAssistants);

    for (const [cohortKey, group] of grouped) {
      const originalById = new Map(
        assistants.map((m: any) => [String(m.id), m as ConversationMessage]),
      );
      const mappedBack = group
        .map((m) => originalById.get(String(m.id)))
        .filter((m): m is ConversationMessage => Boolean(m));

      const separatorIndex = cohortKey.indexOf("|");
      const runType = separatorIndex >= 0 ? cohortKey.slice(0, separatorIndex) : cohortKey;
      const contextLineageKey = separatorIndex >= 0 ? cohortKey.slice(separatorIndex + 1) : "ctx:none|refs:none";
      result.push({
        queryMessage: currentQuery,
        assistantMessages: mappedBack,
        cohortKey,
        runType: runType === "derived" ? "derived" : "baseline",
        contextLineageKey: contextLineageKey || "ctx:none",
      });
    }

    assistants = [];
  }

  for (const message of messages) {
    const m = message as any;

    if (m.role === "user") {
      flush();
      currentQuery = message;
      continue;
    }

    if (m.role === "assistant" && currentQuery) {
      assistants.push(message);
    }
  }

  flush();
  return result;
}

export function buildEnsembleRunFromEchoCohort(
  cohort: EchoDeltaTurnCohort,
): EnsembleRun {
  return buildEnsembleRunFromSavedTurn(
    echoConversationMessageToDeltaLike(cohort.queryMessage),
    cohort.assistantMessages.map(echoConversationMessageToDeltaLike),
    { cohortKey: cohort.cohortKey },
  );
}

/**
 * Useful for UI/debug before Translator wiring:
 * returns one safe EnsembleRun snapshot per comparable cohort.
 */
export function buildEnsembleRunsFromConversation(
  messages: ConversationMessage[],
): EnsembleRun[] {
  return buildDeltaTurnCohorts(messages).map(buildEnsembleRunFromEchoCohort);
}
