import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  {
    path: "../app/components/LibraryScreen.vue",
    title: />\{\{ title \}\}<\/h1>/,
    descriptionKey: "page.liked.description",
  },
  {
    path: "../app/pages/albums/index.vue",
    title: /t\("navigation\.albums"\)/,
    descriptionKey: "page.albums.description",
  },
  {
    path: "../app/pages/artists/index.vue",
    title: /t\("navigation\.artists"\)/,
    descriptionKey: "page.artists.description",
  },
  {
    path: "../app/pages/playlists.vue",
    title: /t\("navigation\.playlists"\)/,
    descriptionKey: "page.playlists.description",
  },
];

test("library landing pages keep their titles without descriptive subtitles", async () => {
  await Promise.all(
    pages.map(async ({ path, title, descriptionKey }) => {
      const source = await readFile(new URL(path, import.meta.url), "utf8");

      assert.match(source, title);
      assert.doesNotMatch(source, new RegExp(descriptionKey));
    }),
  );
});

test("liked songs uses the shared page-title format", async () => {
  const [page, messages] = await Promise.all([
    readFile(new URL("../app/pages/liked.vue", import.meta.url), "utf8"),
    readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /useHead\(\{ title: t\("page\.liked\.title"\) \}\)/);
  assert.match(page, /:title="t\('navigation\.likedSongs'\)"/);
  assert.match(messages, /"page\.liked\.title": "Liked songs — Peridot"/);
});
