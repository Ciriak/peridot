export interface HealthResponse {
  status: "ok";
  service: "peridot";
}

export type MessageParams = Record<string, string | number>;

export interface MessageDescriptor {
  key: string;
  params?: MessageParams;
  count?: number;
}

export type UserRole = "admin" | "member";

export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface UpdateUserProfileRequest {
  displayName: string;
}

export interface UserPreferencesResponse {
  likedTitlesOffline: boolean;
  initialized: boolean;
}

export interface UpdateUserPreferencesRequest {
  likedTitlesOffline: boolean;
}

export interface UserListResponse {
  items: UserResponse[];
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  password?: string;
  role?: UserRole;
}

export interface AuthStatusResponse {
  requiresAdminUser: boolean;
}

export interface AuthSessionResponse {
  token: string;
  expiresAt: string;
  user: UserResponse;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetRequestResponse {
  status: "requested";
}

export interface CompletePasswordResetRequest {
  token: string;
  password: string;
}

export interface TrackReference {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
}

export type MediaType = "music" | "audiobook" | "podcast";
export type TrackMediaFilter = MediaType | "all";
export type TrackMediaTypeOrigin = "source" | "embedded" | "fallback";

export interface TrackResponse {
  id: string;
  mediaType: MediaType;
  mediaTypeOrigin: TrackMediaTypeOrigin;
  sourceKind: SourceKind | null;
  title: string;
  artist: string;
  artists: string[];
  album: string | null;
  genres: string[];
  albumId: string | null;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: string | null;
  mimeType: string;
  available: boolean;
  coverUrl: string | null;
  metadata: TrackMetadataResponse | null;
  liked: boolean;
}

export type CatalogSortField =
  "title" | "artist" | "album" | "duration" | "track" | "published";

export type CatalogSortDirection = "asc" | "desc";

export interface CursorPageResponse<T> {
  items: T[];
  nextCursor: string | null;
  totalCount: number;
  catalogRevision: number;
}

export type TrackListResponse = CursorPageResponse<TrackResponse>;

export interface ResolveTracksRequest {
  ids: string[];
}

export interface ResolveTracksResponse {
  items: TrackResponse[];
  aliases: Record<string, string>;
}

export interface AlbumSummaryResponse {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  coverUrl: string | null;
  trackCount: number;
  durationMs: number | null;
  releaseYear: number | null;
  available: boolean;
  liked: boolean;
}

export interface AlbumListResponse {
  items: AlbumSummaryResponse[];
  nextCursor: string | null;
  totalCount: number;
  catalogRevision: number;
}

export interface AudiobookSummaryResponse {
  id: string;
  mediaType: "audiobook";
  title: string;
  author: string;
  authors: string[];
  coverUrl: string | null;
  chapterCount: number;
  durationMs: number | null;
  releaseYear: number | null;
  available: boolean;
  liked: boolean;
}

export interface PodcastSummaryResponse {
  id: string;
  mediaType: "podcast";
  title: string;
  publisher: string;
  publishers: string[];
  coverUrl: string | null;
  episodeCount: number;
  durationMs: number | null;
  latestPublishedAt: string | null;
  available: boolean;
  liked: boolean;
}

export interface AudiobookListResponse {
  items: AudiobookSummaryResponse[];
  nextCursor: string | null;
  totalCount: number;
  catalogRevision: number;
}

export interface PodcastListResponse {
  items: PodcastSummaryResponse[];
  nextCursor: string | null;
  totalCount: number;
  catalogRevision: number;
}

export interface ArtistSummaryResponse {
  id: string;
  name: string;
  localName: string;
  albumCount: number;
  trackCount: number;
  durationMs: number | null;
  imageUrl: string | null;
  metadata: ArtistMetadataResponse | null;
  available: boolean;
  liked: boolean;
}

export interface ArtistListResponse {
  items: ArtistSummaryResponse[];
  nextCursor: string | null;
  totalCount: number;
  catalogRevision: number;
}

export const LIKED_TRACKS_PLAYLIST_ID = "liked";
export const LIKED_TRACKS_PLAYLIST_NAME = "Liked tracks";

export type PlaylistKind = "manual" | "liked-tracks";

export interface PlaylistSummaryResponse {
  id: string;
  kind: PlaylistKind;
  name: string;
  trackCount: number;
  availableTrackCount: number;
  durationMs: number | null;
  coverUrls: string[];
  liked: boolean;
  containsTrack: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistExternalTrackReference {
  provider: string;
  externalTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
}

export interface PlaylistEntryResponse {
  id: string;
  position: number;
  title: string;
  artist: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  available: boolean;
  liked: boolean;
  track: TrackResponse | null;
  external: PlaylistExternalTrackReference | null;
}

export interface PlaylistDetailResponse extends PlaylistSummaryResponse {
  entries: PlaylistEntryResponse[];
}

export interface PlaylistListResponse {
  items: PlaylistSummaryResponse[];
  totalCount: number;
  nextOffset: number | null;
}

export interface CreatePlaylistRequest {
  name: string;
}

export interface UpdatePlaylistRequest {
  name: string;
}

export type AddPlaylistItemRequest =
  | {
      kind: "catalog";
      trackId: string;
    }
  | {
      kind: "external";
      reference: PlaylistExternalTrackReference;
    };

export interface AddPlaylistItemResponse {
  added: boolean;
  playlist: PlaylistDetailResponse;
}

export interface ReorderPlaylistItemsRequest {
  itemIds: string[];
}

export type ArtistMetadataMatchMode = "automatic" | "manual";

export interface ArtistMetadataProvenanceResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  externalArtistId: string;
  sourceUrl: string;
}

export interface ArtistMetadataResponse {
  mode: ArtistMetadataMatchMode;
  matchedAt: string;
  name: ArtistMetadataProvenanceResponse;
  portrait: ArtistMetadataProvenanceResponse | null;
}

export interface ArtistMetadataCandidateResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  externalArtistId: string;
  name: string;
  disambiguation: string | null;
  score: number;
  sourceUrl: string;
  portraitAvailable: boolean;
}

