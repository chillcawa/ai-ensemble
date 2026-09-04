import type { ConversationMessage } from "../../conversation/types";
import type { AIResponseSlot, ProviderSlot } from "../../types/app";
import type { CustomProviderConfig } from "../../types/customProvider";
import { createEchoDeltaModel } from "../echoProviderFactory";
import { DeltaAnalysisWorkbench } from "./DeltaAnalysisWorkbench";

export function DeltaWorkbenchGate(props: {
  messages: ConversationMessage[];
  responseSlots: AIResponseSlot[];
  builtInSlots: ProviderSlot[];
  customProviders: CustomProviderConfig[];
}) {
  return (
    <DeltaAnalysisWorkbench
      messages={props.messages}
      responseSlots={props.responseSlots}
      buildModel={(slotId) => createEchoDeltaModel({
        slotId,
        responseSlots: props.responseSlots,
        builtInSlots: props.builtInSlots,
        customProviders: props.customProviders,
      })}
    />
  );
}
