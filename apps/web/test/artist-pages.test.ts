import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("artists have list and detail routes with artist-scoped content", async () => {
  const [listPage, detailPage, artistCard, artistArtwork] = await Promise.all([
    readFile(
      new URL("../app/pages/artists/index.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistArtwork.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(listPage, /useCatalogArtistQuery/);
  assert.match(listPage, /items: artists/);
  assert.doesNotMatch(listPage, /library-search/);
  assert.match(listPage, /<ArtistCard/);
  assert.match(listPage, /:artist="artist"/);
  assert.match(artistCard, /:to="artistRoute\(artist\)"/);
  assert.match(artistCard, /<ArtistArtwork :image-url="artist\.imageUrl"/);
  assert.match(artistCard, /card\.localArtistName/);
  assert.match(artistArtwork, /icons\.user/);
  assert.match(artistArtwork, /<FadeInImage[\s\S]*:src="artworkUrl"/);
  assert.match(artistCard, /useLikes\(\)/);
  assert.match(artistCard, /<LikeButton/);
  assert.match(listPage, /t\("page\.artists\.empty"\)/);
  assert.match(detailPage, /useCatalogArtistQuery/);
  assert.match(detailPage, /artistMatches/);
  assert.match(
    detailPage,
    /const artistLoading = computed\(\s+\(\) => artistMatchesLoading\.value && !artist\.value,?\s+\);/,
    "Artist detail loading is blocking only until cached matches resolve",
  );
  assert.match(detailPage, /function loadArtist\(force = false\)/);
  assert.match(
    detailPage,
    /onMounted\(\(\) => \{\s+loadArtist\(\);/,
    "Artist detail mounts without forcing a background catalog refresh",
  );
  assert.doesNotMatch(
    detailPage,
    /artistLoading\.value = true/,
    "Artist detail does not override cached query loading state",
  );
  assert.match(detailPage, /route\.params\.artist/);
  assert.match(detailPage, /useCatalogAlbumQuery/);
  assert.match(detailPage, /artistId: artist\.value\?\.id/);
  assert.match(detailPage, /<AlbumCard/);
  assert.match(detailPage, /:album="album"/);
  assert.match(
    detailPage,
    /grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5/,
    "Artist albums use a two-column mobile grid",
  );
  assert.match(detailPage, /playCollection\(/);
  assert.match(detailPage, /t\("context\.playArtist"\)/);
  assert.match(detailPage, /<LikeButton/);
  assert.match(detailPage, /t\("page\.artist\.unavailable"\)/);
  assert.match(detailPage, /<ArtistArtwork :image-url="artist\.imageUrl"/);
  assert.match(detailPage, /page\.artist\.localName/);
  assert.match(detailPage, /artist\.localName/);
  assert.match(
    detailPage,
    /<div class="mb-2">\s+<Button as-child variant="ghost" size="lg"/,
    "The artist back control is large with tighter page spacing",
  );
});

test("artist names link from navigation and track lists", async () => {
  const [layout, albumDetail, libraryScreen, trackTable, playlist, addDialog] =
    await Promise.all([
      readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/pages/albums/[album].vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/LibraryScreen.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/TrackTable.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/components/AddTracksToPlaylistDialog.vue",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(
    layout,
    /labelKey: "navigation\.artists", to: "\/artists", icon: icons\.user/,
  );
  assert.match(layout, /currentPath\.value\.startsWith\(`\$\{target\}\/`\)/);
  assert.match(albumDetail, /<TrackArtistLinks :artists="album\.artists" \/>/);
  assert.match(
    trackTable,
    /<TrackArtistLinks[\s\S]*?showArtists !== false[\s\S]*?item\.data\.mediaType === 'music'[\s\S]*?:artists="trackArtistNames\(item\.data\)"/,
  );
  assert.match(
    trackTable,
    /:to="trackAlbumRoute\(item\.data\)"/,
    "Artist-page track lists link their album names",
  );
  assert.match(libraryScreen, /variant="library"/);
  assert.match(trackTable, /@dblclick\.stop/);
  assert.match(
    playlist,
    /<TrackArtistLinks[\s\S]*:artists="trackArtistNames\(entry\.track\)"/,
  );
  assert.match(
    addDialog,
    /<TrackArtistLinks :artists="trackArtistNames\(track\)" \/>/,
  );
});
