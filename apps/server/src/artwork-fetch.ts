import { pruneReferencedArtwork, type ArtworkCache } from "./artwork-cache.js";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import type { ArtworkJobRow, TaskRow } from "./prisma/models.js";
import {
  SourceIntegrationError,
  type SourceIntegrationDefinition,
  type SourceIntegrationHandle,
  type SourceIntegrationService,
} from "./source-integrations.js";
import {
  artworkDetails,
  type TaskExecutionResult,
  type TaskService,
} from "./tasks.js";

const ARTWORK_CONCURRENCY = 6;
const PROGRESS_WRITE_INTERVAL_MS = 250;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface CoverImage {
  data: Uint8Array;
  mimeType: string;
}

interface ArtworkSource {
  handle: SourceIntegrationHandle;
  integration: SourceIntegrationDefinition;
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

export interface ArtworkJobSyncInput {
  trackId: string;
  sourceId: string;
  externalCoverItemId: string | null;
  externalCoverTag: string | null;
}

export async function syncArtworkJobsInBatch(
  database: Pick<Database, "orm" | "sql" | "execute">,
  inputs: readonly ArtworkJobSyncInput[],
): Promise<void> {
  if (!inputs.length) return;
  const trackIds = [...new Set(inputs.map((input) => input.trackId))];
  const existingRows = await database.orm.ArtworkJob.where((job) =>
    job.trackId.in(trackIds),
  ).all();
  const existingByTrackId = new Map(
    existingRows.map((job) => [job.trackId, job]),
  );
  const removeIds: string[] = [];
  const updates: Array<{
    id: string;
    sourceId: string;
    externalCoverItemId: string;
    externalCoverTag: string | null;
  }> = [];
  const creates: Array<{
    trackId: string;
    sourceId: string;
    externalCoverItemId: string;
    externalCoverTag: string | null;
  }> = [];
  for (const input of inputs) {
    const existing = existingByTrackId.get(input.trackId);
    if (!input.externalCoverItemId) {
      if (existing) removeIds.push(existing.id);
      continue;
    }
    if (existing) {
      if (
        existing.sourceId === input.sourceId &&
        existing.externalCoverItemId === input.externalCoverItemId &&
        existing.externalCoverTag === input.externalCoverTag
      ) {
        continue;
      }
      updates.push({
        id: existing.id,
        sourceId: input.sourceId,
        externalCoverItemId: input.externalCoverItemId,
        externalCoverTag: input.externalCoverTag,
      });
      continue;
    }
    creates.push({
      trackId: input.trackId,
      sourceId: input.sourceId,
      externalCoverItemId: input.externalCoverItemId,
      externalCoverTag: input.externalCoverTag,
    });
  }
  if (removeIds.length) {
    await database.orm.ArtworkJob.where((job) =>
      job.id.in(removeIds),
    ).deleteAndCount();
  }
  for (const update of updates) {
    await database.orm.ArtworkJob.where({ id: update.id }).update({
      sourceId: update.sourceId,
      externalCoverItemId: update.externalCoverItemId,
      externalCoverTag: update.externalCoverTag,
      attemptCount: 0,
      lastAttemptAt: null,
    });
  }
  if (creates.length) {
    await database.execute(database.sql.ArtworkJob.insert(creates).build());
  }
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
    private readonly sourceIntegrations: SourceIntegrationService,
    private readonly catalog: CatalogService,
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

    const sourceRows = await this.database.orm.Source.where((source) =>
      source.id.in([...new Set(jobs.map((job) => job.sourceId))]),
    ).all();
    const sources = new Map<string, ArtworkSource>();
    for (const source of sourceRows) {
      if (this.sourceIntegrations.registry.has(source.kind)) {
        sources.set(source.id, {
          handle: this.sourceIntegrations.sourceHandle(source),
          integration: this.sourceIntegrations.definition(source.kind),
        });
      }
    }
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
        const cover =
          result.cover &&
          COVER_TYPES.has(result.cover.mimeType) &&
          result.cover.data.length <= MAX_COVER_BYTES
            ? result.cover
            : null;
        const coverId = cover ? await this.storeCover(cover) : null;
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
          error instanceof SourceIntegrationError &&
          (error.code === "invalid_credentials" || error.code === "unavailable")
        ) {
          unavailableSources.add(group.source.handle.id);
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
            if (unavailableSources.has(group.source.handle.id)) {
              return {
                group,
                error: new SourceIntegrationError(
                  "The source integration could not provide artwork.",
                  "unavailable",
                  502,
                ),
              };
            }
            try {
              return {
                group,
                cover: await group.source.integration.artwork({
                  source: group.source.handle,
                  reference: {
                    itemId: group.externalCoverItemId,
                    tag: group.externalCoverTag,
                  },
                  signal,
                }),
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
