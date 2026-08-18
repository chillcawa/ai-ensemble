import { PROVIDER_REGISTRY, liveProviderDefinitions, providerDefinition } from "./registry";
import type { ProviderId } from "../types/ai";
import { describe, expect, it } from "vitest";

export function validateProviderRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const provider of PROVIDER_REGISTRY) {
    if (ids.has(provider.id)) errors.push(`duplicate provider id: ${provider.id}`);
    ids.add(provider.id);
    if (!provider.displayName.trim()) errors.push(`missing displayName: ${provider.id}`);
    if (!provider.defaultNickname.trim()) errors.push(`missing defaultNickname: ${provider.id}`);
    if (provider.runtimeStatus === "live" && provider.chatAdapter !== "live") {
      errors.push(`live runtime without live chat adapter: ${provider.id}`);
    }
  }

  const expectedLive: ProviderId[] = [
    "openai", "anthropic", "xai", "deepseek", "kimi", "google", "qwen", "mistral", "cohere",
  ];
  const actualLive = liveProviderDefinitions().map((provider) => provider.id);
  for (const id of expectedLive) {
    if (!actualLive.includes(id)) errors.push(`expected live provider missing: ${id}`);
    providerDefinition(id);
  }

  for (const id of actualLive) {
    if (!expectedLive.includes(id)) errors.push(`unexpected live provider: ${id}`);
  }

  return errors;
}

describe("provider registry", () => {
  it("is internally consistent", () => {
    expect(validateProviderRegistry()).toEqual([]);
  });
});
