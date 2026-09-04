import { useCallback, useState } from "react";
import { deleteApiKey, hasApiKey, saveApiKey } from "../providers/tauriProvider";
import { readStorage, writeStorage } from "../storage/localSettings";
import { normalizeCustomProviderBaseUrl, type CustomProviderConfig } from "../types/customProvider";

// [Phase CP-1 MVP] Custom Provider(ユーザー追加のOpenAI互換エンドポイント)の
// 一覧・追加・削除・有効切替・APIキー保存を管理するフック。
//
// 設計方針: useProviderSettings()と同じ永続化パターン(localStorageのreadStorage/
// writeStorage)を踏襲するが、完全に独立したstateとして持つ。既存のslots配列や
// ProviderId前提のロジックには一切触れない。
//
// 範囲外(MVP): DBへの保存、Export/Restore対応、モデル一覧自動取得。
// これらは次フェーズで検討する。

const STORAGE_KEY = "ai-ensemble-custom-providers";

function loadInitialCustomProviders(): CustomProviderConfig[] {
  return readStorage<CustomProviderConfig[]>(STORAGE_KEY, []);
}

function persist(list: CustomProviderConfig[]) {
  // APIキー本体は元よりこのオブジェクトに含まれない(keySaved: booleanのみ)。
  // keyDraftは保存後に空文字へ戻すため、永続化してもキー漏洩にはならない。
  writeStorage(STORAGE_KEY, list);
}

function generateCustomProviderId(): string {
  return `custom-${crypto.randomUUID()}`;
}

export function useCustomProviders() {
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>(loadInitialCustomProviders);

  const addCustomProvider = useCallback((input: { name: string; baseUrl: string; model: string }) => {
    const next: CustomProviderConfig = {
      id: generateCustomProviderId(),
      name: input.name.trim() || "Custom Provider",
      baseUrl: normalizeCustomProviderBaseUrl(input.baseUrl),
      model: input.model.trim(),
      enabled: true,
      keySaved: false,
      keyDraft: "",
    };
    setCustomProviders((prev) => {
      const updated = [...prev, next];
      persist(updated);
      return updated;
    });
    return next.id;
  }, []);

  const removeCustomProvider = useCallback(async (id: string) => {
    // キー本体もOS Credential Storeから消しておく(残留させない)。
    await deleteApiKey(id).catch(() => {
      // 未保存(キーを一度も入れていない)場合はRust側がエラーを返さない設計だが、
      // 念のため失敗しても一覧からの削除自体は続行する。
    });
    setCustomProviders((prev) => {
      const updated = prev.filter((config) => config.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const updateCustomProvider = useCallback((id: string, patch: Partial<CustomProviderConfig>) => {
    setCustomProviders((prev) => {
      const updated = prev.map((config) => config.id === id ? { ...config, ...patch } : config);
      persist(updated);
      return updated;
    });
  }, []);

  const saveCustomProviderKey = useCallback(async (config: CustomProviderConfig) => {
    if (!config.keyDraft.trim()) return;
    await saveApiKey(config.id, config.keyDraft.trim());
    setCustomProviders((prev) => {
      const updated = prev.map((candidate) => candidate.id === config.id
        ? { ...candidate, keyDraft: "", keySaved: true }
        : candidate);
      persist(updated);
      return updated;
    });
  }, []);

  const deleteCustomProviderKey = useCallback(async (config: CustomProviderConfig) => {
    await deleteApiKey(config.id);
    setCustomProviders((prev) => {
      const updated = prev.map((candidate) => candidate.id === config.id
        ? { ...candidate, keySaved: false }
        : candidate);
      persist(updated);
      return updated;
    });
  }, []);

  const refreshKeyStatus = useCallback(async () => {
    const current = loadInitialCustomProviders();
    if (current.length === 0) return;
    const withStatus = await Promise.all(current.map(async (config) => ({
      ...config,
      keySaved: await hasApiKey(config.id),
    })));
    setCustomProviders(withStatus);
  }, []);

  return {
    customProviders,
    addCustomProvider,
    removeCustomProvider,
    updateCustomProvider,
    saveCustomProviderKey,
    deleteCustomProviderKey,
    refreshKeyStatus,
  };
}
