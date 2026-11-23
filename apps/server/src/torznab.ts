import { qbitRequest as qb } from "./qbittorrent.js";
import { importSettings, readClientConnections } from "./download-clients.js";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { queueLibraryScan, type TaskService } from "./tasks.js";

import type { CredentialStore } from "./credential-store.js";
import type { CreateTorznabSourceRequest, MediaType } from "@peridot/contracts";
import { SourceIntegrationError } from "./source-integrations.js";

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
      const number = (v: string | null | undefined) =>
        v && /^\d+$/.test(v) ? Number(v) : null;
      return [
        {
          id,
          title,
          href: url.href,
          seeders: number(seeders),
          mediaType,
          bytes: number(
            field("size") ||
              item.getElementsByTagName("enclosure")[0]?.getAttribute("length"),
          ),
        },
      ];
    });
}

export function registerTorznab(
  app: FastifyInstance,
  db: Database,
  tasks: TaskService,
  credentials: CredentialStore,
) {
  const cache = new Map<string, string>();
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
              ({ id: hash, title, href, seeders, bytes, mediaType }) => {
                const id = indexer.id + "." + hash;
                cache.set(id, href);
                return {
                  id,
                  title,
                  seeders,
                  bytes,
                  mediaType,
                  sourceName: indexer.name,
                  canImport: Boolean(indexer.client),
                };
              },
            );
          }),
        );
        if (responses.length && responses.every((r) => r.status === "rejected"))
          throw new Error();
        while (cache.size > 2000) cache.delete(cache.keys().next().value!);
        return responses.flatMap((r) =>
          r.status === "fulfilled" ? r.value : [],
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
      const href = cache.get(id);
      if (!href)
        return reply.code(404).send({
          error: {
            code: "result_expired",
            message: "Search again to refresh this release.",
          },
        });
      const indexer = (await indexers()).find((s) => s.id === id.split(".")[0]);
      if (!indexer?.client) return reply.code(409).send();
      const { destination } = await source(indexer);
      const pending = "peridot-import-" + indexer.id;
      if ((await list(indexer, "peridot-" + id)).length)
        return reply.code(202).send({ id });
      const response = await qb(
        indexer,
        "torrents/add",
        {
          urls: href,
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
      if ((await response.text()).trim() !== "Ok.")
        throw new Error("qBittorrent rejected the release");
      return reply.code(202).send({ id });
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
  app.get<{ Params: { id: string } }>(
    base + "/imports/:id",
    async (req, reply) => {
      const indexer = (await indexers()).find(
        (s) => s.id === req.params.id.split(".")[0],
      );
      if (!indexer?.client) return reply.code(404).send();
      const src = await source(indexer);
      const { destination } = src;
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
        const files: { name: string; progress: number }[] = await (
          await qb(indexer, "torrents/files", { hash: torrent.hash })
        ).json();
        const names = files.filter((f) => f.progress === 1).map((f) => f.name);

        for (let i = 0; i < names.length; i += 200) {
          const rows = await db.orm.Track.where({
            sourceId: src.id,
            available: 1,
          })
            .where((t) => t.relativePath.in(names.slice(i, i + 200)))
            .all();
          trackIds.push(
            ...rows
              .sort((a, b) =>
                a.relativePath.localeCompare(b.relativePath, undefined, {
                  numeric: true,
                }),
              )
              .map((r) => r.id),
          );
        }
      }
      return { progress, trackIds, state: torrent?.state ?? "pending" };
    },
  );

  let running: Promise<void> | undefined;
  async function scanCompleted(indexer: Indexer) {
    const pending = "peridot-import-" + indexer.id;
    const completed = (await list(indexer, pending)).filter(
      (t) => t.progress === 1 && t.state !== "moving",
    );
    if (!completed.length) return;
    await queueLibraryScan(tasks, await source(indexer));
    await qb(
      indexer,
      "torrents/removeTags",
      { hashes: completed.map((t) => t.hash).join("|"), tags: pending },
      true,
    );
  }
  const timer = setInterval(() => {
    running ??= indexers()
      .then(async (rows) => {
        await Promise.all(
          rows
            .filter((s) => s.client)
            .map((s) =>
              scanCompleted(s).catch(() =>
                app.log.warn("Could not process indexer imports"),
              ),
            ),
        );
      })
      .catch(() => app.log.warn("Could not process completed Torznab imports"))
      .finally(() => {
        running = undefined;
      });
  }, 15000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await running;
  });
}
