import type { ObservationClass } from "../conversation/types";

/**
 * Maps a provider id (the value the backend/API actually returns) to the
 * canonical display name for that AI.
 *
 * Deliberately ignores anything the AI says about itself in generated text —
 * self-reported identity from a model is not a reliable source (see
 * ConversationHistory's response-identity-warning). `provider` is the only
 * trusted input here; `fallback` (e.g. a user-assigned nickname) is only used
 * when no known provider mapping exists.
 */
export function canonicalAiName(provider?: string | null, fallback?: string | null): string {
  const names: Record<string, string> = {
    openai: "ChatGPT",
    anthropic: "Claude",
    xai: "Grok",
    deepseek: "DeepSeek",
    kimi: "Kimi",
    google: "Gemini",
    qwen: "Qwen",
    mistral: "Mistral",
    cohere: "Cohere",
  };
  return (provider && names[provider]) || fallback || provider || "AI";
}

export function observationLabel(value: ObservationClass): string {
  if (value === "self_referenced") return "Self-Referenced";
  if (value === "cross_ai") return "Cross-AI";
  if (value === "ai_referenced_unknown") return "AI-Referenced / Unknown";
  return "Independent";
}
