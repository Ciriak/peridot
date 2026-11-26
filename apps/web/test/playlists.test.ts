import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  PlaylistEntryResponse,
  PlaylistSummaryResponse,
  MediaResponse,
} from "@peridot/contracts";
import {
  filterAddablePlaylists,
  filterPlaylistEntries,
  isAutomaticPlaylistKind,
  playlistCoverSlots,
  playlistPlayableTracks,
} from "../app/lib/playlists.ts";
import { playlistEntriesAfterDrag } from "../app/lib/playlist-order.ts";

function track(id: string, available = true): MediaResponse {
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
    mediaType: "music",
    mediaTypeOrigin: "embedded",
    genres: [],
    mimeType: "audio/mpeg",
    available,
    coverUrl: `/api/covers/${id}?coverToken=token`,
    metadata: null,
    liked: false,
  };
}

function entry(
  id: string,
  catalogTrack: MediaResponse | null,
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
    media: catalogTrack,
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
  assert.deepEqual(
    playlistPlayableTracks(entries, {
      serverLost: false,
      savedTrackIds: new Set(),
      unavailableTrackIds: new Set(["a"]),
    }).map((item) => item.id),
    ["b"],
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

test("virtual playlist drag order follows visible neighbors", () => {
  const entries = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  assert.deepEqual(
    playlistEntriesAfterDrag(entries, "e", "b", "c")?.map((entry) => entry.id),
    ["a", "b", "e", "c", "d"],
  );
  assert.deepEqual(
    playlistEntriesAfterDrag(entries, "a", null, "b")?.map((entry) => entry.id),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(
    playlistEntriesAfterDrag(entries, "b", "e", null)?.map((entry) => entry.id),
    ["a", "c", "d", "e", "b"],
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
    filterPlaylistEntries(entries, "drive").map((item) => item.media?.id),
    ["a"],
  );
  assert.deepEqual(
    filterPlaylistEntries(entries, "second").map((item) => item.media?.id),
    ["b"],
  );
  assert.deepEqual(
    filterPlaylistEntries(entries, "road").map((item) => item.media?.id),
    ["a"],
  );
});

test("add-to-playlist filtering excludes automatic playlists and matches every term", () => {
  const playlists = [
    playlist("1", "Late Night Drive"),
    playlist("2", "Morning Window"),
    playlist("3", "Liked tracks", "liked-tracks"),
    playlist("4", "Recently added", "recently-added"),
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
  assert.deepEqual(filterAddablePlaylists(playlists, "recent"), []);
});

test("only derived playlist kinds use automatic read-only behavior", () => {
  assert.equal(isAutomaticPlaylistKind("liked-tracks"), true);
  assert.equal(isAutomaticPlaylistKind("recently-added"), true);
  assert.equal(isAutomaticPlaylistKind("external"), false);
  assert.equal(isAutomaticPlaylistKind("manual"), false);
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

  assert.match(index, /usePlaylistList\(\{ limit: 2 \}\)/);
  assert.match(index, /RECENTLY_ADDED_PLAYLIST_ID/);
  assert.match(index, /<CatalogCard/);
  assert.match(index, /playlistCatalogCard/);
  assert.doesNotMatch(index, /page\.home\.comingSoon/);
  assert.match(listPage, /useVirtualPlaylists/);
  assert.match(listPage, /<AlbumCardPlaceholder/);
  assert.match(listPage, /paging-mode="window"/);
  assert.match(listPage, /<PlaylistNameDialog/);
  assert.match(listPage, /mode="create"/);
  assert.match(detailPage, /playlistPlayableTracks/);
  assert.match(
    detailPage,
    /<LikedTracksOfflineToggle\s+v-if="likedAutomatic"[\s\S]*<PlaylistOfflineButton\s+v-else/,
  );
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
  assert.match(trackList, /useMainScrollVirtualizer/);
  assert.match(trackList, /virtualRows/);
  assert.match(trackList, /playlistEntriesAfterDrag/);
  assert.match(
    trackList,
    /<Badge\s+v-if="\s*entry\.media && !entry\.media\.available && playable\(entry\)\s*"[\s\S]*?trackTable\.availableOffline/,
  );
  assert.match(
    trackList,
    /<Badge v-else-if="!entry\.media" variant="secondary">\s*\{\{ t\("playlistTracks\.unavailable"\) \}\}\s*<\/Badge>/,
  );
  assert.match(
    trackList,
    /v-if="entry\.media && !playable\(entry\)"\s+:icon="icons\.cloudOff"/,
    "Resolved but unplayable playlist tracks show the shared cloud-off hint",
  );
  assert.match(
    trackList,
    /if \(!playable\(entry\)\) \{\s+retryUnavailableTrack\(entry\.media\);\s+return;\s+\}/,
    "Resolved but unplayable playlist tracks retry through the shared player",
  );
  assert.match(trackList, /emit\(\s*"reorder"/);
  assert.match(trackList, /showTrackLikes !== false/);
  assert.match(
    likeButton,
    /compact \? 'size-4' : large \? 'size-7' : 'size-6'/,
    "Compact like controls keep a legible 16px icon",
  );
  assert.match(
    trackList,
    /<ScrollingText\s+class="min-w-0"[\s\S]*>\s*\{\{ entry\.title \}\}\s*<\/ScrollingText>\s*<Icon\s+v-if="entry\.media && !playable\(entry\)"[\s\S]*?<Icon\s+v-if="isCurrent\(entry\)"\s+:icon="icons\.waveform"/,
    "Unavailable and current-track indicators follow the playlist title consistently",
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
  const [
    cover,
    catalogCard,
    playlistMenu,
    detail,
    submenu,
    layout,
    offlineToggle,
  ] = await Promise.all([
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
    readFile(
      new URL(
        "../app/components/LikedTracksOfflineToggle.vue",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(cover, /bg-primary\/40 text-white/);
  assert.match(cover, /icons\.heartFilled/);
  assert.match(cover, /bg-chart-1\/60 text-foreground/);
  assert.match(cover, /icons\.folderPlus/);
  assert.match(cover, /compact \? 'size-5' : 'size-16'/);
  assert.match(catalogCard, /:kind="playlist\.kind"/);
  assert.match(
    playlistMenu,
    /isAutomaticPlaylistKind\(props\.playlist\.kind\)/,
  );
  assert.match(playlistMenu, /v-if="!automatic"/);
  assert.match(detail, /isAutomaticPlaylistKind\(playlist\.value\.kind\)/);
  assert.match(detail, /playlist\.value\?\.kind === "liked-tracks"/);
  assert.match(detail, /playlist\.value\?\.kind === "recently-added"/);
  assert.match(detail, /:read-only="automatic"/);
  assert.match(detail, /:show-track-likes="!likedAutomatic"/);
  assert.doesNotMatch(detail, /automatic[\s\S]{0,100}page\.playlist\.rename/);
  assert.match(submenu, /filterAddablePlaylists/);
  assert.match(layout, /to: "\/playlists\/liked"/);
  assert.match(offlineToggle, /useLibrarySettings/);
  assert.match(offlineToggle, /setLikedTitlesOffline/);
  assert.match(offlineToggle, /:icon="icons\.cloudDownload"/);
  assert.match(
    offlineToggle,
    /<TooltipTrigger as-child>[\s\S]*class="flex items-center gap-2 rounded-full border bg-muted[^"]*"[\s\S]*<Switch[\s\S]*<\/div>\s*<\/TooltipTrigger>/,
    "The tooltip trigger wraps the whole liked playlist offline pill",
  );
  assert.match(offlineToggle, /<TooltipRoot v-model:open="tooltipOpen">/);
  assert.match(offlineToggle, /@focusin="tooltipOpen = true"/);
  assert.match(
    offlineToggle,
    /class="size-5 text-muted-foreground"/,
    "The shared cloud-download icon uses the larger control size",
  );
  assert.match(
    offlineToggle,
    /:class="likedTitlesOffline \? 'bg-primary' : undefined"/,
    "The enabled switch uses the primary token instead of rendering black",
  );
  assert.match(offlineToggle, /<TooltipContent[\s\S]*side="top"/);
  assert.match(
    offlineToggle,
    /settings\.library\.likedTitlesOfflineTooltip/,
    "The offline setting explains itself in a short tooltip",
  );
  assert.match(offlineToggle, /<Switch[\s\S]*v-model="model"/);
  assert.match(
    offlineToggle,
    /settings\.library\.likedTitlesOffline/,
    "The liked playlist toggle uses the account-level offline preference label",
  );
});
