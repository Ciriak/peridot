import { useI18n, useState } from "#imports";
import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  AudiobookLikeResponse,
  LikeListResponse,
  LikeTarget,
  PlaylistLikeResponse,
  PodcastLikeResponse,
  MediaLikeResponse,
} from "@peridot/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { artistLikeKey } from "../lib/library";
import { localizedError } from "../lib/messages.ts";
import {
  createLike,
  deleteLike,
  isAuthenticationRedirectError,
  listLikes,
} from "../lib/peridot-client";
import {
  persistQueryKey,
  removePersistedQueries,
} from "../lib/query-persister";
import { peridotScopeKey, queryKeys } from "../lib/query-keys";
import { notifyLikeFailed, notifyLikeSucceeded } from "../lib/toasts";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

export function likeTargetKey(target: LikeTarget): string {
  if (target.kind === "media") return `track:${target.mediaId}`;
  if (target.kind === "album") return `album:${target.albumId}`;
  if (target.kind === "audiobook") return `audiobook:${target.audiobookId}`;
  if (target.kind === "podcast") return `podcast:${target.podcastId}`;
  if (target.kind === "playlist") return `playlist:${target.playlistId}`;
  return `artist:${artistLikeKey(target.name)}`;
}

function targetLabel(target: LikeTarget, trackLabel: string): string {
  if (target.kind === "media") return trackLabel;
  if (target.kind === "album") return target.title;
  if (target.kind === "audiobook" || target.kind === "podcast")
    return target.title;
  if (target.kind === "playlist") return target.name;
  return target.name;
}

const EMPTY_LIKES: LikeListResponse = {
  media: [],
  albums: [],
  audiobooks: [],
  podcasts: [],
  artists: [],
  playlists: [],
};

function updateLikedTarget(
  current: LikeListResponse,
  target: LikeTarget,
  liked: boolean,
  item?:
    | MediaLikeResponse
    | AlbumLikeResponse
    | AudiobookLikeResponse
    | ArtistLikeResponse
    | PlaylistLikeResponse
    | PodcastLikeResponse,
): LikeListResponse {
  if (target.kind === "media") {
    if (!liked) {
      return {
        ...current,
        media: current.media.filter(
          (entry) => entry.mediaId !== target.mediaId,
        ),
      };
    }
    const trackItem =
      item && "mediaId" in item
        ? item
        : { mediaId: target.mediaId, likedAt: new Date().toISOString() };
    return {
      ...current,
      media: current.media.some((entry) => entry.mediaId === target.mediaId)
        ? current.media
        : [...current.media, trackItem],
    };
  }
  if (target.kind === "album") {
    const key = target.albumId;
    if (!liked) {
      return {
        ...current,
        albums: current.albums.filter((entry) => entry.albumId !== key),
      };
    }
    const albumItem: AlbumLikeResponse =
      item && "albumId" in item
        ? (item as AlbumLikeResponse)
        : { ...target, likedAt: new Date().toISOString() };
    return {
      ...current,
      albums: current.albums.some((entry) => entry.albumId === key)
        ? current.albums
        : [...current.albums, albumItem],
    };
  }
  if (target.kind === "audiobook") {
    const key = target.audiobookId;
    if (!liked) {
      return {
        ...current,
        audiobooks: current.audiobooks.filter(
          (entry) => entry.audiobookId !== key,
        ),
      };
    }
    const audiobookItem: AudiobookLikeResponse =
      item && "audiobookId" in item
        ? (item as AudiobookLikeResponse)
        : { ...target, likedAt: new Date().toISOString() };
    return {
      ...current,
      audiobooks: current.audiobooks.some((entry) => entry.audiobookId === key)
        ? current.audiobooks
        : [...current.audiobooks, audiobookItem],
    };
  }
  if (target.kind === "podcast") {
    const key = target.podcastId;
    if (!liked) {
      return {
        ...current,
        podcasts: current.podcasts.filter((entry) => entry.podcastId !== key),
      };
    }
    const podcastItem: PodcastLikeResponse =
      item && "podcastId" in item
        ? (item as PodcastLikeResponse)
        : { ...target, likedAt: new Date().toISOString() };
    return {
      ...current,
      podcasts: current.podcasts.some((entry) => entry.podcastId === key)
        ? current.podcasts
        : [...current.podcasts, podcastItem],
    };
  }
  if (target.kind === "playlist") {
    if (!liked) {
      return {
        ...current,
        playlists: current.playlists.filter(
          (entry) => entry.playlistId !== target.playlistId,
        ),
      };
    }
    const playlistItem =
      item && "playlistId" in item
        ? item
        : {
            playlistId: target.playlistId,
            name: target.name,
            likedAt: new Date().toISOString(),
          };
    return {
      ...current,
      playlists: current.playlists.some(
        (entry) => entry.playlistId === target.playlistId,
      )
        ? current.playlists
        : [...current.playlists, playlistItem as PlaylistLikeResponse],
    };
  }
  const key = artistLikeKey(target.name);
  if (!liked) {
    return {
      ...current,
      artists: current.artists.filter(
        (entry) => artistLikeKey(entry.name) !== key,
      ),
    };
  }
  const artistItem =
    item && "name" in item
      ? item
      : { name: target.name, likedAt: new Date().toISOString() };
  return {
    ...current,
    artists: current.artists.some((entry) => artistLikeKey(entry.name) === key)
      ? current.artists
      : [...current.artists, artistItem],
  };
}

