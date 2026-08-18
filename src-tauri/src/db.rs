use rusqlite::{
    params, params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DB_FILE: &str = "ai_ensemble.db";

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data directory: {e}"))?;
    Ok(dir.join(DB_FILE))
}

fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path)
        .map_err(|e| format!("failed to open SQLite database {}: {e}", path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("failed to configure SQLite busy timeout: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("failed to enable SQLite foreign keys: {e}"))?;
    Ok(conn)
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS usage_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            cache_hit_input_tokens INTEGER,
            cache_miss_input_tokens INTEGER,
            cost_usd REAL,
            pricing_basis TEXT,
            elapsed_ms INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_usage_records_created_at
            ON usage_records(created_at);
        CREATE INDEX IF NOT EXISTS idx_usage_records_provider
            ON usage_records(provider);

        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
            ON conversations(updated_at DESC);

        CREATE TABLE IF NOT EXISTS conversation_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'normal',
            slot_id TEXT,
            provider TEXT,
            model TEXT,
            nickname TEXT,
            content TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            cost_usd REAL,
            elapsed_ms INTEGER,
            applied_context_ids TEXT NOT NULL DEFAULT '[]',
            applied_ai_reference_sources TEXT NOT NULL DEFAULT '[]',
            target_slot_ids TEXT NOT NULL DEFAULT '[]',
            parent_message_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
            ON conversation_messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_conversation_messages_parent
            ON conversation_messages(parent_message_id);

        CREATE TABLE IF NOT EXISTS comparison_markers (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            paragraph_index INTEGER NOT NULL,
            excerpt TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(message_id, paragraph_index),
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY(message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_comparison_markers_conversation
            ON comparison_markers(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS context_state (
            key TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS text_documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_text_documents_updated_at
            ON text_documents(updated_at DESC);

        CREATE TABLE IF NOT EXISTS import_archives (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            file_name TEXT,
            review_state TEXT NOT NULL DEFAULT 'candidate',
            source_provider TEXT,
            source_model TEXT,
            mapped_slot_id TEXT,
            source_nickname TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_import_archives_project_updated
            ON import_archives(project_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS import_archive_messages (
            id TEXT PRIMARY KEY,
            archive_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'unknown',
            content TEXT NOT NULL,
            author TEXT,
            source_created_at TEXT,
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(archive_id) REFERENCES import_archives(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_import_archive_messages_archive_position
            ON import_archive_messages(archive_id, position);
        "#,
    )
    .map_err(|e| format!("failed to initialize SQLite schema: {e}"))?;

    // v0.9.8: pricing audit fields for cache-aware/effective-dated providers.
    let usage_columns = conn
        .prepare("PRAGMA table_info(usage_records)")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| format!("failed to inspect usage schema: {e}"))?;
    for (name, sql) in [
        (
            "cache_hit_input_tokens",
            "ALTER TABLE usage_records ADD COLUMN cache_hit_input_tokens INTEGER",
        ),
        (
            "cache_miss_input_tokens",
            "ALTER TABLE usage_records ADD COLUMN cache_miss_input_tokens INTEGER",
        ),
        (
            "pricing_basis",
            "ALTER TABLE usage_records ADD COLUMN pricing_basis TEXT",
        ),
    ] {
        if !usage_columns.iter().any(|column| column == name) {
            conn.execute(sql, [])
                .map_err(|e| format!("failed to add usage_records.{name}: {e}"))?;
        }
    }

    // v0.9 migration: conversations become project-scoped. SQLite only supports
    // ADD COLUMN conditionally via schema inspection, so inspect first.
    let has_project_id = conn
        .prepare("PRAGMA table_info(conversations)")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            let names = rows.collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(names.iter().any(|name| name == "project_id"))
        })
        .map_err(|e| format!("failed to inspect conversation schema: {e}"))?;
    if !has_project_id {
        conn.execute("ALTER TABLE conversations ADD COLUMN project_id TEXT NOT NULL DEFAULT 'workspace-default'", [])
            .map_err(|e| format!("failed to add conversations.project_id: {e}"))?;
    }
    conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_project_updated ON conversations(project_id, updated_at DESC)", [])
        .map_err(|e| format!("failed to index conversations.project_id: {e}"))?;

    // v0.9.2 hotfix: preserve immutable AI-reference source snapshots on each
    // message so past observation conditions do not change if Context/Archive
    // metadata is edited or deleted later.
    let message_columns = conn
        .prepare("PRAGMA table_info(conversation_messages)")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| format!("failed to inspect conversation message schema: {e}"))?;
    if !message_columns
        .iter()
        .any(|name| name == "applied_ai_reference_sources")
    {
        conn.execute("ALTER TABLE conversation_messages ADD COLUMN applied_ai_reference_sources TEXT NOT NULL DEFAULT '[]'", [])
            .map_err(|e| format!("failed to add conversation_messages.applied_ai_reference_sources: {e}"))?;
    }

    // Archive source mapping is mutable metadata for future promotions only.
    // Promoted Context and conversation messages carry immutable snapshots.
    let archive_columns = conn
        .prepare("PRAGMA table_info(import_archives)")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| format!("failed to inspect archive schema: {e}"))?;
    for (name, sql) in [
        (
            "review_state",
            "ALTER TABLE import_archives ADD COLUMN review_state TEXT NOT NULL DEFAULT 'candidate'",
        ),
        (
            "source_provider",
            "ALTER TABLE import_archives ADD COLUMN source_provider TEXT",
        ),
        (
            "source_model",
            "ALTER TABLE import_archives ADD COLUMN source_model TEXT",
        ),
        (
            "mapped_slot_id",
            "ALTER TABLE import_archives ADD COLUMN mapped_slot_id TEXT",
        ),
        (
            "source_nickname",
            "ALTER TABLE import_archives ADD COLUMN source_nickname TEXT",
        ),
    ] {
        if !archive_columns.iter().any(|column| column == name) {
            conn.execute(sql, [])
                .map_err(|e| format!("failed to add import_archives.{name}: {e}"))?;
        }
    }

    conn.execute(
        "INSERT OR IGNORE INTO projects (id, name, description) VALUES ('workspace-default', 'Workspace', 'Default workspace')",
        [],
    ).map_err(|e| format!("failed to create default project: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageRecord {
    pub id: i64,
    pub provider: String,
    pub model: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_hit_input_tokens: Option<u32>,
    pub cache_miss_input_tokens: Option<u32>,
    pub cost_usd: Option<f64>,
    pub pricing_basis: Option<String>,
    pub elapsed_ms: Option<u64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct UsageTotals {
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderUsage {
    pub provider: String,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSummary {
    pub today: UsageTotals,
    pub all_time: UsageTotals,
    pub by_provider: Vec<ProviderUsage>,
    pub recent: Vec<UsageRecord>,
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<UsageRecord> {
    Ok(UsageRecord {
        id: row.get(0)?,
        provider: row.get(1)?,
        model: row.get(2)?,
        input_tokens: row.get(3)?,
        output_tokens: row.get(4)?,
        cache_hit_input_tokens: row.get(5)?,
        cache_miss_input_tokens: row.get(6)?,
        cost_usd: row.get(7)?,
        pricing_basis: row.get(8)?,
        elapsed_ms: row.get(9)?,
        created_at: row.get(10)?,
    })
}

fn totals(conn: &Connection, where_clause: Option<&str>) -> Result<UsageTotals, String> {
    let sql = match where_clause {
        Some(clause) => format!(
            "SELECT COUNT(*), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cost_usd), 0) FROM usage_records WHERE {clause}"
        ),
        None => "SELECT COUNT(*), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cost_usd), 0) FROM usage_records".to_string(),
    };

    conn.query_row(&sql, [], |row| {
        Ok(UsageTotals {
            requests: row.get::<_, i64>(0)? as u64,
            input_tokens: row.get::<_, i64>(1)? as u64,
            output_tokens: row.get::<_, i64>(2)? as u64,
            cost_usd: row.get::<_, f64>(3)?,
        })
    })
    .map_err(|e| format!("failed to read usage totals: {e}"))
}

#[allow(clippy::too_many_arguments)]
pub fn record(
    app: &AppHandle,
    provider: &str,
    model: &str,
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_hit_input_tokens: Option<u32>,
    cache_miss_input_tokens: Option<u32>,
    cost_usd: Option<f64>,
    pricing_basis: Option<&str>,
    elapsed_ms: Option<u64>,
) -> Result<i64, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO usage_records (provider, model, input_tokens, output_tokens, cache_hit_input_tokens, cache_miss_input_tokens, cost_usd, pricing_basis, elapsed_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            provider,
            model,
            input_tokens.map(|v| v as i64),
            output_tokens.map(|v| v as i64),
            cache_hit_input_tokens.map(|v| v as i64),
            cache_miss_input_tokens.map(|v| v as i64),
            cost_usd,
            pricing_basis,
            elapsed_ms.map(|v| v as i64),
        ],
    )
    .map_err(|e| format!("failed to record usage: {e}"))?;
    Ok(conn.last_insert_rowid())
}

pub fn summary(app: &AppHandle) -> Result<UsageSummary, String> {
    let conn = open(app)?;
    let today = totals(
        &conn,
        Some("date(created_at, 'localtime') = date('now', 'localtime')"),
    )?;
    let all_time = totals(&conn, None)?;

    let mut stmt = conn
        .prepare(
            "SELECT provider, COUNT(*), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cost_usd), 0) FROM usage_records GROUP BY provider ORDER BY cost_usd DESC, provider ASC",
        )
        .map_err(|e| format!("failed to prepare provider usage query: {e}"))?;

    let by_provider = stmt
        .query_map([], |row| {
            Ok(ProviderUsage {
                provider: row.get(0)?,
                requests: row.get::<_, i64>(1)? as u64,
                input_tokens: row.get::<_, i64>(2)? as u64,
                output_tokens: row.get::<_, i64>(3)? as u64,
                cost_usd: row.get(4)?,
            })
        })
        .map_err(|e| format!("failed to read provider usage: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect provider usage: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, provider, model, input_tokens, output_tokens, cache_hit_input_tokens, cache_miss_input_tokens, cost_usd, pricing_basis, elapsed_ms, created_at FROM usage_records ORDER BY id DESC LIMIT 20",
        )
        .map_err(|e| format!("failed to prepare recent usage query: {e}"))?;

    let recent = stmt
        .query_map([], row_to_record)
        .map_err(|e| format!("failed to read recent usage: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect recent usage: {e}"))?;

    Ok(UsageSummary {
        today,
        all_time,
        by_provider,
        recent,
    })
}

pub fn clear_all(app: &AppHandle) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute("DELETE FROM usage_records", [])
        .map_err(|e| format!("failed to clear usage records: {e}"))?;
    Ok(())
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::from(value),
        ValueRef::Real(value) => Value::from(value),
        ValueRef::Text(value) => Value::String(String::from_utf8_lossy(value).into_owned()),
        ValueRef::Blob(value) => json!({
            "encoding": "hex",
            "data": value.iter().map(|byte| format!("{byte:02x}")).collect::<String>(),
        }),
    }
}

pub fn export_user_data(app: &AppHandle, frontend_settings: Value) -> Result<String, String> {
    let conn = open(app)?;
    conn.execute_batch("BEGIN DEFERRED TRANSACTION")
        .map_err(|e| format!("failed to start user data export snapshot: {e}"))?;
    let mut database = Map::new();
    let export_tables = [
        "conversations",
        "conversation_messages",
        "comparison_markers",
        "projects",
        "context_state",
        "text_documents",
        "import_archives",
        "import_archive_messages",
        "usage_records",
    ];
    for table_name in export_tables {
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM \"{table_name}\""))
            .map_err(|e| format!("failed to prepare export for {table_name}: {e}"))?;
        let column_names = stmt
            .column_names()
            .iter()
            .map(|name| (*name).to_string())
            .collect::<Vec<_>>();
        let mut rows = stmt
            .query([])
            .map_err(|e| format!("failed to query export table {table_name}: {e}"))?;
        let mut exported_rows = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("failed to read export table {table_name}: {e}"))?
        {
            let mut exported_row = Map::new();
            for (index, column_name) in column_names.iter().enumerate() {
                let value = row
                    .get_ref(index)
                    .map_err(|e| format!("failed to read {table_name}.{column_name}: {e}"))?;
                exported_row.insert(column_name.clone(), sqlite_value_to_json(value));
            }
            exported_rows.push(Value::Object(exported_row));
        }
        database.insert(table_name.to_string(), Value::Array(exported_rows));
    }
    conn.execute_batch("COMMIT")
        .map_err(|e| format!("failed to finish user data export snapshot: {e}"))?;

    let exported_at_utc: String = conn
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("failed to create export timestamp: {e}"))?;
    let filename_timestamp: String = conn
        .query_row("SELECT strftime('%Y%m%d_%H%M%S', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("failed to create export filename: {e}"))?;
    let payload = json!({
        "format": "ai-ensemble-user-data",
        "format_version": 1,
        "app_version": env!("CARGO_PKG_VERSION"),
        "exported_at_utc": exported_at_utc,
        "credential_store_api_keys_included": false,
        "content_redaction_performed": false,
        "warning": "This file can contain conversation logs, Context, imported archives, and other sensitive user data.",
        "frontend_settings": frontend_settings,
        "database": Value::Object(database),
    });
    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("failed to serialize user data export: {e}"))?;

    let download_dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("failed to resolve Downloads directory: {e}"))?;
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("failed to create Downloads directory: {e}"))?;
    let mut export_path =
        download_dir.join(format!("AI_Ensemble_export_{filename_timestamp}.json"));
    if export_path.exists() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("failed to create export filename nonce: {e}"))?
            .as_millis();
        export_path = download_dir.join(format!(
            "AI_Ensemble_export_{filename_timestamp}_{nonce}.json"
        ));
    }
    fs::write(&export_path, serialized).map_err(|e| {
        format!(
            "failed to write user data export {}: {e}",
            export_path.display()
        )
    })?;

    Ok(export_path.to_string_lossy().into_owned())
}

