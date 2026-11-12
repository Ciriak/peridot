import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TrackResponse } from "@peridot/contracts";
import {
  albumLikeKey,
  artistLikeKey,
  albumRoute,
  artistRoute,
  defaultTrackSort,
  filterAlbums,
  filterArtists,
  filterTracks,
  findAlbum,
  findArtist,
  formatTrackDuration,
  trackArtistNames,
  trackDownloadFileName,
  formatTrackNumber,
  groupAlbums,
  groupArtists,
  nextTrackSort,
  nextQueueTrackId,
  resolvePlayerQueue,
  sortTracks,
  trackAlbumRoute,
  trackAlbumTitleRoute,
  trackCoverUrl,
  trackIdFromTitleHash,
  trackTitleAnchorId,
} from "../app/lib/library.ts";

const tracks: TrackResponse[] = [
  {
    id: "track-1",
    title: "Blue Hours",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    album: "Night Sessions",
    discNumber: null,
    trackNumber: 2,
    durationMs: 284_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: false,
  },
  {
    id: "track-2",
    title: "Soft Geometry",
    artist: "Óra",
    artists: ["Óra"],
    album: null,
    discNumber: null,
    trackNumber: null,
    durationMs: 3_661_000,
    mimeType: "audio/flac",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: false,
  },
];

test("library search matches track titles, artists, and albums", () => {
  assert.deepEqual(
    filterTracks(tracks, "  BLUE HOURS  ").map((track) => track.id),
    ["track-1"],
  );
  assert.deepEqual(
    filterTracks(tracks, "night sessions").map((track) => track.id),
    ["track-1"],
  );
  assert.deepEqual(
    filterTracks(tracks, "ÓRA").map((track) => track.id),
    ["track-2"],
  );
  assert.deepEqual(filterTracks(tracks, "unknown"), []);
});

test("favorites filter preserves catalog order without mutating tracks", () => {
  assert.deepEqual(
    filterTracks(tracks, "", ["track-2"]).map((track) => track.id),
    ["track-2"],
  );
  assert.deepEqual(filterTracks(tracks, "", []), []);
  assert.equal(tracks.length, 2);
});

test("track text fields sort case-insensitively and toggle direction", () => {
  const catalog: TrackResponse[] = [
    { ...tracks[0]!, id: "zebra", title: "Zebra", artist: "Óra" },
    { ...tracks[0]!, id: "alpha", title: "alpha", artist: "Beta" },
    { ...tracks[0]!, id: "middle", title: "Middle", artist: "alpha" },
  ];

  assert.deepEqual(
    sortTracks(catalog, { field: "title", direction: "asc" }).map(
      (track) => track.id,
    ),
    ["alpha", "middle", "zebra"],
  );
  assert.deepEqual(
    sortTracks(catalog, { field: "artist", direction: "desc" }).map(
      (track) => track.id,
    ),
    ["zebra", "alpha", "middle"],
  );
  assert.deepEqual(
    catalog.map((track) => track.id),
    ["zebra", "alpha", "middle"],
    "sorting returns a copy without mutating the catalog",
  );
});

test("sort state cycles through ascending, descending, and default", () => {
  assert.deepEqual(defaultTrackSort("library"), {
    field: "title",
    direction: "asc",
  });
  assert.deepEqual(defaultTrackSort("album"), {
    field: "number",
    direction: "asc",
  });
  assert.deepEqual(defaultTrackSort("artist"), {
    field: "number",
    direction: "asc",
  });

  let sort = nextTrackSort(null, "title");
  assert.deepEqual(sort, { field: "title", direction: "asc" });

  sort = nextTrackSort(sort, "title");
  assert.deepEqual(sort, { field: "title", direction: "desc" });

  sort = nextTrackSort(sort, "title");
  assert.equal(sort, null);

  sort = nextTrackSort(sort, "artist");
  assert.deepEqual(sort, { field: "artist", direction: "asc" });

  sort = nextTrackSort({ field: "title", direction: "desc" }, "duration");
  assert.deepEqual(sort, { field: "duration", direction: "asc" });
});

