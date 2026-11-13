import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import { ref } from "vue";
import { useInteractionFrozenList } from "../app/composables/use-interaction-frozen-list.ts";
import {
  quickPickArtistNames,
  resolveQuickPicks,
} from "../app/lib/quick-picks.ts";

const tracks: TrackResponse[] = [
  {
    id: "track-a",
    title: "Opening",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    album: "Night Sessions",
    albumId: "album-night-sessions",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: "/api/tracks/track-a/cover",
    metadata: null,
    liked: false,
  },
  {
    id: "track-b",
    title: "Closing",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    album: "Night Sessions",
    albumId: "album-night-sessions",
    discNumber: 1,
    trackNumber: 2,
    durationMs: 200_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: false,
  },
];

test("quick pick responses preserve server-resolved track and album data", () => {
  const resolved = resolveQuickPicks([
    {
      kind: "track",
      key: "track:track-b",
      trackId: "track-b",
      track: tracks[1]!,
    },
    {
      kind: "album",
      key: "album:album-night-sessions",
      title: "Night Sessions",
      artist: "Elliot Lake",
      album: {
        id: "album-night-sessions",
        title: "Night Sessions",
        artist: "Elliot Lake",
        artists: ["Elliot Lake"],
        coverUrl: "/api/tracks/track-a/cover",
        trackCount: 2,
        durationMs: 380_000,
        releaseYear: null,
        liked: false,
      },
    },
  ]);

  assert.deepEqual(
    resolved.map((item) => item.kind),
    ["track", "album"],
  );
  assert.equal(
    resolved[0]?.kind === "track" ? resolved[0].track.title : null,
    "Closing",
  );
  assert.equal(
    resolved[0]?.kind === "track" ? resolved[0].track.coverUrl : null,
    null,
  );
  assert.deepEqual(
    resolved[1]?.kind === "album" ? resolved[1].album.trackCount : 0,
    2,
  );
  assert.deepEqual(resolved[0] ? quickPickArtistNames(resolved[0]) : [], [
    "Elliot Lake",
  ]);
  assert.deepEqual(resolved[1] ? quickPickArtistNames(resolved[1]) : [], [
    "Elliot Lake",
  ]);
  assert.deepEqual(
    quickPickArtistNames({
      kind: "track",
      key: "track:collaboration",
      track: { ...tracks[0]!, artists: ["Elliot Lake", "Óra"] },
      trackId: "collaboration",
    }),
    ["Elliot Lake", "Óra"],
  );
});

test("quick pick order stays frozen while pointer and focus interactions overlap", () => {
  const source = ref<readonly string[]>(["first"]);
  const list = useInteractionFrozenList(source);

  list.beginPointerInteraction();
  source.value = ["second"];
  assert.deepEqual(list.items.value, ["first"]);

  list.beginFocusInteraction();
  list.endPointerInteraction();
  assert.deepEqual(list.items.value, ["first"]);

  source.value = ["third"];
  list.endFocusInteraction();
  assert.deepEqual(list.items.value, ["third"]);
});

test("the sidebar renders linked, context-aware quick picks", async () => {
  const [layout, sidebar, tile, content, composer, client] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/SidebarQuickPicks.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTile.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTileContent.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/composables/use-quick-picks.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/peridot-client.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /import SidebarQuickPicks/);
  assert.match(layout, /<SidebarQuickPicks \/>/);
  assert.doesNotMatch(layout, />Your library</);
  assert.doesNotMatch(layout, /libraryLoading \? "Loading…"/);
  assert.match(sidebar, /quickPicks\.title/);
  assert.match(sidebar, /flex flex-col gap-2/);
  assert.doesNotMatch(sidebar, /grid-cols-2/);
  assert.match(sidebar, /quickPicks\.empty/);
  assert.match(sidebar, /resolveQuickPicks\(items\.value\)/);
  assert.match(sidebar, /useInteractionFrozenList\(resolvedItems\)/);
  assert.match(sidebar, /@pointerenter="beginPointerInteraction"/);
  assert.match(sidebar, /@pointerleave="endPointerInteraction"/);
  assert.match(sidebar, /@focusin="beginFocusInteraction"/);
  assert.match(sidebar, /@focusout="handleFocusOut"/);
  assert.match(tile, /import TrackContextMenu/);
  assert.match(tile, /import AlbumContextMenu/);
  assert.match(
    tile,
    /<TrackContextMenu[\s\S]*:track="item\.track"[\s\S]*@play="toggleItemPlayback"/,
  );
  assert.match(tile, /<AlbumContextMenu v-else :album="item\.album">/);
  assert.equal(tile.match(/<QuickPickTileContent/g)?.length, 2);
  assert.match(tile, /props\.item\.kind === "track"[\s\S]*?track\.coverUrl/);
  assert.match(content, /props\.coverUrl/);
  assert.match(content, /group\/quick-pick/);
  assert.match(content, /cursor-pointer/);
  assert.match(content, /group-hover\/quick-pick:opacity-100/);
  assert.match(content, /group-focus-within\/quick-pick:opacity-100/);
  assert.match(content, /activeItem && playing \? icons\.pause : icons\.play/);
  assert.match(tile, /play\(props\.item\.track\)/);
  assert.match(tile, /playCollection\(await albumTracks\(\)\)/);
  assert.match(tile, /togglePlayback\(\)/);
  assert.match(
    tile,
    /async function toggleItemPlayback\(\) \{\s+if \(!playable\.value\) return;\s+if \(activeItem\.value && playing\.value\) \{\s+togglePlayback\(\);\s+return;\s+\}/,
    "An album quick pick pauses while playing but restarts the album otherwise",
  );
  assert.match(
    tile,
    /t\("quickPicks\.playAlbum", \{ title: title\.value \}\)/,
    "Album quick pick labels explain that playback starts from the first track",
  );
  assert.match(
    content,
    /quickPickArtistNames\(props\.item\)/,
    "Artist credits use the server-resolved credit list",
  );
  assert.doesNotMatch(tile, /item\.kind === "track" \? "Track" : "Album"/);
  assert.match(
    content,
    /item\.kind === "track" \? icons\.music : icons\.library/,
  );
  assert.match(content, /size-3 shrink-0 text-muted-foreground/);
  assert.match(
    content,
    /trackAlbumTitleRoute\(props\.item\.track\) \?\?[\s\S]*artistRoute\(\{ name: props\.item\.track\.artist \}\)[\s\S]*albumRoute\(props\.item\.album\)/,
    "Track and album names link to their album details",
  );
  assert.match(
    content,
    /<NuxtLink[\s\S]*<Icon[\s\S]*\{\{ title \}\}/,
    "The type icon is part of the name link",
  );
  assert.match(content, /<TrackArtistLinks :artists="artistNames" \/>/);
  assert.equal(content.match(/<Button\b/g)?.length, 1);
  const buttonStart = content.indexOf("<Button");
  const buttonEnd = content.indexOf("</Button>");
  assert.ok(buttonStart >= 0 && buttonEnd > buttonStart);
  assert.ok(content.indexOf("<img") > buttonStart);
  assert.ok(content.indexOf("{{ title }}") > buttonEnd);
  assert.match(composer, /watch\(playHistoryVersion/);
  assert.match(composer, /fetchQuickPicks/);
  assert.match(
    client,
    /\/api\/tracks\/\$\{encodeURIComponent\(trackId\)\}\/plays/,
  );
  assert.match(client, /\/api\/quick-picks/);
});
