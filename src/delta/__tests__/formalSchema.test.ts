import { describe, expect, it } from "vitest";
import { validateDeltaDocumentFormalSchema } from "../schema/validateFormalSchema";

const officialExample = {
  "schema_version": "delta-protocol-schema-0.1",
  "document_id": "doc:demo01",
  "created_at": "2026-09-01T22:00:00+09:00",
  "query": {
    "query_id": "query:q001",
    "text": "DeadlockはRequired語として残すべきか？",
    "actor_id": "actor:human01"
  },
  "actors": [
    {
      "actor_id": "actor:human01",
      "actor_type": "human",
      "display_name": "Human Reviewer"
    },
    {
      "actor_id": "actor:grok",
      "actor_type": "ai",
      "display_name": "Grok",
      "provider": "xAI"
    },
    {
      "actor_id": "actor:claude",
      "actor_type": "ai",
      "display_name": "Claude",
      "provider": "Anthropic"
    }
  ],
  "original_inputs": [
    {
      "input_id": "input:grok01",
      "query_id": "query:q001",
      "actor_id": "actor:grok",
      "content_type": "text",
      "content": "DeadlockはRequired語でもよいが、Unresolvedのデフォルト状態にしてはいけない。"
    },
    {
      "input_id": "input:claude01",
      "query_id": "query:q001",
      "actor_id": "actor:claude",
      "content_type": "text",
      "content": "DeadlockはRequired語として残しつつ、Unresolvedの下位状態として扱うべき。"
    }
  ],
  "sources": [
    {
      "source_id": "source:grok01",
      "source_type": "original_input",
      "input_id": "input:grok01",
      "label": "Grok response"
    },
    {
      "source_id": "source:claude01",
      "source_type": "original_input",
      "input_id": "input:claude01",
      "label": "Claude response"
    }
  ],
  "source_spans": [
    {
      "source_span_id": "span:grok01",
      "source_id": "source:grok01",
      "locator": {
        "kind": "char_range",
        "char_start": 0,
        "char_end": 44
      },
      "quote_hint": "Unresolvedのデフォルト状態にしてはいけない"
    },
    {
      "source_span_id": "span:claude01",
      "source_id": "source:claude01",
      "locator": {
        "kind": "char_range",
        "char_start": 0,
        "char_end": 43
      },
      "quote_hint": "Unresolvedの下位状態として扱うべき"
    }
  ],
  "bundles": [
    {
      "bundle_id": "bundle:grok01",
      "query_id": "query:q001",
      "actor_id": "actor:grok",
      "original_input_id": "input:grok01",
      "claims": [
        {
          "claim_id": "claim:grok01",
          "actor_id": "actor:grok",
          "text": "DeadlockはUnresolvedのデフォルト状態ではない。",
          "provenance": {
            "query_id": "query:q001",
            "source_span_ids": [
              "span:grok01"
            ],
            "derived_from_ids": [],
            "transformation": "extraction",
            "original_input_ids": [
              "input:grok01"
            ]
          },
          "confidence": {
            "type": "extraction",
            "value": 94,
            "unit": "percent",
            "basis": "source span directly states the distinction"
          },
          "evidentiary_status": "sufficient",
          "assumption_ids": [],
          "condition_ids": [],
          "scope_ids": [],
          "evidence_ids": [
            "support:grok-e01"
          ],
          "observation_ids": []
        }
      ],
      "support": [
        {
          "support_id": "support:grok-e01",
          "kind": "evidence",
          "actor_id": "actor:grok",
          "text": "Unresolved単体を正式状態として許すため、Deadlockは既定値ではない。",
          "provenance": {
            "query_id": "query:q001",
            "source_span_ids": [
              "span:grok01"
            ],
            "derived_from_ids": [
              "claim:grok01"
            ],
            "transformation": "extraction",
            "original_input_ids": [
              "input:grok01"
            ]
          },
          "claim_ids": [
            "claim:grok01"
          ]
        }
      ],
      "semantics": [],
      "hypotheses": [],
      "interpretations": [],
      "dissents": [],
      "counterpositions": []
    },
    {
      "bundle_id": "bundle:claude01",
      "query_id": "query:q001",
      "actor_id": "actor:claude",
      "original_input_id": "input:claude01",
      "claims": [
        {
          "claim_id": "claim:claude01",
          "actor_id": "actor:claude",
          "text": "DeadlockはRequired語として残すべきである。",
          "provenance": {
            "query_id": "query:q001",
            "source_span_ids": [
              "span:claude01"
            ],
            "derived_from_ids": [],
            "transformation": "extraction",
            "original_input_ids": [
              "input:claude01"
            ]
          },
          "confidence": {
            "type": "self_report",
            "qualitative": "high",
            "basis": "core vocabulary consistency"
          },
          "evidentiary_status": "not_assessed",
          "assumption_ids": [],
          "condition_ids": [],
          "scope_ids": [],
          "evidence_ids": [],
          "observation_ids": []
        }
      ],
      "support": [],
      "semantics": [],
      "hypotheses": [],
      "interpretations": [],
      "dissents": [],
      "counterpositions": []
    }
  ],
  "relations": [
    {
      "relation_id": "relation:r001",
      "kind": "conditional_agreement",
      "actor_id": "actor:grok",
      "target_ids": [
        "claim:grok01",
        "claim:claude01"
      ],
      "condition_ids": [],
      "scope_ids": [],
      "confidence": {
        "type": "comparison",
        "qualitative": "high",
        "basis": "both distinguish dictionary inclusion from default state"
      },
      "provenance": {
        "query_id": "query:q001",
        "source_span_ids": [
          "span:grok01",
          "span:claude01"
        ],
        "derived_from_ids": [
          "claim:grok01",
          "claim:claude01"
        ],
        "transformation": "comparison",
        "original_input_ids": [
          "input:grok01",
          "input:claude01"
        ]
      },
      "note": "Agreement exists if Required means dictionary inclusion, not state default."
    }
  ],
  "unresolved_states": [
    {
      "state_id": "state:s001",
      "target_ids": [
        "claim:grok01",
        "claim:claude01"
      ],
      "unresolved": true,
      "states": [
        "divergence"
      ],
      "note": "Human decision not yet recorded."
    }
  ],
  "resolution_candidates": [
    {
      "candidate_id": "candidate:c001",
      "actor_id": "actor:grok",
      "proposal": "DeadlockをRequired語として残し、Unresolvedのデフォルト値にはしない。",
      "target_ids": [
        "claim:grok01",
        "claim:claude01"
      ],
      "suggested_decision": "accept",
      "provenance": {
        "query_id": "query:q001",
        "source_span_ids": [
          "span:grok01",
          "span:claude01"
        ],
        "derived_from_ids": [
          "claim:grok01",
          "claim:claude01"
        ],
        "transformation": "comparison",
        "original_input_ids": [
          "input:grok01",
          "input:claude01"
        ]
      },
      "confidence": {
        "type": "comparison",
        "value": 91,
        "unit": "percent"
      },
      "actor_type": "ai"
    }
  ],
  "resolutions": [],
  "revisions": [],
  "decision_history": [],
  "followups": []
};

describe("Delta Formal Schema v0.1 gate", () => {
  it("accepts the official FIXED example", () => {
    const result = validateDeltaDocumentFormalSchema(officialExample);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a non-canonical shell without bundles", () => {
    const broken = { ...officialExample, bundles: [] };
    const result = validateDeltaDocumentFormalSchema(broken);
    expect(result.valid).toBe(false);
  });
});
