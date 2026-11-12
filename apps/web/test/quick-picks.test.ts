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
      key: "album:elliot lake\u0000night sessions",
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

test("the sidebar renders cover-playback quick picks without library shortcuts", async () => {
  const [layout, sidebar, tile, composer, client] = await Promise.all([
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
  assert.match(tile, /props\.item\.kind === "track"[\s\S]*?track\.coverUrl/);
  assert.match(tile, /group\/quick-pick/);
  assert.match(tile, /cursor-pointer/);
  assert.match(tile, /group-hover\/quick-pick:opacity-100/);
  assert.match(tile, /group-focus-visible\/quick-pick:opacity-100/);
  assert.match(tile, /activeItem && playing \? icons\.pause : icons\.play/);
  assert.match(tile, /play\(props\.item\.track\)/);
  assert.match(tile, /playCollection\(await albumTracks\(\)\)/);
  assert.match(tile, /togglePlayback\(\)/);
  assert.match(
    tile,
    /async function toggleItemPlayback\(\) \{\s+if \(activeItem\.value && playing\.value\) \{\s+togglePlayback\(\);\s+return;\s+\}/,
    "An album quick pick pauses while playing but restarts the album otherwise",
  );
  assert.match(
    tile,
    /t\("quickPicks\.playAlbum", \{ title: title\.value \}\)/,
    "Album quick pick labels explain that playback starts from the first track",
  );
  assert.match(tile, /quickPickArtistNames\(props\.item\)\.join\(", "\)/);
  assert.doesNotMatch(tile, /item\.kind === "track" \? "Track" : "Album"/);
  assert.match(tile, /item\.kind === "track" \? icons\.music : icons\.library/);
  assert.match(tile, /size-3 shrink-0 text-muted-foreground/);
  assert.doesNotMatch(tile, /<NuxtLink/);
  assert.equal(tile.match(/<Button\b/g)?.length, 1);
  const buttonStart = tile.indexOf("<Button");
  const buttonEnd = tile.indexOf("</Button>");
  assert.ok(buttonStart >= 0 && buttonEnd > buttonStart);
  assert.ok(tile.indexOf("<img") > buttonStart);
  assert.ok(tile.indexOf("{{ title }}") > buttonStart);
  assert.ok(tile.indexOf("{{ title }}") < buttonEnd);
  assert.match(composer, /watch\(playHistoryVersion/);
  assert.match(composer, /fetchQuickPicks/);
  assert.match(
    client,
    /\/api\/tracks\/\$\{encodeURIComponent\(trackId\)\}\/plays/,
  );
  assert.match(client, /\/api\/quick-picks/);
});
