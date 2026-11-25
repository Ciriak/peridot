import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CATALOG_PAGE_PATHS = [
  "../app/pages/albums/index.vue",
  "../app/pages/artists/index.vue",
  "../app/pages/audiobooks/index.vue",
  "../app/pages/podcasts/index.vue",
] as const;

test("catalog browse pages share the running scan badge", async () => {
  const [badge, ...pages] = await Promise.all(
    ["../app/components/CatalogUpdateBadge.vue", ...CATALOG_PAGE_PATHS].map(
      (path) => readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );

  for (const page of pages) {
    assert.match(
      page,
      /<Badge variant="secondary">[\s\S]*?<\/Badge>\s*<CatalogUpdateBadge \/>/,
      "The update badge follows the catalog count",
    );
  }

  assert.match(badge, /hasRunningLibraryScan/);
  assert.match(badge, /v-if="indexing"/);
  assert.match(badge, /variant="outline"/);
  assert.match(badge, /aria-live="polite"/);
  assert.match(
    badge,
    /<PeridotSpinner :label="t\('page\.catalog\.indexing'\)"/,
  );
});
