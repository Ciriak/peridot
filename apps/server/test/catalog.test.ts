import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import type {
  AlbumListResponse,
  ArtistListResponse,
  AudiobookListResponse,
  PodcastListResponse,
  TrackListResponse,
} from "@peridot/contracts";
import { CatalogService } from "../src/catalog.js";
import { PlaybackTokenService } from "../src/playback-tokens.js";
import { createTaggedMp3, createTestContext, startScan } from "./helpers.js";

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
      url: "/api/tracks?limit=5&sort=title",
      headers: context.authorization,
    });
    assert.equal(first.statusCode, 200);
    const page = first.json<TrackListResponse>();
    assert.equal(page.items.length, 5);
    assert.equal(page.totalCount, 12);
    assert.ok(page.nextCursor);
    assert.ok(page.catalogRevision > 0);

    const second = await context.app.inject({
      method: "GET",
      url: `/api/tracks?limit=5&sort=title&cursor=${encodeURIComponent(page.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(second.statusCode, 200);
    const secondPage = second.json<TrackListResponse>();
    assert.equal(secondPage.totalCount, 12);
    assert.equal(
      new Set([
        ...page.items.map((track) => track.id),
        ...secondPage.items.map((track) => track.id),
      ]).size,
      10,
    );

    const invalid = await context.app.inject({
      method: "GET",
      url: "/api/tracks?limit=500",
      headers: context.authorization,
    });
    assert.equal(invalid.statusCode, 400);

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
        url: "/api/tracks?query=track&sort=title&limit=20",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
    assert.equal(search.items.length, 12);
    assert.equal(search.totalCount, 12);

    const likedTrack = page.items[0]!;
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "track", trackId: likedTrack.id },
    });
    const liked = (
      await context.app.inject({
        method: "GET",
        url: "/api/tracks?liked=true",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
    assert.equal(liked.totalCount, 1);
    assert.deepEqual(
      liked.items.map((track) => track.id),
      [likedTrack.id],
    );
    assert.equal(liked.items[0]?.liked, true);

    const resolved = await context.app.inject({
      method: "POST",
      url: "/api/tracks/resolve",
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
        url: `/api/tracks?limit=5&sort=${sort}`,
        headers: context.authorization,
      });
      assert.equal(firstPage.statusCode, 200);
      const firstPageBody = firstPage.json<TrackListResponse>();
      assert.ok(firstPageBody.nextCursor);
      const secondPage = await context.app.inject({
        method: "GET",
        url: `/api/tracks?limit=5&sort=${sort}&cursor=${encodeURIComponent(firstPageBody.nextCursor!)}`,
        headers: context.authorization,
      });
      assert.equal(secondPage.statusCode, 200);
      const secondPageBody = secondPage.json<TrackListResponse>();
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
        url: "/api/tracks?limit=5&sort=title",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
    assert.ok(tracks.nextCursor);
    const trackRow = await context.database.orm.CatalogTrack.firstOrThrow({
      id: tracks.items[0]!.id,
    });
    await context.database.orm.CatalogTrack.create({
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
      url: `/api/tracks?limit=5&sort=title&cursor=${encodeURIComponent(tracks.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(changedTracks.statusCode, 200);
    const nextTracks = changedTracks.json<TrackListResponse>();
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
        url: "/api/tracks?query=harbor",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
    assert.equal(music.totalCount, 1);
    await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: context.authorization,
      payload: { kind: "track", trackId: music.items[0]!.id },
    });
    const liked = (
      await context.app.inject({
        method: "GET",
        url: "/api/tracks?liked=true&query=harbor",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
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
      context.database.orm.Track.create({
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
        relativePath: "Random Access Memories/01 Opening.mp3",
        mimeType: "audio/mpeg",
        fileSizeBytes: 1n,
        fileModifiedAt: new Date(0),
        trackNumber: 1,
      }),
      context.database.orm.Track.create({
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
        relativePath: "Random Access Memories/02 Guests.mp3",
        mimeType: "audio/mpeg",
        fileSizeBytes: 1n,
        fileModifiedAt: new Date(0),
        trackNumber: 2,
      }),
      context.database.orm.Track.create({
        title: "Unmatched",
        artist: "Daft Punk, Panda Bear",
        artistCredits: JSON.stringify(["Daft Punk", "Panda Bear"]),
        album: "Random Access Memories",
        relativePath: "Random Access Memories/03 Unmatched.mp3",
        mimeType: "audio/mpeg",
        fileSizeBytes: 1n,
        fileModifiedAt: new Date(0),
        trackNumber: 3,
      }),
    ]);

    for (const track of tracks) {
      await catalog.reindexTrack(track.id, "metadata");
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

    const albumTracks = await catalog.listTracks({
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
    mimeType: "audio/mpeg",
    fileSizeBytes: 1n,
    fileModifiedAt: new Date(0),
  };
  try {
    await catalog.initialize();
    const tracks = await Promise.all([
      context.database.orm.Track.create({
        ...base,
        title: "First",
        artist: "Album Artist, Guest One",
        artistCredits: JSON.stringify(["Album Artist", "Guest One"]),
        albumArtist: "Album Artist",
        albumArtistCredits: JSON.stringify(["Album Artist"]),
        relativePath: "Edition A/01 First.mp3",
        trackNumber: 1,
      }),
      context.database.orm.Track.create({
        ...base,
        title: "Second",
        artist: "Album Artist, Guest Two",
        artistCredits: JSON.stringify(["Album Artist", "Guest Two"]),
        albumArtist: "Album Artist",
        albumArtistCredits: JSON.stringify(["Album Artist"]),
        relativePath: "Edition B/01 Second.mp3",
        trackNumber: 1,
      }),
      context.database.orm.Track.create({
        ...base,
        title: "Release One",
        artist: "Album Artist",
        metadataProviderId: "provider-1",
        metadataProviderKind: "musicbrainz",
        metadataExternalTrackId: "release-one-track",
        metadataExternalReleaseId: "release-one",
        metadataMatchedAt: new Date(),
        relativePath: "Ambiguous/01 One.mp3",
        trackNumber: 1,
      }),
      context.database.orm.Track.create({
        ...base,
        title: "Release Two",
        artist: "Album Artist",
        metadataProviderId: "provider-1",
        metadataProviderKind: "musicbrainz",
        metadataExternalTrackId: "release-two-track",
        metadataExternalReleaseId: "release-two",
        metadataMatchedAt: new Date(),
        relativePath: "Ambiguous/02 Two.mp3",
        trackNumber: 2,
      }),
      context.database.orm.Track.create({
        ...base,
        title: "Ambiguous Unmatched",
        artist: "Album Artist, Guest Three",
        artistCredits: JSON.stringify(["Album Artist", "Guest Three"]),
        relativePath: "Ambiguous/03 Three.mp3",
        trackNumber: 3,
      }),
    ]);

    for (const track of tracks) {
      await catalog.reindexTrack(track.id, "metadata");
    }

    const albums = (
      await catalog.listAlbums({
        userId: (await context.database.orm.User.firstOrThrow()).id,
      })
    ).items;
    assert.equal(albums.length, 4);
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
