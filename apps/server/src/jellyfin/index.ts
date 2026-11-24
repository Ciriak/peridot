import type {
  MessageDescriptor,
  LibrarySourceConnectorOptionResponse,
} from "@peridot/contracts";
import {
  LibrarySourceConnectorError,
  type LibrarySourceArtworkInput,
  type LibrarySourceConnectorConfiguration,
  type LibrarySourceConnectorDefinition,
  type LibrarySourceConnectorDiscoveryInput,
  type LibrarySourcePlaybackInput,
  type LibrarySourceScanInput,
  type LibrarySourceConnectorValidationInput,
  type LibrarySourceTrackRecord,
  type ValidatedIntegrationSource,
} from "../source-integrations.js";
import {
  JellyfinClient,
  JellyfinError,
  type JellyfinAudioItem,
  type JellyfinLibraryResponse,
} from "./client.js";
import { providerRecordingIdentityKeys } from "../track-identities.js";

function message(key: string): MessageDescriptor {
  return { key };
}

function integrationError(error: unknown): never {
  if (error instanceof LibrarySourceConnectorError) throw error;
  if (error instanceof JellyfinError) {
    const code =
      error.code === "invalid_credentials"
        ? "invalid_credentials"
        : error.code === "unavailable"
          ? "unavailable"
          : error.code === "invalid_response"
            ? "invalid_response"
            : "invalid_configuration";
    throw new LibrarySourceConnectorError(
      error.message,
      code,
      error.statusCode,
      error.messageDescriptor,
    );
  }
  throw error;
}

function normalizedUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new LibrarySourceConnectorError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("settings.sources.jellyfin.error.urlInvalid"),
    );
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new LibrarySourceConnectorError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("settings.sources.jellyfin.error.urlInvalid"),
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new LibrarySourceConnectorError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("settings.sources.jellyfin.error.urlInvalid"),
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

function apiKey(configuration: LibrarySourceConnectorConfiguration): string {
  const value = configuration.apiKey?.trim() ?? "";
  if (!value || value.length > 1_024) {
    throw new LibrarySourceConnectorError(
      "Enter a Jellyfin API key.",
      "invalid_configuration",
      400,
      message("settings.sources.jellyfin.error.apiKeyRequired"),
    );
  }
  return value;
}

function libraryId(configuration: LibrarySourceConnectorConfiguration): string {
  const value = configuration.libraryId?.trim() ?? "";
  if (!value) {
    throw new LibrarySourceConnectorError(
      "Choose a Jellyfin library.",
      "invalid_configuration",
      400,
      message("settings.sources.jellyfin.error.libraryMissing"),
    );
  }
  return value;
}

function libraryConfiguration(
  library: JellyfinLibraryResponse,
): Record<string, string> {
  return {
    libraryId: library.id,
    libraryCollectionType: library.collectionType ?? "",
  };
}

function mediaType(
  item: JellyfinAudioItem,
  libraryCollectionType: string | undefined,
) {
  const tags = item.jellyfinTags.map((value) => value.trim().toLowerCase());
  const providerIds = Object.keys(item.jellyfinProviderIds).map((value) =>
    value.trim().toLowerCase(),
  );
  if (
    tags.includes("podcast") ||
    providerIds.some((value) =>
      ["podcast", "podcastguid", "podcastindex"].includes(value),
    )
  ) {
    return {
      mediaType: "podcast" as const,
      mediaTypeOrigin: "source" as const,
    };
  }
  if (
    item.jellyfinItemType?.trim().toLowerCase() === "audiobook" ||
    libraryCollectionType?.trim().toLowerCase() === "books"
  ) {
    return {
      mediaType: "audiobook" as const,
      mediaTypeOrigin: "source" as const,
    };
  }
  return { mediaType: "music" as const, mediaTypeOrigin: "fallback" as const };
}

