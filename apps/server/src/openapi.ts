import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance, FastifySchema } from "fastify";
import { PERIDOT_VERSION } from "./version.js";

type SchemaObject = Record<string, unknown>;
type SecurityRequirement = Record<string, string[]>;

interface OpenApiOperation {
  tag: string;
  summary: string;
  description?: string;
  responses?: Record<string, SchemaObject>;
  query?: SchemaObject;
  body?: SchemaObject;
  produces?: string[];
  security?: SecurityRequirement[];
}

const stringSchema: SchemaObject = { type: "string" };
const numberSchema: SchemaObject = { type: "number" };
const integerSchema: SchemaObject = { type: "integer" };
const booleanSchema: SchemaObject = { type: "boolean" };
const nullSchema: SchemaObject = { type: "null" };
const dateTimeSchema: SchemaObject = { type: "string", format: "date-time" };
const stringRecordSchema: SchemaObject = {
  type: "object",
  additionalProperties: stringSchema,
};

function enumeration(...values: string[]): SchemaObject {
  return { type: "string", enum: values };
}

function arrayOf(items: SchemaObject): SchemaObject {
  return { type: "array", items };
}

function nullable(schema: SchemaObject): SchemaObject {
  return { anyOf: [schema, nullSchema] };
}

function objectSchema(
  properties: Record<string, SchemaObject>,
  required: readonly string[] = Object.keys(properties),
): SchemaObject {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

function ref(name: string): SchemaObject {
  return { $ref: `#/components/schemas/${name}` };
}

function response(
  schema: SchemaObject,
  description = "Successful response",
): SchemaObject {
  return { description, ...schema };
}

function noContent(description = "No content"): SchemaObject {
  return { description };
}

function jsonOperation(
  tag: string,
  summary: string,
  responseSchema: SchemaObject | null,
  options: Omit<OpenApiOperation, "tag" | "summary" | "responses"> & {
    status?: number;
    responseDescription?: string;
  } = {},
): OpenApiOperation {
  const {
    status = 200,
    responseDescription = "Successful response",
    ...operation
  } = options;
  return {
    tag,
    summary,
    ...operation,
    responses: {
      [status]:
        responseSchema === null
          ? noContent()
          : response(responseSchema, responseDescription),
    },
  };
}

function operationWithResponses(
  tag: string,
  summary: string,
  responses: Record<string, SchemaObject>,
  options: Omit<OpenApiOperation, "tag" | "summary" | "responses"> = {},
): OpenApiOperation {
  return { tag, summary, ...options, responses };
}

const mediaTypeSchema = enumeration("music", "audiobook", "podcast");
const trackMediaFilterSchema = enumeration(
  "music",
  "audiobook",
  "podcast",
  "all",
);
const trackMediaTypeOriginSchema = enumeration(
  "source",
  "embedded",
  "fallback",
);
const metadataProviderKindSchema = enumeration("musicbrainz", "discogs");
const taskStatusSchema = enumeration(
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
  "stopped",
);
const taskKindSchema = enumeration(
  "library_scan",
  "catalog_fetch",
  "metadata_fetch",
  "artwork_fetch",
);

const schemas: Record<string, SchemaObject> = {
  MessageParams: {
    type: "object",
    additionalProperties: {
      anyOf: [{ type: "string" }, { type: "number" }],
    },
  },
  MessageDescriptor: objectSchema(
    {
      key: stringSchema,
      params: ref("MessageParams"),
      count: numberSchema,
    },
    ["key"],
  ),
  ApiErrorResponse: objectSchema({
    error: objectSchema({
      code: stringSchema,
      messageDescriptor: ref("MessageDescriptor"),
    }),
  }),
  HealthResponse: objectSchema({
    status: { const: "ok" },
    service: { const: "peridot" },
  }),
  UserRole: enumeration("admin", "member"),
  UserResponse: objectSchema({
    id: stringSchema,
    email: stringSchema,
    displayName: stringSchema,
    role: ref("UserRole"),
  }),
  UserListResponse: objectSchema({
    items: arrayOf(ref("UserResponse")),
  }),
  UpdateUserProfileRequest: objectSchema({
    displayName: stringSchema,
  }),
  UserPreferencesResponse: objectSchema({
    likedTitlesOffline: booleanSchema,
    initialized: booleanSchema,
  }),
  UpdateUserPreferencesRequest: objectSchema({
    likedTitlesOffline: booleanSchema,
  }),
  CreateUserRequest: objectSchema({
    email: stringSchema,
    displayName: stringSchema,
    password: stringSchema,
    role: ref("UserRole"),
  }),
  UpdateUserRequest: objectSchema(
    {
      email: stringSchema,
      displayName: stringSchema,
      password: stringSchema,
      role: ref("UserRole"),
    },
    [],
  ),
  AuthStatusResponse: objectSchema({
    requiresAdminUser: booleanSchema,
  }),
  AuthSessionResponse: objectSchema({
    token: stringSchema,
    expiresAt: dateTimeSchema,
    user: ref("UserResponse"),
  }),
  PasswordResetRequest: objectSchema({
    email: stringSchema,
  }),
  PasswordResetRequestResponse: objectSchema({
    status: { const: "requested" },
  }),
  CompletePasswordResetRequest: objectSchema({
    token: stringSchema,
    password: stringSchema,
  }),
  TrackMetadataDetail: objectSchema({
    key: stringSchema,
    value: stringSchema,
    labelMessage: ref("MessageDescriptor"),
  }),
  TrackMetadataResponse: objectSchema({
    providerId: stringSchema,
    providerKind: metadataProviderKindSchema,
    providerName: stringSchema,
    externalTrackId: stringSchema,
    externalReleaseId: nullable(stringSchema),
    matchedAt: dateTimeSchema,
    mode: enumeration("automatic", "manual"),
    sourceUrl: stringSchema,
    genres: arrayOf(stringSchema),
    details: arrayOf(ref("TrackMetadataDetail")),
  }),
  TrackResponse: objectSchema({
    id: stringSchema,
    mediaType: mediaTypeSchema,
    mediaTypeOrigin: trackMediaTypeOriginSchema,
    title: stringSchema,
    artist: stringSchema,
    artists: arrayOf(stringSchema),
    album: nullable(stringSchema),
    genres: arrayOf(stringSchema),
    albumId: nullable(stringSchema),
    discNumber: nullable(integerSchema),
    trackNumber: nullable(integerSchema),
    durationMs: nullable(integerSchema),
    publishedAt: nullable(dateTimeSchema),
    mimeType: stringSchema,
    available: booleanSchema,
    coverUrl: nullable(stringSchema),
    metadata: nullable(ref("TrackMetadataResponse")),
    liked: booleanSchema,
  }),
  ResolveTracksRequest: objectSchema({
    ids: {
      ...arrayOf(stringSchema),
      maxItems: 500,
    },
  }),
  ResolveTracksResponse: objectSchema({
    items: arrayOf(ref("TrackResponse")),
  }),
  TrackListResponse: objectSchema({
    items: arrayOf(ref("TrackResponse")),
    nextCursor: nullable(stringSchema),
    totalCount: integerSchema,
    catalogRevision: integerSchema,
  }),
  AlbumSummaryResponse: objectSchema({
    id: stringSchema,
    title: stringSchema,
    artist: stringSchema,
    artists: arrayOf(stringSchema),
    coverUrl: nullable(stringSchema),
    trackCount: integerSchema,
    durationMs: nullable(integerSchema),
    releaseYear: nullable(integerSchema),
    available: booleanSchema,
    liked: booleanSchema,
  }),
  AlbumListResponse: objectSchema({
    items: arrayOf(ref("AlbumSummaryResponse")),
    nextCursor: nullable(stringSchema),
    totalCount: integerSchema,
    catalogRevision: integerSchema,
  }),
  AudiobookSummaryResponse: objectSchema({
    id: stringSchema,
    mediaType: { const: "audiobook" },
    title: stringSchema,
    author: stringSchema,
    authors: arrayOf(stringSchema),
    coverUrl: nullable(stringSchema),
    chapterCount: integerSchema,
    durationMs: nullable(integerSchema),
    releaseYear: nullable(integerSchema),
    available: booleanSchema,
    liked: booleanSchema,
  }),
  AudiobookListResponse: objectSchema({
    items: arrayOf(ref("AudiobookSummaryResponse")),
    nextCursor: nullable(stringSchema),
    totalCount: integerSchema,
    catalogRevision: integerSchema,
  }),
  PodcastSummaryResponse: objectSchema({
    id: stringSchema,
    mediaType: { const: "podcast" },
    title: stringSchema,
    publisher: stringSchema,
    publishers: arrayOf(stringSchema),
    coverUrl: nullable(stringSchema),
    episodeCount: integerSchema,
    durationMs: nullable(integerSchema),
    latestPublishedAt: nullable(dateTimeSchema),
    available: booleanSchema,
    liked: booleanSchema,
  }),
  PodcastListResponse: objectSchema({
    items: arrayOf(ref("PodcastSummaryResponse")),
    nextCursor: nullable(stringSchema),
    totalCount: integerSchema,
    catalogRevision: integerSchema,
  }),
  ArtistMetadataProvenanceResponse: objectSchema({
    providerId: stringSchema,
    providerKind: metadataProviderKindSchema,
    providerName: stringSchema,
    externalArtistId: stringSchema,
    sourceUrl: stringSchema,
  }),
  ArtistMetadataResponse: objectSchema({
    mode: enumeration("automatic", "manual"),
    matchedAt: dateTimeSchema,
    name: ref("ArtistMetadataProvenanceResponse"),
    portrait: nullable(ref("ArtistMetadataProvenanceResponse")),
  }),
  ArtistSummaryResponse: objectSchema({
    id: stringSchema,
    name: stringSchema,
    localName: stringSchema,
    albumCount: integerSchema,
    trackCount: integerSchema,
    durationMs: nullable(integerSchema),
    imageUrl: nullable(stringSchema),
    metadata: nullable(ref("ArtistMetadataResponse")),
    available: booleanSchema,
    liked: booleanSchema,
  }),
  ArtistListResponse: objectSchema({
    items: arrayOf(ref("ArtistSummaryResponse")),
    nextCursor: nullable(stringSchema),
    totalCount: integerSchema,
    catalogRevision: integerSchema,
  }),
  PlaylistSummaryResponse: objectSchema({
    id: stringSchema,
    name: stringSchema,
    trackCount: integerSchema,
    availableTrackCount: integerSchema,
    durationMs: nullable(integerSchema),
    coverUrls: arrayOf(stringSchema),
    liked: booleanSchema,
    containsTrack: booleanSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  }),
  PlaylistExternalTrackReference: objectSchema({
    provider: stringSchema,
    externalTrackId: stringSchema,
    title: stringSchema,
    artist: stringSchema,
    album: nullable(stringSchema),
    durationMs: nullable(integerSchema),
  }),
  PlaylistEntryResponse: objectSchema({
    id: stringSchema,
    position: integerSchema,
    title: stringSchema,
    artist: stringSchema,
    artists: arrayOf(stringSchema),
    album: nullable(stringSchema),
    durationMs: nullable(integerSchema),
    coverUrl: nullable(stringSchema),
    available: booleanSchema,
    liked: booleanSchema,
    track: nullable(ref("TrackResponse")),
    external: nullable(ref("PlaylistExternalTrackReference")),
  }),
  PlaylistDetailResponse: objectSchema({
    id: stringSchema,
    name: stringSchema,
    trackCount: integerSchema,
    availableTrackCount: integerSchema,
    durationMs: nullable(integerSchema),
    coverUrls: arrayOf(stringSchema),
    liked: booleanSchema,
    containsTrack: booleanSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    entries: arrayOf(ref("PlaylistEntryResponse")),
  }),
  PlaylistListResponse: objectSchema({
    items: arrayOf(ref("PlaylistSummaryResponse")),
    totalCount: integerSchema,
    nextOffset: nullable(integerSchema),
  }),
  CreatePlaylistRequest: objectSchema({
    name: { type: "string", minLength: 1, maxLength: 120 },
  }),
  UpdatePlaylistRequest: objectSchema({
    name: { type: "string", minLength: 1, maxLength: 120 },
  }),
  AddPlaylistItemRequest: {
    oneOf: [
      objectSchema({
        kind: { const: "catalog" },
        trackId: stringSchema,
      }),
      objectSchema({
        kind: { const: "external" },
        reference: ref("PlaylistExternalTrackReference"),
      }),
    ],
  },
  AddPlaylistItemResponse: objectSchema({
    added: booleanSchema,
    playlist: ref("PlaylistDetailResponse"),
  }),
  ReorderPlaylistItemsRequest: objectSchema({
    itemIds: arrayOf(stringSchema),
  }),
  MetadataCandidateResponse: objectSchema({
    providerId: stringSchema,
    providerKind: metadataProviderKindSchema,
    providerName: stringSchema,
    externalTrackId: stringSchema,
    externalReleaseId: nullable(stringSchema),
    title: stringSchema,
    artist: stringSchema,
    artists: arrayOf(stringSchema),
    albumArtists: arrayOf(stringSchema),
    album: nullable(stringSchema),
    genres: arrayOf(stringSchema),
    discNumber: nullable(integerSchema),
    trackNumber: nullable(integerSchema),
    durationMs: nullable(integerSchema),
    score: numberSchema,
    sourceUrl: stringSchema,
    details: arrayOf(ref("TrackMetadataDetail")),
  }),
  MetadataCandidateListResponse: objectSchema({
    items: arrayOf(ref("MetadataCandidateResponse")),
  }),
  ArtistMetadataCandidateResponse: objectSchema({
    providerId: stringSchema,
    providerKind: metadataProviderKindSchema,
    providerName: stringSchema,
    externalArtistId: stringSchema,
    name: stringSchema,
    disambiguation: nullable(stringSchema),
    score: numberSchema,
    sourceUrl: stringSchema,
    portraitAvailable: booleanSchema,
  }),
  ArtistMetadataCandidateListResponse: objectSchema({
    items: arrayOf(ref("ArtistMetadataCandidateResponse")),
  }),
  ApplyTrackMetadataRequest: objectSchema({
    providerId: stringSchema,
    externalTrackId: stringSchema,
    externalReleaseId: nullable(stringSchema),
    title: stringSchema,
    artist: stringSchema,
    artists: arrayOf(stringSchema),
    albumArtists: arrayOf(stringSchema),
    album: nullable(stringSchema),
    genres: arrayOf(stringSchema),
    discNumber: nullable(integerSchema),
    trackNumber: nullable(integerSchema),
    sourceUrl: stringSchema,
    details: arrayOf(ref("TrackMetadataDetail")),
  }),
  ApplyArtistMetadataRequest: objectSchema({
    providerId: stringSchema,
    externalArtistId: stringSchema,
    name: stringSchema,
    sourceUrl: stringSchema,
    portraitAvailable: booleanSchema,
  }),
  PlaybackTokenResponse: objectSchema({
    token: stringSchema,
    expiresAt: dateTimeSchema,
  }),
  RecordTrackPlayResponse: objectSchema({
    trackId: stringSchema,
    playedAt: dateTimeSchema,
  }),
  TrackLikeResponse: objectSchema({
    trackId: stringSchema,
    likedAt: dateTimeSchema,
  }),
  AlbumLikeResponse: objectSchema({
    albumId: stringSchema,
    title: stringSchema,
    artist: stringSchema,
    likedAt: dateTimeSchema,
  }),
  AudiobookLikeResponse: objectSchema({
    audiobookId: stringSchema,
    title: stringSchema,
    author: stringSchema,
    likedAt: dateTimeSchema,
  }),
  PodcastLikeResponse: objectSchema({
    podcastId: stringSchema,
    title: stringSchema,
    publisher: stringSchema,
    likedAt: dateTimeSchema,
  }),
  ArtistLikeResponse: objectSchema({
    name: stringSchema,
    likedAt: dateTimeSchema,
  }),
  PlaylistLikeResponse: objectSchema({
    playlistId: stringSchema,
    name: stringSchema,
    likedAt: dateTimeSchema,
  }),
  LikeListResponse: objectSchema({
    tracks: arrayOf(ref("TrackLikeResponse")),
    albums: arrayOf(ref("AlbumLikeResponse")),
    audiobooks: arrayOf(ref("AudiobookLikeResponse")),
    podcasts: arrayOf(ref("PodcastLikeResponse")),
    artists: arrayOf(ref("ArtistLikeResponse")),
    playlists: arrayOf(ref("PlaylistLikeResponse")),
  }),
  LikeTarget: {
    oneOf: [
      objectSchema({ kind: { const: "track" }, trackId: stringSchema }),
      objectSchema({
        kind: { const: "album" },
        albumId: stringSchema,
        title: stringSchema,
        artist: stringSchema,
      }),
      objectSchema({
        kind: { const: "audiobook" },
        audiobookId: stringSchema,
        title: stringSchema,
        author: stringSchema,
      }),
      objectSchema({
        kind: { const: "podcast" },
        podcastId: stringSchema,
        title: stringSchema,
        publisher: stringSchema,
      }),
      objectSchema({ kind: { const: "artist" }, name: stringSchema }),
      objectSchema({
        kind: { const: "playlist" },
        playlistId: stringSchema,
        name: stringSchema,
      }),
    ],
  },
  LikeResponse: {
    oneOf: [
      objectSchema({
        kind: { const: "track" },
        trackId: stringSchema,
        likedAt: dateTimeSchema,
      }),
      objectSchema({
        kind: { const: "album" },
        albumId: stringSchema,
        title: stringSchema,
        artist: stringSchema,
        likedAt: dateTimeSchema,
      }),
      objectSchema({
        kind: { const: "audiobook" },
        audiobookId: stringSchema,
        title: stringSchema,
        author: stringSchema,
        likedAt: dateTimeSchema,
      }),
      objectSchema({
        kind: { const: "podcast" },
        podcastId: stringSchema,
        title: stringSchema,
        publisher: stringSchema,
        likedAt: dateTimeSchema,
      }),
      objectSchema({
        kind: { const: "artist" },
        name: stringSchema,
        likedAt: dateTimeSchema,
      }),
      objectSchema({
        kind: { const: "playlist" },
        playlistId: stringSchema,
        name: stringSchema,
        likedAt: dateTimeSchema,
      }),
    ],
  },
  QueueResponse: objectSchema({
    trackIds: arrayOf(stringSchema),
    activeTrackId: nullable(stringSchema),
    shuffleEnabled: booleanSchema,
    shuffleTrackIds: arrayOf(stringSchema),
  }),
  ReplaceQueueRequest: objectSchema({
    trackIds: arrayOf(stringSchema),
    activeTrackId: nullable(stringSchema),
    shuffleEnabled: booleanSchema,
    shuffleTrackIds: arrayOf(stringSchema),
  }),
  QuickPickTrackResponse: objectSchema({
    kind: { const: "track" },
    key: stringSchema,
    trackId: stringSchema,
    track: ref("TrackResponse"),
  }),
  QuickPickAlbumResponse: objectSchema({
    kind: { const: "album" },
    key: stringSchema,
    title: stringSchema,
    artist: stringSchema,
    album: ref("AlbumSummaryResponse"),
  }),
  QuickPickListResponse: objectSchema({
    items: {
      type: "array",
      items: {
        oneOf: [ref("QuickPickTrackResponse"), ref("QuickPickAlbumResponse")],
      },
    },
  }),
  TaskProgressResponse: {
    oneOf: [
      objectSchema({
        state: { const: "indeterminate" },
        completed: nullSchema,
        total: nullSchema,
      }),
      objectSchema({
        state: { const: "determinate" },
        completed: integerSchema,
        total: integerSchema,
      }),
    ],
  },
  TaskDetailResponse: objectSchema({
    key: stringSchema,
    value: stringSchema,
    labelMessage: ref("MessageDescriptor"),
    valueMessage: nullable(ref("MessageDescriptor")),
  }),
  TaskSourceResponse: objectSchema({
    id: nullable(stringSchema),
    name: stringSchema,
  }),
  TaskResponse: objectSchema({
    id: stringSchema,
    kind: taskKindSchema,
    status: taskStatusSchema,
    titleMessage: ref("MessageDescriptor"),
    parentTaskId: nullable(stringSchema),
    source: nullable(ref("TaskSourceResponse")),
    progress: ref("TaskProgressResponse"),
    details: arrayOf(ref("TaskDetailResponse")),
    failureMessage: nullable(ref("MessageDescriptor")),
    createdAt: dateTimeSchema,
    startedAt: nullable(dateTimeSchema),
    completedAt: nullable(dateTimeSchema),
    updatedAt: dateTimeSchema,
  }),
  TaskListResponse: objectSchema({
    items: arrayOf(ref("TaskResponse")),
    activeCount: integerSchema,
    queuedCount: integerSchema,
  }),
  SourceRemovalProgressResponse: objectSchema({
    operationId: stringSchema,
    sourceId: stringSchema,
    phase: enumeration("stopping", "tracks", "catalog"),
    completed: integerSchema,
    total: integerSchema,
  }),
  SourceResponse: objectSchema({
    id: stringSchema,
    kind: enumeration("path", "url", "jellyfin"),
    name: nullable(stringSchema),
    path: nullable(stringSchema),
    url: nullable(stringSchema),
    configuration: nullable(stringRecordSchema),
    fileCount: integerSchema,
    lastSyncedAt: nullable(dateTimeSchema),
    removal: nullable(ref("SourceRemovalProgressResponse")),
  }),
  CreateSourceResponse: objectSchema({
    id: stringSchema,
    kind: enumeration("path", "url", "jellyfin"),
    name: nullable(stringSchema),
    path: nullable(stringSchema),
    url: nullable(stringSchema),
    configuration: nullable(stringRecordSchema),
    fileCount: integerSchema,
    lastSyncedAt: nullable(dateTimeSchema),
    removal: nullable(ref("SourceRemovalProgressResponse")),
    task: nullable(ref("TaskResponse")),
  }),
  CreateSourceRequest: {
    oneOf: [
      objectSchema({
        kind: { const: "path" },
        name: nullable(stringSchema),
        path: stringSchema,
      }),
      objectSchema({
        kind: { const: "url" },
        name: nullable(stringSchema),
        url: stringSchema,
      }),
      objectSchema({
        kind: { const: "jellyfin" },
        name: nullable(stringSchema),
        url: stringSchema,
        apiKey: stringSchema,
        libraryId: stringSchema,
        collectionType: nullable(stringSchema),
      }),
    ],
  },
  SourceListResponse: objectSchema({
    items: arrayOf(ref("SourceResponse")),
  }),
  SourceRemovalResponse: objectSchema({
    sourceId: stringSchema,
    unavailableTrackCount: integerSchema,
    affectedAlbumCount: integerSchema,
    affectedArtistCount: integerSchema,
    durationMs: integerSchema,
  }),
  ReorderSourcesRequest: objectSchema({
    ids: arrayOf(stringSchema),
  }),
  DiscoverSourceIntegrationRequest: objectSchema({
    configuration: stringRecordSchema,
    credentials: stringRecordSchema,
  }),
  SourceIntegrationOptionResponse: objectSchema({
    id: stringSchema,
    label: stringSchema,
    configuration: stringRecordSchema,
  }),
  SourceIntegrationOptionListResponse: objectSchema({
    items: arrayOf(ref("SourceIntegrationOptionResponse")),
  }),
  MetadataProviderFieldDefinition: objectSchema({
    key: stringSchema,
    labelMessage: ref("MessageDescriptor"),
    type: enumeration("text", "url", "password"),
    required: booleanSchema,
    placeholderMessage: nullable(ref("MessageDescriptor")),
    helpMessage: nullable(ref("MessageDescriptor")),
  }),
  MetadataProviderDefinitionResponse: objectSchema({
    kind: metadataProviderKindSchema,
    nameMessage: ref("MessageDescriptor"),
    descriptionMessage: ref("MessageDescriptor"),
    configurationFields: arrayOf(ref("MetadataProviderFieldDefinition")),
    credentialField: nullable(ref("MetadataProviderFieldDefinition")),
    supportsAutomaticMatching: booleanSchema,
    supportsManualSearch: booleanSchema,
  }),
  MetadataProviderDefinitionListResponse: objectSchema({
    items: arrayOf(ref("MetadataProviderDefinitionResponse")),
  }),
  MetadataProviderResponse: objectSchema({
    id: stringSchema,
    kind: metadataProviderKindSchema,
    name: stringSchema,
    accountLabel: nullable(stringSchema),
    configuration: stringRecordSchema,
    hasCredential: booleanSchema,
    enabled: booleanSchema,
  }),
  MetadataProviderListResponse: objectSchema({
    items: arrayOf(ref("MetadataProviderResponse")),
  }),
  CreateMetadataProviderRequest: objectSchema(
    {
      kind: metadataProviderKindSchema,
      name: nullable(stringSchema),
      configuration: stringRecordSchema,
      credential: nullable(stringSchema),
    },
    ["kind"],
  ),
  UpdateMetadataProviderRequest: objectSchema(
    {
      enabled: booleanSchema,
      configuration: stringRecordSchema,
      credential: nullable(stringSchema),
    },
    [],
  ),
  ReorderMetadataProvidersRequest: objectSchema({
    ids: arrayOf(stringSchema),
  }),
  ScanWorkerSettingsResponse: objectSchema({
    workerCount: { type: "integer", minimum: 1, maximum: 32 },
  }),
  SourceRefreshSettingsResponse: objectSchema({
    enabled: booleanSchema,
    cron: stringSchema,
    nextRunAt: nullable(dateTimeSchema),
  }),
  FileLoggingSettingsResponse: objectSchema({
    enabled: booleanSchema,
    retentionDays: integerSchema,
    path: stringSchema,
  }),
  ServerSettingsResponse: objectSchema({
    trackCount: integerSchema,
    availableTrackCount: integerSchema,
    scanning: ref("ScanWorkerSettingsResponse"),
    sourceRefresh: ref("SourceRefreshSettingsResponse"),
    fileLogging: ref("FileLoggingSettingsResponse"),
  }),
  UpdateServerSettingsRequest: objectSchema(
    {
      scanning: objectSchema({
        workerCount: { type: "integer", minimum: 1, maximum: 32 },
      }),
      sourceRefresh: objectSchema({
        enabled: booleanSchema,
        cron: stringSchema,
      }),
      fileLogging: objectSchema({
        enabled: booleanSchema,
        retentionDays: integerSchema,
      }),
    },
    [],
  ),
  RestartServerResponse: objectSchema({
    status: { const: "restarting" },
  }),
  UpdateStatusResponse: objectSchema({
    version: stringSchema,
    channel: enumeration("dev", "beta", "stable", "local"),
    currentTag: nullable(stringSchema),
    currentCommit: nullable(stringSchema),
    latestTag: nullable(stringSchema),
    latestCommit: nullable(stringSchema),
    state: enumeration("unchecked", "current", "available"),
    checkedAt: nullable(dateTimeSchema),
  }),
  LogEntryResponse: objectSchema({
    id: integerSchema,
    time: stringSchema,
    level: stringSchema,
    message: stringSchema,
  }),
  LogListResponse: objectSchema({
    items: arrayOf(ref("LogEntryResponse")),
  }),
  DirectoryEntryResponse: objectSchema({
    name: stringSchema,
    path: stringSchema,
  }),
  DirectoryListResponse: objectSchema({
    items: arrayOf(ref("DirectoryEntryResponse")),
  }),
  DirectorySearchResponse: objectSchema({
    items: arrayOf(ref("DirectoryEntryResponse")),
    truncated: booleanSchema,
  }),
  ResetMetadataResponse: objectSchema({
    trackCount: integerSchema,
    artistCount: integerSchema,
  }),
  RealtimeTicketResponse: objectSchema({
    ticket: stringSchema,
    expiresAt: dateTimeSchema,
  }),
  DiscoveryResponse: objectSchema({
    items: arrayOf(
      objectSchema({
        address: stringSchema,
        host: stringSchema,
      }),
    ),
    scannedSubnets: arrayOf(stringSchema),
  }),
};

const bearerSecurity: SecurityRequirement[] = [{ bearerAuth: [] }];
const playbackTokenSecurity: SecurityRequirement[] = [
  { bearerAuth: [] },
  { playbackToken: [] },
];
const coverTokenSecurity: SecurityRequirement[] = [
  { bearerAuth: [] },
  { coverToken: [] },
];
const artistImageTokenSecurity: SecurityRequirement[] = [
  { bearerAuth: [] },
  { artistImageToken: [] },
];
const realtimeTicketSecurity: SecurityRequirement[] = [{ realtimeTicket: [] }];
const publicSecurity: SecurityRequirement[] = [];

const trackListQuery = objectSchema(
  {
    cursor: stringSchema,
    limit: { type: "integer", minimum: 1, maximum: 200 },
    sort: stringSchema,
    direction: enumeration("asc", "desc"),
    query: stringSchema,
    availability: enumeration("available", "unavailable", "all"),
    albumId: stringSchema,
    artistId: stringSchema,
    liked: booleanSchema,
    mediaType: trackMediaFilterSchema,
    collectionId: stringSchema,
  },
  [],
);
const cardListQuery = objectSchema(
  {
    cursor: stringSchema,
    limit: { type: "integer", minimum: 1, maximum: 200 },
    sort: stringSchema,
    direction: enumeration("asc", "desc"),
    query: stringSchema,
    availability: enumeration("available", "unavailable", "all"),
    artistId: stringSchema,
    liked: booleanSchema,
  },
  [],
);
const trackCollectionQuery = objectSchema(
  {
    cursor: stringSchema,
    limit: { type: "integer", minimum: 1, maximum: 200 },
    sort: stringSchema,
    direction: enumeration("asc", "desc"),
  },
  [],
);

function routeParameters(path: string): SchemaObject {
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  for (const match of path.matchAll(/:([A-Za-z0-9_]+)/gu)) {
    const name = match[1]!;
    properties[name] = stringSchema;
    required.push(name);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
}

const audioMimeTypes = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/ogg",
  "audio/wav",
];

const routes: Record<string, OpenApiOperation> = {
  "GET /api/health": jsonOperation(
    "System",
    "Get server health",
    ref("HealthResponse"),
    { security: publicSecurity },
  ),
  "GET /api/discovery/servers": jsonOperation(
    "Discovery",
    "Discover Peridot servers on private networks",
    ref("DiscoveryResponse"),
    { security: publicSecurity },
  ),
  "GET /api/auth/status": jsonOperation(
    "Authentication",
    "Get onboarding status",
    ref("AuthStatusResponse"),
    { security: publicSecurity },
  ),
  "POST /api/auth/bootstrap": jsonOperation(
    "Authentication",
    "Create the first administrator",
    ref("AuthSessionResponse"),
    {
      status: 201,
      body: objectSchema(
        {
          email: stringSchema,
          displayName: stringSchema,
          password: stringSchema,
        },
        ["email", "displayName", "password"],
      ),
      security: publicSecurity,
    },
  ),
  "POST /api/auth/sessions": jsonOperation(
    "Authentication",
    "Sign in",
    ref("AuthSessionResponse"),
    {
      body: objectSchema(
        {
          email: stringSchema,
          password: stringSchema,
        },
        ["email", "password"],
      ),
      security: publicSecurity,
    },
  ),
  "POST /api/auth/password-resets": jsonOperation(
    "Authentication",
    "Request password recovery",
    ref("PasswordResetRequestResponse"),
    {
      status: 202,
      responseDescription: "Generic password recovery acknowledgement",
      body: ref("PasswordResetRequest"),
      security: publicSecurity,
    },
  ),
  "POST /api/auth/password-resets/complete": jsonOperation(
    "Authentication",
    "Complete password recovery",
    null,
    {
      status: 204,
      body: ref("CompletePasswordResetRequest"),
      security: publicSecurity,
    },
  ),
  "DELETE /api/auth/session": jsonOperation(
    "Authentication",
    "Sign out the current session",
    null,
    { status: 204 },
  ),
  "GET /api/users/me": jsonOperation(
    "Users",
    "Get the signed-in user",
    ref("UserResponse"),
  ),
  "PUT /api/users/me": jsonOperation(
    "Users",
    "Update the signed-in user's profile",
    ref("UserResponse"),
    { body: ref("UpdateUserProfileRequest") },
  ),
  "GET /api/users/me/preferences": jsonOperation(
    "Users",
    "Get the signed-in user's preferences",
    ref("UserPreferencesResponse"),
  ),
  "PUT /api/users/me/preferences": jsonOperation(
    "Users",
    "Update the signed-in user's preferences",
    ref("UserPreferencesResponse"),
    { body: ref("UpdateUserPreferencesRequest") },
  ),
  "POST /api/users/me/preferences/initialize": jsonOperation(
    "Users",
    "Initialize preferences when no server value exists",
    ref("UserPreferencesResponse"),
    { body: ref("UpdateUserPreferencesRequest") },
  ),
  "GET /api/tracks": jsonOperation(
    "Catalog",
    "List tracks",
    ref("TrackListResponse"),
    { query: trackListQuery },
  ),
  "POST /api/tracks/resolve": jsonOperation(
    "Catalog",
    "Resolve catalog tracks in requested order",
    ref("ResolveTracksResponse"),
    { body: ref("ResolveTracksRequest") },
  ),
  "GET /api/tracks/:id": jsonOperation(
    "Catalog",
    "Get a track",
    ref("TrackResponse"),
  ),
  "GET /api/albums": jsonOperation(
    "Albums",
    "List albums",
    ref("AlbumListResponse"),
    { query: cardListQuery },
  ),
  "GET /api/albums/:id": jsonOperation(
    "Albums",
    "Get an album",
    ref("AlbumSummaryResponse"),
  ),
  "GET /api/artists": jsonOperation(
    "Artists",
    "List artists",
    ref("ArtistListResponse"),
    { query: cardListQuery },
  ),
  "GET /api/artists/:id": jsonOperation(
    "Artists",
    "Get an artist",
    ref("ArtistSummaryResponse"),
  ),
  "GET /api/audiobooks": jsonOperation(
    "Audiobooks",
    "List audiobooks",
    ref("AudiobookListResponse"),
    { query: cardListQuery },
  ),
  "GET /api/audiobooks/:id": jsonOperation(
    "Audiobooks",
    "Get an audiobook",
    ref("AudiobookSummaryResponse"),
  ),
  "GET /api/audiobooks/:id/chapters": jsonOperation(
    "Audiobooks",
    "List audiobook chapters",
    ref("TrackListResponse"),
    { query: trackCollectionQuery },
  ),
  "GET /api/podcasts": jsonOperation(
    "Podcasts",
    "List podcasts",
    ref("PodcastListResponse"),
    { query: cardListQuery },
  ),
  "GET /api/podcasts/:id": jsonOperation(
    "Podcasts",
    "Get a podcast",
    ref("PodcastSummaryResponse"),
  ),
  "GET /api/podcasts/:id/episodes": jsonOperation(
    "Podcasts",
    "List podcast episodes",
    ref("TrackListResponse"),
    { query: trackCollectionQuery },
  ),
  "POST /api/library/scans": jsonOperation(
    "Library",
    "Queue a library scan",
    ref("TaskResponse"),
    { status: 202 },
  ),
  "POST /api/tracks/:id/playback-token": jsonOperation(
    "Playback",
    "Create a track playback token",
    ref("PlaybackTokenResponse"),
  ),
  "GET /api/artists/:id/image": operationWithResponses(
    "Artists",
    "Get an artist portrait",
    {
      200: response(
        { type: "string", format: "binary" },
        "WebP artist portrait",
      ),
    },
    {
      produces: ["image/webp"],
      security: artistImageTokenSecurity,
    },
  ),
  "HEAD /api/artists/:id/image": operationWithResponses(
    "Artists",
    "Get artist portrait metadata",
    {
      200: response(
        { type: "string", format: "binary" },
        "WebP artist portrait headers",
      ),
    },
    {
      produces: ["image/webp"],
      security: artistImageTokenSecurity,
    },
  ),
  "GET /api/covers/:id": operationWithResponses(
    "Artwork",
    "Get track cover artwork",
    {
      200: response({ type: "string", format: "binary" }, "WebP cover"),
    },
    { produces: ["image/webp"], security: coverTokenSecurity },
  ),
  "HEAD /api/covers/:id": operationWithResponses(
    "Artwork",
    "Get track cover metadata",
    {
      200: response({ type: "string", format: "binary" }, "WebP cover headers"),
    },
    { produces: ["image/webp"], security: coverTokenSecurity },
  ),
  "GET /api/tracks/:id/audio": operationWithResponses(
    "Playback",
    "Stream original track audio",
    {
      200: response(
        { type: "string", format: "binary" },
        "Original audio stream",
      ),
      206: response(
        { type: "string", format: "binary" },
        "Requested audio byte range",
      ),
      416: ref("ApiErrorResponse"),
    },
    { produces: audioMimeTypes, security: playbackTokenSecurity },
  ),
  "HEAD /api/tracks/:id/audio": operationWithResponses(
    "Playback",
    "Get track audio metadata",
    {
      200: response(
        { type: "string", format: "binary" },
        "Original audio stream headers",
      ),
      206: response(
        { type: "string", format: "binary" },
        "Requested audio byte range headers",
      ),
      416: ref("ApiErrorResponse"),
    },
    { produces: audioMimeTypes, security: playbackTokenSecurity },
  ),
  "GET /api/likes": jsonOperation(
    "Likes",
    "List the signed-in user's likes",
    ref("LikeListResponse"),
  ),
  "POST /api/likes": jsonOperation(
    "Likes",
    "Like a library item",
    ref("LikeResponse"),
    { body: ref("LikeTarget") },
  ),
  "DELETE /api/likes": jsonOperation(
    "Likes",
    "Remove a library item like",
    null,
    { status: 204, body: ref("LikeTarget") },
  ),
  "GET /api/tracks/:id/metadata/candidates": jsonOperation(
    "Metadata",
    "Find metadata matches for a track",
    ref("MetadataCandidateListResponse"),
    {
      query: objectSchema({ query: stringSchema }, []),
    },
  ),
  "PUT /api/tracks/:id/metadata": jsonOperation(
    "Metadata",
    "Apply track metadata",
    null,
    { status: 204, body: ref("ApplyTrackMetadataRequest") },
  ),
  "DELETE /api/tracks/:id/metadata": jsonOperation(
    "Metadata",
    "Restore original track metadata",
    null,
    { status: 204 },
  ),
  "GET /api/artists/:id/metadata/candidates": jsonOperation(
    "Metadata",
    "Find metadata matches for an artist",
    ref("ArtistMetadataCandidateListResponse"),
    {
      query: objectSchema({ query: stringSchema }, []),
    },
  ),
  "PUT /api/artists/:id/metadata": jsonOperation(
    "Metadata",
    "Apply artist metadata",
    null,
    { status: 204, body: ref("ApplyArtistMetadataRequest") },
  ),
  "DELETE /api/artists/:id/metadata": jsonOperation(
    "Metadata",
    "Restore original artist metadata",
    null,
    { status: 204 },
  ),
  "GET /api/playlists": jsonOperation(
    "Playlists",
    "List playlists",
    ref("PlaylistListResponse"),
    {
      query: objectSchema(
        {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          offset: { type: "integer", minimum: 0 },
          trackId: stringSchema,
          query: stringSchema,
        },
        [],
      ),
    },
  ),
  "POST /api/playlists": jsonOperation(
    "Playlists",
    "Create a playlist",
    ref("PlaylistDetailResponse"),
    { status: 201, body: ref("CreatePlaylistRequest") },
  ),
  "GET /api/playlists/:id": jsonOperation(
    "Playlists",
    "Get a playlist",
    ref("PlaylistDetailResponse"),
  ),
  "PATCH /api/playlists/:id": jsonOperation(
    "Playlists",
    "Rename a playlist",
    ref("PlaylistDetailResponse"),
    { body: ref("UpdatePlaylistRequest") },
  ),
  "DELETE /api/playlists/:id": jsonOperation(
    "Playlists",
    "Delete a playlist",
    null,
    { status: 204 },
  ),
  "POST /api/playlists/:id/items": operationWithResponses(
    "Playlists",
    "Add an item to a playlist",
    {
      200: response(ref("AddPlaylistItemResponse"), "Item already present"),
      201: response(ref("AddPlaylistItemResponse"), "Playlist item added"),
    },
    { body: ref("AddPlaylistItemRequest") },
  ),
  "DELETE /api/playlists/:id/items/:itemId": jsonOperation(
    "Playlists",
    "Remove a playlist item",
    null,
    { status: 204 },
  ),
  "PUT /api/playlists/:id/items/order": jsonOperation(
    "Playlists",
    "Reorder playlist items",
    ref("PlaylistDetailResponse"),
    { body: ref("ReorderPlaylistItemsRequest") },
  ),
  "GET /api/queue": jsonOperation(
    "Queue",
    "Get the current playback queue",
    ref("QueueResponse"),
  ),
  "PUT /api/queue": jsonOperation(
    "Queue",
    "Replace the current playback queue",
    ref("QueueResponse"),
    { body: ref("ReplaceQueueRequest") },
  ),
  "POST /api/tracks/:id/plays": jsonOperation(
    "Quick picks",
    "Record a playback start",
    ref("RecordTrackPlayResponse"),
  ),
  "GET /api/quick-picks": jsonOperation(
    "Quick picks",
    "Get ranked quick picks",
    ref("QuickPickListResponse"),
  ),
  "GET /api/tasks": jsonOperation(
    "Tasks",
    "List background tasks",
    ref("TaskListResponse"),
    {
      query: objectSchema(
        {
          status: enumeration("all", "active", "terminal"),
          limit: { type: "integer", minimum: 1, maximum: 500 },
          offset: { type: "integer", minimum: 0 },
        },
        [],
      ),
    },
  ),
  "GET /api/tasks/:id": jsonOperation(
    "Tasks",
    "Get a background task",
    ref("TaskResponse"),
  ),
  "POST /api/realtime/ticket": jsonOperation(
    "Realtime",
    "Create a realtime WebSocket ticket",
    ref("RealtimeTicketResponse"),
  ),
  "GET /api/realtime": operationWithResponses(
    "Realtime",
    "Open the realtime WebSocket",
    {
      101: {
        description:
          "Switching protocols. Send a subscribe message after the hello event.",
      },
    },
    {
      query: objectSchema(
        {
          ticket: stringSchema,
        },
        ["ticket"],
      ),
      security: realtimeTicketSecurity,
    },
  ),
  "GET /api/admin/server": jsonOperation(
    "Server administration",
    "Get server settings",
    ref("ServerSettingsResponse"),
  ),
  "PUT /api/admin/server": jsonOperation(
    "Server administration",
    "Update server settings",
    ref("ServerSettingsResponse"),
    { body: ref("UpdateServerSettingsRequest") },
  ),
  "POST /api/admin/server/restart": jsonOperation(
    "Server administration",
    "Restart the server",
    ref("RestartServerResponse"),
    { status: 202 },
  ),
  "GET /api/admin/updates": jsonOperation(
    "Server administration",
    "Get update status",
    ref("UpdateStatusResponse"),
  ),
  "POST /api/admin/updates/check": jsonOperation(
    "Server administration",
    "Check for updates",
    ref("UpdateStatusResponse"),
  ),
  "GET /api/admin/logs": jsonOperation(
    "Logs",
    "List server log entries",
    ref("LogListResponse"),
    {
      query: objectSchema(
        {
          after: { type: "integer", minimum: 0 },
        },
        [],
      ),
    },
  ),
  "GET /api/admin/sources": jsonOperation(
    "Sources",
    "List library sources",
    ref("SourceListResponse"),
  ),
  "POST /api/admin/sources": jsonOperation(
    "Sources",
    "Create a library source",
    ref("CreateSourceResponse"),
    { status: 201, body: ref("CreateSourceRequest") },
  ),
  "PUT /api/admin/sources/order": jsonOperation(
    "Sources",
    "Reorder library sources",
    ref("SourceListResponse"),
    { body: ref("ReorderSourcesRequest") },
  ),
  "DELETE /api/admin/sources/:id": jsonOperation(
    "Sources",
    "Remove a library source while retaining its catalog as unavailable",
    ref("SourceRemovalResponse"),
  ),
  "POST /api/admin/sources/:id/scans": jsonOperation(
    "Sources",
    "Queue a source scan",
    ref("TaskResponse"),
    { status: 202 },
  ),
  "POST /api/admin/tasks/:id/cancel": jsonOperation(
    "Tasks",
    "Cancel a queued task or stop a running task",
    ref("TaskResponse"),
  ),
  "POST /api/admin/source-integrations/:kind/discover": jsonOperation(
    "Sources",
    "Discover source choices from a built-in integration",
    ref("SourceIntegrationOptionListResponse"),
    { body: ref("DiscoverSourceIntegrationRequest") },
  ),
  "GET /api/admin/metadata-providers/definitions": jsonOperation(
    "Metadata providers",
    "List metadata provider definitions",
    ref("MetadataProviderDefinitionListResponse"),
  ),
  "GET /api/admin/metadata-providers": jsonOperation(
    "Metadata providers",
    "List configured metadata providers",
    ref("MetadataProviderListResponse"),
  ),
  "POST /api/admin/metadata-providers": jsonOperation(
    "Metadata providers",
    "Create a metadata provider",
    ref("MetadataProviderResponse"),
    { status: 201, body: ref("CreateMetadataProviderRequest") },
  ),
  "PUT /api/admin/metadata-providers/order": jsonOperation(
    "Metadata providers",
    "Reorder metadata providers",
    ref("MetadataProviderListResponse"),
    { body: ref("ReorderMetadataProvidersRequest") },
  ),
  "PUT /api/admin/metadata-providers/:id": jsonOperation(
    "Metadata providers",
    "Update a metadata provider",
    ref("MetadataProviderResponse"),
    { body: ref("UpdateMetadataProviderRequest") },
  ),
  "POST /api/admin/metadata/reset": jsonOperation(
    "Metadata providers",
    "Reset all metadata matches",
    ref("ResetMetadataResponse"),
  ),
  "POST /api/admin/metadata/refresh": jsonOperation(
    "Metadata providers",
    "Queue metadata matching",
    ref("TaskResponse"),
    { status: 202 },
  ),
  "GET /api/admin/users": jsonOperation(
    "User management",
    "List users",
    ref("UserListResponse"),
  ),
  "POST /api/admin/users": jsonOperation(
    "User management",
    "Create a user",
    ref("UserResponse"),
    { status: 201, body: ref("CreateUserRequest") },
  ),
  "PUT /api/admin/users/:id": jsonOperation(
    "User management",
    "Update a user",
    ref("UserResponse"),
    { body: ref("UpdateUserRequest") },
  ),
  "DELETE /api/admin/users/:id": jsonOperation(
    "User management",
    "Delete a user",
    null,
    { status: 204 },
  ),
  "GET /api/admin/filesystem/tree": jsonOperation(
    "Filesystem",
    "List a directory",
    ref("DirectoryListResponse"),
    { query: objectSchema({ path: stringSchema }, []) },
  ),
  "GET /api/admin/filesystem/search": jsonOperation(
    "Filesystem",
    "Search local directories",
    ref("DirectorySearchResponse"),
    {
      query: objectSchema(
        {
          query: stringSchema,
          path: stringSchema,
        },
        ["query"],
      ),
    },
  ),
};

export const openApiRouteKeys = Object.freeze(Object.keys(routes).sort());

const tags = [
  {
    name: "System",
    description: "Health and local server discovery.",
  },
  {
    name: "Authentication",
    description: "Account setup, sign-in, recovery, and session lifecycle.",
  },
  {
    name: "Users",
    description: "Signed-in user profile operations.",
  },
  {
    name: "User management",
    description: "Administrator account management.",
  },
  {
    name: "Catalog",
    description: "Tracks, search, and catalog resolution.",
  },
  {
    name: "Albums",
    description: "Music album browsing.",
  },
  {
    name: "Artists",
    description: "Artist browsing and portraits.",
  },
  {
    name: "Audiobooks",
    description: "Audiobook collections and chapters.",
  },
  {
    name: "Podcasts",
    description: "Podcast shows and episodes.",
  },
  {
    name: "Artwork",
    description: "Cached and signed artwork resources.",
  },
  {
    name: "Library",
    description: "Library scans.",
  },
  {
    name: "Playback",
    description: "Playback tokens and original audio streaming.",
  },
  {
    name: "Metadata",
    description: "Track and artist metadata matching.",
  },
  {
    name: "Playlists",
    description: "Private playlist operations.",
  },
  {
    name: "Likes",
    description: "Private likes across catalog item types.",
  },
  {
    name: "Queue",
    description: "Durable per-user playback queue.",
  },
  {
    name: "Quick picks",
    description: "Playback-derived ranked suggestions.",
  },
  {
    name: "Tasks",
    description: "Background work and cancellation.",
  },
  {
    name: "Realtime",
    description: "Authenticated realtime WebSocket subscription.",
  },
  {
    name: "Sources",
    description: "Administrator library source management.",
  },
  {
    name: "Metadata providers",
    description: "Administrator metadata provider management.",
  },
  {
    name: "Filesystem",
    description: "Bounded local directory browsing for source configuration.",
  },
  {
    name: "Logs",
    description: "Administrator server log access.",
  },
  {
    name: "Server administration",
    description: "Server settings, restart, and update status.",
  },
];

function lookupOperation(
  method: string,
  path: string,
): OpenApiOperation | null {
  const normalizedPath = path.replace(/\{([^}]+)\}/gu, ":$1");
  return routes[`${method.toUpperCase()} ${normalizedPath}`] ?? null;
}

