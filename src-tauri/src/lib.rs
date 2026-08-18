mod db;
mod dto;
mod keychain;
mod pricing;
mod providers;

use dto::{ChatMessageDto, ChatResponseDto};

#[tauri::command]
fn save_api_key(provider: String, key: String) -> Result<(), String> {
    keychain::save_secret(&provider, &key)
}

#[tauri::command]
fn has_api_key(provider: String) -> Result<bool, String> {
    Ok(keychain::get_secret(&provider)?.is_some())
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    keychain::delete_secret(&provider)
}

fn require_key(provider: &str) -> Result<String, String> {
    keychain::get_secret(provider)?
        .ok_or_else(|| format!("no API key saved for provider '{provider}'"))
}

fn validate_model_for_current_adapter(
    provider: &str,
    model: &str,
    api_mode: Option<&str>,
) -> Result<(), String> {
    let lower = model.to_ascii_lowercase();
    if provider == "openai" {
        let mode = api_mode.unwrap_or("chat_completions");
        if mode == "responses" {
            // v0.8.1 supports plain text Responses requests. Agent/specialized workflows
            // remain intentionally outside this adapter even though they also use /responses.
            let specialized = [
                "deep-research",
                "computer-use",
                "search-preview",
                "codex",
                "realtime",
                "audio",
                "image",
            ];
            if specialized.iter().any(|x| lower.contains(x)) {
                return Err(format!(
                    "OpenAI model '{model}' requires a specialized Responses/tool workflow that AI Ensemble v0.8.1 does not execute yet."
                ));
            }
            return Ok(());
        }

        let unsupported_chat = [
            "-pro",
            "codex",
            "deep-research",
            "computer-use",
            "realtime",
            "audio",
            "image",
            "search-preview",
        ];
        if unsupported_chat.iter().any(|x| lower.contains(x)) {
            return Err(format!(
                "OpenAI model '{model}' is not supported by the Chat Completions adapter. Select its Responses API mode instead."
            ));
        }
    }
    Ok(())
}

