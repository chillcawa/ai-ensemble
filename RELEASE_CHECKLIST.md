# Release checklist

Complete these gates before creating a public release tag. A previous build passing a gate does not automatically validate a newer source archive; rerun release-critical checks on the final candidate.

## Current v1.3.5 candidate

- [x] Independent review confirms `tsc --noEmit` passes with 0 errors on the reviewed candidate.
- [x] Independent review confirms 51 frontend tests pass on the reviewed candidate.
- [x] Independent review confirms the production frontend build succeeds on the reviewed candidate.
- [x] Confirm `src/models/aiDisplay.ts` remains the shared implementation for AI display identity/observation labels.
- [ ] Run `npm run verify` again on the exact final source candidate after documentation/release-script cleanup.
- [ ] Launch the exact final candidate with `npm run tauri dev` and complete the manual smoke test below.
- [ ] Run `RUN_OSS_RELEASE_CHECK.bat` on the exact final source candidate.
- [ ] Keep the generated `src-tauri/Cargo.lock` and any intentional rustfmt changes in the repository.
- [ ] Install the newly generated Windows NSIS package and confirm launch.
- [ ] Confirm the NSIS installer allows the user to choose an installation directory and that application data remains under the normal AppData location.
- [ ] Scan the final source archive and installer for credentials, exported conversations, databases, logs, personal paths, and unexpected build artifacts.
- [ ] Review the final `npm audit` advisory list. Production high/critical and all critical findings are blocking.
- [ ] Verify `src-tauri/pricing.json` against the first-party links in `PRICING_SOURCES.md`.
- [ ] Confirm package/Tauri/Cargo/in-app version fields, installer artifact names, `CHANGELOG.md`, README files, and release notes all match v1.3.5.
- [ ] Confirm GitHub Private Vulnerability Reporting is enabled.
- [ ] Create the release tag only after every Windows release gate above is complete.

## Manual smoke test

### Core ECHO

- [ ] First launch: language selector works in Japanese / English / Simplified Chinese / Korean.
- [ ] First launch: both 18+ and notice-confirmation checks are required before starting.
- [ ] Normal multi-AI send works and streams responses.
- [ ] A stalled/timed-out streaming request stops without leaving a provider stream running in the background.
- [ ] Provider identity warning appears on normal responses and remains correct even when a model self-identifies incorrectly.
- [ ] Conversation Log / saved Turns retain the identity warning.
- [ ] Handoff confirmation appears every time before sending.
- [ ] Handoff route shows the actual source → target relationship.
- [ ] Handoff sends the full required Reference and remains one hop only.
- [ ] Handoff results are vertically presented and collapsible.
- [ ] Long Claude output is not unexpectedly capped at the previous 1024-token default; token-limit termination shows the warning.
- [ ] Archive-only content is not sent automatically.
- [ ] Archive → Context Library → Reference → Set → Conversation enablement makes the intended content active.
- [ ] Display currency can switch among USD / JPY / EUR / GBP / CNY / KRW.
- [ ] Non-USD cost display follows the manually entered exchange rate; USD does not require a rate.
- [ ] `↑ Top` appears after scrolling down and returns the page to the top.
- [ ] Export/restore preserves current settings and remains compatible with legacy exchange fields.
- [ ] Provider ordering works by button and pointer drag.
- [ ] Usage / Cost still distinguishes local estimates from provider billing.
- [ ] Custom Provider beta can add and use a known-working OpenAI-compatible endpoint without affecting built-in providers.

### Delta Protocol experimental feature

- [ ] Delta is OFF by default and normal ECHO behavior is unchanged while OFF.
- [ ] Delta can analyze a saved Turn without rewriting or deleting the saved Conversation.
- [ ] Delta processing AI can be selected from currently available models and only one processor is used per analysis.
- [ ] IR / Compare / Resolve / History views open correctly.
- [ ] Japanese / English / Simplified Chinese / Korean Delta labels switch without mixed-language leakage in the checked paths.
- [ ] Comparator may preserve a valid empty/unresolved result; an empty first pass is rechecked once rather than forcibly converted into consensus.
- [ ] Human Resolution requires explicit Human action and retains basis/history.
- [ ] Reopening does not create duplicate open states for the same Resolution.
- [ ] Saved Delta analysis can be reloaded and retains relevant warnings/failures.

## macOS trial

- [ ] Confirm the macOS trial installer builds on Apple Silicon.
- [ ] Confirm the macOS trial installer builds on Intel.
- [ ] Confirm signing/notarization claims match the actual artifacts.

The macOS trial items may remain incomplete if only the Windows build is being published. Do not advertise an untested macOS build as a verified release.
