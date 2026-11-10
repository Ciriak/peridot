import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  LikeListResponse,
  LikeResponse,
  LikeTarget,
  TrackLikeResponse,
} from "@peridot/contracts";
import type { FastifyInstance } from "fastify";
import type {
  AlbumLike,
  ArtistLike,
  TrackLike,
} from "./generated/prisma/client.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";

const MAX_LIKE_LABEL_LENGTH = 512;
const MAX_TRACK_ID_LENGTH = 200;

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
    validLabel(value.title) &&
    validLabel(value.artist)
  ) {
    return {
      kind: "album",
      title: value.title.trim(),
      artist: value.artist.trim(),
    };
  }
  if (value.kind === "artist" && validLabel(value.name)) {
    return { kind: "artist", name: value.name.trim() };
  }
  return null;
}

function trackLikeResponse(like: TrackLike): TrackLikeResponse {
  return {
    trackId: like.trackId,
    likedAt: like.createdAt.toISOString(),
  };
}

function albumLikeResponse(like: AlbumLike): AlbumLikeResponse {
  return {
    title: like.title,
    artist: like.artist,
    likedAt: like.createdAt.toISOString(),
  };
}

function artistLikeResponse(like: ArtistLike): ArtistLikeResponse {
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
      database.trackLike.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      database.albumLike.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      database.artistLike.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
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
      );
    }
    const userId = request.authenticatedUser!.id;

    if (target.kind === "track") {
      const track = await database.track.findUnique({
        where: { id: target.trackId },
        select: { id: true },
      });
      if (!track) {
        return sendError(reply, 404, "track_not_found", "Track not found");
      }
      const like = await database.trackLike.upsert({
        where: {
          userId_trackId: { userId, trackId: track.id },
        },
        create: { userId, trackId: track.id },
        update: {},
      });
      const response: LikeResponse = {
        kind: "track",
        ...trackLikeResponse(like),
      };
      return response;
    }

    if (target.kind === "album") {
      const normalizedArtist = normalize(target.artist);
      const normalizedTitle = normalize(target.title);
      const like = await database.albumLike.upsert({
        where: {
          userId_normalizedArtist_normalizedTitle: {
            userId,
            normalizedArtist,
            normalizedTitle,
          },
        },
        create: {
          userId,
          title: target.title,
          artist: target.artist,
          normalizedTitle,
          normalizedArtist,
        },
        update: {},
      });
      const response: LikeResponse = {
        kind: "album",
        ...albumLikeResponse(like),
      };
      return response;
    }

    const normalizedName = normalize(target.name);
    const like = await database.artistLike.upsert({
      where: {
        userId_normalizedName: { userId, normalizedName },
      },
      create: {
        userId,
        name: target.name,
        normalizedName,
      },
      update: {},
    });
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
      );
    }
    const userId = request.authenticatedUser!.id;

    if (target.kind === "track") {
      const track = await database.track.findUnique({
        where: { id: target.trackId },
        select: { id: true },
      });
      if (!track) {
        return sendError(reply, 404, "track_not_found", "Track not found");
      }
      await database.trackLike.deleteMany({
        where: { userId, trackId: track.id },
      });
    } else if (target.kind === "album") {
      await database.albumLike.deleteMany({
        where: {
          userId,
          normalizedArtist: normalize(target.artist),
          normalizedTitle: normalize(target.title),
        },
      });
    } else {
      await database.artistLike.deleteMany({
        where: { userId, normalizedName: normalize(target.name) },
      });
    }

    return reply.code(204).send();
  });
}
