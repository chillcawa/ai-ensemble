import type { AIModel, AIProvider } from "../types/ai";
import type { TranslatorModel, TranslatorModelRequest } from "./translator/types";
import type { ComparatorModel } from "./comparator/types";

/**
 * Delta-only wrapper around ECHO's existing provider contract.
 *
 * Important:
 * - calls provider.chat() directly
 * - does NOT use broadcastQuestion()
 * - does NOT persist responses to Conversation
 */
export class EchoDeltaChatModel implements TranslatorModel, ComparatorModel {
  constructor(
    private readonly provider: AIProvider,
    private readonly model: AIModel,
  ) {}

  async complete(request: TranslatorModelRequest): Promise<string> {
    const response = await this.provider.chat({
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    });
    return response.content;
  }
}
