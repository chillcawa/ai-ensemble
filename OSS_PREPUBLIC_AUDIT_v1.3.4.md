# OSS pre-publication audit — v1.3.4

Audit date: 2026-08-16

## Decision

Source publication: **pass**.

The source is ready for publication as a public GitHub repository. The Windows NSIS build and
launch gate passed. Do not attach macOS binaries until their architecture-specific build and launch
checks are complete.

## Verified in the source workspace

- `npm run typecheck`: passed.
- Vitest: 2 files, 5 tests passed.
- Vite production build: passed.
- `npm audit --omit=dev --audit-level=high`: passed with no reported production vulnerability.
- The complete dependency-tree audit currently reports development-tool advisories, including a
  high-severity Vite development-server advisory. These packages are not shipped in the Tauri
  runtime bundle. CI displays the complete report and blocks critical findings; the separate
  production audit blocks high and critical findings.
- No `.env`, database, SQLite, log, private-key, installer, or exported archive file is included in
  the publication package.
- No API-key-shaped value or common absolute user-home path was found by the source scan.
- Apache-2.0 licensing, notice, contribution, conduct, security, trademark, roadmap, pricing-source,
  changelog, and release-checklist documents are present.
- CI action references are immutable commit SHAs.
- CI requires a committed Cargo lockfile and runs Rust formatting, tests, and Clippy with `--locked`.
- `src-tauri/Cargo.lock` is present and records the dependency set used by the verified Windows run.
- Windows Rust tests: 6 passed.
- Windows Clippy with warnings denied: passed.
- Windows NSIS build, executable privacy/subsystem scan, installation, application launch, and
  provider-order button/drag behavior: passed.
- The application icon was generated with assistance from ChatGPT and adopted by the project maintainers; its
  provenance is recorded in `NOTICE`.

## Remaining release administration

1. Create the public GitHub repository and confirm its CI run passes.
2. Enable GitHub Private Vulnerability Reporting.
3. Build and launch-check Apple Silicon and Intel artifacts before attaching macOS binaries to a
   release. The source repository and verified Windows build do not depend on this optional binary
   publication step.

The Windows gate uses a short, non-Desktop Cargo target directory and a single Cargo build job to
reduce path-length and transient linker-lock failures. Antivirus exclusions are not required by the
documented procedure.

## Current limitation

The audit workspace does not provide a macOS runtime. macOS binary launch behavior is deliberately
not marked as verified here.
