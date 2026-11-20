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
    "../app/components/AppSplashScreen.vue",
    "../app/components/AddTracksToPlaylistDialog.vue",
    "../app/components/AddTrackToPlaylistSubmenu.vue",
    "../app/components/AlbumContextMenu.vue",
    "../app/components/ArtistCard.vue",
    "../app/components/ArtistContextMenu.vue",
    "../app/components/ArtistArtwork.vue",
    "../app/components/BackButton.vue",
    "../app/components/CatalogCard.vue",
    "../app/components/FadeInImage.vue",
    "../app/components/LikeButton.vue",
    "../app/components/LibraryScreen.vue",
    "../app/components/ListSearchBar.vue",
    "../app/components/MobilePlayer.vue",
    "../app/components/PlaylistContextMenu.vue",
    "../app/components/PlaylistTrackList.vue",
    "../app/components/QuickPickTileContent.vue",
    "../app/components/QuickPickTile.vue",
    "../app/components/QueueDrawer.vue",
    "../app/components/ScrolledHeader.vue",
    "../app/components/ServerConnectionIndicator.vue",
    "../app/components/SidebarQuickPicks.vue",
    "../app/components/TrackArtistLinks.vue",
    "../app/components/TrackContextMenu.vue",
    "../app/components/TrackTable.vue",
    "../app/components/VirtualCardGrid.vue",
    "../app/pages/albums/index.vue",
    "../app/pages/albums/[album].vue",
    "../app/pages/artists/index.vue",
    "../app/pages/artists/[artist].vue",
    "../app/pages/playlists/[playlist].vue",
    "../app/pages/index.vue",
    "../app/components/FolderTree.vue",
    "../app/pages/onboarding.vue",
    "../app/pages/settings/index.vue",
    "../app/pages/settings/account.vue",
    "../app/pages/settings/library.vue",
    "../app/pages/settings/playback.vue",
    "../app/pages/settings/tasks.vue",
    "../app/pages/settings/users.vue",
    "../app/pages/settings/sources.vue",
    "../app/pages/settings/metadata.vue",
    "../app/pages/settings/server.vue",
    "../../../packages/ui/src/components/ui/progress-circle/ProgressCircle.vue",
    "../../../packages/ui/src/components/ui/scrolling-text/ScrollingText.vue",
    "../../../packages/ui/src/components/ui/spinner/PeridotSpinner.vue",
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(new URL(file, import.meta.url), "utf8"),
    })),
  );
  const source = sources.map((entry) => entry.source).join("\n");
  const virtualStyleFiles = new Set([
    "../app/components/TrackTable.vue",
    "../app/components/VirtualCardGrid.vue",
  ]);
  assert.doesNotMatch(source, /<style\b/i, "No custom CSS blocks");
  for (const entry of sources) {
    if (virtualStyleFiles.has(entry.file)) continue;
    assert.doesNotMatch(
      entry.source,
      /\s:?style\s*=/i,
      `No inline styles in ${entry.file}`,
    );
  }
  assert.match(
    sources.find((entry) => entry.file.endsWith("/TrackTable.vue"))!.source,
    /:style="virtualizer\.virtualRowStyle\(item\)"/,
    "Track rows bind virtualizer-generated positioning only",
  );
  assert.match(
    sources.find((entry) => entry.file.endsWith("/VirtualCardGrid.vue"))!
      .source,
    /:style="virtualizer\.virtualRowStyle\(row\)"/,
    "Card rows bind virtualizer-generated positioning only",
  );
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

test("the gradient remains the sole custom CSS block and defaults to primary", async () => {
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
