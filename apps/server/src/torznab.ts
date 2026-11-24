import {
  QbitRequestError,
  qbitAddAccepted,
  qbitRequest as qb,
} from "./qbittorrent.js";
import { importSettings, readClientConnections } from "./download-clients.js";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import type { TaskService } from "./tasks.js";

import type { CredentialStore } from "./credential-store.js";
import {
  TASK_RELEASE_IMPORT_ID_DETAIL_KEY,
  TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
  type CreateTorznabSourceRequest,
  type MediaType,
  type TaskDetailResponse,
  type TaskReleaseImportStage,
  type TorznabClientTorrentStatus,
  type TorznabRelease,
} from "@peridot/contracts";
import { SourceIntegrationError } from "./source-integrations.js";
import { message } from "./messages.js";
import {
  completedAudioReleasePaths,
  type TorrentFile,
} from "./release-import-files.js";
import { releaseInfoHash, TorrentPresenceIndex } from "./torznab-presence.js";
import { readTaskPayload, toTaskResponse } from "./tasks.js";

function invalid(reason: string): never {
  throw new SourceIntegrationError(reason, "invalid_configuration", 400, {
    key: "indexer.validation",
    params: { reason },
  });
}
function httpUrl(value: unknown) {
  if (typeof value !== "string" || !URL.canParse(value))
    return invalid("Enter an HTTP or HTTPS URL.");
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return invalid("Enter an HTTP or HTTPS URL without embedded credentials.");
  url.hash = "";
  return url;
}
function audioCode(id: string) {
  return /^3[0-9]{3}$/.test(id);
}
export async function validateIndexer(
  input: CreateTorznabSourceRequest,
  db: Database,
) {
  const endpoint = httpUrl(input.url);
  const apiKey =
    (typeof input.apiKey === "string" && input.apiKey) ||
    endpoint.searchParams.get("apikey") ||
    "";
  endpoint.searchParams.delete("apikey");
  const feed = endpoint.href;
  const identity = createHash("sha256").update(feed).digest("hex");
  if (apiKey) endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("t", "caps");
  let text: string;
  try {
    const response = await fetch(endpoint, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error();
    text = await response.text();
  } catch {
    return invalid(
      "Could not read audio capabilities. Check the indexer URL and API key.",
    );
  }
  if (/<!DOCTYPE/i.test(text)) return invalid("Invalid indexer capabilities.");
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    return invalid("Invalid indexer capabilities.");
  }
  const supportsQuery = (tag: string) => {
    const node = doc.getElementsByTagName(tag)[0];
    return (
      node?.getAttribute("available") === "yes" &&
      (node.getAttribute("supportedParams") || "q")
        .split(",")
        .some((p) => p.trim() === "q")
    );
  };
  const categories = [
    ...new Set(
      ["category", "subcat"]
        .flatMap((tag) =>
          Array.from(doc.getElementsByTagName(tag)).map(
            (e) => e.getAttribute("id") || "",
          ),
        )
        .filter(audioCode),
    ),
  ];
  const mode = supportsQuery("music-search") ? "music" : "search";
  if (
    doc.documentElement?.localName !== "caps" ||
    (!categories.length && doc.getElementsByTagName("category").length > 0) ||
    (mode === "search" && (!categories.length || !supportsQuery("search")))
  )
    return invalid("This indexer does not advertise searchable audio.");
  const settings = await importSettings(db, input);
  endpoint.search = "";
  return {
    identity,
    name:
      (typeof input.name === "string" && input.name.trim()) ||
      endpoint.hostname,
    configuration: {
      url: endpoint.href,
      mode,
      categories: categories.join(",") || "3000",
      ...settings,
    },
    credentials: {
      feed,
      apiKey,
    },
  };
}

const base = "/api/torznab";

export function torznabReleaseMediaType(
  categories: readonly string[],
): MediaType | null {
  const normalized = categories
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean);
  if (normalized.some((category) => /\bpodcasts?\b/.test(category))) {
    return "podcast";
  }
  if (normalized.some((category) => /\baudiobooks?\b/.test(category))) {
    return "audiobook";
  }
  const codes = normalized.filter((category) =>
    /^[1-9][0-9]{3}$/.test(category),
  );
  if (codes.includes("3030")) return "audiobook";
  if (codes.some(audioCode)) return "music";
  if (normalized.some((category) => /\b(?:audio|music)\b/.test(category))) {
    return "music";
  }
  return null;
}

