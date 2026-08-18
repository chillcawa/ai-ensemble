# AI Ensemble — ECHO v1.3.4

**Evaluation, Comparison & Hallucination Observation**

AI Ensemble — ECHO is a desktop tool for human observation and verification of differences, misidentification, and hallucinations across multiple AI responses. It does **not** automatically determine which AI is correct or classify a response as a hallucination.

It sends the same question to multiple generative AI providers and lets the user compare their responses side by side. It is intended as an aid for human judgment in development, research, writing, ideation, and similar work.

[日本語 README](README.md)

**AI Ensemble is not a consensus engine.**  
It does not automatically decide which AI is correct. Responses, reference conditions, and cross-AI provenance remain visible so the user can evaluate them.

## Supported AI providers

The current application can send requests to the following nine providers:

- OpenAI / ChatGPT
- Anthropic / Claude
- DeepSeek
- Moonshot AI / Kimi
- Google / Gemini
- Alibaba Cloud Model Studio / Qwen
- Mistral AI
- Cohere
- xAI / Grok

You need your own API key for each provider you use. You do not need to configure all providers.
Only providers with a saved API key can be selected for sending.

API keys are stored from the Rust backend in the operating system credential store
(Windows Credential Manager / macOS Keychain). The frontend does not receive the raw key value.

## Languages

- Japanese, English, Simplified Chinese, and Korean UI
- On first launch, the app detects the operating-system language
  (Japanese, Korean, or Simplified Chinese where applicable; English otherwise)
- The language can be changed at any time in Settings:
  System / 日本語 / English / 简体中文 / 한국어
- The selected UI language is included in the backup JSON and restored on another PC

Only the application UI is translated. Questions, AI responses, Context, Conversations,
user-created names, and other user content remain in their original language.
Provider error messages may also be shown in their original wording when preserving diagnostic detail is useful.

Low-frequency untranslated strings in Simplified Chinese or Korean fall back to English.
Possible future language additions include Traditional Chinese, Spanish, and Brazilian Portuguese.
Hindi may be considered later if resources permit.

## First launch and usage notice

On first launch, the user selects the UI language and reviews the usage notice.
Starting the application requires confirmation of both:

- “I am 18 or older”
- “I have reviewed the notice above”

ECHO does not ask for or store a date of birth or age value.

AI systems can misidentify their own model, developer, provider, or reference source.
ECHO therefore prioritizes Provider / Model information held by the application over claims made
inside the generated response, and displays a generation-source label before AI responses.

Cross-AI Handoff is limited to **one human-approved hop**.
ECHO does not create autonomous or repeated AI-to-AI chains.

## Main features

### Questions and response comparison

- Concurrent requests to selected AI providers with streaming display
- Reorder target AIs with pointer drag (mouse / pen / touch) or left/right controls, with persisted order
- Per-provider model selection and model discovery from official APIs
- Horizontally scrollable AI target list
- Resizable response columns
- Synchronized top/bottom horizontal response navigation
- Fluid layout using the full available window width
- Native fullscreen / normal-window toggle
- Floating `↑ Top` button for returning to the top of long pages

### Conversation / Observation

- Turn-based Conversation Log
- Parallel response comparison
- Turn search and filtering
- Human-applied Observation markers
- One-hop Handoff from the latest response or a saved normal response to other AIs
- Provenance recording for cross-AI references
- Context Reload boundaries and conversation-history reset

`Send to other AI` sends the full original response as a Reference.
However, ECHO does not guarantee that the receiving AI will correctly read, quote, or apply that Reference.
The resulting answer must still be reviewed by a human.

### Context

- Separation of Instruction and Reference
- Create, duplicate, and switch Context Sets
- Context Library and Project management
- Conversation-scoped Context boundaries
- Add AI responses as References
- Approximate Context-limit calculation and warnings
- On Context Reload, choose whether to keep history, create a boundary, or reset history

