import { describe, expect, it } from "vitest";
import { INITIAL_SLOTS } from "./slots";
import { moveSlot, normalizeSlotOrder, reorderSlot, slotIdAtPoint } from "./slotOrder";

describe("provider slot ordering", () => {
  it("restores known ids and appends missing or newly added slots", () => {
    const restored = normalizeSlotOrder(INITIAL_SLOTS, [
      "slot-kimi",
      "unknown-slot",
      "slot-openai",
      "slot-kimi",
    ]);
    expect(restored.slice(0, 2).map((slot) => slot.id)).toEqual(["slot-kimi", "slot-openai"]);
    expect(new Set(restored.map((slot) => slot.id)).size).toBe(INITIAL_SLOTS.length);
    expect(restored).toHaveLength(INITIAL_SLOTS.length);
  });

  it("moves a slot one position without changing slot identity", () => {
    const moved = moveSlot(INITIAL_SLOTS, "slot-anthropic", 1);
    expect(moved.slice(0, 3).map((slot) => slot.id)).toEqual([
      "slot-openai",
      "slot-deepseek",
      "slot-anthropic",
    ]);
    expect(INITIAL_SLOTS[1].id).toBe("slot-anthropic");
  });

  it("places a dragged slot at the target position", () => {
    const moved = reorderSlot(INITIAL_SLOTS, "slot-openai", "slot-kimi");
    expect(moved.slice(0, 4).map((slot) => slot.id)).toEqual([
      "slot-anthropic",
      "slot-deepseek",
      "slot-kimi",
      "slot-openai",
    ]);
  });

  it("selects a destination from card coordinates and ignores the source card", () => {
    const bounds = [
      { slotId: "slot-openai", left: 0, right: 100, top: 20, bottom: 120 },
      { slotId: "slot-anthropic", left: 116, right: 216, top: 20, bottom: 120 },
    ];
    expect(slotIdAtPoint(bounds, "slot-openai", 150, 60)).toBe("slot-anthropic");
    expect(slotIdAtPoint(bounds, "slot-openai", 50, 60)).toBeNull();
    expect(slotIdAtPoint(bounds, "slot-openai", 110, 60)).toBeNull();
  });
});
