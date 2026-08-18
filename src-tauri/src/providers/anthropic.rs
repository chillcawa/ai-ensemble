use crate::dto::{ChatMessageDto, ChatResponseDto, StreamTokenEvent};
use crate::pricing;
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};

const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

fn split_system(messages: &[ChatMessageDto]) -> (Option<String>, Vec<serde_json::Value>) {
    let system: Vec<&str> = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect();

    let rest: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let system_joined = if system.is_empty() {
        None
    } else {
        Some(system.join("\n\n"))
    };

    (system_joined, rest)
}

// AnthropicのAPIは値の無いフィールドを"null"のまま送ると拒否する
// (例: "temperature": null → 400 Bad Request)。
// 値があるフィールドだけbodyに足す方式に統一する。
fn build_body(
    model: &str,
    system: &Option<String>,
    msgs: &[serde_json::Value],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: bool,
) -> serde_json::Value {
    let mut body = json!({
        "model": model,
        "messages": msgs,
        "max_tokens": max_tokens.unwrap_or(8192),
    });
    if let Some(sys) = system {
        body["system"] = json!(sys);
    }
    if let Some(temp) = temperature {
        body["temperature"] = json!(temp);
    }
    if stream {
        body["stream"] = json!(true);
    }
    body
}

pub async fn chat(
    api_key: &str,
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<ChatResponseDto, String> {
    let (system, msgs) = split_system(messages);
    let client = reqwest::Client::new();
    let body = build_body(model, &system, &msgs, max_tokens, temperature, false);

    let res = client
        .post(MESSAGES_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({status}): {text}"));
    }

    let json_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("failed to parse Anthropic response: {e}"))?;

    let content = json_body["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    let input_tokens = json_body["usage"]["input_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let output_tokens = json_body["usage"]["output_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let cost_usd = match (input_tokens, output_tokens) {
        (Some(i), Some(o)) => pricing::estimate_cost_usd("anthropic", model, i, o),
        _ => None,
    };
    let truncated = json_body["stop_reason"].as_str() == Some("max_tokens");

    Ok(ChatResponseDto {
        content,
        model: json_body["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd,
        pricing_basis: Some("fixed-rate".into()),
        truncated,
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
    let (system, msgs) = split_system(messages);
    let client = reqwest::Client::new();
    let body = build_body(model, &system, &msgs, max_tokens, temperature, true);

    let res = client
        .post(MESSAGES_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic stream request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic stream error ({status}): {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut truncated = false;

    // SSEは最後のdata行に改行が付かない場合があるため、
    // 最終行も必ず処理してusageを取りこぼさない。
    let mut process_line = |line: &str| {
        let line = line.trim();
        let Some(payload) = line.strip_prefix("data:") else {
            return;
        };
        let payload = payload.trim();
        if payload.is_empty() {
            return;
        }
        let Ok(json_chunk) = serde_json::from_str::<serde_json::Value>(payload) else {
            return;
        };

        match json_chunk["type"].as_str() {
            Some("content_block_delta") if json_chunk["delta"]["type"] == "text_delta" => {
                if let Some(token) = json_chunk["delta"]["text"].as_str() {
                    full.push_str(token);
                    let _ = app.emit(
                        "stream-token",
                        StreamTokenEvent {
                            request_id: request_id.to_string(),
                            token: token.to_string(),
                        },
                    );
                }
            }
            // message_start: 最初のinput_tokensが載ってる
            Some("message_start") => {
                if let Some(v) = json_chunk["message"]["usage"]["input_tokens"].as_u64() {
                    input_tokens = Some(v as u32);
                }
            }
            // message_delta: 最終的なoutput_tokensが載ってる
            Some("message_delta") => {
                if let Some(v) = json_chunk["usage"]["output_tokens"].as_u64() {
                    output_tokens = Some(v as u32);
                }
                if json_chunk["delta"]["stop_reason"].as_str() == Some("max_tokens") {
                    truncated = true;
                }
            }
            _ => {}
        }
    };

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].to_string();
            buffer.drain(..=pos);
            process_line(&line);
        }
    }

    // 改行なしで残った最終data行も必ず処理する。
    if !buffer.trim().is_empty() {
        process_line(&buffer);
    }

    let cost_usd = match (input_tokens, output_tokens) {
        (Some(i), Some(o)) => pricing::estimate_cost_usd("anthropic", model, i, o),
        _ => None,
    };

    Ok(ChatResponseDto {
        content: full,
        model: model.to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd,
        pricing_basis: Some("fixed-rate".into()),
        truncated,
    })
}
