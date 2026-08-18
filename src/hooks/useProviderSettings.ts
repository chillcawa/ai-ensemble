import { useCallback, useEffect, useState } from "react";
import { INITIAL_SLOTS, catalogForSlot } from "../models/slots";
import {
  ANTHROPIC_MODELS,
  COHERE_MODELS,
  DEEPSEEK_MODELS,
  deleteApiKey,
  GEMINI_MODELS,
  hasApiKey,
  KIMI_MODELS,
  MISTRAL_MODELS,
  listAvailableModels,
  OPENAI_MODELS,
  QWEN_MODELS,
  XAI_MODELS,
  saveApiKey,
} from "../providers/tauriProvider";
import { readStorage, writeStorage } from "../storage/localSettings";
import type { AIModel, ProviderId } from "../types/ai";
import type { ProviderSlot } from "../types/app";
import { moveSlot, normalizeSlotOrder, reorderSlot, SLOT_ORDER_STORAGE_KEY } from "../models/slotOrder";

function loadInitialSlots(): ProviderSlot[] {
  const restored = INITIAL_SLOTS.map((slot) => {
    const savedLabel = readStorage(
      `ai-ensemble-slot-${slot.id}-nickname`,
      readStorage(`ai-ensemble-nickname-${slot.key}`, slot.label)
    );
    const savedModelId = readStorage(
      `ai-ensemble-slot-${slot.id}-model`,
      readStorage(`ai-ensemble-model-${slot.key}`, slot.model.id)
    );
    const savedEnabled = readStorage(`ai-ensemble-slot-${slot.id}-enabled`, slot.enabled);
    const curated = catalogForSlot(slot);
    const savedModel = curated.find((model) => model.id === savedModelId);
    // Planned-provider builds can leave stale model IDs in localStorage.
    const restoredModel = savedModel ?? slot.model;
    return { ...slot, label: savedLabel, model: restoredModel, enabled: savedEnabled };
  });
  return normalizeSlotOrder(restored, readStorage<unknown>(SLOT_ORDER_STORAGE_KEY, []));
}

const INITIAL_MODEL_CATALOGS: Record<string, AIModel[]> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  deepseek: DEEPSEEK_MODELS,
  kimi: KIMI_MODELS,
  google: GEMINI_MODELS,
  qwen: QWEN_MODELS,
  mistral: MISTRAL_MODELS,
  cohere: COHERE_MODELS,
  xai: XAI_MODELS,
};

export function useProviderSettings() {
  const [slots, setSlots] = useState<ProviderSlot[]>(loadInitialSlots);
  const [modelCatalogs, setModelCatalogs] = useState<Record<string, AIModel[]>>(INITIAL_MODEL_CATALOGS);
  const [modelLoading, setModelLoading] = useState<Record<string, boolean>>({});
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});

  const refreshModels = useCallback(async (provider: ProviderId) => {
    setModelLoading((prev) => ({ ...prev, [provider]: true }));
    setModelErrors((prev) => ({ ...prev, [provider]: "" }));
    try {
      const models = await listAvailableModels(provider);
      if (models.length === 0) throw new Error("利用可能なモデルが見つかりませんでした。");
      setModelCatalogs((prev) => ({ ...prev, [provider]: models }));
      setSlots((prev) => prev.map((slot) => {
        if (slot.key !== provider) return slot;
        const matching = models.find((model) => model.id === slot.model.id && model.capabilities.availableNow);
        const nextModel = matching ?? models.find((model) => model.capabilities.availableNow) ?? slot.model;
        writeStorage(`ai-ensemble-slot-${slot.id}-model`, nextModel.id);
        return { ...slot, model: nextModel };
      }));
    } catch (err) {
      setModelErrors((prev) => ({ ...prev, [provider]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setModelLoading((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  const updateSlot = useCallback((slotId: string, patch: Partial<ProviderSlot>) => {
    setSlots((prev) => prev.map((slot) => {
      if (slot.id !== slotId) return slot;
      const next = { ...slot, ...patch };
      if (patch.model) writeStorage(`ai-ensemble-slot-${slot.id}-model`, patch.model.id);
      if (patch.label !== undefined) writeStorage(`ai-ensemble-slot-${slot.id}-nickname`, patch.label);
      if (patch.enabled !== undefined) writeStorage(`ai-ensemble-slot-${slot.id}-enabled`, patch.enabled);
      return next;
    }));
  }, []);

  const persistOrder = useCallback((next: ProviderSlot[]) => {
    writeStorage(SLOT_ORDER_STORAGE_KEY, next.map((slot) => slot.id));
    return next;
  }, []);

  const moveProviderSlot = useCallback((slotId: string, direction: -1 | 1) => {
    setSlots((prev) => persistOrder(moveSlot(prev, slotId, direction)));
  }, [persistOrder]);

  const reorderProviderSlot = useCallback((draggedSlotId: string, targetSlotId: string) => {
    setSlots((prev) => persistOrder(reorderSlot(prev, draggedSlotId, targetSlotId)));
  }, [persistOrder]);

  const saveKey = useCallback(async (slot: ProviderSlot) => {
    if (!slot.keyDraft.trim()) return;
    await saveApiKey(slot.key, slot.keyDraft.trim());
    setSlots((prev) => prev.map((candidate) => candidate.key === slot.key
      ? { ...candidate, keyDraft: "", keySaved: true }
      : candidate));
    await refreshModels(slot.key);
  }, [refreshModels]);

  const deleteKey = useCallback(async (slot: ProviderSlot) => {
    await deleteApiKey(slot.key);
    setSlots((prev) => prev.map((candidate) => candidate.key === slot.key
      ? { ...candidate, keySaved: false }
      : candidate));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const providers = [...new Set(INITIAL_SLOTS.map((slot) => slot.key))];
      for (const provider of providers) {
        const saved = await hasApiKey(provider);
        if (cancelled) return;
        setSlots((prev) => prev.map((slot) => slot.key === provider ? { ...slot, keySaved: saved } : slot));
        if (saved) await refreshModels(provider);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshModels]);

  return {
    slots,
    modelCatalogs,
    modelLoading,
    modelErrors,
    refreshModels,
    updateSlot,
    moveProviderSlot,
    reorderProviderSlot,
    saveKey,
    deleteKey,
  };
}
