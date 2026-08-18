import type { AIModel, PerformanceClass } from "../types/ai";
import type { ProviderSlot } from "../types/app";

export type RecommendationIntent = "code" | "complex" | "writing" | "simple" | "general";

export interface ModelRecommendation {
  slot: ProviderSlot;
  model: AIModel;
  reason: string;
  intent: RecommendationIntent;
  fallback: boolean;
}

function classifyQuestion(question: string): RecommendationIntent {
  const q = question.toLowerCase();
  const code = /(unity|c#|c\+\+|python|typescript|javascript|rust|code|コード|実装|デバッグ|バグ|設計)/i.test(q);
  const complex = /(比較|分析|推論|設計|アーキテクチャ|研究|論文|仮説|複雑|理由|なぜ|検証|比較検討)/i.test(q);
  const writing = /(文章|作文|校正|翻訳|要約|メール|コピー|ブログ|rewrite|translate|summarize)/i.test(q);
  if (code) return "code";
  if (complex) return "complex";
  if (writing) return "writing";
  if (q.trim().length < 80) return "simple";
  return "general";
}

function tierScore(value: PerformanceClass, intent: RecommendationIntent): number {
  if (intent === "simple") {
    if (value === "fast") return 10;
    if (value === "balanced") return 6;
    if (value === "frontier") return 3;
    return 4;
  }
  if (intent === "code" || intent === "complex") {
    if (value === "frontier") return 10;
    if (value === "balanced") return 7;
    if (value === "fast") return 3;
    return 4;
  }
  if (intent === "writing") {
    if (value === "balanced") return 9;
    if (value === "frontier") return 8;
    if (value === "fast") return 5;
    return 4;
  }
  if (value === "balanced") return 8;
  if (value === "frontier") return 7;
  if (value === "fast") return 6;
  return 4;
}

/** Recommendation scores only structured capability metadata. It does not parse model IDs. */
function scoreModel(model: AIModel, intent: RecommendationIntent): number {
  const c = model.capabilities;
  if (!c.availableNow) return -10_000;

  let score = tierScore(c.performanceClass, intent);
  if (c.streaming) score += 1;
  if ((intent === "code" || intent === "complex") && c.tools) score += 2;
  if (intent === "complex" && c.maxContextTokens) {
    if (c.maxContextTokens >= 500_000) score += 2;
    else if (c.maxContextTokens >= 100_000) score += 1;
  }
  return score;
}

function buildReason(model: AIModel, intent: RecommendationIntent, fallback: boolean): string {
  const c = model.capabilities;
  const tier = c.performanceClass;
  const sourceNote = c.source === "inferred" ? "（能力情報はモデルID等からの推定を含みます）" : "";

  if (intent === "simple") {
    if (tier === "fast") return `短い質問なので、このProviderの軽量/高速モデルを優先しました。${sourceNote}`;
    if (fallback) return `軽量/高速と分類された利用可能モデルがないため、現在使える候補から性能・速度のバランスを優先しました。${sourceNote}`;
    return `短い質問なので、現在利用可能な候補の中で過剰な性能を避ける方向で選びました。${sourceNote}`;
  }
  if (intent === "code") {
    return c.tools
      ? `コード・実装・デバッグを含むため、高性能区分とTools対応を重視しました。${sourceNote}`
      : `コード・実装・デバッグを含むため、利用可能モデルの性能区分を重視しました。${sourceNote}`;
  }
  if (intent === "complex") {
    const ctx = c.maxContextTokens && c.maxContextTokens >= 500_000 ? "長いContextにも余裕があります。" : "";
    return `複数段階の分析・推論が必要なため、高性能区分・Tools・Context容量を評価しました。${ctx}${sourceNote}`;
  }
  if (intent === "writing") {
    return `文章処理が中心なので、バランス型または高性能型を優先しました。${sourceNote}`;
  }
  return `一般用途として、性能区分・Streaming・利用可能性のバランスから選びました。${sourceNote}`;
}

export function recommendModelsForSlots(
  question: string,
  slots: ProviderSlot[],
  modelCatalogs: Record<string, AIModel[]>,
): ModelRecommendation[] {
  if (!question.trim()) return [];
  const intent = classifyQuestion(question);

  return slots
    .filter((slot) => slot.keySaved)
    .map((slot) => {
      const catalog = (modelCatalogs[slot.key] ?? [slot.model]).filter((m) => m.provider === slot.key);
      const candidates = catalog.filter((m) => m.capabilities.availableNow);
      const usable = candidates.length > 0 ? candidates : [slot.model].filter((m) => m.capabilities.availableNow);
      if (!usable.length) return null;
      const scored = usable
        .map((model) => ({ model, score: scoreModel(model, intent) }))
        .sort((a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name));
      const selected = scored[0].model;
      const fallback = intent === "simple" && !usable.some((m) => m.capabilities.performanceClass === "fast");
      return { slot, model: selected, reason: buildReason(selected, intent, fallback), intent, fallback };
    })
    .filter((value): value is ModelRecommendation => value !== null);
}
