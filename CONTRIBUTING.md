# Contributing to AI Ensemble

Thanks for helping improve AI Ensemble.

## Development setup

Requirements: Node.js 20 or later, npm, the Rust toolchain supported by Tauri 2, and the platform prerequisites from the Tauri documentation.

```bash
npm ci
npm run verify
npm run tauri:dev
```

Rust changes should also pass:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
```

## Pull requests

- Keep each pull request focused and explain its user-visible effect.
- Add or update tests for behavior changes.
- Do not commit API keys, exported conversations, databases, logs, build output, or personal paths.
- Keep provider network access in the Rust/Tauri layer. Frontend code must not receive raw API keys.
- Treat provider names and logos as third-party marks; do not imply endorsement.
- Update `CHANGELOG.md` for user-visible changes.

By submitting a contribution, you agree that it is licensed under Apache License 2.0.
