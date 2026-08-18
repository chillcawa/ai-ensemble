# AI Ensemble — ECHO v1.3.4

**Evaluation, Comparison & Hallucination Observation**

v1.3.4 is the first release candidate carrying the ECHO product identity. ECHO is designed to let a
human compare multiple AI outputs, preserve their provenance, and inspect disagreements or possible
hallucinations. It is not a consensus engine and does not automatically decide which model is correct.

## Highlights

- Compare responses from nine supported AI providers in one desktop workspace.
- Explicit provider/model identity labels remain separate from what a model claims about itself.
- Human-approved, one-hop Handoff lets one AI response be sent as a required Reference to selected AIs.
- Conversation, Context, Context Sets, Projects, and Archive workflows keep storage separate from active sending.
- First-launch language and usage notice in Japanese, English, Simplified Chinese, and Korean.
- Display cost estimates in USD, JPY, EUR, GBP, CNY, or KRW. Provider prices remain USD-based internally;
  non-USD conversion uses a manual exchange rate.
- Long-view navigation now includes a floating `↑ Top` action.
- Claude output handling now avoids the previous low default cap and marks token-limit truncation explicitly.

## Safety and data boundaries

ECHO sends requests directly from the desktop application to the provider APIs configured by the user.
It does not use an application-owner relay server. API keys are stored in the operating-system credential
store. Conversation and Context data are stored locally unless the user sends them to a configured provider.

Archive content is not automatically sent to an AI. It must be deliberately promoted into the Context
Library, placed in a Context Set as a Reference, and enabled for a Conversation.

AI-generated text can misidentify its own model, provider, developer, or source. Treat ECHO's routing
metadata as the identity label and verify important claims against primary sources.

## Before publishing

Run the exact final source candidate through `RELEASE_CHECKLIST.md`. In particular, rerun the Windows
release gate and test the generated NSIS installer rather than relying only on frontend typecheck/build results.
