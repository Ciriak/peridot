import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import { albumSummaryFromTrack } from "../app/lib/library.ts";

test("shared catalog links combine navigation with their matching menus", async () => {
  const [artistLink, albumLink, artistLinks, artistMenu] = await Promise.all([
    readFile(
      new URL("../app/components/ArtistLink.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/AlbumLink.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TrackArtistLinks.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistContextMenu.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    artistLink,
    /<ArtistContextMenu :artist="artist">[\s\S]*<NuxtLink\s+:to="artistLinkRoute"[\s\S]*hover:underline/,
  );
  assert.match(
    artistLink,
    /typeof props\.artist === "string" \? \{ name: props\.artist \} : props\.artist/,
  );
  assert.match(
    albumLink,
    /<AlbumContextMenu :album="album">[\s\S]*<NuxtLink\s+:to="albumRoute\(album\)"[\s\S]*hover:underline/,
  );
  assert.match(
    artistLinks,
    /v-for="\(artist, index\) in artists"[\s\S]*<ArtistLink :artist="artist" \/>/,
  );
  assert.match(artistMenu, /artist: string \| ArtistSummaryResponse/);
  assert.match(artistMenu, /@update:open="onContextMenuOpen"/);
  assert.match(artistMenu, /listArtists\(/);
  assert.match(artistMenu, /candidate\.localName\.trim\(\)\.toLowerCase\(\)/);
  assert.match(artistMenu, /artistId: artistSummary\.value\.id/);
});

test("catalog surfaces render shared artist and album references", async () => {
  const [
    trackTable,
    albumDetail,
    artistDetail,
    artistCard,
    playlistTracks,
    addTracks,
    layout,
    mobilePlayer,
    queueDrawer,
  ] = await Promise.all([
    readFile(
      new URL("../app/components/TrackTable.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/albums/[album].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/pages/artists/[artist].vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ArtistCard.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PlaylistTrackList.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/AddTracksToPlaylistDialog.vue",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/layouts/default.vue", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/MobilePlayer.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/QueueDrawer.vue", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    trackTable,
    /<TrackArtistLinks :artists="trackArtistNames\(item\.track\)" \/>/,
  );
  assert.match(
    trackTable,
    /<AlbumLink :album="albumSummaryFromTrack\(item\.track\)" \/>/,
  );
  assert.match(albumDetail, /<AlbumLink :album="album">/);
  assert.match(artistDetail, /<ArtistLink :artist="artist">/);
  assert.match(
    artistDetail,
    /<ArtistLink :artist="artist\.localName">\s*<ScrollingText/,
  );
  assert.match(artistCard, /<ArtistLink :artist="artist">/);
  assert.match(artistCard, /<ArtistLink :artist="artist\.localName">/);
  assert.match(
    playlistTracks,
    /<ArtistLink\s+v-else-if="entry\.artist\.trim\(\)"\s+:artist="entry\.artist"\s*\/>/,
  );
  assert.match(playlistTracks, /<AlbumLink\s+v-if="entry\.album"/);
  assert.match(
    addTracks,
    /<AlbumLink :album="albumSummaryFromTrack\(track\)" \/>/,
  );

  for (const source of [layout, mobilePlayer, queueDrawer]) {
    assert.match(source, /<TrackArtistLinks/);
  }
});

test("track album summaries retain catalog identity for album menus", () => {
  const track: TrackResponse = {
    id: "track-1",
    mediaType: "music",
    mediaTypeOrigin: "embedded",
    sourceKind: "path",
    title: "Night Drive",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    album: "Night Sessions",
    genres: [],
    albumId: "album-1",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 180000,
    publishedAt: null,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: "/api/covers/album-1",
    metadata: null,
    liked: true,
  };

  assert.deepEqual(albumSummaryFromTrack(track), {
    id: "album-1",
    title: "Night Sessions",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    sourceKinds: ["path"],
    coverUrl: "/api/covers/album-1",
    trackCount: 1,
    durationMs: 180000,
    releaseYear: null,
    available: true,
    liked: true,
  });
  assert.equal(
    albumSummaryFromTrack({ ...track, albumId: null }).trackCount,
    0,
  );
});
