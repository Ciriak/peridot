import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { virtualTrackItemCount } from "../app/lib/virtual-tracks.ts";

test("track placeholders stop when pagination is exhausted", () => {
  assert.equal(
    virtualTrackItemCount({
      loadedCount: 100,
      totalCount: 137,
      hasMore: false,
      loadingMore: false,
    }),
    100,
  );
  assert.equal(
    virtualTrackItemCount({
      loadedCount: 100,
      totalCount: 137,
      hasMore: true,
      loadingMore: false,
    }),
    137,
  );
  assert.equal(
    virtualTrackItemCount({
      loadedCount: 100,
      totalCount: 137,
      hasMore: false,
      loadingMore: true,
    }),
    137,
  );
});

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
  assert.match(grid, /useVirtualLoadMore/);
  assert.match(grid, /virtualizer\.virtualItems\.value/);
  assert.match(grid, /virtualizer\.measureRow/);
  assert.match(
    grid,
    /:ref="virtualizer\.measureRow"\s+:data-index="row\.index"/,
    "Placeholder and data rows use their measured grid height",
  );
  assert.match(grid, /emit\("load-more"\)/);
  assert.match(
    grid,
    /"visible-range": \[startIndex: number, endIndex: number\]/,
  );
  assert.match(grid, /watchDebounced/);
  assert.match(grid, /props\.pagingMode !== "window"/);
  assert.match(grid, /debounce: VIRTUAL_WINDOW_LOAD_DELAY_MS/);
  assert.doesNotMatch(grid, /maxWait/);
  assert.match(grid, /name="placeholder"/);
  assert.match(grid, /placeholder\?\(props: \{ itemIndex: number \}\)/);
  assert.match(grid, /virtualCardRowPlaceholderCount/);
  assert.match(grid, /Math\.ceil\(totalItemCount\.value \/ columns\.value\)/);
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
    "Standard and wide card rows render two columns by default at mobile widths",
  );
  assert.match(
    grid,
    /props\.singleColumnMobile && !breakpoints\.sm\.value[\s\S]*return 1;/,
    "The artists grid opts into one card per phone-width row",
  );

  const countedPages = [
    [albums, "useVirtualAlbums"],
    [artists, "useVirtualArtists"],
    [artistDetail, "useVirtualAlbums"],
    [audiobooks, "useVirtualAudiobooks"],
    [podcasts, "useVirtualPodcasts"],
    [playlists, "useVirtualPlaylists"],
  ] as const;
  for (const [page, hook] of countedPages) {
    assert.match(page, new RegExp(hook));
    assert.match(page, /<VirtualCardGrid/);
    assert.match(page, /:total-count=/);
    assert.match(page, /:loaded-count=/);
    assert.match(page, /paging-mode="window"/);
    assert.match(page, /@visible-range=/);
    assert.match(page, /<template #placeholder>/);
    assert.doesNotMatch(
      page.match(/<VirtualCardGrid[\s\S]*?<\/VirtualCardGrid>/)?.[0] ?? "",
      /@load-more=/,
    );
  }
  assert.match(albums, /useVirtualAlbums/);
  assert.match(albums, /<AlbumCardPlaceholder/);
  assert.match(artists, /<ArtistCardPlaceholder/);
  assert.match(artists, /single-column-mobile/);
  assert.match(audiobooks, /<AlbumCardPlaceholder/);
  assert.match(podcasts, /<AlbumCardPlaceholder/);
  assert.match(playlists, /<AlbumCardPlaceholder/);
});

test("track tables reserve the total count and placeholder rows for paging", async () => {
  const trackTable = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );

  assert.match(trackTable, /useVirtualLoadMore/);
  assert.match(trackTable, /count: totalItemCount/);
  assert.match(trackTable, /virtualTrackItemCount/);
  assert.match(trackTable, /totalCount\?: number/);
  assert.doesNotMatch(trackTable, /<AutoLoadMore/);
  assert.match(trackTable, /track: props\.tracks\[row\.index\]/);
  assert.match(trackTable, /v-if="item\.track"/);
  assert.match(trackTable, /v-else[\s\S]*?animate-pulse/);
  assert.match(trackTable, /motion-reduce:animate-none/);
  assert.match(
    trackTable,
    /ref="rowGroup"[\s\S]*?height: `\$\{virtualizer\.totalSize\.value\}px`/,
    "The track row container exposes the complete virtual size to the scrollbar",
  );
});

test("playlist rows use the shared virtualizer without losing reordering", async () => {
  const playlistRows = await readFile(
    new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
    "utf8",
  );

  assert.match(playlistRows, /useMainScrollVirtualizer/);
  assert.match(
    playlistRows,
    /v-for="\{ entry, index, start \} in virtualRows"/,
  );
  assert.match(
    playlistRows,
    /:style="virtualizer\.virtualRowStyle\(\{ start \}\)"/,
  );
  assert.match(playlistRows, /useSortable\(list, rows/);
  assert.match(playlistRows, /playlistEntriesAfterDrag/);
  assert.match(playlistRows, /emit\("reorder", itemIds\)/);
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
  assert.match(search, /:tracks="displayedTrackResults"/);
  assert.match(search, /:total-count="displayedArtistResults\.length"/);
  assert.match(search, /:total-count="displayedAudiobookResults\.length"/);
  assert.match(search, /:total-count="displayedPodcastResults\.length"/);
  assert.doesNotMatch(search, /@load-more=/);
  assert.match(
    search,
    /aria-labelledby="recent-searches-heading"[\s\S]*?role="list"\s+class="divide-y overflow-hidden rounded-lg border"[\s\S]*?<CatalogCard[\s\S]*?layout="row"/,
    "Recent search results render through the shared row list surface",
  );
});
