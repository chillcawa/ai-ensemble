# Changelog

All notable changes are documented here. The project currently uses alpha-level release practices.

## 1.3.5 — Delta experimental integration, Custom Provider, and release hardening

- Added an opt-in experimental Delta Protocol analysis sidecar that operates on already-saved Conversation data without replacing the Conversation source of truth.
- Added Delta IR inspection, structured comparison, unresolved-state preservation, Human-only Resolution controls, decision history, and provenance-oriented views.
- Changed the Delta processing model from ChatGPT-only to one selectable currently available model; Translator and Comparator use the selected single processor.
- Added Japanese, English, Simplified Chinese, and Korean localization across the Delta UI, model-recommendation explanations, capability labels, and top-level reload/context status controls.
- Added a Comparator empty-result confirmation pass so cautious model output can be rechecked once without forcing a relation when comparison is genuinely unsupported.
- Hardened Delta cohort selection and reference-source lineage normalization, including context-lineage handling for saved Conversation analysis.
- Hardened Human Resolution persistence and integrity checks, partial unresolved-state closure, duplicate reopen prevention, and saved warning/failure retention.
- Ensured stream timeout handling cancels the underlying Rust/provider stream instead of only ending the UI task.
- Retained the production white-screen fixes for packaged builds, including guarded Delta loading/error boundaries and the packaged-build compatibility fixes already present in the release configuration.

### Custom Provider MVP polish

- Hotfix 4: Promoted Custom Provider responses into the normal response slot UI, including Context add, one-hop Handoff, retry, stop, Custom badges, safer local URL presets, and friendlier connection errors.
- Hotfix 3: Added Simplified Chinese and Korean translations for Custom Provider beta guidance and Global Instruction shared-scope copy.
- Hotfix 2: Clarified that Custom Provider (beta) supports OpenAI-compatible APIs only, with examples and notes for Claude/Gemini official API limitations.
- Hotfix: Added Custom Provider entries to the main target-AI slider/count so LM Studio/Ollama can be selected and sent from the normal composer.
- Hotfix: Persisted completed Custom Provider responses in the conversation log instead of only showing them in the live result board.
- Bumped application metadata to v1.3.5 across package, Tauri, Cargo, and in-app version display.
- Changed the default Turn display order to newest-first for fresh installations.
- Polished Custom Provider (beta) setup with LM Studio / Ollama presets, optional API-key entry during creation, clearer labels, and Base URL normalization when `/chat/completions` is pasted.
- Added explanatory and safety copy to Global Instruction so users understand it is shared across all projects and should not contain secrets.

## 1.3.4 — ECHO release candidate

- Adopted the product name **AI Ensemble — ECHO**: Evaluation, Comparison & Hallucination Observation.
- Clarified that ECHO is a human comparison/observation aid, not a consensus engine or automatic hallucination detector.
- Added provider-identity warnings based on application routing metadata instead of model self-description.
- Strengthened one-hop Handoff with human confirmation, explicit source/target routing, and full-source Reference injection.
- Kept normal Turn comparison horizontal while presenting Handoff lineage vertically and collapsibly.
- Added first-launch language selection and usage notice with 18+ confirmation; no birth date or age value is stored.
- Increased the Anthropic default output allowance and added a visible warning when an output ends at the token limit.
- Centralized AI display helpers in `src/models/aiDisplay.ts` to prevent identity/observation-label drift.
- Added display currencies USD / JPY / EUR / GBP / CNY / KRW while keeping provider pricing internally USD-based.
- Added manual exchange-rate configuration for non-USD display. No live FX service is required.
- Added a floating `↑ Top` action for long pages.
- Preserved legacy exchange settings in export/restore compatibility while removing their obsolete UI setters.
- Aligned the English README with the Japanese README so safety boundaries, current limitations, backup/restore behavior, stack, roadmap, and all seven Design Boundaries are documented consistently.
- Replaced `elementFromPoint()` drop targeting with direct provider-card rectangle checks for Windows WebView compatibility.
- Rechecks the target at pointer release so the final pointer position is authoritative.
- Cleared the Rust Clippy release gate while retaining intentional Tauri command and persistence API shapes.

## 1.3.3 — WebView drag compatibility

- Replaced native HTML drag-and-drop with Pointer Events so card reordering works inside the Tauri WebView.
- Added mouse, pen, and touch pointer capture on the reorder handle.
- Added horizontal edge auto-scroll while dragging through the provider strip.
- Retained left/right controls as the keyboard-friendly fallback.

## 1.3.2 — Provider ordering

- Added drag-and-drop ordering for target AI cards on desktop.
- Added left/right ordering controls as a keyboard and tablet-friendly fallback.
- Persisted provider order locally and through user-data export/restore.
- Applied the same order to sending, response columns, and AI navigation.
- Added normalization and movement tests so stale, duplicated, or newly introduced slot IDs remain safe.

## 1.3.1 — OSS readiness

- Added Apache License 2.0 and public contribution, security, conduct, and trademark guidance.
- Added pull-request CI, dependency update configuration, frontend tests, and immutable GitHub Action references.
- Added an application Content Security Policy.
- Hardened official-provider URL opening with strict URL parsing, an exact hostname allow-list, and shell-free Windows execution.
- Removed unused frontend provider clients that accepted raw API keys.
- Corrected provider-registry coverage and sending-state translations.
- Replaced project-specific text in public import fixtures.
- Expanded ignore rules for secrets, local data, exports, and build artifacts.

## 1.3.0

- Added macOS trial builds and narrow/tablet-width layout support.
- Added Japanese, English, Simplified Chinese, and Korean UI support.
- Supported nine live AI providers through the Rust/Tauri network layer.
