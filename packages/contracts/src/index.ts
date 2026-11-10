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
  artists: string[];
  album: string | null;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  mimeType: string;
  available: boolean;
  coverUrl: string | null;
  metadata: TrackMetadataResponse | null;
}

export interface TrackListResponse {
  items: TrackResponse[];
}

export interface PlaybackTokenResponse {
  token: string;
  expiresAt: string;
}

export interface QueueResponse {
  trackIds: string[];
}

export interface ReplaceQueueRequest {
  trackIds: string[];
}

export interface TrackLikeResponse {
  trackId: string;
  likedAt: string;
}

export interface AlbumLikeResponse {
  title: string;
  artist: string;
  likedAt: string;
}

export interface ArtistLikeResponse {
  name: string;
  likedAt: string;
}

export interface LikeListResponse {
  tracks: TrackLikeResponse[];
  albums: AlbumLikeResponse[];
  artists: ArtistLikeResponse[];
}

export type LikeTarget =
  | { kind: "track"; trackId: string }
  | { kind: "album"; title: string; artist: string }
  | { kind: "artist"; name: string };

export type LikeResponse =
  | ({ kind: "track" } & TrackLikeResponse)
  | ({ kind: "album" } & AlbumLikeResponse)
  | ({ kind: "artist" } & ArtistLikeResponse);

export type LibraryScanStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted";

export type LibraryMetadataStatus =
  "pending" | "running" | "completed" | "skipped" | "failed" | "interrupted";

export interface LibraryScanResponse {
  id: string;
  status: LibraryScanStatus;
  sourceId: string | null;
  sourceName: string | null;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  unavailableCount: number;
  metadataStatus: LibraryMetadataStatus;
  metadataTotalCount: number;
  metadataProcessedCount: number;
  metadataMatchedCount: number;
  metadataUnmatchedCount: number;
  metadataErrorCount: number;
  metadataFailureSummary: string | null;
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

export type MetadataProviderKind = "musicbrainz";

export interface MetadataProviderResponse {
  id: string;
  kind: MetadataProviderKind;
  name: string;
  contact: string;
  hasCredential: boolean;
}

export interface MetadataProviderListResponse {
  items: MetadataProviderResponse[];
}

export interface CreateMetadataProviderRequest {
  kind: MetadataProviderKind;
  name?: string | null;
  contact: string;
  apiKey?: string | null;
}

export interface ReorderMetadataProvidersRequest {
  ids: string[];
}

export type TrackMetadataMatchMode = "automatic" | "manual";

export interface TrackMetadataResponse {
  providerId: string | null;
  providerKind: MetadataProviderKind;
  providerName: string;
  recordingId: string;
  releaseId: string | null;
  matchedAt: string;
  mode: TrackMetadataMatchMode;
  sourceUrl: string;
}

export interface MetadataCandidateResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  recordingId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  artists: string[];
  album: string | null;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  score: number;
}

export interface MetadataCandidateListResponse {
  items: MetadataCandidateResponse[];
}

export interface ApplyTrackMetadataRequest {
  providerId: string;
  recordingId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  artists: string[];
  album: string | null;
  discNumber: number | null;
  trackNumber: number | null;
}

export interface ResetTrackMetadataResponse {
  resetCount: number;
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
