use serde::Deserialize;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Deserialize)]
pub struct ModelPricing {
    pub input_per_million: f64,
    pub output_per_million: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PeakPricing {
    pub utc_windows: Vec<[u32; 2]>,
    pub multiplier: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PricingProfile {
    pub effective_from_unix: u64,
    pub label: String,
    pub cache_hit_input_per_million: f64,
    pub cache_miss_input_per_million: f64,
    pub output_per_million: f64,
    pub peak: Option<PeakPricing>,
}

#[derive(Debug, Clone, Deserialize)]
struct PricingConfig {
    pub models: HashMap<String, ModelPricing>,
    #[serde(default)]
    pub profiles: HashMap<String, Vec<PricingProfile>>,
}

#[derive(Debug, Clone)]
pub struct CostCalculation {
    pub cost_usd: f64,
    pub basis: String,
}

fn config() -> PricingConfig {
    serde_json::from_str(include_str!("../pricing.json"))
        .expect("pricing.json must contain valid pricing configuration")
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn utc_hour(unix_seconds: u64) -> u32 {
    ((unix_seconds % 86_400) / 3_600) as u32
}

fn is_peak(profile: &PricingProfile, unix_seconds: u64) -> bool {
    let Some(peak) = &profile.peak else {
        return false;
    };
    let hour = utc_hour(unix_seconds);
    peak.utc_windows
        .iter()
        .any(|window| hour >= window[0] && hour < window[1])
}

fn active_profile(provider: &str, model: &str, unix_seconds: u64) -> Option<PricingProfile> {
    let key = format!("{provider}:{model}");
    let mut profiles = config().profiles.get(&key)?.clone();
    profiles.sort_by_key(|profile| profile.effective_from_unix);
    profiles
        .into_iter()
        .rfind(|profile| profile.effective_from_unix <= unix_seconds)
}

pub fn lookup(provider: &str, model: &str) -> Option<ModelPricing> {
    config().models.get(&format!("{provider}:{model}")).cloned()
}

/// Actual/request-level cost calculation.
///
/// For cache-aware providers, callers should pass provider-returned cache hit/miss
/// token counts. If the breakdown is unavailable, all input tokens are treated as
/// cache misses and the basis string explicitly says so.
pub fn calculate_cost_usd_at(
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cache_hit_input_tokens: Option<u32>,
    cache_miss_input_tokens: Option<u32>,
    unix_seconds: u64,
) -> Option<CostCalculation> {
    if let Some(profile) = active_profile(provider, model, unix_seconds) {
        let exact_breakdown = cache_hit_input_tokens.is_some() && cache_miss_input_tokens.is_some();
        let (hit, miss) = match (cache_hit_input_tokens, cache_miss_input_tokens) {
            (Some(hit), Some(miss)) => (hit, miss),
            _ => (0, input_tokens),
        };

        let multiplier = if is_peak(&profile, unix_seconds) {
            profile
                .peak
                .as_ref()
                .map(|peak| peak.multiplier)
                .unwrap_or(1.0)
        } else {
            1.0
        };
        let period = if profile.peak.is_some() {
            if multiplier > 1.0 {
                "peak"
            } else {
                "off-peak"
            }
        } else {
            "standard"
        };

        let cost = (hit as f64 / 1_000_000.0) * profile.cache_hit_input_per_million * multiplier
            + (miss as f64 / 1_000_000.0) * profile.cache_miss_input_per_million * multiplier
            + (output_tokens as f64 / 1_000_000.0) * profile.output_per_million * multiplier;

        let breakdown = if exact_breakdown {
            "cache-exact"
        } else {
            "cache-miss-estimate"
        };
        return Some(CostCalculation {
            cost_usd: cost,
            basis: format!("{} / {} / {}", profile.label, period, breakdown),
        });
    }

    let pricing = lookup(provider, model)?;
    Some(CostCalculation {
        cost_usd: (input_tokens as f64 / 1_000_000.0) * pricing.input_per_million
            + (output_tokens as f64 / 1_000_000.0) * pricing.output_per_million,
        basis: "fixed-rate".into(),
    })
}

pub fn calculate_cost_usd(
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cache_hit_input_tokens: Option<u32>,
    cache_miss_input_tokens: Option<u32>,
) -> Option<CostCalculation> {
    calculate_cost_usd_at(
        provider,
        model,
        input_tokens,
        output_tokens,
        cache_hit_input_tokens,
        cache_miss_input_tokens,
        now_unix(),
    )
}

/// Pre-send estimate. Cache state is unknowable before the request, so cache-aware
/// profiles deliberately assume cache miss. This is conservative and explicit.
pub fn estimate_cost_usd(
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
) -> Option<f64> {
    calculate_cost_usd(provider, model, input_tokens, output_tokens, None, None)
        .map(|calculation| calculation.cost_usd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_fixed_cost_from_tokens() {
        let cost = estimate_cost_usd("openai", "gpt-4o", 1_000_000, 1_000_000).unwrap();
        assert!((cost - 12.50).abs() < f64::EPSILON);
    }

    #[test]
    fn deepseek_pre_change_uses_exact_cache_split() {
        let calc = calculate_cost_usd_at(
            "deepseek",
            "deepseek-v4-flash",
            1_000_000,
            1_000_000,
            Some(500_000),
            Some(500_000),
            1_786_895_999,
        )
        .unwrap();
        let expected = 0.5 * 0.0028 + 0.5 * 0.14 + 0.28;
        assert!((calc.cost_usd - expected).abs() < 1e-12);
        assert!(calc.basis.contains("cache-exact"));
    }

    #[test]
    fn deepseek_post_change_switches_peak_by_utc_hour() {
        // Effective timestamp itself is 2026-08-16 16:00 UTC: off-peak.
        let off_peak = calculate_cost_usd_at(
            "deepseek",
            "deepseek-v4-pro",
            1_000_000,
            1_000_000,
            Some(0),
            Some(1_000_000),
            1_786_896_000,
        )
        .unwrap();
        assert!((off_peak.cost_usd - (0.66 + 1.98)).abs() < 1e-12);
        assert!(off_peak.basis.contains("off-peak"));

        // 2026-08-17 01:00 UTC: peak.
        let peak = calculate_cost_usd_at(
            "deepseek",
            "deepseek-v4-pro",
            1_000_000,
            1_000_000,
            Some(0),
            Some(1_000_000),
            1_786_928_400,
        )
        .unwrap();
        assert!((peak.cost_usd - (1.32 + 3.96)).abs() < 1e-12);
        assert!(peak.basis.contains("peak"));
    }

    #[test]
    fn unknown_model_returns_none() {
        assert!(estimate_cost_usd("openai", "unknown-model", 100, 100).is_none());
    }
}
