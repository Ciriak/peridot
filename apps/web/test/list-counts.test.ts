import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("collection counts use exact totals beside section headings", async () => {
  const pages = await Promise.all(
    [
      "../app/pages/albums/index.vue",
      "../app/pages/artists/index.vue",
      "../app/pages/audiobooks/index.vue",
      "../app/pages/podcasts/index.vue",
      "../app/pages/playlists/index.vue",
      "../app/components/LibraryScreen.vue",
      "../app/pages/search.vue",
      "../app/pages/artists/[artist].vue",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const page of pages) {
    assert.match(
      page,
      /<div class="flex flex-wrap items-center gap-2">\s*<h2/,
      "The count badge follows its section heading instead of occupying the far edge",
    );
    assert.doesNotMatch(
      page,
      /hasMore[^\n]*\?[^\n]*"\+"/,
      "Collection headers do not append a pagination placeholder to the count",
    );
  }

  assert.match(pages[0]!, /loading \? t\("common\.loading"\) : totalCount/);
  assert.match(pages[1]!, /loading \? t\("common\.loading"\) : totalCount/);
  assert.match(pages[2]!, /loading \? t\("common\.loading"\) : totalCount/);
  assert.match(pages[3]!, /loading \? t\("common\.loading"\) : totalCount/);
  assert.match(pages[4]!, /loading \? t\("common\.loading"\) : totalCount/);
  assert.match(pages[5]!, /t\("count\.track", \{ count: totalCount \}/);
  assert.match(pages[6]!, /totalCount: artistTotalCount/);
  assert.match(pages[6]!, /totalCount: albumTotalCount/);
  assert.match(pages[6]!, /totalCount: trackTotalCount/);
  assert.match(pages[7]!, /totalCount: albumTotalCount/);
  assert.match(pages[7]!, /totalCount: trackTotalCount/);
});