export interface ArtistMetadataCandidateListResponse {
  items: ArtistMetadataCandidateResponse[];
}

export interface ApplyArtistMetadataRequest {
  providerId: string;
  externalArtistId: string;
  name: string;
  sourceUrl: string;
  portraitAvailable: boolean;
}

export interface PlaybackTokenResponse {
  token: string;
  expiresAt: string;
}

export interface RecordTrackPlayResponse {
  trackId: string;
  playedAt: string;
}

export interface QuickPickTrackResponse {
  kind: "track";
  key: string;
  trackId: string;
  track: TrackResponse;
}

export interface QuickPickAlbumResponse {
  kind: "album";
  key: string;
  title: string;
  artist: string;
  album: AlbumSummaryResponse;
}

export type QuickPickItemResponse =
  QuickPickTrackResponse | QuickPickAlbumResponse;

export interface QuickPickListResponse {
  items: QuickPickItemResponse[];
}

export interface TrackLikeResponse {
  trackId: string;
  likedAt: string;
}

export interface AlbumLikeResponse {
  albumId: string;
  title: string;
  artist: string;
  likedAt: string;
}

export interface AudiobookLikeResponse {
  audiobookId: string;
  title: string;
  author: string;
  likedAt: string;
}

export interface PodcastLikeResponse {
  podcastId: string;
  title: string;
  publisher: string;
  likedAt: string;
}

export interface ArtistLikeResponse {
  name: string;
  likedAt: string;
}

export interface PlaylistLikeResponse {
  playlistId: string;
  name: string;
  likedAt: string;
}

export interface LikeListResponse {
  tracks: TrackLikeResponse[];
  albums: AlbumLikeResponse[];
  audiobooks: AudiobookLikeResponse[];
  podcasts: PodcastLikeResponse[];
  artists: ArtistLikeResponse[];
  playlists: PlaylistLikeResponse[];
}

export type LikeTarget =
  | { kind: "track"; trackId: string }
  | { kind: "album"; albumId: string; title: string; artist: string }
  | {
      kind: "audiobook";
      audiobookId: string;
      title: string;
      author: string;
    }
  | {
      kind: "podcast";
      podcastId: string;
      title: string;
      publisher: string;
    }
  | { kind: "artist"; name: string }
  | { kind: "playlist"; playlistId: string; name: string };

export type LikeResponse =
  | ({ kind: "track" } & TrackLikeResponse)
  | ({ kind: "album" } & AlbumLikeResponse)
  | ({ kind: "audiobook" } & AudiobookLikeResponse)
  | ({ kind: "podcast" } & PodcastLikeResponse)
  | ({ kind: "artist" } & ArtistLikeResponse)
  | ({ kind: "playlist" } & PlaylistLikeResponse);

export type TaskStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted" | "stopped";

export type TaskKind =
  | "library_scan"
  | "catalog_fetch"
  | "metadata_fetch"
  | "artwork_fetch"
  | "duplicate_detection";

export const TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY =
  "metadata.activeProvider";