function trackRecord(
  item: JellyfinAudioItem,
  configuration: LibrarySourceConnectorConfiguration,
): LibrarySourceTrackRecord {
  const detected = mediaType(item, configuration.libraryCollectionType);
  const albumArtists =
    detected.mediaType !== "music" && item.albumArtists.length === 0
      ? item.artists
      : item.albumArtists;
  const albumArtist =
    detected.mediaType !== "music" && albumArtists.length === 0
      ? null
      : item.albumArtist;
  return {
    externalId: item.externalId,
    externalVersion: item.externalVersion,
    relativePath: `jellyfin/${item.albumId ?? "unknown"}/${item.externalId}`,
    title: item.title,
    artists: item.artists,
    albumArtist,
    albumArtists,
    album: item.album,
    genres: item.genres,
    ...detected,
    discNumber: item.discNumber,
    trackNumber: item.trackNumber,
    durationMs: item.durationMs,
    publishedAt: item.publishedAt,
    fileSizeBytes: item.fileSizeBytes,
    fileModifiedAt: item.fileModifiedAt,
    mimeType: item.mimeType,
    container: item.container,
    recordingIdentityKeys: providerRecordingIdentityKeys(
      item.jellyfinProviderIds,
    ),
    audioLossless: item.audioLossless,
    audioBitrate: item.audioBitrate,
    cover: item.coverItemId
      ? { itemId: item.coverItemId, tag: item.coverTag }
      : null,
  };
}

export interface JellyfinIntegrationOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

export function createJellyfinIntegration(
  options: JellyfinIntegrationOptions = {},
): LibrarySourceConnectorDefinition {
  const client = new JellyfinClient(
    options.fetch ?? fetch,
    options.requestTimeoutMs,
  );

  return {
    kind: "jellyfin",
    async discover(
      input: LibrarySourceConnectorDiscoveryInput,
    ): Promise<LibrarySourceConnectorOptionResponse[]> {
      try {
        const url = normalizedUrl(input.configuration.url);
        const libraries = await client.listLibraries(
          url,
          apiKey(input.credentials),
          input.signal,
        );
        return libraries.map((library) => ({
          id: library.id,
          label: library.name,
          configuration: libraryConfiguration(library),
        }));
      } catch (error) {
        integrationError(error);
      }
    },
    async validateSource(
      input: LibrarySourceConnectorValidationInput,
    ): Promise<ValidatedIntegrationSource> {
      try {
        const url = normalizedUrl(input.configuration.url);
        const key = apiKey(input.credentials);
        const selectedLibraryId = libraryId(input.configuration);
        const [info, libraries] = await Promise.all([
          client.validate(url, key),
          client.listLibraries(url, key),
        ]);
        const library = libraries.find(
          (candidate) => candidate.id === selectedLibraryId,
        );
        if (!library) {
          throw new LibrarySourceConnectorError(
            "Choose an available Jellyfin library.",
            "invalid_configuration",
            400,
            message("settings.sources.jellyfin.error.libraryMissing"),
          );
        }
        return {
          identity: JSON.stringify([url, library.id]),
          name: library.name || info.name,
          configuration: {
            url,
            ...libraryConfiguration(library),
          },
          credentials: { apiKey: key },
        };
      } catch (error) {
        integrationError(error);
      }
    },
    async scan(input: LibrarySourceScanInput): Promise<void> {
      try {
        await client.listAudio(
          input.source.configuration.url ?? "",
          input.source.credentials.apiKey ?? "",
          input.source.configuration.libraryId ?? null,
          async (page) => {
            await input.onPage({
              items: page.items.map((item) =>
                trackRecord(item, input.source.configuration),
              ),
              unsupportedCount: page.unsupportedCount,
              processedCount: page.processedCount,
              totalCount: page.totalCount,
            });
          },
          input.signal,
        );
      } catch (error) {
        integrationError(error);
      }
    },
    async artwork(input: LibrarySourceArtworkInput) {
      try {
        return await client.cover(
          input.source.configuration.url ?? "",
          input.source.credentials.apiKey ?? "",
          input.reference.itemId,
          input.reference.tag,
          input.signal,
        );
      } catch (error) {
        integrationError(error);
      }
    },
    async openAudio(input: LibrarySourcePlaybackInput): Promise<Response> {
      try {
        return await client.audio(
          input.source.configuration.url ?? "",
          input.source.credentials.apiKey ?? "",
          input.externalId,
          input.container ?? "mp3",
          input.range,
          input.method,
          input.signal,
        );
      } catch (error) {
        integrationError(error);
      }
    },
  };
}
