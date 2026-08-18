import type { AssembleContextInput, ContextItem, NormalizedContextRequest } from "./types";

function appliesToTarget(item: ContextItem, slotId: string, projectId?: string, conversationId?: string): boolean {
  if (!item.enabled) return false;
  if (item.scope === "slot" && item.slotId !== slotId) return false;
  if (item.scope === "project" && (!projectId || item.projectId !== projectId)) return false;
  if (item.scope === "session" && item.conversationId !== conversationId) return false;
  return true;
}

function instructionRank(item: ContextItem): number {
  switch (item.scope) {
    case "global": return 0;
    case "project": return 1;
    case "slot": return 2;
    case "session": return 3;
    default: return 9;
  }
}

/**
 * Context design invariants:
 * 1. Instruction !== Reference
 * 2. Import !== Context
 * 3. Add to Context !== Persist
 * 4. Persist Context !== Send immediately
 * 5. AI Response !== System Prompt
 * 6. AI -> AI is a human-approved single hop
 * 7. Never auto-delete or auto-summarize on context overflow
 */
export function assembleContext(input: AssembleContextInput): NormalizedContextRequest {
  const applicable = input.contextItems.filter((item) =>
    appliesToTarget(item, input.slotId, input.projectId, input.conversationId)
  );

  const instructions = applicable
    .filter((item) => item.role === "instruction")
    .sort((a, b) => instructionRank(a) - instructionRank(b));

  // AI responses and imported/external material remain references; they are never
  // silently promoted into system/instruction content.
  const references = applicable.filter((item) => item.role === "reference");

  return {
    slotId: input.slotId,
    instructions,
    references,
    history: input.history ?? [],
    userMessage: input.userMessage,
  };
}

export function renderReferenceBlock(item: ContextItem): string {
  const source = [item.source?.nickname, item.source?.provider, item.source?.model]
    .filter(Boolean)
    .join(" / ");
  const externalSource = [item.source?.fileName, item.source?.url].filter(Boolean).join(" / ");
  return [
    "--- Reference Context ---",
    `Title: ${item.title}`,
    `Provenance: ${item.provenance}`,
    source ? `Source AI: ${source}` : undefined,
    item.source?.slotId ? `Source Slot: ${item.source.slotId}` : undefined,
    externalSource ? `Source: ${externalSource}` : undefined,
    item.generation?.originalQuestion ? `Original Question: ${item.generation.originalQuestion}` : undefined,
    "",
    item.content,
    "--- End Reference ---",
  ].filter((line): line is string => line !== undefined).join("\n");
}
