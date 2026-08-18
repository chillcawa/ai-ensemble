import { ANTHROPIC_MODELS, COHERE_MODELS, DEEPSEEK_MODELS, GEMINI_MODELS, KIMI_MODELS, MISTRAL_MODELS, OPENAI_MODELS, QWEN_MODELS, XAI_MODELS } from "../providers/tauriProvider";
import { providerDefaultNickname } from "../providers/registry";
import type { AIModel } from "../types/ai";
import type { ProviderSlot } from "../types/app";

export const INITIAL_SLOTS: ProviderSlot[] = [
  {
    id: "slot-openai",
    key: "openai",
    label: providerDefaultNickname("openai"),
    enabled: true,
    model: OPENAI_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-anthropic",
    key: "anthropic",
    label: providerDefaultNickname("anthropic"),
    enabled: true,
    model: ANTHROPIC_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-deepseek",
    key: "deepseek",
    label: providerDefaultNickname("deepseek"),
    enabled: true,
    model: DEEPSEEK_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-kimi",
    key: "kimi",
    label: providerDefaultNickname("kimi"),
    enabled: true,
    model: KIMI_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-google",
    key: "google",
    label: providerDefaultNickname("google"),
    enabled: true,
    model: GEMINI_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-qwen",
    key: "qwen",
    label: providerDefaultNickname("qwen"),
    enabled: true,
    model: QWEN_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-mistral",
    key: "mistral",
    label: providerDefaultNickname("mistral"),
    enabled: true,
    model: MISTRAL_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-cohere",
    key: "cohere",
    label: providerDefaultNickname("cohere"),
    enabled: true,
    model: COHERE_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
  {
    id: "slot-xai",
    key: "xai",
    label: providerDefaultNickname("xai"),
    enabled: true,
    model: XAI_MODELS[0],
    keySaved: false,
    keyDraft: "",
  },
];

// Slot identity is intentionally independent from provider/model.
// This allows multiple slots using the same provider/model later.
export const resultKeyForSlot = (slotId: string): string => slotId;

export function catalogForSlot(slot: ProviderSlot): AIModel[] {
  if (slot.key === "openai") return OPENAI_MODELS;
  if (slot.key === "anthropic") return ANTHROPIC_MODELS;
  if (slot.key === "deepseek") return DEEPSEEK_MODELS;
  if (slot.key === "kimi") return KIMI_MODELS;
  if (slot.key === "google") return GEMINI_MODELS;
  if (slot.key === "qwen") return QWEN_MODELS;
  if (slot.key === "mistral") return MISTRAL_MODELS;
  if (slot.key === "cohere") return COHERE_MODELS;
  if (slot.key === "xai") return XAI_MODELS;
  return [slot.model];
}