#[tauri::command]
async fn chat_completion(
    app: tauri::AppHandle,
    provider: String,
    model: String,
    messages: Vec<ChatMessageDto>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    api_mode: Option<String>,
) -> Result<ChatResponseDto, String> {
    let key = require_key(&provider)?;
    validate_model_for_current_adapter(&provider, &model, api_mode.as_deref())?;
    let started = std::time::Instant::now();
    let result = match provider.as_str() {
        "openai" => {
            if api_mode.as_deref() == Some("responses") {
                providers::openai::responses_chat(&key, &model, &messages, max_tokens, temperature)
                    .await
            } else {
                providers::openai::chat(&key, &model, &messages, max_tokens, temperature).await
            }
        }
        "anthropic" => {
            providers::anthropic::chat(&key, &model, &messages, max_tokens, temperature).await
        }
        "deepseek" => {
            providers::deepseek::chat(&key, &model, &messages, max_tokens, temperature).await
        }
        "kimi" => providers::kimi::chat(&key, &model, &messages, max_tokens, temperature).await,
        "google" => providers::gemini::chat(&key, &model, &messages, max_tokens, temperature).await,
        "qwen" => providers::qwen::chat(&key, &model, &messages, max_tokens, temperature).await,
        "mistral" => {
            providers::mistral::chat(&key, &model, &messages, max_tokens, temperature).await
        }
        "cohere" => providers::cohere::chat(&key, &model, &messages, max_tokens, temperature).await,
        "xai" => providers::xai::chat(&key, &model, &messages, max_tokens, temperature).await,
        other => Err(format!("unknown provider '{other}'")),
    }?;

    db::record(
        &app,
        &provider,
        &result.model,
        result.input_tokens,
        result.output_tokens,
        result.cache_hit_input_tokens,
        result.cache_miss_input_tokens,
        result.cost_usd,
        result.pricing_basis.as_deref(),
        Some(started.elapsed().as_millis() as u64),
    )?;

    Ok(result)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn stream_chat_completion(
    app: tauri::AppHandle,
    request_id: String,
    provider: String,
    model: String,
    messages: Vec<ChatMessageDto>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    api_mode: Option<String>,
) -> Result<ChatResponseDto, String> {
    let key = require_key(&provider)?;
    validate_model_for_current_adapter(&provider, &model, api_mode.as_deref())?;
    let started = std::time::Instant::now();
    let result = match provider.as_str() {
        "openai" => {
            if api_mode.as_deref() == Some("responses") {
                providers::openai::responses_stream(
                    &key,
                    &model,
                    &messages,
                    max_tokens,
                    temperature,
                    &app,
                    &request_id,
                )
                .await
            } else {
                providers::openai::stream(
                    &key,
                    &model,
                    &messages,
                    max_tokens,
                    temperature,
                    &app,
                    &request_id,
                )
                .await
            }
        }
        "anthropic" => {
            providers::anthropic::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "deepseek" => {
            providers::deepseek::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "kimi" => {
            providers::kimi::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "google" => {
            providers::gemini::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "qwen" => {
            providers::qwen::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "mistral" => {
            providers::mistral::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "cohere" => {
            providers::cohere::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        "xai" => {
            providers::xai::stream(
                &key,
                &model,
                &messages,
                max_tokens,
                temperature,
                &app,
                &request_id,
            )
            .await
        }
        other => Err(format!("unknown provider '{other}'")),
    }?;

    db::record(
        &app,
        &provider,
        &result.model,
        result.input_tokens,
        result.output_tokens,
        result.cache_hit_input_tokens,
        result.cache_miss_input_tokens,
        result.cost_usd,
        result.pricing_basis.as_deref(),
        Some(started.elapsed().as_millis() as u64),
    )?;

    Ok(result)
}

#[derive(Debug, Clone, serde::Deserialize)]
struct CostEstimateTarget {
    provider: String,
    model: String,
}

#[derive(Debug, Clone, serde::Serialize)]
struct CostEstimate {
    provider: String,
    model: String,
    input_tokens: u32,
    max_output_tokens: u32,
    max_cost_usd: Option<f64>,
}

#[tauri::command]
fn estimate_send_cost(
    targets: Vec<CostEstimateTarget>,
    input_tokens: u32,
    max_output_tokens: u32,
) -> Result<Vec<CostEstimate>, String> {
    Ok(targets
        .into_iter()
        .map(|target| CostEstimate {
            input_tokens,
            max_output_tokens,
            max_cost_usd: pricing::estimate_cost_usd(
                &target.provider,
                &target.model,
                input_tokens,
                max_output_tokens,
            ),
            provider: target.provider,
            model: target.model,
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AvailableModelInfo {
    id: String,
    name: String,
    max_context_tokens: Option<u32>,
    api_modes: Vec<String>,
    preferred_api_mode: Option<String>,
    streaming: bool,
    vision: bool,
    tools: bool,
    audio_input: bool,
    audio_output: bool,
    available_now: bool,
    unavailable_reason: Option<String>,
    capability_source: String,
    performance_class: String,
}

#[derive(Debug, Clone)]
struct InferredCapabilities {
    api_modes: Vec<String>,
    preferred_api_mode: Option<String>,
    streaming: bool,
    vision: bool,
    tools: bool,
    audio_input: bool,
    audio_output: bool,
    available_now: bool,
    unavailable_reason: Option<String>,
    capability_source: String,
    performance_class: String,
}

fn infer_model_capabilities(provider: &str, model: &str) -> Option<InferredCapabilities> {
    let lower = model.to_ascii_lowercase();

    // Keep the catalog focused on conversational/text-capable models. Specialized
    // image/audio/realtime/embedding endpoints remain outside the v0.8.0 picker.
    let non_chat = [
        "embedding",
        "moderation",
        "dall-e",
        "gpt-image",
        "imagegen",
        "whisper",
        "transcribe",
        "tts",
        "realtime",
        "audio",
        "sora",
    ];
    if non_chat.iter().any(|word| lower.contains(word)) {
        return None;
    }

    if provider == "anthropic" {
        let performance_class =
            if lower.contains("opus") || lower.contains("fable") || lower.contains("mythos") {
                "frontier"
            } else if lower.contains("haiku") {
                "fast"
            } else if lower.contains("sonnet") {
                "balanced"
            } else {
                "unknown"
            };
        return Some(InferredCapabilities {
            api_modes: vec!["messages".into()],
            preferred_api_mode: Some("messages".into()),
            streaming: true,
            // The model-list endpoint does not expose these booleans directly.
            // Current Claude text families support multimodal/tool workflows, but
            // mark the source as inferred so the UI does not present this as API metadata.
            vision: lower.contains("claude"),
            tools: lower.contains("claude"),
            audio_input: false,
            audio_output: false,
            available_now: true,
            unavailable_reason: None,
            capability_source: "inferred".into(),
            performance_class: performance_class.into(),
        });
    }

    if provider == "openai" {
        // v0.8.1 can execute plain-text Responses requests. Specialized agent/tool
        // families are still shown for transparency but remain unavailable.
        let pro_responses = lower.contains("-pro");
        let specialized_responses = lower.contains("deep-research")
            || lower.contains("computer-use")
            || lower.contains("search-preview")
            || lower.contains("codex");
        let responses_only = pro_responses || specialized_responses;

        let is_modern_gpt = lower.starts_with("gpt-5")
            || lower.starts_with("gpt-4.1")
            || lower.starts_with("gpt-4o");
        let api_modes = if responses_only {
            vec!["responses".into()]
        } else if is_modern_gpt {
            vec!["chat_completions".into(), "responses".into()]
        } else {
            vec!["chat_completions".into()]
        };

        let performance_class =
            if lower.contains("mini") || lower.contains("nano") || lower.contains("luna") {
                "fast"
            } else if lower.contains("terra")
                || lower.starts_with("gpt-4o")
                || lower.starts_with("gpt-4.1")
            {
                "balanced"
            } else if lower.contains("sol") || lower.contains("-pro") || lower.starts_with("gpt-5")
            {
                "frontier"
            } else {
                "unknown"
            };

        let available_now = !specialized_responses;
        let unavailable_reason = if specialized_responses {
            Some(
                "Responses APIの専用tool/agent workflowが必要です（現在はテキスト応答のみ対応）"
                    .into(),
            )
        } else {
            None
        };
        // Pro models can use Responses but may explicitly not support streaming.
        // The orchestrator automatically falls back to a non-streaming request.
        let streaming = !pro_responses && !specialized_responses;

        return Some(InferredCapabilities {
            api_modes,
            preferred_api_mode: Some(
                if responses_only {
                    "responses"
                } else {
                    "chat_completions"
                }
                .into(),
            ),
            streaming,
            vision: is_modern_gpt,
            tools: is_modern_gpt || responses_only,
            audio_input: false,
            audio_output: false,
            available_now,
            unavailable_reason,
            capability_source: "inferred".into(),
            performance_class: performance_class.into(),
        });
    }

    if provider == "deepseek" {
        let current = lower == "deepseek-v4-flash" || lower == "deepseek-v4-pro";
        if !current {
            return Some(InferredCapabilities {
                api_modes: vec!["chat_completions".into()],
                preferred_api_mode: Some("chat_completions".into()),
                streaming: true,
                vision: false,
                tools: true,
                audio_input: false,
                audio_output: false,
                available_now: false,
                unavailable_reason: Some(
                    "現在のDeepSeek APIで公開されているV4モデルを選択してください".into(),
                ),
                capability_source: "inferred".into(),
                performance_class: "unknown".into(),
            });
        }

        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: true,
            vision: false,
            tools: true,
            audio_input: false,
            audio_output: false,
            available_now: true,
            unavailable_reason: None,
            capability_source: "curated".into(),
            performance_class: if lower.ends_with("-pro") {
                "frontier"
            } else {
                "fast"
            }
            .into(),
        });
    }

    if provider == "kimi" {
        // Current Kimi Open Platform model list (2026-08):
        // - kimi-k3 (flagship)
        // - kimi-k2.7-code-highspeed
        // - kimi-k2.6
        //
        // The adapter is plain OpenAI-compatible Chat Completions, so these
        // conversational models can share the same runtime path.
        let current =
            lower == "kimi-k3" || lower == "kimi-k2.7-code-highspeed" || lower == "kimi-k2.6";

        if !current {
            return Some(InferredCapabilities {
                api_modes: vec!["chat_completions".into()],
                preferred_api_mode: Some("chat_completions".into()),
                streaming: true,
                vision: lower.starts_with("kimi-k"),
                tools: true,
                audio_input: false,
                audio_output: false,
                available_now: false,
                unavailable_reason: Some(
                    "現在のKimi Chat adapter対象外、または旧/専用モデルです".into(),
                ),
                capability_source: "provider_metadata".into(),
                performance_class: "unknown".into(),
            });
        }

        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: true,
            vision: lower == "kimi-k3" || lower == "kimi-k2.6",
            tools: true,
            audio_input: false,
            audio_output: false,
            available_now: true,
            unavailable_reason: None,
            capability_source: "provider_metadata".into(),
            performance_class: if lower == "kimi-k3" {
                "frontier"
            } else {
                "balanced"
            }
            .into(),
        });
    }

    if provider == "google" {
        // Google's OpenAI-compatible /models endpoint can expose current aliases
        // and model revisions faster than a hard-coded exact-ID allow-list can be
        // updated. Treat conversational Gemini-family IDs as executable by the
        // shared Chat Completions adapter, while explicitly excluding families
        // that require a different endpoint/workflow.
        // Some Google model-list responses use resource names such as
        // `models/gemini-2.5-flash`. Capability detection must operate on the
        // final model-name segment, not the resource prefix.
        let model_name = lower.rsplit('/').next().unwrap_or(&lower);
        let is_gemini = model_name.starts_with("gemini-");
        let specialized = [
            "embedding",
            "image",
            "imagen",
            "live",
            "tts",
            "robotics",
            "computer-use",
            "deep-research",
            "aqa",
        ];
        let requires_specialized_adapter = specialized.iter().any(|word| model_name.contains(word));
        // Google can still return legacy entries from Model Discovery even when
        // they are no longer provisioned for new users. Do not preserve a stale
        // selection that is known to return 404; refreshModels will move the slot
        // to the first current executable model instead.
        let unavailable_to_new_users = model_name == "gemini-2.5-flash-lite";
        let live = is_gemini && !requires_specialized_adapter && !unavailable_to_new_users;

        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: live,
            vision: live,
            tools: live,
            audio_input: live,
            audio_output: false,
            available_now: live,
            unavailable_reason: if live {
                None
            } else if unavailable_to_new_users {
                Some("Google側で新規ユーザーへの提供終了。Gemini 3.5 Flash-Lite以降を選択してください".into())
            } else {
                Some(
                    "画像生成/Live/TTS/Embedding等の専用Geminiモデルは現在のChat adapter対象外です"
                        .into(),
                )
            },
            capability_source: "inferred".into(),
            performance_class: if model_name.contains("flash-lite") {
                "fast".into()
            } else if model_name.contains("pro") {
                "frontier".into()
            } else if model_name.contains("flash") {
                "balanced".into()
            } else {
                "unknown".into()
            },
        });
    }

    if provider == "qwen" {
        let is_qwen = lower.starts_with("qwen");
        let specialized = [
            "embedding",
            "image",
            "tts",
            "asr",
            "realtime",
            "live",
            "omni",
            "audio",
            "vl",
            "deep-research",
        ];
        let requires_specialized_adapter = specialized.iter().any(|word| lower.contains(word));
        let live = is_qwen && !requires_specialized_adapter;

        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: live,
            vision: false,
            tools: live,
            audio_input: false,
            audio_output: false,
            available_now: live,
            unavailable_reason: if live {
                None
            } else {
                Some(
                    "VL/Omni/Audio/Embedding等の専用Qwenモデルは現在のChat adapter対象外です"
                        .into(),
                )
            },
            capability_source: "inferred".into(),
            performance_class: if lower.contains("max") {
                "frontier".into()
            } else if lower.contains("flash") || lower.contains("turbo") {
                "fast".into()
            } else if lower.contains("plus") {
                "balanced".into()
            } else {
                "unknown".into()
            },
        });
    }

    if provider == "mistral" {
        let conversational = lower.starts_with("mistral-")
            || lower.starts_with("ministral-")
            || lower.starts_with("open-mistral-")
            || lower.starts_with("pixtral-");
        let specialized = [
            "embed",
            "moderation",
            "ocr",
            "voxtral",
            "transcribe",
            "audio",
        ];
        let live = conversational && !specialized.iter().any(|word| lower.contains(word));
        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: live,
            vision: live
                && (lower.contains("pixtral")
                    || lower.starts_with("mistral-")
                    || lower.starts_with("ministral-")),
            tools: live,
            audio_input: false,
            audio_output: false,
            available_now: live,
            unavailable_reason: if live {
                None
            } else {
                Some(
                    "Embedding/OCR/Audio等の専用Mistralモデルは現在のChat adapter対象外です".into(),
                )
            },
            capability_source: "provider_metadata".into(),
            performance_class: if lower.contains("large") || lower.contains("medium") {
                "frontier".into()
            } else if lower.contains("small") {
                "balanced".into()
            } else if lower.contains("ministral") {
                "fast".into()
            } else {
                "unknown".into()
            },
        });
    }

    if provider == "cohere" {
        let live = lower.starts_with("command-") || lower.starts_with("tiny-aya-");
        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: live,
            vision: live && (lower.contains("vision") || lower.contains("plus")),
            tools: live && !lower.contains("vision"),
            audio_input: false,
            audio_output: false,
            available_now: live,
            unavailable_reason: if live {
                None
            } else {
                Some("現在のCohere Chat adapter対象外のモデルです".into())
            },
            capability_source: "provider_metadata".into(),
            performance_class: if lower.contains("plus") || lower.contains("reasoning") {
                "frontier".into()
            } else if lower.contains("tiny") || lower.contains("7b") {
                "fast".into()
            } else {
                "balanced".into()
            },
        });
    }

    if provider == "xai" {
        let is_grok = lower.starts_with("grok-");
        let specialized = [
            "imagine",
            "image",
            "video",
            "voice",
            "tts",
            "embedding",
            "multi-agent",
            "build",
        ];
        let live = is_grok && !specialized.iter().any(|word| lower.contains(word));
        return Some(InferredCapabilities {
            api_modes: vec!["chat_completions".into()],
            preferred_api_mode: Some("chat_completions".into()),
            streaming: live,
            vision: live,
            tools: live,
            audio_input: false,
            audio_output: false,
            available_now: live,
            unavailable_reason: if live {
                None
            } else {
                Some(
                    "Image/Video/Voice/Build等の専用xAIモデルは現在のChat adapter対象外です".into(),
                )
            },
            capability_source: "inferred".into(),
            performance_class: if lower.contains("4.5") || lower.contains("reasoning") {
                "frontier".into()
            } else {
                "balanced".into()
            },
        });
    }

    None
}

