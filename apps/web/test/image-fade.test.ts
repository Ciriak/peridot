import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadArtworkCacheFirst } from "../app/lib/artwork-loading.ts";

test("images fade in after a network load and can bypass the transition", async () => {
  const source = await readFile(
    new URL("../app/components/FadeInImage.vue", import.meta.url),
    "utf8",
  );

  assert.match(source, /const loaded = ref\(false\)/);
  assert.match(source, /loaded \? 'opacity-100' : 'opacity-0'/);
  assert.match(source, /fadeIn\?: boolean/);
  assert.match(source, /fadeIn: true/);
  assert.match(source, /'transition-opacity duration-300 ease-out': fadeIn/);
  assert.match(source, /motion-reduce:transition-none/);
  assert.match(source, /@load="loaded = true"/);
  assert.match(
    source,
    /watch\(\s+\(\) => props\.src,\s+\(\) => \{\s+loaded\.value = false;/,
    "Changing the cover resets the fade before the next image loads",
  );
  assert.match(source, /@error="emit\('error', \$event\)"/);
});

test("cached artwork disables the fade before the image is rendered", async () => {
  const source = await readFile(
    new URL("../app/composables/use-cached-artwork.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /const fromCache = ref\(false\)/);
  assert.match(source, /loadArtworkCacheFirst/);
  assert.match(source, /fromCache\.value = resolvedFromCache/);
  assert.match(source, /return \{ artworkUrl, failed, fromCache \}/);
});

test("cached artwork does not request the image again", async () => {
  const cached = new Blob(["cached"]);
  let remoteRequests = 0;

  const result = await loadArtworkCacheFirst(
    async () => cached,
    async () => {
      remoteRequests += 1;
      return new Blob(["remote"]);
    },
  );

  assert.equal(result.blob, cached);
  assert.equal(result.fromCache, true);
  assert.equal(remoteRequests, 0);
});

test("uncached artwork loads remotely and keeps the fade enabled", async () => {
  const remote = new Blob(["remote"]);

  const result = await loadArtworkCacheFirst(
    async () => null,
    async () => remote,
  );

  assert.equal(result.blob, remote);
  assert.equal(result.fromCache, false);
});

test("cover art and artist portraits disable fades for cached images", async () => {
  const files = [
    "../app/components/TrackArtwork.vue",
    "../app/components/ArtistArtwork.vue",
    "../app/components/PlaylistCoverTile.vue",
    "../app/components/CatalogCard.vue",
    "../app/components/MediaCollectionCard.vue",
    "../app/components/MediaCollectionDetail.vue",
    "../app/components/MobilePlayer.vue",
    "../app/components/QuickPickTileContent.vue",
    "../app/layouts/default.vue",
    "../app/pages/albums/[album].vue",
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  );

  for (const [index, source] of sources.entries()) {
    assert.match(
      source,
      /<FadeInImage/,
      `${files[index]} renders artwork through the shared fade-in component`,
    );
    assert.match(
      source,
      /:fade-in="![A-Za-z]*[Ff]romCache"/,
      `${files[index]} disables the fade for artwork read from cache`,
    );
    assert.doesNotMatch(
      source,
      files[index]?.endsWith("layouts/default.vue")
        ? /<img\b(?:(?!>).)*currentCoverImageUrl/s
        : /<img\b/,
      `${files[index]} does not bypass the shared image fade`,
    );
  }
});
