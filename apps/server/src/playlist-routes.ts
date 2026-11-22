import type {
  AddPlaylistItemRequest,
  CreatePlaylistRequest,
  PlaylistDetailResponse,
  PlaylistEntryResponse,
  PlaylistExternalTrackReference,
  PlaylistListResponse,
  PlaylistSummaryResponse,
  ReorderPlaylistItemsRequest,
  TrackResponse,
} from "@peridot/contracts";
import {
  LIKED_TRACKS_PLAYLIST_ID,
  LIKED_TRACKS_PLAYLIST_NAME,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { canonicalTrackId } from "./duplicate-resolver.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type { PlaybackTokenService } from "./playback-tokens.js";
import type {
  PlaylistItemRow,
  PlaylistRow,
  TrackRow,
} from "./prisma/models.js";
import { normalizeSearchText, searchTerms } from "./search-text.js";
import { effectiveTrackFields, toTrackResponse } from "./track-response.js";

const MAX_PLAYLIST_NAME_LENGTH = 120;
const MAX_PLAYLIST_ITEMS = 10_000;
const MAX_PROVIDER_LENGTH = 80;
const MAX_EXTERNAL_TRACK_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 512;
const MAX_ID_LENGTH = 200;

type ParsedPlaylistItem =
  | { kind: "catalog"; trackId: string }
  | { kind: "external"; reference: PlaylistExternalTrackReference };

interface PlaylistListQuery {
  limit?: string;
  offset?: string;
  trackId?: string;
  query?: string;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(name).length;
  return length > 0 && length <= MAX_PLAYLIST_NAME_LENGTH ? name : null;
}

function parseId(value: unknown, maximum = MAX_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length > 0 && id.length <= maximum ? id : null;
}

function parseLabel(value: unknown, maximum = MAX_LABEL_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label.length > 0 && Array.from(label).length <= maximum ? label : null;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function parsePlaylistItem(value: unknown): ParsedPlaylistItem | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<AddPlaylistItemRequest> & {
    reference?: Record<string, unknown>;
  };
  if (body.kind === "catalog") {
    const trackId = parseId(body.trackId);
    return trackId ? { kind: "catalog", trackId } : null;
  }
  if (body.kind !== "external" || !body.reference) return null;
  const provider = parseLabel(body.reference.provider, MAX_PROVIDER_LENGTH);
  const externalTrackId = parseId(
    body.reference.externalTrackId,
    MAX_EXTERNAL_TRACK_ID_LENGTH,
  );
  const title = parseLabel(body.reference.title);
  const artist = parseLabel(body.reference.artist);
  const rawAlbum = body.reference.album;
  const album =
    rawAlbum === null || rawAlbum === undefined ? null : parseLabel(rawAlbum);
  const rawDuration = body.reference.durationMs;
  const durationMs =
    rawDuration === null || rawDuration === undefined
      ? null
      : parsePositiveInteger(rawDuration);
  if (
    !provider ||
    !externalTrackId ||
    !title ||
    !artist ||
    (rawAlbum !== null && rawAlbum !== undefined && album === null) ||
    (rawDuration !== null && rawDuration !== undefined && durationMs === null)
  ) {
    return null;
  }
  return {
    kind: "external",
    reference: {
      provider: provider.toLowerCase(),
      externalTrackId,
      title,
      artist,
      album,
      durationMs,
    },
  };
}

function identityKey(item: ParsedPlaylistItem): string {
  return item.kind === "catalog"
    ? `catalog:${encodeURIComponent(item.trackId)}`
    : `external:${encodeURIComponent(item.reference.provider)}:${encodeURIComponent(item.reference.externalTrackId)}`;
}

function summaryFromDetail(
  playlist: PlaylistDetailResponse,
): PlaylistSummaryResponse {
  return {
    id: playlist.id,
    kind: playlist.kind,
    name: playlist.name,
    trackCount: playlist.trackCount,
    availableTrackCount: playlist.availableTrackCount,
    durationMs: playlist.durationMs,
    coverUrls: playlist.coverUrls,
    liked: playlist.liked,
    containsTrack: playlist.containsTrack,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}

function isLikedTracksPlaylist(playlistId: string): boolean {
  return playlistId === LIKED_TRACKS_PLAYLIST_ID;
}

function sendAutomaticPlaylistReadOnly(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    409,
    "automatic_playlist_read_only",
    "Automatic playlists cannot be edited or removed",
    message("api.message.automaticPlaylistReadOnly"),
  );
}

async function materializeLikedTracksPlaylist(
  database: Database,
  playbackTokens: PlaybackTokenService,
  userId: string,
  containsTrackId: string | null = null,
): Promise<PlaylistDetailResponse> {
  const likes = await database.orm.TrackLike.where({ userId })
    .orderBy([(like) => like.createdAt.desc(), (like) => like.trackId.desc()])
    .all();
  const likedTrackIds = [...new Set(likes.map((like) => like.trackId))];
  const [trackRows, projections] = await Promise.all([
    likedTrackIds.length
      ? database.orm.Track.where((track) => track.id.in(likedTrackIds))
          .include("source", (source) => source.select("kind"))
          .all()
      : Promise.resolve([]),
    likedTrackIds.length
      ? database.orm.CatalogTrack.where((track) =>
          track.id.in(likedTrackIds),
        ).all()
      : Promise.resolve([]),
  ]);
  const trackById = new Map(trackRows.map((track) => [track.id, track]));
  const albumIdByTrack = new Map(
    projections.map((track) => [track.id, track.albumId]),
  );
  const musicLikes = likes.flatMap((like) => {
    const track = trackById.get(like.trackId);
    if (!track || track.mediaType !== "music" || track.duplicateOfId !== null) {
      return [];
    }
    return [{ track, likedAt: like.createdAt }];
  });
  const entries = musicLikes.map(
    ({ track }, position): PlaylistEntryResponse => {
      const trackResponse = toTrackResponse(
        track,
        playbackTokens,
        true,
        albumIdByTrack.get(track.id) ?? null,
      );
      return {
        id: `liked:${track.id}`,
        position,
        title: trackResponse.title,
        artist: trackResponse.artist,
        artists: trackResponse.artists,
        album: trackResponse.album,
        durationMs: trackResponse.durationMs,
        coverUrl: trackResponse.coverUrl,
        available: trackResponse.available,
        liked: true,
        track: trackResponse,
        external: null,
      };
    },
  );
  const durations = entries.flatMap((entry) =>
    entry.durationMs === null ? [] : [entry.durationMs],
  );
  const createdAt =
    musicLikes.at(-1)?.likedAt.toISOString() ?? new Date(0).toISOString();
  const updatedAt =
    musicLikes[0]?.likedAt.toISOString() ?? new Date(0).toISOString();

  return {
    id: LIKED_TRACKS_PLAYLIST_ID,
    kind: "liked-tracks",
    name: LIKED_TRACKS_PLAYLIST_NAME,
    trackCount: entries.length,
    availableTrackCount: entries.filter((entry) => entry.available).length,
    durationMs: durations.length
      ? durations.reduce((total, duration) => total + duration, 0)
      : null,
    coverUrls: [],
    liked: false,
    containsTrack: containsTrackId
      ? entries.some((entry) => entry.track?.id === containsTrackId)
      : false,
    createdAt,
    updatedAt,
    entries,
  };
}

function itemSnapshot(
  item: PlaylistItemRow,
): PlaylistExternalTrackReference | null {
  if (!item.externalProvider || !item.externalTrackId) return null;
  return {
    provider: item.externalProvider,
    externalTrackId: item.externalTrackId,
    title: item.snapshotTitle,
    artist: item.snapshotArtist,
    album: item.snapshotAlbum,
    durationMs: item.snapshotDuration,
  };
}

async function matchingExternalTrack(
  database: Database,
  item: PlaylistItemRow,
): Promise<TrackRow | null> {
  if (!item.externalProvider || !item.externalTrackId) return null;
  const matches = await database.orm.Track.where({
    metadataProviderKind: item.externalProvider,
    metadataExternalTrackId: item.externalTrackId,
  }).all();
  return matches.length === 1 ? matches[0]! : null;
}

async function materializePlaylist(
  database: Database,
  playbackTokens: PlaybackTokenService,
  userId: string,
  playlist: PlaylistRow,
  containsTrackId: string | null = null,
): Promise<PlaylistDetailResponse> {
  const itemRows = await database.orm.PlaylistItem.where({
    playlistId: playlist.id,
  })
    .orderBy((item) => item.position.asc())
    .all();

  const externalMatches = new Map<string, TrackRow | null>();
  for (const item of itemRows) {
    if (
      item.trackId === null &&
      item.externalProvider &&
      item.externalTrackId
    ) {
      externalMatches.set(item.id, await matchingExternalTrack(database, item));
    }
  }

  const trackIds = [
    ...new Set(
      itemRows.flatMap((item) => {
        const trackId =
          item.trackId ?? externalMatches.get(item.id)?.id ?? null;
        return trackId ? [trackId] : [];
      }),
    ),
  ];
  const [trackRows, projections, likedRows, likedPlaylist] = await Promise.all([
    trackIds.length
      ? database.orm.Track.where((track) => track.id.in(trackIds))
          .include("source", (source) => source.select("kind"))
          .all()
      : Promise.resolve([]),
    trackIds.length
      ? database.orm.CatalogTrack.where((track) => track.id.in(trackIds)).all()
      : Promise.resolve([]),
    trackIds.length
      ? database.orm.TrackLike.where({ userId })
          .where((like) => like.trackId.in(trackIds))
          .all()
      : Promise.resolve([]),
    database.orm.PlaylistLike.where({
      userId,
      playlistId: playlist.id,
    }).first(),
  ]);
  const trackById = new Map(trackRows.map((track) => [track.id, track]));
  const albumIdByTrack = new Map(
    projections.map((track) => [track.id, track.albumId]),
  );
  const likedTrackIds = new Set(likedRows.map((like) => like.trackId));

  const entries = itemRows.map((item): PlaylistEntryResponse => {
    const trackRow =
      (item.trackId ? trackById.get(item.trackId) : undefined) ??
      externalMatches.get(item.id) ??
      null;
    const track: TrackResponse | null = trackRow
      ? toTrackResponse(
          trackRow,
          playbackTokens,
          likedTrackIds.has(trackRow.id),
          albumIdByTrack.get(trackRow.id) ?? null,
        )
      : null;
    return {
      id: item.id,
      position: item.position,
      title: track?.title ?? item.snapshotTitle,
      artist: track?.artist ?? item.snapshotArtist,
      artists: track?.artists ?? [item.snapshotArtist],
      album: track?.album ?? item.snapshotAlbum,
      durationMs: track?.durationMs ?? item.snapshotDuration,
      coverUrl: track?.coverUrl ?? null,
      available: Boolean(track?.available),
      liked: Boolean(track?.liked),
      track,
      external: itemSnapshot(item),
    };
  });

  const coverUrls = [
    ...new Set(
      entries.flatMap((entry) => (entry.coverUrl ? [entry.coverUrl] : [])),
    ),
  ].slice(0, 9);
  const durations = entries.flatMap((entry) =>
    entry.durationMs === null ? [] : [entry.durationMs],
  );

  return {
    id: playlist.id,
    kind: "manual",
    name: playlist.name,
    trackCount: entries.length,
    availableTrackCount: entries.filter((entry) => entry.available).length,
    durationMs: durations.length
      ? durations.reduce((total, duration) => total + duration, 0)
      : null,
    coverUrls,
    liked: Boolean(likedPlaylist),
    containsTrack: containsTrackId
      ? entries.some((entry) => entry.track?.id === containsTrackId)
      : false,
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
    entries,
  };
}

async function loadOwnedPlaylist(
  database: Database,
  userId: string,
  playlistId: string,
): Promise<PlaylistRow | null> {
  return database.orm.Playlist.where({ id: playlistId, userId }).first();
}

async function sendPlaylistNotFound(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    404,
    "playlist_not_found",
    "Playlist not found",
    message("api.message.playlistNotFound"),
  );
}

