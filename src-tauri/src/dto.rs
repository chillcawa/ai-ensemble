use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageDto {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatResponseDto {
    pub content: String,
    pub model: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_hit_input_tokens: Option<u32>,
    pub cache_miss_input_tokens: Option<u32>,
    pub cost_usd: Option<f64>,
    pub pricing_basis: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamTokenEvent {
    pub request_id: String,
    pub token: String,
}
