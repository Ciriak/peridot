import type {
  CreatePlaylistAccountRequest,
  CreatePlaylistLinkRequest,
  PlaylistAccountListResponse,
  PlaylistAccountResponse,
  PlaylistDetailResponse,
  PlaylistLinkResponse,
  PlaylistSyncMode,
  PlaylistSyncResultResponse,
  RemotePlaylistListResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { ConnectorRegistry, PlaylistAccountHandle } from "./connectors.js";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { effectiveMediaFields } from "./media-response.js";
import { message } from "./messages.js";
import type {
  PlaylistAccountRow,
  PlaylistLinkRow,
  PlaylistRow,
} from "./prisma/models.js";
import { normalizeSearchText } from "./search-text.js";
import {
  parseRecordingIdentityKeys,
  recordingIdentity,
} from "./track-identities.js";

const MAX_NAME_LENGTH = 120;
const MAX_ID_LENGTH = 200;
const MAX_CONFIGURATION_ENTRIES = 64;
const DURATION_TOLERANCE_MS = 1_000;

function parseLabel(value: unknown, maximum = MAX_NAME_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim().replace(/\s+/gu, " ");
  if (!label || Array.from(label).length > maximum) return null;
  for (const character of label) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return label;
}

function parseConfiguration(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connector configuration must be an object.");
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([key, entry]) => [key.trim().slice(0, 80), entry.slice(0, 4_096)])
      .filter(([key]) => Boolean(key))
      .slice(0, MAX_CONFIGURATION_ENTRIES),
  );
}

function accountResponse(account: PlaylistAccountRow): PlaylistAccountResponse {
  return {
    id: account.id,
    kind: account.kind,
    name: account.name,
    configuration: parseConfiguration(JSON.parse(account.configuration)),
    hasCredential: Boolean(account.credentialCiphertext),
    enabled: Boolean(account.enabled),
  };
}

function accountHandle(
  account: PlaylistAccountRow,
  credentials: CredentialStore,
): PlaylistAccountHandle {
  return {
    id: account.id,
    kind: account.kind,
    name: account.name,
    configuration: parseConfiguration(JSON.parse(account.configuration)),
    credentials: account.credentialCiphertext
      ? parseConfiguration(
          JSON.parse(
            credentials.decrypt(
              account.credentialCiphertext,
              "playlist-account",
            ),
          ),
        )
      : {},
  };
}

function linkResponse(
  link: PlaylistLinkRow,
  account: PlaylistAccountRow,
): PlaylistLinkResponse {
  return {
    id: link.id,
    accountId: account.id,
    accountName: account.name,
    externalPlaylistId: link.externalPlaylistId,
    syncMode: link.syncMode === "synchronize" ? "synchronize" : "import",
    remoteVersion: link.remoteVersion,
    lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
  };
}

async function ownedAccount(
  database: Database,
  userId: string,
  id: string,
): Promise<PlaylistAccountRow | null> {
  return database.orm.PlaylistAccount.first({ id, userId, enabled: 1 });
}

async function matchCopyIdentities(
  database: Database,
  identities: readonly string[],
): Promise<Map<string, Set<string>>> {
  if (!identities.length) return new Map();
  const copies = await database.orm.MediaCopy.all();
  const matches = new Map(
    identities.map((identity) => [identity, new Set<string>()]),
  );
  for (const copy of copies) {
    const keys = parseRecordingIdentityKeys(copy.recordingIdentityKeys);
    for (const identity of identities) {
      if (keys.includes(identity)) matches.get(identity)!.add(copy.mediaId);
    }
  }
  return matches;
}

async function uniqueMediaMatch(
  database: Database,
  mediaIds: ReadonlySet<string>,
): Promise<string | null> {
  if (mediaIds.size !== 1) return null;
  const mediaId = [...mediaIds][0]!;
  return (await database.orm.Media.first({ id: mediaId })) ? mediaId : null;
}

async function matchPlaylistItem(
  database: Database,
  input: {
    externalTrackId: string;
    title: string;
    artist: string;
    durationMs: number | null;
    isrc: string | null;
  },
): Promise<string | null> {
  const identities = [
    input.isrc ? recordingIdentity("isrc", input.isrc) : null,
    recordingIdentity("musicbrainz", input.externalTrackId),
  ].filter((value): value is string => Boolean(value));
  const identityMatches = await matchCopyIdentities(database, identities);
  for (const identity of identities) {
    const match = await uniqueMediaMatch(
      database,
      identityMatches.get(identity) ?? new Set(),
    );
    if (match) return match;
  }

  if (input.durationMs === null) return null;
  const title = normalizeSearchText(input.title);
  const artist = normalizeSearchText(input.artist);
  if (!title || !artist) return null;
  const projections = await database.orm.CatalogMedia.where({
    normalizedTitle: title,
  }).all();
  const candidateIds = projections.flatMap((projection) =>
    projection.durationMs !== null &&
    Math.abs(projection.durationMs - input.durationMs!) <= DURATION_TOLERANCE_MS
      ? [projection.id]
      : [],
  );
  if (!candidateIds.length) return null;
  const media = await database.orm.Media.where((row) =>
    row.id.in(candidateIds),
  ).all();
  const matches = media.filter((row) => {
    const effective = effectiveMediaFields(row);
    const artists = effective.artists
      .map(normalizeSearchText)
      .filter(Boolean)
      .sort();
    return (
      normalizeSearchText(effective.title) === title &&
      artists.length === 1 &&
      artists[0] === artist &&
      effective.durationMs !== null &&
      Math.abs(effective.durationMs - input.durationMs!) <=
        DURATION_TOLERANCE_MS
    );
  });
  return matches.length === 1 ? matches[0]!.id : null;
}

