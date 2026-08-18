use crate::dto::{ChatMessageDto, ChatResponseDto, StreamTokenEvent};
use crate::pricing;
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};

const CHAT_URL: &str = "https://api.deepseek.com/chat/completions";

pub async fn chat(
    api_key: &str,
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<ChatResponseDto, String> {
    let client = reqwest::Client::new();
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": false,
    });

    if let Some(limit) = max_tokens {
        body["max_tokens"] = json!(limit);
    }
    if let Some(temp) = temperature {
        body["temperature"] = json!(temp);
    }

    let res = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepSeek request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("DeepSeek API error ({status}): {text}"));
    }

    let json_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("failed to parse DeepSeek response: {e}"))?;

    // DeepSeek thinking mode may also return reasoning_content.
    // AI Ensemble intentionally stores/displays only the final answer content here.
    let content = json_body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let input_tokens = json_body["usage"]["prompt_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let output_tokens = json_body["usage"]["completion_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let cache_hit_input_tokens = json_body["usage"]["prompt_cache_hit_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let cache_miss_input_tokens = json_body["usage"]["prompt_cache_miss_tokens"]
        .as_u64()
        .map(|v| v as u32);

    let calculation = match (input_tokens, output_tokens) {
        (Some(input), Some(output)) => pricing::calculate_cost_usd(
            "deepseek",
            model,
            input,
            output,
            cache_hit_input_tokens,
            cache_miss_input_tokens,
        ),
        _ => None,
    };

    Ok(ChatResponseDto {
        content,
        model: json_body["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens,
        cache_miss_input_tokens,
        cost_usd: calculation.as_ref().map(|value| value.cost_usd),
        pricing_basis: calculation.map(|value| value.basis),
        truncated: false,
    })
}

pub async fn stream(
    api_key: &str,
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    app: &AppHandle,
    request_id: &str,
) -> Result<ChatResponseDto, String> {
    let client = reqwest::Client::new();
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    if let Some(limit) = max_tokens {
        body["max_tokens"] = json!(limit);
    }
    if let Some(temp) = temperature {
        body["temperature"] = json!(temp);
    }

    let res = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepSeek stream request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("DeepSeek stream error ({status}): {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut cache_hit_input_tokens: Option<u32> = None;
    let mut cache_miss_input_tokens: Option<u32> = None;

    let mut process_line = |line: &str| {
        let line = line.trim();
        let Some(payload) = line.strip_prefix("data:") else {
            return;
        };
        let payload = payload.trim();
        if payload == "[DONE]" || payload.is_empty() {
            return;
        }

        if let Ok(json_chunk) = serde_json::from_str::<serde_json::Value>(payload) {
            if let Some(token) = json_chunk["choices"]
                .get(0)
                .and_then(|choice| choice["delta"]["content"].as_str())
            {
                full.push_str(token);
                let _ = app.emit(
                    "stream-token",
                    StreamTokenEvent {
                        request_id: request_id.to_string(),
                        token: token.to_string(),
                    },
                );
            }

            if let Some(usage) = json_chunk.get("usage").filter(|value| !value.is_null()) {
                input_tokens = usage["prompt_tokens"].as_u64().map(|v| v as u32);
                output_tokens = usage["completion_tokens"].as_u64().map(|v| v as u32);
                cache_hit_input_tokens =
                    usage["prompt_cache_hit_tokens"].as_u64().map(|v| v as u32);
                cache_miss_input_tokens =
                    usage["prompt_cache_miss_tokens"].as_u64().map(|v| v as u32);
            }
        }
    };

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("DeepSeek stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].to_string();
            buffer.drain(..=pos);
            process_line(&line);
        }
    }

    if !buffer.trim().is_empty() {
        process_line(&buffer);
    }

    let calculation = match (input_tokens, output_tokens) {
        (Some(input), Some(output)) => pricing::calculate_cost_usd(
            "deepseek",
            model,
            input,
            output,
            cache_hit_input_tokens,
            cache_miss_input_tokens,
        ),
        _ => None,
    };

    Ok(ChatResponseDto {
        content: full,
        model: model.to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens,
        cache_miss_input_tokens,
        cost_usd: calculation.as_ref().map(|value| value.cost_usd),
        pricing_basis: calculation.map(|value| value.basis),
        truncated: false,
    })
}
