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

test("home suggests albums and tracks from the catalog", async () => {
  const [homePage, albumPage] = await Promise.all([
    readFile(new URL("../app/pages/index.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/pages/albums/index.vue", import.meta.url), "utf8"),
  ]);

  assert.match(homePage, /useCatalogAlbumQuery/);
  assert.match(homePage, /useCatalogTrackQuery/);
  assert.match(homePage, /selectHomeAlbumSuggestions/);
  assert.match(homePage, /selectHomeTrackSuggestions/);
  assert.match(homePage, /likedArtistKeys/);
  assert.doesNotMatch(homePage, /likedAlbumIds|likedTrackIds/);
  assert.match(homePage, /limit: HOME_CANDIDATE_LIMIT/g);
  assert.match(homePage, /<AlbumCard/);
  assert.match(homePage, /:album="album"/);
  assert.match(homePage, /<TrackTable/);
  assert.match(homePage, /:tracks="suggestedTracks"/);
  assert.match(homePage, /page\.home\.suggestions/);
  assert.match(homePage, /page\.home\.noSuggestions/);
  assert.match(homePage, /page\.home\.playlists/);
  assert.match(homePage, /void loadLikes\(\)/);
  assert.match(homePage, /useUser\(\)/);
  assert.match(homePage, /HOME_GREETING_KEYS/);
  assert.match(homePage, /username: user\.value\?\.displayName \?\? ""/);
  assert.doesNotMatch(homePage, /page\.home\.heading/);
  assert.doesNotMatch(homePage, /page\.home\.description/);
  assert.doesNotMatch(homePage, /liked: true/);
  assert.doesNotMatch(homePage, /page\.home\.liked/);
  assert.doesNotMatch(homePage, /<ArtistCard/);
  assert.doesNotMatch(homePage, /useCatalogArtistQuery/);
  assert.doesNotMatch(homePage, /count\.suggestion/);
  assert.doesNotMatch(homePage, /page\.home\.allAlbums/);
  assert.doesNotMatch(homePage, /page\.home\.allArtists/);
  assert.doesNotMatch(homePage, /library-search/);
  assert.doesNotMatch(homePage, /<LibraryScreen/);

  const gridClass =
    /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5/;
  assert.match(homePage, gridClass);
  assert.match(albumPage, gridClass);
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
