import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldShowScrolledHeader } from "../app/lib/scrolled-header.ts";

test("scrolled header appears only after the full card leaves above the viewport", () => {
  assert.equal(
    shouldShowScrolledHeader({
      isIntersecting: true,
      targetBottom: 120,
      rootTop: 64,
    }),
    false,
  );
  assert.equal(
    shouldShowScrolledHeader({
      isIntersecting: false,
      targetBottom: 120,
      rootTop: 64,
    }),
    false,
  );
  assert.equal(
    shouldShowScrolledHeader({
      isIntersecting: false,
      targetBottom: 64,
      rootTop: 64,
    }),
    true,
  );
  assert.equal(
    shouldShowScrolledHeader({
      isIntersecting: false,
      targetBottom: 63,
      rootTop: 64,
    }),
    true,
  );
});

test("the scrolled header provides compact history and playback controls", async () => {
  const [component, backButton] = await Promise.all([
    readFile(
      new URL("../app/components/ScrolledHeader.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/BackButton.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(component, /useIntersectionObserver/);
  assert.match(component, /MAIN_SCROLL_ELEMENT_KEY/);
  assert.match(component, /root: scrollElement/);
  assert.match(component, /<Teleport to="body">/);
  assert.match(component, /v-if="visible"/);
  assert.match(
    component,
    /class="fixed inset-x-0 top-16 -mt-px z-20 border-b bg-card\/95 text-card-foreground md:left-56"/,
  );
  assert.match(component, /<BackButton icon-only \/>/);
  assert.match(
    component,
    /v-if="coverUrl"[\s\S]*?class="relative hidden size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground md:flex"[\s\S]*?<FadeInImage[\s\S]*?:src="coverUrl"[\s\S]*?:fade-in="coverFadeIn"/,
    "The compact header renders its cover on desktop",
  );
  assert.match(component, /<ScrollingText[\s\S]*?\{\{ title \}\}/);
  assert.match(component, /:disabled="!playable"/);
  assert.match(
    component,
    /:aria-label="playbackActive \? pauseLabel : playLabel"/,
  );
  assert.match(component, /playbackActive \? icons\.pause : icons\.play/);
  assert.match(component, /@click="emit\('play'\)"/);
  assert.match(
    backButton,
    /withDefaults\(defineProps<\{ iconOnly\?: boolean \}>/,
  );
  assert.match(
    backButton,
    /v-if="iconOnly"[\s\S]*?:aria-label="t\('common\.back'\)"/,
  );
});

test("all catalog detail headers reuse their existing playback handlers", async () => {
  const surfaces = await Promise.all(
    [
      {
        path: "../app/pages/albums/[album].vue",
        handler: "toggleAlbumPlayback",
        labels: ["albumPlayLabel", "albumPauseLabel"],
      },
      {
        path: "../app/pages/artists/[artist].vue",
        handler: "playWholeArtist",
        labels: ["artistPlayLabel", "artistPauseLabel"],
      },
      {
        path: "../app/pages/playlists/[playlist].vue",
        handler: "togglePlaylistPlayback",
        labels: ["playlistPlayLabel", "playlistPauseLabel"],
      },
      {
        path: "../app/components/MediaCollectionDetail.vue",
        handler: "toggleCollectionPlayback",
        labels: ["collectionPlayLabel", "collectionPauseLabel"],
      },
    ].map(async ({ path, handler, labels }) => ({
      path,
      handler,
      labels,
      source: await readFile(new URL(path, import.meta.url), "utf8"),
    })),
  );

  for (const surface of surfaces) {
    assert.match(
      surface.source,
      /import ScrolledHeader from/,
      `${surface.path} imports the shared scrolled header`,
    );
    assert.match(
      surface.source,
      /<ScrolledHeader[\s\S]*?:playback-active=/,
      `${surface.path} passes collection playback state`,
    );
    assert.match(
      surface.source,
      /<ScrolledHeader[\s\S]*?:playable=/,
      `${surface.path} passes collection availability`,
    );
    assert.match(
      surface.source,
      new RegExp(`@play="${surface.handler}"`),
      `${surface.path} reuses the existing playback handler in the compact header`,
    );
    assert.match(
      surface.source,
      new RegExp(`@click="${surface.handler}"`),
      `${surface.path} keeps the same playback handler in the full header`,
    );
    assert.match(
      surface.source,
      new RegExp(`:play-label="${surface.labels[0]}"`),
      `${surface.path} shares the full header play label`,
    );
    assert.match(
      surface.source,
      new RegExp(`:pause-label="${surface.labels[1]}"`),
      `${surface.path} shares the full header pause label`,
    );
    if (surface.path.includes("/albums/")) {
      assert.match(
        surface.source,
        /<ScrolledHeader[\s\S]*?:cover-url="coverImageUrl"[\s\S]*?:cover-fade-in="!coverFromCache"/,
        "The album compact header reuses the album artwork",
      );
    }
    assert.match(
      surface.source,
      new RegExp(
        `:aria-label="[\\s\\S]*?(?:${surface.labels[0]}[\\s\\S]*?${surface.labels[1]}|${surface.labels[1]}[\\s\\S]*?${surface.labels[0]})`,
      ),
      `${surface.path} applies the shared labels to the full header control`,
    );
  }
});
