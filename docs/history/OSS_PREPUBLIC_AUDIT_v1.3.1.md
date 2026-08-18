# AI Ensemble v1.3.1 — OSS pre-publication audit

Audit date: 2026-08-16 (JST)

## Result

**Source publication candidate: pass with two release gates remaining.** The source tree is suitable for repository creation after the gates in `RELEASE_CHECKLIST.md` are completed. Do not create a binary release yet.

## Changes completed

| Area | Result |
|---|---|
| License and public policy | Added Apache-2.0, NOTICE, contribution, security, conduct, trademark, roadmap, changelog, and release guidance |
| Secrets and private data | No embedded credential, private key, exported conversation, personal path, real name, or company identifier found by the configured scans; public fixtures were genericized |
| Credential architecture | Removed unused browser-side OpenAI and Anthropic clients; raw keys remain in the Rust/Tauri credential path |
| External URL opening | Replaced prefix-only validation with parsed HTTPS URLs, exact host matching, credential/port rejection, and shell-free Windows execution |
| Frontend policy | Added a restrictive Tauri CSP |
| CI supply chain | Pinned official GitHub actions to full commit SHAs and removed mutable third-party Rust setup/cache actions |
| Tests | Wired provider-registry validation to Vitest and expanded expected live providers from five to nine |
| Localization | Corrected the two sending-state lookup mismatches; literal translation calls now resolve against the English dictionary |
| Pricing | Added first-party source documentation and corrected current OpenAI GPT-5.6 Terra/Luna rates |
| Repository hygiene | Expanded ignore rules and moved 78 historical implementation notes under `docs/history/` |

## Verification performed

- `npm ci` / lockfile consistency: prepared and repeated in the publication candidate
- `npm run typecheck`: pass
- `npm test`: pass (1 test file, 1 test)
- `npm run build`: pass
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities
- Tauri configuration discovery: pass; CSP detected
- Frontend direct-network scan: no `fetch()` calls found
- Credential-pattern and personal-path scan: no match in publication files

## Release gates not executable in this environment

1. **Generate and commit `src-tauri/Cargo.lock`.** This environment has no Rust/Cargo installation. The included CI job generates a candidate lockfile and uploads it as an artifact; commit that file and rerun Rust checks with `--locked`.
2. **Build and launch installers on advertised targets.** Confirm Windows NSIS and both macOS CPU builds, including signature/notarization wording and the hardened official-provider links.

These are release gates, not reasons to hide the source. The source repository can be created first, but the public release tag and binary attachments should wait.

## Identity and project metadata

No personal name, email address, or repository URL was invented. Copyright is attributed to “AI Ensemble contributors.” Add a repository URL only after the canonical public repository exists.
