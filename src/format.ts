import { providerDefinition } from "./providers/registry";
import type { ProviderId } from "./types/ai";
import type { DisplayCurrency } from "./types/app";

export function formatTokens(value: number): string {
  const locale = typeof document === "undefined" ? "en-US" : document.documentElement.lang || "en-US";
  return value.toLocaleString(locale);
}

export function formatYen(value: number): string {
  return value < 1 ? value.toFixed(2) : value.toFixed(1);
}

export function formatCostJpy(costUsd: number, rate: number): string {
  return `¥${formatYen(costUsd * rate)}`;
}

export function providerLabel(provider: string): string {
  try {
    return providerDefinition(provider as ProviderId).defaultNickname;
  } catch {
    return provider;
  }
}

const CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = {
  USD: "$",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  CNY: "CN¥",
  KRW: "₩",
};

export function formatCostCurrency(costUsd: number, currency: DisplayCurrency, rate: number): string {
  const effectiveRate = currency === "USD" ? 1 : rate;
  if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) return `${currency} —`;
  const value = costUsd * effectiveRate;
  const abs = Math.abs(value);
  const digits = abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return `${CURRENCY_SYMBOLS[currency]}${value.toFixed(digits)}`;
}