function itemIdentity(kind: string, externalTrackId: string): string {
  return `external:${encodeURIComponent(kind)}:${encodeURIComponent(externalTrackId)}`;
}

async function synchronize(
  database: Database,
  registry: ConnectorRegistry,
  credentials: CredentialStore,
  playlist: PlaylistRow,
  link: PlaylistLinkRow,
  account: PlaylistAccountRow,
): Promise<{
  added: number;
  matched: number;
  removed: number;
  unchanged: number;
  unmatched: number;
}> {
  const connector = registry.require(
    account.kind,
    "playlist-account",
  ).playlistReference;
  const remote = await connector.readPlaylist(
    accountHandle(account, credentials),
    link.externalPlaylistId,
  );
  if (remote.items.length > 10_000) {
    throw new Error("The remote playlist exceeds the supported item limit.");
  }

  const existing = await database.orm.PlaylistItem.where({
    playlistId: playlist.id,
  }).all();
  const existingByIdentity = new Map(
    existing.map((item) => [item.identityKey, item]),
  );
  const remoteIdentities = new Set<string>();
  const prepared: Array<{
    item: (typeof remote.items)[number];
    position: number;
    mediaId: string | null;
  }> = [];
  for (const [position, item] of remote.items.entries()) {
    prepared.push({
      item,
      position,
      mediaId: await matchPlaylistItem(database, item),
    });
  }
  let added = 0;
  let matched = 0;
  let unchanged = 0;
  let unmatched = 0;
  let removed = 0;

  await database.transaction(async (transaction) => {
    for (const { item, position, mediaId } of prepared) {
      const identityKey = itemIdentity(account.kind, item.externalTrackId);
      remoteIdentities.add(identityKey);
      const current = existingByIdentity.get(identityKey);
      const snapshot = {
        position,
        mediaId,
        externalProvider: account.kind,
        externalTrackId: item.externalTrackId,
        matchStatus: mediaId ? "matched" : "unmatched",
        snapshotTitle: item.title,
        snapshotArtist: item.artist,
        snapshotAlbum: item.album,
        snapshotDuration: item.durationMs,
      };
      if (!current) {
        await transaction.orm.PlaylistItem.create({
          playlistId: playlist.id,
          identityKey,
          ...snapshot,
        });
        added += 1;
      } else {
        const same =
          current.position === position &&
          current.mediaId === mediaId &&
          current.externalTrackId === item.externalTrackId &&
          current.snapshotTitle === item.title &&
          current.snapshotArtist === item.artist &&
          current.snapshotAlbum === item.album &&
          current.snapshotDuration === item.durationMs;
        if (!same) {
          await transaction.orm.PlaylistItem.where({ id: current.id }).update(
            snapshot,
          );
        } else {
          unchanged += 1;
        }
      }
      if (mediaId) matched += 1;
      else unmatched += 1;
    }

    for (const item of existing) {
      if (remoteIdentities.has(item.identityKey)) continue;
      await transaction.orm.PlaylistItem.where({ id: item.id }).delete();
      removed += 1;
    }
    await transaction.orm.Playlist.where({ id: playlist.id }).update({
      name: remote.title?.trim() || playlist.name,
      updatedAt: new Date(),
    });
    await transaction.orm.PlaylistLink.where({ id: link.id }).update({
      lastSyncedAt: new Date(),
      remoteVersion: remote.version ?? null,
      syncCursor: remote.version ?? link.syncCursor,
    });
  });
  return { added, matched, removed, unchanged, unmatched };
}

