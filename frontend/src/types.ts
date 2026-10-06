// Shared domain types — the seed of an incremental TypeScript migration.
// Import these from .ts/.tsx files as they are converted; existing .js keeps working.

export type SourceType = "pdf" | "docx" | "csv" | "text" | "text-paste" | "link";
export type SourceStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "deleting";

export interface Source {
  _id: string;
  type: SourceType;
  status: SourceStatus;
  title: string | null;
  originalFileName: string | null;
  summary: string | null;
  s3Key: string | null;
  webURL?: string | null;
  rawURL?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface Citation {
  sourceId?: string | null;
  originalFileName?: string;
  pageNumber?: number;
  chunkId?: string | null;
  snippet?: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  traceId?: string | null;
  feedback?: "up" | "down" | null;
}

export interface Chat {
  _id: string;
  title: string | null;
  sourceIds: Array<string | Source>;
  pinned?: boolean;
  isReadOnly?: boolean;
  messages?: Message[];
  createdAt: string;
  updatedAt: string;
}
