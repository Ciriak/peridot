import type { FastifyInstance } from "fastify";
import type {
  DownloadClientInput,
  DownloadLinkInput,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import type { CredentialStore } from "./credential-store.js";
import { SourceIntegrationError } from "./source-integrations.js";
import { qbitOptions } from "./qbittorrent.js";

function invalid(message: string): never {
  throw new SourceIntegrationError(message, "invalid_configuration", 400, {
    key: "indexer.validation",
    params: { reason: message },
  });
}
export async function importSettings(db: Database, input: DownloadLinkInput) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const downloadClientId = text(input.downloadClientId),
    folderId = text(input.folderId);
  if (downloadClientId || folderId) {
    const client = await db.orm.DownloadClient.first({ id: downloadClientId });
    const folder = await db.orm.Source.first({ id: folderId, kind: "path" });
    if (!client || !folder || folder.removedAt)
      invalid("Select a saved download client and an active folder source.");
  }
  const tags = [
    ...new Set(
      text(input.tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.some((t) => t.startsWith("peridot-")))
    invalid("Tags beginning with peridot- are reserved for tracking imports.");
  const category = text(input.category);
  if (input.categoryPath && !category)
    invalid("Choose a category to use its save path.");
  return {
    downloadClientId,
    folderId,
    category,
    tags: tags.join(","),
    categoryPath: String(Boolean(input.categoryPath)),
    savePath: text(input.savePath),
  };
}

export async function readClientConnections(
  db: Database,
  store: CredentialStore,
) {
  const clients = await db.orm.DownloadClient.all();
  return new Map(
    clients.map((c) => [
      c.id,
      {
        client: c.url,
        username: c.username,
        password: store.decrypt(c.credentialCiphertext, "source"),
        sessionKey: c.id + c.credentialCiphertext,
      },
    ]),
  );
}

export async function migrateIndexerClients(
  db: Database,
  store: CredentialStore,
) {
  await db.transaction(async (tx) => {
    const rows = await tx.orm.Source.where({ kind: "torznab" })
      .where((s) => s.removedAt.isNull())
      .all();
    const clients = await tx.orm.DownloadClient.all();
    for (const row of rows) {
      const config = JSON.parse(row.configuration || "{}");
      if (!config.clientUrl || !row.credentialCiphertext) continue;
      const secrets = JSON.parse(
        store.decrypt(row.credentialCiphertext, "source"),
      );
      const url = String(config.clientUrl),
        username = String(secrets.username || ""),
        password = String(secrets.password || "");
      let client = clients.find(
        (c) =>
          c.url === url &&
          c.username === username &&
          store.decrypt(c.credentialCiphertext, "source") === password,
      );
      if (!client) {
        client = await tx.orm.DownloadClient.create({
          kind: "qbittorrent",
          name: new URL(url).host,
          url,
          username,
          credentialCiphertext: store.encrypt(password, "source"),
        });
        clients.push(client);
      }
      delete config.clientUrl;
      delete secrets.username;
      delete secrets.password;
      await tx.orm.Source.where({ id: row.id }).updateAndCount({
        configuration: JSON.stringify({
          ...config,
          downloadClientId: client.id,
        }),
        credentialCiphertext: store.encrypt(JSON.stringify(secrets), "source"),
      });
    }
  });
}
const base = "/api/admin/download-clients";
export function registerDownloadClients(
  app: FastifyInstance,
  db: Database,
  store: CredentialStore,
) {
  const clients = db.orm.DownloadClient;
  app.get(base, async () =>
    (await clients.all()).map(({ id, kind, name, url, username }) => ({
      id,
      kind,
      name,
      url,
      username,
    })),
  );
  async function connection(input: DownloadClientInput, id?: string) {
    if (
      !input ||
      input.kind !== "qbittorrent" ||
      typeof input.url !== "string" ||
      !URL.canParse(input.url)
    )
      invalid("Enter a valid qBittorrent URL.");
    const url = new URL(input.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      invalid("Enter the qBittorrent Web UI base URL.");
    const username = typeof input.username === "string" ? input.username : "";
    const saved = id ? await clients.first({ id }) : null;
    if (id && !saved) invalid("Download client no longer exists.");
    let password = input.password;
    if (password === undefined && saved) {
      if (saved.url !== url.href || saved.username !== username)
        invalid(
          "Re-enter the password when changing the connection address or username.",
        );
      password = store.decrypt(saved.credentialCiphertext, "source");
    }
    if (password !== undefined && typeof password !== "string")
      invalid("Invalid password.");
    return {
      client: url.href,
      username,
      password: password || "",
      sessionKey: "test",
    };
  }
  async function save(input: DownloadClientInput, id?: string) {
    const c = await connection(input, id);
    if (typeof input.name !== "string" || !input.name.trim())
      invalid("Enter a client name.");
    const data = {
      name: input.name.trim(),
      kind: "qbittorrent",
      url: c.client,
      username: c.username,
      credentialCiphertext: store.encrypt(c.password, "source"),
    };
    if (id) {
      await clients.where({ id }).updateAndCount(data);
      return { id };
    }
    return { id: (await clients.create(data)).id };
  }
  app.post<{ Body: DownloadClientInput }>(base, async (req, reply) =>
    reply.code(201).send(await save(req.body)),
  );
  app.put<{ Params: { id: string }; Body: DownloadClientInput }>(
    base + "/:id",
    async (req) => save(req.body, req.params.id),
  );
  app.post<{ Body: DownloadClientInput & { id?: string } }>(
    base + "/test",
    async (req, reply) => {
      const c = await connection(req.body, req.body?.id);
      try {
        return await qbitOptions(c);
      } catch {
        return reply
          .code(502)
          .send({
            error: {
              code: "connection_failed",
              message: "qBittorrent connection failed.",
            },
          });
      }
    },
  );
  app.get<{ Params: { id: string } }>(
    base + "/:id/options",
    async (req, reply) => {
      const c = (await readClientConnections(db, store)).get(req.params.id);
      if (!c) return reply.code(404).send();
      try {
        return await qbitOptions(c);
      } catch {
        return reply
          .code(502)
          .send({
            error: {
              code: "connection_failed",
              message: "qBittorrent connection failed.",
            },
          });
      }
    },
  );
  app.delete<{ Params: { id: string } }>(base + "/:id", async (req, reply) => {
    const linked = (
      await db.orm.Source.where({ kind: "torznab" })
        .where((s) => s.removedAt.isNull())
        .all()
    ).some(
      (s) =>
        JSON.parse(s.configuration || "{}").downloadClientId === req.params.id,
    );
    if (linked)
      return reply
        .code(409)
        .send({
          error: {
            code: "client_in_use",
            message: "Unlink this client from its indexers first.",
          },
        });
    await clients.where({ id: req.params.id }).delete();
    return reply.code(204).send();
  });
  app.put<{ Params: { id: string }; Body: DownloadLinkInput }>(
    "/api/admin/sources/:id/download-client",
    async (req, reply) => {
      const row = await db.orm.Source.first({
        id: req.params.id,
        kind: "torznab",
      });
      if (!row || row.removedAt) return reply.code(404).send();
      const settings = await importSettings(db, req.body);
      await db.orm.Source.where({ id: row.id })
        .where((s) => s.removedAt.isNull())
        .updateAndCount({
          configuration: JSON.stringify({
            ...JSON.parse(row.configuration || "{}"),
            ...settings,
          }),
        });
      return reply.code(204).send();
    },
  );
}
