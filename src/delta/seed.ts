import type {
  DeltaActor, DeltaDocumentSeed, DeltaOriginalInput, DeltaSource, EnsembleRun,
} from "./types";
import { deltaIdSuffix, makeDeltaId } from "./id";

function sourceLabel(provider?: string, model?: string, label?: string): string {
  return label || [provider, model].filter(Boolean).join(" / ") || "AI response";
}

/**
 * Pre-canonical state. This is intentionally NOT a Formal Schema DeltaDocument,
 * because Formal Schema v0.1 requires at least one bundle.
 */
export function createDeltaDocumentSeed(
  run: EnsembleRun,
  options: {
    documentId?: string;
    schemaVersion?: string;
    createdAt?: string;
    humanDisplayName?: string;
  } = {},
): DeltaDocumentSeed {
  const actors = new Map<string, DeltaActor>();
  actors.set(run.query.actor_id, {
    actor_id: run.query.actor_id,
    actor_type: "human",
    display_name: options.humanDisplayName ?? "Local Human",
  });

  for (const p of run.providers) {
    actors.set(p.actor_id, {
      actor_id: p.actor_id, actor_type: "ai",
      display_name: p.label ?? p.model ?? p.provider,
      provider: p.provider ?? null, model: p.model ?? null,
    });
  }

  const original_inputs: DeltaOriginalInput[] = [];
  const sources: DeltaSource[] = [];

  for (const r of run.responses) {
    const hasText = typeof r.content === "string" && r.content.length > 0;
    if ((r.status === "ok" || r.status === "refused") && hasText) {
      const responseSuffix = deltaIdSuffix(r.response_message_id);
      const inputId = makeDeltaId("input", responseSuffix);
      original_inputs.push({
        input_id: inputId,
        query_id: run.query.query_id,
        actor_id: r.actor_id,
        content_type: "text",
        content: r.content!,
        created_at: r.received_at,
      });
      sources.push({
        source_id: makeDeltaId("source", responseSuffix),
        source_type: "original_input",
        input_id: inputId,
        label: sourceLabel(r.provider, r.model, r.label),
      });
    }
  }

  // Formal Schema ID grammar allows exactly one ":" separator.
  // run_id may contain multiple ":" separators, so sanitize the whole suffix.
  const runSuffix = String(run.run_id)
    .replace(/^run:/, "")
    .replace(/[^A-Za-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "run";

  return {
    seed_version: "echo-delta-seed-0.1",
    document_id: options.documentId ?? makeDeltaId("doc", runSuffix),
    schema_version: options.schemaVersion ?? "delta-protocol-schema-0.1",
    created_at: options.createdAt,
    query: run.query,
    actors: Array.from(actors.values()),
    original_inputs,
    sources,
    response_statuses: run.responses.map((r) => ({
      response_message_id: r.response_message_id,
      provider_id: r.provider_id,
      actor_id: r.actor_id,
      status: r.status,
    })),
    run_metadata: {
      run_id: run.run_id,
      run_type: run.run_type,
      context_lineage_key: run.context_lineage_key,
      parent_run_id: run.parent_run_id,
    },
  };
}
