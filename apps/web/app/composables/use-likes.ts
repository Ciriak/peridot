import { useI18n } from "#imports";
import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  LikeListResponse,
  LikeTarget,
  TrackLikeResponse,
} from "@peridot/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { albumLikeKey, artistLikeKey } from "../lib/library";
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
import { queryKeys } from "../lib/query-keys";
import { notifyLikeFailed, notifyLikeSucceeded } from "../lib/toasts";
import { useLocalizedMessage } from "./use-localized-message";
import { useQueryScope } from "./use-query-scope";
import { useServerConnection } from "./use-server-connection";
import { useSession } from "./use-session";

export function likeTargetKey(target: LikeTarget): string {
  if (target.kind === "track") return `track:${target.trackId}`;
  if (target.kind === "album")
    return `album:${albumLikeKey({ title: target.title, artist: target.artist })}`;
  return `artist:${artistLikeKey(target.name)}`;
}

function targetLabel(target: LikeTarget, trackLabel: string): string {
  if (target.kind === "track") return trackLabel;
  if (target.kind === "album") return target.title;
  return target.name;
}

const EMPTY_LIKES: LikeListResponse = {
  tracks: [],
  albums: [],
  artists: [],
};

function updateLikedTarget(
  current: LikeListResponse,
  target: LikeTarget,
  liked: boolean,
  item?: TrackLikeResponse | AlbumLikeResponse | ArtistLikeResponse,
): LikeListResponse {
  if (target.kind === "track") {
    if (!liked) {
      return {
        ...current,
        tracks: current.tracks.filter(
          (entry) => entry.trackId !== target.trackId,
        ),
      };
    }
    const trackItem =
      item && "trackId" in item
        ? item
        : { trackId: target.trackId, likedAt: new Date().toISOString() };
    return {
      ...current,
      tracks: current.tracks.some((entry) => entry.trackId === target.trackId)
        ? current.tracks
        : [...current.tracks, trackItem],
    };
  }
  if (target.kind === "album") {
    const key = albumLikeKey(target);
    if (!liked) {
      return {
        ...current,
        albums: current.albums.filter((entry) => albumLikeKey(entry) !== key),
      };
    }
    const albumItem =
      item && "title" in item
        ? item
        : { ...target, likedAt: new Date().toISOString() };
    return {
      ...current,
      albums: current.albums.some((entry) => albumLikeKey(entry) === key)
        ? current.albums
        : [...current.albums, albumItem],
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
  const likes = computed(() => query.data.value ?? EMPTY_LIKES);
  const trackItems = computed(() => likes.value.tracks);
  const albumItems = computed(() => likes.value.albums);
  const artistItems = computed(() => likes.value.artists);
  const likedTrackIds = computed(() =>
    trackItems.value.map((item) => item.trackId),
  );
  const likedAlbumKeys = computed(() =>
    albumItems.value.map((item) => albumLikeKey(item)),
  );
  const likedArtistKeys = computed(() =>
    artistItems.value.map((item) => artistLikeKey(item.name)),
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
    if (target.kind === "track")
      return likedTrackIds.value.includes(target.trackId);
    if (target.kind === "album")
      return likedAlbumKeys.value.includes(
        albumLikeKey({ title: target.title, artist: target.artist }),
      );
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
          "Connect to your Peridot server and try again.",
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
      if (!variables.liked) notifyLikeSucceeded(variables.target);
      await persistLikes();
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
    artistItems,
    likedTrackIds,
    likedAlbumKeys,
    likedArtistKeys,
    loading,
    loaded,
    error,
    load,
    clear,
    toggle,
    isTargetLiked,
    isPending,
  };
}
