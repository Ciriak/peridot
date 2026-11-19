import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import {
  createDownloadTask,
  DOWNLOAD_TASK_MAX_TERMINAL,
  downloadTaskProgressPercent,
  downloadTaskStorageKey,
  pruneDownloadTasks,
  reconcileDownloadTasks,
  sameDownloadTaskTarget,
  type DownloadTask,
} from "../app/lib/download-tasks.ts";
import { message } from "../app/lib/messages.ts";

const scope = {
  serverAddress: "http://127.0.0.1:17430",
  userId: "user-1",
};

function track(id: string): TrackResponse {
  return {
    id,
    mediaType: "music",
    mediaTypeOrigin: "source",
    title: `Track ${id}`,
    artist: "Artist",
    artists: ["Artist"],
    album: "Album",
    genres: [],
    albumId: "album-1",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 180_000,
    publishedAt: null,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: true,
  };
}

function task(id: string, overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    ...createDownloadTask(scope, {
      id,
      request: { kind: "track", track: track(id) },
      title: `Track ${id}`,
      titleMessage: message("downloadTasks.title.track", {
        item: `Track ${id}`,
      }),
      now: new Date("2026-11-19T12:00:00.000Z"),
    }),
    ...overrides,
  };
}

test("download tasks are scoped and expose aggregate progress", () => {
  const first = task("one");
  const second = task("two");

  assert.notEqual(
    downloadTaskStorageKey(scope, first.id),
    downloadTaskStorageKey({ ...scope, userId: "user-2" }, first.id),
  );
  assert.equal(sameDownloadTaskTarget(first, second.request), false);
  assert.equal(
    sameDownloadTaskTarget(first, { kind: "track", track: track("one") }),
    true,
  );

  assert.equal(
    downloadTaskProgressPercent({
      ...first,
      status: "running",
      progress: { completed: 1, total: 4, currentTrackPercent: 50 },
    }),
    38,
  );
  assert.equal(
    downloadTaskProgressPercent({
      ...first,
      status: "paused",
    }),
    0,
  );
});

test("interrupted tasks resume as queued and terminal history is bounded", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");
  const running = task("running", {
    status: "running",
    startedAt: now.toISOString(),
  });
  const old = task("old", {
    status: "completed",
    completedAt: "2026-01-01T00:00:00.000Z",
  });
  const terminal = Array.from(
    { length: DOWNLOAD_TASK_MAX_TERMINAL + 2 },
    (_, index) =>
      task(`terminal-${index}`, {
        status: "completed",
        completedAt: new Date(now.getTime() - index * 1_000).toISOString(),
      }),
  );

  const reconciled = reconcileDownloadTasks(
    [running, old, ...terminal],
    scope,
    now,
  );
  assert.equal(
    reconciled.find((candidate) => candidate.id === "running")?.status,
    "queued",
  );
  assert.equal(
    reconciled.some((candidate) => candidate.id === "old"),
    false,
  );
  assert.equal(
    reconciled.filter((candidate) => candidate.status === "completed").length,
    DOWNLOAD_TASK_MAX_TERMINAL,
  );
  assert.deepEqual(pruneDownloadTasks(reconciled, now), reconciled);
});

test("all offline entry points feed the unified task display", async () => {
  const [
    tracks,
    album,
    collection,
    playlist,
    liked,
    indicator,
    layout,
    tasksPage,
  ] = await Promise.all([
    readFile(
      new URL("../app/composables/use-offline-tracks.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-offline-album.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/composables/use-offline-media-collection.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-offline-playlist.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LikedTitlesOfflineSync.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TaskProgressIndicator.vue", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/settings/tasks.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(tracks, /enqueueTrack\(track\)/);
  assert.match(tracks, /enqueueAlbum\(album\)/);
  assert.match(tracks, /enqueueCollection\(/);
  assert.match(tracks, /enqueuePlaylist\(playlistId, title\)/);
  assert.match(album, /saveAlbum\(currentAlbum\)/);
  assert.match(
    collection,
    /saveCollection\(current\.id, mediaType, current\.title\)/,
  );
  assert.match(playlist, /savePlaylist\(current\.id, current\.name\)/);
  assert.match(liked, /verified/);
  assert.match(liked, /saveLikedTitles\(\)/);
  assert.match(liked, /cancelLikedTitles\(\)/);
  assert.match(indicator, /useOfflineDownloadTasks/);
  assert.match(indicator, /downloadTasks\s*\.orderedTasks\(\)/);
  assert.match(indicator, /\/settings\/tasks#active-tasks/);
  assert.match(layout, /<TaskProgressIndicator \/>/);
  assert.doesNotMatch(layout, /DownloadTaskIndicator/);
  assert.match(tasksPage, /useOfflineDownloadTasks/);
  assert.match(tasksPage, /activeRows/);
  assert.match(tasksPage, /historyRows/);
});
