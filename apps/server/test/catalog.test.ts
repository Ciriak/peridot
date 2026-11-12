import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import type {
  AlbumListResponse,
  ArtistListResponse,
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
    assert.ok(page.nextCursor);
    assert.ok(page.catalogRevision > 0);

    const second = await context.app.inject({
      method: "GET",
      url: `/api/tracks?limit=5&sort=title&cursor=${encodeURIComponent(page.nextCursor!)}`,
      headers: context.authorization,
    });
    assert.equal(second.statusCode, 200);
    const secondPage = second.json<TrackListResponse>();
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
    assert.ok(albums.items.every((album) => album.trackCount > 0));

    const artists = (
      await context.app.inject({
        method: "GET",
        url: "/api/artists?limit=5",
        headers: context.authorization,
      })
    ).json<ArtistListResponse>();
    assert.equal(artists.items.length, 2);
    assert.deepEqual(
      artists.items.map((artist) => artist.name),
      ["North Artist", "South Artist"],
    );

    const search = (
      await context.app.inject({
        method: "GET",
        url: "/api/tracks?query=track&sort=title&limit=20",
        headers: context.authorization,
      })
    ).json<TrackListResponse>();
    assert.equal(search.items.length, 12);

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
