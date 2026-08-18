import type { ArchiveMessageRole, ImportedArchiveConversation } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function normalizeRole(value: unknown): ArchiveMessageRole {
  const role = String(value ?? "").toLowerCase();
  if (role === "user" || role === "human") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system" || role === "developer") return "system";
  return "unknown";
}

function toIsoTime(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toIsoTime(numeric);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return undefined;
}

function textFromPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromPart).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.parts)) return record.parts.map(textFromPart).filter(Boolean).join("\n");
  // Non-text multimodal/tool payloads are deliberately not serialized as raw JSON.
  return "";
}

function contentFromMessage(message: JsonRecord): string {
  const content = asRecord(message.content);
  if (!content) return textFromPart(message.content).trim();
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts.map(textFromPart).filter(Boolean).join("\n").trim();
  if (text) return text;
  return textFromPart(content.text ?? content.result ?? "").trim();
}

function modelFromMessage(message: JsonRecord): string | undefined {
  const metadata = asRecord(message.metadata);
  const model = metadata?.model_slug ?? metadata?.default_model_slug ?? message.model;
  return typeof model === "string" && model.trim() ? model : undefined;
}

function isChatGptConversation(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const mapping = asRecord(record.mapping);
  return !!mapping && Object.values(mapping).some((node) => {
    const nodeRecord = asRecord(node);
    return !!nodeRecord && ("parent" in nodeRecord || "children" in nodeRecord || "message" in nodeRecord);
  });
}

function chooseLeaf(mapping: JsonRecord): string | null {
  const nodes = Object.entries(mapping);
  if (!nodes.length) return null;
  const leaves = nodes.filter(([, rawNode]) => {
    const node = asRecord(rawNode);
    return !Array.isArray(node?.children) || node.children.length === 0;
  });
  const candidates = leaves.length ? leaves : nodes;
  candidates.sort(([, a], [, b]) => {
    const ma = asRecord(asRecord(a)?.message);
    const mb = asRecord(asRecord(b)?.message);
    const ta = Number(ma?.create_time ?? 0);
    const tb = Number(mb?.create_time ?? 0);
    return tb - ta;
  });
  return candidates[0]?.[0] ?? null;
}

function activePath(mapping: JsonRecord, currentNode: unknown): JsonRecord[] {
  let nodeId = typeof currentNode === "string" && mapping[currentNode] ? currentNode : chooseLeaf(mapping);
  if (!nodeId) return [];
  const reversed: JsonRecord[] = [];
  const seen = new Set<string>();
  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    const node = asRecord(mapping[nodeId]);
    if (!node) break;
    reversed.push(node);
    nodeId = typeof node.parent === "string" ? node.parent : null;
  }
  return reversed.reverse();
}

function convertConversation(raw: unknown, fileName: string, index: number): ImportedArchiveConversation | null {
  const conversation = asRecord(raw);
  if (!conversation || !isChatGptConversation(conversation)) return null;
  const mapping = asRecord(conversation.mapping);
  if (!mapping) return null;

  const path = activePath(mapping, conversation.current_node);
  const messages: ImportedArchiveConversation["messages"] = [];
  let detectedModel: string | undefined;

  for (const node of path) {
    const message = asRecord(node.message);
    if (!message) continue;
    const content = contentFromMessage(message);
    if (!content) continue;
    const authorRecord = asRecord(message.author);
    const role = normalizeRole(authorRecord?.role);
    const model = modelFromMessage(message);
    if (role === "assistant" && model) detectedModel = model;
    const authorName = typeof authorRecord?.name === "string" && authorRecord.name.trim()
      ? authorRecord.name
      : undefined;
    messages.push({
      role,
      content,
      author: authorName,
      createdAt: toIsoTime(message.create_time),
    });
  }

  if (!messages.length) return null;
  const title = typeof conversation.title === "string" && conversation.title.trim()
    ? conversation.title
    : `${fileName.replace(/\.json$/i, "")} ${index + 1}`;

  return {
    source: "chatgpt-export",
    sourceProvider: "openai",
    sourceModel: detectedModel,
    title,
    fileName,
    messages,
  };
}

export function parseChatGptExport(value: unknown, fileName: string): ImportedArchiveConversation[] | null {
  const root = asRecord(value);
  const entries = Array.isArray(value)
    ? value
    : (Array.isArray(root?.conversations)
      ? root.conversations
      : (root && isChatGptConversation(root) ? [root] : null));
  if (!entries || !entries.some(isChatGptConversation)) return null;

  const conversations = entries
    .map((entry, index) => convertConversation(entry, fileName, index))
    .filter((entry): entry is ImportedArchiveConversation => !!entry);

  if (!conversations.length) throw new Error("ChatGPT exportを検出しましたが、active branch上にテキストメッセージを見つけられませんでした。");
  return conversations;
}
