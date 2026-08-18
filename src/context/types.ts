export type ContextKind =
  | "instruction"
  | "text"
  | "markdown"
  | "document"
  | "ai_response"
  | "conversation"
  | "url"
  | "note";

export type ContextRole = "instruction" | "reference";
export type ContextScope = "global" | "project" | "slot" | "session";
export type ContextLifetime = "session" | "persistent";
export type ContextReviewState = "candidate" | "approved" | "rejected";

export type ContextProvenance =
  | "user_authored"
  | "ai_generated"
  | "external_document"
  | "imported_conversation";

export interface ContextSource {
  provider?: string;
  model?: string;
  nickname?: string;
  slotId?: string;
  conversationId?: string;
  messageId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  url?: string;
  /** Immutable origin snapshot when an imported AI archive is promoted to Context. */
  archiveId?: string;
  archiveSource?: string;
  sourceKind?: "ai_archive";
  capturedAt?: string;
}

export interface ContextGenerationMeta {
  originalQuestion?: string;
  appliedContextIds?: string[];
  appliedInstructions?: string[];
}

export interface ContextItem {
  id: string;
  kind: ContextKind;
  role: ContextRole;
  scope: ContextScope;
  lifetime: ContextLifetime;
  provenance: ContextProvenance;
  reviewState?: ContextReviewState;
  editedByUser?: boolean;
  title: string;
  content: string;
  enabled: boolean;
  projectId?: string;
  slotId?: string;
  conversationId?: string;
  source?: ContextSource;
  generation?: ContextGenerationMeta;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface NormalizedContextRequest {
  slotId: string;
  instructions: ContextItem[];
  references: ContextItem[];
  history: ConversationTurn[];
  userMessage: string;
}

export interface AssembleContextInput {
  slotId: string;
  projectId?: string;
  conversationId?: string;
  contextItems: ContextItem[];
  history?: ConversationTurn[];
  userMessage: string;
}
