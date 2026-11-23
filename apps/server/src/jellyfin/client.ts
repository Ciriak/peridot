import type { MessageDescriptor } from "@peridot/contracts";

function message(key: string): MessageDescriptor {
  return { key };
}

const AUDIO_PAGE_SIZE = 500;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const AUDIO_TYPES = new Map<string, { extension: string; mimeType: string }>([
  ["aac", { extension: "aac", mimeType: "audio/aac" }],
  ["flac", { extension: "flac", mimeType: "audio/flac" }],
  ["m4a", { extension: "m4a", mimeType: "audio/mp4" }],
  ["m4b", { extension: "m4b", mimeType: "audio/mp4" }],
  ["mp3", { extension: "mp3", mimeType: "audio/mpeg" }],
  ["mp4", { extension: "m4a", mimeType: "audio/mp4" }],
  ["ogg", { extension: "ogg", mimeType: "audio/ogg" }],
  ["opus", { extension: "opus", mimeType: "audio/ogg" }],
  ["wav", { extension: "wav", mimeType: "audio/wav" }],
]);
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface JellyfinNameId {
  Name?: string | null;
}

interface JellyfinMediaSource {
  Container?: string | null;
  Size?: number | null;
  MediaStreams?: Array<{
    Type?: string | null;
    BitRate?: number | null;
    IsLossless?: boolean | null;
  }> | null;
}

interface JellyfinItem {
  Id?: string | null;
  Name?: string | null;
  Type?: string | null;
  Etag?: string | null;
  Container?: string | null;
  RunTimeTicks?: number | null;
  IndexNumber?: number | null;
  ParentIndexNumber?: number | null;
  DateCreated?: string | null;
  PremiereDate?: string | null;
  Artists?: string[] | null;
  ArtistItems?: JellyfinNameId[] | null;
  Album?: string | null;
  AlbumId?: string | null;
  AlbumArtist?: string | null;
  AlbumArtists?: JellyfinNameId[] | null;
  AlbumPrimaryImageTag?: string | null;
  ImageTags?: Record<string, string | null> | null;
  Genres?: string[] | null;
  GenreItems?: JellyfinNameId[] | null;
  Tags?: string[] | null;
  ProviderIds?: Record<string, string | null> | null;
  MediaSources?: JellyfinMediaSource[] | null;
}

interface JellyfinItemsResponse {
  Items?: JellyfinItem[] | null;
  TotalRecordCount?: number | null;
}

interface JellyfinLibrary {
  ItemId?: string | null;
  Name?: string | null;
  CollectionType?: string | null;
}

export interface JellyfinLibraryResponse {
  id: string;
  name: string;
  collectionType: string | null;
}

interface JellyfinSystemInfo {
  ServerName?: string | null;
  ProductName?: string | null;
  Id?: string | null;
  Version?: string | null;
}

export interface JellyfinServerInfo {
  name: string;
  productName: string;
  serverId: string | null;
  version: string | null;
}

export interface JellyfinAudioItem {
  externalId: string;
  externalVersion: string;
  title: string;
  artists: string[];
  albumArtist: string | null;
  albumArtists: string[];
  album: string | null;
  albumId: string | null;
  genres: string[];
  jellyfinItemType: string | null;
  jellyfinTags: string[];
  jellyfinProviderIds: Record<string, string | null>;
  discNumber: number | null;
  trackNumber: number | null;
  durationMs: number | null;
  publishedAt: Date | null;
  fileSizeBytes: bigint;
  fileModifiedAt: Date;
  mimeType: string;
  container: string;
  audioLossless: boolean;
  audioBitrate: number | null;
  coverItemId: string | null;
  coverTag: string | null;
}

export interface JellyfinAudioPage {
  items: JellyfinAudioItem[];
  unsupportedCount: number;
  processedCount: number;
  totalCount: number | null;
}

export interface JellyfinCover {
  data: Buffer;
  mimeType: string;
}

export type JellyfinErrorCode =
  "invalid_url" | "invalid_credentials" | "unavailable" | "invalid_response";

export class JellyfinError extends Error {
  constructor(
    messageText: string,
    readonly code: JellyfinErrorCode,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(messageText);
    this.name = "JellyfinError";
  }
}

