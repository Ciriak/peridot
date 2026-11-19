import type {
  GeneratePluginPlaylistRequest,
  PluginForYouTracksRequest,
  PluginGeneratedPlaylistResponse,
  PluginProviderListResponse,
  PluginRecommendationCandidate,
  PluginRecommendationListResponse,
  PluginSimilarTracksRequest,
  PluginTrackReference,
} from "@peridot/contracts";
import { PluginError } from "@peridot/plugin-sdk";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { CatalogService } from "./catalog.js";
import type { Database } from "./database.js";
import { sendError } from "./http.js";
import type { TrackRow } from "./prisma/models.js";
import type { PluginService } from "./plugins.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_TASTE_TRACKS = 100;

function parsedLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  return Number.isSafeInteger(value) &&
    Number(value) >= 1 &&
    Number(value) <= MAX_LIMIT
    ? Number(value)
    : null;
}

function trackReference(
  track: TrackRow,
  sourcePluginId: string | null,
): PluginTrackReference | null {
  if (!track.sourceId) return null;
  return {
    trackId: track.id,
    sourceId: track.sourceId,
    sourcePluginId,
    externalId: track.externalId,
  };
}

async function loadTrackReference(
  database: Database,
  trackId: unknown,
): Promise<PluginTrackReference | null> {
  if (typeof trackId !== "string" || !trackId.trim()) return null;
  const track = await database.orm.Track.where({ id: trackId.trim() })
    .include("source")
    .first();
  if (!track) return null;
  return trackReference(track, track.source?.pluginId ?? null);
}

async function tasteReferences(
  database: Database,
  userId: string,
): Promise<{
  recentTracks: PluginTrackReference[];
  likedTracks: PluginTrackReference[];
}> {
  const [events, likes] = await Promise.all([
    database.orm.TrackPlayEvent.where({ userId }).all(),
    database.orm.TrackLike.where({ userId }).all(),
  ]);
  const recentIds = [
    ...new Set(
      events
        .sort(
          (left, right) => right.playedAt.getTime() - left.playedAt.getTime(),
        )
        .map((event) => event.trackId),
    ),
  ].slice(0, MAX_TASTE_TRACKS);
  const likedIds = [
    ...new Set(
      likes
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )
        .map((like) => like.trackId),
    ),
  ].slice(0, MAX_TASTE_TRACKS);
  const ids = [...new Set([...recentIds, ...likedIds])];
  if (!ids.length) return { recentTracks: [], likedTracks: [] };
  const rows = await database.orm.Track.where((track) => track.id.in(ids))
    .include("source")
    .all();
  const byId = new Map(
    rows.flatMap((track) => {
      const reference = trackReference(track, track.source?.pluginId ?? null);
      return reference ? [[track.id, reference] as const] : [];
    }),
  );
  return {
    recentTracks: recentIds.flatMap((id) => {
      const reference = byId.get(id);
      return reference ? [reference] : [];
    }),
    likedTracks: likedIds.flatMap((id) => {
      const reference = byId.get(id);
      return reference ? [reference] : [];
    }),
  };
}

async function materializeCandidates(
  database: Database,
  catalog: CatalogService,
  userId: string,
  candidates: readonly PluginRecommendationCandidate[],
): Promise<PluginRecommendationListResponse> {
  if (!candidates.length) return { items: [], unmatchedCount: 0 };
  const sourceIds = [...new Set(candidates.map((item) => item.sourceId))];
  const externalIds = [...new Set(candidates.map((item) => item.externalId))];
  const rows = await database.orm.Track.where((track) =>
    track.sourceId.in(sourceIds),
  )
    .where((track) => track.externalId.in(externalIds))
    .where({ available: 1 })
    .all();
  const tracksByReference = new Map(
    rows.flatMap((track) =>
      track.sourceId && track.externalId
        ? [[JSON.stringify([track.sourceId, track.externalId]), track] as const]
        : [],
    ),
  );
  const matched = candidates.flatMap((candidate) => {
    const track = tracksByReference.get(
      JSON.stringify([candidate.sourceId, candidate.externalId]),
    );
    return track ? [{ candidate, track }] : [];
  });
  const tracks = new Map(
    (
      await catalog.resolveTracks(
        [...new Set(matched.map((item) => item.track.id))],
        userId,
      )
    ).items.map((track) => [track.id, track]),
  );
  const items = matched.flatMap(({ candidate, track }) => {
    const response = tracks.get(track.id);
    return response
      ? [
          {
            track: response,
            score: candidate.score,
            reason: candidate.reason,
          },
        ]
      : [];
  });
  return {
    items,
    unmatchedCount: candidates.length - items.length,
  };
}