function parsePageValue(
  value: string | undefined,
  fallback: number,
  maximum?: number,
): number | null {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  if (maximum !== undefined && parsed < 1) return null;
  if (maximum !== undefined && parsed > maximum) return null;
  return parsed;
}

export async function registerPlaylistRoutes(
  app: FastifyInstance,
  database: Database,
  playbackTokens: PlaybackTokenService,
) {
  app.get<{ Querystring: PlaylistListQuery }>(
    "/api/playlists",
    async (request, reply): Promise<PlaylistListResponse | undefined> => {
      const limit = parsePageValue(request.query.limit, 50, 100);
      const offset = parsePageValue(request.query.offset, 0);
      if (limit === null || offset === null) {
        return sendError(
          reply,
          400,
          "invalid_playlist_page",
          "limit must be between 1 and 100, and offset must be non-negative",
          message("api.message.invalidPlaylistPage"),
        );
      }
      const containsTrackId =
        request.query.trackId === undefined
          ? null
          : parseId(request.query.trackId);
      if (request.query.trackId !== undefined && !containsTrackId) {
        return sendError(
          reply,
          400,
          "invalid_playlist_track",
          "trackId must be a non-empty track ID",
          message("api.message.invalidPlaylistTrack"),
        );
      }
      const userId = request.authenticatedUser!.id;
      const terms = searchTerms([request.query.query]);
      const likedPlaylist = terms.every((term) =>
        normalizeSearchText(LIKED_TRACKS_PLAYLIST_NAME).includes(term),
      )
        ? await materializeLikedTracksPlaylist(
            database,
            playbackTokens,
            userId,
            containsTrackId,
          )
        : null;
      const automaticCount = likedPlaylist ? 1 : 0;
      const manualOffset = Math.max(0, offset - automaticCount);
      const manualLimit = Math.max(
        0,
        limit - (offset < automaticCount ? 1 : 0),
      );
      let playlists: PlaylistRow[] = [];
      let manualTotalCount: number;
      if (terms.length) {
        const orderedPlaylists = await database.orm.Playlist.where({
          userId,
        })
          .orderBy([
            (playlist) => playlist.updatedAt.desc(),
            (playlist) => playlist.id.desc(),
          ])
          .all();
        const matchingPlaylists = orderedPlaylists.filter((playlist) => {
          const name = normalizeSearchText(playlist.name);
          return terms.every((term) => name.includes(term));
        });
        manualTotalCount = matchingPlaylists.length;
        playlists = matchingPlaylists.slice(
          manualOffset,
          manualOffset + manualLimit,
        );
      } else {
        const aggregate = await database.orm.Playlist.where({
          userId,
        }).aggregate((value) => ({
          count: value.count(),
        }));
        manualTotalCount = aggregate.count;
        if (manualLimit > 0) {
          playlists = await database.orm.Playlist.where({ userId })
            .orderBy([
              (playlist) => playlist.updatedAt.desc(),
              (playlist) => playlist.id.desc(),
            ])
            .offset(manualOffset)
            .limit(manualLimit)
            .all();
        }
      }
      const details = await Promise.all(
        playlists.map((playlist) =>
          materializePlaylist(
            database,
            playbackTokens,
            userId,
            playlist,
            containsTrackId,
          ),
        ),
      );
      const items = [
        ...(offset === 0 && likedPlaylist
          ? [summaryFromDetail(likedPlaylist)]
          : []),
        ...details.map(summaryFromDetail),
      ];
      const totalCount = manualTotalCount + automaticCount;
      return {
        items,
        totalCount,
        nextOffset:
          offset + items.length < totalCount ? offset + items.length : null,
      };
    },
  );

  app.post<{ Body: Partial<CreatePlaylistRequest> }>(
    "/api/playlists",
    async (request, reply) => {
      const name = normalizeName(request.body?.name);
      if (!name) {
        return sendError(
          reply,
          400,
          "invalid_playlist_name",
          `Use a playlist name between 1 and ${MAX_PLAYLIST_NAME_LENGTH} characters`,
          message("api.message.invalidPlaylistName"),
        );
      }
      const userId = request.authenticatedUser!.id;
      const created = await database.orm.Playlist.create({ userId, name });
      return reply
        .code(201)
        .send(
          await materializePlaylist(database, playbackTokens, userId, created),
        );
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/playlists/:id",
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      if (isLikedTracksPlaylist(request.params.id)) {
        return materializeLikedTracksPlaylist(database, playbackTokens, userId);
      }
      const playlist = await loadOwnedPlaylist(
        database,
        userId,
        request.params.id,
      );
      if (!playlist) return sendPlaylistNotFound(reply);
      return materializePlaylist(database, playbackTokens, userId, playlist);
    },
  );

  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>(
    "/api/playlists/:id",
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      if (isLikedTracksPlaylist(request.params.id)) {
        return sendAutomaticPlaylistReadOnly(reply);
      }
      const playlist = await loadOwnedPlaylist(
        database,
        userId,
        request.params.id,
      );
      if (!playlist) return sendPlaylistNotFound(reply);
      const name = normalizeName(request.body?.name);
      if (!name) {
        return sendError(
          reply,
          400,
          "invalid_playlist_name",
          `Use a playlist name between 1 and ${MAX_PLAYLIST_NAME_LENGTH} characters`,
          message("api.message.invalidPlaylistName"),
        );
      }
      await database.orm.Playlist.where({
        id: playlist.id,
      }).update({ name });
      return materializePlaylist(
        database,
        playbackTokens,
        userId,
        (await loadOwnedPlaylist(database, userId, playlist.id))!,
      );
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/playlists/:id",
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      if (isLikedTracksPlaylist(request.params.id)) {
        return sendAutomaticPlaylistReadOnly(reply);
      }
      const playlist = await loadOwnedPlaylist(
        database,
        userId,
        request.params.id,
      );
      if (!playlist) return sendPlaylistNotFound(reply);
      await database.orm.Playlist.where({ id: playlist.id }).delete();
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/playlists/:id/items",
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      if (isLikedTracksPlaylist(request.params.id)) {
        return sendAutomaticPlaylistReadOnly(reply);
      }
      const playlist = await loadOwnedPlaylist(
        database,
        userId,
        request.params.id,
      );
      if (!playlist) return sendPlaylistNotFound(reply);
      const parsed = parsePlaylistItem(request.body);
      if (!parsed) {
        return sendError(
          reply,
          400,
          "invalid_playlist_item",
          "Choose a catalog track or provide a complete external track reference.",
          message("api.message.invalidPlaylistItem"),
        );
      }

      const normalized =
        parsed.kind === "catalog"
          ? {
              ...parsed,
              trackId: await canonicalTrackId(database, parsed.trackId),
            }
          : parsed;
      const key = identityKey(normalized);
      const existing = await database.orm.PlaylistItem.where({
        playlistId: playlist.id,
        identityKey: key,
      }).first();
      if (existing) {
        return {
          added: false,
          playlist: await materializePlaylist(
            database,
            playbackTokens,
            userId,
            playlist,
          ),
        };
      }

      const itemCount = (
        await database.orm.PlaylistItem.where({
          playlistId: playlist.id,
        }).aggregate((aggregate) => ({ count: aggregate.count() }))
      ).count;
      if (itemCount >= MAX_PLAYLIST_ITEMS) {
        return sendError(
          reply,
          400,
          "playlist_full",
          "This playlist has reached its item limit",
          message("api.message.playlistFull"),
        );
      }

      let snapshot: PlaylistExternalTrackReference | null = null;
      let trackId: string | null = null;
      if (normalized.kind === "catalog") {
        const track = await database.orm.Track.first({
          id: normalized.trackId,
        });
        if (!track) {
          return sendError(
            reply,
            404,
            "track_not_found",
            "Track not found",
            message("api.message.trackNotFound"),
          );
        }
        const effective = effectiveTrackFields(track);
        snapshot = {
          provider: "",
          externalTrackId: "",
          title: effective.title,
          artist: effective.artist,
          album: effective.album,
          durationMs: effective.durationMs,
        };
        trackId = track.id;
      } else {
        snapshot = normalized.reference;
      }

      const last = await database.orm.PlaylistItem.where({
        playlistId: playlist.id,
      })
        .orderBy((item) => item.position.desc())
        .select("position")
        .first();
      const nextPosition = (last?.position ?? -1) + 1;
      await database.transaction(async (transaction) => {
        await transaction.orm.PlaylistItem.create({
          playlistId: playlist.id,
          position: nextPosition,
          identityKey: key,
          trackId,
          externalProvider:
            normalized.kind === "external"
              ? normalized.reference.provider
              : null,
          externalTrackId:
            normalized.kind === "external"
              ? normalized.reference.externalTrackId
              : null,
          snapshotTitle: snapshot!.title,
          snapshotArtist: snapshot!.artist,
          snapshotAlbum: snapshot!.album,
          snapshotDuration: snapshot!.durationMs,
        });
        await transaction.orm.Playlist.where({ id: playlist.id }).update({
          updatedAt: new Date(),
        });
      });
      return reply.code(201).send({
        added: true,
        playlist: await materializePlaylist(
          database,
          playbackTokens,
          userId,
          (await loadOwnedPlaylist(database, userId, playlist.id))!,
        ),
      });
    },
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/api/playlists/:id/items/:itemId",
    async (request, reply) => {
      const userId = request.authenticatedUser!.id;
      if (isLikedTracksPlaylist(request.params.id)) {
        return sendAutomaticPlaylistReadOnly(reply);
      }
      const playlist = await loadOwnedPlaylist(
        database,
        userId,
        request.params.id,
      );
      if (!playlist) return sendPlaylistNotFound(reply);
      const item = await database.orm.PlaylistItem.where({
        id: request.params.itemId,
        playlistId: playlist.id,
      }).first();
      if (!item) {
        return sendError(
          reply,
          404,
          "playlist_item_not_found",
          "Playlist item not found",
          message("api.message.playlistItemNotFound"),
        );
      }
      await database.transaction(async (transaction) => {
        await transaction.orm.PlaylistItem.where({ id: item.id }).delete();
        const remaining = await transaction.orm.PlaylistItem.where({
          playlistId: playlist.id,
        })
          .orderBy((entry) => entry.position.asc())
          .all();
        for (const [position, entry] of remaining.entries()) {
          if (entry.position !== position) {
            await transaction.orm.PlaylistItem.where({
              id: entry.id,
            }).update({ position });
          }
        }
        await transaction.orm.Playlist.where({ id: playlist.id }).update({
          updatedAt: new Date(),
        });
      });
      return reply.code(204).send();
    },
  );

  app.put<{
    Params: { id: string };
    Body: Partial<ReorderPlaylistItemsRequest>;
  }>("/api/playlists/:id/items/order", async (request, reply) => {
    const userId = request.authenticatedUser!.id;
    if (isLikedTracksPlaylist(request.params.id)) {
      return sendAutomaticPlaylistReadOnly(reply);
    }
    const playlist = await loadOwnedPlaylist(
      database,
      userId,
      request.params.id,
    );
    if (!playlist) return sendPlaylistNotFound(reply);
    const itemIds = request.body?.itemIds;
    if (
      !Array.isArray(itemIds) ||
      itemIds.some((id) => !parseId(id)) ||
      new Set(itemIds).size !== itemIds.length
    ) {
      return sendError(
        reply,
        400,
        "invalid_playlist_order",
        "Playlist order must contain unique item IDs",
        message("api.message.invalidPlaylistOrder"),
      );
    }
    const items = await database.orm.PlaylistItem.where({
      playlistId: playlist.id,
    }).all();
    if (
      items.length !== itemIds.length ||
      items.some((item) => !itemIds.includes(item.id))
    ) {
      return sendError(
        reply,
        409,
        "playlist_items_changed",
        "The playlist changed while it was being reordered",
        message("api.message.playlistItemsChanged"),
      );
    }
    await database.transaction(async (transaction) => {
      for (const [position, itemId] of itemIds.entries()) {
        await transaction.orm.PlaylistItem.where({ id: itemId }).update({
          position,
        });
      }
      await transaction.orm.Playlist.where({ id: playlist.id }).update({
        updatedAt: new Date(),
      });
    });
    return materializePlaylist(
      database,
      playbackTokens,
      userId,
      (await loadOwnedPlaylist(database, userId, playlist.id))!,
    );
  });
}