#[tauri::command]
async fn list_provider_models(provider: String) -> Result<Vec<AvailableModelInfo>, String> {
    let key = require_key(&provider)?;
    let client = reqwest::Client::new();

    let response = match provider.as_str() {
        "openai" => client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("OpenAI model list request failed: {e}"))?,
        "anthropic" => client
            .get("https://api.anthropic.com/v1/models?limit=1000")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| format!("Anthropic model list request failed: {e}"))?,
        "deepseek" => client
            .get("https://api.deepseek.com/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("DeepSeek model list request failed: {e}"))?,
        "kimi" => client
            .get("https://api.moonshot.ai/v1/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Kimi model list request failed: {e}"))?,
        "google" => client
            .get("https://generativelanguage.googleapis.com/v1beta/openai/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Gemini model list request failed: {e}"))?,
        "qwen" => client
            .get("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Qwen model list request failed: {e}"))?,
        "mistral" => client
            .get("https://api.mistral.ai/v1/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Mistral model list request failed: {e}"))?,
        "cohere" => client
            .get("https://api.cohere.com/v1/models?page_size=1000&endpoint=chat")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("Cohere model list request failed: {e}"))?,
        "xai" => client
            .get("https://api.x.ai/v1/models")
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|e| format!("xAI model list request failed: {e}"))?,
        other => {
            return Err(format!(
                "model discovery is not supported for provider '{other}'"
            ))
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("{provider} model list error ({status}): {text}"));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("failed to parse {provider} model list: {e}"))?;

    let model_items = if provider == "cohere" {
        &body["models"]
    } else {
        &body["data"]
    };
    let mut models = model_items
        .as_array()
        .map(|items| items.iter())
        .into_iter()
        .flatten()
        .filter_map(|item| {
            if provider == "cohere" {
                if item["is_deprecated"].as_bool() == Some(true) {
                    return None;
                }
                if let Some(endpoints) = item["endpoints"].as_array() {
                    if !endpoints
                        .iter()
                        .any(|endpoint| endpoint.as_str() == Some("chat"))
                    {
                        return None;
                    }
                }
            }
            // Mistral publishes multiple endpoint-specific model families in
            // one list. Prefer its explicit chat capability when present.
            if provider == "mistral"
                && item["capabilities"]["completion_chat"].as_bool() == Some(false)
            {
                return None;
            }
            let raw_id = if provider == "cohere" {
                item["name"].as_str()?
            } else {
                item["id"].as_str()?
            };
            // Google may expose native resource names through discovery, while
            // its OpenAI-compatible chat endpoint expects the plain model ID.
            let id = if provider == "google" {
                raw_id.rsplit('/').next().unwrap_or(raw_id).to_string()
            } else {
                raw_id.to_string()
            };
            let name = item["display_name"]
                .as_str()
                .or_else(|| item["name"].as_str())
                .unwrap_or(&id)
                .to_string();
            let max_context_tokens = item["max_input_tokens"]
                .as_u64()
                .or_else(|| item["context_length"].as_u64())
                .or_else(|| item["max_context_length"].as_u64())
                .map(|v| v.min(u32::MAX as u64) as u32);
            Some((id, name, max_context_tokens))
        })
        .filter_map(|(id, name, max_context_tokens)| {
            let caps = infer_model_capabilities(&provider, &id)?;
            Some(AvailableModelInfo {
                id,
                name,
                max_context_tokens,
                api_modes: caps.api_modes,
                preferred_api_mode: caps.preferred_api_mode,
                streaming: caps.streaming,
                vision: caps.vision,
                tools: caps.tools,
                audio_input: caps.audio_input,
                audio_output: caps.audio_output,
                available_now: caps.available_now,
                unavailable_reason: caps.unavailable_reason,
                capability_source: caps.capability_source,
                performance_class: caps.performance_class,
            })
        })
        .collect::<Vec<_>>();

    // Prefer current frontier models when the provider exposes them. This does not
    // assume the user has access; the actual /v1/models response is still the source
    // of truth. It only makes the default selection less surprising.
    let priority = [
        "command-a-plus-05-2026",
        "command-a-reasoning-08-2025",
        "command-a-03-2025",
        "grok-4.20-0309-non-reasoning",
        "grok-4.5",
        "grok-4.20-0309-reasoning",
        "grok-4.3",
        "mistral-small-2603",
        "ministral-8b-2512",
        "mistral-medium-3-5",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "qwen3.7-max",
        "qwen3.7-plus",
        "qwen3.6-flash",
        "qwen-plus",
        "qwen-turbo",
        "kimi-k3",
        "kimi-k2.7-code-highspeed",
        "kimi-k2.6",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "gpt-5.6",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5",
        "gpt-5-mini",
        "gpt-4.1",
        "gpt-4o",
    ];
    models.sort_by(|a, b| {
        let pa = priority
            .iter()
            .position(|x| *x == a.id)
            .unwrap_or(usize::MAX);
        let pb = priority
            .iter()
            .position(|x| *x == b.id)
            .unwrap_or(usize::MAX);
        pa.cmp(&pb).then_with(|| a.name.cmp(&b.name))
    });

    Ok(models)
}