export function registerPlaylistLinkRoutes(
  app: FastifyInstance,
  database: Database,
  credentials: CredentialStore,
  connectors: ConnectorRegistry,
  materializePlaylist: (
    userId: string,
    playlist: PlaylistRow,
  ) => Promise<PlaylistDetailResponse>,
) {
  app.get(
    "/api/playlist-accounts",
    async (request): Promise<PlaylistAccountListResponse> => ({
      items: (
        await database.orm.PlaylistAccount.where({
          userId: request.authenticatedUser!.id,
        })
          .orderBy((account) => account.createdAt.asc())
          .all()
      ).map(accountResponse),
    }),
  );

  app.post<{ Body: Partial<CreatePlaylistAccountRequest> }>(
    "/api/playlist-accounts",
    async (request, reply) => {
      const kind = parseLabel(request.body?.kind, 80);
      const name = parseLabel(request.body?.name);
      if (!kind || !name) {
        return sendError(
          reply,
          400,
          "invalid_playlist_account",
          "Choose a playlist connector and enter an account name.",
          message("api.message.connectorInvalid"),
        );
      }
      let connector;
      try {
        connector = connectors.require(kind, "playlist-account");
      } catch {
        return sendError(
          reply,
          400,
          "playlist_connector_unavailable",
          "This playlist connector is not available.",
          message("api.message.connectorInvalid"),
        );
      }
      const configuration = parseConfiguration(request.body?.configuration);
      const credential = parseConfiguration(request.body?.credential);
      const row = await database.orm.PlaylistAccount.create({
        userId: request.authenticatedUser!.id,
        kind: connector.kind,
        name,
        configuration: JSON.stringify(configuration),
        credentialCiphertext: Object.keys(credential).length
          ? credentials.encrypt(JSON.stringify(credential), "playlist-account")
          : null,
        enabled: 1,
      });
      return reply.code(201).send(accountResponse(row));
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/playlist-accounts/:id",
    async (request, reply) => {
      const account = await ownedAccount(
        database,
        request.authenticatedUser!.id,
        request.params.id,
      );
      if (!account) return reply.code(404).send();
      await database.orm.PlaylistAccount.where({ id: account.id }).delete();
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/playlist-accounts/:id/playlists",
    async (request, reply): Promise<RemotePlaylistListResponse | undefined> => {
      const account = await ownedAccount(
        database,
        request.authenticatedUser!.id,
        request.params.id,
      );
      if (!account) return reply.code(404).send();
      try {
        return {
          items: await connectors
            .require(account.kind, "playlist-account")
            .playlistReference.listPlaylists(
              accountHandle(account, credentials),
            ),
        };
      } catch {
        return sendError(
          reply,
          502,
          "playlist_connector_failed",
          "The playlist account could not be read.",
          message("api.message.connectorUnavailable"),
        );
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: Partial<CreatePlaylistLinkRequest>;
  }>("/api/playlist-accounts/:id/links", async (request, reply) => {
    const account = await ownedAccount(
      database,
      request.authenticatedUser!.id,
      request.params.id,
    );
    if (!account) return reply.code(404).send();
    const externalPlaylistId = parseLabel(
      request.body?.externalPlaylistId,
      MAX_ID_LENGTH,
    );
    const syncMode: PlaylistSyncMode =
      request.body?.syncMode === "synchronize" ? "synchronize" : "import";
    if (!externalPlaylistId) {
      return sendError(
        reply,
        400,
        "invalid_playlist_link",
        "Choose a remote playlist.",
        message("api.message.connectorInvalid"),
      );
    }
    const existing = await database.orm.PlaylistLink.first({
      accountId: account.id,
      externalPlaylistId,
    });
    if (existing) return reply.code(409).send();
    const remote = await connectors
      .require(account.kind, "playlist-account")
      .playlistReference.readPlaylist(
        accountHandle(account, credentials),
        externalPlaylistId,
      );
    const playlist = await database.orm.Playlist.create({
      userId: request.authenticatedUser!.id,
      kind: "external",
      name:
        (
          await connectors
            .require(account.kind, "playlist-account")
            .playlistReference.listPlaylists(
              accountHandle(account, credentials),
            )
        ).find((item) => item.id === externalPlaylistId)?.title ??
        "Imported playlist",
    });
    const link = await database.orm.PlaylistLink.create({
      playlistId: playlist.id,
      accountId: account.id,
      externalPlaylistId,
      syncMode,
      remoteVersion: remote.version ?? null,
      syncCursor: remote.version ?? null,
    });
    const result = await synchronize(
      database,
      connectors,
      credentials,
      playlist,
      link,
      account,
    );
    return reply.code(201).send({
      ...result,
      playlist: await materializePlaylist(
        request.authenticatedUser!.id,
        playlist,
      ),
    } satisfies PlaylistSyncResultResponse);
  });

  app.post<{ Params: { id: string } }>(
    "/api/playlists/:id/sync",
    async (request, reply) => {
      const playlist = await database.orm.Playlist.first({
        id: request.params.id,
        userId: request.authenticatedUser!.id,
        kind: "external",
      });
      if (!playlist) return reply.code(404).send();
      const link = await database.orm.PlaylistLink.first({
        playlistId: playlist.id,
      });
      const account = link
        ? await ownedAccount(
            database,
            request.authenticatedUser!.id,
            link.accountId,
          )
        : null;
      if (!link || !account) return reply.code(404).send();
      try {
        const result = await synchronize(
          database,
          connectors,
          credentials,
          playlist,
          link,
          account,
        );
        return {
          ...result,
          playlist: await materializePlaylist(
            request.authenticatedUser!.id,
            playlist,
          ),
        } satisfies PlaylistSyncResultResponse;
      } catch {
        return sendError(
          reply,
          502,
          "playlist_connector_failed",
          "The linked playlist could not be synchronized.",
          message("api.message.connectorUnavailable"),
        );
      }
    },
  );
}

export function playlistLinkResponse(
  link: PlaylistLinkRow,
  account: PlaylistAccountRow,
): PlaylistLinkResponse {
  return linkResponse(link, account);
}
