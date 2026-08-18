# Release checklist

Complete these gates before creating a public release tag. A previous build passing a gate does not
automatically validate a newer source archive; rerun release-critical checks on the final candidate.

## Current v1.3.4 candidate

- [x] Independent review confirms `tsc --noEmit` passes with 0 errors.
- [x] Independent review confirms all 5 frontend tests pass.
- [x] Independent review confirms `vite build` succeeds (92 modules).
- [x] Confirm `src/models/aiDisplay.ts` remains the single shared implementation for AI display identity/observation labels.
- [x] Launch the final candidate with `npm run tauri dev` and complete the Windows smoke test.
- [x] Generate the Windows NSIS installer from the final candidate.
- [x] Install the generated Windows NSIS package and confirm that the application launches.
- [x] Confirm the NSIS installer allows the user to choose an installation directory.
- [x] Confirm the installed ECHO application launches successfully after installation.
- [x] Confirm the repository `main` branch CI completes successfully (2/2 checks).
- [x] Create the GitHub `v1.3.4` release and attach the verified Windows installer.
- [x] Confirm README / README.en / CHANGELOG / NOTICE / Release notes are aligned with the ECHO v1.3.4 feature set.
- [x] Confirm the public repository is live and the published documentation is visible from GitHub.
- [ ] Run `RUN_OSS_RELEASE_CHECK.bat` again on the exact final public-source candidate after all documentation-only changes.
- [ ] Keep the generated `src-tauri/Cargo.lock` and any intentional rustfmt changes in the repository.
- [ ] Scan the exact final source archive and installer again for credentials, exported conversations, databases,
  logs, personal paths, and unexpected build artifacts.
- [ ] Review the final `npm audit` advisory list. Production high/critical and all critical findings are blocking.
- [ ] Verify `src-tauri/pricing.json` against the first-party links in `PRICING_SOURCES.md`.
- [ ] Confirm GitHub Private Vulnerability Reporting is enabled.

## Manual smoke test

- [x] First launch: language selector works in Japanese / English / Simplified Chinese / Korean.
- [x] First launch: both 18+ and notice-confirmation checks are required before starting.
- [x] Normal multi-AI send works and streams responses.
- [x] Provider identity warning appears on normal responses.
- [x] Conversation Log / saved Turns retain the identity warning.
- [x] Handoff confirmation appears before sending.
- [x] Handoff route shows the source → target relationship.
- [x] Handoff sends the required Reference and remains one hop only.
- [x] Handoff results are vertically presented and collapsible.
- [x] Claude long-response handling was independently reviewed and the previous low default output cap was corrected.
- [x] Archive-only content is not sent automatically.
- [x] Archive → Context Library → Reference → Set → Conversation enablement makes the intended content active.
- [x] Display currency supports USD / JPY / EUR / GBP / CNY / KRW.
- [x] Non-USD cost display uses the manually configured exchange rate; USD does not require a rate.
- [x] `↑ Top` appears after scrolling down and returns the page to the top.
- [x] Export/restore compatibility keeps legacy exchange fields readable while the new multi-currency UI remains active.
- [x] Provider ordering works by button and pointer drag.
- [x] Usage / Cost distinguishes local estimates from provider billing.

## macOS trial

- [ ] Confirm the macOS trial installer builds on Apple Silicon.
- [ ] Confirm the macOS trial installer builds on Intel.
- [ ] Confirm signing/notarization claims match the actual artifacts.

The macOS trial items may remain incomplete if only the Windows build is being published.
Do not advertise an untested macOS build as a verified release.

## Notes

- Documentation-only corrections after the initial `v1.3.4` publication do not change the Windows binary.
- The currently published Windows installer was built and smoke-tested before the final documentation alignment.
- Remaining unchecked items are publication-hardening / audit items, not known functional failures.
