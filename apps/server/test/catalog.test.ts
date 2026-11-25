import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import type {
  AlbumListResponse,
  AlbumSummaryResponse,
  ArtistListResponse,
  AudiobookListResponse,
  PodcastListResponse,
  MediaListResponse,
} from "@peridot/contracts";
import { CatalogService } from "../src/catalog.js";
import { PlaybackTokenService } from "../src/playback-tokens.js";
import {
  createMediaFixture,
  createTaggedMp3,
  createTestContext,
  startScan,
} from "./helpers.js";

test("catalog endpoints page tracks, albums, artists, search, and likes", async () => {
  const context = await createTestContext();
  try {
    for (let index = 0; index < 12; index += 1) {
      const artist = index < 6 ? "North Artist" : "South Artist";
      const album = index % 3 === 0 ? "Shared Album" : `Album ${index}`;
      await writeFile(
        path.join(
          context.libraryRoot,
          `${String(index).padStart(2, "0")} track.mp3`,
        ),
        createTaggedMp3({
          title: `Track ${String(index).padStart(2, "0")}`,
          artist,
          album,
          discNumber: 1,
          trackNumber: index + 1,
        }),
      );
    }
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");

    const first = await context.app.inject({
      method: "GET",
      url: "/api/media?limit=5&sort=title",
      headers: context.authorization,
    });
    assert.equal(first.statusCode, 200);
    const page = first.json<MediaListResponse>();
    assert.equal(page.items.length, 5);
    assert.equal(page.totalCount, 12);
    assert.ok(page.nextCursor);
    assert.ok(page.catalogRevision > 0);

    const second = await context.app.inject({
      method: "GET",
      url: `/api/media?limit=5&sort=title&cursor=${encodeURIComponent(page.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(second.statusCode, 200);
    const secondPage = second.json<MediaListResponse>();
    assert.equal(secondPage.totalCount, 12);
    assert.equal(
      new Set([
        ...page.items.map((track) => track.id),
        ...secondPage.items.map((track) => track.id),
      ]).size,
      10,
    );

    const offsetPage = await context.app.inject({
      method: "GET",
      url: "/api/media?limit=5&sort=title&offset=10",
      headers: context.authorization,
    });
    assert.equal(offsetPage.statusCode, 200);
    const finalPage = offsetPage.json<MediaListResponse>();
    assert.equal(finalPage.items.length, 2);
    assert.equal(finalPage.totalCount, 12);
    assert.equal(
      new Set(
        [...page.items, ...secondPage.items, ...finalPage.items].map(
          (track) => track.id,
        ),
      ).size,
      12,
    );

    const invalid = await context.app.inject({
      method: "GET",
      url: "/api/media?limit=500",
      headers: context.authorization,
    });
    assert.equal(invalid.statusCode, 400);
    const invalidOffset = await context.app.inject({
      method: "GET",
      url: "/api/media?offset=-1",
      headers: context.authorization,
    });
    assert.equal(invalidOffset.statusCode, 400);

    const albums = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?limit=5&sort=title",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.equal(albums.items.length, 5);
    assert.equal(albums.totalCount, 9);
    assert.ok(albums.items.every((album) => album.trackCount > 0));
    assert.ok(
      albums.items.every(
        (album) =>
          album.sourceKinds.length === 1 && album.sourceKinds[0] === "path",
      ),
    );
    const offsetAlbums = await context.app.inject({
      method: "GET",
      url: "/api/albums?limit=3&sort=title&offset=3",
      headers: context.authorization,
    });
    assert.equal(offsetAlbums.statusCode, 200);
    const offsetAlbumPage = offsetAlbums.json<AlbumListResponse>();
    assert.equal(offsetAlbumPage.items.length, 3);
    assert.equal(offsetAlbumPage.totalCount, 9);
    assert.equal(
      new Set([
        ...albums.items.map((album) => album.id),
        ...offsetAlbumPage.items.map((album) => album.id),
      ]).size,
      6,
    );

    const sharedAlbum = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?query=shared&sort=title",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>().items[0];
    assert.equal(sharedAlbum?.title, "Shared Album");
    const jellyfinSource = await context.database.orm.LibrarySource.create({
      kind: "jellyfin",
      name: "Music server",
      position: 1,
    });
    const sharedProjection =
      await context.database.orm.CatalogMedia.firstOrThrow({
        albumId: sharedAlbum!.id,
      });
    const sourceCopy = await context.database.orm.MediaCopy.firstOrThrow({
      mediaId: sharedProjection.id,
    });
    const copyData = { ...sourceCopy } as Record<string, unknown>;
    delete copyData.id;
    delete copyData.librarySourceId;
    delete copyData.relativePath;
    delete copyData.createdAt;
    delete copyData.updatedAt;
    await context.database.orm.MediaCopy.create({
      ...copyData,
      mediaId: sharedProjection.id,
      librarySourceId: jellyfinSource.id,
      relativePath: "server/shared-album-track.mp3",
    } as never);
    const sharedDetail = await context.app.inject({
      method: "GET",
      url: `/api/albums/${sharedAlbum!.id}`,
      headers: context.authorization,
    });
    assert.equal(sharedDetail.statusCode, 200);
    assert.deepEqual(sharedDetail.json<AlbumSummaryResponse>().sourceKinds, [
      "path",
      "jellyfin",
    ]);

    const artists = (
      await context.app.inject({
        method: "GET",
        url: "/api/artists?limit=5",
        headers: context.authorization,
      })
    ).json<ArtistListResponse>();
    assert.equal(artists.items.length, 2);
    assert.equal(artists.totalCount, 2);
    assert.deepEqual(
      artists.items.map((artist) => artist.name),
      ["North Artist", "South Artist"],
    );
    const matchingArtists = (
      await context.app.inject({
        method: "GET",
        url: "/api/artists?query=south",
        headers: context.authorization,
      })
    ).json<ArtistListResponse>();
    assert.equal(matchingArtists.totalCount, 1);
    assert.deepEqual(
      matchingArtists.items.map((artist) => artist.name),
      ["South Artist"],
    );

    const search = (
      await context.app.inject({
        method: "GET",
        url: "/api/media?query=track&sort=title&limit=20",
        headers: context.authorization,
      })
    ).json<MediaListResponse>();
    assert.equal(search.items.length, 12);
    assert.equal(search.totalCount, 12);

    const likedTrack = page.items[0]!;
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "media", mediaId: likedTrack.id },
    });
    const liked = (
      await context.app.inject({
        method: "GET",
        url: "/api/media?liked=true",
        headers: context.authorization,
      })
    ).json<MediaListResponse>();
    assert.equal(liked.totalCount, 1);
    assert.deepEqual(
      liked.items.map((track) => track.id),
      [likedTrack.id],
    );
    assert.equal(liked.items[0]?.liked, true);

    const resolved = await context.app.inject({
      method: "POST",
      url: "/api/media/resolve",
      headers: context.authorization,
      payload: { ids: [page.items[2]!.id, page.items[0]!.id] },
    });
    assert.equal(resolved.statusCode, 200);
    assert.deepEqual(
      resolved
        .json<{ items: Array<{ id: string }> }>()
        .items.map((track) => track.id),
      [page.items[2]!.id, page.items[0]!.id],
    );
  } finally {
    await context.close();
  }
});

test("catalog keyset pages survive changes between page requests", async () => {
  const context = await createTestContext();
  try {
    for (let index = 0; index < 12; index += 1) {
      await writeFile(
        path.join(
          context.libraryRoot,
          `${String(index).padStart(2, "0")} track.mp3`,
        ),
        createTaggedMp3({
          title: `Track ${String(index).padStart(2, "0")}`,
          artist: index < 6 ? "First Paging Artist" : "Second Paging Artist",
          album: `Paging Album ${String(index).padStart(2, "0")}`,
          discNumber: 1,
          trackNumber: index + 1,
        }),
      );
    }
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");

    for (const sort of [
      "title",
      "artist",
      "album",
      "duration",
      "track",
      "published",
    ]) {
      const firstPage = await context.app.inject({
        method: "GET",
        url: `/api/media?limit=5&sort=${sort}`,
        headers: context.authorization,
      });
      assert.equal(firstPage.statusCode, 200);
      const firstPageBody = firstPage.json<MediaListResponse>();
      assert.ok(firstPageBody.nextCursor);
      const secondPage = await context.app.inject({
        method: "GET",
        url: `/api/media?limit=5&sort=${sort}&cursor=${encodeURIComponent(firstPageBody.nextCursor!)}`,
        headers: context.authorization,
      });
      assert.equal(secondPage.statusCode, 200);
      const secondPageBody = secondPage.json<MediaListResponse>();
      assert.equal(
        new Set([
          ...firstPageBody.items.map((track) => track.id),
          ...secondPageBody.items.map((track) => track.id),
        ]).size,
        firstPageBody.items.length + secondPageBody.items.length,
      );
    }

    const tracks = (
      await context.app.inject({
        method: "GET",
        url: "/api/media?limit=5&sort=title",
        headers: context.authorization,
      })
    ).json<MediaListResponse>();
    assert.ok(tracks.nextCursor);
    const trackRow = await context.database.orm.CatalogMedia.firstOrThrow({
      id: tracks.items[0]!.id,
    });
    await context.database.orm.CatalogMedia.create({
      ...trackRow,
      id: "track-inserted-before-page",
      title: "Track 000",
      normalizedTitle: "track 000",
    });
    await context.database.orm.CatalogState.where({ id: "catalog" }).update({
      revision: tracks.catalogRevision + 1,
    });

    const changedTracks = await context.app.inject({
      method: "GET",
      url: `/api/media?limit=5&sort=title&cursor=${encodeURIComponent(tracks.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(changedTracks.statusCode, 200);
    const nextTracks = changedTracks.json<MediaListResponse>();
    assert.equal(
      new Set([
        ...tracks.items.map((track) => track.id),
        ...nextTracks.items.map((track) => track.id),
      ]).size,
      tracks.items.length + nextTracks.items.length,
    );

    const albums = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?limit=5&sort=title",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.ok(albums.nextCursor);
    const albumRow = await context.database.orm.CatalogAlbum.firstOrThrow({
      id: albums.items[0]!.id,
    });
    await context.database.orm.CatalogAlbum.create({
      ...albumRow,
      id: "album-inserted-before-page",
      title: "Album 000",
      normalizedTitle: "album 000",
    });
    await context.database.orm.CatalogState.where({ id: "catalog" }).update({
      revision: albums.catalogRevision + 1,
    });

    const changedAlbums = await context.app.inject({
      method: "GET",
      url: `/api/albums?limit=5&sort=title&cursor=${encodeURIComponent(albums.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(changedAlbums.statusCode, 200);
    const nextAlbums = changedAlbums.json<AlbumListResponse>();
    assert.equal(
      new Set([
        ...albums.items.map((album) => album.id),
        ...nextAlbums.items.map((album) => album.id),
      ]).size,
      albums.items.length + nextAlbums.items.length,
    );

    const artists = (
      await context.app.inject({
        method: "GET",
        url: "/api/artists?limit=1",
        headers: context.authorization,
      })
    ).json<ArtistListResponse>();
    assert.ok(artists.nextCursor);
    const artistRow = await context.database.orm.CatalogArtist.firstOrThrow({
      id: artists.items[0]!.id,
    });
    await context.database.orm.CatalogArtist.create({
      ...artistRow,
      id: "artist-inserted-before-page",
      name: "AAA Paging Artist",
      displayName: "AAA Paging Artist",
      normalizedName: "aaa paging artist",
      normalizedDisplayName: "aaa paging artist",
    });
    await context.database.orm.CatalogState.where({ id: "catalog" }).update({
      revision: artists.catalogRevision + 1,
    });

    const changedArtists = await context.app.inject({
      method: "GET",
      url: `/api/artists?limit=1&cursor=${encodeURIComponent(artists.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(changedArtists.statusCode, 200);
    const nextArtists = changedArtists.json<ArtistListResponse>();
    assert.equal(
      new Set([
        ...artists.items.map((artist) => artist.id),
        ...nextArtists.items.map((artist) => artist.id),
      ]).size,
      artists.items.length + nextArtists.items.length,
    );
  } finally {
    await context.close();
  }
});

test("scoped catalog search filters each media collection before paging", async () => {
  const context = await createTestContext();
  try {
    const files = [
      {
        filename: "calm.mp3",
        title: "Calm Harbor",
        artist: "Mira North",
        album: "Calm Waters",
      },
      {
        filename: "journey.mp3",
        title: "Journey North",
        artist: "Ada Reader",
        album: "Journey North",
        releaseTypes: ["Audiobook"],
      },
      {
        filename: "studio.mp3",
        title: "Studio Notes",
        artist: "Pat Host",
        album: "Studio Notes",
        podcast: true,
      },
    ];
    for (const file of files) {
      const { filename, ...tags } = file;
      await writeFile(
        path.join(context.libraryRoot, filename),
        createTaggedMp3({
          ...tags,
          discNumber: 1,
          trackNumber: 1,
        }),
      );
    }
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");

    const albums = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?query=calm",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.equal(albums.totalCount, 1);
    assert.equal(albums.items[0]?.title, "Calm Waters");

    const albumsByArtist = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?query=mira%20north",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.equal(albumsByArtist.totalCount, 1);
    assert.equal(albumsByArtist.items[0]?.id, albums.items[0]?.id);

    const artists = (
      await context.app.inject({
        method: "GET",
        url: "/api/artists?query=north",
        headers: context.authorization,
      })
    ).json<ArtistListResponse>();
    assert.equal(artists.totalCount, 1);
    assert.equal(artists.items[0]?.name, "Mira North");

    const audiobooks = (
      await context.app.inject({
        method: "GET",
        url: "/api/audiobooks?query=ada",
        headers: context.authorization,
      })
    ).json<AudiobookListResponse>();
    assert.equal(audiobooks.totalCount, 1);
    assert.equal(audiobooks.items[0]?.title, "Journey North");

    const podcasts = (
      await context.app.inject({
        method: "GET",
        url: "/api/podcasts?query=pat",
        headers: context.authorization,
      })
    ).json<PodcastListResponse>();
    assert.equal(podcasts.totalCount, 1);
    assert.equal(podcasts.items[0]?.title, "Studio Notes");

    const music = (
      await context.app.inject({
        method: "GET",
        url: "/api/media?query=harbor",
        headers: context.authorization,
      })
    ).json<MediaListResponse>();
    assert.equal(music.totalCount, 1);
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "media", mediaId: music.items[0]!.id },
    });
    const liked = (
      await context.app.inject({
        method: "GET",
        url: "/api/media?liked=true&query=harbor",
        headers: context.authorization,
      })
    ).json<MediaListResponse>();
    assert.equal(liked.totalCount, 1);
    assert.equal(liked.items[0]?.id, music.items[0]?.id);
  } finally {
    await context.close();
  }
});

test("catalog projection backfill yields to event-loop work", async () => {
  const context = await createTestContext();
  const catalog = new CatalogService(
    context.database,
    new PlaybackTokenService(),
  );
  try {
    await writeFile(
      path.join(context.libraryRoot, "backfill.mp3"),
      createTaggedMp3({
        title: "Backfill Track",
        artist: "Backfill Artist",
        album: "Backfill Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");
    await context.database.orm.CatalogState.where({ id: "catalog" }).update({
      projectionVersion: 1,
    });

    let eventLoopYielded = false;
    setImmediate(() => {
      eventLoopYielded = true;
    });
    await catalog.startBackfill();

    assert.equal(eventLoopYielded, true);
    const state = await context.database.orm.CatalogState.first({
      id: "catalog",
    });
    assert.ok((state?.projectionVersion ?? 0) > 1);
  } finally {
    await catalog.close();
    await context.close();
  }
});

test("release identity groups varied track credits while preserving guest artists", async () => {
  const context = await createTestContext();
  const catalog = new CatalogService(
    context.database,
    new PlaybackTokenService(),
  );
  try {
    await catalog.initialize();
    const tracks = await Promise.all([
      createMediaFixture(context, {
        media: {
          title: "Opening",
          artist: "Daft Punk",
          album: "Random Access Memories",
          metadataArtist: "Daft Punk, Nile Rodgers",
          metadataArtistCredits: JSON.stringify(["Daft Punk", "Nile Rodgers"]),
          metadataAlbumArtist: "Daft Punk",
          metadataAlbumArtistCredits: JSON.stringify(["Daft Punk"]),
          metadataProviderId: "provider-1",
          metadataProviderKind: "musicbrainz",
          metadataExternalTrackId: "track-1",
          metadataExternalReleaseId: "release-1",
          metadataMatchedAt: new Date(),
          trackNumber: 1,
        },
        copy: { relativePath: "Random Access Memories/01 Opening.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          title: "Guests",
          artist: "Daft Punk",
          album: "Random Access Memories",
          metadataArtist: "Daft Punk, Pharrell Williams, Nile Rodgers",
          metadataArtistCredits: JSON.stringify([
            "Daft Punk",
            "Pharrell Williams",
            "Nile Rodgers",
          ]),
          metadataAlbumArtist: "Daft Punk",
          metadataAlbumArtistCredits: JSON.stringify(["Daft Punk"]),
          metadataProviderId: "provider-1",
          metadataProviderKind: "musicbrainz",
          metadataExternalTrackId: "track-2",
          metadataExternalReleaseId: "release-1",
          metadataMatchedAt: new Date(),
          trackNumber: 2,
        },
        copy: { relativePath: "Random Access Memories/02 Guests.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          title: "Unmatched",
          artist: "Daft Punk, Panda Bear",
          artistCredits: JSON.stringify(["Daft Punk", "Panda Bear"]),
          album: "Random Access Memories",
          trackNumber: 3,
        },
        copy: { relativePath: "Random Access Memories/03 Unmatched.mp3" },
      }).then(({ media }) => media),
    ]);

    for (const track of tracks) {
      await catalog.reindexMedia(track.id, "metadata");
    }

    const response = await catalog.listAlbums({
      userId: (await context.database.orm.User.firstOrThrow()).id,
    });
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.title, "Random Access Memories");
    assert.equal(response.items[0]?.artist, "Daft Punk");
    assert.deepEqual(response.items[0]?.artists, ["Daft Punk"]);
    assert.equal(response.items[0]?.trackCount, 3);

    const guest = await context.database.orm.CatalogArtist.firstOrThrow({
      name: "Nile Rodgers",
    });
    const guestAlbums = await catalog.listAlbums({
      userId: (await context.database.orm.User.firstOrThrow()).id,
      artistId: guest.id,
    });
    assert.deepEqual(
      guestAlbums.items.map((album) => album.id),
      [response.items[0]!.id],
    );

    const albumTracks = await catalog.listMedia({
      userId: (await context.database.orm.User.firstOrThrow()).id,
      albumId: response.items[0]!.id,
      sort: "track",
      limit: 20,
    });
    assert.deepEqual(
      albumTracks.items.map((track) => track.artists),
      [
        ["Daft Punk", "Nile Rodgers"],
        ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
        ["Daft Punk", "Panda Bear"],
      ],
    );
    assert.ok(
      albumTracks.items.every(
        (track) => track.albumId === response.items[0]!.id,
      ),
    );
  } finally {
    await catalog.close();
    await context.close();
  }
});

test("album artists group a release across folders without collapsing ambiguous releases", async () => {
  const context = await createTestContext();
  const catalog = new CatalogService(
    context.database,
    new PlaybackTokenService(),
  );
  const base = {
    album: "Shared Album",
  };
  try {
    await catalog.initialize();
    const tracks = await Promise.all([
      createMediaFixture(context, {
        media: {
          ...base,
          title: "First",
          artist: "Album Artist, Guest One",
          artistCredits: JSON.stringify(["Album Artist", "Guest One"]),
          albumArtist: "Album Artist",
          albumArtistCredits: JSON.stringify(["Album Artist"]),
          trackNumber: 1,
        },
        copy: { relativePath: "Edition A/01 First.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          ...base,
          title: "Second",
          artist: "Album Artist, Guest Two",
          artistCredits: JSON.stringify(["Album Artist", "Guest Two"]),
          albumArtist: "Album Artist",
          albumArtistCredits: JSON.stringify(["Album Artist"]),
          trackNumber: 1,
        },
        copy: { relativePath: "Edition B/01 Second.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          ...base,
          title: "Release One",
          artist: "Album Artist",
          metadataProviderId: "provider-1",
          metadataProviderKind: "musicbrainz",
          metadataExternalTrackId: "release-one-track",
          metadataExternalReleaseId: "release-one",
          metadataMatchedAt: new Date(),
          trackNumber: 1,
        },
        copy: { relativePath: "Ambiguous/01 One.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          ...base,
          title: "Release Two",
          artist: "Album Artist",
          metadataProviderId: "provider-1",
          metadataProviderKind: "musicbrainz",
          metadataExternalTrackId: "release-two-track",
          metadataExternalReleaseId: "release-two",
          metadataMatchedAt: new Date(),
          trackNumber: 2,
        },
        copy: { relativePath: "Ambiguous/02 Two.mp3" },
      }).then(({ media }) => media),
      createMediaFixture(context, {
        media: {
          ...base,
          title: "Ambiguous Unmatched",
          artist: "Album Artist, Guest Three",
          artistCredits: JSON.stringify(["Album Artist", "Guest Three"]),
          trackNumber: 3,
        },
        copy: { relativePath: "Ambiguous/03 Three.mp3" },
      }).then(({ media }) => media),
    ]);

    for (const track of tracks) {
      await catalog.reindexMedia(track.id, "metadata");
    }

    const albums = (
      await catalog.listAlbums({
        userId: (await context.database.orm.User.firstOrThrow()).id,
      })
    ).items;
    const projections = await context.database.orm.CatalogMedia.all();
    assert.equal(
      albums.length,
      4,
      JSON.stringify({
        albums: albums.map((album) => [
          album.id,
          album.artist,
          album.trackCount,
        ]),
        projections: projections.map((media) => [
          media.title,
          media.albumId,
          media.albumReleaseKey,
        ]),
      }),
    );
    assert.deepEqual(
      albums
        .map((album) => [album.artist, album.trackCount])
        .sort(
          (left, right) =>
            String(left[0]).localeCompare(String(right[0])) ||
            Number(right[1]) - Number(left[1]),
        ),
      [
        ["Album Artist", 2],
        ["Album Artist", 1],
        ["Album Artist", 1],
        ["Album Artist, Guest Three", 1],
      ],
    );
  } finally {
    await catalog.close();
    await context.close();
  }
});

test("committed scan batches materialize and reconcile albums and artists", async () => {
  const context = await createTestContext();
  const catalog = new CatalogService(
    context.database,
    new PlaybackTokenService(),
  );
  try {
    await catalog.initialize();
    const first = await createMediaFixture(context, {
      media: {
        title: "First Track",
        artist: "Artist One, Guest Artist",
        artistCredits: JSON.stringify(["Artist One", "Guest Artist"]),
        albumArtist: "Artist One",
        albumArtistCredits: JSON.stringify(["Artist One"]),
        album: "Incremental Album",
        trackNumber: 1,
      },
    });
    const second = await createMediaFixture(context, {
      media: {
        title: "Second Track",
        artist: "Artist One, Guest Artist",
        artistCredits: JSON.stringify(["Artist One", "Guest Artist"]),
        albumArtist: "Artist One",
        albumArtistCredits: JSON.stringify(["Artist One"]),
        album: "Incremental Album",
        trackNumber: 2,
      },
    });
    const user = await context.database.orm.User.firstOrThrow();

    await catalog.indexScanBatch([first.media.id], first.copy.librarySourceId);
    let album = await context.database.orm.CatalogAlbum.firstOrThrow({
      title: "Incremental Album",
    });
    assert.equal(album.trackCount, 1);
    assert.equal(album.availableTrackCount, 1);
    let artist = await context.database.orm.CatalogArtist.firstOrThrow({
      name: "Artist One",
    });
    assert.equal(artist.trackCount, 1);
    assert.equal(artist.albumCount, 1);
    assert.equal(
      (
        await context.database.orm.Media.firstOrThrow({
          id: first.media.id,
        })
      ).catalogProjectionPending,
      0,
    );

    await catalog.indexScanBatch(
      [second.media.id],
      second.copy.librarySourceId,
    );
    album = await context.database.orm.CatalogAlbum.firstOrThrow({
      id: album.id,
    });
    assert.equal(album.trackCount, 2);
    assert.equal(album.availableTrackCount, 2);
    artist = await context.database.orm.CatalogArtist.firstOrThrow({
      id: artist.id,
    });
    assert.equal(artist.trackCount, 2);

    await context.database.orm.Media.where({ id: first.media.id }).update({
      title: "Moved Track",
      artist: "Artist Two",
      artistCredits: JSON.stringify(["Artist Two"]),
      albumArtist: "Artist Two",
      albumArtistCredits: JSON.stringify(["Artist Two"]),
      album: "Moved Album",
    });
    await catalog.indexScanBatch([first.media.id], first.copy.librarySourceId);

    const oldAlbum = await context.database.orm.CatalogAlbum.firstOrThrow({
      title: "Incremental Album",
    });
    assert.equal(oldAlbum.trackCount, 1);
    const movedAlbum = await context.database.orm.CatalogAlbum.firstOrThrow({
      title: "Moved Album",
    });
    assert.equal(movedAlbum.trackCount, 1);
    const oldArtist = await context.database.orm.CatalogArtist.firstOrThrow({
      name: "Artist One",
    });
    assert.equal(oldArtist.trackCount, 1);
    assert.equal(oldArtist.albumCount, 1);
    const movedArtist = await context.database.orm.CatalogArtist.firstOrThrow({
      name: "Artist Two",
    });
    assert.equal(movedArtist.trackCount, 1);
    assert.equal(movedArtist.albumCount, 1);

    const albums = await catalog.listAlbums({
      userId: user.id,
      query: "moved",
    });
    assert.deepEqual(
      albums.items.map((item) => item.title),
      ["Moved Album"],
    );
    const artists = await catalog.listArtists({
      userId: user.id,
      query: "artist two",
    });
    assert.deepEqual(
      artists.items.map((item) => item.name),
      ["Artist Two"],
    );
  } finally {
    await catalog.close();
    await context.close();
  }
});
