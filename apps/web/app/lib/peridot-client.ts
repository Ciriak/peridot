import type {
  DownloadClientInput,
  DownloadClientResponse,
  DownloadClientOptions,
  DownloadLinkInput,
} from "@peridot/contracts";
import type {
  AddPlaylistItemRequest,
  AddPlaylistItemResponse,
  AdminMediaCopyField,
  AdminMediaField,
  AdminMediaListQuery,
  AdminMediaListResponse,
  AdminMediaResponse,
  ApiErrorResponse,
  ApplyArtistMetadataRequest,
  ApplyMediaMetadataRequest,
  AlbumListResponse,
  ArtistListResponse,
  AudiobookListResponse,
  AudiobookSummaryResponse,
  ArtistMetadataCandidateListResponse,
  AuthSessionResponse,
  AuthStatusResponse,
  CompletePasswordResetRequest,
  CreateMetadataProviderRequest,
  CreateAdminMediaCopyRequest,
  CreateAdminMediaRequest,
  CreatePlaylistRequest,
  CreateLibrarySourceRequest,
  CreateLibrarySourceResponse,
  CreateUserRequest,
  DirectoryListResponse,
  DirectorySearchResponse,
  DiscoverLibrarySourceRequest,
  DiscoverConnectorInstancesResponse,
  LikeListResponse,
  LikeResponse,
  LikeTarget,
  LogListResponse,
  MessageDescriptor,
  MetadataCandidateListResponse,
  MetadataProviderDefinitionListResponse,
  MetadataProviderListResponse,
  MetadataProviderResponse,
  OverviewResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PlaylistDetailResponse,
  PlaylistListResponse,
  LibrarySourceConnectorOptionListResponse,
  LibrarySourceRemovalResponse,
  PodcastListResponse,
  PodcastSummaryResponse,
  QuickPickListResponse,
  RealtimeTicketResponse,
  ReorderPlaylistItemsRequest,
  ResolveMediaResponse,
  PlaybackTokenResponse,
  RecordMediaPlayResponse,
  ResetMetadataResponse,
  RestartServerResponse,
  ServerSettingsResponse,
  LibrarySourceListResponse,
  TaskListResponse,
  TaskResponse,
  MediaListResponse,
  UpdateUserPreferencesRequest,
  UpdatePlaylistRequest,
  UpdateUserProfileRequest,
  UpdateMetadataProviderRequest,
  UpdateAdminMediaCopyRequest,
  UpdateAdminMediaRequest,
  UpdateServerSettingsRequest,
  UpdateStatusResponse,
  UpdateUserRequest,
  UserListResponse,
  UserPreferencesResponse,
  UserResponse,
  ConnectorListResponse,
  ReleaseIndexerInput,
  ReleaseIndexerListResponse,
  ReleaseIndexerResponse,
} from "@peridot/contracts";
import { localizedError, message } from "./messages.ts";
import { reportServerReachability } from "./server-connectivity.ts";

export interface AdministratorCredentials {
  email: string;
  displayName: string;
  password: string;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface DiscoveredServer {
  address: string;
  host: string;
}

export interface DiscoveryResponse {
  items: DiscoveredServer[];
  scannedSubnets: string[];
}

export type AuthenticationRedirectReason = "login" | "setup";

export class AuthenticationRedirectError extends Error {
  readonly reason: AuthenticationRedirectReason;
  readonly messageDescriptor: MessageDescriptor;

  constructor(
    fallbackMessage: string,
    reason: AuthenticationRedirectReason,
    messageDescriptor: MessageDescriptor,
  ) {
    super(fallbackMessage);
    this.name = "AuthenticationRedirectError";
    this.reason = reason;
    this.messageDescriptor = messageDescriptor;
  }
}

export class PeridotApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly messageDescriptor: MessageDescriptor | null;

  constructor(
    fallbackMessage: string,
    statusCode: number,
    code: string,
    messageDescriptor: MessageDescriptor | null,
  ) {
    super(fallbackMessage);
    this.name = "PeridotApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.messageDescriptor = messageDescriptor;
  }
}

export class PeridotNetworkError extends Error {
  readonly messageDescriptor: MessageDescriptor;