Imported conversations are Archive candidates and do not automatically become active Context.
If a Context limit is exceeded, ECHO does not automatically delete or summarize user content.

Persistent Context, Context Sets, Context Library, and Projects use SQLite as the source of truth.

Archive storage alone does **not** make content active AI context.
To send archived material to an AI, add it from Archive to the Context Library, use it as a Reference
inside a Context Set, and enable that Set for the target Conversation.
This separation helps prevent archived content from being sent to external AI providers unintentionally.

### Archive / Import

- Generic JSON / Markdown / Text
- ChatGPT export adapter
- Claude export adapter
- Adapter Registry
- Review imported Archive content before adding selected material to Context

### Usage / Cost

- SQLite-based Usage history
- Token usage by Provider / Model
- DeepSeek cache-aware, effective-date-based price estimation
- Links to each provider’s official Usage / Billing page
- Clear separation between local estimated cost and official billed cost
- Display currency selection: USD / JPY / EUR / GBP / CNY / KRW
- Provider prices remain internally USD-based; non-USD display uses a user-supplied manual exchange rate

For providers such as Gemini, Qwen, Mistral, Cohere, and Grok, where plan, free-tier, or model conditions
cannot be determined reliably from the API response alone, ECHO does not present a definitive billed amount.
Check final usage, free-tier status, balance, and billing on the provider’s official pages.

### Data migration / backup

From Settings → “Export conversation logs / personal settings”, ECHO can export the following into one JSON file:

- Conversations
- AI responses
- Context
- Projects
- Import Archive
- Usage
- Text Pad
- Display settings

The file is saved to the operating system’s Downloads folder.

The export does **not** include:

- API keys stored in the operating-system credential store
- API-key saved-state flags
- Partially entered API-key drafts

However, if a user manually typed an API key or another secret inside conversation or Context text,
ECHO does not automatically detect or remove that string.

Export files may contain confidential Conversation or Context content.
Review both the file contents and the recipient before sharing them with another person.

“Restore from export file” can restore JSON created by v0.15.0 or later onto another PC.
Restore **fully replaces** the current Conversations, responses, Context, Projects, Archive, Usage,
Text Pad, and personal settings with the file contents.

A confirmation dialog is shown before restore.
If the restore fails partway through, SQLite changes are rolled back.

Credential-store API keys are not included in export or restore.
On a new PC, configure API keys again.
On the same PC, restore does not modify currently stored API keys.

## Data flow

- Questions, active Context, and required conversation history are sent directly from the user’s device
  to the official API of the selected AI provider.
- ECHO does not use an application-owner relay server.
- Raw API keys are stored in the operating-system credential store and are not re-displayed in the UI.
- Conversation, Context, and usage-history data are stored locally on the device.
- Provider-side retention, training use, and data processing remain subject to the user’s provider plan,
  settings, contracts, and provider terms.

## Workplace use

Follow your organization’s policies and your agreements / data settings with each AI provider.
Only enter material that your organization permits to be processed by external AI services.

When handling personal or confidential information, minimize the data to what is necessary
and consider anonymization or masking.

Generated output may contain errors or speculation.
Important decisions require checking primary sources and human review.

## Current limitations

- This is independently developed software. Operation, generated content, and continued availability
  of external AI services are not guaranteed.
- Provider model changes or service discontinuations may temporarily break sending.
- A failure from one AI provider does not stop sends to the others.
- Grok can accept an API key, but use commonly requires prepaid balance or billing authorization.
- Cohere Evaluation Keys are intended for evaluation / trial use; confirm contract terms for production work.
- There is no automatic updater. Install newer versions manually.
- Uninstalling the application may leave credential-store API keys or local application data behind.
- Restore fully replaces current local data. Export the current state before restoring.
- ECHO does not fetch live exchange rates. Configure non-USD exchange rates manually.

## Stack

- Tauri 2
- React
- TypeScript
- Rust
- SQLite

## Development

Requirements: Node.js 20+, npm, a stable Rust toolchain, and the Windows prerequisites for Tauri 2.

