import type { ContextItem } from "./types";
import { readStorage, writeStorage } from "../storage/localSettings";

export interface ContextSet {
  id: string;
  name: string;
  projectId?: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

const SETS_KEY = "ai-ensemble-context-sets-v1";
const SELECTIONS_KEY = "ai-ensemble-context-set-selections-v1";

export function loadContextSets(): ContextSet[] {
  return readStorage<ContextSet[]>(SETS_KEY, []);
}

export function saveContextSets(sets: ContextSet[]): void {
  writeStorage(SETS_KEY, sets);
}

export function loadContextSetSelections(): Record<string, string | null> {
  return readStorage<Record<string, string | null>>(SELECTIONS_KEY, {});
}

export function saveContextSetSelections(value: Record<string, string | null>): void {
  writeStorage(SELECTIONS_KEY, value);
}

/**
 * Context Set rules:
 * - Global instructions are always outside sets.
 * - Session context is conversation-scoped and remains outside sets.
 * - A selected set gates non-global persistent/project/slot context.
 * - No set selected means no non-global persistent Project/slot context is active.
 *   This is intentionally a blank context state. It must never fall back to
 *   "all enabled persistent items", because that can silently resurrect old settings.
 */
export function contextItemsForConversation(
  items: ContextItem[],
  selectedSet: ContextSet | null,
  conversationKey: string,
): ContextItem[] {
  const selectedIds = new Set(selectedSet?.itemIds ?? []);
  return items.map((item) => {
    if (!item.enabled) return item;
    // "Setなし" is the strict Context-off state. This includes Global and
    // Session items so the UI label and the actual request assembly agree.
    if (!selectedSet) return { ...item, enabled: false };
    if (item.scope === "global") return item;
    if (item.scope === "session") {
      return { ...item, enabled: item.conversationId === conversationKey };
    }
    return { ...item, enabled: selectedIds.has(item.id) };
  });
}

export function setTokenItems(items: ContextItem[], set: ContextSet): ContextItem[] {
  const ids = new Set(set.itemIds);
  return items.filter((item) => item.enabled && item.scope !== "global" && item.scope !== "session" && ids.has(item.id));
}


export interface ContextSetIsolationResult {
  items: ContextItem[];
  sets: ContextSet[];
  changed: boolean;
}

/**
 * Set-scoped instructions must never be shared by multiple Context Sets.
 * References may intentionally be shared, but editing a Project/slot instruction
 * in Set B must not mutate Set A. This also repairs Context Sets created by
 * v0.7.6-v0.8.1 where the same instruction id could be included in multiple sets.
 */
export function isolateSharedSetInstructions(
  items: ContextItem[],
  sets: ContextSet[],
): ContextSetIsolationResult {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const owners = new Map<string, string[]>();

  for (const set of sets) {
    for (const itemId of set.itemIds) {
      const item = itemMap.get(itemId);
      if (!item || item.role !== "instruction" || item.scope === "global" || item.scope === "session") continue;
      const list = owners.get(itemId) ?? [];
      list.push(set.id);
      owners.set(itemId, list);
    }
  }

  let changed = false;
  const nextItems = [...items];
  const replacements = new Map<string, Map<string, string>>();

  for (const [itemId, setIds] of owners) {
    if (setIds.length <= 1) continue;
    const source = itemMap.get(itemId);
    if (!source) continue;

    // The first owner keeps the original item. Every additional Set gets a clone.
    for (const setId of setIds.slice(1)) {
      const cloneId = `${itemId}--set-${setId}`;
      let clone = itemMap.get(cloneId);
      if (!clone) {
        const now = new Date().toISOString();
        clone = { ...source, id: cloneId, createdAt: now, updatedAt: now };
        nextItems.push(clone);
        itemMap.set(cloneId, clone);
      }
      const perSet = replacements.get(setId) ?? new Map<string, string>();
      perSet.set(itemId, cloneId);
      replacements.set(setId, perSet);
      changed = true;
    }
  }

  if (!changed) return { items, sets, changed: false };

  const nextSets = sets.map((set) => {
    const perSet = replacements.get(set.id);
    if (!perSet) return set;
    return {
      ...set,
      itemIds: set.itemIds.map((id) => perSet.get(id) ?? id),
      updatedAt: new Date().toISOString(),
    };
  });

  return { items: nextItems, sets: nextSets, changed: true };
}
