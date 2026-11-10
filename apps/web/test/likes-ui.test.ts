import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { likeSuccessToast } from "../app/lib/like-toast.ts";

test("successful likes map to target-specific confirmation toasts", () => {
  assert.deepEqual(likeSuccessToast({ kind: "track", trackId: "track-1" }), {
    title: "Track liked",
    description: "The track was added to your likes.",
    status: "success",
    kind: "success",
    duration: 5000,
  });
  assert.deepEqual(
    likeSuccessToast({
      kind: "album",
      title: " Discovery ",
      artist: "Daft Punk",
    }),
    {
      title: "Album liked",
      description: "Discovery was added to your likes.",
      status: "success",
      kind: "success",
      duration: 5000,
    },
  );
  assert.deepEqual(likeSuccessToast({ kind: "artist", name: " Daft Punk " }), {
    title: "Artist liked",
    description: "Daft Punk was added to your likes.",
    status: "success",
    kind: "success",
    duration: 5000,
  });
});

test("track, album, and artist likes share accessible persistent state wiring", async () => {
  const [likes, button, library, layout] = await Promise.all([
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
  ]);

  assert.match(likes, /listLikes\(/);
  assert.match(likes, /createLike\(/);
  assert.match(likes, /deleteLike\(/);
  assert.match(likes, /pendingTargets/);
  assert.match(likes, /setTrackLiked\(target\.trackId, wasLiked/);
  assert.match(likes, /notifyLikeFailed\(/);
  assert.match(
    likes,
    /setArtistLiked\(response, true, response\);[\s\S]*notifyLikeSucceeded\(target\)/,
  );
  assert.match(button, /aria-pressed/);
  assert.match(button, /icons\.heartFilled/);
  assert.match(button, /icons\.heart/);
  assert.match(library, /useLikes\(\)/);
  assert.match(library, /props\.favorites \? likedTrackIds\.value/);
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