function requestAbort(reply: FastifyReply, raw: NodeJS.EventEmitter) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  raw.once("aborted", abort);
  reply.raw.once("close", abort);
  return {
    signal: controller.signal,
    close() {
      raw.off("aborted", abort);
      reply.raw.off("close", abort);
    },
  };
}

function pluginError(reply: FastifyReply, error: unknown) {
  if (error instanceof PluginError) {
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

export async function registerPluginRoutes(
  app: FastifyInstance,
  database: Database,
  plugins: PluginService,
  catalog: CatalogService,
) {
  app.get(
    "/api/plugins/providers",
    async (): Promise<PluginProviderListResponse> => plugins.providers(),
  );

  app.post<{ Params: { id: string }; Body: PluginSimilarTracksRequest }>(
    "/api/plugins/:id/recommendations/similar",
    async (request, reply) => {
      const limit = parsedLimit(request.body?.limit);
      const seed = await loadTrackReference(database, request.body?.trackId);
      if (!limit) {
        return sendError(
          reply,
          400,
          "invalid_plugin_request",
          "Recommendation limit must be between 1 and 100.",
        );
      }
      if (!seed) {
        return sendError(reply, 404, "track_not_found", "Track not found.");
      }
      const abort = requestAbort(reply, request.raw);
      try {
        const candidates = await plugins.similarTracks(
          request.params.id,
          seed,
          limit,
          abort.signal,
        );
        return await materializeCandidates(
          database,
          catalog,
          request.authenticatedUser!.id,
          candidates,
        );
      } catch (error) {
        if (abort.signal.aborted) return reply;
        return pluginError(reply, error);
      } finally {
        abort.close();
      }
    },
  );

  app.post<{ Params: { id: string }; Body: PluginForYouTracksRequest }>(
    "/api/plugins/:id/recommendations/for-you",
    async (request, reply) => {
      const limit = parsedLimit(request.body?.limit);
      if (!limit) {
        return sendError(
          reply,
          400,
          "invalid_plugin_request",
          "Recommendation limit must be between 1 and 100.",
        );
      }
      const abort = requestAbort(reply, request.raw);
      try {
        const taste = await tasteReferences(
          database,
          request.authenticatedUser!.id,
        );
        const candidates = await plugins.forYouTracks(
          request.params.id,
          taste.recentTracks,
          taste.likedTracks,
          limit,
          abort.signal,
        );
        return await materializeCandidates(
          database,
          catalog,
          request.authenticatedUser!.id,
          candidates,
        );
      } catch (error) {
        if (abort.signal.aborted) return reply;
        return pluginError(reply, error);
      } finally {
        abort.close();
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: GeneratePluginPlaylistRequest;
  }>("/api/plugins/:id/playlists/generate", async (request, reply) => {
    const limit = parsedLimit(request.body?.limit);
    const prompt =
      typeof request.body?.prompt === "string"
        ? request.body.prompt.trim().slice(0, 2_000) || null
        : null;
    const name =
      typeof request.body?.name === "string"
        ? request.body.name.trim().slice(0, 160) || null
        : null;
    const seed = request.body?.seedTrackId
      ? await loadTrackReference(database, request.body.seedTrackId)
      : null;
    if (!limit) {
      return sendError(
        reply,
        400,
        "invalid_plugin_request",
        "Playlist limit must be between 1 and 100.",
      );
    }
    if (request.body?.seedTrackId && !seed) {
      return sendError(reply, 404, "track_not_found", "Seed track not found.");
    }
    const abort = requestAbort(reply, request.raw);
    try {
      const taste = await tasteReferences(
        database,
        request.authenticatedUser!.id,
      );
      const generated = await plugins.generatePlaylist(
        request.params.id,
        {
          name,
          prompt,
          seed,
          recentTracks: taste.recentTracks,
          likedTracks: taste.likedTracks,
          limit,
        },
        abort.signal,
      );
      const materialized = await materializeCandidates(
        database,
        catalog,
        request.authenticatedUser!.id,
        generated.items,
      );
      const response: PluginGeneratedPlaylistResponse = {
        name: generated.name,
        ...materialized,
      };
      return response;
    } catch (error) {
      if (abort.signal.aborted) return reply;
      return pluginError(reply, error);
    } finally {
      abort.close();
    }
  });
}
