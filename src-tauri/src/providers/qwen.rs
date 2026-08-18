use crate::dto::{ChatMessageDto, ChatResponseDto, StreamTokenEvent};
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};

// Singapore International legacy compatibility domain. Alibaba documents that
// it remains functional; it avoids requiring a Workspace ID for the first live
// integration and is the deployment scope that can receive the free quota.
const CHAT_URL: &str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

fn usage(value: &serde_json::Value) -> (Option<u32>, Option<u32>) {
    (
        value["prompt_tokens"].as_u64().map(|v| v as u32),
        value["completion_tokens"].as_u64().map(|v| v as u32),
    )
}

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
    if let Some(value) = temperature {
        body["temperature"] = json!(value);
    }

    let response = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Qwen request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Qwen API error ({status}): {text}"));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Qwen response: {e}"))?;
    let content = value["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let (input_tokens, output_tokens) = usage(&value["usage"]);

    Ok(ChatResponseDto {
        content,
        model: value["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        // Free quota and billing state are not returned by inference responses.
        cost_usd: None,
        pricing_basis: Some(
            "Alibaba Cloud Model Studio / free-quota state unknown — verify in console".into(),
        ),
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
    if let Some(value) = temperature {
        body["temperature"] = json!(value);
    }

    let response = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Qwen stream request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Qwen stream error ({status}): {text}"));
    }

    let mut stream = response.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens = None;
    let mut output_tokens = None;

    let mut process_line = |line: &str| {
        let line = line.trim();
        let Some(payload) = line.strip_prefix("data:") else {
            return;
        };
        let payload = payload.trim();
        if payload.is_empty() || payload == "[DONE]" {
            return;
        }
        if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(payload) {
            if let Some(token) = chunk["choices"]
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
            if let Some(value) = chunk.get("usage").filter(|value| !value.is_null()) {
                let parsed = usage(value);
                input_tokens = parsed.0;
                output_tokens = parsed.1;
            }
        }
    };

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Qwen stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].to_string();
            buffer.drain(..=pos);
            process_line(&line);
        }
    }
    if !buffer.trim().is_empty() {
        let line = buffer.clone();
        process_line(&line);
    }

    Ok(ChatResponseDto {
        content: full,
        model: model.to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd: None,
        pricing_basis: Some(
            "Alibaba Cloud Model Studio / free-quota state unknown — verify in console".into(),
        ),
        truncated: false,
    })
}
