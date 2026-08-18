import type { AIModel } from "../types/ai";
import type { ContextItem, NormalizedContextRequest } from "./types";

export interface ContextBudgetEstimate {
  estimatedTokens: number;
  maxContextTokens?: number;
  ratio?: number;
  exceedsKnownLimit: boolean;
}

export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(Array.from(text).length / 2));
}

export function estimateContextTokens(items: ContextItem[]): number {
  const chars = items.reduce((sum, item) => sum + Array.from(item.content).length, 0);
  return chars === 0 ? 0 : Math.max(1, Math.ceil(chars / 2));
}

// Provider tokenizers differ. This intentionally uses a conservative character
// estimate only. No content is automatically removed or summarized.
export function estimateContextBudget(
  request: NormalizedContextRequest,
  model?: AIModel
): ContextBudgetEstimate {
  const chars = [
    ...request.instructions.map((item) => item.content),
    ...request.references.map((item) => item.content),
    ...request.history.map((turn) => turn.content),
    request.userMessage,
  ].join("\n").length;
  const estimatedTokens = Math.max(1, Math.ceil(chars / 2));
  const maxContextTokens = model?.capabilities.maxContextTokens;
  return {
    estimatedTokens,
    maxContextTokens,
    ratio: maxContextTokens ? estimatedTokens / maxContextTokens : undefined,
    exceedsKnownLimit: maxContextTokens ? estimatedTokens > maxContextTokens : false,
  };
}
