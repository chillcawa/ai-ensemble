import type { ContextItem } from "./types";
import { readStorage, writeStorage } from "../storage/localSettings";

const KEY = "ai-ensemble-persistent-context-v1";

export function loadPersistentContext(): ContextItem[] {
  return readStorage<ContextItem[]>(KEY, []).filter((item) => item.lifetime === "persistent");
}

export function savePersistentContext(items: ContextItem[]): void {
  writeStorage(KEY, items.filter((item) => item.lifetime === "persistent"));
}
