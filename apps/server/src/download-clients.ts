import type { FastifyInstance } from "fastify";
import type {
  DownloadClientInput,
  DownloadLinkInput,
} from "@peridot/contracts";
import type { Database } from "./database.js";
import type { ConnectorRegistry } from "./connectors.js";
import type { CredentialStore } from "./credential-store.js";
import { LibrarySourceConnectorError } from "./source-integrations.js";
import { type QbitConnection, qbitOptions } from "./qbittorrent.js";

function invalid(message: string): never {
  throw new LibrarySourceConnectorError(message, "invalid_configuration", 400, {
    key: "indexer.validation",
    params: { reason: message },
  });
}
export async function importSettings(db: Database, input: DownloadLinkInput) {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const downloadClientId = text(input.downloadClientId),
    librarySourceId = text(input.librarySourceId);
  if (downloadClientId || librarySourceId) {
    const client = await db.orm.DownloadClient.first({ id: downloadClientId });
    const folder = await db.orm.LibrarySource.first({
      id: librarySourceId,
      kind: "path",
    });
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
    librarySourceId,
    category,
    tags: tags.join(","),
    categoryPath: String(Boolean(input.categoryPath)),
    savePath: text(input.savePath),
  };
}

const apiKeyPrefix = "qbit-api-key:";
export function downloadCredentialEnvelope(value: string) {
  return value.startsWith(apiKeyPrefix)
    ? value.slice(apiKeyPrefix.length)
    : value;
}

export async function readClientConnections(
  db: Database,
  store: CredentialStore,
) {
  const clients = await db.orm.DownloadClient.all();
  return new Map<string, QbitConnection>(
    clients.map((c) => {
      const key = c.credentialCiphertext.startsWith(apiKeyPrefix);
      const secret = store.decrypt(
        downloadCredentialEnvelope(c.credentialCiphertext),
        "download-client",
      );
      return [
        c.id,
        {
          client: c.url,
          ...(key
            ? { clientApiKey: secret }
            : { username: c.username, password: secret }),
        },
      ];
    }),
  );
}

const base = "/api/admin/download-clients";
export function registerDownloadClients(
  app: FastifyInstance,
  db: Database,
  store: CredentialStore,
  connectors: ConnectorRegistry,
) {
  const clients = db.orm.DownloadClient;
  app.get(base, async () =>
    (await clients.all()).map(
      ({ id, kind, name, url, username, credentialCiphertext }) => ({
        id,
        kind,
        name,
        url,
        username,
        authType: credentialCiphertext.startsWith(apiKeyPrefix)
          ? "apiKey"
          : "password",
        hasApiKey: credentialCiphertext.startsWith(apiKeyPrefix),
      }),
    ),
  );
  async function connection(input: DownloadClientInput, id?: string) {
    connectors.require(input?.kind ?? "", "download-client");
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
    const saved = id ? await clients.first({ id }) : null;
    if (id && !saved) invalid("Download client no longer exists.");
    const mode =
      input.authType === undefined
        ? input.username !== undefined || input.password !== undefined
          ? "password"
          : "apiKey"
        : input.authType;
    if (mode !== "password" && mode !== "apiKey")
      invalid("Select an authentication method.");
    const isKey = mode === "apiKey";
    const username = isKey ? "" : input.username;
    if (!isKey && (typeof username !== "string" || !username.trim()))
      invalid("Enter a qBittorrent username.");
    let secret = isKey ? input.apiKey : input.password;
    if (
      secret === undefined &&
      saved &&
      new URL(saved.url).href === url.href &&
      saved.credentialCiphertext.startsWith(apiKeyPrefix) === isKey &&
      (isKey || saved.username === username)
    ) {
      secret = store.decrypt(
        downloadCredentialEnvelope(saved.credentialCiphertext),
        "download-client",
      );
    }
    if (
      typeof secret !== "string" ||
      !secret ||
      (isKey && !/^\S+$/.test(secret.trim()))
    )
      invalid(
        isKey
          ? "Enter a qBittorrent API key."
          : "Enter a qBittorrent password.",
      );
    return {
      client: url.href,
      username: username || "",
      password: isKey ? "" : secret,
      clientApiKey: isKey ? secret.trim() : "",
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
      credentialCiphertext: c.clientApiKey
        ? apiKeyPrefix + store.encrypt(c.clientApiKey, "download-client")
        : store.encrypt(c.password, "download-client"),
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
        return reply.code(502).send({
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
        return reply.code(502).send({
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
      await db.orm.ReleaseIndexer.where({
        kind: "torznab",
        downloadClientId: req.params.id,
      })
        .where((source) => source.removedAt.isNull())
        .all()
    ).length
      ? true
      : (
          await db.orm.ReleaseIndexer.where({ kind: "torznab" })
            .where((source) => source.removedAt.isNull())
            .all()
        ).some(
          (source) =>
            JSON.parse(source.configuration || "{}").downloadClientId ===
            req.params.id,
        );
    if (linked)
      return reply.code(409).send({
        error: {
          code: "client_in_use",
          message: "Unlink this client from its indexers first.",
        },
      });
    await clients.where({ id: req.params.id }).delete();
    return reply.code(204).send();
  });
}
