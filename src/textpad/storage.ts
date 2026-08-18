import { invoke } from "@tauri-apps/api/core";

export interface TextDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function listTextDocuments(): Promise<TextDocument[]> {
  return invoke<TextDocument[]>("list_text_documents");
}

export async function createTextDocument(id: string, title: string, content = ""): Promise<TextDocument> {
  return invoke<TextDocument>("create_text_document", { id, title, content });
}

export async function updateTextDocument(id: string, title: string, content: string): Promise<TextDocument> {
  return invoke<TextDocument>("update_text_document", { id, title, content });
}

export async function deleteTextDocument(id: string): Promise<void> {
  return invoke("delete_text_document", { id });
}
