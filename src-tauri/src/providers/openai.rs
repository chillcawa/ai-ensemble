use crate::dto::{ChatMessageDto, ChatResponseDto, StreamTokenEvent};
use crate::pricing;
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};

const CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";

fn is_reasoning_family(model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    lower.starts_with("gpt-5")
        || lower.starts_with("o1")
        || lower.starts_with("o3")
        || lower.starts_with("o4")
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
    });
    if let Some(limit) = max_tokens {
        if is_reasoning_family(model) {
            body["max_completion_tokens"] = json!(limit);
        } else {
            body["max_tokens"] = json!(limit);
        }
    }
    // Reasoning families may reject the legacy temperature parameter.
    if let Some(temp) = temperature {
        if !is_reasoning_family(model) {
            body["temperature"] = json!(temp);
        }
    }

    let res = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({status}): {text}"));
    }

    let json_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("failed to parse OpenAI response: {e}"))?;

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
    let cost_usd = match (input_tokens, output_tokens) {
        (Some(i), Some(o)) => pricing::estimate_cost_usd("openai", model, i, o),
        _ => None,
    };

    Ok(ChatResponseDto {
        content,
        model: json_body["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd,
        pricing_basis: Some("fixed-rate".into()),
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
        // usage集計をストリームの最終チャンクに含めてもらう
        "stream_options": { "include_usage": true },
    });
    if let Some(limit) = max_tokens {
        if is_reasoning_family(model) {
            body["max_completion_tokens"] = json!(limit);
        } else {
            body["max_tokens"] = json!(limit);
        }
    }
    if let Some(temp) = temperature {
        if !is_reasoning_family(model) {
            body["temperature"] = json!(temp);
        }
    }

    let res = client
        .post(CHAT_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI stream request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI stream error ({status}): {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;

    // SSEは最後のdata行に改行が付かない場合がある。
    // その場合、従来の「\nが来るまで処理」だけでは最終usageを取りこぼす。
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
                .and_then(|c| c["delta"]["content"].as_str())
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
            if let Some(usage) = json_chunk.get("usage") {
                input_tokens = usage["prompt_tokens"].as_u64().map(|v| v as u32);
                output_tokens = usage["completion_tokens"].as_u64().map(|v| v as u32);
            }
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
        (Some(i), Some(o)) => pricing::estimate_cost_usd("openai", model, i, o),
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
        truncated: false,
    })
}

const RESPONSES_URL: &str = "https://api.openai.com/v1/responses";

fn split_responses_input(messages: &[ChatMessageDto]) -> (Option<String>, Vec<serde_json::Value>) {
    let instructions = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    let input = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect::<Vec<_>>();

    (
        if instructions.is_empty() {
            None
        } else {
            Some(instructions)
        },
        input,
    )
}

fn build_responses_body(
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: bool,
) -> serde_json::Value {
    let (instructions, input) = split_responses_input(messages);
    let mut body = json!({
        "model": model,
        "input": input,
    });
    if let Some(instructions) = instructions {
        body["instructions"] = json!(instructions);
    }
    if let Some(limit) = max_tokens {
        body["max_output_tokens"] = json!(limit);
    }
    if let Some(temp) = temperature {
        if !is_reasoning_family(model) {
            body["temperature"] = json!(temp);
        }
    }
    if stream {
        body["stream"] = json!(true);
    }
    body
}

fn extract_responses_text(body: &serde_json::Value) -> String {
    body["output"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["type"] == "message")
                .filter_map(|item| item["content"].as_array())
                .flatten()
                .filter(|part| part["type"] == "output_text")
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

pub async fn responses_chat(
    api_key: &str,
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<ChatResponseDto, String> {
    let client = reqwest::Client::new();
    let body = build_responses_body(model, messages, max_tokens, temperature, false);

    let res = client
        .post(RESPONSES_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI Responses request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI Responses API error ({status}): {text}"));
    }

    let json_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("failed to parse OpenAI Responses response: {e}"))?;

    let content = extract_responses_text(&json_body);
    let input_tokens = json_body["usage"]["input_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let output_tokens = json_body["usage"]["output_tokens"]
        .as_u64()
        .map(|v| v as u32);
    let cost_usd = match (input_tokens, output_tokens) {
        (Some(i), Some(o)) => pricing::estimate_cost_usd("openai", model, i, o),
        _ => None,
    };

    Ok(ChatResponseDto {
        content,
        model: json_body["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd,
        pricing_basis: Some("fixed-rate".into()),
        truncated: false,
    })
}

pub async fn responses_stream(
    api_key: &str,
    model: &str,
    messages: &[ChatMessageDto],
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    app: &AppHandle,
    request_id: &str,
) -> Result<ChatResponseDto, String> {
    let client = reqwest::Client::new();
    let body = build_responses_body(model, messages, max_tokens, temperature, true);

    let res = client
        .post(RESPONSES_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI Responses stream request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI Responses stream error ({status}): {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut response_model = model.to_string();
    let mut stream_error: Option<String> = None;

    let mut process_line = |line: &str| {
        let line = line.trim();
        let Some(payload) = line.strip_prefix("data:") else {
            return;
        };
        let payload = payload.trim();
        if payload.is_empty() || payload == "[DONE]" {
            return;
        }
        let Ok(event) = serde_json::from_str::<serde_json::Value>(payload) else {
            return;
        };
        match event["type"].as_str() {
            Some("response.output_text.delta") => {
                if let Some(delta) = event["delta"].as_str() {
                    full.push_str(delta);
                    let _ = app.emit(
                        "stream-token",
                        StreamTokenEvent {
                            request_id: request_id.to_string(),
                            token: delta.to_string(),
                        },
                    );
                }
            }
            Some("response.completed") | Some("response.done") => {
                let response = &event["response"];
                if let Some(v) = response["usage"]["input_tokens"].as_u64() {
                    input_tokens = Some(v as u32);
                }
                if let Some(v) = response["usage"]["output_tokens"].as_u64() {
                    output_tokens = Some(v as u32);
                }
                if let Some(v) = response["model"].as_str() {
                    response_model = v.to_string();
                }
                if full.is_empty() {
                    full = extract_responses_text(response);
                }
            }
            Some("error") => {
                stream_error = Some(
                    event["message"]
                        .as_str()
                        .or_else(|| event["error"]["message"].as_str())
                        .unwrap_or("unknown Responses streaming error")
                        .to_string(),
                );
            }
            Some("response.failed") => {
                stream_error = Some(
                    event["response"]["error"]["message"]
                        .as_str()
                        .unwrap_or("OpenAI Responses request failed")
                        .to_string(),
                );
            }
            _ => {}
        }
    };

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Responses stream read error: {e}"))?;
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

    if let Some(error) = stream_error {
        return Err(error);
    }

    let cost_usd = match (input_tokens, output_tokens) {
        (Some(i), Some(o)) => pricing::estimate_cost_usd("openai", model, i, o),
        _ => None,
    };

    Ok(ChatResponseDto {
        content: full,
        model: response_model,
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd,
        pricing_basis: Some("fixed-rate".into()),
        truncated: false,
    })
}