test("track-table sort icons appear only for the active direction", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );
  const activeIcons = table.match(
    /<Icon\s+v-if="activeSort\.field === '[^']+'"/g,
  );
  const directionIcons = table.match(
    /activeSort\.direction === 'asc' \? icons\.caretUp : icons\.caretDown/g,
  );

  assert.equal(activeIcons?.length, 4);
  assert.equal(directionIcons?.length, 4);
  assert.doesNotMatch(table, /icons\.sort\b|sortIcon\(/);
});

test("shared track rows always show linked artists beneath the title", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    table,
    /<p class="truncate text-xs text-muted-foreground">\s*<TrackArtistLinks :artists="trackArtistNames\(item\.data\)" \/>/,
  );
  assert.doesNotMatch(table, />\s*Artist\s*<Icon/);
  assert.equal(table.match(/<TrackArtistLinks/g)?.length, 1);
});

test("shared track lists show cover artwork beside every title", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );

  assert.match(table, /import TrackArtwork from "\.\/TrackArtwork\.vue"/);
  assert.match(
    table,
    /class="group\/track-artwork flex h-14 min-w-full/,
    "The complete track row owns the artwork hover state",
  );
  assert.match(
    table,
    /<TrackArtwork :track="item\.data"[\s\S]*class="[^"]*absolute inset-0 size-full[^"]*bg-background\/70[^"]*hover:bg-background\/70[^"]*"[\s\S]*@click="playFromList\(item\.data\.id\)"[\s\S]*class="text-foreground"[\s\S]*<\/TrackArtwork>\s*<div class="min-w-0 flex-1">[\s\S]*\{\{ item\.data\.title \}\}/,
    "The full-cover track control matches the Quick pick background and icon color",
  );
});

test("shared track tables virtualize loaded rows with a load-more fallback", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );

  assert.match(table, /useVirtualList/);
  assert.match(table, /containerProps/);
  assert.match(table, /wrapperProps/);
  assert.match(table, /v-for="item in list"/);
  assert.match(table, /@click="emit\('load-more'\)"/);
  assert.match(table, /Load more tracks/);
  assert.match(table, /role="table"/);
  assert.match(table, /:aria-rowcount="tracks\.length \+ 1"/);
  assert.match(table, /:aria-rowindex="item\.index \+ 2"/);
});

test("unavailable track titles are dimmed without muting available titles", async () => {
  const table = await readFile(
    new URL("../app/components/TrackTable.vue", import.meta.url),
    "utf8",
  );

  assert.match(
    table,
    /<span\s+:id="trackTitleAnchorId\(item\.data\.id\)"\s+class="scroll-mt-4 truncate"\s+:class="\{ 'opacity-60': !item\.data\.available \}"\s+>\{\{ item\.data\.title \}\}<\/span/,
  );
});

test("missing text values sort last in both directions", () => {
  const catalog: TrackResponse[] = [
    { ...tracks[0]!, id: "without-album", album: null },
    { ...tracks[0]!, id: "zebra", album: "Zebra" },
    { ...tracks[0]!, id: "alpha", album: "Alpha" },
  ];

  assert.deepEqual(
    sortTracks(catalog, { field: "album", direction: "asc" }).map(
      (track) => track.id,
    ),
    ["alpha", "zebra", "without-album"],
  );
  assert.deepEqual(
    sortTracks(catalog, { field: "album", direction: "desc" }).map(
      (track) => track.id,
    ),
    ["zebra", "alpha", "without-album"],
  );
});

test("duration sorts numerically with missing values last", () => {
  const catalog: TrackResponse[] = [
    { ...tracks[0]!, id: "unknown", durationMs: null },
    { ...tracks[0]!, id: "long", durationMs: 300_000 },
    { ...tracks[0]!, id: "short", durationMs: 20_000 },
  ];

  assert.deepEqual(
    sortTracks(catalog, { field: "duration", direction: "asc" }).map(
      (track) => track.id,
    ),
    ["short", "long", "unknown"],
  );
  assert.deepEqual(
    sortTracks(catalog, { field: "duration", direction: "desc" }).map(
      (track) => track.id,
    ),
    ["long", "short", "unknown"],
  );
});

