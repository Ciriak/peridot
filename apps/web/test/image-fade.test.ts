import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("images fade in after they load", async () => {
  const source = await readFile(
    new URL("../app/components/FadeInImage.vue", import.meta.url),
    "utf8",
  );

  assert.match(source, /const loaded = ref\(false\)/);
  assert.match(source, /:class="loaded \? 'opacity-100' : 'opacity-0'"/);
  assert.match(
    source,
    /transition-opacity duration-300 ease-out motion-reduce:transition-none/,
  );
  assert.match(source, /@load="loaded = true"/);
  assert.match(
    source,
    /watch\(\s+\(\) => props\.src,\s+\(\) => \{\s+loaded\.value = false;/,
    "Changing the cover resets the fade before the next image loads",
  );
  assert.match(source, /@error="emit\('error', \$event\)"/);
});

test("cover art and artist portraits use the shared fade-in image", async () => {
  const files = [
    "../app/components/TrackArtwork.vue",
    "../app/components/AlbumCard.vue",
    "../app/components/ArtistArtwork.vue",
    "../app/components/PlaylistCoverTile.vue",
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
    assert.doesNotMatch(
      source,
      files[index]?.endsWith("layouts/default.vue")
        ? /<img\b(?:(?!>).)*currentCoverImageUrl/s
        : /<img\b/,
      `${files[index]} does not bypass the shared image fade`,
    );
  }
});