function operationId(method: string, path: string): string {
  const pathParts = path
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const parameter = /^\{(.+)\}$/u.exec(part);
      if (parameter) return `by-${parameter[1]}`;
      return part
        .replace(/[^A-Za-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
        .toLowerCase();
    });
  return [method.toLowerCase(), ...pathParts].join("-");
}

function fallbackTag(method: string, path: string): string {
  if (path.startsWith("/api/admin/users")) return "User management";
  if (path.startsWith("/api/admin/sources")) return "Sources";
  if (path.startsWith("/api/admin/source-integrations")) return "Sources";
  if (path.startsWith("/api/admin/metadata")) return "Metadata providers";
  if (path.startsWith("/api/admin/filesystem")) return "Filesystem";
  if (path.startsWith("/api/admin/logs")) return "Logs";
  if (path.startsWith("/api/admin")) return "Server administration";
  if (path.startsWith("/api/auth")) return "Authentication";
  if (path.startsWith("/api/users")) return "Users";
  if (path.startsWith("/api/tracks")) return "Catalog";
  if (path.startsWith("/api/albums")) return "Albums";
  if (path.startsWith("/api/artists")) return "Artists";
  if (path.startsWith("/api/audiobooks")) return "Audiobooks";
  if (path.startsWith("/api/podcasts")) return "Podcasts";
  if (path.startsWith("/api/playlists")) return "Playlists";
  if (path.startsWith("/api/likes")) return "Likes";
  if (path.startsWith("/api/queue")) return "Queue";
  if (path.startsWith("/api/quick-picks")) return "Quick picks";
  if (path.startsWith("/api/tasks")) return "Tasks";
  if (path.startsWith("/api/realtime")) return "Realtime";
  if (path.startsWith("/api/covers")) return "Artwork";
  if (path.startsWith("/api/library")) return "Library";
  if (path.startsWith("/api/discovery")) return "System";
  return "System";
}

