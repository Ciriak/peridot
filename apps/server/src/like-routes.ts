import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  AudiobookLikeResponse,
  LikeListResponse,
  LikeResponse,
  LikeTarget,
  PlaylistLikeResponse,
  PodcastLikeResponse,
  TrackLikeResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { canonicalTrackId } from "./duplicate-resolver.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type {
  AlbumLikeRow,
  ArtistLikeRow,
  PlaylistLikeRow,
  TrackLikeRow,
} from "./prisma/models.js";

const MAX_LIKE_LABEL_LENGTH = 512;
const MAX_TRACK_ID_LENGTH = 200;
const MAX_ALBUM_ID_LENGTH = 200;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function validLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_LIKE_LABEL_LENGTH
  );
}

function validTrackId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_TRACK_ID_LENGTH
  );
}

function parseLikeTarget(body: unknown): LikeTarget | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (value.kind === "track" && validTrackId(value.trackId)) {
    return { kind: "track", trackId: value.trackId.trim() };
  }
  if (
    value.kind === "album" &&
    validTrackId(value.albumId) &&
    String(value.albumId).trim().length <= MAX_ALBUM_ID_LENGTH &&
    validLabel(value.title) &&
    validLabel(value.artist)
  ) {
    return {
      kind: "album",
      albumId: String(value.albumId).trim(),
      title: value.title.trim(),
      artist: value.artist.trim(),
    };
  }
  if (
    value.kind === "audiobook" &&
    validTrackId(value.audiobookId) &&
    validLabel(value.title) &&
    validLabel(value.author)
  ) {
    return {
      kind: "audiobook",
      audiobookId: String(value.audiobookId).trim(),
      title: value.title.trim(),
      author: value.author.trim(),
    };
  }
  if (
    value.kind === "podcast" &&
    validTrackId(value.podcastId) &&
    validLabel(value.title) &&
    validLabel(value.publisher)
  ) {
    return {
      kind: "podcast",
      podcastId: String(value.podcastId).trim(),
      title: value.title.trim(),
      publisher: value.publisher.trim(),
    };
  }
  if (value.kind === "artist" && validLabel(value.name)) {
    return { kind: "artist", name: value.name.trim() };
  }
  if (
    value.kind === "playlist" &&
    validTrackId(value.playlistId) &&
    validLabel(value.name)
  ) {
    return {
      kind: "playlist",
      playlistId: value.playlistId.trim(),
      name: value.name.trim(),
    };
  }
  return null;
}

function trackLikeResponse(like: TrackLikeRow): TrackLikeResponse {
  return {
    trackId: like.trackId,
    likedAt: like.createdAt.toISOString(),
  };
}

function albumLikeResponse(like: AlbumLikeRow): AlbumLikeResponse {
  return {
    albumId: like.albumId,
    title: like.title,
    artist: like.artist,
    likedAt: like.createdAt.toISOString(),
  };
}

function audiobookLikeResponse(like: AlbumLikeRow): AudiobookLikeResponse {
  return {
    audiobookId: like.albumId,
    title: like.title,
    author: like.artist,
    likedAt: like.createdAt.toISOString(),
  };
}

function podcastLikeResponse(like: AlbumLikeRow): PodcastLikeResponse {
  return {
    podcastId: like.albumId,
    title: like.title,
    publisher: like.artist,
    likedAt: like.createdAt.toISOString(),
  };
}

function artistLikeResponse(like: ArtistLikeRow): ArtistLikeResponse {
  return {
    name: like.name,
    likedAt: like.createdAt.toISOString(),
  };
}

function playlistLikeResponse(
  like: PlaylistLikeRow,
  name: string,
): PlaylistLikeResponse {
  return {
    playlistId: like.playlistId,
    name,
    likedAt: like.createdAt.toISOString(),
  };
}

