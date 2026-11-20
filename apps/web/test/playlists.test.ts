import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  PlaylistEntryResponse,
  PlaylistSummaryResponse,
  TrackResponse,
} from "@peridot/contracts";
import {
  filterAddablePlaylists,
  filterPlaylistEntries,
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

function playlist(
  id: string,
  name: string,
  kind: PlaylistSummaryResponse["kind"] = "manual",
): PlaylistSummaryResponse {
  return {
    id,
    kind,
    name,
    trackCount: 0,
    availableTrackCount: 0,
    durationMs: null,
    coverUrls: [],
    liked: false,
    containsTrack: false,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
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

test("automatic playlist search matches title, artist, and album", () => {
  const entries = [
    entry("0", {
      ...track("a"),
      title: "Night Drive",
      artist: "First Artist",
      artists: ["First Artist"],
      album: "Road",
    }),
    entry("1", {
      ...track("b"),
      title: "Morning",
      artist: "Second Artist",
      artists: ["Second Artist"],
      album: "Window",
    }),
  ];

  assert.deepEqual(
    filterPlaylistEntries(entries, "drive").map((item) => item.track?.id),
    ["a"],
  );
  assert.deepEqual(
    filterPlaylistEntries(entries, "second").map((item) => item.track?.id),
    ["b"],
  );
  assert.deepEqual(
    filterPlaylistEntries(entries, "road").map((item) => item.track?.id),
    ["a"],
  );
});

test("add-to-playlist filtering excludes automatic playlists and matches every term", () => {
  const playlists = [
    playlist("1", "Late Night Drive"),
    playlist("2", "Morning Window"),
    playlist("3", "Liked tracks", "liked-tracks"),
  ];

  assert.deepEqual(
    filterAddablePlaylists(playlists, "  NIGHT drive  ").map((item) => item.id),
    ["1"],
  );
  assert.deepEqual(
    filterAddablePlaylists(playlists, "").map((item) => item.id),
    ["1", "2"],
  );
  assert.deepEqual(filterAddablePlaylists(playlists, "liked"), []);
});

test("playlist pages expose creation, unavailable tracks, editing, likes, and offline controls", async () => {
  const [
    listPage,
    index,
    detailPage,
    catalogCard,
    playlistMenu,
    trackList,
    likeButton,
    contextMenu,
    submenu,
    actions,
  ] = await Promise.all([
    readFile(
      new URL("../app/pages/playlists/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/playlists/[playlist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/CatalogCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PlaylistContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/LikeButton.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackContextMenu.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/AddTrackToPlaylistSubmenu.vue",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-playlists.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(index, /usePlaylistList\(\{ limit: 1 \}\)/);
  assert.match(index, /<CatalogCard/);
  assert.match(index, /playlistCatalogCard/);
  assert.doesNotMatch(index, /page\.home\.comingSoon/);
  assert.match(listPage, /<PlaylistNameDialog/);
  assert.match(listPage, /mode="create"/);
  assert.match(detailPage, /playlistPlayableTracks/);
  assert.match(detailPage, /<PlaylistOfflineButton/);
  assert.match(detailPage, /<PlaylistTrackList/);
  assert.match(detailPage, /<PlaylistNameDialog/);
  assert.match(detailPage, /<PlaylistDeleteDialog/);
  assert.match(catalogCard, /<PlaylistCover/);
  assert.doesNotMatch(catalogCard, /<PlaylistOfflineSummaryButton/);
  assert.match(
    catalogCard,
    /'space-y-3'/,
    "Playlist cards use the shared card content spacing and text width",
  );
  assert.match(catalogCard, /pr-12/);
  assert.match(
    catalogCard,
    /<h3 :class="compact \? 'text-xs' : 'text-sm'" class="font-medium">/,
    "Playlist cards use the shared title sizing",
  );
  assert.match(playlistMenu, /context\.renamePlaylist/);
  assert.match(playlistMenu, /<PlaylistDeleteDialog/);
  assert.match(trackList, /useSortable/);
  assert.match(trackList, /playlistTracks\.unavailable/);
  assert.match(trackList, /emit\(\s*"reorder"/);
  assert.match(trackList, /showTrackLikes !== false/);
  assert.match(
    likeButton,
    /compact \? 'size-4' : large \? 'size-7' : 'size-6'/,
    "Compact like controls keep a legible 16px icon",
  );
  assert.match(
    trackList,
    /<ScrollingText\s+class="min-w-0"[\s\S]*>\s*\{\{ entry\.title \}\}\s*<\/ScrollingText>\s*<Icon\s+v-if="isCurrent\(entry\)"\s+:icon="icons\.waveform"/,
    "The current-track indicator sits immediately after the playlist title",
  );
  assert.match(contextMenu, /<AddTrackToPlaylistSubmenu/);
  assert.doesNotMatch(contextMenu, /<AddTrackToPlaylistDialog/);
  assert.match(submenu, /<ContextMenuSubContent/);
  assert.match(submenu, /type="search"/);
  assert.match(submenu, /while \(hasMore\.value\)/);
  assert.match(submenu, /filterAddablePlaylists/);
  assert.match(submenu, /page\.playlists\.create/);
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
  assert.match(source, /downloadTasks\.enqueuePlaylist\(/);
  assert.match(source, /async function removePlaylist/);
  assert.match(source, /removeTrackForOffline/);
});

test("liked tracks use generated artwork and a read-only automatic playlist surface", async () => {
  const [cover, catalogCard, playlistMenu, detail, submenu, layout] =
    await Promise.all([
      readFile(
        new URL("../app/components/PlaylistCover.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/CatalogCard.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/PlaylistContextMenu.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/pages/playlists/[playlist].vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/components/AddTrackToPlaylistSubmenu.vue",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    ]);

  assert.match(cover, /bg-primary\/40 text-white/);
  assert.match(cover, /icons\.heartFilled/);
  assert.match(cover, /class="size-16"/);
  assert.match(catalogCard, /:kind="playlist\.kind"/);
  assert.match(playlistMenu, /playlist\.kind === "liked-tracks"/);
  assert.match(playlistMenu, /v-if="!automatic"/);
  assert.match(detail, /playlist\.value\?\.kind === "liked-tracks"/);
  assert.match(detail, /:read-only="automatic"/);
  assert.match(detail, /:show-track-likes="!automatic"/);
  assert.doesNotMatch(detail, /automatic[\s\S]{0,100}page\.playlist\.rename/);
  assert.match(submenu, /filterAddablePlaylists/);
  assert.match(layout, /to: "\/playlists\/liked"/);
});
