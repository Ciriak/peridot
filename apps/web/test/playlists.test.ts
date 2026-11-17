import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PlaylistEntryResponse, TrackResponse } from "@peridot/contracts";
import {
  playlistCoverSlots,
  playlistPlayableTracks,
} from "../app/lib/playlists.ts";

function track(id: string, available = true): TrackResponse {
  return {
    id,
    title: `Track ${id}`,
    artist: "Artist",
    artists: ["Artist"],
    album: "Album",
    albumId: "album-1",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 120000,
    mimeType: "audio/mpeg",
    available,
    coverUrl: `/api/covers/${id}?coverToken=token`,
    metadata: null,
    liked: false,
  };
}

function entry(
  id: string,
  catalogTrack: TrackResponse | null,
): PlaylistEntryResponse {
  return {
    id,
    position: Number(id.slice(1)),
    title: catalogTrack?.title ?? `External ${id}`,
    artist: catalogTrack?.artist ?? "External Artist",
    artists: catalogTrack?.artists ?? ["External Artist"],
    album: catalogTrack?.album ?? null,
    durationMs: catalogTrack?.durationMs ?? null,
    coverUrl: catalogTrack?.coverUrl ?? null,
    available: Boolean(catalogTrack?.available),
    liked: Boolean(catalogTrack?.liked),
    track: catalogTrack,
    external: catalogTrack
      ? null
      : {
          provider: "example",
          externalTrackId: id,
          title: `External ${id}`,
          artist: "External Artist",
          album: null,
          durationMs: null,
        },
  };
}

test("playlist playback keeps order while skipping unavailable and unresolved entries", () => {
  const entries = [
    entry("0", track("a")),
    entry("1", entryTrackUnavailable()),
    entry("2", null),
    entry("3", track("b")),
  ];
  assert.deepEqual(
    playlistPlayableTracks(entries, {
      serverLost: false,
      savedTrackIds: new Set(),
    }).map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    playlistPlayableTracks(entries, {
      serverLost: true,
      savedTrackIds: new Set(["a"]),
    }).map((item) => item.id),
    ["a"],
  );
});

function entryTrackUnavailable() {
  return track("unavailable", false);
}

test("playlist covers fill exactly nine slots in playlist order", () => {
  assert.deepEqual(playlistCoverSlots(["1", "2"]), [
    "1",
    "2",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(
    playlistCoverSlots(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  );
});

test("playlist pages expose creation, unavailable tracks, editing, likes, and offline controls", async () => {
  const [listPage, index, detailPage, card, trackList, contextMenu, actions] =
    await Promise.all([
      readFile(new URL("../app/pages/playlists.vue", import.meta.url), "utf8"),
      readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/pages/playlists/[playlist].vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/PlaylistCard.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackContextMenu.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/composables/use-playlists.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(index, /usePlaylistList\(\{ limit: HOME_PREVIEW_LIMIT \}\)/);
  assert.match(index, /<PlaylistCard/);
  assert.doesNotMatch(index, /page\.home\.comingSoon/);
  assert.match(listPage, /<PlaylistNameDialog/);
  assert.match(listPage, /mode="create"/);
  assert.match(detailPage, /playlistPlayableTracks/);
  assert.match(detailPage, /<PlaylistOfflineButton/);
  assert.match(detailPage, /<PlaylistTrackList/);
  assert.match(detailPage, /<PlaylistNameDialog/);
  assert.match(detailPage, /<PlaylistDeleteDialog/);
  assert.match(card, /<PlaylistCover/);
  assert.match(card, /<PlaylistOfflineSummaryButton/);
  assert.match(card, /<LikeButton/);
  assert.match(card, /context\.renamePlaylist/);
  assert.match(card, /<PlaylistDeleteDialog/);
  assert.match(trackList, /useSortable/);
  assert.match(trackList, /playlistTracks\.unavailable/);
  assert.match(trackList, /emit\(\s*"reorder"/);
  assert.match(
    trackList,
    /<ScrollingText\s+class="min-w-0"[\s\S]*>\s*\{\{ entry\.title \}\}\s*<\/ScrollingText>\s*<Icon\s+v-if="isCurrent\(entry\)"\s+:icon="icons\.waveform"/,
    "The current-track indicator sits immediately after the playlist title",
  );
  assert.match(contextMenu, /<AddTrackToPlaylistDialog/);
  assert.match(actions, /createPlaylist\(/);
  assert.match(actions, /updatePlaylist\(/);
  assert.match(actions, /deletePlaylist\(/);
  assert.match(actions, /addPlaylistItem\(/);
  assert.match(actions, /removePlaylistItem\(/);
  assert.match(actions, /reorderPlaylistItems\(/);
});

test("playlist offline saving reuses the per-track manifest", async () => {
  const source = await readFile(
    new URL("../app/composables/use-offline-tracks.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /async function savePlaylist/);
  assert.match(source, /saveOfflineCollection\(tracks/);
  assert.match(source, /async function removePlaylist/);
  assert.match(source, /removeTrackForOffline/);
});