test("track-number sorting follows album, disc, and track order", () => {
  const catalog: TrackResponse[] = [
    { ...tracks[0]!, id: "bonus", album: null, trackNumber: null },
    {
      ...tracks[0]!,
      id: "zebra",
      album: "Zebra",
      discNumber: 1,
      trackNumber: 1,
      coverUrl: "/api/tracks/track-a/cover?coverToken=token",
    },
    {
      ...tracks[0]!,
      id: "alpha-disc-2",
      album: "Alpha",
      discNumber: 2,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "alpha-disc-1",
      album: "Alpha",
      discNumber: 1,
      trackNumber: 3,
    },
  ];

  assert.deepEqual(
    sortTracks(catalog, { field: "number", direction: "asc" }).map(
      (track) => track.id,
    ),
    ["alpha-disc-1", "alpha-disc-2", "zebra", "bonus"],
  );
});

test("track durations support missing values, minutes, and hours", () => {
  assert.equal(formatTrackDuration(null), "—");
  assert.equal(formatTrackDuration(284_000), "4:44");
  assert.equal(formatTrackDuration(3_661_000), "1:01:01");
});

test("track cover URLs combine the connected server with the signed path", () => {
  assert.equal(
    trackCoverUrl(
      "http://127.0.0.1:17430",
      "/api/tracks/track-1/cover?coverToken=token",
    ),
    "http://127.0.0.1:17430/api/tracks/track-1/cover?coverToken=token",
  );
  assert.equal(trackCoverUrl("http://127.0.0.1:17430", null), null);
});

test("albums group by artist and title while ignoring letter case", () => {
  const catalog: TrackResponse[] = [
    {
      ...tracks[0]!,
      id: "track-a",
      title: "Intro",
      artist: "Elliot Lake",
      artists: ["Elliot Lake"],
      album: "Night Sessions",
      discNumber: 1,
      trackNumber: 1,
      coverUrl: "/api/tracks/track-a/cover?coverToken=token",
    },
    {
      ...tracks[0]!,
      id: "track-b",
      title: "Blue Hours",
      artist: "elliot lake",
      artists: ["Elliot Lake"],
      album: "night sessions",
      discNumber: 2,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "track-c",
      title: "Other Artist",
      artist: "Someone Else",
      artists: ["Someone Else"],
      album: "Night Sessions",
      trackNumber: null,
    },
    tracks[1]!,
  ];

  const albums = groupAlbums(catalog);
  assert.equal(albums.length, 2);
  assert.equal(albums[0]?.title, "Night Sessions");
  assert.equal(albums[0]?.artist, "Elliot Lake");
  assert.deepEqual(albums[0]?.trackIds, ["track-a", "track-b"]);
  assert.equal(albums[0]?.durationMs, 568_000);
  assert.equal(
    albums[0]?.coverUrl,
    "/api/tracks/track-a/cover?coverToken=token",
  );
  assert.equal(
    findAlbum(albums, " NIGHT SESSIONS ", "ELLIOT LAKE")?.key,
    albums[0]?.key,
  );
  assert.deepEqual(
    filterAlbums(albums, "someone").map((album) => album.artist),
    ["Someone Else"],
  );
});

test("albums expose only an unambiguous provider release year", () => {
  const releaseMetadata = (value: string): TrackResponse["metadata"] => ({
    providerId: "discogs-provider",
    providerKind: "discogs",
    providerName: "Discogs",
    externalTrackId: "release-track",
    externalReleaseId: "release",
    matchedAt: "2026-11-11T10:00:00.000Z",
    mode: "automatic",
    sourceUrl: "https://www.discogs.com/release/1",
    details: [{ key: "year", label: "Year", value }],
  });
  const catalog = (firstYear: string, secondYear: string | null) => [
    {
      ...tracks[0]!,
      id: "track-a",
      trackNumber: 1,
      metadata: releaseMetadata(firstYear),
    },
    {
      ...tracks[0]!,
      id: "track-b",
      trackNumber: 2,
      metadata: secondYear === null ? null : releaseMetadata(secondYear),
    },
  ];

  assert.equal(groupAlbums(catalog("1999", null))[0]?.releaseYear, 1999);
  assert.equal(groupAlbums(catalog("1999", "1999"))[0]?.releaseYear, 1999);
  assert.equal(groupAlbums(catalog("1999", "2001"))[0]?.releaseYear, null);
  assert.equal(groupAlbums(catalog("not-a-year", null))[0]?.releaseYear, null);
});

