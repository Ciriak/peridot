import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog card grids virtualize responsive rows against the main scroll", async () => {
  const [grid, albums, artists, artistDetail, audiobooks, podcasts, playlists] =
    await Promise.all(
      [
        "../app/components/VirtualCardGrid.vue",
        "../app/pages/albums/index.vue",
        "../app/pages/artists/index.vue",
        "../app/pages/artists/[artist].vue",
        "../app/pages/audiobooks/index.vue",
        "../app/pages/podcasts/index.vue",
        "../app/pages/playlists/index.vue",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );

  assert.match(grid, /useMainScrollVirtualizer/);
  assert.match(grid, /virtualizer\.virtualItems\.value/);
  assert.match(grid, /:ref="virtualizer\.measureRow"/);
  assert.match(grid, /:style="\{ overflowAnchor: 'none' \}"/);
  assert.match(grid, /overflowAnchor: 'none'/);
  assert.match(grid, /grid-cols-2.*lg:grid-cols-3.*xl:grid-cols-5/);
  assert.match(grid, /grid-cols-2.*sm:grid-cols-4.*md:grid-cols-6/);
  assert.match(
    grid,
    /if \(breakpoints\.sm\.value\) return 4;[\s\S]*return 2;/,
    "Compact card rows render two columns at mobile widths",
  );
  assert.match(
    grid,
    /if \(breakpoints\.lg\.value\) return 3;[\s\S]*return 2;/,
    "Standard and wide card rows render two columns at mobile widths",
  );

  for (const page of [
    albums,
    artists,
    artistDetail,
    audiobooks,
    podcasts,
    playlists,
  ]) {
    assert.match(page, /<VirtualCardGrid/);
  }
});

test("catalog search uses the shared row surfaces for tracks and collections", async () => {
  const search = await readFile(
    new URL("../app/pages/search.vue", import.meta.url),
    "utf8",
  );

  assert.match(search, /useCatalogArtistQuery/);
  assert.match(search, /useCatalogAlbumQuery/);
  assert.match(search, /useCatalogTrackQuery/);
  assert.match(search, /useCatalogAudiobookQuery/);
  assert.match(search, /useCatalogPodcastQuery/);
  assert.match(search, /layout="row"/);
  assert.match(search, /layout="standard"/);
  assert.match(search, /<TrackTable/);
  assert.match(search, /<VirtualCardGrid/);
  assert.match(
    search,
    /grid grid-cols-2 gap-1\.5 sm:grid-cols-4/,
    "Recent search cards render two columns at mobile widths",
  );
});
