import type {
  AlbumListResponse,
  ArtistListResponse,
  AudiobookListResponse,
  PodcastListResponse,
  ResolveTracksRequest,
  ResolveTracksResponse,
  TrackListResponse,
} from "@peridot/contracts";
import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { ARTWORK_MIME_TYPE, type ArtworkCache } from "./artwork-cache.js";
import { CatalogError, type CatalogService } from "./catalog.js";
import { sendError } from "./http.js";
import { message } from "./messages.js";

interface CursorQuery {
  cursor?: string;
  limit?: string;
  sort?: string;
  direction?: string;
  query?: string;
  availability?: string;
  albumId?: string;
  artistId?: string;
  liked?: string;
  mediaType?: string;
  collectionId?: string;
}

function limitNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? limit : NaN;
}

function handleCatalogError(
  reply: Parameters<typeof sendError>[0],
  error: unknown,
) {
  if (error instanceof CatalogError) {
    sendError(
      reply,
      error.code === "stale_catalog_cursor" ? 409 : 400,
      error.code,
      error.message,
      error.messageDescriptor,
    );
    return undefined;
  }
  throw error;
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  catalog: CatalogService,
  artworkCache: ArtworkCache,
) {
  app.get<{ Querystring: CursorQuery }>(
    "/api/tracks",
    async (request, reply): Promise<TrackListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listTracks({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.post<{ Body: ResolveTracksRequest }>(
    "/api/tracks/resolve",
    async (request, reply): Promise<ResolveTracksResponse | undefined> => {
      const ids = request.body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.some((id) => typeof id !== "string" || !id.trim()) ||
        ids.length > 500
      ) {
        return sendError(
          reply,
          400,
          "invalid_catalog_query",
          "ids must contain at most 500 non-empty track IDs",
          message("api.message.invalidTrackResolve"),
        );
      }
      try {
        return await catalog.resolveTracks(ids, request.authenticatedUser!.id);
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/albums",
    async (request, reply): Promise<AlbumListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listAlbums({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/albums/:id",
    async (request, reply) => {
      const album = await catalog.album(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!album) {
        return sendError(
          reply,
          404,
          "album_not_found",
          "Album not found",
          message("api.message.albumNotFound"),
        );
      }
      return album;
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/audiobooks",
    async (request, reply): Promise<AudiobookListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listAudiobooks({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/audiobooks/:id",
    async (request, reply) => {
      const audiobook = await catalog.audiobook(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!audiobook) {
        return sendError(
          reply,
          404,
          "audiobook_not_found",
          "Audiobook not found",
          message("api.message.audiobookNotFound"),
        );
      }
      return audiobook;
    },
  );

  app.get<{ Params: { id: string }; Querystring: CursorQuery }>(
    "/api/audiobooks/:id/chapters",
    async (request, reply): Promise<TrackListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listTracks({
          userId: request.authenticatedUser!.id,
          ...query,
          mediaType: "audiobook",
          collectionId: request.params.id,
          sort: query.sort ?? "track",
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/podcasts",
    async (request, reply): Promise<PodcastListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listPodcasts({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/podcasts/:id",
    async (request, reply) => {
      const podcast = await catalog.podcast(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!podcast) {
        return sendError(
          reply,
          404,
          "podcast_not_found",
          "Podcast not found",
          message("api.message.podcastNotFound"),
        );
      }
      return podcast;
    },
  );

  app.get<{ Params: { id: string }; Querystring: CursorQuery }>(
    "/api/podcasts/:id/episodes",
    async (request, reply): Promise<TrackListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listTracks({
          userId: request.authenticatedUser!.id,
          ...query,
          mediaType: "podcast",
          collectionId: request.params.id,
          sort: query.sort ?? "published",
          direction: query.direction ?? "desc",
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Querystring: CursorQuery }>(
    "/api/artists",
    async (request, reply): Promise<ArtistListResponse | undefined> => {
      try {
        const { limit: rawLimit, ...query } = request.query;
        const limit = limitNumber(rawLimit);
        return await catalog.listArtists({
          userId: request.authenticatedUser!.id,
          ...query,
          ...(limit === undefined ? {} : { limit }),
        });
      } catch (error) {
        return handleCatalogError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/artists/:id",
    async (request, reply) => {
      const artist = await catalog.artist(
        request.params.id,
        request.authenticatedUser!.id,
      );
      if (!artist) {
        return sendError(
          reply,
          404,
          "artist_not_found",
          "Artist not found",
          message("api.message.artistNotFound"),
        );
      }
      return artist;
    },
  );

  const sendArtistImage = async (
    request: { params: { id: string } },
    reply: Parameters<typeof sendError>[0],
    head: boolean,
  ) => {
    const image = await catalog.artistImage(request.params.id);
    const file = image ? await artworkCache.read(image.hash) : null;
    if (!file) {
      return sendError(
        reply,
        404,
        "artist_image_not_found",
        "Artist image not found",
        message("api.message.artistImageNotFound"),
      );
    }
    reply
      .header("Cache-Control", "private, max-age=14400")
      .header("Content-Length", file.size)
      .header("Content-Type", ARTWORK_MIME_TYPE);
    return head ? reply.send() : reply.send(createReadStream(file.path));
  };

  app.get<{ Params: { id: string } }>(
    "/api/artists/:id/image",
    { exposeHeadRoute: false },
    async (request, reply) => sendArtistImage(request, reply, false),
  );
  app.head<{ Params: { id: string } }>(
    "/api/artists/:id/image",
    async (request, reply) => sendArtistImage(request, reply, true),
  );
}
