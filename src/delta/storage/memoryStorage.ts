import type {
  DeltaAnalysisRecord,
  DeltaAnalysisStorage,
} from "./types";

/**
 * Reference implementation for tests and UI wiring.
 * Real ECHO integration should replace this with SQLite-backed storage.
 */
export class InMemoryDeltaAnalysisStorage implements DeltaAnalysisStorage {
  private readonly records = new Map<string, DeltaAnalysisRecord>();

  async save(record: DeltaAnalysisRecord): Promise<void> {
    if (this.records.has(record.analysis_id)) {
      throw new Error(`Delta Storage: append-only violation for analysis_id ${record.analysis_id}`);
    }
    this.records.set(record.analysis_id, structuredClone(record));
  }

  async get(analysisId: string): Promise<DeltaAnalysisRecord | undefined> {
    const value = this.records.get(analysisId);
    return value ? structuredClone(value) : undefined;
  }

  async listByTurn(conversationId: string, turnId: string): Promise<DeltaAnalysisRecord[]> {
    return Array.from(this.records.values())
      .filter((r) => r.conversation_id === conversationId && r.turn_id === turnId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => structuredClone(r));
  }

  async getLatestByTurn(conversationId: string, turnId: string): Promise<DeltaAnalysisRecord | undefined> {
    const list = await this.listByTurn(conversationId, turnId);
    return list.length ? list[list.length - 1] : undefined;
  }
}
