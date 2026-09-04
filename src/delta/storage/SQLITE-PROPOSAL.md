# Delta SQLite proposal

This is an implementation proposal, not a protocol schema change.

Recommended table:

```sql
CREATE TABLE delta_analyses (
  analysis_id TEXT PRIMARY KEY,
  parent_analysis_id TEXT,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  query_message_id TEXT NOT NULL,
  response_message_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  json_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_delta_analyses_turn
ON delta_analyses(conversation_id, turn_id, created_at);
```

Rules:

- Never overwrite an existing `analysis_id`.
- Re-analysis creates a new row and may point to `parent_analysis_id`.
- Conversation remains authoritative raw history.
- Delta payload is derived.
- New provider output after Resolution changes integration/UI state to `REVIEW_REQUIRED`; it does not mutate the old Resolution.
