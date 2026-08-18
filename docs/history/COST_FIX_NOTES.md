# Cost/Usage fix

## Cause
The pricing pipeline already existed, but the Tauri streaming parsers only processed SSE lines ending in `\n`. If the final `data:` event arrived without a trailing newline, usage could be left unset. The UI then had nothing to display for tokens/cost.

## Changes
- OpenAI streaming parser processes the final leftover SSE line.
- Anthropic streaming parser processes the final leftover SSE line.
- Completed responses now always show a usage/cost status line.
- Added local Rust unit tests for pricing calculation and unknown models.

## Existing pricing table
The existing `src-tauri/src/pricing.rs` remains the source of estimated cost:
- GPT-4o: $2.50 / 1M input, $10.00 / 1M output
- Claude Sonnet 5: $2.00 / 1M input, $10.00 / 1M output

These are estimates, not provider billing records.