export function useLikes() {
  const { t } = useI18n();
  const { scope } = useQueryScope();
  const { token } = useSession();
  const { status } = useServerConnection();
  const { errorMessage } = useLocalizedMessage();
  const queryClient = useQueryClient();
  const likesRevision = useState("likes-revision", () => 0);
  const pendingTargets = ref<string[]>([]);
  const mutationError = ref<string | null>(null);
  const queryKey = computed(() =>
    scope.value ? queryKeys.likes(scope.value) : null,
  );
  const query = useQuery({
    queryKey: computed(
      () => queryKey.value ?? ["peridot", "unscoped", "likes"],
    ),
    queryFn: () => {
      if (!scope.value || !token.value) {
        throw new Error("Peridot query scope is unavailable.");
      }
      return listLikes(scope.value.serverAddress, token.value);
    },
    enabled: computed(() => Boolean(scope.value && token.value)),
    meta: { persist: true },
  });
  const likes = computed<LikeListResponse>(() => {
    const data = query.data.value;
    return data
      ? {
          ...EMPTY_LIKES,
          ...data,
          audiobooks: data.audiobooks ?? [],
          podcasts: data.podcasts ?? [],
          playlists: data.playlists ?? [],
        }
      : EMPTY_LIKES;
  });
  const trackItems = computed(() => likes.value.media);
  const albumItems = computed(() => likes.value.albums);
  const audiobookItems = computed(() => likes.value.audiobooks);
  const podcastItems = computed(() => likes.value.podcasts);
  const artistItems = computed(() => likes.value.artists);
  const playlistItems = computed(() => likes.value.playlists);
  const likedTrackIds = computed(() =>
    trackItems.value.map((item) => item.mediaId),
  );
  const likedAlbumIds = computed(() =>
    albumItems.value.map((item) => item.albumId),
  );
  const likedAudiobookIds = computed(() =>
    audiobookItems.value.map((item) => item.audiobookId),
  );
  const likedPodcastIds = computed(() =>
    podcastItems.value.map((item) => item.podcastId),
  );
  const likedArtistKeys = computed(() =>
    artistItems.value.map((item) => artistLikeKey(item.name)),
  );
  const likedPlaylistIds = computed(() =>
    playlistItems.value.map((item) => item.playlistId),
  );
  const loading = computed(
    () => query.isPending.value || query.isFetching.value,
  );
  const loaded = computed(
    () => query.isSuccess.value && status.value !== "lost",
  );
  const error = computed(() => {
    if (mutationError.value) return mutationError.value;
    if (!query.error.value) return null;
    return isAuthenticationRedirectError(query.error.value)
      ? null
      : errorMessage(query.error.value, "error.likesUpdate");
  });

  function isTargetLiked(target: LikeTarget): boolean {
    if (target.kind === "media")
      return likedTrackIds.value.includes(target.mediaId);
    if (target.kind === "album")
      return likedAlbumIds.value.includes(target.albumId);
    if (target.kind === "audiobook")
      return likedAudiobookIds.value.includes(target.audiobookId);
    if (target.kind === "podcast")
      return likedPodcastIds.value.includes(target.podcastId);
    if (target.kind === "playlist")
      return likedPlaylistIds.value.includes(target.playlistId);
    return likedArtistKeys.value.includes(artistLikeKey(target.name));
  }

  async function persistLikes() {
    if (queryKey.value) await persistQueryKey(queryKey.value);
  }

  const mutation = useMutation({
    mutationFn: async (variables: { target: LikeTarget; liked: boolean }) => {
      if (!scope.value || !token.value) {
        throw localizedError(
          "error.connectServer",
          "Connect to your server and try again.",
        );
      }
      if (variables.liked) {
        return deleteLike(
          scope.value.serverAddress,
          token.value,
          variables.target,
        );
      }
      return createLike(
        scope.value.serverAddress,
        token.value,
        variables.target,
      );
    },
    async onMutate(variables) {
      if (!queryKey.value) return;
      mutationError.value = null;
      await queryClient.cancelQueries({ queryKey: queryKey.value });
      const previous =
        queryClient.getQueryData<LikeListResponse>(queryKey.value) ??
        EMPTY_LIKES;
      queryClient.setQueryData(
        queryKey.value,
        updateLikedTarget(previous, variables.target, !variables.liked),
      );
      await persistLikes();
      return { previous };
    },
    async onSuccess(response, variables) {
      if (!queryKey.value || !response) return;
      const current =
        queryClient.getQueryData<LikeListResponse>(queryKey.value) ??
        EMPTY_LIKES;
      queryClient.setQueryData(
        queryKey.value,
        updateLikedTarget(
          current,
          variables.target,
          !variables.liked,
          response,
        ),
      );
      likesRevision.value += 1;
      if (!variables.liked) notifyLikeSucceeded(variables.target);
      await persistLikes();
      if (scope.value) {
        void queryClient.invalidateQueries({
          queryKey: [...peridotScopeKey(scope.value), "catalog", "tracks"],
        });
        void queryClient.invalidateQueries({
          queryKey: [...peridotScopeKey(scope.value), "playlists"],
        });
      }
    },
    async onError(reason, variables, context) {
      if (queryKey.value && context?.previous) {
        queryClient.setQueryData(queryKey.value, context.previous);
        await persistLikes();
      }
      const messageValue = isAuthenticationRedirectError(reason)
        ? null
        : errorMessage(reason, "error.likesUpdate");
      if (!messageValue) return;
      mutationError.value = messageValue;
      notifyLikeFailed(
        targetLabel(variables.target, t("like.track")),
        messageValue,
      );
    },
    onSettled() {
      pendingTargets.value = [];
    },
  });

  async function load(force = false) {
    if (!scope.value || !token.value) return;
    if (force || !query.data.value) await query.refetch();
  }

  async function toggle(target: LikeTarget) {
    if (!loaded.value) return;
    const key = likeTargetKey(target);
    if (pendingTargets.value.includes(key)) return;
    pendingTargets.value = [...pendingTargets.value, key];
    try {
      await mutation.mutateAsync({ target, liked: isTargetLiked(target) });
    } catch {
      // The mutation handler rolls back and reports the failure.
    } finally {
      pendingTargets.value = pendingTargets.value.filter(
        (entry) => entry !== key,
      );
    }
  }

  async function clear() {
    mutationError.value = null;
    pendingTargets.value = [];
    if (!queryKey.value) return;
    await removePersistedQueries(queryKey.value);
  }

  function isPending(target: LikeTarget): boolean {
    return pendingTargets.value.includes(likeTargetKey(target));
  }

  return {
    trackItems,
    albumItems,
    audiobookItems,
    podcastItems,
    artistItems,
    playlistItems,
    likedTrackIds,
    likedAlbumIds,
    likedAudiobookIds,
    likedPodcastIds,
    likedArtistKeys,
    likedPlaylistIds,
    loading,
    loaded,
    error,
    likesRevision,
    load,
    clear,
    toggle,
    isTargetLiked,
    isPending,
  };
}
