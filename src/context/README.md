# Context architecture v0.1

v0.6.5 introduces the internal Context contract only. Context UI is intentionally deferred to v0.7.

## Invariants

1. Instruction != Reference
2. Import != Context
3. Add to Context != Persist
4. Persist Context != Send immediately
5. AI Response != System Prompt
6. AI -> AI is a human-approved single hop
7. Context overflow never triggers automatic deletion or summarization

## Assembly order

The UI exposes Global / Project / AI-specific layers. `assembler.ts` normalizes enabled items for a target slot. Provider adapters are responsible for translating the normalized request into each provider's native system/message representation.

Reference items remain clearly delimited data. External documents, imported conversations, and AI-generated responses are never silently promoted to instructions.

## v0.7 target

- Context enable/disable UI
- applied-context visibility before send
- Global / Project / AI-specific instructions
- AI Response -> Context
- human-approved one-hop transfer to another AI
- budget display and warning only