export function parseReleases(xml: string, feed: URL) {
  if (/<!DOCTYPE/i.test(xml)) throw new Error("Unexpected indexer response");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.documentElement?.localName !== "rss")
    throw new Error("Indexer search failed");
  return Array.from(document.getElementsByTagName("item"))
    .slice(0, 100)
    .flatMap((item) => {
      const field = (key: string) =>
        item.getElementsByTagName(key)[0]?.textContent?.trim();
      const attributes = Array.from(item.getElementsByTagNameNS("*", "attr"));
      const categories = [
        ...Array.from(item.getElementsByTagName("category")).map(
          (c) => c.textContent?.trim() || "",
        ),
        ...attributes
          .filter((a) => a.getAttribute("name") === "category")
          .map((a) => a.getAttribute("value") || ""),
      ];
      const standardCategories = categories.filter((c) =>
        /^[1-9][0-9]{3}$/.test(c),
      );
      const mediaType = torznabReleaseMediaType(categories);
      if (
        standardCategories.length &&
        !standardCategories.some(audioCode) &&
        !mediaType
      )
        return [];
      const title = field("title");
      const href =
        item.getElementsByTagName("enclosure")[0]?.getAttribute("url") ||
        field("link");
      if (!href || !title) return [];
      const url = new URL(href, feed);
      if (!(
        url.protocol === "magnet:" ||
        (["https:", "http:"].includes(url.protocol) &&
          url.origin === feed.origin)
      ))
        return [];
      const id = createHash("sha256")
        .update(feed.pathname + "\n" + (field("guid") || href))
        .digest("hex");
      const seeders = attributes
        .find((a) => a.getAttribute("name") === "seeders")
        ?.getAttribute("value");
      const attr = (name: string) =>
        attributes
          .find((a) => a.getAttribute("name") === name)
          ?.getAttribute("value");
      const number = (v: string | null | undefined) =>
        v && /^\d+$/.test(v) ? Number(v) : null;
      return [
        {
          id,
          title,
          href: url.href,
          seeders: number(seeders),
          mediaType,
          infoHash: releaseInfoHash(
            url.href,
            attr("infohash"),
            attr("magneturl"),
          ),
          bytes: number(
            field("size") ||
              item.getElementsByTagName("enclosure")[0]?.getAttribute("length"),
          ),
        },
      ];
    });
}

function releaseImportDetails(
  importId: string,
  stage: TaskReleaseImportStage,
  transferState: string | null,
  progress: number,
): TaskDetailResponse[] {
  return [
    {
      key: TASK_RELEASE_IMPORT_ID_DETAIL_KEY,
      value: importId,
      labelMessage: message("task.detail.releaseImport"),
      valueMessage: null,
    },
    {
      key: TASK_RELEASE_IMPORT_STAGE_DETAIL_KEY,
      value: stage,
      labelMessage: message("task.detail.releaseStage"),
      valueMessage: message(
        stage === "downloading"
          ? "task.releaseStage.downloading"
          : "task.releaseStage.addingToLibrary",
      ),
    },
    ...(transferState
      ? [
          {
            key: "release.transferState",
            value: transferState,
            labelMessage: message("task.detail.transferState"),
            valueMessage: null,
          },
        ]
      : []),
    {
      key: "release.progress",
      value: `${Math.round(progress * 100)}%`,
      labelMessage: message("task.detail.downloadProgress"),
      valueMessage: null,
    },
  ];
}

function taskDetail(task: { details: string }, key: string) {
  try {
    const details = JSON.parse(task.details) as TaskDetailResponse[];
    return details.find((detail) => detail.key === key)?.value ?? null;
  } catch {
    return null;
  }
}

