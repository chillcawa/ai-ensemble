import { invoke } from "@tauri-apps/api/core";

export interface ComparisonMarker {
  id: string;
  conversation_id: string;
  message_id: string;
  paragraph_index: number;
  excerpt: string;
  created_at: string;
}

export async function listComparisonMarkers(conversationId: string): Promise<ComparisonMarker[]> {
  return invoke<ComparisonMarker[]>("list_comparison_markers", { conversationId });
}

export async function addComparisonMarker(input: {
  id: string;
  conversationId: string;
  messageId: string;
  paragraphIndex: number;
  excerpt: string;
}): Promise<ComparisonMarker> {
  return invoke<ComparisonMarker>("add_comparison_marker", input);
}

export async function deleteComparisonMarker(messageId: string, paragraphIndex: number): Promise<void> {
  await invoke("delete_comparison_marker", { messageId, paragraphIndex });
}
