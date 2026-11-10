import { useState } from "#imports";
import type {
  AlbumLikeResponse,
  ArtistLikeResponse,
  LikeTarget,
  TrackLikeResponse,
} from "@peridot/contracts";
import { computed } from "vue";
import { albumLikeKey, artistLikeKey } from "../lib/library";
import { createLike, deleteLike, listLikes } from "../lib/peridot-client";
import { notifyLikeFailed, notifyLikeSucceeded } from "../lib/toasts";
import { useServer } from "./use-server";
import { useSession } from "./use-session";
import { useUser } from "./use-user";

type AlbumIdentity = { title: string; artist: string };
type ArtistIdentity = { name: string };

export function likeTargetKey(target: LikeTarget): string {
  if (target.kind === "track") return `track:${target.trackId}`;
  if (target.kind === "album")
    return `album:${albumLikeKey({ title: target.title, artist: target.artist })}`;
  return `artist:${artistLikeKey(target.name)}`;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The server could not update your likes.";
}

function targetLabel(target: LikeTarget): string {
  if (target.kind === "track") return "track";
  if (target.kind === "album") return target.title;
  return target.name;
}

export function useLikes() {
  const { address } = useServer();
  const { token } = useSession();
  const { user } = useUser();
  const trackItems = useState<TrackLikeResponse[]>(
    "like-track-items",
    () => [],
  );
  const albumItems = useState<AlbumLikeResponse[]>(
    "like-album-items",
    () => [],
  );
  const artistItems = useState<ArtistLikeResponse[]>(
    "like-artist-items",
    () => [],
  );
  const pendingTargets = useState<string[]>("like-pending-targets", () => []);
  const loading = useState("likes-loading", () => false);
  const loaded = useState("likes-loaded", () => false);
  const error = useState<string | null>("likes-error", () => null);
  const authScope = useState<string | null>("likes-auth-scope", () => null);

  const likedTrackIds = computed(() =>
    trackItems.value.map((item) => item.trackId),
  );
  const likedAlbumKeys = computed(() =>
    albumItems.value.map((item) => albumLikeKey(item)),
  );
  const likedArtistKeys = computed(() =>
    artistItems.value.map((item) => artistLikeKey(item.name)),
  );

  function clear() {
    trackItems.value = [];
    albumItems.value = [];
    artistItems.value = [];
    pendingTargets.value = [];
    loading.value = false;
    loaded.value = false;
    error.value = null;
  }

  async function load(force = false) {
    const currentScope = `${address.value ?? ""}|${user.value?.id ?? ""}`;
    if (authScope.value !== currentScope) {
      clear();
      authScope.value = currentScope;
    }
    if (loading.value || (!force && loaded.value)) return;
    const serverAddress = address.value;
    const sessionToken = token.value;
    if (!serverAddress || !sessionToken) {
      clear();
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const response = await listLikes(serverAddress, sessionToken);
      trackItems.value = response.tracks;
      albumItems.value = response.albums;
      artistItems.value = response.artists;
      loaded.value = true;
    } catch (reason) {
      error.value = errorMessage(reason);
    } finally {
      loading.value = false;
    }
  }

  function isTargetLiked(target: LikeTarget): boolean {
    if (target.kind === "track")
      return likedTrackIds.value.includes(target.trackId);
    if (target.kind === "album")
      return likedAlbumKeys.value.includes(
        albumLikeKey({ title: target.title, artist: target.artist }),
      );
    return likedArtistKeys.value.includes(artistLikeKey(target.name));
  }

  function setTrackLiked(
    trackId: string,
    liked: boolean,
    item?: TrackLikeResponse,
  ) {
    if (liked) {
      if (!trackItems.value.some((entry) => entry.trackId === trackId)) {
        trackItems.value = [
          ...trackItems.value,
          item
            ? { trackId: item.trackId, likedAt: item.likedAt }
            : { trackId, likedAt: new Date().toISOString() },
        ];
      }
      return;
    }
    trackItems.value = trackItems.value.filter(
      (entry) => entry.trackId !== trackId,
    );
  }

  function setAlbumLiked(
    album: AlbumIdentity,
    liked: boolean,
    item?: AlbumLikeResponse,
  ) {
    const key = albumLikeKey(album);
    if (liked) {
      if (!likedAlbumKeys.value.includes(key)) {
        albumItems.value = [
          ...albumItems.value,
          item
            ? {
                title: item.title,
                artist: item.artist,
                likedAt: item.likedAt,
              }
            : { ...album, likedAt: new Date().toISOString() },
        ];
      }
      return;
    }
    albumItems.value = albumItems.value.filter(
      (entry) => albumLikeKey(entry) !== key,
    );
  }

  function setArtistLiked(
    artist: ArtistIdentity,
    liked: boolean,
    item?: ArtistLikeResponse,
  ) {
    const key = artistLikeKey(artist.name);
    if (liked) {
      if (!likedArtistKeys.value.includes(key)) {
        artistItems.value = [
          ...artistItems.value,
          item
            ? { name: item.name, likedAt: item.likedAt }
            : { name: artist.name, likedAt: new Date().toISOString() },
        ];
      }
      return;
    }
    artistItems.value = artistItems.value.filter(
      (entry) => artistLikeKey(entry.name) !== key,
    );
  }

  async function toggle(target: LikeTarget) {
    if (!loaded.value) return;
    const key = likeTargetKey(target);
    if (pendingTargets.value.includes(key)) return;

    const wasLiked = isTargetLiked(target);
    const previousTrack =
      target.kind === "track"
        ? trackItems.value.find((item) => item.trackId === target.trackId)
        : undefined;
    const previousAlbum =
      target.kind === "album"
        ? albumItems.value.find(
            (item) =>
              albumLikeKey(item) ===
              albumLikeKey({ title: target.title, artist: target.artist }),
          )
        : undefined;
    const previousArtist =
      target.kind === "artist"
        ? artistItems.value.find(
            (item) => artistLikeKey(item.name) === artistLikeKey(target.name),
          )
        : undefined;

    pendingTargets.value = [...pendingTargets.value, key];
    error.value = null;
    if (target.kind === "track") setTrackLiked(target.trackId, !wasLiked);
    else if (target.kind === "album") setAlbumLiked(target, !wasLiked);
    else setArtistLiked(target, !wasLiked);

    const serverAddress = address.value;
    const sessionToken = token.value;
    try {
      if (!serverAddress || !sessionToken) {
        throw new Error("Connect to your Peridot server and try again.");
      }
      if (wasLiked) {
        await deleteLike(serverAddress, sessionToken, target);
      } else {
        const response = await createLike(serverAddress, sessionToken, target);
        if (response.kind === "track")
          setTrackLiked(response.trackId, true, response);
        else if (response.kind === "album")
          setAlbumLiked(response, true, response);
        else setArtistLiked(response, true, response);
        notifyLikeSucceeded(target);
      }
    } catch (reason) {
      if (target.kind === "track")
        setTrackLiked(target.trackId, wasLiked, previousTrack);
      else if (target.kind === "album")
        setAlbumLiked(target, wasLiked, previousAlbum);
      else setArtistLiked(target, wasLiked, previousArtist);
      const message = errorMessage(reason);
      error.value = message;
      notifyLikeFailed(targetLabel(target), message);
    } finally {
      pendingTargets.value = pendingTargets.value.filter(
        (entry) => entry !== key,
      );
    }
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
