import assert from "node:assert/strict";
import test from "node:test";
import {
  androidQueue,
  androidTrackSnapshot,
  trackResponseFromAndroid,
} from "../app/lib/android-playback.ts";
import type { TrackResponse } from "@peridot/contracts";

const track: TrackResponse = {
  id: "track-1",
  mediaType: "music",
  title: "Local Song",
  artist: "Peridot",
  artists: ["Peridot", "Guest"],
  album: "Home",
  genres: ["Indie"],
  albumId: "album-1",
  discNumber: 1,
  trackNumber: 2,
  durationMs: 42_000,
  publishedAt: null,
  mimeType: "audio/mpeg",
  available: true,
  coverUrl: "/api/covers/cover-1?coverToken=test",
  metadata: null,
  liked: false,
};

test("Android playback snapshots contain native media metadata", () => {
  assert.deepEqual(androidTrackSnapshot(track, "http://192.168.1.2:17430"), {
    id: "track-1",
    title: "Local Song",
    artist: "Peridot, Guest",
    album: "Home",
    albumId: "album-1",
    durationMs: 42_000,
    coverUrl: "http://192.168.1.2:17430/api/covers/cover-1?coverToken=test",
    mimeType: "audio/mpeg",
    available: true,
    mediaType: "music",
  });
});

test("Android queue mirrors the existing queue and playback state", () => {
  const queue = androidQueue(
    [track],
    {
      activeTrackId: track.id,
      positionSeconds: 12.8,
      playing: true,
      volume: 72,
      repeatMode: "all",
      shuffleEnabled: true,
      shuffleTrackIds: [],
    },
    "http://127.0.0.1:17430",
  );

  assert.equal(queue.activeTrackId, "track-1");
  assert.equal(queue.positionMs, 12_800);
  assert.equal(queue.volume, 0.72);
  assert.equal(queue.repeatMode, "all");
  assert.deepEqual(
    queue.tracks.map((item) => item.id),
    ["track-1"],
  );
});

test("native cached track metadata restores a catalog-compatible object", () => {
  const restored = trackResponseFromAndroid(
    androidTrackSnapshot(track, "http://127.0.0.1:17430"),
  );

  assert.equal(restored.coverUrl, "/api/covers/cover-1?coverToken=test");
  assert.deepEqual(restored.artists, ["Peridot, Guest"]);
  assert.equal(restored.albumId, "album-1");
  assert.equal(restored.durationMs, 42_000);
});

test("the shared player selects native transport and suppresses browser audio on Android", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(
      new URL("../app/composables/use-library-player.ts", import.meta.url),
      "utf8",
    ),
  );

  assert.match(source, /if \(options\.audio && androidRuntime\)/);
  assert.match(source, /PeridotMedia\.replaceQueue/);
  assert.match(source, /function syncAndroidPlaybackIntent\(\)/);
  assert.match(source, /PeridotMedia\.addListener\(\s*"playbackStateChanged"/);
  assert.match(source, /if \(options\.audio && !androidRuntime\)/);
});
