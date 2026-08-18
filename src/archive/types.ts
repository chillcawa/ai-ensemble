export type ArchiveMessageRole = "user" | "assistant" | "system" | "unknown";

export type ArchiveReviewState = "candidate" | "approved" | "rejected";

export interface ArchiveSourceIdentity {
  provider?: string;
  model?: string;
  mappedSlotId?: string;
  nickname?: string;
}

export interface ArchiveMessage {
  id: string;
  archiveId: string;
  role: ArchiveMessageRole;
  content: string;
  author?: string;
  createdAt?: string;
  position: number;
}

export interface ArchiveConversation {
  id: string;
  projectId: string;
  source: string;
  title: string;
  fileName?: string;
  reviewState: ArchiveReviewState;
  sourceProvider?: string;
  sourceModel?: string;
  mappedSlotId?: string;
  sourceNickname?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ImportedArchiveConversation {
  source: string;
  title: string;
  fileName: string;
  sourceProvider?: string;
  sourceModel?: string;
  messages: Array<{
    role: ArchiveMessageRole;
    content: string;
    author?: string;
    createdAt?: string;
  }>;
}