test("like identities ignore surrounding whitespace and letter case", () => {
  assert.equal(artistLikeKey("  Elliot Lake "), "elliot lake");
  assert.equal(
    albumLikeKey({ title: " Night Sessions ", artist: " ELLIOT LAKE " }),
    albumLikeKey({ title: "night sessions", artist: "elliot lake" }),
  );
  assert.notEqual(
    albumLikeKey({ title: "Night Sessions", artist: "Elliot Lake" }),
    albumLikeKey({ title: "Night Sessions", artist: "Someone Else" }),
  );
});

test("artists include albumless tracks and merge names case-insensitively", () => {
  const catalog: TrackResponse[] = [
    {
      ...tracks[0]!,
      id: "track-a",
      title: "Intro",
      artist: "Elliot Lake",
      artists: ["Elliot Lake"],
      album: "Night Sessions",
      discNumber: 1,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "track-b",
      title: "Blue Hours",
      artist: "elliot lake",
      artists: ["Elliot Lake"],
      album: "night sessions",
      discNumber: 2,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "track-c",
      title: "Other Artist",
      artist: "Someone Else",
      artists: ["Someone Else"],
      album: "Night Sessions",
      discNumber: null,
      trackNumber: null,
    },
    tracks[1]!,
  ];

  const artists = groupArtists(catalog);
  assert.equal(artists.length, 3);
  assert.deepEqual(
    artists.map((artist) => artist.name),
    ["Elliot Lake", "Someone Else", "Óra"],
  );
  assert.deepEqual(artists[0]?.trackIds, ["track-a", "track-b"]);
  assert.equal(artists[0]?.albumCount, 1);
  assert.equal(artists[0]?.durationMs, 568_000);
  assert.equal(artists[2]?.albumCount, 0);
  assert.equal(findArtist(artists, " ELLIOT LAKE ")?.key, artists[0]?.key);
  assert.deepEqual(
    filterArtists(artists, "someone").map((artist) => artist.name),
    ["Someone Else"],
  );
});

test("artist tracks sort by album and disc, with albumless tracks last", () => {
  const artistTracks: TrackResponse[] = [
    {
      ...tracks[0]!,
      id: "bonus",
      title: "Bonus",
      artist: "The Artist",
      artists: ["The Artist"],
      album: null,
      discNumber: null,
      trackNumber: null,
    },
    {
      ...tracks[0]!,
      id: "zebra",
      title: "Finale",
      artist: "The Artist",
      artists: ["The Artist"],
      album: "Zebra",
      discNumber: 2,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "alpha-2",
      title: "Second",
      artist: "The Artist",
      artists: ["The Artist"],
      album: "Alpha",
      discNumber: 1,
      trackNumber: 2,
    },
    {
      ...tracks[0]!,
      id: "alpha-1",
      title: "First",
      artist: "The Artist",
      artists: ["The Artist"],
      album: "Alpha",
      discNumber: 1,
      trackNumber: 1,
    },
  ];

  const [artist] = groupArtists(artistTracks);
  assert.deepEqual(artist?.trackIds, ["alpha-1", "alpha-2", "zebra", "bonus"]);
  assert.equal(artist?.albumCount, 2);
});

test("artist links preserve names that need URL encoding", () => {
  assert.deepEqual(artistRoute({ name: "AC/DC & Friends" }), {
    name: "artist-detail",
    params: { artist: "AC/DC & Friends" },
  });
});

test("tracks with multiple artists appear in every credited artist group", () => {
  const collaborative = {
    ...tracks[0]!,
    id: "collaboration",
    artist: "Elliot Lake, Óra",
    artists: ["Elliot Lake", "Óra"],
  };
  const artists = groupArtists([collaborative]);

  assert.deepEqual(
    artists.map((artist) => artist.name),
    ["Elliot Lake", "Óra"],
  );
  assert.deepEqual(
    artists.map((artist) => artist.trackIds),
    [["collaboration"], ["collaboration"]],
  );
  assert.deepEqual(trackArtistNames(collaborative), ["Elliot Lake", "Óra"]);
  assert.deepEqual(
    trackArtistNames({
      artist: "Elliot Lake; Óra feat. Someone Else",
      artists: [],
    }),
    ["Elliot Lake", "Óra", "Someone Else"],
  );
});

