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

export interface MediaReference {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  isrc?: string;
}

export type MediaType = "music" | "audiobook" | "podcast";
export type MediaFilter = MediaType | "all";
export type MediaTypeOrigin = "source" | "embedded" | "fallback";

export interface MediaCopyResponse {
  id: string;
  librarySourceId: string;
  librarySourceKind: LibrarySourceKind;
  relativePath: string;
  mimeType: string;
  available: boolean;
  fileSizeBytes: string;
  audioLossless: boolean;
  audioBitrate: number | null;
}

export interface MediaResponse {
  id: string;
  mediaType: MediaType;
  mediaTypeOrigin: MediaTypeOrigin;
  sourceKind: LibrarySourceKind | null;
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
  metadata: MediaMetadataResponse | null;
  liked: boolean;
  copies?: MediaCopyResponse[];
}

export type AdminMediaField =
  | "mediaType"
  | "title"
  | "artist"
  | "artistCredits"
  | "albumArtist"
  | "albumArtistCredits"
  | "album"
  | "genres"
  | "discNumber"
  | "trackNumber"
  | "durationMs"
  | "publishedAt"
  | "metadataMode"
  | "metadataTitle"
  | "metadataArtist"
  | "metadataArtistCredits"
  | "metadataAlbumArtist"
  | "metadataAlbumArtistCredits"
  | "metadataAlbum"
  | "metadataGenres"
  | "metadataDiscNumber"
  | "metadataTrackNumber"
  | "metadataProviderId"
  | "metadataProviderKind"
  | "metadataProviderName"
  | "metadataExternalTrackId"
  | "metadataExternalReleaseId"
  | "metadataSourceUrl"
  | "metadataDetails"
  | "metadataMatchedAt"
  | "coverId";

export type AdminMediaCopyField =
  | "librarySourceId"
  | "relativePath"
  | "mediaType"
  | "mediaTypeOrigin"
  | "title"
  | "artist"
  | "artistCredits"
  | "albumArtist"
  | "albumArtistCredits"
  | "album"
  | "genres"
  | "discNumber"
  | "trackNumber"
  | "durationMs"
  | "publishedAt"
  | "mimeType"
  | "fileSizeBytes"
  | "fileModifiedAt"
  | "externalId"
  | "externalVersion"
  | "externalContainer"
  | "externalCoverKey"
  | "recordingIdentityKeys"
  | "audioLossless"
  | "audioBitrate"
  | "coverId";

export type AdminMediaFieldValue =
  string | number | boolean | null | string[] | MediaMetadataDetail[];

export type AdminMediaFilter = "all" | "music" | "audiobook" | "podcast";

export type AdminMediaAvailabilityFilter = "all" | "available" | "unavailable";

export type AdminMediaMetadataFilter =
  "all" | "matched" | "unmatched" | "manual" | "file";

export type AdminMediaCopyCountFilter = "any" | "zero" | "one" | "multiple";

export type AdminMediaLosslessFilter = "any" | "true" | "false";

export type AdminMediaMissingFilter =
  | "none"
  | "album"
  | "genres"
  | "duration"
  | "publishedAt"
  | "cover"
  | "metadata"
  | "copy";

export type AdminMediaManualFilter = "any" | "none" | "media" | "copy";

export type AdminMediaSortField =
  | "title"
  | "artist"
  | "album"
  | "mediaType"
  | "available"
  | "duration"
  | "published"
  | "copyCount"
  | "createdAt"
  | "updatedAt";

export interface AdminMediaListQuery {
  page?: number;
  pageSize?: 25 | 50 | 100;
  query?: string;
  mediaType?: AdminMediaFilter;
  availability?: AdminMediaAvailabilityFilter;
  sourceId?: string;
  metadataState?: AdminMediaMetadataFilter;
  providerId?: string;
  copyCount?: AdminMediaCopyCountFilter;
  lossless?: AdminMediaLosslessFilter;
  mimeType?: string;
  minBitrate?: number;
  maxBitrate?: number;
  minFileSizeBytes?: string;
  maxFileSizeBytes?: string;
  missing?: AdminMediaMissingFilter;
  manual?: AdminMediaManualFilter;
  publishedFrom?: string;
  publishedTo?: string;
  fileModifiedFrom?: string;
  fileModifiedTo?: string;
  sort?: AdminMediaSortField;
  direction?: CatalogSortDirection;
}

