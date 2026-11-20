import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog metadata uses overflow-aware scrolling wherever it can be clipped", async () => {
  const surfaces = [
    ["../app/components/AddTracksToPlaylistDialog.vue", 2],
    ["../app/components/AddTrackToPlaylistSubmenu.vue", 1],
    ["../app/components/AlbumCard.vue", 2],
    ["../app/components/AlbumContextMenu.vue", 1],
    ["../app/components/ArtistCard.vue", 2],
    ["../app/components/ArtistContextMenu.vue", 3],
    ["../app/components/MobilePlayer.vue", 4],
    ["../app/components/PlaylistCard.vue", 2],
    ["../app/components/PlaylistTrackList.vue", 4],
    ["../app/components/QueueDrawer.vue", 4],
    ["../app/components/QuickPickTileContent.vue", 2],
    ["../app/components/TrackContextMenu.vue", 3],
    ["../app/components/TrackTable.vue", 3],
    ["../app/layouts/default.vue", 2],
    ["../app/pages/albums/[album].vue", 2],
    ["../app/pages/artists/[artist].vue", 2],
    ["../app/pages/playlists/[playlist].vue", 1],
  ] as const;

  for (const [file, minimumUsages] of surfaces) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(
      source,
      /import \{ ScrollingText \} from "@peridot\/ui\/components\/ui\/scrolling-text";/,
      `${file} imports the shared scrolling text component`,
    );
    assert.ok(
      (source.match(/<ScrollingText\b/g) ?? []).length >= minimumUsages,
      `${file} applies scrolling text to every catalog metadata slot`,
    );
  }
});

test("player metadata scrolls while the remaining catalog surfaces wait for interaction", async () => {
  const [player, trackTable, queue, quickPick] = await Promise.all([
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QueueDrawer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QuickPickTileContent.vue", import.meta.url),
      "utf8",
    ),
  ]);

  const footer = player.slice(
    player.indexOf("<footer"),
    player.indexOf("</footer>"),
  );
  assert.equal(
    footer.match(/mode="always"/g)?.length,
    2,
    "The player title and artist line use always-on motion",
  );
  for (const source of [trackTable, queue, quickPick]) {
    assert.doesNotMatch(
      source,
      /<ScrollingText[^>]*\bmode="always"/,
      "Non-player catalog text remains hover/focus activated by default",
    );
  }
});
