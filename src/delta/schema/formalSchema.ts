export const DELTA_FORMAL_SCHEMA_V0_1 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://delta-protocol.local/schema/v0.1/delta-document.schema.json",
  "title": "Delta Protocol Formal Schema v0.1",
  "description": "Merged 3-AI schema candidate based on Delta Protocol AI Dictionary v0.1 FIXED.",
  "type": "object",
  "required": [
    "schema_version",
    "document_id",
    "query",
    "actors",
    "original_inputs",
    "bundles"
  ],
  "additionalProperties": false,
  "properties": {
    "schema_version": {
      "const": "delta-protocol-schema-0.1"
    },
    "document_id": {
      "$ref": "#/$defs/stableId"
    },
    "created_at": {
      "$ref": "#/$defs/dateTime"
    },
    "query": {
      "$ref": "#/$defs/query"
    },
    "actors": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/actor"
      },
      "minItems": 1
    },
    "original_inputs": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/originalInput"
      },
      "minItems": 1
    },
    "sources": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/source"
      },
      "default": []
    },
    "source_spans": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/sourceSpan"
      },
      "default": []
    },
    "bundles": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/irBundle"
      },
      "minItems": 1
    },
    "relations": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/relation"
      },
      "default": []
    },
    "unresolved_states": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/unresolvedState"
      },
      "default": []
    },
    "resolution_candidates": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/resolutionCandidate"
      },
      "default": []
    },
    "resolutions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/resolution"
      },
      "default": []
    },
    "revisions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/revision"
      },
      "default": []
    },
    "decision_history": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/decisionEvent"
      },
      "default": []
    },
    "followups": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/followup"
      },
      "default": []
    }
  },
  "$defs": {
    "stableId": {
      "type": "string",
      "minLength": 1,
      "pattern": "^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._~-]*$"
    },
    "dateTime": {
      "type": "string",
      "format": "date-time"
    },
    "actorType": {
      "type": "string",
      "enum": [
        "human",
        "ai",
        "system"
      ]
    },
    "actor": {
      "type": "object",
      "required": [
        "actor_id",
        "actor_type"
      ],
      "additionalProperties": false,
      "properties": {
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_type": {
          "$ref": "#/$defs/actorType"
        },
        "display_name": {
          "type": [
            "string",
            "null"
          ]
        },
        "provider": {
          "type": [
            "string",
            "null"
          ]
        },
        "model": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "query": {
      "type": "object",
      "required": [
        "query_id",
        "text",
        "actor_id"
      ],
      "additionalProperties": false,
      "properties": {
        "query_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "originalInput": {
      "type": "object",
      "required": [
        "input_id",
        "query_id",
        "actor_id",
        "content_type",
        "content"
      ],
      "additionalProperties": false,
      "properties": {
        "input_id": {
          "$ref": "#/$defs/stableId"
        },
        "query_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "content_type": {
          "type": "string",
          "enum": [
            "text",
            "json",
            "yaml",
            "tool_result",
            "multimodal_ref",
            "other"
          ]
        },
        "content": {},
        "content_hash": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "source": {
      "type": "object",
      "required": [
        "source_id",
        "source_type"
      ],
      "additionalProperties": false,
      "properties": {
        "source_id": {
          "$ref": "#/$defs/stableId"
        },
        "source_type": {
          "type": "string",
          "enum": [
            "original_input",
            "document",
            "url",
            "tool_result",
            "external",
            "other"
          ]
        },
        "input_id": {
          "$ref": "#/$defs/nullableStableId"
        },
        "uri": {
          "type": [
            "string",
            "null"
          ]
        },
        "label": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "sourceSpan": {
      "type": "object",
      "required": [
        "source_span_id",
        "source_id",
        "locator"
      ],
      "additionalProperties": false,
      "properties": {
        "source_span_id": {
          "$ref": "#/$defs/stableId"
        },
        "source_id": {
          "$ref": "#/$defs/stableId"
        },
        "locator": {
          "oneOf": [
            {
              "type": "object",
              "required": [
                "kind",
                "char_start",
                "char_end"
              ],
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "char_range"
                },
                "char_start": {
                  "type": "integer",
                  "minimum": 0
                },
                "char_end": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            },
            {
              "type": "object",
              "required": [
                "kind",
                "line_start",
                "line_end"
              ],
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "line_range"
                },
                "line_start": {
                  "type": "integer",
                  "minimum": 1
                },
                "line_end": {
                  "type": "integer",
                  "minimum": 1
                }
              }
            },
            {
              "type": "object",
              "required": [
                "kind",
                "json_pointer"
              ],
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "json_pointer"
                },
                "json_pointer": {
                  "type": "string"
                }
              }
            },
            {
              "type": "object",
              "required": [
                "kind",
                "description"
              ],
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "other"
                },
                "description": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          ]
        },
        "quote_hint": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 500
        }
      }
    },
    "provenance": {
      "type": "object",
      "required": [
        "query_id",
        "original_input_ids"
      ],
      "additionalProperties": false,
      "properties": {
        "query_id": {
          "$ref": "#/$defs/stableId"
        },
        "source_span_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "derived_from_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "transformation": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            null,
            "manual",
            "extraction",
            "translation",
            "comparison",
            "revision",
            "reextraction",
            "retranslation",
            "other"
          ]
        },
        "original_input_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        }
      }
    },
    "confidence": {
      "type": "object",
      "required": [
        "type"
      ],
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "self_report",
            "extraction",
            "comparison",
            "external"
          ]
        },
        "value": {
          "type": [
            "number",
            "null"
          ],
          "minimum": 0,
          "maximum": 100
        },
        "unit": {
          "const": "percent"
        },
        "qualitative": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            null,
            "low",
            "medium",
            "high"
          ]
        },
        "basis": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "anyOf": [
        {
          "required": [
            "value"
          ]
        },
        {
          "required": [
            "qualitative"
          ]
        }
      ]
    },
    "claim": {
      "type": "object",
      "required": [
        "claim_id",
        "actor_id",
        "text",
        "provenance",
        "evidentiary_status"
      ],
      "additionalProperties": false,
      "properties": {
        "claim_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "confidence": {
          "$ref": "#/$defs/confidence"
        },
        "evidentiary_status": {
          "type": "string",
          "enum": [
            "not_assessed",
            "missing",
            "insufficient",
            "sufficient"
          ]
        },
        "assumption_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "condition_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "scope_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "evidence_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "observation_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        }
      }
    },
    "supportItem": {
      "type": "object",
      "required": [
        "support_id",
        "kind",
        "actor_id",
        "text",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "support_id": {
          "$ref": "#/$defs/stableId"
        },
        "kind": {
          "type": "string",
          "enum": [
            "evidence",
            "observation"
          ]
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "claim_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "kind": {
                "const": "evidence"
              }
            }
          },
          "then": {
            "properties": {
              "claim_ids": {
                "minItems": 1
              }
            }
          }
        }
      ]
    },
    "semanticItem": {
      "type": "object",
      "required": [
        "semantic_id",
        "kind",
        "actor_id",
        "text"
      ],
      "additionalProperties": false,
      "properties": {
        "semantic_id": {
          "$ref": "#/$defs/stableId"
        },
        "kind": {
          "type": "string",
          "enum": [
            "assumption",
            "condition",
            "scope"
          ]
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "applies_to_claim_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        }
      }
    },
    "hypothesis": {
      "type": "object",
      "required": [
        "hypothesis_id",
        "actor_id",
        "text",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "hypothesis_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "confidence": {
          "$ref": "#/$defs/confidence"
        }
      }
    },
    "interpretation": {
      "type": "object",
      "required": [
        "interpretation_id",
        "actor_id",
        "text",
        "target_ids",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "interpretation_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "target_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        }
      }
    },
    "dissent": {
      "type": "object",
      "required": [
        "dissent_id",
        "actor_id",
        "target_claim_ids",
        "text",
        "status",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "dissent_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "target_claim_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "withdrawn"
          ]
        },
        "management_status": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            null,
            "overridden",
            "superseded"
          ]
        },
        "withdrawn_by_actor_id": {
          "$ref": "#/$defs/nullableStableId"
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "confidence": {
          "$ref": "#/$defs/confidence"
        }
      }
    },
    "counterposition": {
      "type": "object",
      "required": [
        "counterposition_id",
        "actor_id",
        "text",
        "target_claim_ids",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "counterposition_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "target_claim_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        }
      }
    },
    "irBundle": {
      "type": "object",
      "required": [
        "bundle_id",
        "query_id",
        "actor_id",
        "original_input_id"
      ],
      "additionalProperties": false,
      "properties": {
        "bundle_id": {
          "$ref": "#/$defs/stableId"
        },
        "query_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "original_input_id": {
          "$ref": "#/$defs/stableId"
        },
        "claims": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/claim"
          },
          "default": []
        },
        "support": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/supportItem"
          },
          "default": []
        },
        "semantics": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/semanticItem"
          },
          "default": []
        },
        "hypotheses": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/hypothesis"
          },
          "default": []
        },
        "interpretations": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/interpretation"
          },
          "default": []
        },
        "dissents": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/dissent"
          },
          "default": []
        },
        "counterpositions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/counterposition"
          },
          "default": []
        }
      }
    },
    "relation": {
      "type": "object",
      "required": [
        "relation_id",
        "kind",
        "actor_id",
        "target_ids",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "relation_id": {
          "$ref": "#/$defs/stableId"
        },
        "kind": {
          "type": "string",
          "enum": [
            "agreement",
            "conditional_agreement",
            "mismatch",
            "contradiction"
          ]
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "target_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 2,
          "uniqueItems": true
        },
        "condition_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "scope_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "confidence": {
          "$ref": "#/$defs/confidence"
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "note": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "unresolvedState": {
      "type": "object",
      "required": [
        "state_id",
        "target_ids",
        "unresolved",
        "states"
      ],
      "additionalProperties": false,
      "properties": {
        "state_id": {
          "$ref": "#/$defs/stableId"
        },
        "target_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "unresolved": {
          "const": true
        },
        "states": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "unknown",
              "divergence",
              "deadlock"
            ]
          },
          "uniqueItems": true
        },
        "note": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "resolutionCandidate": {
      "type": "object",
      "required": [
        "candidate_id",
        "actor_id",
        "actor_type",
        "proposal",
        "target_ids",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "candidate_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "proposal": {
          "type": "string",
          "minLength": 1
        },
        "target_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "suggested_decision": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            null,
            "accept",
            "reject",
            "hold",
            "other"
          ]
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "confidence": {
          "$ref": "#/$defs/confidence"
        },
        "actor_type": {
          "type": "string",
          "enum": [
            "ai",
            "system"
          ]
        }
      }
    },
    "resolution": {
      "type": "object",
      "required": [
        "resolution_id",
        "decided_by_actor_id",
        "decided_by_actor_type",
        "decision",
        "target_ids",
        "basis_ids"
      ],
      "additionalProperties": false,
      "properties": {
        "resolution_id": {
          "$ref": "#/$defs/stableId"
        },
        "decided_by_actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "decided_by_actor_type": {
          "const": "human"
        },
        "decision": {
          "type": "string",
          "enum": [
            "accept",
            "reject",
            "hold",
            "other"
          ]
        },
        "decision_value": {},
        "text": {
          "type": [
            "string",
            "null"
          ]
        },
        "target_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "basis_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "candidate_ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stableId"
          },
          "uniqueItems": true,
          "default": []
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "revision": {
      "type": "object",
      "required": [
        "revision_id",
        "target_id",
        "actor_id",
        "revision_number",
        "change_type"
      ],
      "additionalProperties": false,
      "properties": {
        "revision_id": {
          "$ref": "#/$defs/stableId"
        },
        "target_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "revision_number": {
          "type": "integer",
          "minimum": 1
        },
        "previous_revision_id": {
          "$ref": "#/$defs/nullableStableId"
        },
        "change_type": {
          "type": "string",
          "enum": [
            "create",
            "edit",
            "reextract",
            "retranslate",
            "reclassify",
            "other"
          ]
        },
        "reason": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "decisionEvent": {
      "type": "object",
      "required": [
        "event_id",
        "resolution_id",
        "actor_id",
        "actor_type",
        "from_decision",
        "to_decision"
      ],
      "additionalProperties": false,
      "properties": {
        "event_id": {
          "$ref": "#/$defs/stableId"
        },
        "resolution_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_type": {
          "const": "human"
        },
        "from_decision": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            null,
            "accept",
            "reject",
            "hold",
            "other"
          ]
        },
        "to_decision": {
          "type": "string",
          "enum": [
            "accept",
            "reject",
            "hold",
            "other"
          ]
        },
        "note": {
          "type": [
            "string",
            "null"
          ]
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "followup": {
      "type": "object",
      "required": [
        "followup_id",
        "actor_id",
        "text"
      ],
      "additionalProperties": false,
      "properties": {
        "followup_id": {
          "$ref": "#/$defs/stableId"
        },
        "actor_id": {
          "$ref": "#/$defs/stableId"
        },
        "text": {
          "type": "string",
          "minLength": 1
        },
        "parent_query_id": {
          "$ref": "#/$defs/nullableStableId"
        },
        "reason_states": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "unknown",
              "divergence",
              "deadlock"
            ]
          },
          "uniqueItems": true,
          "default": []
        },
        "created_at": {
          "$ref": "#/$defs/dateTime"
        }
      }
    },
    "nullableStableId": {
      "anyOf": [
        {
          "type": "null"
        },
        {
          "$ref": "#/$defs/stableId"
        }
      ]
    }
  }
} as const;
