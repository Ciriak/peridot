import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  LikeListResponse,
  LikeResponse,
  LikeTarget,
  TrackLikeResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";
import type {
  AlbumLikeRow,
  ArtistLikeRow,
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
  if (value.kind === "artist" && validLabel(value.name)) {
    return { kind: "artist", name: value.name.trim() };
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

function artistLikeResponse(like: ArtistLikeRow): ArtistLikeResponse {
  return {
    name: like.name,
    likedAt: like.createdAt.toISOString(),
  };
}

export async function registerLikeRoutes(
  app: FastifyInstance,
  database: Database,
) {
  app.get("/api/likes", async (request): Promise<LikeListResponse> => {
    const userId = request.authenticatedUser!.id;
    const [tracks, albums, artists] = await Promise.all([
      database.orm.TrackLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
      database.orm.AlbumLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
      database.orm.ArtistLike.where({ userId })
        .orderBy((like) => like.createdAt.desc())
        .all(),
    ]);
    return {
      tracks: tracks.map(trackLikeResponse),
      albums: albums.map(albumLikeResponse),
      artists: artists.map(artistLikeResponse),
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
      const track = await database.orm.Track.select("id").first({
        id: target.trackId,
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
      const album = await database.orm.CatalogAlbum.first({
        id: target.albumId,
      });
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
      const track = await database.orm.Track.select("id").first({
        id: target.trackId,
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
    } else if (target.kind === "album") {
      await database.orm.AlbumLike.where({
        userId,
        albumId: target.albumId,
      }).deleteAndCount();
    } else {
      await database.orm.ArtistLike.where({
        userId,
        normalizedName: normalize(target.name),
      }).deleteAndCount();
    }

    return reply.code(204).send();
  });
}