export async function registerLikeRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.get("/api/likes", async (request): Promise<LikeListResponse> => {
    const userId = request.authenticatedUser!.id;
    const [tracks, albums, artists, playlists] = await Promise.all([
      database.orm.TrackLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
      database.orm.AlbumLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
      database.orm.ArtistLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
      database.orm.PlaylistLike.where({ userId })
        .include("playlist")
        .orderBy((like) => like.createdAt.desc())
        .all(),
    ]);
    return {
      tracks: tracks.map(trackLikeResponse),
      albums: albums
        .filter((like) => like.albumId.startsWith("album_"))
        .map(albumLikeResponse),
      audiobooks: albums
        .filter((like) => like.albumId.startsWith("audiobook_"))
        .map(audiobookLikeResponse),
      podcasts: albums
        .filter((like) => like.albumId.startsWith("podcast_"))
        .map(podcastLikeResponse),
      artists: artists.map(artistLikeResponse),
      playlists: playlists.map((like) =>
        playlistLikeResponse(like, like.playlist.name),
      ),
    };
  });

  app.post<{ Body: unknown }>("/api/likes", async (request, reply) => {
    const target = parseLikeTarget(request.body);
    if (!target) {
      return sendError(
        reply,
        400,
        "invalid_like",
        "Choose a valid track, album, or artist to like.",
        message("api.message.invalidLikeTarget"),
      );
    }
    const userId = request.authenticatedUser!.id;

    if (target.kind === "track") {
      const resolvedTrackId = await canonicalTrackId(database, target.trackId);
      const track = await database.orm.Track.select("id").first({
        id: resolvedTrackId,
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
      const like =
        (await database.orm.TrackLike.where({
          userId,
          trackId: track.id,
        }).first()) ??
        (await database.orm.TrackLike.create({
          userId,
          trackId: track.id,
        }));
      const response: LikeResponse = {
        kind: "track",
        ...trackLikeResponse(like),
      };
      return response;
    }

    if (target.kind === "album") {
      const album = await database.orm.CatalogAlbum.where({
        id: target.albumId,
        mediaType: "music",
      }).first();
      if (!album || album.trackCount < 1) {
        return sendError(
          reply,
          404,
          "album_not_found",
          "Album not found",
          message("api.message.albumNotFound"),
        );
      }
      const like =
        (await database.orm.AlbumLike.where({
          userId,
          albumId: album.id,
        }).first()) ??
        (await database.orm.AlbumLike.create({
          userId,
          albumId: album.id,
          title: album.title,
          artist: album.artist,
        }));
      const response: LikeResponse = {
        kind: "album",
        ...albumLikeResponse(like),
      };
      return response;
    }

    if (target.kind === "audiobook" || target.kind === "podcast") {
      const collectionId =
        target.kind === "audiobook" ? target.audiobookId : target.podcastId;
      const collection = await database.orm.CatalogAlbum.where({
        id: collectionId,
        mediaType: target.kind,
      }).first();
      if (!collection || collection.trackCount < 1) {
        return sendError(
          reply,
          404,
          `${target.kind}_not_found`,
          `${target.kind === "audiobook" ? "Audiobook" : "Podcast"} not found`,
          message(
            target.kind === "audiobook"
              ? "api.message.audiobookNotFound"
              : "api.message.podcastNotFound",
          ),
        );
      }
      const like =
        (await database.orm.AlbumLike.where({
          userId,
          albumId: collection.id,
        }).first()) ??
        (await database.orm.AlbumLike.create({
          userId,
          albumId: collection.id,
          title: collection.title,
          artist: collection.artist,
        }));
      const response: LikeResponse =
        target.kind === "audiobook"
          ? {
              kind: "audiobook",
              ...audiobookLikeResponse(like),
            }
          : {
              kind: "podcast",
              ...podcastLikeResponse(like),
            };
      return response;
    }

    if (target.kind === "playlist") {
      const playlist = await database.orm.Playlist.where({
        id: target.playlistId,
        userId,
      }).first();
      if (!playlist) {
        return sendError(
          reply,
          404,
          "playlist_not_found",
          "Playlist not found",
          message("api.message.playlistNotFound"),
        );
      }
      const like =
        (await database.orm.PlaylistLike.where({
          userId,
          playlistId: playlist.id,
        }).first()) ??
        (await database.orm.PlaylistLike.create({
          userId,
          playlistId: playlist.id,
        }));
      const response: LikeResponse = {
        kind: "playlist",
        ...playlistLikeResponse(like, playlist.name),
      };
      return response;
    }

    const normalizedName = normalize(target.name);
    const like =
      (await database.orm.ArtistLike.where({
        userId,
        normalizedName,
      }).first()) ??
      (await database.orm.ArtistLike.create({
        userId,
        name: target.name,
        normalizedName,
      }));
    const response: LikeResponse = {
      kind: "artist",
      ...artistLikeResponse(like),
    };
    return response;
  });

  app.delete<{ Body: unknown }>("/api/likes", async (request, reply) => {
    const target = parseLikeTarget(request.body);
    if (!target) {
      return sendError(
        reply,
        400,
        "invalid_like",
        "Choose a valid track, album, or artist to unlike.",
        message("api.message.invalidLikeTarget"),
      );
    }
    const userId = request.authenticatedUser!.id;

    if (target.kind === "track") {
      const resolvedTrackId = await canonicalTrackId(database, target.trackId);
      const track = await database.orm.Track.select("id").first({
        id: resolvedTrackId,
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
      await database.orm.TrackLike.where({
        userId,
        trackId: track.id,
      }).deleteAndCount();
    } else if (
      target.kind === "album" ||
      target.kind === "audiobook" ||
      target.kind === "podcast"
    ) {
      const albumId =
        target.kind === "album"
          ? target.albumId
          : target.kind === "audiobook"
            ? target.audiobookId
            : target.podcastId;
      await database.orm.AlbumLike.where({
        userId,
        albumId,
      }).deleteAndCount();
    } else if (target.kind === "artist") {
      await database.orm.ArtistLike.where({
        userId,
        normalizedName: normalize(target.name),
      }).deleteAndCount();
    } else {
      await database.orm.PlaylistLike.where({
        userId,
        playlistId: target.playlistId,
      }).deleteAndCount();
    }

    return reply.code(204).send();
  });
}
