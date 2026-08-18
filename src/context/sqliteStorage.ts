import { invoke } from "@tauri-apps/api/core";
import type { ContextItem } from "./types";
import type { ContextSet } from "./sets";

export async function loadContextItemsSqlite(): Promise<ContextItem[]> {
  const raw = await invoke<string>("load_context_items_json");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveContextItemsSqlite(items: ContextItem[]): Promise<void> {
  await invoke("save_context_items_json", { itemsJson: JSON.stringify(items.filter((item) => item.lifetime === "persistent")) });
}

export async function loadContextSetsSqlite(): Promise<ContextSet[]> {
  const raw = await invoke<string>("load_context_sets_json");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveContextSetsSqlite(sets: ContextSet[]): Promise<void> {
  await invoke("save_context_sets_json", { setsJson: JSON.stringify(sets) });
}

export async function loadContextSetSelectionsSqlite(): Promise<Record<string, string | null>> {
  const raw = await invoke<string>("load_context_set_selections_json");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, string | null> : {};
  } catch {
    return {};
  }
}

export async function saveContextSetSelectionsSqlite(value: Record<string, string | null>): Promise<void> {
  await invoke("save_context_set_selections_json", { selectionsJson: JSON.stringify(value) });
}

export async function hasContextStateKey(key: string): Promise<boolean> {
  return invoke<boolean>("has_context_state_key", { key });
}

export async function loadContextMigrationCompleted(): Promise<boolean> {
  return invoke<boolean>("load_context_migration_completed");
}

export async function saveContextMigrationCompleted(): Promise<void> {
  await invoke("save_context_migration_completed");
}
