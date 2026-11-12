import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ApplyArtistMetadataRequest,
  ArtistMetadataCandidateResponse,
  ApplyTrackMetadataRequest,
  MessageDescriptor,
  MetadataCandidateResponse,
  TrackMetadataMatchMode,
} from "@peridot/contracts";
import {
  normalizeArtistCredits,
  normalizeOptionalArtistCredits,
  parseStoredArtistCredits,
  parseStoredOptionalArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import {
  normalizeMetadataDetails,
  parseStoredMetadataDetails,
  serializeMetadataDetails,
} from "./metadata-details.js";
import {
  orderedMetadataProviders,
  parseProviderConfiguration,
  providerContext,
} from "./metadata-providers.js";
import {
  artistCandidateIdentity,
  candidateIdentity,
  type ArtistMetadataProviderCandidate,
  type MetadataProviderContext,
  type MetadataResolver,
  type MetadataResolverRegistry,
  type MetadataTrackInput,
} from "./metadata-resolver.js";
import { message, normalizeMessageDescriptor } from "./messages.js";
import type {
  ArtistImageRow,
  CatalogArtistRow,
  MetadataProviderRow,
  TaskRow,
  TrackRow,
} from "./prisma/models.js";
import {
  metadataDetails,
  TaskExecutionError,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

export { parseStoredMetadataDetails };

const ARTIST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ARTIST_IMAGE_TIMEOUT_MS = 10_000;
const ARTIST_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class MetadataEnrichmentError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(message);
    this.name = "MetadataEnrichmentError";
  }
}

function trackInput(track: TrackRow): MetadataTrackInput {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    discNumber: track.discNumber,
    trackNumber: track.trackNumber,
    durationMs: track.durationMs,
  };
}

function inputSignature(track: TrackRow): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        track.title,
        track.artist,
        track.artistCredits,
        track.albumArtist,
        track.albumArtistCredits,
        track.album,
        track.discNumber,
        track.trackNumber,
      ]),
    )
    .digest("hex");
}

function normalizeArtistIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

function artistInputSignature(artist: Pick<CatalogArtistRow, "name">): string {
  return createHash("sha256")
    .update(normalizeArtistIdentity(artist.name))
    .digest("hex");
}

function publicArtistCandidate(
  candidate: ArtistMetadataProviderCandidate,
): ArtistMetadataCandidateResponse {
  return {
    providerId: candidate.providerId,
    providerKind: candidate.providerKind,
    providerName: candidate.providerName,
    externalArtistId: candidate.externalArtistId,
    name: candidate.name,
    disambiguation: candidate.disambiguation,
    score: candidate.score,
    sourceUrl: candidate.sourceUrl,
    portraitAvailable: candidate.portraitAvailable,
  };
}

function exactArtistCandidate(
  artist: CatalogArtistRow,
  candidates: readonly ArtistMetadataProviderCandidate[],
): ArtistMetadataProviderCandidate | null {
  const name = normalizeArtistIdentity(artist.name);
  const unique = [
    ...new Map(
      candidates
        .filter(
          (candidate) =>
            normalizeArtistIdentity(candidate.name) === name &&
            candidate.externalArtistId &&
            candidate.sourceUrl.startsWith("https://"),
        )
        .map((candidate) => [artistCandidateIdentity(candidate), candidate]),
    ).values(),
  ];
  return unique.length === 1 ? unique[0]! : null;
}

function allowedArtistImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !(hostname === "discogs.com" || hostname.endsWith(".discogs.com"))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function imageSignatureMatches(mimeType: string, data: Uint8Array): boolean {
  if (mimeType === "image/jpeg") {
    return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    );
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...data.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function readBoundedArtistImage(
  response: Response,
): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ARTIST_IMAGE_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

interface FolderAlbum {
  title: string;
  tracks: TrackRow[];
}

function folderKey(track: TrackRow): string {
  return `${track.sourceId ?? ""}\u0000${path.dirname(track.relativePath)}`;
}

function sourceFolderTitle(
  relativePath: string,
  sourcePath: string | undefined,
): string {
  const directory = path.dirname(relativePath);
  if (directory !== "." && directory !== "") {
    return path.basename(directory);
  }
  return path.basename(sourcePath ?? "") || "Unknown Album";
}

function folderAlbumTitle(
  tracks: readonly TrackRow[],
  fallback: string,
): string {
  const taggedAlbums = tracks
    .map((track) => track.album?.trim())
    .filter((album): album is string => Boolean(album));
  const firstAlbum = taggedAlbums[0];
  if (taggedAlbums.length !== tracks.length || !firstAlbum) return fallback;
  const normalizedFirst = firstAlbum.toLocaleLowerCase();
  return taggedAlbums.every(
    (album) => album.toLocaleLowerCase() === normalizedFirst,
  )
    ? firstAlbum
    : fallback;
}

function matchData(
  candidate: MetadataCandidateResponse,
  mode: TrackMetadataMatchMode,
) {
  const details = normalizeMetadataDetails(candidate.details);
  return {
    metadataMode: mode,
    metadataTitle: candidate.title,
    metadataArtist: candidate.artist,
    metadataArtistCredits: serializeArtistCredits(candidate.artists),
    metadataAlbumArtist: candidate.albumArtists.length
      ? candidate.albumArtists.join(", ")
      : null,
    metadataAlbumArtistCredits: candidate.albumArtists.length
      ? JSON.stringify(candidate.albumArtists)
      : null,
    metadataAlbum: candidate.album,
    metadataDiscNumber: candidate.discNumber,
    metadataTrackNumber: candidate.trackNumber,
    metadataProviderId: candidate.providerId,
    metadataProviderKind: candidate.providerKind,
    metadataProviderName: candidate.providerName,
    metadataExternalTrackId: candidate.externalTrackId,
    metadataExternalReleaseId: candidate.externalReleaseId,
    metadataSourceUrl: candidate.sourceUrl,
    metadataDetails: serializeMetadataDetails(details),
    metadataMatchedAt: new Date(),
  };
}

function validCandidate(candidate: MetadataCandidateResponse): boolean {
  return Boolean(
    candidate.providerId &&
    candidate.externalTrackId &&
    candidate.title.trim() &&
    candidate.artist.trim() &&
    candidate.artists.length &&
    candidate.sourceUrl.startsWith("https://"),
  );
}

function normalizeCandidate(
  candidate: MetadataCandidateResponse,
): MetadataCandidateResponse {
  const artists = normalizeArtistCredits([
    ...candidate.artists,
    candidate.artist,
  ]);
  const albumArtists = normalizeOptionalArtistCredits(candidate.albumArtists);
  return {
    ...candidate,
    externalTrackId: candidate.externalTrackId.trim(),
    externalReleaseId: candidate.externalReleaseId?.trim() || null,
    title: candidate.title.trim(),
    artist: candidate.artist.trim() || artists.join(", "),
    artists,
    albumArtists,
    album: candidate.album?.trim() || null,
    discNumber:
      Number.isInteger(candidate.discNumber) && candidate.discNumber! > 0
        ? candidate.discNumber
        : null,
    trackNumber:
      Number.isInteger(candidate.trackNumber) && candidate.trackNumber! > 0
        ? candidate.trackNumber
        : null,
    sourceUrl: candidate.sourceUrl,
    details: normalizeMetadataDetails(candidate.details),
  };
}

function providerIdentity(
  provider: MetadataProviderRow,
  resolver: MetadataResolver,
  credential: string | null,
): MetadataProviderContext {
  return {
    id: provider.id,
    kind: resolver.definition.kind,
    name: provider.name,
    configuration: resolver.normalizeConfiguration(
      parseProviderConfiguration(provider.configuration),
    ),
    credential,
  };
}

export class MetadataEnrichment {
  private readonly controller = new AbortController();

  constructor(
    private readonly database: Database,
    private readonly registry: MetadataResolverRegistry,
    private readonly credentials: CredentialStore,
    private readonly catalog?: CatalogService,
    private readonly portraitFetch: typeof fetch = fetch,
  ) {}

  close(): void {
    this.controller.abort();
  }

  async runTask(
    task: TaskRow,
    tasks: TaskService,
  ): Promise<TaskExecutionResult> {
    try {
      const providers = await orderedMetadataProviders(this.database);
      if (!providers.length) {
        throw new TaskExecutionError(
          "No metadata providers are enabled.",
          "failed",
          message("api.message.metadataProvidersDisabled"),
        );
      }

      const trackQuery = this.database.orm.Track.where({
        available: 1,
        metadataMode: "automatic",
      });
      const tracks = await (
        task.sourceId
          ? trackQuery.where({ sourceId: task.sourceId })
          : trackQuery
      ).all();
      const targets = task.forceRefresh
        ? tracks
        : tracks.filter(
            (track) =>
              track.metadataAttemptedSignature !== inputSignature(track),
          );
      const artistTargets = await this.artistTargets(task);
      let artistProcessedCount = 0;
      let artistMatchedCount = 0;
      let artistUnmatchedCount = 0;
      let artistErrorCount = 0;
      const artistCounts = () => ({
        total: artistTargets.length,
        processed: artistProcessedCount,
        matched: artistMatchedCount,
        unmatched: artistUnmatchedCount,
        errors: artistErrorCount,
      });
      await tasks.updateProgress(
        task.id,
        0,
        targets.length + artistTargets.length,
        metadataDetails(
          {
            source: task.sourceName ?? "All sources",
            total: targets.length,
            processed: 0,
            matched: 0,
            unmatched: 0,
            errors: 0,
          },
          null,
          artistCounts(),
        ),
      );
      if (!targets.length && !artistTargets.length) {
        return {
          details: metadataDetails(
            {
              source: task.sourceName ?? "All sources",
              total: 0,
              processed: 0,
              matched: 0,
              unmatched: 0,
              errors: 0,
            },
            null,
            artistCounts(),
          ),
        };
      }

      const sourcePaths = new Map(
        (
          await this.database.orm.Source.where((source) =>
            source.id.in([
              ...new Set(
                targets.flatMap(({ sourceId }) => (sourceId ? [sourceId] : [])),
              ),
            ]),
          )
            .select("id", "path")
            .all()
        ).map((source) => [source.id, source.path ?? undefined]),
      );
      const groups = new Map<string, FolderAlbum>();
      for (const track of targets) {
        const key = folderKey(track);
        const group = groups.get(key) ?? {
          title: sourceFolderTitle(
            track.relativePath,
            sourcePaths.get(track.sourceId ?? ""),
          ),
          tracks: [],
        };
        group.tracks.push(track);
        groups.set(key, group);
      }

      let processedCount = 0;
      let matchedCount = 0;
      let unmatchedCount = 0;
      let errorCount = 0;
      let failureSummary: string | null = null;
      let activeProviderId: string | null = null;
      const recordProgress = async () => {
        await tasks.updateProgress(
          task.id,
          processedCount + artistProcessedCount,
          targets.length + artistTargets.length,
          metadataDetails(
            {
              source: task.sourceName ?? "All sources",
              total: targets.length,
              processed: processedCount,
              matched: matchedCount,
              unmatched: unmatchedCount,
              errors: errorCount,
            },
            activeProviderId,
            artistCounts(),
          ),
        );
      };

      const applyAutomatic = async (
        track: TrackRow,
        candidate: MetadataCandidateResponse,
      ) => {
        await this.database.orm.Track.where({ id: track.id }).update({
          ...matchData(candidate, "automatic"),
          metadataAttemptedSignature: inputSignature(track),
        });
        await this.catalog?.reindexTrack(track.id, "metadata");
        matchedCount += 1;
        processedCount += 1;
        await recordProgress();
      };

      const recordNoMatch = async (track: TrackRow) => {
        await this.database.orm.Track.where({ id: track.id }).update({
          metadataAttemptedSignature: inputSignature(track),
        });
        unmatchedCount += 1;
        processedCount += 1;
        await recordProgress();
      };

      const recordError = async () => {
        errorCount += 1;
        processedCount += 1;
        await recordProgress();
      };

      for (const group of groups.values()) {
        const album = folderAlbumTitle(group.tracks, group.title);
        let unresolved = [...group.tracks];
        for (const provider of providers) {
          if (!unresolved.length) break;
          activeProviderId = provider.id;
          await recordProgress();
          try {
            const resolver = this.registry.require(provider.kind);
            const context = await providerContext(
              provider,
              resolver,
              this.credentials,
            );
            const candidates = await resolver.findAlbumMatches(
              context,
              unresolved.map((track) => ({
                ...trackInput(track),
                album,
              })),
              this.controller.signal,
            );
            const nextUnresolved: TrackRow[] = [];
            for (const track of unresolved) {
              const input = trackInput(track);
              const items = (candidates.get(track.id) ?? [])
                .map(normalizeCandidate)
                .filter(validCandidate);
              const result = resolver.automaticMatch(input, items);
              if (result.status === "matched") {
                await applyAutomatic(track, result.candidate);
              } else {
                nextUnresolved.push(track);
              }
            }
            unresolved = nextUnresolved;
          } catch (error) {
            if (this.controller.signal.aborted) throw error;
            failureSummary =
              error instanceof Error
                ? error.message
                : `${provider.name} metadata matching failed.`;
          }
          activeProviderId = null;
          await recordProgress();
        }
        for (const track of unresolved) {
          if (failureSummary) {
            await recordError();
          } else {
            await recordNoMatch(track);
          }
        }
      }

      for (const artist of artistTargets) {
        let nameCandidate: ArtistMetadataProviderCandidate | null = null;
        let portraitCandidate: ArtistMetadataProviderCandidate | null = null;
        let hadProviderError = false;
        for (const provider of providers) {
          activeProviderId = provider.id;
          await recordProgress();
          try {
            const resolver = this.registry.require(provider.kind);
            const context = await providerContext(
              provider,
              resolver,
              this.credentials,
            );
            const candidates = await resolver.findArtistCandidates(
              context,
              artist.name,
              undefined,
              this.controller.signal,
            );
            const exact = exactArtistCandidate(artist, candidates);
            nameCandidate ??= exact;
            if (exact?.imageUrl) portraitCandidate ??= exact;
          } catch (error) {
            if (this.controller.signal.aborted) throw error;
            hadProviderError = true;
            failureSummary =
              error instanceof Error
                ? error.message
                : `${provider.name} artist metadata matching failed.`;
          }
          activeProviderId = null;
          await recordProgress();
        }
        nameCandidate ??= portraitCandidate;
        if (!nameCandidate) {
          await this.noteArtistAttempt(artist);
          if (hadProviderError) artistErrorCount += 1;
          else artistUnmatchedCount += 1;
        } else {
          let image: ArtistImageRow | null = null;
          if (portraitCandidate?.imageUrl) {
            try {
              image = await this.cacheArtistImage(portraitCandidate);
            } catch (error) {
              if (this.controller.signal.aborted) throw error;
              artistErrorCount += 1;
              failureSummary =
                error instanceof Error
                  ? error.message
                  : `${portraitCandidate.providerName} portrait caching failed.`;
            }
          }
          await this.setArtistMetadata(
            artist,
            nameCandidate,
            image ? portraitCandidate : null,
            image,
            "automatic",
          );
          await this.catalog?.refreshArtistMetadata(artist.id);
          artistMatchedCount += 1;
        }
        artistProcessedCount += 1;
        await recordProgress();
      }

      await this.removeUnusedArtistImages();
      await this.catalog?.flushChanges();
      return {
        details: metadataDetails(
          {
            source: task.sourceName ?? "All sources",
            total: targets.length,
            processed: processedCount,
            matched: matchedCount,
            unmatched: unmatchedCount,
            errors: errorCount,
          },
          null,
          artistCounts(),
        ),
        failureSummary,
      };
    } catch (error) {
      const interrupted = this.controller.signal.aborted;
      if (error instanceof TaskExecutionError) throw error;
      throw new TaskExecutionError(
        interrupted
          ? "Metadata matching was interrupted by server shutdown."
          : "Metadata matching could not be completed.",
        interrupted ? "interrupted" : "failed",
        message(
          interrupted
            ? "api.message.metadataInterrupted"
            : "api.message.metadataFailed",
        ),
      );
    }
  }

  async candidates(
    trackId: string,
    query?: string,
  ): Promise<MetadataCandidateResponse[]> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track || !track.available) {
      throw new MetadataEnrichmentError(
        "Available track not found",
        404,
        message("api.message.metadataTrackUnavailable"),
      );
    }
    const providers = await orderedMetadataProviders(this.database);
    if (!providers.length) {
      throw new MetadataEnrichmentError(
        "Enable a metadata provider before matching tracks.",
        409,
        message("api.message.metadataNoProviderEnabled"),
      );
    }
    if (query && query.trim().length > 200) {
      throw new MetadataEnrichmentError(
        "Enter a search term up to 200 characters.",
        400,
        message("api.message.invalidSearch"),
      );
    }
    const items: MetadataCandidateResponse[] = [];
    let firstError: unknown = null;
    for (const provider of providers) {
      try {
        const resolver = this.registry.require(provider.kind);
        const context = await providerContext(
          provider,
          resolver,
          this.credentials,
        );
        const candidates = await resolver.findCandidates(
          context,
          trackInput(track),
          query?.trim() || undefined,
          this.controller.signal,
        );
        items.push(
          ...candidates.map(normalizeCandidate).filter(validCandidate),
        );
      } catch (error) {
        firstError ??= error;
      }
    }
    if (!items.length && firstError) {
      if (firstError instanceof Error) {
        throw new MetadataEnrichmentError(
          firstError.message,
          "statusCode" in firstError &&
            typeof firstError.statusCode === "number"
            ? firstError.statusCode
            : 502,
          "messageDescriptor" in firstError
            ? (normalizeMessageDescriptor(firstError.messageDescriptor) ??
                message("api.message.providerUnavailable"))
            : message("api.message.providerUnavailable"),
        );
      }
      throw firstError;
    }
    return [
      ...new Map(items.map((item) => [candidateIdentity(item), item])).values(),
    ];
  }

  async artistCandidates(
    artistId: string,
    query?: string,
  ): Promise<ArtistMetadataCandidateResponse[]> {
    const artist = await this.database.orm.CatalogArtist.first({
      id: artistId,
    });
    if (!artist || artist.trackCount < 1) {
      throw new MetadataEnrichmentError(
        "Artist not found",
        404,
        message("api.message.artistNotFound"),
      );
    }
    const providers = await orderedMetadataProviders(this.database);
    if (!providers.length) {
      throw new MetadataEnrichmentError(
        "Enable a metadata provider before matching artists.",
        409,
        message("api.message.metadataNoProviderEnabled"),
      );
    }
    if (query && query.trim().length > 200) {
      throw new MetadataEnrichmentError(
        "Enter a search term up to 200 characters.",
        400,
        message("api.message.invalidSearch"),
      );
    }
    const items: ArtistMetadataProviderCandidate[] = [];
    let firstError: unknown = null;
    for (const provider of providers) {
      try {
        const resolver = this.registry.require(provider.kind);
        const context = await providerContext(
          provider,
          resolver,
          this.credentials,
        );
        const candidates = await resolver.findArtistCandidates(
          context,
          artist.name,
          query?.trim() || undefined,
          this.controller.signal,
        );
        items.push(
          ...candidates.filter(
            (candidate) =>
              candidate.externalArtistId.trim() &&
              candidate.name.trim() &&
              candidate.sourceUrl.startsWith("https://"),
          ),
        );
      } catch (error) {
        firstError ??= error;
      }
    }
    if (!items.length && firstError) {
      if (firstError instanceof Error) {
        throw new MetadataEnrichmentError(
          firstError.message,
          "statusCode" in firstError &&
            typeof firstError.statusCode === "number"
            ? firstError.statusCode
            : 502,
          "messageDescriptor" in firstError
            ? (normalizeMessageDescriptor(firstError.messageDescriptor) ??
                message("api.message.providerUnavailable"))
            : message("api.message.providerUnavailable"),
        );
      }
      throw firstError;
    }
    return [
      ...new Map(
        items.map((item) => [artistCandidateIdentity(item), item]),
      ).values(),
    ]
      .sort((left, right) => right.score - left.score)
      .map(publicArtistCandidate);
  }

  async applyArtist(
    artistId: string,
    body: ApplyArtistMetadataRequest,
  ): Promise<void> {
    const artist = await this.database.orm.CatalogArtist.first({
      id: artistId,
    });
    if (!artist || artist.trackCount < 1) {
      throw new MetadataEnrichmentError(
        "Artist not found",
        404,
        message("api.message.artistNotFound"),
      );
    }
    if (
      !body ||
      typeof body.providerId !== "string" ||
      !body.providerId.trim() ||
      typeof body.externalArtistId !== "string" ||
      !body.externalArtistId.trim() ||
      typeof body.name !== "string" ||
      !body.name.trim()
    ) {
      throw new MetadataEnrichmentError(
        "Choose a valid artist metadata match.",
        400,
        message("api.message.invalidMetadataMatch"),
      );
    }
    const provider = await this.database.orm.MetadataProvider.first({
      id: body.providerId,
      enabled: 1,
    });
    if (!provider) {
      throw new MetadataEnrichmentError(
        "The selected metadata provider is no longer available.",
        409,
        message("api.message.metadataProviderNotFound"),
      );
    }
    let resolver: MetadataResolver;
    let context: MetadataProviderContext;
    try {
      resolver = this.registry.require(provider.kind);
      const credential = provider.credentialCiphertext
        ? this.credentials.decrypt(provider.credentialCiphertext)
        : null;
      context = providerIdentity(provider, resolver, credential);
    } catch (error) {
      throw new MetadataEnrichmentError(
        error instanceof Error ? error.message : "Provider is unavailable.",
        409,
        normalizeMessageDescriptor(
          (error as { messageDescriptor?: unknown } | null)?.messageDescriptor,
        ) ?? message("api.message.providerUnavailable"),
      );
    }
    const candidate = await resolver.resolveArtistCandidate(
      context,
      body.externalArtistId.trim(),
      this.controller.signal,
    );
    if (!candidate) {
      throw new MetadataEnrichmentError(
        "The selected artist metadata match is no longer available.",
        404,
        message("api.message.invalidMetadataMatch"),
      );
    }
    const image = candidate.imageUrl
      ? await this.cacheArtistImage(candidate)
      : null;
    await this.setArtistMetadata(artist, candidate, candidate, image, "manual");
    await this.catalog?.refreshArtistMetadata(artist.id);
    await this.catalog?.flushChanges();
    await this.removeUnusedArtistImages();
  }

  async revertArtist(artistId: string): Promise<boolean> {
    const artist = await this.database.orm.CatalogArtist.first({
      id: artistId,
    });
    if (!artist) return false;
    const previous = await this.database.orm.ArtistMetadata.first({
      artistId,
    });
    const values = {
      displayName: artist.name,
      metadataMode: "file",
      nameProviderId: null,
      nameProviderKind: null,
      nameProviderName: null,
      externalArtistId: null,
      nameSourceUrl: null,
      imageId: null,
      imageProviderId: null,
      imageProviderKind: null,
      imageProviderName: null,
      imageExternalArtistId: null,
      imageSourceUrl: null,
      matchedAt: null,
      attemptedSignature: artistInputSignature(artist),
    };
    if (previous) {
      await this.database.orm.ArtistMetadata.where({
        artistId,
      }).update(values);
    } else {
      await this.database.orm.ArtistMetadata.create({ artistId, ...values });
    }
    await this.catalog?.refreshArtistMetadata(artist.id);
    await this.catalog?.flushChanges();
    await this.removeUnusedArtistImages();
    return true;
  }

  async resetAllArtists(): Promise<number> {
    const artists = await this.database.orm.CatalogArtist.where((artist) =>
      artist.trackCount.gt(0),
    ).all();
    let changed = 0;
    for (const artist of artists) {
      const previous = await this.database.orm.ArtistMetadata.first({
        artistId: artist.id,
      });
      if (
        previous &&
        previous.metadataMode !== "file" &&
        (previous.nameProviderId || previous.imageId)
      ) {
        changed += 1;
      }
      const values = {
        displayName: artist.name,
        metadataMode: "file",
        nameProviderId: null,
        nameProviderKind: null,
        nameProviderName: null,
        externalArtistId: null,
        nameSourceUrl: null,
        imageId: null,
        imageProviderId: null,
        imageProviderKind: null,
        imageProviderName: null,
        imageExternalArtistId: null,
        imageSourceUrl: null,
        matchedAt: null,
        attemptedSignature: artistInputSignature(artist),
      };
      if (previous) {
        await this.database.orm.ArtistMetadata.where({
          artistId: artist.id,
        }).update(values);
      } else {
        await this.database.orm.ArtistMetadata.create({
          artistId: artist.id,
          ...values,
        });
      }
    }
    await this.removeUnusedArtistImages();
    return changed;
  }

  async resetAll(): Promise<number> {
    const count = await this.database.orm.Track.where((track) =>
      track.id.isNotNull(),
    ).updateAndCount({
      metadataMode: "file",
      metadataTitle: null,
      metadataArtist: null,
      metadataArtistCredits: null,
      metadataAlbumArtist: null,
      metadataAlbumArtistCredits: null,
      metadataAlbum: null,
      metadataDiscNumber: null,
      metadataTrackNumber: null,
      metadataProviderId: null,
      metadataProviderKind: null,
      metadataProviderName: null,
      metadataExternalTrackId: null,
      metadataExternalReleaseId: null,
      metadataSourceUrl: null,
      metadataDetails: null,
      metadataMatchedAt: null,
      metadataAttemptedSignature: null,
    });
    await this.catalog?.rebuildAll("reset");
    return count;
  }

  async apply(trackId: string, body: ApplyTrackMetadataRequest): Promise<void> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track) {
      throw new MetadataEnrichmentError(
        "Track not found",
        404,
        message("api.message.trackNotFound"),
      );
    }
    const provider = await this.database.orm.MetadataProvider.first({
      id: body?.providerId ?? "",
      enabled: 1,
    });
    if (!provider) {
      throw new MetadataEnrichmentError(
        "The selected metadata provider is no longer available.",
        409,
        message("api.message.metadataProviderNotFound"),
      );
    }
    if (
      !body ||
      typeof body.externalTrackId !== "string" ||
      !body.externalTrackId.trim() ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      typeof body.artist !== "string" ||
      !body.artist.trim() ||
      !Array.isArray(body.artists) ||
      !Array.isArray(body.albumArtists) ||
      !Array.isArray(body.details)
    ) {
      throw new MetadataEnrichmentError(
        "Choose a valid metadata match.",
        400,
        message("api.message.invalidMetadataMatch"),
      );
    }
    let resolver: MetadataResolver;
    let context: MetadataProviderContext;
    try {
      resolver = this.registry.require(provider.kind);
      const credential = provider.credentialCiphertext
        ? this.credentials.decrypt(provider.credentialCiphertext)
        : null;
      context = providerIdentity(provider, resolver, credential);
    } catch (error) {
      throw new MetadataEnrichmentError(
        error instanceof Error ? error.message : "Provider is unavailable.",
        409,
        normalizeMessageDescriptor(
          (error as { messageDescriptor?: unknown } | null)?.messageDescriptor,
        ) ?? message("api.message.providerUnavailable"),
      );
    }
    const artists = normalizeArtistCredits([
      ...body.artists.filter(
        (artist): artist is string => typeof artist === "string",
      ),
      body.artist,
    ]);
    const albumArtists = normalizeOptionalArtistCredits(
      body.albumArtists.filter(
        (artist): artist is string => typeof artist === "string",
      ),
    );
    const externalReleaseId =
      typeof body.externalReleaseId === "string"
        ? body.externalReleaseId.trim() || null
        : null;
    const candidate = normalizeCandidate({
      providerId: context.id,
      providerKind: context.kind,
      providerName: context.name,
      externalTrackId: body.externalTrackId,
      externalReleaseId,
      title: body.title,
      artist: body.artist,
      artists,
      albumArtists,
      album: typeof body.album === "string" ? body.album : null,
      discNumber: body.discNumber,
      trackNumber: body.trackNumber,
      durationMs: track.durationMs,
      score: 100,
      sourceUrl: resolver.sourceUrl(
        body.externalTrackId.trim(),
        externalReleaseId,
      ),
      details: body.details,
    });
    if (!validCandidate(candidate)) {
      throw new MetadataEnrichmentError(
        "Choose a valid metadata match.",
        400,
        message("api.message.invalidMetadataMatch"),
      );
    }
    await this.database.orm.Track.where({ id: track.id }).update({
      ...matchData(candidate, "manual"),
      metadataAttemptedSignature: inputSignature(track),
    });
    await this.catalog?.reindexTrack(track.id, "metadata");
    await this.catalog?.flushChanges();
  }

  async revert(trackId: string): Promise<boolean> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track) return false;
    await this.database.orm.Track.where({ id: track.id }).update({
      metadataMode: "file",
      metadataTitle: null,
      metadataArtist: null,
      metadataArtistCredits: null,
      metadataAlbum: null,
      metadataDiscNumber: null,
      metadataTrackNumber: null,
      metadataProviderId: null,
      metadataProviderKind: null,
      metadataProviderName: null,
      metadataExternalTrackId: null,
      metadataExternalReleaseId: null,
      metadataSourceUrl: null,
      metadataDetails: null,
      metadataMatchedAt: null,
      metadataAttemptedSignature: inputSignature(track),
    });
    await this.catalog?.reindexTrack(track.id, "metadata");
    await this.catalog?.flushChanges();
    return true;
  }

  private async artistTargets(task: TaskRow): Promise<CatalogArtistRow[]> {
    let artists = await this.database.orm.CatalogArtist.where((artist) =>
      artist.trackCount.gt(0),
    ).all();
    if (task.sourceId) {
      const sourceTracks = await this.database.orm.Track.where({
        sourceId: task.sourceId,
        available: 1,
      })
        .select("id")
        .all();
      if (!sourceTracks.length) return [];
      const links = await this.database.orm.CatalogTrackArtist.where((link) =>
        link.trackId.in(sourceTracks.map((track) => track.id)),
      )
        .select("artistId")
        .all();
      const artistIds = [...new Set(links.map((link) => link.artistId))];
      artists = artistIds.length
        ? await this.database.orm.CatalogArtist.where((artist) =>
            artist.id.in(artistIds),
          ).all()
        : [];
    }
    const metadata = await this.database.orm.ArtistMetadata.where((row) =>
      row.artistId.isNotNull(),
    ).all();
    const byArtistId = new Map(metadata.map((row) => [row.artistId, row]));
    return artists.filter((artist) => {
      const current = byArtistId.get(artist.id);
      if (
        current?.metadataMode === "manual" ||
        current?.metadataMode === "file"
      ) {
        return false;
      }
      return (
        Boolean(task.forceRefresh) ||
        current?.attemptedSignature !== artistInputSignature(artist)
      );
    });
  }

  private async cacheArtistImage(
    candidate: ArtistMetadataProviderCandidate,
  ): Promise<ArtistImageRow> {
    const imageUrl = candidate.imageUrl
      ? allowedArtistImageUrl(candidate.imageUrl)
      : null;
    if (!imageUrl) {
      throw new MetadataEnrichmentError(
        "The artist portrait URL is not allowed.",
        502,
        message("api.message.providerUnavailable"),
      );
    }
    const timeout = AbortSignal.timeout(ARTIST_IMAGE_TIMEOUT_MS);
    const signal = AbortSignal.any([this.controller.signal, timeout]);
    const response = await this.portraitFetch(imageUrl, {
      headers: { Accept: "image/jpeg,image/png,image/webp" },
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      throw new MetadataEnrichmentError(
        "The artist portrait could not be downloaded.",
        502,
        message("api.message.providerUnavailable"),
      );
    }
    const mimeType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLocaleLowerCase();
    if (!ARTIST_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new MetadataEnrichmentError(
        "The artist portrait format is not supported.",
        502,
        message("api.message.providerUnavailable"),
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > ARTIST_IMAGE_MAX_BYTES
    ) {
      throw new MetadataEnrichmentError(
        "The artist portrait is too large.",
        502,
        message("api.message.providerUnavailable"),
      );
    }
    const data = await readBoundedArtistImage(response);
    if (!data?.byteLength || !imageSignatureMatches(mimeType, data)) {
      throw new MetadataEnrichmentError(
        "The artist portrait is invalid.",
        502,
        message("api.message.providerUnavailable"),
      );
    }
    const hash = createHash("sha256").update(data).digest("hex");
    const existing = await this.database.orm.ArtistImage.first({ hash });
    if (existing) return existing;
    return this.database.orm.ArtistImage.create({
      hash,
      mimeType,
      data,
      sourceUrl: imageUrl.toString(),
    });
  }

  private async setArtistMetadata(
    artist: CatalogArtistRow,
    nameCandidate: ArtistMetadataProviderCandidate,
    portraitCandidate: ArtistMetadataProviderCandidate | null,
    image: ArtistImageRow | null,
    mode: "automatic" | "manual",
  ) {
    const values = {
      displayName: nameCandidate.name.trim(),
      metadataMode: mode,
      nameProviderId: nameCandidate.providerId,
      nameProviderKind: nameCandidate.providerKind,
      nameProviderName: nameCandidate.providerName,
      externalArtistId: nameCandidate.externalArtistId,
      nameSourceUrl: nameCandidate.sourceUrl,
      imageId: image?.id ?? null,
      imageProviderId:
        image && portraitCandidate ? portraitCandidate.providerId : null,
      imageProviderKind:
        image && portraitCandidate ? portraitCandidate.providerKind : null,
      imageProviderName:
        image && portraitCandidate ? portraitCandidate.providerName : null,
      imageExternalArtistId:
        image && portraitCandidate ? portraitCandidate.externalArtistId : null,
      imageSourceUrl:
        image && portraitCandidate ? portraitCandidate.sourceUrl : null,
      matchedAt: new Date(),
      attemptedSignature: artistInputSignature(artist),
    };
    const existing = await this.database.orm.ArtistMetadata.first({
      artistId: artist.id,
    });
    if (existing) {
      await this.database.orm.ArtistMetadata.where({
        artistId: artist.id,
      }).update(values);
    } else {
      await this.database.orm.ArtistMetadata.create({
        artistId: artist.id,
        ...values,
      });
    }
  }

  private async noteArtistAttempt(artist: CatalogArtistRow) {
    const values = {
      displayName: artist.displayName,
      metadataMode: "automatic",
      attemptedSignature: artistInputSignature(artist),
    };
    const existing = await this.database.orm.ArtistMetadata.first({
      artistId: artist.id,
    });
    if (existing) {
      await this.database.orm.ArtistMetadata.where({
        artistId: artist.id,
      }).update(values);
    } else {
      await this.database.orm.ArtistMetadata.create({
        artistId: artist.id,
        ...values,
      });
    }
  }

  private async removeUnusedArtistImages(): Promise<void> {
    const artists = await this.database.orm.CatalogArtist.where((artist) =>
      artist.id.isNotNull(),
    )
      .select("id")
      .all();
    const artistIds = new Set(artists.map((artist) => artist.id));
    const allMetadata = await this.database.orm.ArtistMetadata.where((row) =>
      row.artistId.isNotNull(),
    ).all();
    for (const row of allMetadata) {
      if (!artistIds.has(row.artistId)) {
        await this.database.orm.ArtistMetadata.where({
          artistId: row.artistId,
        }).delete();
      }
    }
    const metadata = await this.database.orm.ArtistMetadata.where((row) =>
      row.imageId.isNotNull(),
    ).all();
    const referenced = new Set(
      metadata.flatMap((row) => (row.imageId ? [row.imageId] : [])),
    );
    const images = await this.database.orm.ArtistImage.where((image) =>
      image.id.isNotNull(),
    ).all();
    for (const image of images) {
      if (!referenced.has(image.id)) {
        await this.database.orm.ArtistImage.where({ id: image.id }).delete();
      }
    }
  }
}

export function effectiveArtistCredits(track: TrackRow): string[] {
  return parseStoredArtistCredits(
    track.metadataArtistCredits,
    track.metadataArtist ?? track.artist,
  );
}

export function effectiveAlbumArtistCredits(track: TrackRow): string[] {
  return parseStoredOptionalArtistCredits(
    track.metadataAlbumArtistCredits ?? track.albumArtistCredits,
    track.metadataAlbumArtist ?? track.albumArtist,
  );
}
