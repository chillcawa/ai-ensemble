import type { ChatMessage } from "../types/ai";
import type { NormalizedContextRequest } from "./types";
import { renderReferenceBlock } from "./assembler";

export function normalizedRequestToMessages(request: NormalizedContextRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (request.instructions.length > 0) {
    messages.push({
      role: "system",
      content: request.instructions
        .map((item) => `## ${item.title}\n${item.content.trim()}`)
        .join("\n\n"),
    });
  }

  for (const turn of request.history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  const references = request.references.map(renderReferenceBlock).join("\n\n");
  const userContent = references
    ? `${references}\n\n--- Current User Message ---\n${request.userMessage}`
    : request.userMessage;
  messages.push({ role: "user", content: userContent });

  return messages;
}


/**
 * Build a human-approved one-hop handoff request.
 * The source AI response is embedded directly in the final user message instead
 * of relying only on normal Context reference selection, so the transport path is
 * explicit and auditable.
 */
export function normalizedHandoffRequestToMessages(
  request: NormalizedContextRequest,
  sourceReference: import("./types").ContextItem,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (request.instructions.length > 0) {
    messages.push({
      role: "system",
      content: request.instructions
        .map((item) => `## ${item.title}\n${item.content.trim()}`)
        .join("\n\n"),
    });
  }

  for (const turn of request.history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  const otherReferences = request.references
    .filter((item) => item.id !== sourceReference.id)
    .map(renderReferenceBlock)
    .join("\n\n");
  const sourceBlock = renderReferenceBlock(sourceReference);

  messages.push({
    role: "user",
    content: [
      otherReferences || undefined,
      "--- Required Handoff Reference (full source AI response) ---",
      sourceBlock,
      "--- End Required Handoff Reference ---",
      "The source response above is supplied in full by AI Ensemble. Treat it as the reference for this one-hop request.",
      "--- Handoff Instruction ---",
      request.userMessage,
    ].filter((part): part is string => Boolean(part)).join("\n\n"),
  });

  return messages;
}
