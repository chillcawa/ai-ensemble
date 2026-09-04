import type { AIResponseSlot, ProviderSlot } from "../types/app";
import type { CustomProviderConfig } from "../types/customProvider";
import { TauriProvider } from "../providers/tauriProvider";
import {
  CustomOpenAICompatibleProvider,
  makeCustomAIModel,
} from "../providers/customOpenAIProvider";
import { catalogForSlot } from "../models/slots";
import { EchoDeltaChatModel } from "./echoModel";

export function createEchoDeltaModel(args: {
  slotId: string;
  responseSlots: AIResponseSlot[];
  builtInSlots: ProviderSlot[];
  customProviders: CustomProviderConfig[];
}): EchoDeltaChatModel {
  const slot = args.responseSlots.find((candidate) => candidate.id === args.slotId);
  if (!slot) {
    throw new Error(`Delta processor slot not found: ${args.slotId}`);
  }
  if (!slot.keySaved) {
    throw new Error(`Delta processor slot has no usable credential: ${slot.label}`);
  }

  if (slot.kind === "custom") {
    const config = args.customProviders.find((candidate) => candidate.id === slot.id);
    if (!config) {
      throw new Error(`Delta Custom Provider config not found: ${slot.id}`);
    }
    return new EchoDeltaChatModel(
      new CustomOpenAICompatibleProvider(
        config.id,
        config.name,
        config.baseUrl,
        config.model,
      ),
      makeCustomAIModel(config.id, config.model),
    );
  }

  const builtIn = args.builtInSlots.find((candidate) => candidate.id === slot.id);
  if (!builtIn) {
    throw new Error(`Delta built-in Provider slot not found: ${slot.id}`);
  }

  return new EchoDeltaChatModel(
    new TauriProvider(builtIn.key, builtIn.label, catalogForSlot(builtIn)),
    builtIn.model,
  );
}
