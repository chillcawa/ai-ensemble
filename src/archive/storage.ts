import { invoke } from "@tauri-apps/api/core";
import type { ArchiveConversation, ArchiveMessage, ImportedArchiveConversation } from "./types";

export async function saveArchiveConversation(projectId: string, conversation: ImportedArchiveConversation): Promise<ArchiveConversation> {
  return invoke<ArchiveConversation>("save_archive_conversation", {
    projectId,
    source: conversation.source,
    title: conversation.title,
    fileName: conversation.fileName,
    sourceProvider: conversation.sourceProvider,
    sourceModel: conversation.sourceModel,
    messages: conversation.messages,
  });
}

export async function listArchiveConversations(projectId: string): Promise<ArchiveConversation[]> {
  return invoke<ArchiveConversation[]>("list_archive_conversations", { projectId });
}

export async function loadArchiveMessages(archiveId: string): Promise<ArchiveMessage[]> {
  return invoke<ArchiveMessage[]>("get_archive_messages", { archiveId });
}

export async function updateArchiveSourceMapping(archiveId: string, mapping: {
  provider?: string;
  model?: string;
  mappedSlotId?: string;
  nickname?: string;
}): Promise<ArchiveConversation> {
  return invoke<ArchiveConversation>("update_archive_source_mapping", {
    archiveId,
    provider: mapping.provider,
    model: mapping.model,
    mappedSlotId: mapping.mappedSlotId,
    nickname: mapping.nickname,
  });
}

export async function deleteArchiveConversation(archiveId: string): Promise<void> {
  await invoke("delete_archive_conversation", { archiveId });
}