fn json_value_to_sqlite(value: &Value, field: &str) -> Result<SqlValue, String> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::Bool(value) => Ok(SqlValue::Integer(if *value { 1 } else { 0 })),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(SqlValue::Integer(value))
            } else if let Some(value) = value.as_f64() {
                Ok(SqlValue::Real(value))
            } else {
                Err(format!("unsupported number in {field}"))
            }
        }
        Value::String(value) => Ok(SqlValue::Text(value.clone())),
        Value::Array(_) | Value::Object(_) => {
            Err(format!("unsupported structured value in {field}"))
        }
    }
}

pub fn import_user_data(app: &AppHandle, payload: Value) -> Result<(), String> {
    let root = payload
        .as_object()
        .ok_or_else(|| "restore payload must be an object".to_string())?;
    if root.get("format").and_then(Value::as_str) != Some("ai-ensemble-user-data")
        || root.get("format_version").and_then(Value::as_u64) != Some(1)
    {
        return Err("unsupported AI Ensemble export format".into());
    }
    let database = root
        .get("database")
        .and_then(Value::as_object)
        .ok_or_else(|| "restore payload is missing database".to_string())?;
    let insert_order = [
        "projects",
        "conversations",
        "conversation_messages",
        "comparison_markers",
        "context_state",
        "text_documents",
        "import_archives",
        "import_archive_messages",
        "usage_records",
    ];
    for table in insert_order {
        if !database.get(table).is_some_and(Value::is_array) {
            return Err(format!("restore payload is missing database.{table}"));
        }
    }
    let has_default_project = database["projects"].as_array().is_some_and(|rows| {
        rows.iter()
            .any(|row| row.get("id").and_then(Value::as_str) == Some("workspace-default"))
    });
    if !has_default_project {
        return Err("restore payload is missing the default Workspace".into());
    }

    let mut conn = open(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start user data restore: {e}"))?;
    for table in [
        "comparison_markers",
        "conversation_messages",
        "conversations",
        "import_archive_messages",
        "import_archives",
        "context_state",
        "text_documents",
        "usage_records",
        "projects",
    ] {
        tx.execute(&format!("DELETE FROM \"{table}\""), [])
            .map_err(|e| format!("failed to clear {table} during restore: {e}"))?;
    }

    for table in insert_order {
        let allowed_columns = {
            let mut stmt = tx
                .prepare(&format!("PRAGMA table_info(\"{table}\")"))
                .map_err(|e| format!("failed to inspect restore table {table}: {e}"))?;
            let columns = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| format!("failed to read restore columns for {table}: {e}"))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("failed to collect restore columns for {table}: {e}"))?;
            columns
        };
        let rows = database[table]
            .as_array()
            .ok_or_else(|| format!("database.{table} is invalid"))?;
        for (row_index, row) in rows.iter().enumerate() {
            let row = row
                .as_object()
                .ok_or_else(|| format!("database.{table}[{row_index}] must be an object"))?;
            if row.is_empty() {
                return Err(format!("database.{table}[{row_index}] is empty"));
            }
            for column in row.keys() {
                if !allowed_columns.contains(column) {
                    return Err(format!("unknown restore column {table}.{column}"));
                }
            }
            let columns = row.keys().cloned().collect::<Vec<_>>();
            let quoted_columns = columns
                .iter()
                .map(|column| format!("\"{}\"", column.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(", ");
            let placeholders = (1..=columns.len())
                .map(|index| format!("?{index}"))
                .collect::<Vec<_>>()
                .join(", ");
            let values = columns
                .iter()
                .map(|column| json_value_to_sqlite(&row[column], &format!("{table}.{column}")))
                .collect::<Result<Vec<_>, _>>()?;
            tx.execute(
                &format!("INSERT INTO \"{table}\" ({quoted_columns}) VALUES ({placeholders})"),
                params_from_iter(values),
            )
            .map_err(|e| format!("failed to restore database.{table}[{row_index}]: {e}"))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("failed to commit user data restore: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub project_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConversationMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub kind: String,
    pub slot_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub nickname: Option<String>,
    pub content: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cost_usd: Option<f64>,
    pub elapsed_ms: Option<u64>,
    pub applied_context_ids: String,
    pub applied_ai_reference_sources: String,
    pub target_slot_ids: String,
    pub parent_message_id: Option<String>,
    pub created_at: String,
}

fn conversation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationSummary> {
    Ok(ConversationSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        project_id: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn conversation_message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationMessage> {
    Ok(ConversationMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        kind: row.get(3)?,
        slot_id: row.get(4)?,
        provider: row.get(5)?,
        model: row.get(6)?,
        nickname: row.get(7)?,
        content: row.get(8)?,
        input_tokens: row.get(9)?,
        output_tokens: row.get(10)?,
        cost_usd: row.get(11)?,
        elapsed_ms: row.get(12)?,
        applied_context_ids: row.get(13)?,
        applied_ai_reference_sources: row.get(14)?,
        target_slot_ids: row.get(15)?,
        parent_message_id: row.get(16)?,
        created_at: row.get(17)?,
    })
}

pub fn create_conversation(
    app: &AppHandle,
    id: &str,
    title: &str,
    project_id: &str,
) -> Result<ConversationSummary, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT OR IGNORE INTO conversations (id, title, project_id) VALUES (?1, ?2, ?3)",
        params![id, title, project_id],
    )
    .map_err(|e| format!("failed to create conversation: {e}"))?;
    conn.query_row(
        "SELECT id, title, project_id, created_at, updated_at FROM conversations WHERE id = ?1",
        params![id],
        conversation_from_row,
    )
    .map_err(|e| format!("failed to read created conversation: {e}"))
}

pub fn list_conversations(
    app: &AppHandle,
    project_id: &str,
) -> Result<Vec<ConversationSummary>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, project_id, created_at, updated_at FROM conversations WHERE project_id = ?1 ORDER BY updated_at DESC, rowid DESC"
    ).map_err(|e| format!("failed to prepare conversation list: {e}"))?;
    let rows = stmt
        .query_map(params![project_id], conversation_from_row)
        .map_err(|e| format!("failed to list conversations: {e}"))?;
    let conversations = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect conversations: {e}"))?;
    Ok(conversations)
}

#[allow(clippy::too_many_arguments)]
pub fn append_conversation_message(
    app: &AppHandle,
    id: &str,
    conversation_id: &str,
    role: &str,
    kind: &str,
    slot_id: Option<&str>,
    provider: Option<&str>,
    model: Option<&str>,
    nickname: Option<&str>,
    content: &str,
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cost_usd: Option<f64>,
    elapsed_ms: Option<u64>,
    applied_context_ids: &str,
    applied_ai_reference_sources: &str,
    target_slot_ids: &str,
    parent_message_id: Option<&str>,
) -> Result<ConversationMessage, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO conversation_messages (id, conversation_id, role, kind, slot_id, provider, model, nickname, content, input_tokens, output_tokens, cost_usd, elapsed_ms, applied_context_ids, applied_ai_reference_sources, target_slot_ids, parent_message_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![id, conversation_id, role, kind, slot_id, provider, model, nickname, content, input_tokens.map(|v| v as i64), output_tokens.map(|v| v as i64), cost_usd, elapsed_ms.map(|v| v as i64), applied_context_ids, applied_ai_reference_sources, target_slot_ids, parent_message_id],
    ).map_err(|e| format!("failed to append conversation message: {e}"))?;
    conn.execute(
        "UPDATE conversations SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("failed to touch conversation: {e}"))?;
    conn.query_row(
        "SELECT id, conversation_id, role, kind, slot_id, provider, model, nickname, content, input_tokens, output_tokens, cost_usd, elapsed_ms, applied_context_ids, applied_ai_reference_sources, target_slot_ids, parent_message_id, created_at FROM conversation_messages WHERE id = ?1",
        params![id], conversation_message_from_row,
    ).map_err(|e| format!("failed to read appended conversation message: {e}"))
}

pub fn get_conversation_messages(
    app: &AppHandle,
    conversation_id: &str,
) -> Result<Vec<ConversationMessage>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, kind, slot_id, provider, model, nickname, content, input_tokens, output_tokens, cost_usd, elapsed_ms, applied_context_ids, applied_ai_reference_sources, target_slot_ids, parent_message_id, created_at FROM conversation_messages WHERE conversation_id = ?1 ORDER BY datetime(created_at) ASC, rowid ASC"
    ).map_err(|e| format!("failed to prepare conversation messages: {e}"))?;
    let rows = stmt
        .query_map(params![conversation_id], conversation_message_from_row)
        .map_err(|e| format!("failed to read conversation messages: {e}"))?;
    let messages = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect conversation messages: {e}"))?;
    Ok(messages)
}