export type TaskProgressResponse =
  | {
      state: "indeterminate";
      completed: null;
      total: null;
    }
  | {
      state: "determinate";
      completed: number;
      total: number;
    };

export interface TaskDetailResponse {
  key: string;
  value: string;
  labelMessage: MessageDescriptor;
  valueMessage: MessageDescriptor | null;
}

export interface TaskSourceResponse {
  id: string | null;
  name: string;
}

export interface TaskResponse {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  titleMessage: MessageDescriptor;
  parentTaskId: string | null;
  source: TaskSourceResponse | null;
  progress: TaskProgressResponse;
  details: TaskDetailResponse[];
  failureMessage: MessageDescriptor | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface TaskListResponse {
  items: TaskResponse[];
  activeCount: number;
  queuedCount: number;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    messageDescriptor: MessageDescriptor;
  };
}

export type SourceIntegrationKind = "jellyfin";

export type SourceKind = "path" | "url" | SourceIntegrationKind;

export type SourceRemovalPhase = "stopping" | "tracks" | "catalog";

export interface SourceRemovalProgressResponse {
  operationId: string;
  sourceId: string;
  phase: SourceRemovalPhase;
  completed: number;
  total: number;
}

export interface SourceResponse {
  id: string;
  kind: SourceKind;
  name: string | null;
  path: string | null;
  url: string | null;
  configuration: Record<string, string> | null;
  fileCount: number;
  lastSyncedAt: string | null;
  removal: SourceRemovalProgressResponse | null;
}

export interface CreateSourceResponse extends SourceResponse {
  task: TaskResponse | null;
}

export interface SourceListResponse {
  items: SourceResponse[];
}

export interface SourceRemovalResponse {
  sourceId: string;
  unavailableTrackCount: number;
  affectedAlbumCount: number;
  affectedArtistCount: number;
  durationMs: number;
}

export interface CreatePathSourceRequest {
  kind: "path";
  name?: string | null;
  path: string;
}

export interface CreateUrlSourceRequest {
  kind: "url";
  name?: string | null;
  url: string;
}

export interface CreateJellyfinSourceRequest {
  kind: "jellyfin";
  name?: string | null;
  url: string;
  apiKey: string;
  libraryId: string;
  collectionType: string | null;
}

export type CreateSourceRequest =
  | CreatePathSourceRequest
  | CreateUrlSourceRequest
  | CreateJellyfinSourceRequest;

export interface SourceIntegrationOptionResponse {
  id: string;
  label: string;
  configuration: Record<string, string>;
}

export interface SourceIntegrationOptionListResponse {
  items: SourceIntegrationOptionResponse[];
}

export interface DiscoverSourceIntegrationRequest {
  configuration: Record<string, string>;
  credentials: Record<string, string>;
}

export interface ReorderSourcesRequest {
  ids: string[];
}

export type MetadataProviderKind = "musicbrainz" | "discogs";

export type MetadataProviderFieldType = "text" | "url" | "password";

export interface MetadataProviderFieldDefinition {
  key: string;
  labelMessage: MessageDescriptor;
  type: MetadataProviderFieldType;
  required: boolean;
  placeholderMessage: MessageDescriptor | null;
  helpMessage: MessageDescriptor | null;
}

export interface MetadataProviderDefinitionResponse {
  kind: MetadataProviderKind;
  nameMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  configurationFields: MetadataProviderFieldDefinition[];
  credentialField: MetadataProviderFieldDefinition | null;
  supportsAutomaticMatching: boolean;
  supportsManualSearch: boolean;
}

export interface MetadataProviderDefinitionListResponse {
  items: MetadataProviderDefinitionResponse[];
}

export interface MetadataProviderResponse {
  id: string;
  kind: MetadataProviderKind;
  name: string;
  accountLabel: string | null;
  configuration: Record<string, string>;
  hasCredential: boolean;
  enabled: boolean;
}

export interface MetadataProviderListResponse {
  items: MetadataProviderResponse[];
}

export interface CreateMetadataProviderRequest {
  kind: MetadataProviderKind;
  name?: string | null;
  configuration?: Record<string, string>;
  credential?: string | null;
}

export interface UpdateMetadataProviderRequest {
  enabled?: boolean;
  configuration?: Record<string, string>;
  credential?: string | null;
}

export interface ReorderMetadataProvidersRequest {
  ids: string[];
}

export type TrackMetadataMatchMode = "automatic" | "manual";

export interface TrackMetadataResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  externalTrackId: string;
  externalReleaseId: string | null;
  matchedAt: string;
  mode: TrackMetadataMatchMode;
  sourceUrl: string;
  genres: string[];
  details: TrackMetadataDetail[];
}

