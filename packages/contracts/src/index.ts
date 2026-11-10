export interface HealthResponse {
  status: "ok";
  service: "peridot";
}

export type UserRole = "admin" | "member";

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface AuthStatusResponse {
  requiresAdminUser: boolean;
}

export interface AuthSessionResponse {
  token: string;
  expiresAt: string;
  user: UserResponse;
}

export interface TrackReference {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
}

export interface TrackResponse {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  mimeType: string;
  available: boolean;
}

export interface TrackListResponse {
  items: TrackResponse[];
}

export type LibraryScanStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted";

export interface LibraryScanResponse {
  id: string;
  status: LibraryScanStatus;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  unavailableCount: number;
  failureSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type SourceKind = "path" | "url" | "integration";

export interface SourceResponse {
  id: string;
  kind: SourceKind;
  name: string | null;
  path: string | null;
  url: string | null;
  integration: string | null;
}

export interface SourceListResponse {
  items: SourceResponse[];
}

export interface CreateSourceRequest {
  kind: SourceKind;
  name?: string | null;
  path?: string | null;
  url?: string | null;
  integration?: string | null;
}

export interface ReorderSourcesRequest {
  ids: string[];
}

export interface DirectoryEntryResponse {
  name: string;
  path: string;
}

export interface DirectoryListResponse {
  items: DirectoryEntryResponse[];
}

export interface DirectorySearchResponse {
  items: DirectoryEntryResponse[];
  truncated: boolean;
}

export interface ServerSettingsResponse {
  trackCount: number;
  availableTrackCount: number;
}

export interface LogEntryResponse {
  id: number;
  time: string;
  level: string;
  message: string;
}

export interface LogListResponse {
  items: LogEntryResponse[];
}