pub fn rename_conversation(
    app: &AppHandle,
    conversation_id: &str,
    title: &str,
) -> Result<ConversationSummary, String> {
    let conn = open(app)?;
    conn.execute(
        "UPDATE conversations SET title = ?2 WHERE id = ?1",
        params![conversation_id, title],
    )
    .map_err(|e| format!("failed to rename conversation: {e}"))?;
    conn.query_row(
        "SELECT id, title, project_id, created_at, updated_at FROM conversations WHERE id = ?1",
        params![conversation_id],
        conversation_from_row,
    )
    .map_err(|e| format!("failed to read renamed conversation: {e}"))
}

pub fn move_conversation(
    app: &AppHandle,
    conversation_id: &str,
    project_id: &str,
) -> Result<ConversationSummary, String> {
    let conn = open(app)?;
    let project_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("failed to validate target project: {e}"))?;
    if project_exists == 0 {
        return Err(format!("target project '{project_id}' does not exist"));
    }
    conn.execute(
        "UPDATE conversations SET project_id = ?2, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?1",
        params![conversation_id, project_id],
    ).map_err(|e| format!("failed to move conversation: {e}"))?;
    conn.query_row(
        "SELECT id, title, project_id, created_at, updated_at FROM conversations WHERE id = ?1",
        params![conversation_id],
        conversation_from_row,
    )
    .map_err(|e| format!("failed to read moved conversation: {e}"))
}

