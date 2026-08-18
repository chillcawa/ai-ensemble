import type { AIModel, ProviderId } from "./ai";

export interface ProviderSlot {
  id: string;
  key: ProviderId;
  label: string;
  enabled: boolean;
  model: AIModel;
  keySaved: boolean;
  keyDraft: string;
}

export interface UsageTotals {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface ProviderUsage {
  provider: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface UsageRecord {
  id: number;
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_hit_input_tokens?: number;
  cache_miss_input_tokens?: number;
  cost_usd?: number;
  pricing_basis?: string;
  elapsed_ms?: number;
  created_at: string;
}

export interface UsageSummary {
  today: UsageTotals;
  all_time: UsageTotals;
  by_provider: ProviderUsage[];
  recent: UsageRecord[];
}

export interface CostEstimate {
  provider: string;
  model: string;
  input_tokens: number;
  max_output_tokens: number;
  max_cost_usd?: number;
}

export type ThemeMode = "system" | "light" | "dark";
export type ExchangeMode = "fixed" | "manual";

export type DisplayCurrency = "USD" | "JPY" | "EUR" | "GBP" | "CNY" | "KRW";
