import { invoke } from "@tauri-apps/api/core";
import type { AppliedAiReferenceSnapshot, ConversationMessage, ConversationMessageKind, ConversationSummary } from "./types";

export async function createConversation(id: string, title: string, projectId: string): Promise<ConversationSummary> {
  return invoke<ConversationSummary>("create_conversation", { id, title, projectId });
}

export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  return invoke<ConversationSummary[]>("list_conversations", { projectId });
}

type RawConversationMessage = Omit<ConversationMessage, "applied_context_ids" | "applied_ai_reference_sources" | "target_slot_ids"> & {
  applied_context_ids: string;
  applied_ai_reference_sources: string;
  target_slot_ids: string;
};

export async function loadConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const raw = await invoke<RawConversationMessage[]>("get_conversation_messages", { conversationId });
  return raw.map(normalizeRawMessage);
}

export interface AppendConversationMessageInput {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  kind?: ConversationMessageKind;
  slotId?: string;
  provider?: string;
  model?: string;
  nickname?: string;
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  elapsedMs?: number;
  appliedContextIds?: string[];
  appliedAiReferenceSources?: AppliedAiReferenceSnapshot[];
  targetSlotIds?: string[];
  parentMessageId?: string;
}

export async function appendConversationMessage(input: AppendConversationMessageInput): Promise<ConversationMessage> {
  const raw = await invoke<RawConversationMessage>("append_conversation_message", {
    id: input.id,
    conversationId: input.conversationId,
    role: input.role,
    kind: input.kind ?? "normal",
    slotId: input.slotId,
    provider: input.provider,
    model: input.model,
    nickname: input.nickname,
    content: input.content,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd: input.costUsd,
    elapsedMs: input.elapsedMs,
    appliedContextIdsJson: JSON.stringify(input.appliedContextIds ?? []),
    appliedAiReferenceSourcesJson: JSON.stringify(input.appliedAiReferenceSources ?? []),
    targetSlotIdsJson: JSON.stringify(input.targetSlotIds ?? []),
    parentMessageId: input.parentMessageId,
  });
  return normalizeRawMessage(raw);
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
  return invoke<ConversationSummary>("rename_conversation", { conversationId, title });
}

export async function moveConversation(conversationId: string, projectId: string): Promise<ConversationSummary> {
  return invoke<ConversationSummary>("move_conversation", { conversationId, projectId });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await invoke("delete_conversation", { conversationId });
}

function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseAiReferenceSnapshots(value: string): AppliedAiReferenceSnapshot[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AppliedAiReferenceSnapshot =>
      !!item && typeof item === "object" && typeof item.contextId === "string" && item.provenance === "imported_conversation"
    );
  } catch {
    return [];
  }
}

function normalizeRawMessage(raw: RawConversationMessage): ConversationMessage {
  return {
    ...raw,
    applied_context_ids: parseIds(raw.applied_context_ids),
    applied_ai_reference_sources: parseAiReferenceSnapshots(raw.applied_ai_reference_sources),
    target_slot_ids: parseIds(raw.target_slot_ids),
  };
}
