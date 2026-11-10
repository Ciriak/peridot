import type {
  ApiErrorResponse,
  ApplyTrackMetadataRequest,
  AuthSessionResponse,
  AuthStatusResponse,
  CreateMetadataProviderRequest,
  CreateSourceRequest,
  DirectoryListResponse,
  DirectorySearchResponse,
  LikeListResponse,
  LikeResponse,
  LikeTarget,
  LibraryScanResponse,
  LogListResponse,
  MetadataCandidateListResponse,
  MetadataProviderListResponse,
  MetadataProviderResponse,
  PlaybackTokenResponse,
  QueueResponse,
  ReplaceQueueRequest,
  ResetTrackMetadataResponse,
  ServerSettingsResponse,
  SourceListResponse,
  SourceResponse,
  TrackListResponse,
} from "@peridot/contracts";

export interface AdministratorCredentials {
  email: string;
  username: string;
  password: string;
}

export interface SignInCredentials {
  identifier: string;
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

async function requestJson<T>(
  serverAddress: string,
  path: string,
  init?: RequestInit,
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
  } catch {
    throw new Error("Could not reach this Peridot server.");
  }
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    throw new Error(
      body?.error.message ?? "The Peridot server rejected the request.",
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
  return requestJson<T>(serverAddress, path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
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
    throw new Error("Local server discovery is unavailable.");
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

export function revokeSession(serverAddress: string, token: string) {
  return authenticatedRequestJson<void>(
    serverAddress,
    "/api/auth/session",
    token,
    { method: "DELETE" },
  );
}

export function fetchServerSettings(serverAddress: string, token: string) {
  return authenticatedRequestJson<ServerSettingsResponse>(
    serverAddress,
    "/api/admin/server",
    token,
  );
}

export function listMetadataProviders(serverAddress: string, token: string) {
  return authenticatedRequestJson<MetadataProviderListResponse>(
    serverAddress,
    "/api/admin/metadata-providers",
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

export function deleteMetadataProvider(
  serverAddress: string,
  token: string,
  providerId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/admin/metadata-providers/${providerId}`,
    token,
    { method: "DELETE" },
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
  return authenticatedRequestJson<LibraryScanResponse>(
    serverAddress,
    "/api/admin/metadata/refresh",
    token,
    { method: "POST" },
  );
}

export function resetMetadata(serverAddress: string, token: string) {
  return authenticatedRequestJson<ResetTrackMetadataResponse>(
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
  return authenticatedRequestJson<SourceListResponse>(
    serverAddress,
    "/api/admin/sources",
    token,
  );
}

export function createSource(
  serverAddress: string,
  token: string,
  source: CreateSourceRequest,
) {
  return authenticatedRequestJson<SourceResponse>(
    serverAddress,
    "/api/admin/sources",
    token,
    { method: "POST", body: JSON.stringify(source) },
  );
}

export function deleteSource(
  serverAddress: string,
  token: string,
  sourceId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/admin/sources/${sourceId}`,
    token,
    { method: "DELETE" },
  );
}

export function reorderSources(
  serverAddress: string,
  token: string,
  ids: string[],
) {
  return authenticatedRequestJson<SourceListResponse>(
    serverAddress,
    "/api/admin/sources/order",
    token,
    { method: "PUT", body: JSON.stringify({ ids }) },
  );
}

export function rescanSource(
  serverAddress: string,
  token: string,
  sourceId: string,
) {
  return authenticatedRequestJson<LibraryScanResponse>(
    serverAddress,
    `/api/admin/sources/${sourceId}/scans`,
    token,
    { method: "POST" },
  );
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
  return authenticatedRequestJson<LibraryScanResponse>(
    serverAddress,
    "/api/library/scans",
    token,
    { method: "POST" },
  );
}

export function getLibraryScan(
  serverAddress: string,
  token: string,
  scanId: string,
) {
  return authenticatedRequestJson<LibraryScanResponse>(
    serverAddress,
    `/api/library/scans/${scanId}`,
    token,
  );
}

export function listTracks(serverAddress: string, token: string) {
  return authenticatedRequestJson<TrackListResponse>(
    serverAddress,
    "/api/tracks",
    token,
  );
}

export function listMetadataCandidates(
  serverAddress: string,
  token: string,
  trackId: string,
  query?: string,
) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("query", query.trim());
  const suffix = params.size ? `?${params.toString()}` : "";
  return authenticatedRequestJson<MetadataCandidateListResponse>(
    serverAddress,
    `/api/tracks/${encodeURIComponent(trackId)}/metadata/candidates${suffix}`,
    token,
  );
}

export function applyTrackMetadata(
  serverAddress: string,
  token: string,
  trackId: string,
  metadata: ApplyTrackMetadataRequest,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/tracks/${encodeURIComponent(trackId)}/metadata`,
    token,
    { method: "PUT", body: JSON.stringify(metadata) },
  );
}

export function revertTrackMetadata(
  serverAddress: string,
  token: string,
  trackId: string,
) {
  return authenticatedRequestJson<void>(
    serverAddress,
    `/api/tracks/${encodeURIComponent(trackId)}/metadata`,
    token,
    { method: "DELETE" },
  );
}

export function fetchQueue(serverAddress: string, token: string) {
  return authenticatedRequestJson<QueueResponse>(
    serverAddress,
    "/api/queue",
    token,
  );
}

export function replaceQueue(
  serverAddress: string,
  token: string,
  trackIds: string[],
) {
  const body: ReplaceQueueRequest = { trackIds };
  return authenticatedRequestJson<QueueResponse>(
    serverAddress,
    "/api/queue",
    token,
    { method: "PUT", body: JSON.stringify(body) },
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
  trackId: string,
) {
  return authenticatedRequestJson<PlaybackTokenResponse>(
    serverAddress,
    `/api/tracks/${encodeURIComponent(trackId)}/playback-token`,
    token,
    { method: "POST" },
  );
}

export function trackAudioUrl(
  serverAddress: string,
  trackId: string,
  playbackToken: string,
) {
  return `${serverAddress}/api/tracks/${encodeURIComponent(trackId)}/audio?playbackToken=${encodeURIComponent(playbackToken)}`;
}