```bash
npm ci
npm run verify
npm run tauri:dev
```

To build a Windows installer:

```bash
npm run tauri:build
```

This command generates an NSIS installer only.
The release pipeline anonymizes Rust build paths, strips release symbols, and automatically inspects
the final executable for user information, known API-key patterns, and an unexpected Console subsystem.
Do not distribute a build if the validation fails.

Typical output location:

```text
src-tauri/target/release/bundle/nsis/
```

Before an OSS release on Windows, double-click `RUN_OSS_RELEASE_CHECK.bat`.

The gate runs:

- frontend verification
- dependency audits
- `Cargo.lock` generation
- Rust automatic formatting
- Rust tests
- Clippy
- NSIS build
- final executable inspection

Keep the generated `src-tauri/Cargo.lock` in the repository.

When all checks pass, the gate creates
`AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip`
in the project root for final publication audit.

To reduce Windows file-lock and long-path problems, Rust artifacts are built under a short path inside
`%LOCALAPPDATA%\AI-Ensemble-Build\`, Cargo parallelism is limited to one job, and the latest build cache
is reused on reruns. The verified installer is copied to the project-root `release-output` folder.

The dependency gate blocks production high/critical advisories and critical advisories across the full tree.
Development-only moderate/high advisories remain visible and should be reviewed before publication.

The final verification environment is a Windows machine running typecheck / build / `tauri:dev`,
followed by launch testing of the generated installer.

### macOS trial build

Even without a Mac, the `Build macOS Trial` GitHub Actions workflow can manually generate
Apple Silicon and Intel DMGs.

Open the workflow in GitHub Actions, choose `Run workflow`, and download the matching CPU artifact after completion.

On a local Mac:

```bash
npm run tauri:build
```

macOS builds produce `.app` and `.dmg`.
The trial build uses ad-hoc signing and is **not** Apple-notarized.
If macOS blocks the first launch, the user may need to allow it from
System Settings → Privacy & Security.

Formal distribution requires Apple Developer ID signing and notarization.

At viewport widths of 1024px or less, the sidebar becomes an overlay and AI-selection / response columns
can be horizontally swiped. This is currently narrow-width / touch-friendly macOS app behavior,
not a native iPadOS or Android application.

## Design boundaries

- Comparison Aid ≠ Comparison Conclusion
- Search Aid ≠ Relevance Judgment
- Navigation ≠ Reordering
- Estimated Cost ≠ Billed Cost
- Registered Provider ≠ Usable Provider
- Reference sent ≠ Reference followed
- AI-Referenced Observation ≠ Independent Observation

## Next candidates

- Review Simplified Chinese and Korean translations and consider additional languages such as Traditional Chinese
- Prepare mobile abstractions for Android credential storage, file I/O, and screen layout
- iOS version (requires Mac / Xcode / Apple signing environment)
- Gradually split the application state hub for maintainability
- Clarify provider-specific reasoning / state boundaries
- Strengthen compatibility tests for provider model and API changes
- Consider local-model and additional-provider support
- Improve signing, automatic-update, and formal release workflows

## Contributing / Security

See [CONTRIBUTING.md](CONTRIBUTING.md) before contributing.

For vulnerabilities or credential-related issues, do **not** open a public issue.
Use the private reporting procedure described in [SECURITY.md](SECURITY.md).

See also:

- [CHANGELOG.md](CHANGELOG.md) for changes
- [ROADMAP.md](ROADMAP.md) for future direction
- [PRICING_SOURCES.md](PRICING_SOURCES.md) for pricing-estimate sources and review dates
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before creating a public release tag

## License

Copyright 2026 AI Ensemble contributors.

Licensed under the [Apache License 2.0](LICENSE).

Provider and product names belong to their respective owners.
AI Ensemble is not affiliated with or endorsed by the named AI providers.
See [TRADEMARKS.md](TRADEMARKS.md) for details.
