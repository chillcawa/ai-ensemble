import type { ApiMode, ProviderId } from "../types/ai";

export type ProviderRuntimeStatus = "live" | "planned";
export type ProviderFeatureStatus = "live" | "planned" | "not_applicable";
export type ProviderBillingMode = "free_tier_available" | "prepaid_or_payg" | "payg" | "unknown";

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  defaultNickname: string;
  runtimeStatus: ProviderRuntimeStatus;
  chatAdapter: ProviderFeatureStatus;
  streamingAdapter: ProviderFeatureStatus;
  modelDiscovery: ProviderFeatureStatus;
  credentialStore: ProviderFeatureStatus;
  apiModes: ApiMode[];
  billingMode?: ProviderBillingMode;
  billingNote?: string;
  officialUsageUrl?: string;
  officialBillingUrl?: string;
  notes?: string;
}

/**
 * Provider Registry is intentionally metadata-first.
 *
 * A provider appearing here does NOT mean its network adapter is enabled.
 * runtimeStatus/chatAdapter/modelDiscovery are explicit so the UI never
 * mistakes "known provider" for "usable provider".
 */
export const PROVIDER_REGISTRY: readonly ProviderDefinition[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    defaultNickname: "ChatGPT",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions", "responses"],
    billingMode: "payg",
    officialUsageUrl: "https://platform.openai.com/usage",
    officialBillingUrl: "https://platform.openai.com/settings/organization/billing/overview",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    defaultNickname: "Claude",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["messages"],
    billingMode: "payg",
    officialUsageUrl: "https://console.anthropic.com/",
    officialBillingUrl: "https://console.anthropic.com/",
  },
  {
    id: "xai",
    displayName: "xAI",
    defaultNickname: "Grok",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "prepaid_or_payg",
    billingNote: "xAI APIは原則有料。プリペイド残高または請求契約のあるキーが必要です。",
    officialUsageUrl: "https://console.x.ai/team/default/usage",
    officialBillingUrl: "https://console.x.ai/team/default/settings/billing",
    notes: "Official xAI Chat Completions API. Specialized Imagine/Voice/Build models are excluded.",
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    defaultNickname: "DeepSeek",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "prepaid_or_payg",
    officialUsageUrl: "https://platform.deepseek.com/",
    officialBillingUrl: "https://platform.deepseek.com/",
    notes: "DeepSeek V4 via the OpenAI-compatible Chat Completions surface.",
  },
  {
    id: "kimi",
    displayName: "Moonshot AI / Kimi",
    defaultNickname: "Kimi",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "prepaid_or_payg",
    officialUsageUrl: "https://platform.kimi.ai/",
    officialBillingUrl: "https://platform.kimi.ai/",
    notes: "Kimi K3 via the official OpenAI-compatible Chat Completions API.",
  },
  {
    id: "google",
    displayName: "Google / Gemini",
    defaultNickname: "Gemini",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "free_tier_available",
    billingNote: "Free Tier対応モデルはbilling設定なしで利用可能。Paid移行はAI Studio側で明示操作。",
    officialUsageUrl: "https://aistudio.google.com/",
    officialBillingUrl: "https://aistudio.google.com/",
    notes: "Gemini stable Flash models via Google's official OpenAI compatibility layer.",
  },
  {
    id: "qwen",
    displayName: "Alibaba / Qwen",
    defaultNickname: "Qwen",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "free_tier_available",
    billingNote: "Singapore Internationalの対象モデルは新規利用者向け無料枠あり。Free Quota Onlyの利用を推奨。",
    officialUsageUrl: "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=costing-balance",
    officialBillingUrl: "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=costing-balance",
    notes: "Singapore International via Alibaba Cloud Model Studio's OpenAI-compatible Chat API.",
  },
  {
    id: "mistral",
    displayName: "Mistral AI",
    defaultNickname: "Mistral",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "free_tier_available",
    billingNote: "Free modeは低いレート制限でテスト可能。Scale移行はMistral Admin側で明示操作。",
    officialUsageUrl: "https://console.mistral.ai/",
    officialBillingUrl: "https://console.mistral.ai/",
    notes: "Official Mistral Chat Completions API. Free/Scale契約状態は応答から判定しません。",
  },
  {
    id: "cohere",
    displayName: "Cohere",
    defaultNickname: "Cohere",
    runtimeStatus: "live",
    chatAdapter: "live",
    streamingAdapter: "live",
    modelDiscovery: "live",
    credentialStore: "live",
    apiModes: ["chat_completions"],
    billingMode: "free_tier_available",
    billingNote: "無料Evaluation Keyは評価・試作用で、月間・分間の制限があります。業務本番利用は契約条件を確認してください。",
    officialUsageUrl: "https://dashboard.cohere.com/billing",
    officialBillingUrl: "https://dashboard.cohere.com/billing",
    notes: "Cohere Compatibility API with chat-capable, non-deprecated model discovery.",
  },
];

export function providerDefinition(id: ProviderId): ProviderDefinition {
  const definition = PROVIDER_REGISTRY.find((provider) => provider.id === id);
  if (!definition) {
    // ProviderId is a closed union, so this is defensive runtime protection.
    throw new Error(`Provider Registry entry missing: ${id}`);
  }
  return definition;
}

export function liveProviderDefinitions(): ProviderDefinition[] {
  return PROVIDER_REGISTRY.filter((provider) => provider.runtimeStatus === "live");
}

export function providerDisplayName(id: ProviderId): string {
  return providerDefinition(id).displayName;
}

export function providerDefaultNickname(id: ProviderId): string {
  return providerDefinition(id).defaultNickname;
}

export function providerIsLive(id: ProviderId): boolean {
  return providerDefinition(id).runtimeStatus === "live";
}
