import type { ProviderId } from "../types/ai";
import { parseChatGptExport } from "./chatgptAdapter";
import { parseClaudeExport } from "./claudeAdapter";
import type { ImportedArchiveConversation } from "./types";

export type ImportAdapterKind = "dedicated" | "generic";

export interface ImportProbe {
  fileName: string;
  mimeType: string;
  text: string;
  parsedJson?: unknown;
}

export interface ImportAdapter {
  id: string;
  displayName: string;
  kind: ImportAdapterKind;
  providerIds: ProviderId[];
  priority: number;
  fileExtensions: string[];
  description: string;
  detect: (probe: ImportProbe) => number;
  parse: (probe: ImportProbe) => ImportedArchiveConversation[] | null;
}

function lowerExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function normalizeRole(value: unknown): "user" | "assistant" | "system" | "unknown" {
  const role = String(value ?? "").toLowerCase();
  if (["user", "human"].includes(role)) return "user";
  if (["assistant", "ai", "bot"].includes(role)) return "assistant";
  if (["system", "developer"].includes(role)) return "system";
  return "unknown";
}

function contentFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentFrom).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return contentFrom(record.text ?? record.content ?? record.parts ?? record.value ?? "");
  }
  return value == null ? "" : String(value);
}

function normalizeMessage(raw: unknown) {
  if (typeof raw === "string") return { role: "unknown" as const, content: raw };
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const content = contentFrom(record.content ?? record.text ?? record.message ?? record.parts ?? record.value);
  if (!content.trim()) return null;
  return {
    role: normalizeRole(record.role ?? record.author ?? record.sender ?? record.type),
    content,
    author: typeof record.author === "string" ? record.author : typeof record.name === "string" ? record.name : undefined,
    createdAt: typeof record.createdAt === "string"
      ? record.createdAt
      : typeof record.created_at === "string"
        ? record.created_at
        : typeof record.timestamp === "string" ? record.timestamp : undefined,
  };
}

function fromMessageArray(messages: unknown[], title: string, source: string, fileName: string): ImportedArchiveConversation {
  return {
    source,
    title,
    fileName,
    messages: messages.map(normalizeMessage).filter((value): value is NonNullable<typeof value> => !!value),
  };
}

function parseJsonConversation(value: unknown, fileName: string, index: number): ImportedArchiveConversation[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const messages = Array.isArray(record.messages)
    ? record.messages
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.chat) ? record.chat : null;
  if (!messages) return [];
  const title = typeof record.title === "string"
    ? record.title
    : typeof record.name === "string"
      ? record.name
      : `${fileName.replace(/\.json$/i, "")} ${index + 1}`;
  const source = typeof record.source === "string"
    ? record.source
    : typeof record.provider === "string" ? record.provider : "generic-json";
  return [fromMessageArray(messages, title, source, fileName)];
}

function parseGenericJson(value: unknown, fileName: string): ImportedArchiveConversation[] {
  if (Array.isArray(value)) {
    const looksLikeMessages = value.every((item) => typeof item === "string" || (item && typeof item === "object" && ("content" in item || "text" in item || "message" in item || "role" in item)));
    if (looksLikeMessages) return [fromMessageArray(value, fileName.replace(/\.json$/i, ""), "generic-json", fileName)];
    return value.flatMap((entry, index) => parseJsonConversation(entry, fileName, index));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.conversations)) return record.conversations.flatMap((entry, index) => parseJsonConversation(entry, fileName, index));
    return parseJsonConversation(record, fileName, 0);
  }
  return [];
}

