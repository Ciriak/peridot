import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app layout respects the owner's Tailwind and shadcn styling authority", async () => {
  const files = [
    "../app/app.vue",
    "../app/layouts/default.vue",
    "../app/layouts/settings.vue",
    "../app/components/AppToastList.vue",
    "../app/components/AppToaster.vue",
    "../app/components/AppNotifications.vue",
    "../app/components/AlbumCard.vue",
    "../app/components/AlbumContextMenu.vue",
    "../app/components/ArtistCard.vue",
    "../app/components/ArtistContextMenu.vue",
    "../app/components/LikeButton.vue",
    "../app/components/LibraryScreen.vue",
    "../app/components/QueueDrawer.vue",
    "../app/components/TrackArtistLinks.vue",
    "../app/components/TrackContextMenu.vue",
    "../app/components/TrackTable.vue",
    "../app/pages/albums/index.vue",
    "../app/pages/albums/[album].vue",
    "../app/pages/artists/index.vue",
    "../app/pages/artists/[artist].vue",
    "../app/pages/index.vue",
    "../app/components/FolderTree.vue",
    "../app/pages/onboarding.vue",
    "../app/pages/settings/index.vue",
    "../app/pages/settings/account.vue",
    "../app/pages/settings/library.vue",
    "../app/pages/settings/playback.vue",
    "../app/pages/settings/plugins.vue",
    "../app/pages/settings/sources.vue",
    "../app/pages/settings/metadata.vue",
    "../app/pages/settings/administration.vue",
    "../../../packages/ui/src/components/ui/spinner/Spinner.vue",
  ];
  const source = (
    await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(source, /<style\b/i, "No custom CSS blocks");
  assert.doesNotMatch(source, /\s:?style\s*=/i, "No inline styles");
  assert.doesNotMatch(
    source,
    /[\w-]+-\[[^\]]+\]/,
    "No arbitrary Tailwind values",
  );
  assert.doesNotMatch(
    source,
    /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i,
    "No local color values",
  );
  assert.match(
    source,
    /:colors="\['var\(--primary\)'\]"/,
    "Onboarding explicitly limits its gradient to the primary token",
  );
});

test("the gradient is the sole custom-styling exception and defaults to primary", async () => {
  const source = await readFile(
    new URL(
      "../../../packages/ui/src/components/ui/gradient/Gradient.vue",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<style scoped>/);
  assert.match(source, /colors: \(\) => \["var\(--primary\)"\]/);
  assert.doesNotMatch(
    source,
    /var\(--(?:secondary|accent|chart|destructive)/i,
    "The gradient's built-in palette uses only the primary semantic color",
  );
});
