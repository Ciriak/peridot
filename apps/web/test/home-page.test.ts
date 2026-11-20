import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { homeGreetingPeriod } from "../app/lib/home-greeting.ts";

test("home greeting follows the local time of day", () => {
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 0, 0)), "morning");
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 11, 59)), "morning");
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 12, 0)), "afternoon");
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 17, 59)), "afternoon");
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 18, 0)), "evening");
  assert.equal(homeGreetingPeriod(new Date(2026, 10, 13, 23, 59)), "evening");
});

test("home shows liked tracks and the quick-pick content without categories", async () => {
  const [homePage, albumPage] = await Promise.all([
    readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/pages/albums/index.vue", import.meta.url), "utf8"),
  ]);

  assert.match(homePage, /LIKED_TRACKS_PLAYLIST_ID/);
  assert.match(homePage, /useQuickPicks/);
  assert.match(homePage, /usePlaylistList\(\{ limit: 1 \}\)/);
  assert.match(
    homePage,
    /import CatalogCard from "\.\.\/components\/CatalogCard\.vue"/,
  );
  assert.match(
    homePage,
    /playlistCatalogCard\(likedPlaylist\.value\)/,
    "Home wraps the liked playlist in the shared card model",
  );
  assert.match(
    homePage,
    /items\.push\(\.\.\.visibleQuickPickItems\.value\)/,
    "Home combines tracks and albums in the shared card list",
  );
  assert.match(homePage, /<CatalogCard/);
  assert.match(homePage, /catalogCardKey\(item\)/);
  assert.match(
    homePage,
    /useInteractionFrozenList\(quickPickItems\)/,
    "Home keeps the quick-pick order stable during interactions",
  );
  assert.match(homePage, /@pointerenter="beginPointerInteraction"/);
  assert.match(homePage, /@focusout="handleQuickPickFocusOut"/);
  assert.doesNotMatch(homePage, /useCatalogAlbumQuery|useCatalogTrackQuery/);
  assert.doesNotMatch(homePage, /useLikes/);
  assert.doesNotMatch(homePage, /<TrackTable/);
  assert.match(homePage, /page\.home\.suggestions/);
  assert.match(homePage, /page\.home\.noSuggestions/);
  assert.doesNotMatch(homePage, /page\.home\.tracks/);
  assert.doesNotMatch(homePage, /page\.home\.playlists/);
  assert.doesNotMatch(homePage, /<h3/);
  assert.match(homePage, /void loadPlaylists\(\)/);
  assert.match(homePage, /void loadQuickPicks\(\)/);
  assert.match(homePage, /useUser\(\)/);
  assert.match(homePage, /HOME_GREETING_KEYS/);
  assert.match(homePage, /username: user\.value\?\.displayName \?\? ""/);
  assert.doesNotMatch(homePage, /page\.home\.heading/);
  assert.doesNotMatch(homePage, /page\.home\.description/);
  assert.doesNotMatch(homePage, /<ArtistCard/);
  assert.doesNotMatch(homePage, /useCatalogArtistQuery/);
  assert.doesNotMatch(homePage, /count\.suggestion/);
  assert.doesNotMatch(homePage, /page\.home\.allAlbums/);
  assert.doesNotMatch(homePage, /page\.home\.allArtists/);
  assert.doesNotMatch(homePage, /library-search/);
  assert.doesNotMatch(homePage, /<LibraryScreen/);

  assert.match(
    homePage,
    /grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5/,
    "Liked tracks and quick picks share one two-column mobile card grid",
  );
  assert.match(albumPage, /<VirtualCardGrid[\s\S]*layout="wide"/);
  assert.match(
    albumPage,
    /<CatalogCard :item="albumCatalogCard\(item\)" \/>/,
    "The album list keeps its shared CatalogCard usage",
  );
});

test("the standalone library route and navigation item are removed", async () => {
  await assert.rejects(
    access(new URL("../app/pages/library.vue", import.meta.url)),
  );
  const layout = await readFile(
    new URL("../app/layouts/default.vue", import.meta.url),
    "utf8",
  );
  const navigation = layout.slice(
    layout.indexOf("const navigation = ["),
    layout.indexOf("];", layout.indexOf("const navigation = [")),
  );

  assert.doesNotMatch(navigation, /navigation\.library/);
  assert.doesNotMatch(navigation, /to: "\/library"/);
  assert.deepEqual(
    [...navigation.matchAll(/labelKey: "navigation\.(\w+)"/g)].map(
      (match) => match[1],
    ),
    [
      "home",
      "likedSongs",
      "playlists",
      "albums",
      "artists",
      "audiobooks",
      "podcasts",
    ],
  );
});
