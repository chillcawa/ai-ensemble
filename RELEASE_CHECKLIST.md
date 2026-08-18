# Release checklist

Complete these gates before creating a public release tag. On Windows, double-click
`RUN_OSS_RELEASE_CHECK.bat` to generate the Rust lockfile and run the automated checks and build.

- [x] Run `RUN_OSS_RELEASE_CHECK.bat` on Windows and keep the generated `src-tauri/Cargo.lock` and
  rustfmt changes in the repository.
- [x] Confirm frontend verification: `npm ci && npm run verify`.
- [x] Confirm Rust formatting, tests, and Clippy pass with `--locked`.
- [x] Install the generated Windows NSIS package and confirm that the application launches and
  provider ordering works by button and drag.
- [ ] Confirm the macOS installer builds and launches on each advertised CPU architecture.
- [x] Scan the source archive and installer for credentials, exported conversations, databases,
  logs, and personal paths.
- [x] Verify `src-tauri/pricing.json` against the first-party links in `PRICING_SOURCES.md`.
- [x] Review the full `npm audit` advisory list; production high/critical and all critical findings
  are blocking. Record accepted development-only advisories instead of describing the full tree as clean.
- [x] Update `CHANGELOG.md`, version fields, installer artifact names, and the pricing review date when applicable.
- [x] Confirm macOS signing/notarization and Windows signing claims match the actual artifacts.
- [ ] Confirm GitHub Private Vulnerability Reporting is enabled for the repository.
