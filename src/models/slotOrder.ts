import type { ProviderSlot } from "../types/app";

export const SLOT_ORDER_STORAGE_KEY = "ai-ensemble-provider-slot-order";

export interface SlotBounds {
  slotId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function slotIdAtPoint(
  bounds: SlotBounds[],
  draggedSlotId: string,
  clientX: number,
  clientY: number,
): string | null {
  return bounds.find((candidate) => candidate.slotId !== draggedSlotId
    && clientX >= candidate.left
    && clientX <= candidate.right
    && clientY >= candidate.top
    && clientY <= candidate.bottom)?.slotId ?? null;
}

export function normalizeSlotOrder(slots: ProviderSlot[], savedOrder: unknown): ProviderSlot[] {
  if (!Array.isArray(savedOrder)) return slots;

  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const ordered: ProviderSlot[] = [];
  const seen = new Set<string>();

  for (const value of savedOrder) {
    if (typeof value !== "string" || seen.has(value)) continue;
    const slot = byId.get(value);
    if (!slot) continue;
    ordered.push(slot);
    seen.add(value);
  }

  for (const slot of slots) {
    if (!seen.has(slot.id)) ordered.push(slot);
  }

  return ordered;
}

export function moveSlot(slots: ProviderSlot[], slotId: string, direction: -1 | 1): ProviderSlot[] {
  const fromIndex = slots.findIndex((slot) => slot.id === slotId);
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= slots.length) return slots;
  return moveSlotToIndex(slots, fromIndex, toIndex);
}

export function reorderSlot(slots: ProviderSlot[], draggedSlotId: string, targetSlotId: string): ProviderSlot[] {
  const fromIndex = slots.findIndex((slot) => slot.id === draggedSlotId);
  const toIndex = slots.findIndex((slot) => slot.id === targetSlotId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return slots;
  return moveSlotToIndex(slots, fromIndex, toIndex);
}

function moveSlotToIndex(slots: ProviderSlot[], fromIndex: number, toIndex: number): ProviderSlot[] {
  const next = [...slots];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
