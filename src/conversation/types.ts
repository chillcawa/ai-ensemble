import type { ConversationTurn } from "../context/types";

export interface ConversationSummary {
  id: string;
  title: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export type ConversationMessageKind = "normal" | "handoff_request" | "handoff" | "context_reload_keep" | "context_reload_reset";

export interface AppliedAiReferenceSnapshot {
  contextId: string;
  provenance: "imported_conversation";
  archiveId?: string;
  archiveSource?: string;
  provider?: string;
  model?: string;
  slotId?: string;
  nickname?: string;
  capturedAt: string;
}

export type ObservationClass = "independent" | "self_referenced" | "cross_ai" | "ai_referenced_unknown";

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  kind: ConversationMessageKind;
  slot_id?: string | null;
  provider?: string | null;
  model?: string | null;
  nickname?: string | null;
  content: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
  elapsed_ms?: number | null;
  applied_context_ids: string[];
  applied_ai_reference_sources: AppliedAiReferenceSnapshot[];
  target_slot_ids: string[];
  parent_message_id?: string | null;
  created_at: string;
}

export function historyForSlot(messages: ConversationMessage[], slotId: string): ConversationTurn[] {
  // A reset-style Context reload creates a hard history boundary for subsequent
  // provider requests while leaving the full transcript intact in SQLite/UI.
  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].kind === "context_reload_reset") {
      startIndex = i + 1;
      break;
    }
  }

  return messages
    .slice(startIndex)
    .filter((message) => message.kind === "normal")
    .filter((message) => message.role === "assistant" ? message.slot_id === slotId : (message.target_slot_ids.length === 0 || message.target_slot_ids.includes(slotId)))
    .map((message) => ({ role: message.role, content: message.content }));
}

function directObservationClass(message: ConversationMessage): ObservationClass {
  if (message.role !== "assistant" || !message.slot_id) return "independent";
  const refs = message.applied_ai_reference_sources ?? [];
  if (refs.length === 0) return "independent";
  // Once multiple AI-origin references are present, retain the strongest/least-independent
  // category. Cross-slot influence dominates unknown, which dominates self-reference.
  if (refs.some((ref) => ref.slotId && ref.slotId !== message.slot_id)) return "cross_ai";
  if (refs.some((ref) => !ref.slotId)) return "ai_referenced_unknown";
  return "self_referenced";
}

function combineObservationClass(previous: ObservationClass, direct: ObservationClass): ObservationClass {
  const rank: Record<ObservationClass, number> = {
    independent: 0,
    self_referenced: 1,
    ai_referenced_unknown: 2,
    cross_ai: 3,
  };
  return rank[direct] > rank[previous] ? direct : previous;
}

/**
 * Derive observation class from immutable per-message source snapshots.
 * Influence is transitive and monotonic until a context_reload_reset boundary.
 * No hand-maintained "isCrossAI" flag is stored.
 */
export function deriveObservationClasses(messages: ConversationMessage[]): Map<string, ObservationClass> {
  const result = new Map<string, ObservationClass>();
  const influenceBySlot = new Map<string, ObservationClass>();

  for (const message of messages) {
    if (message.kind === "context_reload_reset") {
      influenceBySlot.clear();
      continue;
    }
    if (message.role !== "assistant" || message.kind !== "normal" || !message.slot_id) continue;

    const previous = influenceBySlot.get(message.slot_id) ?? "independent";
    const direct = directObservationClass(message);
    const current = combineObservationClass(previous, direct);
    influenceBySlot.set(message.slot_id, current);
    result.set(message.id, current);
  }
  return result;
}
