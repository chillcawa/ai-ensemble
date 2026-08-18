import type { AIModel, ApiMode, ModelCapabilities, PerformanceClass, ProviderId } from "../types/ai";

export interface CapabilityBadge {
  label: string;
  tone: "positive" | "neutral" | "muted" | "warning";
  title?: string;
}

export function capabilityBadges(model: AIModel): CapabilityBadge[] {
  const c = model.capabilities;
  const badges: CapabilityBadge[] = [];
  if (c.apiModes.length) {
    badges.push({ label: c.apiModes.map(apiModeLabel).join(" / "), tone: c.availableNow ? "neutral" : "warning" });
  }
  if (c.streaming) badges.push({ label: "Streaming", tone: "positive" });
  if (c.vision) badges.push({ label: "Vision", tone: "positive" });
  if (c.tools) badges.push({ label: "Tools", tone: "positive" });
  if (c.maxContextTokens) badges.push({ label: formatContext(c.maxContextTokens), tone: "muted", title: "Context window" });
  badges.push({ label: performanceClassLabel(c.performanceClass), tone: "muted" });
  return badges;
}

export function apiModeLabel(mode: ApiMode): string {
  if (mode === "chat_completions") return "Chat";
  if (mode === "responses") return "Responses";
  return "Messages";
}

export function performanceClassLabel(value: PerformanceClass): string {
  if (value === "frontier") return "高性能";
  if (value === "balanced") return "バランス";
  if (value === "fast") return "軽量/高速";
  return "性能区分不明";
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k ctx`;
  return `${tokens} ctx`;
}

/**
 * Fallback metadata for bundled models. Discovery metadata from Rust should replace
 * this when an API key is available. The values are intentionally conservative.
 */
export function fallbackCapabilities(provider: ProviderId, overrides: Partial<ModelCapabilities> = {}): ModelCapabilities {
  const base: ModelCapabilities = provider === "anthropic"
    ? {
        streaming: true, vision: false, tools: false, audioInput: false, audioOutput: false,
        apiModes: ["messages"], preferredApiMode: "messages", availableNow: true,
        source: "unknown", performanceClass: "unknown",
      }
    : {
        streaming: true, vision: false, tools: false, audioInput: false, audioOutput: false,
        apiModes: ["chat_completions"], preferredApiMode: "chat_completions", availableNow: true,
        source: "unknown", performanceClass: "unknown",
      };
  return { ...base, ...overrides };
}