  constructor(fallbackMessage = "Could not reach this server.") {
    super(fallbackMessage);
    this.name = "PeridotNetworkError";
    this.messageDescriptor = message("error.apiUnavailable");
  }
}

export function isPeridotNetworkError(reason: unknown): boolean {
  return reason instanceof PeridotNetworkError;
}

let authenticationRedirectHandler:
  ((reason: AuthenticationRedirectReason) => void) | null = null;

export function setAuthenticationRedirectHandler(
  handler: ((reason: AuthenticationRedirectReason) => void) | null,
) {
  authenticationRedirectHandler = handler;
}

export function reportAuthenticationRedirect(
  reason: AuthenticationRedirectReason,
) {
  authenticationRedirectHandler?.(reason);
}

export function isAuthenticationRedirectError(reason: unknown): boolean {
  return reason instanceof AuthenticationRedirectError;
}

async function requestJson<T>(
  serverAddress: string,
  path: string,
  init?: RequestInit,
  options: { reportAuthenticationRedirect?: boolean } = {},
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (init?.body != null) {
      headers.set("Content-Type", "application/json");
    }
    response = await fetch(`${serverAddress}${path}`, {
      ...init,
      headers,
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw reason;
    }
    reportServerReachability(false);
    throw new PeridotNetworkError();
  }
  reportServerReachability(true);
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    const redirectReason =
      options.reportAuthenticationRedirect &&
      (response.status === 401 ||
        (response.status === 428 && body?.error.code === "setup_required"))
        ? response.status === 428
          ? "setup"
          : "login"
        : null;
    if (redirectReason) {
      reportAuthenticationRedirect(redirectReason);
      throw new AuthenticationRedirectError(
        "Authentication is required.",
        redirectReason,
        body?.error.messageDescriptor ??
          message("error.authenticationRequired"),
      );
    }
    throw new PeridotApiError(
      "The server rejected the request.",
      response.status,
      body?.error.code ?? "request_failed",
      body?.error.messageDescriptor ?? null,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function authenticatedRequestJson<T>(
  serverAddress: string,
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(
    serverAddress,
    path,
    {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    },
    {
      reportAuthenticationRedirect: true,
    },
  );
}

export function fetchAuthStatus(serverAddress: string) {
  return requestJson<AuthStatusResponse>(serverAddress, "/api/auth/status");
}

export async function discoverLocalServers(): Promise<DiscoveryResponse> {
  try {
    const response = await fetch("/api/discovery/servers", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error();
    return (await response.json()) as DiscoveryResponse;
  } catch {
    throw localizedError(
      "error.discoveryUnavailable",
      "Local server discovery is unavailable.",
    );
  }
}

export function createAdministrator(
  serverAddress: string,
  credentials: AdministratorCredentials,
) {
  return requestJson<AuthSessionResponse>(
    serverAddress,
    "/api/auth/bootstrap",
    {
      method: "POST",
      body: JSON.stringify(credentials),
    },
  );
}

export function createUserSession(
  serverAddress: string,
  credentials: SignInCredentials,
) {
  return requestJson<AuthSessionResponse>(serverAddress, "/api/auth/sessions", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function requestPasswordReset(
  serverAddress: string,
  request: PasswordResetRequest,
) {
  return requestJson<PasswordResetRequestResponse>(
    serverAddress,
    "/api/auth/password-resets",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function completePasswordReset(
  serverAddress: string,
  reset: CompletePasswordResetRequest,
) {
  return requestJson<void>(
    serverAddress,
    "/api/auth/password-resets/complete",
    {
      method: "POST",
      body: JSON.stringify(reset),
    },
  );
}

export function updateUserProfile(
  serverAddress: string,
  token: string,
  profile: UpdateUserProfileRequest,
) {
  return authenticatedRequestJson<UserResponse>(
    serverAddress,
    "/api/users/me",
    token,
    { method: "PUT", body: JSON.stringify(profile) },
  );
}

export function fetchUserPreferences(serverAddress: string, token: string) {
  return authenticatedRequestJson<UserPreferencesResponse>(
    serverAddress,
    "/api/users/me/preferences",
    token,
  );
}

export function initializeUserPreferences(
  serverAddress: string,
  token: string,
  preferences: UpdateUserPreferencesRequest,
) {
  return authenticatedRequestJson<UserPreferencesResponse>(
    serverAddress,
    "/api/users/me/preferences/initialize",
    token,
    { method: "POST", body: JSON.stringify(preferences) },
  );
}

export function updateUserPreferences(
  serverAddress: string,
  token: string,
  preferences: UpdateUserPreferencesRequest,
) {
  return authenticatedRequestJson<UserPreferencesResponse>(
    serverAddress,
    "/api/users/me/preferences",
    token,
    { method: "PUT", body: JSON.stringify(preferences) },
  );
}

export function listUsers(serverAddress: string, token: string) {
  return authenticatedRequestJson<UserListResponse>(
    serverAddress,
    "/api/admin/users",
    token,
  );
}

export function createManagedUser(
  serverAddress: string,
  token: string,
  user: CreateUserRequest,
) {
  return authenticatedRequestJson<UserResponse>(
    serverAddress,
    "/api/admin/users",
    token,
    { method: "POST", body: JSON.stringify(user) },
  );
}

export function updateManagedUser(
  serverAddress: string,
  token: string,
  userId: string,
  update: UpdateUserRequest,
) {
  return authenticatedRequestJson<UserResponse>(
    serverAddress,
    `/api/admin/users/${encodeURIComponent(userId)}`,
    token,
    { method: "PUT", body: JSON.stringify(update) },
  );
}

export function deleteManagedUser(
  serverAddress: string,
  token: string,
  userId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/admin/users/${encodeURIComponent(userId)}`,
    token,
    { method: "DELETE" },
  );
}

export function revokeSession(serverAddress: string, token: string) {
  return authenticatedRequestJson<void>(
    serverAddress,
    "/api/auth/session",
    token,
    { method: "DELETE" },
  );
}

export function createRealtimeTicket(serverAddress: string, token: string) {
  return authenticatedRequestJson<RealtimeTicketResponse>(
    serverAddress,
    "/api/realtime/ticket",
    token,
    { method: "POST" },
  );
}

export function fetchServerSettings(serverAddress: string, token: string) {
  return authenticatedRequestJson<ServerSettingsResponse>(
    serverAddress,
    "/api/admin/server",
    token,
  );
}

export function requestServerRestart(serverAddress: string, token: string) {
  return authenticatedRequestJson<RestartServerResponse>(
    serverAddress,
    "/api/admin/server/restart",
    token,
    { method: "POST" },
  );
}

export function fetchUpdateStatus(serverAddress: string, token: string) {
  return authenticatedRequestJson<UpdateStatusResponse>(
    serverAddress,
    "/api/admin/updates",
    token,
  );
}

export function checkForUpdates(serverAddress: string, token: string) {
  return authenticatedRequestJson<UpdateStatusResponse>(
    serverAddress,
    "/api/admin/updates/check",
    token,
    { method: "POST" },
  );
}

export function updateServerSettings(
  serverAddress: string,
  token: string,
  settings: UpdateServerSettingsRequest,
) {
  return authenticatedRequestJson<ServerSettingsResponse>(
    serverAddress,
    "/api/admin/server",
    token,
    { method: "PUT", body: JSON.stringify(settings) },
  );
}

export function listAdminMedias(
  serverAddress: string,
  token: string,
  options: AdminMediaListQuery = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<AdminMediaListResponse>(
    serverAddress,
    `/api/admin/medias${suffix}`,
    token,
  );
}

export function createAdminMedia(
  serverAddress: string,
  token: string,
  input: CreateAdminMediaRequest,
) {
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    "/api/admin/medias",
    token,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateAdminMediaField(
  serverAddress: string,
  token: string,
  mediaId: string,
  field: AdminMediaField,
  value: UpdateAdminMediaRequest["value"],
  expectedUpdatedAt: string,
) {
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ field, value, expectedUpdatedAt }),
    },
  );
}

export function resetAdminMediaField(
  serverAddress: string,
  token: string,
  mediaId: string,
  field: AdminMediaField,
  expectedUpdatedAt: string,
) {
  const params = new URLSearchParams({ expectedUpdatedAt });
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}/overrides/${encodeURIComponent(field)}?${params.toString()}`,
    token,
    { method: "DELETE" },
  );
}

export function deleteAdminMedia(
  serverAddress: string,
  token: string,
  mediaId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}`,
    token,
    { method: "DELETE" },
  );
}

export function createAdminMediaCopy(
  serverAddress: string,
  token: string,
  mediaId: string,
  input: CreateAdminMediaCopyRequest,
) {
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}/copies`,
    token,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateAdminMediaCopyField(
  serverAddress: string,
  token: string,
  mediaId: string,
  copyId: string,
  field: AdminMediaCopyField,
  value: UpdateAdminMediaCopyRequest["value"],
  expectedUpdatedAt: string,
) {
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}/copies/${encodeURIComponent(copyId)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ field, value, expectedUpdatedAt }),
    },
  );
}

export function resetAdminMediaCopyField(
  serverAddress: string,
  token: string,
  mediaId: string,
  copyId: string,
  field: AdminMediaCopyField,
  expectedUpdatedAt: string,
) {
  const params = new URLSearchParams({ expectedUpdatedAt });
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}/copies/${encodeURIComponent(copyId)}/overrides/${encodeURIComponent(field)}?${params.toString()}`,
    token,
    { method: "DELETE" },
  );
}

export function deleteAdminMediaCopy(
  serverAddress: string,
  token: string,
  mediaId: string,
  copyId: string,
) {
  return authenticatedRequestJson<AdminMediaResponse>(
    serverAddress,
    `/api/admin/medias/${encodeURIComponent(mediaId)}/copies/${encodeURIComponent(copyId)}`,
    token,
    { method: "DELETE" },
  );
}

export function listMetadataProviders(serverAddress: string, token: string) {
  return authenticatedRequestJson<MetadataProviderListResponse>(
    serverAddress,
    "/api/admin/metadata-providers",
    token,
  );
}

export function listMetadataProviderDefinitions(
  serverAddress: string,
  token: string,
) {
  return authenticatedRequestJson<MetadataProviderDefinitionListResponse>(
    serverAddress,
    "/api/admin/metadata-providers/definitions",
    token,
  );
}

export function createMetadataProvider(
  serverAddress: string,
  token: string,
  provider: CreateMetadataProviderRequest,
) {
  return authenticatedRequestJson<MetadataProviderResponse>(
    serverAddress,
    "/api/admin/metadata-providers",
    token,
    { method: "POST", body: JSON.stringify(provider) },
  );
}

export function updateMetadataProvider(
  serverAddress: string,
  token: string,
  providerId: string,
  update: UpdateMetadataProviderRequest,
) {
  return authenticatedRequestJson<MetadataProviderResponse>(
    serverAddress,
    `/api/admin/metadata-providers/${providerId}`,
    token,
    { method: "PUT", body: JSON.stringify(update) },
  );
}

export function reorderMetadataProviders(
  serverAddress: string,
  token: string,
  ids: string[],
) {
  return authenticatedRequestJson<MetadataProviderListResponse>(
    serverAddress,
    "/api/admin/metadata-providers/order",
    token,
    { method: "PUT", body: JSON.stringify({ ids }) },
  );
}

export function refreshMetadata(serverAddress: string, token: string) {
  return authenticatedRequestJson<TaskResponse>(
    serverAddress,
    "/api/admin/metadata/refresh",
    token,
    { method: "POST" },
  );
}

export function resetMetadata(serverAddress: string, token: string) {
  return authenticatedRequestJson<ResetMetadataResponse>(
    serverAddress,
    "/api/admin/metadata/reset",
    token,
    { method: "POST" },
  );
}

export function fetchLogs(serverAddress: string, token: string, after = 0) {
  return authenticatedRequestJson<LogListResponse>(
    serverAddress,
    `/api/admin/logs?after=${after}`,
    token,
  );
}

export function listSources(serverAddress: string, token: string) {
  return authenticatedRequestJson<LibrarySourceListResponse>(
    serverAddress,
    "/api/admin/library-sources",
    token,
  );
}

export function fetchOverview(serverAddress: string, token: string) {
  return authenticatedRequestJson<OverviewResponse>(
    serverAddress,
    "/api/overview",
    token,
  );
}

export function createSource(
  serverAddress: string,
  token: string,
  source: CreateLibrarySourceRequest,
) {
  return authenticatedRequestJson<CreateLibrarySourceResponse>(
    serverAddress,
    "/api/admin/library-sources",
    token,
    { method: "POST", body: JSON.stringify(source) },
  );
}

export function deleteSource(
  serverAddress: string,
  token: string,
  sourceId: string,
) {
  return authenticatedRequestJson<LibrarySourceRemovalResponse>(
    serverAddress,
    `/api/admin/library-sources/${sourceId}`,
    token,
    { method: "DELETE" },
  );
}

export function discoverIntegrationSources(
  serverAddress: string,
  token: string,
  kind: string,
  request: DiscoverLibrarySourceRequest,
) {
  return authenticatedRequestJson<LibrarySourceConnectorOptionListResponse>(
    serverAddress,
    `/api/admin/source-integrations/${encodeURIComponent(kind)}/discover`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function discoverConnectorInstances(
  serverAddress: string,
  token: string,
  kind: string,
  address?: string,
  signal?: AbortSignal,
) {
  const trimmedAddress = address?.trim();
  return authenticatedRequestJson<DiscoverConnectorInstancesResponse>(
    serverAddress,
    `/api/admin/connectors/${encodeURIComponent(kind)}/discover-instances`,
    token,
    {
      method: "POST",
      body: JSON.stringify(trimmedAddress ? { address: trimmedAddress } : {}),
      ...(signal ? { signal } : {}),
    },
  );
}

export function reorderSources(
  serverAddress: string,
  token: string,
  ids: string[],
) {
  return authenticatedRequestJson<LibrarySourceListResponse>(
    serverAddress,
    "/api/admin/library-sources/order",
    token,
    { method: "PUT", body: JSON.stringify({ ids }) },
  );
}

export function rescanSource(
  serverAddress: string,
  token: string,
  sourceId: string,
) {
  return authenticatedRequestJson<TaskResponse>(
    serverAddress,
    `/api/admin/library-sources/${sourceId}/scans`,
    token,
    { method: "POST" },
  );
}

export function connectorsApi(serverAddress: string, token: string) {
  return authenticatedRequestJson<ConnectorListResponse>(
    serverAddress,
    "/api/admin/connectors",
    token,
  );
}

export function releaseIndexersApi(serverAddress: string, token: string) {
  const base = "/api/admin/release-indexers";
  const request = <T>(path: string, method = "GET", body?: unknown) =>
    authenticatedRequestJson<T>(serverAddress, path, token, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return {
    list: () => request<ReleaseIndexerListResponse>(base),
    create: (input: ReleaseIndexerInput) =>
      request<ReleaseIndexerResponse>(base, "POST", input),
    remove: (id: string) => request<void>(base + "/" + id, "DELETE"),
    link: (id: string, input: DownloadLinkInput) =>
      request<void>(base + "/" + id + "/download-client", "PUT", input),
    reorder: (ids: string[]) =>
      request<ReleaseIndexerListResponse>(base + "/order", "PUT", { ids }),
  };
}

export function listDirectories(
  serverAddress: string,
  token: string,
  parent?: string,
) {
  return authenticatedRequestJson<DirectoryListResponse>(
    serverAddress,
    parent
      ? `/api/admin/filesystem/tree?path=${encodeURIComponent(parent)}`
      : "/api/admin/filesystem/tree",
    token,
  );
}

export function searchDirectories(
  serverAddress: string,
  token: string,
  query: string,
  parent?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ query });
  if (parent) params.set("path", parent);
  return authenticatedRequestJson<DirectorySearchResponse>(
    serverAddress,
    `/api/admin/filesystem/search?${params.toString()}`,
    token,
    { signal },
  );
}

export function startLibraryScan(serverAddress: string, token: string) {
  return authenticatedRequestJson<TaskResponse>(
    serverAddress,
    "/api/library/scans",
    token,
    { method: "POST" },
  );
}

export function listTasks(
  serverAddress: string,
  token: string,
  options: {
    status?: "all" | "active" | "terminal";
    limit?: number;
    offset?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<TaskListResponse>(
    serverAddress,
    `/api/tasks${suffix}`,
    token,
  );
}

export function getTask(serverAddress: string, token: string, taskId: string) {
  return authenticatedRequestJson<TaskResponse>(
    serverAddress,
    `/api/tasks/${encodeURIComponent(taskId)}`,
    token,
  );
}

export function cancelTask(
  serverAddress: string,
  token: string,
  taskId: string,
) {
  return authenticatedRequestJson<TaskResponse>(
    serverAddress,
    `/api/admin/tasks/${encodeURIComponent(taskId)}/cancel`,
    token,
    { method: "POST" },
  );
}

export interface TrackListOptions {
  cursor?: string | null;
  offset?: number;
  limit?: number;
  sort?: "title" | "artist" | "album" | "duration" | "track" | "published";
  direction?: "asc" | "desc";
  query?: string;
  availability?: "available" | "unavailable" | "all";
  albumId?: string;
  collectionId?: string;
  mediaType?: "music" | "audiobook" | "podcast" | "all";
  artistId?: string;
  liked?: boolean;
}

function trackListParams(options: TrackListOptions): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}

function cardListParams(options: CardListOptions): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}

export function listAudiobooks(
  serverAddress: string,
  token: string,
  options: CardListOptions = {},
) {
  const params = cardListParams(options);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<AudiobookListResponse>(
    serverAddress,
    `/api/audiobooks${suffix}`,
    token,
  );
}

export function fetchAudiobook(
  serverAddress: string,
  token: string,
  audiobookId: string,
) {
  return authenticatedRequestJson<AudiobookSummaryResponse>(
    serverAddress,
    `/api/audiobooks/${encodeURIComponent(audiobookId)}`,
    token,
  );
}

export function listAudiobookChapters(
  serverAddress: string,
  token: string,
  audiobookId: string,
  options: TrackListOptions = {},
) {
  const params = trackListParams(options);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<MediaListResponse>(
    serverAddress,
    `/api/audiobooks/${encodeURIComponent(audiobookId)}/chapters${suffix}`,
    token,
  );
}

export function listPodcasts(
  serverAddress: string,
  token: string,
  options: CardListOptions = {},
) {
  const params = cardListParams(options);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<PodcastListResponse>(
    serverAddress,
    `/api/podcasts${suffix}`,
    token,
  );
}

export function fetchPodcast(
  serverAddress: string,
  token: string,
  podcastId: string,
) {
  return authenticatedRequestJson<PodcastSummaryResponse>(
    serverAddress,
    `/api/podcasts/${encodeURIComponent(podcastId)}`,
    token,
  );
}

export function listPodcastEpisodes(
  serverAddress: string,
  token: string,
  podcastId: string,
  options: TrackListOptions = {},
) {
  const params = trackListParams(options);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<MediaListResponse>(
    serverAddress,
    `/api/podcasts/${encodeURIComponent(podcastId)}/episodes${suffix}`,
    token,
  );
}

export function listTracks(
  serverAddress: string,
  token: string,
  options: TrackListOptions = {},
) {
  const params = trackListParams(options);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<MediaListResponse>(
    serverAddress,
    `/api/media${suffix}`,
    token,
  );
}

export function resolveTracks(
  serverAddress: string,
  token: string,
  ids: string[],
) {
  return authenticatedRequestJson<ResolveMediaResponse>(
    serverAddress,
    "/api/media/resolve",
    token,
    { method: "POST", body: JSON.stringify({ ids }) },
  );
}

export interface CardListOptions {
  cursor?: string | null;
  offset?: number;
  limit?: number;
  sort?: string;
  direction?: "asc" | "desc";
  query?: string;
  liked?: boolean;
  artistId?: string;
}

export function listAlbums(
  serverAddress: string,
  token: string,
  options: CardListOptions = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<AlbumListResponse>(
    serverAddress,
    `/api/albums${suffix}`,
    token,
  );
}

export function fetchAlbum(
  serverAddress: string,
  token: string,
  albumId: string,
) {
  return authenticatedRequestJson<AlbumListResponse["items"][number]>(
    serverAddress,
    `/api/albums/${encodeURIComponent(albumId)}`,
    token,
  );
}

export function listArtists(
  serverAddress: string,
  token: string,
  options: CardListOptions = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<ArtistListResponse>(
    serverAddress,
    `/api/artists${suffix}`,
    token,
  );
}

export interface PlaylistListOptions {
  limit?: number;
  offset?: number;
  mediaId?: string;
  query?: string;
}

export function listPlaylists(
  serverAddress: string,
  token: string,
  options: PlaylistListOptions = {},
) {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  if (options.mediaId) params.set("mediaId", options.mediaId);
  if (options.query) params.set("query", options.query);
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<PlaylistListResponse>(
    serverAddress,
    `/api/playlists${suffix}`,
    token,
  );
}

export function fetchPlaylist(
  serverAddress: string,
  token: string,
  playlistId: string,
) {
  return authenticatedRequestJson<PlaylistDetailResponse>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    token,
  );
}

export function createPlaylist(
  serverAddress: string,
  token: string,
  request: CreatePlaylistRequest,
) {
  return authenticatedRequestJson<PlaylistDetailResponse>(
    serverAddress,
    "/api/playlists",
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function updatePlaylist(
  serverAddress: string,
  token: string,
  playlistId: string,
  request: UpdatePlaylistRequest,
) {
  return authenticatedRequestJson<PlaylistDetailResponse>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    token,
    { method: "PATCH", body: JSON.stringify(request) },
  );
}

export function deletePlaylist(
  serverAddress: string,
  token: string,
  playlistId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    token,
    { method: "DELETE" },
  );
}

export function addPlaylistItem(
  serverAddress: string,
  token: string,
  playlistId: string,
  request: AddPlaylistItemRequest,
) {
  return authenticatedRequestJson<AddPlaylistItemResponse>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}/items`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function removePlaylistItem(
  serverAddress: string,
  token: string,
  playlistId: string,
  itemId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`,
    token,
    { method: "DELETE" },
  );
}

export function reorderPlaylistItems(
  serverAddress: string,
  token: string,
  playlistId: string,
  request: ReorderPlaylistItemsRequest,
) {
  return authenticatedRequestJson<PlaylistDetailResponse>(
    serverAddress,
    `/api/playlists/${encodeURIComponent(playlistId)}/items/order`,
    token,
    { method: "PUT", body: JSON.stringify(request) },
  );
}

export function fetchArtist(
  serverAddress: string,
  token: string,
  artistId: string,
) {
  return authenticatedRequestJson<ArtistListResponse["items"][number]>(
    serverAddress,
    `/api/artists/${encodeURIComponent(artistId)}`,
    token,
  );
}

export function listArtistMetadataCandidates(
  serverAddress: string,
  token: string,
  artistId: string,
  query?: string,
) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("query", query.trim());
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<ArtistMetadataCandidateListResponse>(
    serverAddress,
    `/api/artists/${encodeURIComponent(artistId)}/metadata/candidates${suffix}`,
    token,
  );
}

export function applyArtistMetadata(
  serverAddress: string,
  token: string,
  artistId: string,
  metadata: ApplyArtistMetadataRequest,
) {
  return authenticatedRequestJson<null>(
    serverAddress,
    `/api/artists/${encodeURIComponent(artistId)}/metadata`,
    token,
    { method: "PUT", body: JSON.stringify(metadata) },
  );
}

export function revertArtistMetadata(
  serverAddress: string,
  token: string,
  artistId: string,
) {
  return authenticatedRequestJson<null>(
    serverAddress,
    `/api/artists/${encodeURIComponent(artistId)}/metadata`,
    token,
    { method: "DELETE" },
  );
}

export function recordTrackPlay(
  serverAddress: string,
  token: string,
  mediaId: string,
) {
  return authenticatedRequestJson<RecordMediaPlayResponse>(
    serverAddress,
    `/api/media/${encodeURIComponent(mediaId)}/plays`,
    token,
    { method: "POST" },
  );
}

export function fetchQuickPicks(serverAddress: string, token: string) {
  return authenticatedRequestJson<QuickPickListResponse>(
    serverAddress,
    "/api/quick-picks",
    token,
  );
}

export function listMetadataCandidates(
  serverAddress: string,
  token: string,
  mediaId: string,
  query?: string,
) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("query", query.trim());
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<MetadataCandidateListResponse>(
    serverAddress,
    `/api/media/${encodeURIComponent(mediaId)}/metadata/candidates${suffix}`,
    token,
  );
}

export function applyTrackMetadata(
  serverAddress: string,
  token: string,
  mediaId: string,
  metadata: ApplyMediaMetadataRequest,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/media/${encodeURIComponent(mediaId)}/metadata`,
    token,
    { method: "PUT", body: JSON.stringify(metadata) },
  );
}

export function revertTrackMetadata(
  serverAddress: string,
  token: string,
  mediaId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/media/${encodeURIComponent(mediaId)}/metadata`,
    token,
    { method: "DELETE" },
  );
}

export function listLikes(serverAddress: string, token: string) {
  return authenticatedRequestJson<LikeListResponse>(
    serverAddress,
    "/api/likes",
    token,
  );
}

export function createLike(
  serverAddress: string,
  token: string,
  target: LikeTarget,
) {
  return authenticatedRequestJson<LikeResponse>(
    serverAddress,
    "/api/likes",
    token,
    { method: "POST", body: JSON.stringify(target) },
  );
}

export function deleteLike(
  serverAddress: string,
  token: string,
  target: LikeTarget,
) {
  return authenticatedRequestJson<void>(serverAddress, "/api/likes", token, {
    method: "DELETE",
    body: JSON.stringify(target),
  });
}

export function createPlaybackToken(
  serverAddress: string,
  token: string,
  mediaId: string,
) {
  return authenticatedRequestJson<PlaybackTokenResponse>(
    serverAddress,
    `/api/media/${encodeURIComponent(mediaId)}/playback-token`,
    token,
    { method: "POST" },
  );
}

export function trackAudioUrl(
  serverAddress: string,
  mediaId: string,
  playbackToken: string,
) {
  return `${serverAddress}/api/media/${encodeURIComponent(mediaId)}/audio?playbackToken=${encodeURIComponent(playbackToken)}`;
}

export function torznabClient(address: string, token: string) {
  const get = <T>(path: string, init?: RequestInit) =>
    authenticatedRequestJson<T>(address, path, token, init);
  return {
    config: () => get<{ enabled: boolean }>("/api/search/external/status"),
    search: (q: string) =>
      get<import("@peridot/contracts").ExternalSearchResponse>(
        "/api/search/external?" + new URLSearchParams({ query: q }),
      ),
    add: (indexerId: string, releaseId: string) =>
      get<import("@peridot/contracts").ReleaseImportResponse>(
        "/api/release-imports",
        {
          method: "POST",
          body: JSON.stringify({ indexerId, releaseId }),
          headers: { "Content-Type": "application/json" },
        },
      ),
    status: (taskId: string) =>
      get<import("@peridot/contracts").ReleaseImportStatus>(
        "/api/release-imports/" + encodeURIComponent(taskId),
      ),
  };
}

export function downloadClientsApi(address: string, token: string) {
  const base = "/api/admin/download-clients";
  const request = <T>(path: string, method = "GET", body?: unknown) =>
    authenticatedRequestJson<T>(address, path, token, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return {
    list: () => request<DownloadClientResponse[]>(base),
    save: (input: DownloadClientInput, id?: string) =>
      request<{ id: string }>(
        id ? base + "/" + id : base,
        id ? "PUT" : "POST",
        input,
      ),
    test: (input: DownloadClientInput, id?: string) =>
      request<DownloadClientOptions>(base + "/test", "POST", { ...input, id }),
    options: (id: string) =>
      request<DownloadClientOptions>(base + "/" + id + "/options"),
    remove: (id: string) => request<void>(base + "/" + id, "DELETE"),
    link: (id: string, input: DownloadLinkInput) =>
      request<void>(
        "/api/admin/release-indexers/" + id + "/download-client",
        "PUT",
        input,
      ),
  };
}
