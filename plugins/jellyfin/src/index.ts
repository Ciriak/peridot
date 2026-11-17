import type {
  MessageDescriptor,
  PluginSourceOptionResponse,
} from "@peridot/contracts";
import {
  PluginError,
  type PluginArtworkInput,
  type PluginDefinition,
  type PluginPlaybackInput,
  type PluginScanInput,
  type PluginSourceConfiguration,
  type PluginSourceDiscoveryInput,
  type PluginSourceValidationInput,
  type PluginTrackRecord,
  type PluginValidatedSource,
} from "@peridot/plugin-sdk";
import {
  JellyfinClient,
  JellyfinError,
  type JellyfinAudioItem,
  type JellyfinLibraryResponse,
} from "./jellyfin-client.js";
import { jellyfinDefinition } from "./manifest.js";

export { jellyfinDefinition } from "./manifest.js";

function message(key: string): MessageDescriptor {
  return { key };
}

function pluginError(error: unknown): never {
  if (error instanceof PluginError) throw error;
  if (error instanceof JellyfinError) {
    const code =
      error.code === "invalid_credentials"
        ? "invalid_credentials"
        : error.code === "unavailable"
          ? "unavailable"
          : error.code === "invalid_response"
            ? "invalid_response"
            : "invalid_configuration";
    throw new PluginError(
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
    throw new PluginError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("plugin.jellyfin.error.urlInvalid"),
    );
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PluginError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("plugin.jellyfin.error.urlInvalid"),
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
    throw new PluginError(
      "Enter a Jellyfin server URL.",
      "invalid_configuration",
      400,
      message("plugin.jellyfin.error.urlInvalid"),
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

function apiKey(configuration: PluginSourceConfiguration): string {
  const value = configuration.apiKey?.trim() ?? "";
  if (!value || value.length > 1_024) {
    throw new PluginError(
      "Enter a Jellyfin API key.",
      "invalid_configuration",
      400,
      message("plugin.jellyfin.error.apiKeyRequired"),
    );
  }
  return value;
}

function libraryId(configuration: PluginSourceConfiguration): string {
  const value = configuration.libraryId?.trim() ?? "";
  if (!value) {
    throw new PluginError(
      "Choose a Jellyfin library.",
      "invalid_configuration",
      400,
      message("plugin.jellyfin.error.libraryMissing"),
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
  configuration: PluginSourceConfiguration,
): PluginTrackRecord {
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
    cover: item.coverItemId
      ? { itemId: item.coverItemId, tag: item.coverTag }
      : null,
  };
}

export interface JellyfinPluginOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

export function createJellyfinPlugin(
  options: JellyfinPluginOptions = {},
): PluginDefinition {
  const client = new JellyfinClient(
    options.fetch ?? fetch,
    options.requestTimeoutMs,
  );
  const contribution = jellyfinDefinition.contributions[0];
  if (!contribution || contribution.kind !== "source") {
    throw new Error("Jellyfin source contribution is missing.");
  }

  return {
    manifest: jellyfinDefinition.manifest,
    contributions: jellyfinDefinition.contributions,
    source: {
      contribution,
      async discover(
        input: PluginSourceDiscoveryInput,
      ): Promise<PluginSourceOptionResponse[]> {
        try {
          const url = normalizedUrl(input.configuration.url);
          const libraries = await client.listLibraries(
            url,
            apiKey(input.configuration),
            input.signal,
          );
          return libraries.map((library) => ({
            id: library.id,
            label: library.name,
            configuration: libraryConfiguration(library),
          }));
        } catch (error) {
          pluginError(error);
        }
      },
      async validateSource(
        input: PluginSourceValidationInput,
      ): Promise<PluginValidatedSource> {
        try {
          const url = normalizedUrl(input.configuration.url);
          const key = apiKey(input.configuration);
          const selectedLibraryId = libraryId(input.configuration);
          const [info, libraries] = await Promise.all([
            client.validate(url, key),
            client.listLibraries(url, key),
          ]);
          const library = libraries.find(
            (candidate) => candidate.id === selectedLibraryId,
          );
          if (!library) {
            throw new PluginError(
              "Choose an available Jellyfin library.",
              "invalid_configuration",
              400,
              message("plugin.jellyfin.error.libraryMissing"),
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
          pluginError(error);
        }
      },
      async scan(input: PluginScanInput): Promise<void> {
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
          pluginError(error);
        }
      },
      async artwork(input: PluginArtworkInput) {
        try {
          return await client.cover(
            input.source.configuration.url ?? "",
            input.source.credentials.apiKey ?? "",
            input.reference.itemId,
            input.reference.tag,
            input.signal,
          );
        } catch (error) {
          pluginError(error);
        }
      },
      async openAudio(input: PluginPlaybackInput): Promise<Response> {
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
          pluginError(error);
        }
      },
    },
  };
}
