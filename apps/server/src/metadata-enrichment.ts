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
import type { Database } from "./database.js";
import type { Track } from "./generated/prisma/client.js";
import { orderedMetadataProviders } from "./metadata-providers.js";
import {
  MusicBrainzClient,
  MusicBrainzError,
  type MetadataTrackInput,
} from "./musicbrainz.js";

export class MetadataEnrichmentError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "MetadataEnrichmentError";
  }
}

function trackInput(track: Track): MetadataTrackInput {
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

function inputSignature(track: Track): string {
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
  tracks: Track[];
}

function folderKey(track: Track): string {
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

function folderAlbumTitle(tracks: readonly Track[], fallback: string): string {
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
): {
  metadataMode: string;
  metadataTitle: string;
  metadataArtist: string;
  metadataArtistCredits: string;
  metadataAlbum: string | null;
  metadataDiscNumber: number | null;
  metadataTrackNumber: number | null;
  metadataProviderId: string;
  metadataProviderKind: string;
  metadataProviderName: string;
  metadataRecordingId: string;
  metadataReleaseId: string | null;
  metadataMatchedAt: Date;
} {
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
    metadataRecordingId: candidate.recordingId,
    metadataReleaseId: candidate.releaseId,
    metadataMatchedAt: new Date(),
  };
}

function validCandidate(candidate: MetadataCandidateResponse): boolean {
  return Boolean(
    candidate.providerId &&
    candidate.recordingId &&
    candidate.title.trim() &&
    candidate.artist.trim() &&
    candidate.artists.length,
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
  };
}

export class MetadataEnrichment {
  private readonly controller = new AbortController();

  constructor(
    private readonly database: Database,
    private readonly client = new MusicBrainzClient(),
  ) {}

  close(): void {
    this.controller.abort();
  }

  async runScan(
    scanId: string,
    sourceId?: string,
    force = false,
  ): Promise<void> {
    try {
      const providers = await orderedMetadataProviders(this.database);
      if (!providers.length) {
        await this.database.libraryScan.update({
          where: { id: scanId },
          data: {
            metadataStatus: "skipped",
            metadataFailureSummary: "No metadata providers are configured.",
          },
        });
        return;
      }

      await this.database.libraryScan.update({
        where: { id: scanId },
        data: { metadataStatus: "running" },
      });
      const tracks = await this.database.track.findMany({
        where: {
          available: true,
          metadataMode: "automatic",
          ...(sourceId ? { sourceId } : {}),
        },
      });
      const targets = force
        ? tracks
        : tracks.filter(
            (track) =>
              track.metadataAttemptedSignature !== inputSignature(track),
          );
      await this.database.libraryScan.update({
        where: { id: scanId },
        data: {
          metadataTotalCount: targets.length,
          metadataProcessedCount: 0,
          metadataMatchedCount: 0,
          metadataUnmatchedCount: 0,
          metadataErrorCount: 0,
        },
      });
      if (!targets.length) {
        await this.database.libraryScan.update({
          where: { id: scanId },
          data: { metadataStatus: "completed" },
        });
        return;
      }

      const sourcePaths = new Map(
        (
          await this.database.source.findMany({
            where: {
              id: {
                in: [
                  ...new Set(
                    targets.flatMap(({ sourceId }) =>
                      sourceId ? [sourceId] : [],
                    ),
                  ),
                ],
              },
            },
            select: { id: true, path: true },
          })
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
      const recordProgress = async () => {
        await this.database.libraryScan.update({
          where: { id: scanId },
          data: {
            metadataProcessedCount: processedCount,
            metadataMatchedCount: matchedCount,
            metadataUnmatchedCount: unmatchedCount,
            metadataErrorCount: errorCount,
          },
        });
      };

      const applyAutomatic = async (
        track: Track,
        candidate: MetadataCandidateResponse,
      ) => {
        await this.database.track.update({
          where: { id: track.id },
          data: {
            ...matchData(candidate, "automatic"),
            metadataAttemptedSignature: inputSignature(track),
          },
        });
        matchedCount += 1;
        processedCount += 1;
        await recordProgress();
      };

      const recordNoMatch = async (track: Track) => {
        await this.database.track.update({
          where: { id: track.id },
          data: { metadataAttemptedSignature: inputSignature(track) },
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
            const candidates = await this.client.findAlbumMatches(
              provider,
              unresolved.map((track) => ({
                ...trackInput(track),
                album,
              })),
              this.controller.signal,
            );
            const nextUnresolved: Track[] = [];
            for (const track of unresolved) {
              const candidate = candidates.get(track.id);
              if (
                candidate &&
                validCandidate(candidate) &&
                this.client.isExactMatch(trackInput(track), candidate)
              ) {
                await applyAutomatic(track, normalizeCandidate(candidate));
              } else {
                nextUnresolved.push(track);
              }
            }
            unresolved = nextUnresolved;
          } catch (error) {
            if (this.controller.signal.aborted) throw error;
            if (!(error instanceof MusicBrainzError)) throw error;
            for (let index = 0; index < unresolved.length; index += 1) {
              await recordError();
            }
            await this.database.libraryScan.update({
              where: { id: scanId },
              data: { metadataFailureSummary: error.message },
            });
            unresolved = [];
          }
        }
        for (const track of unresolved) await recordNoMatch(track);
      }

      await this.database.libraryScan.update({
        where: { id: scanId },
        data: {
          metadataStatus: "completed",
          metadataProcessedCount: processedCount,
          metadataMatchedCount: matchedCount,
          metadataUnmatchedCount: unmatchedCount,
          metadataErrorCount: errorCount,
        },
      });
    } catch {
      const interrupted = this.controller.signal.aborted;
      await this.database.libraryScan
        .update({
          where: { id: scanId },
          data: {
            metadataStatus: interrupted ? "interrupted" : "failed",
            metadataFailureSummary: interrupted
              ? "Metadata matching was interrupted by server shutdown."
              : "Metadata matching could not be completed.",
          },
        })
        .catch(() => undefined);
    }
  }

  async candidates(
    trackId: string,
    query?: string,
  ): Promise<MetadataCandidateResponse[]> {
    const track = await this.database.track.findUnique({
      where: { id: trackId },
    });
    if (!track || !track.available) {
      throw new MetadataEnrichmentError("Available track not found", 404);
    }
    const providers = await orderedMetadataProviders(this.database);
    if (!providers.length) {
      throw new MetadataEnrichmentError(
        "Configure a metadata provider before matching tracks.",
        409,
      );
    }
    if (query && query.trim().length > 200) {
      throw new MetadataEnrichmentError(
        "Enter a search term up to 200 characters.",
      );
    }
    try {
      for (const provider of providers) {
        const items = await this.client.findCandidates(
          provider,
          trackInput(track),
          query?.trim() || undefined,
          this.controller.signal,
        );
        if (items.length) return items.map(normalizeCandidate);
      }
      return [];
    } catch (error) {
      if (error instanceof MusicBrainzError) {
        throw new MetadataEnrichmentError(error.message, 502);
      }
      throw error;
    }
  }

  async resetAll(): Promise<number> {
    const result = await this.database.track.updateMany({
      data: {
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
        metadataRecordingId: null,
        metadataReleaseId: null,
        metadataMatchedAt: null,
        metadataAttemptedSignature: null,
      },
    });
    return result.count;
  }

  async apply(trackId: string, body: ApplyTrackMetadataRequest): Promise<void> {
    const track = await this.database.track.findUnique({
      where: { id: trackId },
    });
    if (!track) {
      throw new MetadataEnrichmentError("Track not found", 404);
    }
    const provider = await this.database.metadataProvider.findUnique({
      where: { id: body?.providerId },
    });
    if (!provider) {
      throw new MetadataEnrichmentError(
        "The selected metadata provider is no longer configured.",
        409,
      );
    }
    if (
      !body ||
      typeof body.recordingId !== "string" ||
      !body.recordingId.trim() ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      typeof body.artist !== "string" ||
      !body.artist.trim() ||
      !Array.isArray(body.artists)
    ) {
      throw new MetadataEnrichmentError("Choose a valid metadata match.");
    }
    const artists = normalizeArtistCredits([
      ...body.artists.filter(
        (artist): artist is string => typeof artist === "string",
      ),
      body.artist,
    ]);
    const candidate = normalizeCandidate({
      providerId: provider.id,
      providerKind: "musicbrainz",
      providerName: provider.name,
      recordingId: body.recordingId.trim(),
      releaseId: typeof body.releaseId === "string" ? body.releaseId : null,
      title: body.title,
      artist: body.artist,
      artists,
      album: typeof body.album === "string" ? body.album : null,
      discNumber: body.discNumber,
      trackNumber: body.trackNumber,
      durationMs: track.durationMs,
      score: 100,
    });
    if (!validCandidate(candidate)) {
      throw new MetadataEnrichmentError("Choose a valid metadata match.");
    }
    await this.database.track.update({
      where: { id: track.id },
      data: {
        ...matchData(candidate, "manual"),
        metadataAttemptedSignature: inputSignature(track),
      },
    });
  }

  async revert(trackId: string): Promise<boolean> {
    const track = await this.database.track.findUnique({
      where: { id: trackId },
    });
    if (!track) return false;
    await this.database.track.update({
      where: { id: track.id },
      data: {
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
        metadataRecordingId: null,
        metadataReleaseId: null,
        metadataMatchedAt: null,
        metadataAttemptedSignature: inputSignature(track),
      },
    });
    return true;
  }
}

export function effectiveArtistCredits(track: Track): string[] {
  return parseStoredArtistCredits(
    track.metadataArtistCredits,
    track.metadataArtist ?? track.artist,
  );
}