test("downloads use safe track names with a format-aware extension", () => {
  assert.equal(
    trackDownloadFileName({
      ...tracks[0]!,
      title: 'Night/Sessions: "Blue" Hours?',
      mimeType: "audio/mpeg",
    }),
    "NightSessions Blue Hours.mp3",
  );
  assert.equal(
    trackDownloadFileName({
      ...tracks[0]!,
      title: "   ",
      mimeType: "audio/flac",
    }),
    "track.flac",
  );
});

test("album tracks sort by disc, track number, then title", () => {
  const albumTracks: TrackResponse[] = [
    { ...tracks[0]!, id: "untracked", title: "Bonus", trackNumber: null },
    {
      ...tracks[0]!,
      id: "untracked-fallback",
      title: "Appendix",
      trackNumber: null,
    },
    {
      ...tracks[0]!,
      id: "disc-2",
      title: "First",
      discNumber: 2,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "track-3",
      title: "Third",
      discNumber: 1,
      trackNumber: 3,
    },
    {
      ...tracks[0]!,
      id: "track-1",
      title: "First",
      discNumber: 1,
      trackNumber: 1,
    },
    {
      ...tracks[0]!,
      id: "track-2",
      title: "Second",
      discNumber: 1,
      trackNumber: 2,
    },
  ];

  const [album] = groupAlbums(albumTracks);
  assert.deepEqual(
    album?.tracks.map((track) => track.id),
    [
      "track-1",
      "track-2",
      "track-3",
      "disc-2",
      "untracked-fallback",
      "untracked",
    ],
  );
  assert.equal(
    formatTrackNumber(albumTracks.find((track) => track.id === "disc-2")!),
    "2-01",
  );
  assert.equal(formatTrackNumber(albumTracks[0]!), "—");
});

test("album links encode title and artist without losing identity", () => {
  const [album] = groupAlbums([
    {
      ...tracks[0]!,
      title: "Opening",
      album: "Night/Sessions & More",
      artist: "Elliot Lake",
    },
  ]);
  assert.ok(album);
  assert.deepEqual(albumRoute(album), {
    name: "album-detail",
    params: { album: "Night/Sessions & More" },
    query: { artist: "Elliot Lake" },
  });
  assert.deepEqual(
    trackAlbumRoute({
      ...tracks[0]!,
      album: "  Night/Sessions & More  ",
      artist: "  Elliot Lake  ",
    }),
    {
      name: "album-detail",
      params: { album: "Night/Sessions & More" },
      query: { artist: "Elliot Lake" },
    },
  );
});

test("player track titles link to their anchored album title", () => {
  assert.equal(trackTitleAnchorId("track / one"), "track-title-track / one");
  assert.equal(
    trackIdFromTitleHash("#track-title-track%20%2F%20one"),
    "track / one",
  );
  assert.equal(trackIdFromTitleHash("#track-title-"), null);
  assert.equal(trackIdFromTitleHash("#other-anchor"), null);
  assert.deepEqual(
    trackAlbumTitleRoute({
      ...tracks[0]!,
      id: "track / one",
      album: "  Night/Sessions & More  ",
      artist: "  Elliot Lake  ",
    }),
    {
      name: "album-detail",
      params: { album: "Night/Sessions & More" },
      query: { artist: "Elliot Lake" },
      hash: "#track-title-track / one",
    },
  );
  assert.equal(trackAlbumTitleRoute(tracks[1]!), null);
});

test("player queues preserve album order and reset to the catalog", () => {
  assert.deepEqual(
    resolvePlayerQueue(tracks, ["track-2", "missing", "track-1"]).map(
      (track) => track.id,
    ),
    ["track-2", "track-1"],
  );
  assert.deepEqual(
    resolvePlayerQueue(tracks, null).map((track) => track.id),
    ["track-1", "track-2"],
  );

  const albumQueue = resolvePlayerQueue(tracks, ["track-2", "track-1"]);
  assert.equal(nextQueueTrackId(albumQueue, "track-1"), "track-2");
  assert.equal(nextQueueTrackId(albumQueue, "track-2", -1), "track-1");
  assert.equal(nextQueueTrackId([], null), null);
});
