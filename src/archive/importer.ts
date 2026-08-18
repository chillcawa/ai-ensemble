import { chooseImportAdapter, type ImportProbe } from "./registry";
import type { ImportedArchiveConversation } from "./types";

export interface ArchiveImportResult {
  conversations: ImportedArchiveConversation[];
  adapterId: string;
  adapterName: string;
  confidence: number;
}

export async function importArchiveFileDetailed(file: File): Promise<ArchiveImportResult> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  let parsedJson: unknown | undefined;

  if (lower.endsWith(".json") || file.type === "application/json") {
    try {
      parsedJson = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSONを解析できません: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const probe: ImportProbe = {
    fileName: file.name,
    mimeType: file.type,
    text,
    parsedJson,
  };

  const selected = chooseImportAdapter(probe);
  if (!selected) throw new Error("このファイルを扱えるConversation Import翻訳機が見つかりませんでした。");

  const conversations = selected.adapter.parse(probe)
    ?.filter((conversation) => conversation.messages.some((message) => message.content.trim())) ?? [];

  if (!conversations.length) {
    throw new Error(`${selected.adapter.displayName}でインポート可能なメッセージを見つけられませんでした。`);
  }

  return {
    conversations,
    adapterId: selected.adapter.id,
    adapterName: selected.adapter.displayName,
    confidence: selected.confidence,
  };
}

export async function importArchiveFile(file: File): Promise<ImportedArchiveConversation[]> {
  return (await importArchiveFileDetailed(file)).conversations;
}