function endpoint(baseUrl: string, pathname: string): URL {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function authorization(apiKey: string): string {
  return `MediaBrowser Token="${apiKey}"`;
}

function positiveInteger(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function uniqueValues(
  values: readonly (string | null | undefined)[],
): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function audioType(item: JellyfinItem): {
  extension: string;
  mimeType: string;
  container: string;
} | null {
  const mediaContainer = item.MediaSources?.[0]?.Container;
  const container =
    (mediaContainer ?? item.Container ?? "")
      .split(",")[0]
      ?.trim()
      .toLowerCase() ?? "";
  const type = container ? AUDIO_TYPES.get(container) : null;
  return type ? { ...type, container } : null;
}

function toAudioItem(item: JellyfinItem): {
  value: JellyfinAudioItem | null;
  unsupported: boolean;
} {
  if (!item.Id?.trim()) return { value: null, unsupported: false };
  const type = audioType(item);
  if (!type) return { value: null, unsupported: true };

  const artists = uniqueValues(
    item.Artists?.length
      ? item.Artists
      : (item.ArtistItems ?? []).map((artist) => artist.Name),
  );
  const albumArtists = uniqueValues(
    (item.AlbumArtists ?? []).length
      ? (item.AlbumArtists ?? []).map((artist) => artist.Name)
      : [item.AlbumArtist],
  );
  const album = item.Album?.trim() || null;
  const albumId = item.AlbumId?.trim() || null;
  const genres = uniqueValues(
    item.Genres?.length
      ? item.Genres
      : (item.GenreItems ?? []).map((genre) => genre.Name),
  );
  const primaryImageTag = item.ImageTags?.Primary?.trim() || null;
  const albumCoverItemId =
    album && albumId && item.AlbumPrimaryImageTag ? albumId : null;
  const coverItemId = albumCoverItemId ?? (primaryImageTag ? item.Id : null);
  const coverTag =
    (coverItemId === albumId ? item.AlbumPrimaryImageTag : primaryImageTag) ??
    null;
  const dateCreated = item.DateCreated
    ? new Date(item.DateCreated)
    : new Date(0);
  const fileModifiedAt = Number.isNaN(dateCreated.getTime())
    ? new Date(0)
    : dateCreated;
  const durationMs =
    item.RunTimeTicks && item.RunTimeTicks > 0
      ? Math.round(item.RunTimeTicks / 10_000)
      : null;
  const publishedAt = (() => {
    for (const value of [item.PremiereDate, item.DateCreated]) {
      if (!value) continue;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  })();
  const size = item.MediaSources?.[0]?.Size;
  const audioStream = item.MediaSources?.[0]?.MediaStreams?.find(
    (stream) => stream.Type?.trim().toLowerCase() === "audio",
  );

  return {
    value: {
      externalId: item.Id,
      externalVersion:
        item.Etag?.trim() ||
        [
          item.Id,
          type.extension,
          item.Name ?? "",
          (item.Artists ?? []).join("|"),
          item.Album ?? "",
          genres.join("|"),
          item.Type ?? "",
          (item.Tags ?? []).join("|"),
          Object.keys(item.ProviderIds ?? {})
            .sort()
            .join("|"),
          item.RunTimeTicks ?? "",
          coverTag ?? "",
        ].join(":"),
      title: item.Name?.trim() || "Unknown track",
      artists,
      albumArtist: albumArtists.join(", ") || null,
      albumArtists,
      album,
      albumId,
      genres,
      jellyfinItemType: item.Type?.trim() || null,
      jellyfinTags: uniqueValues(item.Tags ?? []),
      jellyfinProviderIds: item.ProviderIds ?? {},
      discNumber: positiveInteger(item.ParentIndexNumber),
      trackNumber: positiveInteger(item.IndexNumber),
      durationMs,
      publishedAt,
      fileSizeBytes:
        size !== null &&
        size !== undefined &&
        Number.isFinite(size) &&
        size >= 0
          ? BigInt(Math.trunc(size))
          : 0n,
      fileModifiedAt,
      mimeType: type.mimeType,
      container: type.container,
      audioLossless: audioStream?.IsLossless === true,
      audioBitrate:
        audioStream?.BitRate !== null &&
        audioStream?.BitRate !== undefined &&
        Number.isFinite(audioStream.BitRate) &&
        audioStream.BitRate > 0
          ? Math.round(audioStream.BitRate)
          : null,
      coverItemId,
      coverTag,
    },
    unsupported: false,
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class JellyfinClient {
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async validate(baseUrl: string, apiKey: string): Promise<JellyfinServerInfo> {
    const response = await this.request(
      endpoint(baseUrl, "System/Info"),
      apiKey,
    );
    if (response.status === 401 || response.status === 403) {
      throw new JellyfinError(
        "Jellyfin rejected the API key.",
        "invalid_credentials",
        400,
        message("settings.sources.jellyfin.error.invalidCredentials"),
      );
    }
    if (!response.ok) {
      throw new JellyfinError(
        "Jellyfin did not accept the connection.",
        "unavailable",
        502,
        message("settings.sources.jellyfin.error.unavailable"),
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new JellyfinError(
        "Jellyfin returned an invalid server response.",
        "invalid_response",
        502,
        message("settings.sources.jellyfin.error.invalidResponse"),
      );
    }
    const value = jsonObject(raw) as JellyfinSystemInfo;
    const name = value.ServerName?.trim();
    if (!name) {
      throw new JellyfinError(
        "Jellyfin returned an invalid server response.",
        "invalid_response",
        502,
        message("settings.sources.jellyfin.error.invalidResponse"),
      );
    }
    return {
      name,
      productName: value.ProductName?.trim() || "Jellyfin",
      serverId: value.Id?.trim() || null,
      version: value.Version?.trim() || null,
    };
  }

  async listAudio(
    baseUrl: string,
    apiKey: string,
    libraryId: string | null,
    onPage?: (page: JellyfinAudioPage) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<{
    items: JellyfinAudioItem[];
    unsupportedCount: number;
    totalCount: number | null;
    processedCount: number;
  }> {
    const items: JellyfinAudioItem[] = [];
    let unsupportedCount = 0;
    let startIndex = 0;
    let totalCount: number | null = null;

    while (true) {
      const url = endpoint(baseUrl, "Items");
      url.search = new URLSearchParams({
        recursive: "true",
        includeItemTypes: "Audio,AudioBook",
        mediaTypes: "Audio",
        ...(libraryId ? { parentId: libraryId } : {}),
        fields: "MediaSources,Genres,PremiereDate,DateCreated,Tags,ProviderIds",
        enableImages: "true",
        enableTotalRecordCount: "true",
        sortBy: "SortName",
        startIndex: String(startIndex),
        limit: String(AUDIO_PAGE_SIZE),
      }).toString();
      const response = await this.request(url, apiKey, {
        ...(signal ? { signal } : {}),
      });
      if (response.status === 401 || response.status === 403) {
        throw new JellyfinError(
          "Jellyfin rejected the API key.",
          "invalid_credentials",
          409,
          message("settings.sources.jellyfin.error.invalidCredentials"),
        );
      }
      if (!response.ok) {
        throw new JellyfinError(
          "Jellyfin could not list its audio library.",
          "unavailable",
          502,
          message("settings.sources.jellyfin.error.unavailable"),
        );
      }
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new JellyfinError(
          "Jellyfin returned an invalid library response.",
          "invalid_response",
          502,
          message("settings.sources.jellyfin.error.invalidResponse"),
        );
      }
      const page = jsonObject(raw) as JellyfinItemsResponse;
      const pageItems = Array.isArray(page.Items) ? page.Items : [];
      const convertedItems: JellyfinAudioItem[] = [];
      let pageUnsupportedCount = 0;
      for (const item of pageItems) {
        const converted = toAudioItem(item);
        if (converted.value) convertedItems.push(converted.value);
        if (converted.unsupported) pageUnsupportedCount += 1;
      }
      unsupportedCount += pageUnsupportedCount;
      startIndex += pageItems.length;
      const pageTotal =
        typeof page.TotalRecordCount === "number" &&
        Number.isFinite(page.TotalRecordCount)
          ? page.TotalRecordCount
          : null;
      if (pageTotal !== null) totalCount = pageTotal;
      if (onPage) {
        await onPage({
          items: convertedItems,
          unsupportedCount: pageUnsupportedCount,
          processedCount: startIndex,
          totalCount: pageTotal ?? totalCount,
        });
      } else {
        items.push(...convertedItems);
      }
      if (
        pageItems.length === 0 ||
        pageItems.length < AUDIO_PAGE_SIZE ||
        (pageTotal !== null && startIndex >= pageTotal)
      ) {
        break;
      }
    }

    return { items, unsupportedCount, totalCount, processedCount: startIndex };
  }

  async listLibraries(
    baseUrl: string,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryResponse[]> {
    const response = await this.request(
      endpoint(baseUrl, "Library/VirtualFolders"),
      apiKey,
      {
        ...(signal ? { signal } : {}),
      },
    );
    if (response.status === 401 || response.status === 403) {
      throw new JellyfinError(
        "Jellyfin rejected the API key.",
        "invalid_credentials",
        400,
        message("settings.sources.jellyfin.error.invalidCredentials"),
      );
    }
    if (!response.ok) {
      throw new JellyfinError(
        "Jellyfin could not list its libraries.",
        "unavailable",
        502,
        message("settings.sources.jellyfin.error.unavailable"),
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new JellyfinError(
        "Jellyfin returned an invalid library response.",
        "invalid_response",
        502,
        message("settings.sources.jellyfin.error.invalidResponse"),
      );
    }
    if (!Array.isArray(raw)) {
      throw new JellyfinError(
        "Jellyfin returned an invalid library response.",
        "invalid_response",
        502,
        message("settings.sources.jellyfin.error.invalidResponse"),
      );
    }
    return raw.flatMap((value) => {
      const library = jsonObject(value) as JellyfinLibrary;
      const id = library.ItemId?.trim();
      const name = library.Name?.trim();
      return id && name
        ? [
            {
              id,
              name,
              collectionType: library.CollectionType?.trim() || null,
            },
          ]
        : [];
    });
  }

  async cover(
    baseUrl: string,
    apiKey: string,
    itemId: string,
    tag: string | null,
    signal?: AbortSignal,
  ): Promise<JellyfinCover | null> {
    const url = endpoint(
      baseUrl,
      `Items/${encodeURIComponent(itemId)}/Images/Primary`,
    );
    url.search = new URLSearchParams({
      maxWidth: "400",
      maxHeight: "400",
      quality: "75",
      ...(tag ? { tag } : {}),
    }).toString();
    const response = await this.request(url, apiKey, {
      headers: { Accept: "*/*" },
      ...(signal ? { signal } : {}),
    });
    if (response.status === 401 || response.status === 403) {
      throw new JellyfinError(
        "Jellyfin rejected the API key.",
        "invalid_credentials",
        400,
        message("settings.sources.jellyfin.error.invalidCredentials"),
      );
    }
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      throw new JellyfinError(
        "Jellyfin could not provide artwork.",
        "unavailable",
        502,
        message("settings.sources.jellyfin.error.unavailable"),
      );
    }
    const mimeType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (
      !COVER_TYPES.has(mimeType) ||
      (Number.isFinite(length) && length > MAX_COVER_BYTES)
    ) {
      return null;
    }
    const data = Buffer.from(await response.arrayBuffer());
    return data.length && data.length <= MAX_COVER_BYTES
      ? { data, mimeType }
      : null;
  }

  async audio(
    baseUrl: string,
    apiKey: string,
    externalId: string,
    container: string,
    range?: string,
    method: "GET" | "HEAD" = "GET",
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = endpoint(
      baseUrl,
      `Audio/${encodeURIComponent(externalId)}/stream`,
    );
    url.search = new URLSearchParams({
      static: "true",
      container,
    }).toString();
    const options: RequestInit = {
      method,
      headers: {
        Accept: "*/*",
        ...(range ? { Range: range } : {}),
      },
      ...(signal ? { signal } : {}),
    };
    return this.request(url, apiKey, options);
  }

  private async request(
    url: URL,
    apiKey: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Jellyfin request timed out"));
    }, this.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: authorization(apiKey),
          "User-Agent": "Peridot/0.1",
          ...options.headers,
        },
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof JellyfinError) throw error;
      const cause =
        error && typeof error === "object" && "cause" in error
          ? (error as { cause?: unknown }).cause
          : null;
      const causeCode =
        cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code?: unknown }).code ?? "")
          : "";
      const detail = timedOut
        ? `timed out after ${this.requestTimeoutMs}ms`
        : causeCode
          ? `network error ${causeCode}`
          : "network request failed";
      throw new JellyfinError(
        `Jellyfin could not be reached: ${detail}.`,
        "unavailable",
        502,
        message("settings.sources.jellyfin.error.unavailable"),
      );
    } finally {
      options.signal?.removeEventListener("abort", abortFromCaller);
      clearTimeout(timer);
    }
  }
}
