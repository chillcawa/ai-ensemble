import type { ArchiveMessageRole, ImportedArchiveConversation } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function normalizeRole(value: unknown): ArchiveMessageRole {
  const role = String(value ?? "").toLowerCase();
  if (["human", "user"].includes(role)) return "user";
  if (["assistant", "claude", "ai"].includes(role)) return "assistant";
  if (["system", "developer"].includes(role)) return "system";
  return "unknown";
}

function toIsoTime(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return undefined;
}

function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";

  // Claude exports seen in the wild have used both `text` and structured
  // `content` blocks. Keep this deliberately tolerant and ignore binary/tool payloads.
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) return record.content.map(textFrom).filter(Boolean).join("\n");
  if (Array.isArray(record.parts)) return record.parts.map(textFrom).filter(Boolean).join("\n");
  if (typeof record.value === "string") return record.value;
  return "";
}

function messageContent(message: JsonRecord): string {
  const direct = textFrom(message.text ?? message.content ?? message.message ?? message.parts);
  return direct.trim();
}

function modelFrom(value: JsonRecord): string | undefined {
  const model = value.model ?? value.model_name ?? value.modelName ?? value.model_slug;
  return typeof model === "string" && model.trim() ? model : undefined;
}

function messageArrayFromConversation(conversation: JsonRecord): unknown[] | null {
  if (Array.isArray(conversation.chat_messages)) return conversation.chat_messages;
  if (Array.isArray(conversation.messages)) return conversation.messages;
  if (Array.isArray(conversation.chatMessages)) return conversation.chatMessages;
  return null;
}

function isClaudeConversation(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const messages = messageArrayFromConversation(record);
  if (!messages || messages.length === 0) return false;

  // Avoid stealing generic JSON: require a Claude-shaped signal in either the
  // conversation or its messages, not merely a generic `messages` array.
  if (Array.isArray(record.chat_messages) || Array.isArray(record.chatMessages)) return true;
  if ("uuid" in record && messages.some((raw) => {
    const message = asRecord(raw);
    return !!message && ("sender" in message || "uuid" in message || "created_at" in message);
  })) return true;
  return false;
}

function convertConversation(raw: unknown, fileName: string, index: number): ImportedArchiveConversation | null {
  const conversation = asRecord(raw);
  if (!conversation || !isClaudeConversation(conversation)) return null;
  const rawMessages = messageArrayFromConversation(conversation);
  if (!rawMessages) return null;

  const messages: ImportedArchiveConversation["messages"] = [];
  let detectedModel = modelFrom(conversation);

  for (const rawMessage of rawMessages) {
    const message = asRecord(rawMessage);
    if (!message) continue;
    const content = messageContent(message);
    if (!content) continue;

    const role = normalizeRole(message.sender ?? message.role ?? message.author ?? message.type);
    const model = modelFrom(message);
    if (role === "assistant" && model) detectedModel = model;

    const author = typeof message.author === "string" && message.author.trim()
      ? message.author
      : (typeof message.sender === "string" && !["human", "user", "assistant"].includes(message.sender.toLowerCase())
        ? message.sender
        : undefined);

    messages.push({
      role,
      content,
      author,
      createdAt: toIsoTime(message.created_at ?? message.createdAt ?? message.timestamp),
    });
  }

  if (!messages.length) return null;
  const titleValue = conversation.name ?? conversation.title ?? conversation.summary;
  const title = typeof titleValue === "string" && titleValue.trim()
    ? titleValue
    : `${fileName.replace(/\.json$/i, "")} ${index + 1}`;

  return {
    source: "claude-export",
    sourceProvider: "anthropic",
    sourceModel: detectedModel,
    title,
    fileName,
    messages,
  };
}

export function parseClaudeExport(value: unknown, fileName: string): ImportedArchiveConversation[] | null {
  const root = asRecord(value);
  const entries = Array.isArray(value)
    ? value
    : (Array.isArray(root?.conversations)
      ? root.conversations
      : (root && isClaudeConversation(root) ? [root] : null));

  if (!entries || !entries.some(isClaudeConversation)) return null;

  const conversations = entries
    .map((entry, index) => convertConversation(entry, fileName, index))
    .filter((entry): entry is ImportedArchiveConversation => !!entry);

  if (!conversations.length) {
    throw new Error("Claude exportを検出しましたが、テキストメッセージを見つけられませんでした。");
  }
  return conversations;
}
