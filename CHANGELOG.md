# Changelog

All notable changes are documented here. The project currently uses alpha-level release practices.

## 1.3.4 — Coordinate hit-test hotfix

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
