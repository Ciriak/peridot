import { pruneReferencedArtwork, type ArtworkCache } from "./artwork-cache.js";
import type { CatalogService } from "./catalog.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { JellyfinClient, JellyfinError } from "./jellyfin.js";
import type { ArtworkJobRow, SourceRow, TaskRow } from "./prisma/models.js";
import {
  artworkDetails,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const ARTWORK_CONCURRENCY = 6;
const PROGRESS_WRITE_INTERVAL_MS = 250;

interface CoverImage {
  data: Buffer;
  mimeType: string;
}

interface ArtworkSource {
  id: string;
  name: string;
  url: string;
  apiKey: string;
}

interface ArtworkGroup {
  source: ArtworkSource;
  externalCoverItemId: string;
  externalCoverTag: string | null;
  jobs: ArtworkJobRow[];
}

type ArtworkFetchResult =
  | {
      group: ArtworkGroup;
      cover: CoverImage | null;
      error?: never;
    }
  | {
      group: ArtworkGroup;
      cover?: never;
      error: unknown;
    };

export function externalCoverKey(
  externalCoverItemId: string,
  externalCoverTag: string | null,
): string {
  return JSON.stringify([externalCoverItemId, externalCoverTag]);
}

export async function hasPendingArtworkJobs(
  database: Database,
  sourceId: string | null,
): Promise<boolean> {
  const query = sourceId
    ? database.orm.ArtworkJob.where({ sourceId })
    : database.orm.ArtworkJob;
  const result = await query.aggregate((aggregate) => ({
    count: aggregate.count(),
  }));
  return result.count > 0;
}

export async function syncArtworkJob(
  database: Database,
  input: {
    trackId: string;
    sourceId: string;
    externalCoverItemId: string | null;
    externalCoverTag: string | null;
  },
): Promise<void> {
  if (!input.externalCoverItemId) {
    await database.orm.ArtworkJob.where({
      trackId: input.trackId,
    }).deleteAndCount();
    return;
  }
  const existing = await database.orm.ArtworkJob.first({
    trackId: input.trackId,
  });
  if (existing) {
    if (
      existing.sourceId === input.sourceId &&
      existing.externalCoverItemId === input.externalCoverItemId &&
      existing.externalCoverTag === input.externalCoverTag
    ) {
      return;
    }
    await database.orm.ArtworkJob.where({ id: existing.id }).update({
      sourceId: input.sourceId,
      externalCoverItemId: input.externalCoverItemId,
      externalCoverTag: input.externalCoverTag,
      attemptCount: 0,
      lastAttemptAt: null,
    });
    return;
  }
  await database.orm.ArtworkJob.create({
    trackId: input.trackId,
    sourceId: input.sourceId,
    externalCoverItemId: input.externalCoverItemId,
    externalCoverTag: input.externalCoverTag,
  });
}

function sourceCredentials(
  sources: readonly SourceRow[],
  credentials: CredentialStore,
): Map<string, ArtworkSource> {
  return new Map(
    sources.flatMap((source) => {
      if (
        source.kind !== "integration" ||
        source.integration !== "jellyfin" ||
        !source.url ||
        !source.credentialCiphertext
      ) {
        return [];
      }
      return [
        [
          source.id,
          {
            id: source.id,
            name: source.name || source.url,
            url: source.url,
            apiKey: credentials.decrypt(source.credentialCiphertext, "source"),
          },
        ] as const,
      ];
    }),
  );
}

function taskSourceName(task: TaskRow): string {
  return task.sourceName || "All sources";
}

function errorSummary(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Artwork retrieval failed.";
}

export class ArtworkService {
  constructor(
    private readonly database: Database,
    private readonly jellyfin: JellyfinClient,
    private readonly catalog: CatalogService,
    private readonly credentials: CredentialStore,
    private readonly artworkCache: ArtworkCache,
  ) {}

  async runTask(
    task: TaskRow,
    tasks: TaskService,
    signal: AbortSignal,
  ): Promise<TaskExecutionResult> {
    if (signal.aborted) {
      throw new DOMException("The artwork task was stopped.", "AbortError");
    }
    const jobQuery = task.sourceId
      ? this.database.orm.ArtworkJob.where({ sourceId: task.sourceId })
      : this.database.orm.ArtworkJob;
    const jobs = await jobQuery
      .orderBy([
        (job) => job.sourceId.asc(),
        (job) => job.externalCoverItemId.asc(),
        (job) => job.externalCoverTag.asc(),
        (job) => job.createdAt.asc(),
      ])
      .all();
    const sourceName = taskSourceName(task);
    if (!jobs.length) {
      return {
        details: artworkDetails({
          source: sourceName,
          total: 0,
          retrieved: 0,
          missing: 0,
          failed: 0,
        }),
      };
    }

    const sources = sourceCredentials(
      await this.database.orm.Source.where((source) =>
        source.id.in([...new Set(jobs.map((job) => job.sourceId))]),
      ).all(),
      this.credentials,
    );
    const groups = new Map<string, ArtworkGroup>();
    for (const job of jobs) {
      const source = sources.get(job.sourceId);
      const key = `${job.sourceId}\u0000${externalCoverKey(
        job.externalCoverItemId,
        job.externalCoverTag,
      )}`;
      const group =
        source &&
        (groups.get(key) ?? {
          source,
          externalCoverItemId: job.externalCoverItemId,
          externalCoverTag: job.externalCoverTag,
          jobs: [],
        });
      if (!group) continue;
      group.jobs.push(job);
      groups.set(key, group);
    }

    const groupedJobs = [...groups.values()];
    let retrieved = 0;
    let missing = 0;
    let failed =
      jobs.length -
      groupedJobs.reduce((count, group) => count + group.jobs.length, 0);
    let processed = failed;
    let failureSummary: string | null =
      failed > 0 ? "Some configured artwork sources are unavailable." : null;
    let lastProgressAt = 0;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;

    const updateProgress = async (force = false) => {
      if (!force && Date.now() - lastProgressAt < PROGRESS_WRITE_INTERVAL_MS) {
        if (!progressTimer) {
          progressTimer = setTimeout(() => {
            progressTimer = undefined;
            void updateProgress(true).catch(() => undefined);
          }, PROGRESS_WRITE_INTERVAL_MS);
          progressTimer.unref?.();
        }
        return;
      }
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = undefined;
      }
      lastProgressAt = Date.now();
      await tasks.updateProgress(
        task.id,
        processed,
        jobs.length,
        artworkDetails({
          source: sourceName,
          total: jobs.length,
          retrieved,
          missing,
          failed,
        }),
      );
    };
    await updateProgress(true);

    const unavailableSources = new Set<string>();
    for await (const result of this.fetchArtworkGroups(
      groupedJobs,
      unavailableSources,
      signal,
    )) {
      if (signal.aborted) {
        throw new DOMException("The artwork task was stopped.", "AbortError");
      }
      const { group } = result;
      const expectedKey = externalCoverKey(
        group.externalCoverItemId,
        group.externalCoverTag,
      );
      try {
        if ("error" in result) throw result.error;
        const coverId = result.cover
          ? await this.storeCover(result.cover)
          : null;
        let updatedJobs = 0;
        for (const job of group.jobs) {
          const updated = await this.catalog.updateTrackCover(
            job.trackId,
            coverId,
            expectedKey,
          );
          if (!updated) continue;
          updatedJobs += 1;
          if (coverId) retrieved += 1;
          else missing += 1;
        }
        if (!updatedJobs) {
          throw new Error("Artwork no longer matches the catalog item.");
        }
        await this.database.orm.ArtworkJob.where((job) =>
          job.id.in(group.jobs.map((entry) => entry.id)),
        ).deleteAndCount();
      } catch (error) {
        if (
          error instanceof JellyfinError &&
          (error.code === "invalid_credentials" || error.code === "unavailable")
        ) {
          unavailableSources.add(group.source.id);
        }
        failureSummary ??= errorSummary(error);
        failed += group.jobs.length;
        const attemptedAt = new Date();
        for (const job of group.jobs) {
          await this.database.orm.ArtworkJob.where({ id: job.id }).update({
            attemptCount: job.attemptCount + 1,
            lastAttemptAt: attemptedAt,
          });
        }
      }
      processed += group.jobs.length;
      await updateProgress();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    await this.catalog.flushChanges();
    await pruneReferencedArtwork(this.database, this.artworkCache);
    await updateProgress(true);
    return {
      details: artworkDetails({
        source: sourceName,
        total: jobs.length,
        retrieved,
        missing,
        failed,
      }),
      failureSummary,
    };
  }

  private async *fetchArtworkGroups(
    groups: readonly ArtworkGroup[],
    unavailableSources: ReadonlySet<string>,
    signal: AbortSignal,
  ): AsyncGenerator<ArtworkFetchResult> {
    let nextIndex = 0;
    const pending = new Map<number, Promise<ArtworkFetchResult>>();
    while (nextIndex < groups.length || pending.size) {
      if (signal.aborted) {
        throw new DOMException("The artwork task was stopped.", "AbortError");
      }
      while (nextIndex < groups.length && pending.size < ARTWORK_CONCURRENCY) {
        const index = nextIndex;
        const group = groups[nextIndex++];
        if (!group) break;
        pending.set(
          index,
          (async () => {
            if (unavailableSources.has(group.source.id)) {
              return {
                group,
                error: new JellyfinError(
                  "Jellyfin could not provide artwork.",
                  "unavailable",
                ),
              };
            }
            try {
              return {
                group,
                cover: await this.jellyfin.cover(
                  group.source.url,
                  group.source.apiKey,
                  group.externalCoverItemId,
                  group.externalCoverTag,
                  signal,
                ),
              };
            } catch (error) {
              return { group, error };
            }
          })(),
        );
      }
      if (!pending.size) break;
      const completed = await Promise.race(
        [...pending].map(async ([index, promise]) => ({
          index,
          result: await promise,
        })),
      );
      pending.delete(completed.index);
      yield completed.result;
    }
  }

  private async storeCover(cover: CoverImage): Promise<string> {
    const hash = await this.artworkCache.store(cover.data);
    const existing = await this.database.orm.TrackCover.first({ hash });
    const stored =
      existing ??
      (await this.database.orm.TrackCover.create({
        hash,
      }));
    return stored.id;
  }
}