export interface AdminMediaCopyResponse {
  id: string;
  mediaId: string;
  librarySourceId: string;
  librarySourceName: string;
  librarySourceKind: LibrarySourceKind;
  librarySourcePath: string | null;
  librarySourceRemoved: boolean;
  relativePath: string;
  mediaType: MediaType;
  mediaTypeOrigin: MediaTypeOrigin;
  title: string;
  artist: string;
  artistCredits: string[];
  albumArtist: string | null;
  albumArtistCredits: string[];
  album: string | null;
  genres: string[];
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: string | null;
  mimeType: string;
  fileSizeBytes: string;
  fileModifiedAt: string;
  externalId: string | null;
  externalVersion: string | null;
  externalContainer: string | null;
  externalCoverKey: string | null;
  recordingIdentityKeys: string[];
  audioLossless: boolean;
  audioBitrate: number | null;
  coverId: string | null;
  available: boolean;
  lastSeenScanId: string | null;
  metadataVersion: number;
  manualOverrideFields: AdminMediaCopyField[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminMediaUsageResponse {
  copyCount: number;
  likeCount: number;
  playCount: number;
  playlistItemCount: number;
  aliasCount: number;
}

export interface AdminMediaResponse {
  id: string;
  mediaType: MediaType;
  mediaTypeOrigin: MediaTypeOrigin;
  title: string;
  artist: string;
  artistCredits: string[];
  albumArtist: string | null;
  albumArtistCredits: string[];
  album: string | null;
  genres: string[];
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: string | null;
  metadataVersion: number;
  metadataMode: string;
  metadataTitle: string | null;
  metadataArtist: string | null;
  metadataArtistCredits: string[];
  metadataAlbumArtist: string | null;
  metadataAlbumArtistCredits: string[];
  metadataAlbum: string | null;
  metadataGenres: string[];
  metadataDiscNumber: number | null;
  metadataTrackNumber: number | null;
  metadataProviderId: string | null;
  metadataProviderKind: string | null;
  metadataProviderName: string | null;
  metadataExternalTrackId: string | null;
  metadataExternalReleaseId: string | null;
  metadataSourceUrl: string | null;
  metadataDetails: MediaMetadataDetail[];
  metadataMatchedAt: string | null;
  metadataAttemptedSignature: string | null;
  coverId: string | null;
  available: boolean;
  catalogProjectionPending: boolean;
  manualOverrideFields: AdminMediaField[];
  usage: AdminMediaUsageResponse;
  copies: AdminMediaCopyResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminMediaListResponse {
  items: AdminMediaResponse[];
  page: number;
  pageSize: 25 | 50 | 100;
  totalCount: number;
  totalPages: number;
  mimeTypes: string[];
}

export interface CreateAdminMediaRequest {
  mediaType: MediaType;
  title: string;
  artist: string;
  artistCredits?: string[];
  albumArtist?: string | null;
  albumArtistCredits?: string[];
  album?: string | null;
  genres?: string[];
  discNumber?: number | null;
  trackNumber?: number | null;
  durationMs?: number | null;
  publishedAt?: string | null;
  metadataMode?: string;
  metadataTitle?: string | null;
  metadataArtist?: string | null;
  metadataArtistCredits?: string[];
  metadataAlbumArtist?: string | null;
  metadataAlbumArtistCredits?: string[];
  metadataAlbum?: string | null;
  metadataGenres?: string[];
  metadataDiscNumber?: number | null;
  metadataTrackNumber?: number | null;
  metadataProviderId?: string | null;
  metadataProviderKind?: string | null;
  metadataProviderName?: string | null;
  metadataExternalTrackId?: string | null;
  metadataExternalReleaseId?: string | null;
  metadataSourceUrl?: string | null;
  metadataDetails?: MediaMetadataDetail[];
  metadataMatchedAt?: string | null;
  coverId?: string | null;
}

export interface UpdateAdminMediaRequest {
  field: AdminMediaField;
  value: AdminMediaFieldValue;
  expectedUpdatedAt: string;
}

export interface CreateAdminMediaCopyRequest {
  librarySourceId: string;
  relativePath: string;
  mediaType: MediaType;
  mediaTypeOrigin?: MediaTypeOrigin;
  title: string;
  artist: string;
  artistCredits?: string[];
  albumArtist?: string | null;
  albumArtistCredits?: string[];
  album?: string | null;
  genres?: string[];
  discNumber?: number | null;
  trackNumber?: number | null;
  durationMs?: number | null;
  publishedAt?: string | null;
  mimeType: string;
  fileSizeBytes: string;
  fileModifiedAt: string;
  externalId?: string | null;
  externalVersion?: string | null;
  externalContainer?: string | null;
  externalCoverKey?: string | null;
  recordingIdentityKeys?: string[];
  audioLossless?: boolean;
  audioBitrate?: number | null;
  coverId?: string | null;
}

export interface UpdateAdminMediaCopyRequest {
  field: AdminMediaCopyField;
  value: AdminMediaFieldValue;
  expectedUpdatedAt: string;
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

export type MediaListResponse = CursorPageResponse<MediaResponse>;

export interface ResolveMediaRequest {
  ids: string[];
}

export interface ResolveMediaResponse {
  items: MediaResponse[];
  aliases: Record<string, string>;
}

export interface AlbumSummaryResponse {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  sourceKinds: LibrarySourceKind[];
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

export type PlaylistKind = "manual" | "external" | "liked-tracks";

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

export interface ExternalMediaReference {
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
  media: MediaResponse | null;
  external: ExternalMediaReference | null;
}

export interface PlaylistDetailResponse extends PlaylistSummaryResponse {
  entries: PlaylistEntryResponse[];
  link?: PlaylistLinkResponse | null;
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
      mediaId: string;
    }
  | {
      kind: "external";
      reference: ExternalMediaReference;
    };

export interface AddPlaylistItemResponse {
  added: boolean;
  playlist: PlaylistDetailResponse;
}

export interface ReorderPlaylistItemsRequest {
  itemIds: string[];
}

export type PlaylistSyncMode = "import" | "synchronize";

export interface PlaylistAccountResponse {
  id: string;
  kind: string;
  name: string;
  configuration: Record<string, string>;
  hasCredential: boolean;
  enabled: boolean;
}

export interface PlaylistAccountListResponse {
  items: PlaylistAccountResponse[];
}

export interface CreatePlaylistAccountRequest {
  kind: string;
  name: string;
  configuration?: Record<string, string>;
  credential?: Record<string, string>;
}

export interface RemotePlaylistResponse {
  id: string;
  title: string;
  itemCount: number | null;
}

export interface RemotePlaylistListResponse {
  items: RemotePlaylistResponse[];
}

export interface PlaylistLinkResponse {
  id: string;
  accountId: string;
  accountName: string;
  externalPlaylistId: string;
  syncMode: PlaylistSyncMode;
  remoteVersion: string | null;
  lastSyncedAt: string | null;
}

export interface CreatePlaylistLinkRequest {
  accountId: string;
  externalPlaylistId: string;
  syncMode?: PlaylistSyncMode;
}

export interface PlaylistSyncResultResponse {
  added: number;
  matched: number;
  removed: number;
  unchanged: number;
  unmatched: number;
  playlist: PlaylistDetailResponse;
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

export interface RecordMediaPlayResponse {
  mediaId: string;
  playedAt: string;
}

export interface QuickPickMediaResponse {
  kind: "media";
  key: string;
  mediaId: string;
  media: MediaResponse;
}

export interface QuickPickAlbumResponse {
  kind: "album";
  key: string;
  title: string;
  artist: string;
  album: AlbumSummaryResponse;
}

export type QuickPickItemResponse =
  QuickPickMediaResponse | QuickPickAlbumResponse;

export interface QuickPickListResponse {
  items: QuickPickItemResponse[];
}

export interface MediaLikeResponse {
  mediaId: string;
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
  media: MediaLikeResponse[];
  albums: AlbumLikeResponse[];
  audiobooks: AudiobookLikeResponse[];
  podcasts: PodcastLikeResponse[];
  artists: ArtistLikeResponse[];
  playlists: PlaylistLikeResponse[];
}

export type LikeTarget =
  | { kind: "media"; mediaId: string }
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
  | ({ kind: "media" } & MediaLikeResponse)
  | ({ kind: "album" } & AlbumLikeResponse)
  | ({ kind: "audiobook" } & AudiobookLikeResponse)
  | ({ kind: "podcast" } & PodcastLikeResponse)
  | ({ kind: "artist" } & ArtistLikeResponse)
  | ({ kind: "playlist" } & PlaylistLikeResponse);

export type TaskStatus =
  | "waiting"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "stopped";

export type TaskKind =
  | "release_import"
  | "library_scan"
  | "catalog_projection"
  | "metadata_enrichment"
  | "artwork_fetch"
  | "media_match"
  | "playlist_import"
  | "playlist_sync";

export const TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY =
  "metadata.activeProvider";
export const TASK_RELEASE_IMPORT_ID_DETAIL_KEY = "release.internalId";
export const TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY = "release.stage";
export type TaskReleaseImportStage = "downloading" | "addingToLibrary";

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

export interface TaskConnectorResponse {
  id: string | null;
  kind: string | null;
  name: string;
}

export interface TaskResponse {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  titleMessage: MessageDescriptor;
  ownerUserId?: string | null;
  parentTaskId: string | null;
  connector: TaskConnectorResponse | null;
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

export type LibrarySourceKind = "path" | "jellyfin";

export type ConnectorRole =
  | "library-source"
  | "release-indexer"
  | "download-client"
  | "metadata-provider"
  | "playlist-account";

export interface ConnectorDescriptorResponse {
  kind: string;
  role: ConnectorRole;
  name: string;
  capabilities: string[];
}

export interface ConnectorListResponse {
  items: ConnectorDescriptorResponse[];
}

export type SourceRemovalPhase = "stopping" | "copies" | "catalog";

export interface LibrarySourceRemovalProgressResponse {
  operationId: string;
  sourceId: string;
  phase: SourceRemovalPhase;
  completed: number;
  total: number;
}

export interface LibrarySourceResponse {
  id: string;
  kind: LibrarySourceKind;
  name: string | null;
  path: string | null;
  url: string | null;
  configuration: Record<string, string> | null;
  fileCount: number;
  lastSyncedAt: string | null;
  removal: LibrarySourceRemovalProgressResponse | null;
}

export interface CreateLibrarySourceResponse extends LibrarySourceResponse {
  task: TaskResponse | null;
}

export interface LibrarySourceListResponse {
  items: LibrarySourceResponse[];
}

export interface LibrarySourceRemovalResponse {
  sourceId: string;
  unavailableMediaCopyCount: number;
  affectedAlbumCount: number;
  affectedArtistCount: number;
  durationMs: number;
}

export interface CreatePathLibrarySourceRequest {
  kind: "path";
  name?: string | null;
  path: string;
}

export interface CreateJellyfinLibrarySourceRequest {
  kind: "jellyfin";
  name?: string | null;
  url: string;
  apiKey: string;
  libraryId: string;
  collectionType: string | null;
}

export type DownloadClientAuthType = "apiKey" | "password";
export interface DownloadClientInput {
  authType?: DownloadClientAuthType;
  username?: string;
  password?: string;
  kind: "qbittorrent";
  name: string;
  url: string;
  apiKey?: string;
}
export interface DownloadClientResponse {
  id: string;
  kind: "qbittorrent";
  name: string;
  url: string;
  hasApiKey: boolean;
  authType: DownloadClientAuthType;
  username: string;
}
export interface DownloadClientOptions {
  categories: string[];
  tags: string[];
}
export interface DownloadLinkInput {
  downloadClientId?: string;
  librarySourceId?: string;
  savePath?: string;
  category?: string;
  tags?: string;
  categoryPath?: boolean;
}
export interface ReleaseIndexerInput extends DownloadLinkInput {
  name?: string;
  url: string;
  apiKey?: string;
}

export interface ReleaseIndexerResponse {
  id: string;
  kind: "torznab";
  name: string | null;
  url: string;
  configuration: Record<string, string>;
  downloadClientId: string | null;
  destinationSourceId: string | null;
  lastSyncedAt: string | null;
}

export interface ReleaseIndexerListResponse {
  items: ReleaseIndexerResponse[];
}

export type CreateLibrarySourceRequest =
  CreatePathLibrarySourceRequest | CreateJellyfinLibrarySourceRequest;

export interface LibrarySourceConnectorOptionResponse {
  id: string;
  label: string;
  configuration: Record<string, string>;
}

export interface LibrarySourceConnectorOptionListResponse {
  items: LibrarySourceConnectorOptionResponse[];
}

export interface DiscoverLibrarySourceRequest {
  configuration: Record<string, string>;
  credentials: Record<string, string>;
}

export interface ReorderLibrarySourcesRequest {
  ids: string[];
}

export interface ReorderReleaseIndexersRequest {
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

export type MediaMetadataMatchMode = "automatic" | "manual";

export interface MediaMetadataResponse {
  providerId: string;
  providerKind: MetadataProviderKind;
  providerName: string;
  externalTrackId: string;
  externalReleaseId: string | null;
  matchedAt: string;
  mode: MediaMetadataMatchMode;
  sourceUrl: string;
  genres: string[];
  details: MediaMetadataDetail[];
}

export interface MediaMetadataDetail {
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
  details: MediaMetadataDetail[];
}

export interface MetadataCandidateListResponse {
  items: MetadataCandidateResponse[];
}

export interface ApplyMediaMetadataRequest {
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
  details: MediaMetadataDetail[];
}

export interface ResetMetadataResponse {
  mediaCount: number;
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

export const DEFAULT_SCAN_WORKER_COUNT = 6;
export const SCAN_WORKER_WARNING_THRESHOLD = 8;
export const MAX_SCAN_WORKER_COUNT = 32;
export const DEFAULT_FILE_LOG_RETENTION_DAYS = 5;
export const MAX_FILE_LOG_RETENTION_DAYS = 3650;

export interface ServerSettingsResponse {
  mediaCount: number;
  availableMediaCount: number;
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

export type RealtimeTopic = "tasks" | "catalog" | "logs" | "library-sources";

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
  librarySourceId: string | null;
  reason:
    "scan" | "metadata" | "reset" | "source" | "source-removal" | "media-match";
  changedCount: number;
}

export interface RealtimeLibrarySourceRemovalProgressEvent extends LibrarySourceRemovalProgressResponse {
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
  | RealtimeLibrarySourceRemovalProgressEvent
  | RealtimeLogAppendedEvent;

export interface ReleaseResult {
  type: "release";
  indexerId: string;
  sourceName: string;
  canImport: boolean;
  id: string;
  title: string;
  mediaType: MediaType | null;
  seeders: number | null;
  bytes: number | null;
  torrentStatus?: DownloadClientTorrentStatus | null;
}

export interface DownloadClientTorrentStatus {
  hash: string;
  state: string;
  progress: number;
  taskId: string | null;
}

export interface TrackReferenceResult {
  type: "track-reference";
  connectorId: string;
  sourceName: string;
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  isrc: string | null;
}

export interface PlaylistResult {
  type: "playlist";
  connectorId: string;
  sourceName: string;
  externalId: string;
  title: string;
  itemCount: number | null;
}

export type ExternalSearchResult =
  ReleaseResult | TrackReferenceResult | PlaylistResult;

export interface ExternalProviderStatus {
  connectorId: string;
  kind: string;
  name: string;
  ok: boolean;
  errorMessage: MessageDescriptor | null;
}

export interface ExternalSearchResponse {
  items: ExternalSearchResult[];
  providers: ExternalProviderStatus[];
}

export interface CreateReleaseImportRequest {
  indexerId: string;
  releaseId: string;
}

export interface ReleaseImportResponse {
  taskId: string;
  releaseId: string;
  task: TaskResponse;
}

export interface ReleaseImportStatus {
  taskId: string;
  releaseId: string;
  progress: number;
  state: string;
  mediaIds: string[];
}
