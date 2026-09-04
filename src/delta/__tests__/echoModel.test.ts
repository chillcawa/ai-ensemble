import { describe, expect, it } from "vitest";
import type { AIModel, AIProvider, ChatRequest } from "../../types/ai";
import { EchoDeltaChatModel } from "../echoModel";

describe("EchoDeltaChatModel", () => {
  it("calls provider.chat with system + user and returns only content", async () => {
    let seen: ChatRequest | undefined;
    const model = {
      id: "test-model",
      provider: "openai",
      name: "test-model",
      capabilities: {
        streaming: false,
        vision: false,
        tools: false,
        audioInput: false,
        audioOutput: false,
      },
    } as AIModel;

    const provider = {
      id: "openai",
      name: "fake",
      async listModels() { return [model]; },
      async chat(request: ChatRequest) {
        seen = request;
        return { content: '{"ok":true}', model: model.id };
      },
      async stream() {
        throw new Error("not used");
      },
    } as AIProvider;

    const delta = new EchoDeltaChatModel(provider, model);
    const content = await delta.complete({ system: "SYS", user: "USR" });

    expect(content).toBe('{"ok":true}');
    expect(seen?.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USR" },
    ]);
  });
});
