import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import type {
  OverviewConnectionStatus,
  OverviewDownloadClientResponse,
  OverviewLibrarySourceResponse,
  OverviewMetadataProviderResponse,
  OverviewReleaseIndexerResponse,
  OverviewResponse,
  OverviewServiceCounts,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import type { MetadataResolverRegistry } from "./metadata-resolver.js";
import type { LibrarySourceRow, MetadataProviderRow } from "./prisma/models.js";
import {
  LibrarySourceConnectorError,
  type LibrarySourceConnectorService,
} from "./source-integrations.js";

const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_CHECK_TIMEOUT_MS = 5_000;
const CHECK_CONCURRENCY = 4;

export interface OverviewServiceOptions {
  cacheTtlMs?: number;
  checkTimeoutMs?: number;
}

function safeHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

function sourceAddress(source: LibrarySourceRow): string {
  if (source.kind === "path") return "Local folder";
  return safeHost(source.url) ?? "Remote library";
}

function sourceName(source: LibrarySourceRow): string {
  const configured = source.name?.trim();
  if (configured) return configured;
  if (source.kind === "path") {
    const folder = path.basename(
      source.path?.trim().replace(/[\\/]+$/u, "") ?? "",
    );
    return folder || "Library folder";
  }
  return safeHost(source.url) ?? "Jellyfin";
}

function providerConfiguration(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function providerStatus(
  provider: MetadataProviderRow,
  registry: MetadataResolverRegistry,
): OverviewConnectionStatus {
  if (!provider.enabled) return "disabled";
  const resolver = registry.get(provider.kind);
  if (!resolver) return "unknown";
  const configuration = providerConfiguration(provider.configuration);
  if (
    resolver.definition.configurationFields.some(
      (field) => field.required && !configuration[field.key]?.trim(),
    )
  ) {
    return "unknown";
  }
  if (
    resolver.definition.credentialField?.required &&
    !provider.credentialCiphertext
  ) {
    return "unknown";
  }
  return "online";
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export class OverviewService {
  private readonly cacheTtlMs: number;
  private readonly checkTimeoutMs: number;
  private readonly cached = new Map<
    string,
    { expiresAt: number; response: OverviewResponse }
  >();

  constructor(
    private readonly database: Database,
    private readonly sourceIntegrations: LibrarySourceConnectorService,
    private readonly metadataRegistry: MetadataResolverRegistry,
    options: OverviewServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  }

  private async checkFolder(source: LibrarySourceRow): Promise<boolean> {
    if (!source.path) return false;
    try {
      await access(source.path, constants.R_OK);
      return (await stat(source.path)).isDirectory();
    } catch {
      return false;
    }
  }

  private async checkIntegration(
    source: LibrarySourceRow,
  ): Promise<OverviewConnectionStatus> {
    if (!this.sourceIntegrations.registry.has(source.kind)) return "unknown";
    try {
      const handle = this.sourceIntegrations.sourceHandle(source);
      await this.sourceIntegrations.validateSource(source.kind, {
        configuration: handle.configuration,
        credentials: handle.credentials,
        signal: AbortSignal.timeout(this.checkTimeoutMs),
      });
      return "online";
    } catch (error) {
      if (
        error instanceof LibrarySourceConnectorError &&
        error.code === "unavailable"
      ) {
        return "offline";
      }
      if (error instanceof DOMException && error.name === "TimeoutError") {
        return "offline";
      }
      return "unknown";
    }
  }

  private async sourceSummary(
    source: LibrarySourceRow,
  ): Promise<OverviewLibrarySourceResponse> {
    const [fileCount, status] = await Promise.all([
      this.database.orm.MediaCopy.where({
        librarySourceId: source.id,
        available: 1,
      }).aggregate((aggregate) => ({ count: aggregate.count() })),
      source.kind === "path"
        ? this.checkFolder(source).then((online): OverviewConnectionStatus =>
            online ? "online" : "offline",
          )
        : this.checkIntegration(source),
    ]);

    return {
      id: source.id,
      kind: source.kind as OverviewLibrarySourceResponse["kind"],
      name: sourceName(source),
      address: sourceAddress(source),
      fileCount: fileCount.count,
      status,
    };
  }

  private async serviceCounts(userId: string): Promise<OverviewServiceCounts> {
    const [albums, playlists, podcasts, audiobooks] = await Promise.all([
      this.database.orm.CatalogAlbum.where((album) =>
        album.availableTrackCount.gt(0),
      ).aggregate((aggregate) => ({ count: aggregate.count() })),
      this.database.orm.Playlist.where({ userId }).aggregate((aggregate) => ({
        count: aggregate.count(),
      })),
      this.database.orm.CatalogMedia.where({
        mediaType: "podcast",
        available: 1,
      }).aggregate((aggregate) => ({ count: aggregate.count() })),
      this.database.orm.CatalogMedia.where({
        mediaType: "audiobook",
        available: 1,
      }).aggregate((aggregate) => ({ count: aggregate.count() })),
    ]);
    return {
      albums: albums.count,
      playlists: playlists.count + 2,
      podcasts: podcasts.count,
      audiobooks: audiobooks.count,
    };
  }

  async get(userId: string): Promise<OverviewResponse> {
    const now = Date.now();
    const cached = this.cached.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.response;
    }

    const sources = await this.database.orm.LibrarySource.where((source) =>
      source.removedAt.isNull(),
    )
      .orderBy([
        (source) => source.position.asc(),
        (source) => source.createdAt.asc(),
      ])
      .all();
    const librarySources = await mapWithConcurrency(
      sources,
      CHECK_CONCURRENCY,
      (source) => this.sourceSummary(source),
    );
    const providers = await this.database.orm.MetadataProvider.orderBy([
      (provider) => provider.position.asc(),
      (provider) => provider.createdAt.asc(),
    ]).all();
    const metadataProviders: OverviewMetadataProviderResponse[] = providers.map(
      (provider) => ({
        id: provider.id,
        kind: provider.kind as OverviewMetadataProviderResponse["kind"],
        name: provider.name,
        status: providerStatus(provider, this.metadataRegistry),
      }),
    );
    const clients = await this.database.orm.DownloadClient.orderBy((client) =>
      client.createdAt.asc(),
    ).all();
    const downloadClients: OverviewDownloadClientResponse[] = clients.map(
      (client) => ({
        id: client.id,
        kind: "qbittorrent",
        name: client.name,
        address: safeHost(client.url) ?? "qBittorrent",
        destinationSourceId: client.destinationSourceId,
        status: "unknown",
      }),
    );
    const indexers = await this.database.orm.ReleaseIndexer.where((indexer) =>
      indexer.removedAt.isNull(),
    )
      .orderBy([
        (indexer) => indexer.position.asc(),
        (indexer) => indexer.createdAt.asc(),
      ])
      .all();
    const releaseIndexers: OverviewReleaseIndexerResponse[] = indexers.map(
      (indexer) => ({
        id: indexer.id,
        kind: "torznab",
        name: indexer.name?.trim() || safeHost(indexer.url) || "Torznab",
        address: safeHost(indexer.url) ?? "Torznab",
        downloadClientId: indexer.downloadClientId,
        status: "unknown",
      }),
    );
    const counts = await this.serviceCounts(userId);
    const response: OverviewResponse = {
      checkedAt: new Date().toISOString(),
      librarySources,
      metadataProviders,
      downloadClients,
      releaseIndexers,
      counts,
    };
    this.cached.set(userId, {
      expiresAt: now + this.cacheTtlMs,
      response,
    });
    return response;
  }
}