export function registerTorznab(
  app: FastifyInstance,
  db: Database,
  tasks: TaskService,
  credentials: CredentialStore,
) {
  const cache = new Map<
    string,
    { href: string; infoHash: string | null; title: string; indexerId: string }
  >();
  const presence = new TorrentPresenceIndex();
  async function indexers() {
    const rows = await db.orm.Source.where({ kind: "torznab" })
      .where((s) => s.removedAt.isNull())
      .all();
    const clients = await readClientConnections(db, credentials);
    return rows.map((row) => {
      const config = JSON.parse(row.configuration!);
      const secrets = JSON.parse(
        credentials.decrypt(row.credentialCiphertext!, "source"),
      );
      return {
        id: row.id,
        name: row.name || "Torznab",
        feed: String(secrets.feed),
        apiKey: String(secrets.apiKey),
        downloadClientId: config.downloadClientId
          ? String(config.downloadClientId)
          : "",
        ...(clients.get(config.downloadClientId) || {
          client: "",
          clientApiKey: "",
        }),
        category: String(config.category || ""),
        tags: String(config.tags || ""),
        categoryPath: config.categoryPath === "true",
        folderId: String(config.folderId),
        savePath: String(config.savePath),
        categories: String(config.categories),
        mode: String(config.mode),
      };
    });
  }
  type Indexer = Awaited<ReturnType<typeof indexers>>[number];
  async function source(indexer: Indexer) {
    const row = await db.orm.Source.first({
      id: indexer.folderId,
      kind: "path",
    });
    if (!row?.path || row.removedAt)
      throw new Error("Import folder unavailable.");
    return {
      id: row.id,
      name: row.name || row.path,
      destination: indexer.savePath || row.path,
    };
  }
  app.get(base, async () => ({ enabled: (await indexers()).length > 0 }));
  app.get<{ Querystring: { q: string } }>(
    base + "/search",
    async (request, reply) => {
      const q = request.query.q;
      if (typeof q !== "string" || !q.trim() || q.length > 256)
        return reply.code(400).send();
      try {
        const sources = await indexers();
        const responses = await Promise.allSettled(
          sources.map(async (indexer) => {
            const url = new URL(indexer.feed);
            if (indexer.apiKey) url.searchParams.set("apikey", indexer.apiKey);
            url.searchParams.set("t", indexer.mode);
            url.searchParams.set("cat", indexer.categories);
            url.searchParams.set("q", q);
            const response = await fetch(url, {
              redirect: "error",
              signal: AbortSignal.timeout(20000),
            });
            if (!response.ok) throw new Error();
            return parseReleases(await response.text(), url).map(
              ({
                id: hash,
                title,
                href,
                infoHash,
                seeders,
                bytes,
                mediaType,
              }) => {
                const id = indexer.id + "." + hash;
                cache.set(id, {
                  href,
                  infoHash,
                  title,
                  indexerId: indexer.id,
                });
                return {
                  id,
                  title,
                  seeders,
                  bytes,
                  mediaType,
                  sourceName: indexer.name,
                  canImport: Boolean(indexer.client),
                  infoHash,
                  indexer,
                };
              },
            );
          }),
        );
        if (responses.length && responses.every((r) => r.status === "rejected"))
          throw new Error();
        while (cache.size > 2000) cache.delete(cache.keys().next().value!);
        const releases = responses.flatMap((r) =>
          r.status === "fulfilled" ? r.value : [],
        );
        const activeImportTasks = await db.orm.Task.where({
          kind: "release_import",
        })
          .where((task) => task.status.in(["waiting", "queued", "running"]))
          .all();
        const tasksByReleaseId = new Map(
          activeImportTasks.flatMap((task) => {
            const importId = taskDetail(
              task,
              TASK_RELEASE_IMPORT_ID_DETAIL_KEY,
            );
            return importId ? [[importId, task.id] as const] : [];
          }),
        );
        const hashesByClient = new Map<
          string,
          { indexer: Indexer; hashes: string[] }
        >();
        for (const release of releases) {
          if (!release.infoHash || !release.indexer.downloadClientId) continue;
          const group = hashesByClient.get(
            release.indexer.downloadClientId,
          ) ?? {
            indexer: release.indexer,
            hashes: [],
          };
          group.hashes.push(release.infoHash);
          hashesByClient.set(release.indexer.downloadClientId, group);
        }
        const presenceByClient = new Map<
          string,
          Map<string, TorznabClientTorrentStatus | null>
        >();
        await Promise.all(
          [...hashesByClient.entries()].map(async ([clientId, group]) => {
            presenceByClient.set(
              clientId,
              await presence.lookup(clientId, group.indexer, group.hashes, () =>
                app.log.warn("Could not check torrent presence in qBittorrent"),
              ),
            );
          }),
        );
        return releases.map(
          ({ infoHash, indexer, ...release }): TorznabRelease => {
            const clientStatus = infoHash
              ? presenceByClient.get(indexer.downloadClientId)?.get(infoHash)
              : null;
            return {
              ...release,
              ...(clientStatus
                ? {
                    torrentStatus: {
                      ...clientStatus,
                      taskId: tasksByReleaseId.get(release.id) ?? null,
                    },
                  }
                : {}),
            };
          },
        );
      } catch {
        return reply.code(502).send({
          error: {
            message: "Torznab search failed. Check the feed URL and API key.",
            code: "indexer_failed",
          },
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    base + "/imports/:id",
    async (req, reply) => {
      const id = req.params.id;
      const release = cache.get(id);
      if (!release)
        return reply.code(404).send({
          error: {
            code: "result_expired",
            message: "Search again to refresh this release.",
          },
        });
      const indexer = (await indexers()).find((s) => s.id === id.split(".")[0]);
      if (!indexer?.client) return reply.code(409).send();
      const src = await source(indexer);
      const { destination } = src;
      const pending = "peridot-import-" + indexer.id;
      if ((await list(indexer, "peridot-" + id)).length)
        return reply.code(409).send({
          error: {
            code: "release_already_added",
            message: "This release is already in the download client.",
          },
        });
      const importTask = await tasks.enqueue({
        kind: "release_import",
        initialStatus: "waiting",
        dedupe: false,
        publish: false,
        ownerUserId: req.authenticatedUser?.id ?? null,
        title: release.title,
        titleMessage: message("task.title.releaseImport", {
          release: release.title,
        }),
        sourceId: src.id,
        sourceName: src.name,
        details: releaseImportDetails(id, "downloading", null, 0),
      });
      let response: Response;
      try {
        response = await qb(
          indexer,
          "torrents/add",
          {
            urls: release.href,
            ...(indexer.category ? { category: indexer.category } : {}),
            ...(indexer.categoryPath
              ? { autoTMM: "true" }
              : { savepath: destination, autoTMM: "false" }),
            tags: [pending, "peridot-" + id, indexer.tags]
              .filter(Boolean)
              .join(","),
          },
          true,
        );
      } catch (error) {
        await tasks.discardWaiting(importTask.id);
        if (error instanceof QbitRequestError && error.statusCode === 409) {
          return reply.code(409).send({
            error: {
              code: "release_already_added",
              message: "This release is already in the download client.",
            },
          });
        }
        if (error instanceof QbitRequestError) {
          return reply.code(502).send({
            error: {
              code: "download_client_rejected",
              message: "qBittorrent rejected the release.",
            },
          });
        }
        throw error;
      }
      if (!qbitAddAccepted(await response.text())) {
        await tasks.discardWaiting(importTask.id);
        return reply.code(502).send({
          error: {
            code: "download_client_rejected",
            message: "qBittorrent rejected the release.",
          },
        });
      }
      await tasks.updateProgress(
        importTask.id,
        0,
        100,
        releaseImportDetails(id, "downloading", "pending", 0),
      );
      if (release.infoHash) {
        presence.set(indexer.downloadClientId, release.infoHash, {
          hash: release.infoHash,
          state: "pending",
          progress: 0,
          taskId: importTask.id,
        });
      }
      const savedTask = await tasks.get(importTask.id);
      if (!savedTask) throw new Error("Import task was not created.");
      return reply.code(202).send({ id, task: toTaskResponse(savedTask) });
    },
  );

  interface Torrent {
    hash: string;
    progress: number;
    tags: string;
    save_path: string;
    state: string;
  }
  async function list(indexer: Indexer, tag: string): Promise<Torrent[]> {
    const torrents: Torrent[] = await (
      await qb(indexer, "torrents/info", { tag })
    ).json();
    return torrents.filter((torrent) =>
      torrent.tags.split(",").some((value) => value.trim() === tag),
    );
  }
  async function importedTrackIds(sourceId: string, relativePaths: string[]) {
    const ids: string[] = [];
    for (let index = 0; index < relativePaths.length; index += 200) {
      const rows = await db.orm.Track.where({
        sourceId,
        available: 1,
      })
        .where((track) =>
          track.relativePath.in(relativePaths.slice(index, index + 200)),
        )
        .all();
      ids.push(
        ...rows
          .sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath, undefined, {
              numeric: true,
            }),
          )
          .map((track) => track.id),
      );
    }
    return ids;
  }
  app.get<{ Params: { id: string } }>(
    base + "/imports/:id",
    async (req, reply) => {
      const indexer = (await indexers()).find(
        (s) => s.id === req.params.id.split(".")[0],
      );
      if (!indexer?.client) return reply.code(404).send();
      const src = await source(indexer);
      const { destination } = src;
      const importTask = (
        await db.orm.Task.where({ kind: "release_import" }).all()
      )
        .filter(
          (task) =>
            taskDetail(task, TASK_RELEASE_IMPORT_ID_DETAIL_KEY) ===
            req.params.id,
        )
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )[0];
      if (importTask) {
        const taskProgress =
          importTask.progressCompleted !== null &&
          importTask.progressTotal !== null &&
          importTask.progressTotal > 0
            ? Math.min(
                1,
                Math.max(
                  0,
                  importTask.progressCompleted / importTask.progressTotal,
                ),
              )
            : 0;
        if (importTask.status === "waiting") {
          return {
            progress: taskProgress,
            trackIds: [],
            state: taskDetail(importTask, "release.transferState") ?? "pending",
          };
        }
        if (importTask.status === "queued" || importTask.status === "running") {
          return { progress: 1, trackIds: [], state: "adding" };
        }
        if (importTask.status === "completed") {
          const relativePaths = readTaskPayload(importTask);
          if (relativePaths) {
            return {
              progress: 1,
              trackIds: await importedTrackIds(src.id, relativePaths),
              state: taskDetail(importTask, "release.transferState") ?? "ready",
            };
          }
        }
        if (
          importTask.status === "failed" ||
          importTask.status === "interrupted" ||
          importTask.status === "stopped"
        ) {
          return {
            progress: taskProgress,
            trackIds: [],
            state: importTask.status,
          };
        }
      }
      const [torrent] = await list(indexer, "peridot-" + req.params.id);
      const progress = torrent?.progress ?? 0;
      const trackIds: string[] = [];
      if (
        torrent &&
        progress === 1 &&
        (indexer.categoryPath ||
          torrent.save_path.replace(/\/$/, "") ===
            destination.replace(/\/$/, ""))
      ) {
        const files: TorrentFile[] = await (
          await qb(indexer, "torrents/files", { hash: torrent.hash })
        ).json();
        trackIds.push(
          ...(await importedTrackIds(
            src.id,
            completedAudioReleasePaths(files),
          )),
        );
      }
      return { progress, trackIds, state: torrent?.state ?? "pending" };
    },
  );

  const IMPORT_MISSING_TIMEOUT_MS = 24 * 60 * 60 * 1000;
  const TERMINAL_QBIT_STATES = new Set(["error", "missingFiles"]);
  let running: Promise<void> | undefined;
  async function pollWaitingImports() {
    if (running) return running;
    running = (async () => {
      const releaseTasks = await db.orm.Task.where({
        kind: "release_import",
      }).all();
      if (!releaseTasks.length) return;
      const sources = await indexers();
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      const tasksById = new Map<string, typeof releaseTasks>();
      const recentlyUpdated = Date.now() - 5 * 60 * 1000;
      for (const task of releaseTasks) {
        if (
          (task.status === "completed" ||
            task.status === "stopped" ||
            task.status === "failed" ||
            task.status === "interrupted") &&
          task.updatedAt.getTime() < recentlyUpdated
        ) {
          continue;
        }
        const importId = taskDetail(task, TASK_RELEASE_IMPORT_ID_DETAIL_KEY);
        const sourceId = importId?.split(".")[0];
        if (!importId || !sourceId) continue;
        const indexer = sourceById.get(sourceId);
        if (!indexer?.client) {
          if (task.status === "waiting") {
            await tasks.fail(
              task.id,
              "The indexer or download client is no longer available.",
              "failed",
              message("api.message.releaseImportUnavailable"),
            );
          }
          continue;
        }
        const group = tasksById.get(indexer.id) ?? [];
        group.push(task);
        tasksById.set(indexer.id, group);
      }

      await Promise.all(
        [...tasksById.entries()].map(async ([indexerId, indexerTasks]) => {
          const indexer = sourceById.get(indexerId);
          if (!indexer) return;
          const pendingTag = "peridot-import-" + indexer.id;
          let torrents: Torrent[];
          try {
            torrents = await list(indexer, pendingTag);
          } catch {
            app.log.warn("Could not check Torznab import progress");
            return;
          }
          const torrentByImportId = new Map<string, Torrent>();
          for (const torrent of torrents) {
            const releaseTag = torrent.tags
              .split(",")
              .map((tag) => tag.trim())
              .find(
                (tag) =>
                  tag.startsWith("peridot-") &&
                  !tag.startsWith("peridot-import-"),
              );
            if (releaseTag) {
              torrentByImportId.set(
                releaseTag.slice("peridot-".length),
                torrent,
              );
            }
          }

          const removeHashes = new Set<string>();
          for (const task of indexerTasks) {
            const importId = taskDetail(
              task,
              TASK_RELEASE_IMPORT_ID_DETAIL_KEY,
            );
            if (!importId) continue;
            const torrent = torrentByImportId.get(importId);
            if (!torrent) {
              if (
                task.status === "waiting" &&
                Date.now() - task.createdAt.getTime() >=
                  IMPORT_MISSING_TIMEOUT_MS
              ) {
                await tasks.fail(
                  task.id,
                  "The torrent was not found in the download client.",
                  "failed",
                  message("api.message.releaseImportMissing"),
                );
              }
              continue;
            }
            if (task.status !== "waiting") {
              removeHashes.add(torrent.hash);
              continue;
            }
            if (TERMINAL_QBIT_STATES.has(torrent.state)) {
              await tasks.fail(
                task.id,
                `The download client reported ${torrent.state}.`,
                "failed",
                message("api.message.releaseImportDownloadFailed"),
              );
              removeHashes.add(torrent.hash);
              continue;
            }
            if (torrent.progress >= 1 && torrent.state !== "moving") {
              let relativePaths: string[];
              try {
                const files: TorrentFile[] = await (
                  await qb(indexer, "torrents/files", { hash: torrent.hash })
                ).json();
                relativePaths = completedAudioReleasePaths(files);
              } catch {
                app.log.warn("Could not read completed Torznab import files");
                continue;
              }
              await tasks.promoteWaiting(
                task.id,
                releaseImportDetails(
                  importId,
                  "addingToLibrary",
                  torrent.state,
                  1,
                ),
                relativePaths,
              );
              removeHashes.add(torrent.hash);
            } else {
              await tasks.updateProgress(
                task.id,
                Math.round(torrent.progress * 100),
                100,
                releaseImportDetails(
                  importId,
                  "downloading",
                  torrent.state,
                  torrent.progress,
                ),
              );
            }
          }
          if (removeHashes.size) {
            await qb(
              indexer,
              "torrents/removeTags",
              { hashes: [...removeHashes].join("|"), tags: pendingTag },
              true,
            );
          }
        }),
      );
    })()
      .catch(() => app.log.warn("Could not process Torznab imports"))
      .finally(() => {
        running = undefined;
      });
    return running;
  }
  const timer = setInterval(() => {
    void pollWaitingImports();
  }, 5000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await running;
  });
}
