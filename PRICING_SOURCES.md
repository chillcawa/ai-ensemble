# Pricing data sources

`src-tauri/pricing.json` contains static estimates, not billing records. Provider pricing can change at any time. The application deliberately leaves cost blank when the applicable plan, tier, or price is not known.

Last reviewed: **2026-08-16 (UTC)**.

- OpenAI models: <https://developers.openai.com/api/docs/pricing>
- Anthropic Claude: <https://platform.claude.com/docs/en/about-claude/pricing>
- DeepSeek: <https://api-docs.deepseek.com/quick_start/pricing/>
- Kimi K3: <https://platform.kimi.ai/docs/pricing/chat-k3>

The JPY display uses a configurable estimate whose default is 150 JPY/USD. It is not a live exchange rate. Taxes, cached-token rules, long-context multipliers, service tiers, regional processing, tools, and provider-specific adjustments may make the billed amount differ.

When changing a price:

1. Check the provider's first-party pricing page.
2. Update or add a model entry or effective-dated profile.
3. Update pricing tests and this review date.
4. Record the change in `CHANGELOG.md`.
