import { invoke } from "@tauri-apps/api/core";
import type { ContextItem } from "./types";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface ImportedContextFile {
  title: string;
  kind: "text" | "markdown" | "document";
  content: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function importContextFile(file: File): Promise<ImportedContextFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("ファイルが大きすぎます。v0.9では20MB以下にしてください。");
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".txt")) {
    return { title: file.name, kind: "text", content: await file.text(), fileName: file.name, fileSize: file.size, mimeType: file.type || "text/plain" };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return { title: file.name, kind: "markdown", content: await file.text(), fileName: file.name, fileSize: file.size, mimeType: file.type || "text/markdown" };
  }
  if (lower.endsWith(".pdf")) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const content = await invoke<string>("extract_pdf_text", { bytes });
    if (!content.trim()) {
      throw new Error("PDFからテキストを抽出できませんでした。画像ベースPDF/OCRはまだ未対応です。");
    }
    return { title: file.name, kind: "document", content, fileName: file.name, fileSize: file.size, mimeType: file.type || "application/pdf" };
  }
  throw new Error("対応形式は TXT / MD / PDF です。");
}

export function importedFileToContext(input: ImportedContextFile, projectId: string): ContextItem {
  const now = new Date().toISOString();
  return {
    id: `context-file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: input.kind,
    role: "reference",
    scope: "project",
    lifetime: "persistent",
    provenance: "external_document",
    title: input.title,
    content: input.content,
    enabled: true,
    projectId,
    source: { fileName: input.fileName, fileSize: input.fileSize, mimeType: input.mimeType },
    createdAt: now,
    updatedAt: now,
  };
}