function fallbackSummary(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function swaggerSchema(method: string, path: string): FastifySchema {
  if (path.startsWith("/api/docs") || path.startsWith("/api/openapi.")) {
    return { hide: true };
  }

  const documented = lookupOperation(method, path);
  const pathParameters = routeParameters(path);
  const queryParameters = documented?.query
    ? routeParametersFromQuery(documented.query)
    : [];
  const isAdmin = path.startsWith("/api/admin/");
  const responseSchema = documented?.responses ?? {
    200: response({ type: "object", additionalProperties: true }),
  };
  const securedResponses = {
    ...(documented?.security === publicSecurity
      ? responseSchema
      : {
          ...responseSchema,
          401: ref("ApiErrorResponse"),
          ...(isAdmin ? { 403: ref("ApiErrorResponse") } : {}),
        }),
  };

  return {
    tags: [documented?.tag ?? fallbackTag(method, path)],
    summary: documented?.summary ?? fallbackSummary(method, path),
    operationId: operationId(method, path),
    ...(documented?.description ? { description: documented.description } : {}),
    ...(documented?.body ? { body: documented.body } : {}),
    params:
      Object.keys((pathParameters.properties ?? {}) as Record<string, unknown>)
        .length > 0
        ? pathParameters
        : undefined,
    querystring:
      queryParameters.length > 0
        ? {
            type: "object",
            properties: Object.fromEntries(
              queryParameters.map((parameter) => [
                String(parameter.name),
                parameter.schema,
              ]),
            ),
            ...(documented?.query?.required
              ? { required: documented.query.required }
              : {}),
          }
        : undefined,
    response: securedResponses,
    ...(documented?.produces ? { produces: documented.produces } : {}),
    security: documented?.security ?? bearerSecurity,
    ...(documented
      ? {}
      : {
          "x-peridot-doc-fallback": true,
        }),
  } as FastifySchema;
}

function routeParametersFromQuery(schema: SchemaObject): SchemaObject[] {
  const properties = (schema.properties ?? {}) as Record<string, SchemaObject>;
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: propertySchema,
  }));
}

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Peridot API",
        version: PERIDOT_VERSION,
        description:
          "Self-hosted Peridot catalog, playback, library, and administration API.",
      },
      tags,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "Opaque user session token.",
          },
          playbackToken: {
            type: "apiKey",
            in: "query",
            name: "playbackToken",
            description: "Short-lived audio playback token.",
          },
          coverToken: {
            type: "apiKey",
            in: "query",
            name: "coverToken",
            description: "Short-lived artwork token.",
          },
          artistImageToken: {
            type: "apiKey",
            in: "query",
            name: "artistImageToken",
            description: "Short-lived artist portrait token.",
          },
          realtimeTicket: {
            type: "apiKey",
            in: "query",
            name: "ticket",
            description: "Single-use realtime WebSocket ticket.",
          },
        },
        schemas,
      },
    },
    exposeHeadRoutes: false,
    transform: ({ schema, url, route }) => {
      const routeMethod = Array.isArray(route.method)
        ? route.method[0]
        : route.method;
      return {
        schema: {
          ...schema,
          ...swaggerSchema(routeMethod ?? "GET", url),
        },
        url,
      };
    },
    transformObject: (documentObject) => {
      if (!("openapiObject" in documentObject)) {
        return documentObject.swaggerObject;
      }
      const { openapiObject } = documentObject;
      const document = openapiObject as {
        paths?: Record<string, Record<string, unknown>>;
      };
      document.paths ??= {};
      document.paths["/api/realtime"] ??= {
        get: {
          tags: ["Realtime"],
          summary: "Open the realtime WebSocket",
          operationId: "get-api-realtime",
          description:
            "Connect with a single-use ticket and a permitted browser origin. Send a subscribe message after the hello event.",
          security: [{ realtimeTicket: [] }],
          parameters: [
            {
              name: "ticket",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            101: {
              description: "Switching protocols to a realtime WebSocket.",
            },
            401: {
              description: "The realtime ticket is invalid or expired.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
          },
        },
      };
      document.paths["/api/artists/{id}/image"] = {
        ...document.paths["/api/artists/{id}/image"],
        head: {
          tags: ["Artists"],
          summary: "Get artist portrait metadata",
          operationId: "head-api-artists-by-id-image",
          security: artistImageTokenSecurity,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "WebP artist portrait headers.",
            },
            401: {
              description: "A valid artwork token is required.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
            404: {
              description: "The artist portrait is unavailable.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
          },
        },
      };
      document.paths["/api/covers/{id}"] = {
        ...document.paths["/api/covers/{id}"],
        head: {
          tags: ["Artwork"],
          summary: "Get track cover metadata",
          operationId: "head-api-covers-by-id",
          security: coverTokenSecurity,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "WebP cover headers.",
            },
            401: {
              description: "A valid cover token is required.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
            404: {
              description: "The cover is unavailable.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
          },
        },
      };
      document.paths["/api/tracks/{id}/audio"] = {
        ...document.paths["/api/tracks/{id}/audio"],
        head: {
          tags: ["Playback"],
          summary: "Get track audio metadata",
          operationId: "head-api-tracks-by-id-audio",
          security: playbackTokenSecurity,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Original audio stream headers.",
            },
            206: {
              description: "Requested audio byte range headers.",
            },
            401: {
              description: "A valid playback token is required.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
            416: {
              description: "The requested byte range is not satisfiable.",
              content: {
                "application/json": {
                  schema: ref("ApiErrorResponse"),
                },
              },
            },
          },
        },
      };
      return document as typeof openapiObject;
    },
  });
}

export async function registerOpenApiRoutes(app: FastifyInstance) {
  app.get(
    "/api/openapi.json",
    { schema: { hide: true } },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-cache");
      return app.swagger();
    },
  );
  app.get(
    "/api/openapi.yaml",
    { schema: { hide: true } },
    async (_request, reply) => {
      reply
        .header("Cache-Control", "no-cache")
        .type("application/yaml; charset=utf-8");
      return app.swagger({ yaml: true });
    },
  );
  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: {
      url: "/api/openapi.json",
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      operationsSorter: "alpha",
      persistAuthorization: true,
      tagsSorter: "alpha",
    },
    staticCSP: true,
  });
}
