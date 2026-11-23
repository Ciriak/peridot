import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { queueLibraryScan, type TaskService } from "./tasks.js";

const pending = "peridot-import";
const base = "/api/torznab";

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
      const seeders = Array.from(item.getElementsByTagNameNS("*", "attr"))
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
) {
  const feed = process.env.PERIDOT_TORZNAB_URL;
  const key = process.env.PERIDOT_TORZNAB_KEY;
  const client = process.env.PERIDOT_QBIT_URL;
  const folder = process.env.PERIDOT_IMPORT_FOLDER;
  const destination = process.env.PERIDOT_QBIT_SAVE_PATH || folder;
  const enabled = Boolean(feed && key && client && folder);
  app.get(base, async () => ({ enabled }));
  if (!feed || !key || !client || !folder || !destination) {
    const unavailable = async (
      _: unknown,
      reply: import("fastify").FastifyReply,
    ) =>
      reply.code(503).send({
        error: {
          code: "not_configured",
          message: "Torznab is not configured.",
        },
      });
    app.get(base + "/search", unavailable);
    app.get(base + "/imports/:id", unavailable);
    app.post(base + "/imports/:id", unavailable);
    return;
  }
  const source = async () => {
    const row = await db.orm.Source.first({ kind: "path", path: folder });
    if (!row || row.removedAt)
      throw new Error(
        "Add the configured import folder in Settings → Sources.",
      );
    return { id: row.id, name: row.name || folder };
  };
  const endpoint = new URL(feed);
  endpoint.searchParams.set("apikey", key);
  let searchMode: "search" | "music" | undefined;
  async function discoverSearchMode() {
    const url = new URL(endpoint);
    url.searchParams.set("t", "caps");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Could not read indexer capabilities");
    const xml = await response.text();
    if (/<!DOCTYPE/i.test(xml))
      throw new Error("Unexpected indexer capabilities");
    const caps = new DOMParser().parseFromString(xml, "application/xml");
    if (caps.documentElement?.localName !== "caps")
      throw new Error("Invalid indexer capabilities");
    const music = caps.getElementsByTagName("music-search")[0];
    return music?.getAttribute("available") === "yes" &&
      music
        .getAttribute("supportedParams")
        ?.split(",")
        .map((p) => p.trim())
        .includes("q")
      ? "music"
      : "search";
  }
  const cache = new Map<string, string>();
  let cookie = "";
  async function qb(
    method: string,
    params: Record<string, string> = {},
    post = false,
    retry = true,
  ): Promise<Response> {
    const url = new URL(client!.replace(/\/$/, "") + "/api/v2/" + method);
    const body = new URLSearchParams(params);
    if (!post) url.search = body.toString();
    const response = await fetch(url, {
      method: post ? "POST" : "GET",
      body: post ? body : null,
      headers: {
        Cookie: cookie,
        Origin: url.origin,
        Referer: url.origin + "/",
      },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 403 && retry) {
      const login = await qb(
        "auth/login",
        {
          username: process.env.PERIDOT_QBIT_USER || "",
          password: process.env.PERIDOT_QBIT_PASSWORD || "",
        },
        true,
        false,
      );
      cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      if (!cookie) throw new Error("qBittorrent authentication failed");
      return qb(method, params, post, false);
    }
    if (!response.ok) throw new Error("qBittorrent request failed");
    return response;
  }

  app.get<{ Querystring: { q: string } }>(
    base + "/search",
    async (request, reply) => {
      const q = request.query.q;
      if (typeof q !== "string" || !q.trim() || q.length > 256)
        return reply.code(400).send();
      try {
        searchMode ??= await discoverSearchMode();
        const url = new URL(endpoint);
        url.searchParams.set("t", searchMode);
        url.searchParams.set("cat", "3000");
        url.searchParams.set("q", q);
        const response = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error();
        const releases = parseReleases(await response.text(), url);
        for (const r of releases) cache.set(r.id, r.href);
        while (cache.size > 2000) cache.delete(cache.keys().next().value!);
        return releases.map(({ id, title, seeders, bytes }) => ({
          id,
          title,
          seeders,
          bytes,
        }));
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
      await source();
      if ((await list("peridot-" + id)).length)
        return reply.code(202).send({ id });
      const response = await qb(
        "torrents/add",
        {
          urls: href,
          savepath: destination,
          autoTMM: "false",
          tags: pending + ",peridot-" + id,
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
  async function list(tag: string): Promise<Torrent[]> {
    const torrents: Torrent[] = await (
      await qb("torrents/info", { tag })
    ).json();
    return torrents.filter((torrent) =>
      torrent.tags.split(",").some((value) => value.trim() === tag),
    );
  }
  app.get<{ Params: { id: string } }>(
    base + "/imports/:id",
    async (req, reply) => {
      if (!/^[a-f0-9]{64}$/.test(req.params.id)) return reply.code(400).send();
      const [torrent] = await list("peridot-" + req.params.id);
      const progress = torrent?.progress ?? 0;
      const trackIds: string[] = [];
      if (
        torrent &&
        progress === 1 &&
        torrent.save_path.replace(/\/$/, "") === destination.replace(/\/$/, "")
      ) {
        const files: { name: string; progress: number }[] = await (
          await qb("torrents/files", { hash: torrent.hash })
        ).json();
        const names = files.filter((f) => f.progress === 1).map((f) => f.name);
        const src = await source();
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
  async function scanCompleted() {
    const completed = (await list(pending)).filter(
      (t) => t.progress === 1 && t.state !== "moving",
    );
    if (!completed.length) return;
    await queueLibraryScan(tasks, await source());
    await qb(
      "torrents/removeTags",
      { hashes: completed.map((t) => t.hash).join("|"), tags: pending },
      true,
    );
  }
  const timer = setInterval(() => {
    running ??= scanCompleted()
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
