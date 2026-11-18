import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { likeSuccessToast } from "../app/lib/like-toast.ts";

test("successful likes map to target-specific confirmation toasts", () => {
  assert.deepEqual(likeSuccessToast({ kind: "track", trackId: "track-1" }), {
    titleMessage: { key: "toast.trackLikedTitle" },
    descriptionMessage: { key: "toast.trackLiked" },
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(
    likeSuccessToast({
      kind: "album",
      albumId: "album-discovery",
      title: " Discovery ",
      artist: "Daft Punk",
    }),
    {
      titleMessage: { key: "toast.albumLikedTitle" },
      descriptionMessage: {
        key: "toast.likedNamed",
        params: { target: "Discovery" },
      },
      status: "success",
      kind: "success",
      duration: 5000,
    },
  );
  assert.deepEqual(likeSuccessToast({ kind: "artist", name: " Daft Punk " }), {
    titleMessage: { key: "toast.artistLikedTitle" },
    descriptionMessage: {
      key: "toast.likedNamed",
      params: { target: "Daft Punk" },
    },
    status: "success",
    kind: "success",
    duration: 5000,
  });
});

test("track, album, and artist likes share accessible persistent state wiring", async () => {
  const [likes, button, library, layout, trackTable] = await Promise.all([
    readFile(
      new URL("../app/composables/use-likes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LikeButton.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LibraryScreen.vue", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(likes, /listLikes\(/);
  assert.match(likes, /createLike\(/);
  assert.match(likes, /deleteLike\(/);
  assert.match(likes, /pendingTargets/);
  assert.match(likes, /useMutation\(\{/);
  assert.match(likes, /updateLikedTarget\(/);
  assert.match(likes, /persistQueryKey\(/);
  assert.match(likes, /notifyLikeFailed\(/);
  assert.match(likes, /notifyLikeSucceeded\(variables\.target\)/);
  assert.match(likes, /invalidateQueries\(\{/);
  assert.match(button, /aria-pressed/);
  assert.match(button, /:title="actionLabel"/);
  assert.match(button, /icons\.heartFilled/);
  assert.match(button, /icons\.heart/);
  assert.match(
    button,
    /:class="\['hover:text-primary active:text-primary', large && 'size-12'\]"/,
  );
  assert.match(
    button,
    /:class="\[\s*compact \? 'size-3' : large \? 'size-7' : 'size-6',\s*liked && 'text-primary',\s*\]"/,
    "Liked state colors the icon",
  );
  assert.doesNotMatch(
    button,
    /group-(?:hover|active):text-primary/,
    "Like hover colors the button without reacting to card hover",
  );
  assert.match(library, /useCatalogTrackQuery/);
  assert.match(library, /props\.favorites \? \{ liked: true \}/);
  assert.match(
    library,
    /props\.favorites && likesLoaded\.value\s*\? filterTracks\(\s*tracks\.value,\s*"",\s*likedTrackIds\.value,?\s*\)/,
    "The liked songs view removes tracks as soon as their like is removed",
  );
  assert.match(library, /:tracks="visibleTracks"/);
  assert.match(
    trackTable,
    /likesLoaded\s*\? likedTrackIds\.includes\(item\.track\.id\)\s*: item\.track\.liked/,
    "The loaded likes cache supersedes stale track response state",
  );
  assert.match(layout, /loadLikes\(\)/);
  assert.match(layout, /likedTrackCount/);
  assert.match(layout, /<LikeButton/);
});

test("album and artist cards keep navigation and like actions separate", async () => {
  const [albumCard, artistCard] = await Promise.all([
    readFile(
      new URL("../app/components/AlbumCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistCard.vue", import.meta.url),
      "utf8",
    ),
  ]);
  const separateActions = /<NuxtLink[\s\S]*<\/NuxtLink>[\s\S]*<LikeButton/;
  assert.match(albumCard, separateActions);
  assert.match(artistCard, separateActions);
});