function parseTaggedText(text: string, fileName: string, source: string): ImportedArchiveConversation {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages: ImportedArchiveConversation["messages"] = [];
  let current: ImportedArchiveConversation["messages"][number] | null = null;
  const marker = /^\s*(?:#{1,6}\s*)?(user|human|assistant|ai|bot|system)\s*[:：]?\s*(.*)$/i;
  for (const line of lines) {
    const match = line.match(marker);
    if (match) {
      if (current && current.content.trim()) messages.push(current);
      current = { role: normalizeRole(match[1]), content: match[2] ?? "" };
      continue;
    }
    if (current) current.content += `${current.content ? "\n" : ""}${line}`;
  }
  if (current && current.content.trim()) messages.push(current);
  if (messages.length === 0) messages.push({ role: "unknown", content: text.trim() });
  return { source, title: fileName.replace(/\.(md|markdown|txt)$/i, ""), fileName, messages };
}

const adapters: ImportAdapter[] = [
  {
    id: "chatgpt-export",
    displayName: "ChatGPT Export",
    kind: "dedicated",
    providerIds: ["openai"],
    priority: 100,
    fileExtensions: [".json"],
    description: "ChatGPT exportのmapping/current_node木構造をactive branchへ翻訳します。",
    detect: (probe) => probe.parsedJson !== undefined && parseChatGptExport(probe.parsedJson, probe.fileName) !== null ? 1 : 0,
    parse: (probe) => probe.parsedJson === undefined ? null : parseChatGptExport(probe.parsedJson, probe.fileName),
  },
  {
    id: "claude-export",
    displayName: "Claude Export",
    kind: "dedicated",
    providerIds: ["anthropic"],
    priority: 90,
    fileExtensions: [".json"],
    description: "Claude exportのchat_messages/messages構造を共通Archiveへ翻訳します。",
    detect: (probe) => probe.parsedJson !== undefined && parseClaudeExport(probe.parsedJson, probe.fileName) !== null ? 1 : 0,
    parse: (probe) => probe.parsedJson === undefined ? null : parseClaudeExport(probe.parsedJson, probe.fileName),
  },
  {
    id: "generic-json",
    displayName: "Generic JSON",
    kind: "generic",
    providerIds: [],
    priority: 20,
    fileExtensions: [".json"],
    description: "messages/conversations配列を持つ一般的なJSON会話ログを読み込みます。",
    detect: (probe) => {
      if (probe.parsedJson === undefined) return 0;
      try { return parseGenericJson(probe.parsedJson, probe.fileName).length > 0 ? 0.5 : 0; }
      catch { return 0; }
    },
    parse: (probe) => probe.parsedJson === undefined ? null : parseGenericJson(probe.parsedJson, probe.fileName),
  },
  {
    id: "generic-markdown",
    displayName: "Generic Markdown",
    kind: "generic",
    providerIds: [],
    priority: 10,
    fileExtensions: [".md", ".markdown"],
    description: "User/Assistant見出しを持つMarkdownを会話ログとして読み込みます。",
    detect: (probe) => [".md", ".markdown"].includes(lowerExtension(probe.fileName)) ? 0.4 : 0,
    parse: (probe) => [parseTaggedText(probe.text, probe.fileName, "generic-markdown")],
  },
  {
    id: "generic-text",
    displayName: "Generic Text",
    kind: "generic",
    providerIds: [],
    priority: 1,
    fileExtensions: [".txt"],
    description: "プレーンテキストを会話Archiveへ取り込みます。役割記号があれば分割します。",
    detect: (probe) => lowerExtension(probe.fileName) === ".txt" ? 0.2 : 0.05,
    parse: (probe) => [parseTaggedText(probe.text, probe.fileName, "generic-text")],
  },
];

export function listImportAdapters(): ImportAdapter[] {
  return [...adapters].sort((a, b) => b.priority - a.priority);
}

export function importAdaptersForProvider(providerId: ProviderId): ImportAdapter[] {
  return listImportAdapters().filter((adapter) => adapter.kind === "generic" || adapter.providerIds.includes(providerId));
}

export function dedicatedImportAdaptersForProvider(providerId: ProviderId): ImportAdapter[] {
  return listImportAdapters().filter((adapter) => adapter.kind === "dedicated" && adapter.providerIds.includes(providerId));
}

export function providerImportSupport(providerId: ProviderId): {
  dedicated: ImportAdapter[];
  generic: ImportAdapter[];
  status: "dedicated" | "generic-only";
} {
  const dedicated = dedicatedImportAdaptersForProvider(providerId);
  const generic = listImportAdapters().filter((adapter) => adapter.kind === "generic");
  return { dedicated, generic, status: dedicated.length ? "dedicated" : "generic-only" };
}

export function chooseImportAdapter(probe: ImportProbe): { adapter: ImportAdapter; confidence: number } | null {
  const candidates = listImportAdapters()
    .filter((adapter) => adapter.fileExtensions.length === 0 || adapter.fileExtensions.includes(lowerExtension(probe.fileName)) || adapter.id === "generic-text")
    .map((adapter) => {
      try { return { adapter, confidence: adapter.detect(probe) }; }
      catch { return { adapter, confidence: 0 }; }
    })
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence || b.adapter.priority - a.adapter.priority);
  return candidates[0] ?? null;
}