pub fn delete_conversation(app: &AppHandle, conversation_id: &str) -> Result<(), String> {
    let mut conn = open(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start delete transaction: {e}"))?;
    tx.execute(
        "DELETE FROM conversation_messages WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("failed to delete conversation messages: {e}"))?;
    tx.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("failed to delete conversation: {e}"))?;
    tx.commit()
        .map_err(|e| format!("failed to commit conversation delete: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn list_projects(app: &AppHandle) -> Result<Vec<ProjectRecord>, String> {
    let conn = open(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, created_at, updated_at
         FROM projects
         ORDER BY updated_at DESC, rowid DESC",
        )
        .map_err(|e| format!("failed to prepare projects: {e}"))?;

    let rows = stmt
        .query_map([], project_from_row)
        .map_err(|e| format!("failed to list projects: {e}"))?;

    let projects = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect projects: {e}"))?;

    Ok(projects)
}

pub fn create_project(
    app: &AppHandle,
    id: &str,
    name: &str,
    description: &str,
) -> Result<ProjectRecord, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO projects (id, name, description) VALUES (?1, ?2, ?3)",
        params![id, name, description],
    )
    .map_err(|e| format!("failed to create project: {e}"))?;
    conn.query_row(
        "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        project_from_row,
    )
    .map_err(|e| format!("failed to read project: {e}"))
}

pub fn rename_project(
    app: &AppHandle,
    project_id: &str,
    name: &str,
) -> Result<ProjectRecord, String> {
    let conn = open(app)?;
    conn.execute("UPDATE projects SET name = ?2, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?1", params![project_id, name])
        .map_err(|e| format!("failed to rename project: {e}"))?;
    conn.query_row(
        "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1",
        params![project_id],
        project_from_row,
    )
    .map_err(|e| format!("failed to read renamed project: {e}"))
}

pub fn delete_project(app: &AppHandle, project_id: &str) -> Result<(), String> {
    if project_id == "workspace-default" {
        return Err("default Workspace cannot be deleted".into());
    }
    let mut conn = open(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start project delete transaction: {e}"))?;
    tx.execute(
        "UPDATE conversations SET project_id = 'workspace-default' WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| format!("failed to move conversations: {e}"))?;
    tx.execute("DELETE FROM projects WHERE id = ?1", params![project_id])
        .map_err(|e| format!("failed to delete project: {e}"))?;
    tx.commit()
        .map_err(|e| format!("failed to commit project delete: {e}"))
}

pub fn load_state_json(app: &AppHandle, key: &str, fallback: &str) -> Result<String, String> {
    let conn = open(app)?;
    match conn.query_row(
        "SELECT json FROM context_state WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    ) {
        Ok(value) => Ok(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(fallback.to_string()),
        Err(e) => Err(format!("failed to load context state {key}: {e}")),
    }
}

pub fn has_state_key(app: &AppHandle, key: &str) -> Result<bool, String> {
    let conn = open(app)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM context_state WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .map_err(|e| format!("failed to inspect context state {key}: {e}"))?;
    Ok(count > 0)
}

pub fn save_state_json(app: &AppHandle, key: &str, json: &str) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO context_state (key, json, updated_at) VALUES (?1, ?2, strftime('%Y-%m-%d %H:%M:%f', 'now')) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        params![key, json],
    ).map_err(|e| format!("failed to save context state {key}: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ComparisonMarkerRecord {
    pub id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub paragraph_index: i64,
    pub excerpt: String,
    pub created_at: String,
}

fn comparison_marker_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ComparisonMarkerRecord> {
    Ok(ComparisonMarkerRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        message_id: row.get(2)?,
        paragraph_index: row.get(3)?,
        excerpt: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn list_comparison_markers(
    app: &AppHandle,
    conversation_id: &str,
) -> Result<Vec<ComparisonMarkerRecord>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, message_id, paragraph_index, excerpt, created_at FROM comparison_markers WHERE conversation_id = ?1 ORDER BY datetime(created_at) ASC, rowid ASC"
    ).map_err(|e| format!("failed to prepare comparison markers: {e}"))?;
    let rows = stmt
        .query_map(params![conversation_id], comparison_marker_from_row)
        .map_err(|e| format!("failed to list comparison markers: {e}"))?;
    let markers = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect comparison markers: {e}"))?;
    Ok(markers)
}

pub fn add_comparison_marker(
    app: &AppHandle,
    id: &str,
    conversation_id: &str,
    message_id: &str,
    paragraph_index: i64,
    excerpt: &str,
) -> Result<ComparisonMarkerRecord, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO comparison_markers (id, conversation_id, message_id, paragraph_index, excerpt) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, conversation_id, message_id, paragraph_index, excerpt],
    ).map_err(|e| format!("failed to add comparison marker: {e}"))?;
    conn.query_row(
        "SELECT id, conversation_id, message_id, paragraph_index, excerpt, created_at FROM comparison_markers WHERE message_id = ?1 AND paragraph_index = ?2",
        params![message_id, paragraph_index],
        comparison_marker_from_row,
    ).map_err(|e| format!("failed to read comparison marker: {e}"))
}

pub fn delete_comparison_marker(
    app: &AppHandle,
    message_id: &str,
    paragraph_index: i64,
) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute(
        "DELETE FROM comparison_markers WHERE message_id = ?1 AND paragraph_index = ?2",
        params![message_id, paragraph_index],
    )
    .map_err(|e| format!("failed to delete comparison marker: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentRecord {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

fn text_document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TextDocumentRecord> {
    Ok(TextDocumentRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn list_text_documents(app: &AppHandle) -> Result<Vec<TextDocumentRecord>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, content, created_at, updated_at FROM text_documents ORDER BY updated_at DESC, rowid DESC"
    ).map_err(|e| format!("failed to prepare text documents: {e}"))?;
    let rows = stmt
        .query_map([], text_document_from_row)
        .map_err(|e| format!("failed to list text documents: {e}"))?;
    let documents = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect text documents: {e}"))?;
    Ok(documents)
}

pub fn create_text_document(
    app: &AppHandle,
    id: &str,
    title: &str,
    content: &str,
) -> Result<TextDocumentRecord, String> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO text_documents (id, title, content) VALUES (?1, ?2, ?3)",
        params![id, title, content],
    )
    .map_err(|e| format!("failed to create text document: {e}"))?;
    conn.query_row(
        "SELECT id, title, content, created_at, updated_at FROM text_documents WHERE id = ?1",
        params![id],
        text_document_from_row,
    )
    .map_err(|e| format!("failed to read text document: {e}"))
}

pub fn update_text_document(
    app: &AppHandle,
    id: &str,
    title: &str,
    content: &str,
) -> Result<TextDocumentRecord, String> {
    let conn = open(app)?;
    conn.execute(
        "UPDATE text_documents SET title = ?2, content = ?3, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?1",
        params![id, title, content],
    ).map_err(|e| format!("failed to update text document: {e}"))?;
    conn.query_row(
        "SELECT id, title, content, created_at, updated_at FROM text_documents WHERE id = ?1",
        params![id],
        text_document_from_row,
    )
    .map_err(|e| format!("failed to read updated text document: {e}"))
}

pub fn delete_text_document(app: &AppHandle, id: &str) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute("DELETE FROM text_documents WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete text document: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMessageInput {
    pub role: String,
    pub content: String,
    pub author: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveConversationRecord {
    pub id: String,
    pub project_id: String,
    pub source: String,
    pub title: String,
    pub file_name: Option<String>,
    pub review_state: String,
    pub source_provider: Option<String>,
    pub source_model: Option<String>,
    pub mapped_slot_id: Option<String>,
    pub source_nickname: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMessageRecord {
    pub id: String,
    pub archive_id: String,
    pub role: String,
    pub content: String,
    pub author: Option<String>,
    pub created_at: Option<String>,
    pub position: u32,
}

fn archive_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArchiveConversationRecord> {
    Ok(ArchiveConversationRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source: row.get(2)?,
        title: row.get(3)?,
        file_name: row.get(4)?,
        review_state: row.get(5)?,
        source_provider: row.get(6)?,
        source_model: row.get(7)?,
        mapped_slot_id: row.get(8)?,
        source_nickname: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        message_count: row.get(12)?,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn save_archive_conversation(
    app: &AppHandle,
    project_id: &str,
    source: &str,
    title: &str,
    file_name: Option<&str>,
    source_provider: Option<&str>,
    source_model: Option<&str>,
    messages: &[ArchiveMessageInput],
) -> Result<ArchiveConversationRecord, String> {
    let mut conn = open(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin archive transaction: {e}"))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("system clock error: {e}"))?
        .as_nanos();
    let archive_id = format!("archive-{nonce}");
    tx.execute(
        "INSERT INTO import_archives (id, project_id, source, title, file_name, source_provider, source_model) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![&archive_id, project_id, source, title, file_name, source_provider, source_model],
    ).map_err(|e| format!("failed to save archive: {e}"))?;
    for (index, message) in messages.iter().enumerate() {
        let message_id = format!("archive-message-{nonce}-{index}");
        tx.execute(
            "INSERT INTO import_archive_messages (id, archive_id, role, content, author, source_created_at, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![message_id, &archive_id, &message.role, &message.content, message.author.as_deref(), message.created_at.as_deref(), index as i64],
        ).map_err(|e| format!("failed to save archive message: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("failed to commit archive: {e}"))?;
    get_archive_conversation(app, &archive_id)
}

fn get_archive_conversation(
    app: &AppHandle,
    archive_id: &str,
) -> Result<ArchiveConversationRecord, String> {
    let conn = open(app)?;
    conn.query_row(
        "SELECT a.id, a.project_id, a.source, a.title, a.file_name, a.review_state, a.source_provider, a.source_model, a.mapped_slot_id, a.source_nickname, a.created_at, a.updated_at, COUNT(m.id) AS message_count FROM import_archives a LEFT JOIN import_archive_messages m ON m.archive_id = a.id WHERE a.id = ?1 GROUP BY a.id",
        params![archive_id],
        archive_from_row,
    ).map_err(|e| format!("failed to read archive: {e}"))
}

pub fn list_archive_conversations(
    app: &AppHandle,
    project_id: &str,
) -> Result<Vec<ArchiveConversationRecord>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.project_id, a.source, a.title, a.file_name, a.review_state, a.source_provider, a.source_model, a.mapped_slot_id, a.source_nickname, a.created_at, a.updated_at, COUNT(m.id) AS message_count FROM import_archives a LEFT JOIN import_archive_messages m ON m.archive_id = a.id WHERE a.project_id = ?1 GROUP BY a.id ORDER BY a.updated_at DESC, a.rowid DESC"
    ).map_err(|e| format!("failed to prepare archives: {e}"))?;
    let rows = stmt
        .query_map(params![project_id], archive_from_row)
        .map_err(|e| format!("failed to list archives: {e}"))?;
    let result = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect archives: {e}"))?;
    Ok(result)
}

pub fn get_archive_messages(
    app: &AppHandle,
    archive_id: &str,
) -> Result<Vec<ArchiveMessageRecord>, String> {
    let conn = open(app)?;
    let mut stmt = conn.prepare(
        "SELECT id, archive_id, role, content, author, source_created_at, position FROM import_archive_messages WHERE archive_id = ?1 ORDER BY position ASC"
    ).map_err(|e| format!("failed to prepare archive messages: {e}"))?;
    let rows = stmt
        .query_map(params![archive_id], |row| {
            Ok(ArchiveMessageRecord {
                id: row.get(0)?,
                archive_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                author: row.get(4)?,
                created_at: row.get(5)?,
                position: row.get(6)?,
            })
        })
        .map_err(|e| format!("failed to list archive messages: {e}"))?;
    let result = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to collect archive messages: {e}"))?;
    Ok(result)
}

pub fn update_archive_source_mapping(
    app: &AppHandle,
    archive_id: &str,
    provider: Option<&str>,
    model: Option<&str>,
    mapped_slot_id: Option<&str>,
    nickname: Option<&str>,
) -> Result<ArchiveConversationRecord, String> {
    let conn = open(app)?;
    conn.execute(
        "UPDATE import_archives SET source_provider = ?2, source_model = ?3, mapped_slot_id = ?4, source_nickname = ?5, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?1",
        params![archive_id, provider, model, mapped_slot_id, nickname],
    ).map_err(|e| format!("failed to update archive source mapping: {e}"))?;
    get_archive_conversation(app, archive_id)
}

pub fn delete_archive_conversation(app: &AppHandle, archive_id: &str) -> Result<(), String> {
    let conn = open(app)?;
    conn.execute(
        "DELETE FROM import_archives WHERE id = ?1",
        params![archive_id],
    )
    .map_err(|e| format!("failed to delete archive: {e}"))?;
    Ok(())
}