export interface TrackMetadataDetail {
  key: string;
  value: string;
  labelMessage: MessageDescriptor;
}

export interface MetadataCandidateResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  externalTrackId: string;
  externalReleaseId: string | null;
  title: string;
  artist: string;
  artists: string[];
  albumArtists: string[];
  album: string | null;
  genres: string[];
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  score: number;
  sourceUrl: string;
  details: TrackMetadataDetail[];
}

export interface MetadataCandidateListResponse {
  items: MetadataCandidateResponse[];
}

export interface ApplyTrackMetadataRequest {
  providerId: string;
  externalTrackId: string;
  externalReleaseId: string | null;
  title: string;
  artist: string;
  artists: string[];
  albumArtists: string[];
  album: string | null;
  genres: string[];
  discNumber: number | null;
  trackNumber: number | null;
  sourceUrl: string;
  details: TrackMetadataDetail[];
}

export interface ResetMetadataResponse {
  trackCount: number;
  artistCount: number;
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

export const DEFAULT_SCAN_WORKER_COUNT = 3;
export const SCAN_WORKER_WARNING_THRESHOLD = 4;
export const MAX_SCAN_WORKER_COUNT = 32;
export const DEFAULT_FILE_LOG_RETENTION_DAYS = 5;
export const MAX_FILE_LOG_RETENTION_DAYS = 3650;

export interface ServerSettingsResponse {
  trackCount: number;
  availableTrackCount: number;
  scanning: ScanWorkerSettingsResponse;
  sourceRefresh: SourceRefreshSettingsResponse;
  fileLogging: FileLoggingSettingsResponse;
}

export interface ScanWorkerSettingsResponse {
  workerCount: number;
}

export interface SourceRefreshSettingsResponse {
  enabled: boolean;
  cron: string;
  nextRunAt: string | null;
}

export interface FileLoggingSettingsResponse {
  enabled: boolean;
  retentionDays: number;
  path: string;
}

export interface UpdateServerSettingsRequest {
  scanning?: {
    workerCount: number;
  };
  sourceRefresh?: {
    enabled: boolean;
    cron: string;
  };
  fileLogging?: {
    enabled: boolean;
    retentionDays: number;
  };
}

export interface RestartServerResponse {
  status: "restarting";
}

export type UpdateChannel = "dev" | "beta" | "stable" | "local";

export type UpdateState = "unchecked" | "current" | "available";

export interface UpdateStatusResponse {
  version: string;
  channel: UpdateChannel;
  currentTag: string | null;
  currentCommit: string | null;
  latestTag: string | null;
  latestCommit: string | null;
  state: UpdateState;
  checkedAt: string | null;
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

export type RealtimeTopic = "tasks" | "catalog" | "logs" | "sources";

export interface RealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}

export interface RealtimeSubscribeRequest {
  type: "subscribe";
  topics: RealtimeTopic[];
  after?: number | null;
}

export interface RealtimeHelloMessage {
  type: "hello";
  protocolVersion: 1;
  sequence: number;
}

export interface RealtimeSubscribedMessage {
  type: "subscribed";
  topics: RealtimeTopic[];
}

export interface RealtimeResyncRequiredMessage {
  type: "resync.required";
  currentSequence: number;
}

export interface RealtimeErrorMessage {
  type: "error";
  code: "invalid_message" | "forbidden_topic" | "internal_error";
  messageDescriptor: MessageDescriptor;
}

export interface RealtimeTaskUpdatedEvent {
  type: "task.updated";
  eventId: number;
  occurredAt: string;
  task: TaskResponse;
}

export interface RealtimeCatalogChangedEvent {
  type: "catalog.changed";
  eventId: number;
  occurredAt: string;
  revision: number;
  sourceId: string | null;
  reason:
    "scan" | "metadata" | "reset" | "source" | "source-removal" | "duplicate";
  changedCount: number;
}

export interface RealtimeSourceRemovalProgressEvent extends SourceRemovalProgressResponse {
  type: "source.removal.progress";
  eventId: number;
  occurredAt: string;
}

export interface RealtimeLogAppendedEvent {
  type: "log.appended";
  eventId: number;
  occurredAt: string;
  entry: LogEntryResponse;
}

export type RealtimeServerMessage =
  | RealtimeHelloMessage
  | RealtimeSubscribedMessage
  | RealtimeResyncRequiredMessage
  | RealtimeErrorMessage
  | RealtimeTaskUpdatedEvent
  | RealtimeCatalogChangedEvent
  | RealtimeSourceRemovalProgressEvent
  | RealtimeLogAppendedEvent;
