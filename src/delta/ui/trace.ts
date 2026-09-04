import type { CanonicalDeltaDocument } from "../translator/types";

export interface DeltaTraceTarget {
  item_id: string;
  source_span_ids: string[];
  original_input_ids: string[];
}

export function traceClaimToSource(
  doc: CanonicalDeltaDocument,
  claimId: string,
): {
  claim?: any;
  source_spans: any[];
  original_inputs: any[];
} {
  let claim: any;
  for (const bundle of doc.bundles as any[]) {
    claim = bundle.claims?.find((c: any) => c.claim_id === claimId);
    if (claim) break;
  }

  if (!claim) return { claim: undefined, source_spans: [], original_inputs: [] };

  const spanIds = new Set<string>(claim.provenance?.source_span_ids || []);
  const inputIds = new Set<string>(claim.provenance?.original_input_ids || []);

  return {
    claim,
    source_spans: (doc.source_spans as any[]).filter((s) => spanIds.has(s.source_span_id)),
    original_inputs: (doc.original_inputs as any[]).filter((i) => inputIds.has(i.input_id)),
  };
}