#[tauri::command]
fn create_conversation(
    app: tauri::AppHandle,
    id: String,
    title: String,
    project_id: String,
) -> Result<db::ConversationSummary, String> {
    db::create_conversation(&app, &id, &title, &project_id)
}

#[tauri::command]
fn list_conversations(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<db::ConversationSummary>, String> {
    db::list_conversations(&app, &project_id)
}

#[tauri::command]
fn get_conversation_messages(
    app: tauri::AppHandle,
    conversation_id: String,
) -> Result<Vec<db::ConversationMessage>, String> {
    db::get_conversation_messages(&app, &conversation_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn append_conversation_message(
    app: tauri::AppHandle,
    id: String,
    conversation_id: String,
    role: String,
    kind: String,
    slot_id: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    nickname: Option<String>,
    content: String,
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cost_usd: Option<f64>,
    elapsed_ms: Option<u64>,
    applied_context_ids_json: String,
    applied_ai_reference_sources_json: String,
    target_slot_ids_json: String,
    parent_message_id: Option<String>,
) -> Result<db::ConversationMessage, String> {
    db::append_conversation_message(
        &app,
        &id,
        &conversation_id,
        &role,
        &kind,
        slot_id.as_deref(),
        provider.as_deref(),
        model.as_deref(),
        nickname.as_deref(),
        &content,
        input_tokens,
        output_tokens,
        cost_usd,
        elapsed_ms,
        &applied_context_ids_json,
        &applied_ai_reference_sources_json,
        &target_slot_ids_json,
        parent_message_id.as_deref(),
    )
}

#[tauri::command]
fn rename_conversation(
    app: tauri::AppHandle,
    conversation_id: String,
    title: String,
) -> Result<db::ConversationSummary, String> {
    db::rename_conversation(&app, &conversation_id, &title)
}

#[tauri::command]
fn move_conversation(
    app: tauri::AppHandle,
    conversation_id: String,
    project_id: String,
) -> Result<db::ConversationSummary, String> {
    db::move_conversation(&app, &conversation_id, &project_id)
}

#[tauri::command]
fn delete_conversation(app: tauri::AppHandle, conversation_id: String) -> Result<(), String> {
    db::delete_conversation(&app, &conversation_id)
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<db::ProjectRecord>, String> {
    db::list_projects(&app)
}

#[tauri::command]
fn create_project(
    app: tauri::AppHandle,
    id: String,
    name: String,
    description: String,
) -> Result<db::ProjectRecord, String> {
    db::create_project(&app, &id, &name, &description)
}

#[tauri::command]
fn rename_project(
    app: tauri::AppHandle,
    project_id: String,
    name: String,
) -> Result<db::ProjectRecord, String> {
    db::rename_project(&app, &project_id, &name)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    db::delete_project(&app, &project_id)
}

#[tauri::command]
fn load_context_items_json(app: tauri::AppHandle) -> Result<String, String> {
    db::load_state_json(&app, "context_items_v1", "[]")
}

#[tauri::command]
fn save_context_items_json(app: tauri::AppHandle, items_json: String) -> Result<(), String> {
    db::save_state_json(&app, "context_items_v1", &items_json)
}

#[tauri::command]
fn load_context_sets_json(app: tauri::AppHandle) -> Result<String, String> {
    db::load_state_json(&app, "context_sets_v1", "[]")
}

#[tauri::command]
fn save_context_sets_json(app: tauri::AppHandle, sets_json: String) -> Result<(), String> {
    db::save_state_json(&app, "context_sets_v1", &sets_json)
}

#[tauri::command]
fn load_context_set_selections_json(app: tauri::AppHandle) -> Result<String, String> {
    db::load_state_json(&app, "context_set_selections_v1", "{}")
}

#[tauri::command]
fn save_context_set_selections_json(
    app: tauri::AppHandle,
    selections_json: String,
) -> Result<(), String> {
    db::save_state_json(&app, "context_set_selections_v1", &selections_json)
}

#[tauri::command]
fn has_context_state_key(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    db::has_state_key(&app, &key)
}

#[tauri::command]
fn load_context_migration_completed(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(db::load_state_json(&app, "migration_completed_v0_9", "false")? == "true")
}

#[tauri::command]
fn save_context_migration_completed(app: tauri::AppHandle) -> Result<(), String> {
    db::save_state_json(&app, "migration_completed_v0_9", "true")
}

#[tauri::command]
fn extract_pdf_text(bytes: Vec<u8>) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF text extraction failed: {e}"))
}

#[tauri::command]
fn list_comparison_markers(
    app: tauri::AppHandle,
    conversation_id: String,
) -> Result<Vec<db::ComparisonMarkerRecord>, String> {
    db::list_comparison_markers(&app, &conversation_id)
}

#[tauri::command]
fn add_comparison_marker(
    app: tauri::AppHandle,
    id: String,
    conversation_id: String,
    message_id: String,
    paragraph_index: i64,
    excerpt: String,
) -> Result<db::ComparisonMarkerRecord, String> {
    db::add_comparison_marker(
        &app,
        &id,
        &conversation_id,
        &message_id,
        paragraph_index,
        &excerpt,
    )
}

#[tauri::command]
fn delete_comparison_marker(
    app: tauri::AppHandle,
    message_id: String,
    paragraph_index: i64,
) -> Result<(), String> {
    db::delete_comparison_marker(&app, &message_id, paragraph_index)
}

#[tauri::command]
fn list_text_documents(app: tauri::AppHandle) -> Result<Vec<db::TextDocumentRecord>, String> {
    db::list_text_documents(&app)
}

#[tauri::command]
fn create_text_document(
    app: tauri::AppHandle,
    id: String,
    title: String,
    content: String,
) -> Result<db::TextDocumentRecord, String> {
    db::create_text_document(&app, &id, &title, &content)
}

#[tauri::command]
fn update_text_document(
    app: tauri::AppHandle,
    id: String,
    title: String,
    content: String,
) -> Result<db::TextDocumentRecord, String> {
    db::update_text_document(&app, &id, &title, &content)
}

#[tauri::command]
fn delete_text_document(app: tauri::AppHandle, id: String) -> Result<(), String> {
    db::delete_text_document(&app, &id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn save_archive_conversation(
    app: tauri::AppHandle,
    project_id: String,
    source: String,
    title: String,
    file_name: Option<String>,
    source_provider: Option<String>,
    source_model: Option<String>,
    messages: Vec<db::ArchiveMessageInput>,
) -> Result<db::ArchiveConversationRecord, String> {
    db::save_archive_conversation(
        &app,
        &project_id,
        &source,
        &title,
        file_name.as_deref(),
        source_provider.as_deref(),
        source_model.as_deref(),
        &messages,
    )
}

#[tauri::command]
fn list_archive_conversations(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<db::ArchiveConversationRecord>, String> {
    db::list_archive_conversations(&app, &project_id)
}

#[tauri::command]
fn get_archive_messages(
    app: tauri::AppHandle,
    archive_id: String,
) -> Result<Vec<db::ArchiveMessageRecord>, String> {
    db::get_archive_messages(&app, &archive_id)
}

#[tauri::command]
fn update_archive_source_mapping(
    app: tauri::AppHandle,
    archive_id: String,
    provider: Option<String>,
    model: Option<String>,
    mapped_slot_id: Option<String>,
    nickname: Option<String>,
) -> Result<db::ArchiveConversationRecord, String> {
    db::update_archive_source_mapping(
        &app,
        &archive_id,
        provider.as_deref(),
        model.as_deref(),
        mapped_slot_id.as_deref(),
        nickname.as_deref(),
    )
}

#[tauri::command]
fn delete_archive_conversation(app: tauri::AppHandle, archive_id: String) -> Result<(), String> {
    db::delete_archive_conversation(&app, &archive_id)
}

#[tauri::command]
fn get_usage_summary(app: tauri::AppHandle) -> Result<db::UsageSummary, String> {
    db::summary(&app)
}

#[tauri::command]
fn clear_usage_history(app: tauri::AppHandle) -> Result<(), String> {
    db::clear_all(&app)
}

#[tauri::command]
fn export_user_data(
    app: tauri::AppHandle,
    frontend_settings: serde_json::Value,
) -> Result<String, String> {
    db::export_user_data(&app, frontend_settings)
}

#[tauri::command]
fn import_user_data(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    db::import_user_data(&app, payload)
}

#[tauri::command]
fn open_official_provider_url(url: String) -> Result<(), String> {
    let url = validate_official_provider_url(&url)?;

    #[cfg(target_os = "windows")]
    {
        // Do not route untrusted text through cmd.exe. The URL is passed as one
        // argument after strict parsing and an exact-host allow-list check.
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url.as_str()])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url.as_str())
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url.as_str())
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }

    Ok(())
}

fn validate_official_provider_url(input: &str) -> Result<url::Url, String> {
    const ALLOWED_HOSTS: &[&str] = &[
        "platform.openai.com",
        "console.anthropic.com",
        "platform.deepseek.com",
        "platform.moonshot.ai",
        "platform.kimi.ai",
        "aistudio.google.com",
        "console.x.ai",
        "modelstudio.console.alibabacloud.com",
        "console.mistral.ai",
        "dashboard.cohere.com",
    ];

    let parsed = url::Url::parse(input).map_err(|_| "blocked invalid provider URL".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "blocked provider URL without a host".to_string())?;

    if parsed.scheme() != "https"
        || !ALLOWED_HOSTS.contains(&host)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("blocked non-official provider URL".into());
    }

    Ok(parsed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init(app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> { std::io::Error::other(e).into() })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            has_api_key,
            delete_api_key,
            chat_completion,
            stream_chat_completion,
            estimate_send_cost,
            list_provider_models,
            get_usage_summary,
            clear_usage_history,
            export_user_data,
            import_user_data,
            open_official_provider_url,
            create_conversation,
            list_conversations,
            get_conversation_messages,
            list_comparison_markers,
            add_comparison_marker,
            delete_comparison_marker,
            list_projects,
            create_project,
            rename_project,
            delete_project,
            load_context_items_json,
            save_context_items_json,
            load_context_sets_json,
            save_context_sets_json,
            load_context_set_selections_json,
            save_context_set_selections_json,
            has_context_state_key,
            load_context_migration_completed,
            save_context_migration_completed,
            extract_pdf_text,
            list_text_documents,
            create_text_document,
            update_text_document,
            delete_text_document,
            save_archive_conversation,
            list_archive_conversations,
            get_archive_messages,
            update_archive_source_mapping,
            delete_archive_conversation,
            append_conversation_message,
            rename_conversation,
            move_conversation,
            delete_conversation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Ensemble");
}

#[cfg(test)]
mod official_url_tests {
    use super::validate_official_provider_url;

    #[test]
    fn accepts_exact_official_https_hosts() {
        assert!(validate_official_provider_url("https://platform.openai.com/usage").is_ok());
        assert!(validate_official_provider_url(
            "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=costing-balance"
        )
        .is_ok());
    }

    #[test]
    fn rejects_lookalikes_credentials_ports_and_shell_payloads() {
        for candidate in [
            "http://platform.openai.com/usage",
            "https://platform.openai.com.evil.example/usage",
            "https://platform.openai.com@evil.example/usage",
            "https://user@platform.openai.com/usage",
            "https://platform.openai.com:444/usage",
        ] {
            assert!(
                validate_official_provider_url(candidate).is_err(),
                "unexpectedly accepted {candidate}"
            );
        }
    }
}
