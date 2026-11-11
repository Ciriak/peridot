import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ApplyTrackMetadataRequest,
  MetadataCandidateResponse,
  TrackMetadataMatchMode,
} from "@peridot/contracts";
import {
  normalizeArtistCredits,
  parseStoredArtistCredits,
  serializeArtistCredits,
} from "./artist-credits.js";
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
  candidateIdentity,
  type MetadataProviderContext,
  type MetadataResolver,
  type MetadataResolverRegistry,
  type MetadataTrackInput,
} from "./metadata-resolver.js";
import type {
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

export class MetadataEnrichmentError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
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
        track.album,
        track.discNumber,
        track.trackNumber,
      ]),
    )
    .digest("hex");
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
  return {
    ...candidate,
    externalTrackId: candidate.externalTrackId.trim(),
    externalReleaseId: candidate.externalReleaseId?.trim() || null,
    title: candidate.title.trim(),
    artist: candidate.artist.trim() || artists.join(", "),
    artists,
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
        throw new TaskExecutionError("No metadata providers are enabled.");
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
      await tasks.updateProgress(
        task.id,
        0,
        targets.length,
        metadataDetails({
          source: task.sourceName ?? "All sources",
          total: targets.length,
          processed: 0,
          matched: 0,
          unmatched: 0,
          errors: 0,
        }),
      );
      if (!targets.length) {
        return {
          details: metadataDetails({
            source: task.sourceName ?? "All sources",
            total: 0,
            processed: 0,
            matched: 0,
            unmatched: 0,
            errors: 0,
          }),
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
      const recordProgress = async () => {
        await tasks.updateProgress(
          task.id,
          processedCount,
          targets.length,
          metadataDetails({
            source: task.sourceName ?? "All sources",
            total: targets.length,
            processed: processedCount,
            matched: matchedCount,
            unmatched: unmatchedCount,
            errors: errorCount,
          }),
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
        }
        for (const track of unresolved) {
          if (failureSummary) {
            await recordError();
          } else {
            await recordNoMatch(track);
          }
        }
      }

      return {
        details: metadataDetails({
          source: task.sourceName ?? "All sources",
          total: targets.length,
          processed: processedCount,
          matched: matchedCount,
          unmatched: unmatchedCount,
          errors: errorCount,
        }),
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
      );
    }
  }

  async candidates(
    trackId: string,
    query?: string,
  ): Promise<MetadataCandidateResponse[]> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track || !track.available) {
      throw new MetadataEnrichmentError("Available track not found", 404);
    }
    const providers = await orderedMetadataProviders(this.database);
    if (!providers.length) {
      throw new MetadataEnrichmentError(
        "Enable a metadata provider before matching tracks.",
        409,
      );
    }
    if (query && query.trim().length > 200) {
      throw new MetadataEnrichmentError(
        "Enter a search term up to 200 characters.",
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
        );
      }
      throw firstError;
    }
    return [
      ...new Map(items.map((item) => [candidateIdentity(item), item])).values(),
    ];
  }

  async resetAll(): Promise<number> {
    return this.database.orm.Track.where((track) =>
      track.id.isNotNull(),
    ).updateAndCount({
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
      metadataAttemptedSignature: null,
    });
  }

  async apply(trackId: string, body: ApplyTrackMetadataRequest): Promise<void> {
    const track = await this.database.orm.Track.first({ id: trackId });
    if (!track) {
      throw new MetadataEnrichmentError("Track not found", 404);
    }
    const provider = await this.database.orm.MetadataProvider.first({
      id: body?.providerId ?? "",
      enabled: 1,
    });
    if (!provider) {
      throw new MetadataEnrichmentError(
        "The selected metadata provider is no longer available.",
        409,
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
      !Array.isArray(body.details)
    ) {
      throw new MetadataEnrichmentError("Choose a valid metadata match.");
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
      );
    }
    const artists = normalizeArtistCredits([
      ...body.artists.filter(
        (artist): artist is string => typeof artist === "string",
      ),
      body.artist,
    ]);
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
      throw new MetadataEnrichmentError("Choose a valid metadata match.");
    }
    await this.database.orm.Track.where({ id: track.id }).update({
      ...matchData(candidate, "manual"),
      metadataAttemptedSignature: inputSignature(track),
    });
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
    return true;
  }
}

export function effectiveArtistCredits(track: TrackRow): string[] {
  return parseStoredArtistCredits(
    track.metadataArtistCredits,
    track.metadataArtist ?? track.artist,
  );
}
