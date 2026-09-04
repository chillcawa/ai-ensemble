//! custom_openai.rs
//!
//! [Phase CP-1 MVP] ユーザーが追加した任意のOpenAI互換エンドポイント向けアダプタ。
//! 既存9社のアダプタ(openai.rs等)と同じChat Completions形式を前提とする。
//!
//! 既存アダプタとの違い:
//! - base_urlがユーザー入力(固定URLではない)
//! - APIキーが空欄でもよい(多くのローカルサーバーは認証不要)
//! - pricing推定は行わない(固定料金表が存在しないため、cost_usdは常にNone)

use crate::db;
use crate::dto::{ChatMessageDto, ChatResponseDto, StreamTokenEvent};
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};

/// base_urlの末尾スラッシュを正規化し、Chat Completionsのパスを組み立てる。
fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    format!("{trimmed}/chat/completions")
}

fn build_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> reqwest::RequestBuilder {
    let req = client.post(chat_completions_url(base_url)).json(body);
    // [Phase CP-1] APIキーが空の場合はAuthorizationヘッダ自体を付けない。
    // 多くのローカルサーバー(LM Studio/vLLM等)は認証不要で、
    // 空のBearerヘッダを送ると逆に拒否される実装がある。
    if api_key.is_empty() {
        req
    } else {
        req.bearer_auth(api_key)
    }
}

pub async fn chat(
    api_key: &str,
    base_url: &str,
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
        body["max_tokens"] = json!(limit);
    }
    if let Some(temp) = temperature {
        body["temperature"] = json!(temp);
    }

    let res = build_request(&client, base_url, api_key, &body)
        .send()
        .await
        .map_err(|e| format!("Custom provider request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Custom provider API error ({status}): {text}"));
    }

    let json_body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("failed to parse custom provider response: {e}"))?;

    let content = json_body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let input_tokens = json_body["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
    let output_tokens = json_body["usage"]["completion_tokens"].as_u64().map(|v| v as u32);

    Ok(ChatResponseDto {
        content,
        model: json_body["model"].as_str().unwrap_or(model).to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        // [Phase CP-1] Customプロバイダには固定料金表が無いため、costは常に未計上。
        cost_usd: None,
        pricing_basis: None,
        truncated: false,
    })
}

pub async fn stream(
    api_key: &str,
    base_url: &str,
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
    });
    if let Some(limit) = max_tokens {
        body["max_tokens"] = json!(limit);
    }
    if let Some(temp) = temperature {
        body["temperature"] = json!(temp);
    }

    let res = build_request(&client, base_url, api_key, &body)
        .send()
        .await
        .map_err(|e| format!("Custom provider request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Custom provider API error ({status}): {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buffer = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    // [Phase CP-1] チャンクの到着順。既存9社アダプタと同じ仕組み
    // (stream_runs / response_chunks)にそのまま乗せる。
    let mut sequence: i64 = 0;

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
                // [Phase CP-1] 既存アダプタと同じチャンク永続化フック。
                let _ = db::append_response_chunk(app, request_id, sequence, token);
                sequence += 1;
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

    if !buffer.trim().is_empty() {
        process_line(&buffer);
    }

    Ok(ChatResponseDto {
        content: full,
        model: model.to_string(),
        input_tokens,
        output_tokens,
        cache_hit_input_tokens: None,
        cache_miss_input_tokens: None,
        cost_usd: None,
        pricing_basis: None,
        truncated: false,
    })
}
