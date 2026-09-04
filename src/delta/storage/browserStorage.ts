import type {
  DeltaAnalysisRecord,
  DeltaAnalysisStorage,
} from "./types";

const STORAGE_KEY = "echo.delta.analysis.v0.1.records";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function available(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): DeltaAnalysisRecord[] {
  if (!available()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: DeltaAnalysisRecord[]) {
  if (!available()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    throw new Error(
      `Delta Storage: failed to persist analysis (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/**
 * Delta v0.1 browser-side persistence.
 *
 * Append-only by analysis_id.
 * Kept outside Conversation persistence, so Delta failure/history cannot mutate
 * ECHO's canonical Conversation log.
 *
 * A future SQLite adapter can implement the same DeltaAnalysisStorage contract.
 */
export class BrowserDeltaAnalysisStorage implements DeltaAnalysisStorage {
  async save(record: DeltaAnalysisRecord): Promise<void> {
    const records = readAll();
    if (records.some((item) => item.analysis_id === record.analysis_id)) {
      throw new Error(
        `Delta Storage: append-only violation for analysis_id ${record.analysis_id}`,
      );
    }
    records.push(clone(record));
    writeAll(records);
  }

  async get(analysisId: string): Promise<DeltaAnalysisRecord | undefined> {
    const value = readAll().find((item) => item.analysis_id === analysisId);
    return value ? clone(value) : undefined;
  }

  async listByTurn(
    conversationId: string,
    turnId: string,
  ): Promise<DeltaAnalysisRecord[]> {
    return readAll()
      .filter(
        (item) =>
          item.conversation_id === conversationId && item.turn_id === turnId,
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(clone);
  }

  async getLatestByTurn(
    conversationId: string,
    turnId: string,
  ): Promise<DeltaAnalysisRecord | undefined> {
    const list = await this.listByTurn(conversationId, turnId);
    return list.length ? list[list.length - 1] : undefined;
  }
}

export function newDeltaAnalysisId(): string {
  const suffix =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `analysis:${suffix}`;
}
