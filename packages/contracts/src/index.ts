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
  albumId: string | null;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  mimeType: string;
  available: boolean;
  coverUrl: string | null;
  metadata: TrackMetadataResponse | null;
  liked: boolean;
}

export type CatalogSortField =
  "title" | "artist" | "album" | "duration" | "track";

export type CatalogSortDirection = "asc" | "desc";

export interface CursorPageResponse<T> {
  items: T[];
  nextCursor: string | null;
  catalogRevision: number;
}

export type TrackListResponse = CursorPageResponse<TrackResponse>;

export interface ResolveTracksRequest {
  ids: string[];
}

export interface ResolveTracksResponse {
  items: TrackResponse[];
}

export interface AlbumSummaryResponse {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  coverUrl: string | null;
  fileCount: number;
  durationMs: number | null;
  releaseYear: number | null;
  liked: boolean;
}

export interface AlbumListResponse {
  items: AlbumSummaryResponse[];
  nextCursor: string | null;
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
  liked: boolean;
}

export interface ArtistListResponse {
  items: ArtistSummaryResponse[];
  nextCursor: string | null;
  catalogRevision: number;
}

export interface PlaylistSummaryResponse {
  id: string;
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

export interface QueueResponse {
  trackIds: string[];
  activeTrackId: string | null;
  shuffleEnabled: boolean;
  shuffleTrackIds: string[];
}

export interface ReplaceQueueRequest {
  trackIds: string[];
  activeTrackId?: string | null;
  shuffleEnabled?: boolean;
  shuffleTrackIds?: string[];
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
  artists: ArtistLikeResponse[];
  playlists: PlaylistLikeResponse[];
}

export type LikeTarget =
  | { kind: "track"; trackId: string }
  | { kind: "album"; albumId: string; title: string; artist: string }
  | { kind: "artist"; name: string }
  | { kind: "playlist"; playlistId: string; name: string };

export type LikeResponse =
  | ({ kind: "track" } & TrackLikeResponse)
  | ({ kind: "album" } & AlbumLikeResponse)
  | ({ kind: "artist" } & ArtistLikeResponse)
  | ({ kind: "playlist" } & PlaylistLikeResponse);

export type TaskStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted";

export type TaskKind = "library_scan" | "metadata_fetch" | `plugin:${string}`;

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

export type SourceKind = "path" | "url" | "integration";

export interface SourceResponse {
  id: string;
  kind: SourceKind;
  name: string | null;
  path: string | null;
  url: string | null;
  integration: string | null;
  trackCount: number;
  lastSyncedAt: string | null;
}

export interface CreateSourceResponse extends SourceResponse {
  task: TaskResponse | null;
}

export interface SourceListResponse {
  items: SourceResponse[];
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
  kind: "integration";
  integration: "jellyfin";
  name?: string | null;
  url: string;
  apiKey: string;
}

export type CreateSourceRequest =
  | CreatePathSourceRequest
  | CreateUrlSourceRequest
  | CreateJellyfinSourceRequest;

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

export interface ServerSettingsResponse {
  trackCount: number;
  availableTrackCount: number;
}

export interface RestartServerResponse {
  status: "restarting";
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

export type RealtimeTopic = "tasks" | "catalog" | "logs";

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
  reason: "scan" | "metadata" | "reset" | "source";
  changedCount: number;
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
  | RealtimeLogAppendedEvent;
