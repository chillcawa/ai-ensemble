import { writeStorage } from "../storage/localSettings";
import { SLOT_ORDER_STORAGE_KEY } from "../models/slotOrder";

type JsonObject = Record<string, unknown>;

export interface UserDataExportFile extends JsonObject {
  format: "ai-ensemble-user-data";
  format_version: 1;
  frontend_settings: JsonObject;
  database: Record<string, unknown[]>;
}

const REQUIRED_TABLES = [
  "conversations",
  "conversation_messages",
  "comparison_markers",
  "projects",
  "context_state",
  "text_documents",
  "import_archives",
  "import_archive_messages",
  "usage_records",
] as const;

const EXPECTED_SLOTS: ReadonlyMap<string, string> = new Map([
  ["slot-openai", "openai"],
  ["slot-anthropic", "anthropic"],
  ["slot-deepseek", "deepseek"],
  ["slot-kimi", "kimi"],
  ["slot-google", "google"],
  ["slot-qwen", "qwen"],
  ["slot-mistral", "mistral"],
  ["slot-cohere", "cohere"],
  ["slot-xai", "xai"],
] as const);

const SLOT_SETTING_SUFFIXES = ["nickname", "model", "enabled"] as const;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} が不正です。`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} が不正です。`);
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} が不正です。`);
  return value;
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const parsed = requireString(value, field);
  if (!allowed.includes(parsed as T)) throw new Error(`${field} が不正です。`);
  return parsed as T;
}

export function parseUserDataExport(text: string): UserDataExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み込めませんでした。");
  }
  if (!isObject(parsed) || parsed.format !== "ai-ensemble-user-data" || parsed.format_version !== 1) {
    throw new Error("対応するAI Ensemble書き出しファイルではありません。");
  }
  if (!isObject(parsed.database)) throw new Error("database がありません。");
  const database = parsed.database;
  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(database[table])) throw new Error(`database.${table} がありません。`);
  }
  if (!isObject(parsed.frontend_settings)) throw new Error("frontend_settings がありません。");
  const settings = parsed.frontend_settings;
  requireEnum(settings.theme, "theme", ["system", "light", "dark"]);
  requireEnum(settings.timeZoneMode, "timeZoneMode", ["system", "manual"]);
  requireString(settings.manualTimeZone, "manualTimeZone");
  requireEnum(settings.turnOrder, "turnOrder", ["oldest_first", "newest_first"]);
  requireEnum(settings.exchangeMode, "exchangeMode", ["fixed", "manual"]);
  if (requireNumber(settings.manualRate, "manualRate") <= 0) throw new Error("manualRate が不正です。");
  if (settings.displayCurrency !== undefined) requireEnum(settings.displayCurrency, "displayCurrency", ["USD", "JPY", "EUR", "GBP", "CNY", "KRW"]);
  if (settings.currencyRates !== undefined) {
    if (!isObject(settings.currencyRates)) throw new Error("currencyRates が不正です。");
    for (const currency of ["USD", "JPY", "EUR", "GBP", "CNY", "KRW"] as const) {
      const rate = settings.currencyRates[currency];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) throw new Error(`currencyRates.${currency} が不正です。`);
    }
  }
  requireBoolean(settings.recommendationsEnabled, "recommendationsEnabled");
  requireBoolean(settings.sidebarOpen, "sidebarOpen");
  requireString(settings.currentProjectId, "currentProjectId");
  requireBoolean(settings.trialNoticeAccepted, "trialNoticeAccepted");
  if (settings.language !== undefined) requireEnum(settings.language, "language", ["system", "ja", "en", "zh-CN", "ko"]);
  if (!Array.isArray(settings.columnWidths)
    || settings.columnWidths.length !== EXPECTED_SLOTS.size
    || settings.columnWidths.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 280 || value > 2400)) {
    throw new Error("columnWidths が不正です。");
  }
  if (!Array.isArray(settings.providerSlots) || settings.providerSlots.length !== EXPECTED_SLOTS.size) {
    throw new Error("providerSlots が不正です。");
  }
  const seenSlotIds = new Set<string>();
  for (const [index, slot] of settings.providerSlots.entries()) {
    if (!isObject(slot)) throw new Error(`providerSlots[${index}] が不正です。`);
    const slotId = requireString(slot.slotId, `providerSlots[${index}].slotId`);
    const provider = requireString(slot.provider, `providerSlots[${index}].provider`);
    if (EXPECTED_SLOTS.get(slotId) !== provider || seenSlotIds.has(slotId)) {
      throw new Error(`providerSlots[${index}] のSlot IDまたはProviderが不正です。`);
    }
    seenSlotIds.add(slotId);
    requireString(slot.nickname, `providerSlots[${index}].nickname`);
    requireString(slot.modelId, `providerSlots[${index}].modelId`);
    requireBoolean(slot.enabled, `providerSlots[${index}].enabled`);
  }
  if (seenSlotIds.size !== EXPECTED_SLOTS.size
    || !isObject(settings.textPad)
    || !(settings.textPad.activeDocumentId === null || typeof settings.textPad.activeDocumentId === "string")
    || !Array.isArray(settings.textPad.pastedSnippets)
    || settings.textPad.pastedSnippets.some((snippet) => !isObject(snippet))) {
    throw new Error("textPad設定が不正です。");
  }
  for (const [index, snippet] of settings.textPad.pastedSnippets.entries()) {
    const snippetObject = snippet as JsonObject;
    requireString(snippetObject.id, `textPad.pastedSnippets[${index}].id`);
    requireString(snippetObject.text, `textPad.pastedSnippets[${index}].text`);
    requireString(snippetObject.createdAt, `textPad.pastedSnippets[${index}].createdAt`);
    if (snippetObject.pinned !== undefined) requireBoolean(snippetObject.pinned, `textPad.pastedSnippets[${index}].pinned`);
  }
  const importedProjectIds = new Set(
    (database.projects as unknown[])
      .filter(isObject)
      .map((project) => project.id)
      .filter((id): id is string => typeof id === "string"),
  );
  if (!importedProjectIds.has(settings.currentProjectId as string)) {
    throw new Error("currentProjectIdに対応するProjectがありません。");
  }
  return parsed as UserDataExportFile;
}

export function applyImportedFrontendSettings(settings: JsonObject): void {
  for (const slotId of EXPECTED_SLOTS.keys()) {
    for (const suffix of SLOT_SETTING_SUFFIXES) {
      localStorage.removeItem(`ai-ensemble-slot-${slotId}-${suffix}`);
    }
  }

  writeStorage("ai-ensemble-theme", settings.theme);
  writeStorage("ai-ensemble-timezone-mode", settings.timeZoneMode);
  writeStorage("ai-ensemble-timezone-manual", settings.manualTimeZone);
  writeStorage("ai-ensemble-turn-order", settings.turnOrder);
  writeStorage("ai-ensemble-exchange-mode", settings.exchangeMode);
  writeStorage("ai-ensemble-manual-rate", settings.manualRate);
  if (settings.displayCurrency !== undefined) writeStorage("ai-ensemble-display-currency", settings.displayCurrency);
  if (settings.currencyRates !== undefined) writeStorage("ai-ensemble-currency-rates", settings.currencyRates);
  writeStorage("ai-ensemble-column-widths", settings.columnWidths);
  writeStorage("ai-ensemble-model-recommendations-enabled", settings.recommendationsEnabled);
  writeStorage("ai-ensemble-conversation-sidebar-open", settings.sidebarOpen);
  writeStorage("ai-ensemble-current-project-id", settings.currentProjectId);
  writeStorage("ai-ensemble-use-notice-v1", settings.trialNoticeAccepted);
  if (settings.language !== undefined) writeStorage("ai-ensemble-language", settings.language);

  const textPad = settings.textPad as JsonObject;
  writeStorage("ai-ensemble-textpad-active-id", textPad.activeDocumentId);
  writeStorage("ai-ensemble-pasted-snippets", textPad.pastedSnippets);

  for (const slot of settings.providerSlots as JsonObject[]) {
    const slotId = slot.slotId as string;
    writeStorage(`ai-ensemble-slot-${slotId}-nickname`, slot.nickname);
    writeStorage(`ai-ensemble-slot-${slotId}-model`, slot.modelId);
    writeStorage(`ai-ensemble-slot-${slotId}-enabled`, slot.enabled);
  }
  writeStorage(SLOT_ORDER_STORAGE_KEY, (settings.providerSlots as JsonObject[]).map((slot) => slot.slotId));
}
