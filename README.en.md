# AI Ensemble — ECHO v1.3.4

**Evaluation, Comparison & Hallucination Observation**

AI Ensemble — ECHO is a desktop tool for human observation and verification of differences, misidentification, and hallucinations across multiple AI responses. It does not automatically determine which AI is correct or classify a response as a hallucination.

**AI Ensemble is not a consensus engine.** It does not decide which AI is correct. Responses, context conditions, and cross-AI references remain visible so the user can evaluate them.

[日本語 README](README.md)

## Supported providers

The current application can send requests to nine providers:

- OpenAI / ChatGPT
- Anthropic / Claude
- DeepSeek
- Moonshot AI / Kimi
- Google / Gemini
- Alibaba Cloud Model Studio / Qwen
- Mistral AI
- Cohere
- xAI / Grok

You supply API keys only for the providers you use. Keys are stored by the Rust backend in the operating system credential store (Windows Credential Manager or macOS Keychain). The frontend does not receive the raw key value.

## Main features

- Concurrent streaming requests and side-by-side response comparison
- Reorder target AI services with mouse, pen, or touch pointer dragging, or accessible left/right controls, with persisted order
- Per-provider model selection and model discovery
- Conversation logs, search, observations, and one-hop handoff between AIs
- Separate Instruction and Reference context, reusable Context Sets, Projects, and a Context Library
- ChatGPT, Claude, generic JSON, Markdown, and text archive imports
- Local SQLite persistence, data export, and full-replacement restore
- Estimated token usage and cost display
- Japanese, English, Simplified Chinese, and Korean UI

AI Ensemble operates without an application-owner relay server. Requests go from the desktop application to the provider APIs you configure. Provider retention and data use remain subject to your provider plan, settings, and terms.

## Important boundaries

- Comparison aid is not a comparison conclusion.
- Estimated cost is not billed cost.
- A registered provider is not necessarily an available provider.
- A reference being sent does not mean the receiving model followed it.
- Generated output can be wrong; important decisions require source verification and human review.

For workplace use, follow your organization's policies and provider contracts. Minimize or mask personal and confidential information before sending it to an external AI service.

## Development

Requirements: Node.js 20+, npm, Rust, and the platform prerequisites for Tauri 2.

```bash
npm ci
npm run verify
npm run tauri:dev
```

Build a platform installer with:

```bash
npm run tauri:build
```

Before an OSS release on Windows, double-click `RUN_OSS_RELEASE_CHECK.bat`. It runs the frontend
checks, dependency audits, Cargo lockfile generation, Rust auto-formatting/tests/Clippy,
and the NSIS build plus executable inspection. Keep the generated `src-tauri/Cargo.lock` in the
repository.

When the gate passes, it creates `AI-Ensemble-v1.3.4-OSS-VERIFIED-SOURCE.zip` in the project root
for the final publication audit.
To reduce Windows file-lock and long-path failures, the gate uses a short Cargo target under
`%LOCALAPPDATA%\AI-Ensemble-Build`, limits Cargo to one parallel job, reuses the most recent build
cache on reruns, and copies the verified installer into the project-root `release-output` folder.

The audit gate blocks high/critical production advisories and critical advisories in the complete
dependency tree. Development-only moderate/high advisories remain visible and must be reviewed.

The Windows release script generates NSIS output, strips release symbols, normalizes build paths, and scans the resulting executable for known secret and user-path patterns. Do not distribute a build when this validation fails.

The manual macOS workflow produces ad-hoc-signed Apple Silicon and Intel DMGs. They are not notarized. Formal macOS distribution requires Apple Developer ID signing and notarization.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [ROADMAP.md](ROADMAP.md) before contributing.
Pricing estimate sources and their review date are recorded in [PRICING_SOURCES.md](PRICING_SOURCES.md).
Complete every gate in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before creating a public release tag.

## License

Copyright 2026 AI Ensemble contributors.

Licensed under the [Apache License 2.0](LICENSE). Provider and product names remain the property of their respective owners; see [TRADEMARKS.md](TRADEMARKS.md). AI Ensemble is not affiliated with or endorsed by the named AI providers.
