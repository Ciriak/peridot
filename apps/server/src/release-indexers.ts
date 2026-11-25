import type { FastifyInstance } from "fastify";
import type {
  ReleaseIndexerConnectionTestRequest,
  ReleaseIndexerInput,
  ReleaseIndexerListResponse,
  ReleaseIndexerResponse,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";
import type { ConnectorRegistry } from "./connectors.js";
import type { Database } from "./database.js";
import { importSettings } from "./download-clients.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type { ReleaseIndexerRow } from "./prisma/models.js";
import { LibrarySourceConnectorError } from "./source-integrations.js";
import { prepareIndexer, testIndexerConnection } from "./torznab.js";

const base = "/api/admin/release-indexers";

function configuration(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, entry]) =>
        typeof entry === "string" ? [[key, entry]] : [],
      ),
    );
  } catch {
    return {};
  }
}

function response(row: ReleaseIndexerRow): ReleaseIndexerResponse {
  const config = configuration(row.configuration);
  return {
    id: row.id,
    kind: "torznab",
    name: row.name,
    url: row.url,
    configuration: config,
    downloadClientId: row.downloadClientId ?? config.downloadClientId ?? null,
    lastSyncedAt: null,
  };
}

function sameFeedBase(left: string, right: string) {
  try {
    const normalized = (value: string) => {
      const url = new URL(value);
      url.search = "";
      url.hash = "";
      return url.href;
    };
    return normalized(left) === normalized(right);
  } catch {
    return left.trim() === right.trim();
  }
}

function hasApiKeyInUrl(value: string) {
  try {
    return new URL(value).searchParams.has("apikey");
  } catch {
    return false;
  }
}

export async function listReleaseIndexers(
  db: Database,
): Promise<ReleaseIndexerListResponse> {
  const rows = await db.orm.ReleaseIndexer.where((row) =>
    row.removedAt.isNull(),
  )
    .orderBy([(row) => row.position.asc(), (row) => row.createdAt.asc()])
    .all();
  return { items: rows.map(response) };
}

export function registerReleaseIndexers(
  app: FastifyInstance,
  db: Database,
  credentials: CredentialStore,
  connectors: ConnectorRegistry,
) {
  app.get(base, async () => listReleaseIndexers(db));

  app.post<{ Body: ReleaseIndexerConnectionTestRequest }>(
    base + "/test",
    async (request, reply) => {
      try {
        let input = request.body;
        if (input?.id) {
          const row = await db.orm.ReleaseIndexer.first({
            id: input.id,
            kind: "torznab",
          });
          if (!row || row.removedAt) return reply.code(404).send();
          if (row.credentialCiphertext) {
            const saved = JSON.parse(
              credentials.decrypt(row.credentialCiphertext, "release-indexer"),
            ) as { feed?: unknown; apiKey?: unknown };
            const useSavedFeed =
              typeof saved.feed === "string" &&
              sameFeedBase(input.url, row.url) &&
              !input.apiKey &&
              !hasApiKeyInUrl(input.url);
            input = {
              ...input,
              url: useSavedFeed ? String(saved.feed) : input.url,
              apiKey:
                input.apiKey ||
                (typeof saved.apiKey === "string" ? saved.apiKey : ""),
            };
          }
        }
        return await testIndexerConnection(input);
      } catch (error) {
        if (error instanceof LibrarySourceConnectorError) {
          return sendError(
            reply,
            error.statusCode,
            error.code,
            error.message,
            error.messageDescriptor,
          );
        }
        throw error;
      }
    },
  );

  app.post<{ Body: ReleaseIndexerInput }>(base, async (request, reply) => {
    try {
      connectors.require("torznab", "release-indexer");
      const validated = await prepareIndexer(request.body, db);
      const existing = await db.orm.ReleaseIndexer.first({
        kind: "torznab",
        sourceIdentity: validated.identity,
      });
      if (existing && !existing.removedAt) {
        return reply.code(409).send({
          error: {
            code: "indexer_exists",
            message: "This release indexer is already configured.",
          },
        });
      }
      const { count } = await db.orm.ReleaseIndexer.where((row) =>
        row.removedAt.isNull(),
      ).aggregate((aggregate) => ({ count: aggregate.count() }));
      const data = {
        kind: "torznab",
        name: validated.name,
        url: validated.configuration.url ?? request.body.url,
        sourceIdentity: validated.identity,
        configuration: JSON.stringify(validated.configuration),
        downloadClientId: validated.configuration.downloadClientId || null,
        credentialCiphertext: credentials.encrypt(
          JSON.stringify(validated.credentials),
          "release-indexer",
        ),
        position: count,
        removedAt: null,
      };
      const row = existing
        ? await db.orm.ReleaseIndexer.where({ id: existing.id })
            .updateAndCount(data)
            .then(() => db.orm.ReleaseIndexer.firstOrThrow({ id: existing.id }))
        : await db.orm.ReleaseIndexer.create(data);
      return reply.code(201).send(response(row));
    } catch (error) {
      if (error instanceof LibrarySourceConnectorError) {
        return sendError(
          reply,
          error.statusCode,
          error.code,
          error.message,
          error.messageDescriptor,
        );
      }
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: ReleaseIndexerInput }>(
    base + "/:id/download-client",
    async (request, reply) => {
      const row = await db.orm.ReleaseIndexer.first({
        id: request.params.id,
        kind: "torznab",
      });
      if (!row || row.removedAt) return reply.code(404).send();
      try {
        const settings = await importSettings(db, request.body);
        await db.orm.ReleaseIndexer.where({ id: row.id }).update({
          configuration: JSON.stringify({
            ...configuration(row.configuration),
            ...settings,
          }),
          downloadClientId: settings.downloadClientId || null,
        });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof LibrarySourceConnectorError) {
          return sendError(
            reply,
            error.statusCode,
            error.code,
            error.message,
            error.messageDescriptor,
          );
        }
        throw error;
      }
    },
  );

  app.put<{ Body: { ids?: unknown } }>(
    base + "/order",
    async (request, reply) => {
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return sendError(
          reply,
          400,
          "invalid_indexer_order",
          "Indexer order must contain ids.",
          message("api.message.sourceOrderInvalid"),
        );
      }
      await db.transaction(async (transaction) => {
        for (const [index, id] of ids.entries()) {
          await transaction.orm.ReleaseIndexer.where({ id }).update({
            position: index,
          });
        }
      });
      return listReleaseIndexers(db);
    },
  );

  app.delete<{ Params: { id: string } }>(
    base + "/:id",
    async (request, reply) => {
      const row = await db.orm.ReleaseIndexer.first({ id: request.params.id });
      if (!row || row.removedAt) return reply.code(404).send();
      await db.orm.ReleaseIndexer.where({ id: row.id }).update({
        removedAt: new Date(),
        configuration: null,
        credentialCiphertext: null,
      });
      return reply.code(204).send();
    },
  );
}
