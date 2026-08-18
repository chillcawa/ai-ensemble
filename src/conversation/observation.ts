import type { ContextItem } from "../context/types";
import type { AppliedAiReferenceSnapshot } from "./types";

/**
 * Capture AI-origin reference identity at request time.
 * This is deliberately copied into the conversation message so later archive
 * remapping, Context edits, or Context deletion cannot rewrite past conditions.
 */
export function snapshotAppliedAiReferences(items: ContextItem[]): AppliedAiReferenceSnapshot[] {
  const capturedAt = new Date().toISOString();
  return items
    .filter((item) => item.role === "reference" && item.provenance === "imported_conversation")
    .map((item) => ({
      contextId: item.id,
      provenance: "imported_conversation" as const,
      archiveId: item.source?.archiveId ?? item.source?.conversationId,
      archiveSource: item.source?.archiveSource,
      provider: item.source?.provider,
      model: item.source?.model,
      slotId: item.source?.slotId,
      nickname: item.source?.nickname,
      capturedAt,
    }));
}
