import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type {
  ArtistListResponse,
  ArtistMetadataCandidateListResponse,
  ResetMetadataResponse,
  TaskResponse,
} from "@peridot/contracts";
import {
  createMemberSession,
  createTaggedMp3,
  createTestContext,
  startScan,
  waitForScan,
} from "./helpers.js";

const artistImageUrl = "https://i.discogs.com/artist-primary.png";
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

function providerFetch(): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "i.discogs.com") {
      return new Response(png, {
        headers: { "content-type": "image/png" },
      });
    }
    if (url.pathname.endsWith("/ws/2/release")) {
      return Response.json({ releases: [] });
    }
    if (url.pathname.endsWith("/ws/2/artist")) {
      return Response.json({
        artists: [
          {
            id: "artist-1",
            name: "Elliot Lake",
            disambiguation: "electronic musician",
            score: 100,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/ws/2/artist/artist-1")) {
      return Response.json({
        id: "artist-1",
        name: "Elliot Lake",
        disambiguation: "electronic musician",
        score: 100,
      });
    }
    return new Response("not found", { status: 404 });
  };
}

function discogsFetch(): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "i.discogs.com") {
      return new Response(png, {
        headers: { "content-type": "image/png" },
      });
    }
    if (url.pathname.endsWith("/oauth/identity")) {
      return Response.json({ username: "artist-owner" });
    }
    if (url.pathname.endsWith("/database/search")) {
      const artistId = url.searchParams.get("q") === "Canonical" ? 502 : 501;
      return Response.json({
        results:
          url.searchParams.get("type") === "artist" ? [{ id: artistId }] : [],
      });
    }
    if (url.pathname.endsWith("/artists/501")) {
      return Response.json({
        id: 501,
        name: "Elliot Lake",
        images: [{ type: "primary", uri: artistImageUrl }],
      });
    }
    if (url.pathname.endsWith("/artists/502")) {
      return Response.json({
        id: 502,
        name: "Elliot Lake Experience",
        images: [{ type: "primary", uri: artistImageUrl }],
      });
    }
    return new Response("not found", { status: 404 });
  };
}

test("artist profiles combine provider names with cached Discogs portraits", async () => {
  const context = await createTestContext({
    metadataFetch: providerFetch(),
    discogsFetch: discogsFetch(),
    metadataRequestIntervalMs: 0,
    discogsRequestIntervalMs: 0,
  });
  try {
    const provider = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: {
        kind: "discogs",
        configuration: {},
        credential: "discogs-user-token",
      },
    });
    assert.equal(provider.statusCode, 201, provider.body);

    await writeFile(
      path.join(context.libraryRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );

    const scan = await startScan(context);
    assert.equal(scan.metadataStatus, "completed");
    const metadataTask = scan.metadata as TaskResponse;
    assert.equal(
      metadataTask.details.find(
        (detail) => detail.key === "metadata.artists.matched",
      )?.value,
      "1",
    );

    const artists = await context.app.inject({
      method: "GET",
      url: "/api/artists",
      headers: context.authorization,
    });
    assert.equal(artists.statusCode, 200, artists.body);
    const artist = artists.json<ArtistListResponse>().items[0]!;
    assert.equal(artist.name, "Elliot Lake");
    assert.equal(artist.localName, "Elliot Lake");
    assert.equal(artist.metadata?.name.providerKind, "musicbrainz");
    assert.equal(artist.metadata?.portrait?.providerKind, "discogs");
    assert.ok(artist.imageUrl);

    const image = await context.app.inject({
      method: "GET",
      url: artist.imageUrl!,
    });
    assert.equal(image.statusCode, 200, image.body);
    assert.equal(image.headers["content-type"], "image/png");
    assert.deepEqual(image.rawPayload, png);

    const member = await createMemberSession(context);
    const candidates = await context.app.inject({
      method: "GET",
      url: `/api/artists/${artist.id}/metadata/candidates?query=Canonical`,
      headers: member,
    });
    assert.equal(candidates.statusCode, 200, candidates.body);
    const items = candidates.json<ArtistMetadataCandidateListResponse>().items;
    assert.equal(items.length, 2);
    const discogs = items.find(
      (candidate) => candidate.providerKind === "discogs",
    )!;
    assert.equal(discogs.portraitAvailable, true);

    const applied = await context.app.inject({
      method: "PUT",
      url: `/api/artists/${artist.id}/metadata`,
      headers: member,
      payload: {
        providerId: discogs.providerId,
        externalArtistId: discogs.externalArtistId,
        name: discogs.name,
        sourceUrl: discogs.sourceUrl,
        portraitAvailable: discogs.portraitAvailable,
      },
    });
    assert.equal(applied.statusCode, 204, applied.body);
    const manual = await context.app.inject({
      method: "GET",
      url: `/api/artists/${artist.id}`,
      headers: member,
    });
    assert.equal(manual.json().name, "Elliot Lake Experience");
    assert.equal(manual.json().localName, "Elliot Lake");
    assert.equal(manual.json().metadata.mode, "manual");
    assert.equal(manual.json().metadata.portrait.providerKind, "discogs");

    const canonicalSearch = await context.app.inject({
      method: "GET",
      url: "/api/artists?query=Experience",
      headers: member,
    });
    assert.deepEqual(
      canonicalSearch.json<ArtistListResponse>().items.map((item) => item.id),
      [artist.id],
    );

    const like = await context.app.inject({
      method: "POST",
      url: "/api/likes",
      headers: member,
      payload: { kind: "artist", name: artist.localName },
    });
    assert.equal(like.statusCode, 200, like.body);
    const liked = await context.app.inject({
      method: "GET",
      url: `/api/artists/${artist.id}`,
      headers: member,
    });
    assert.equal(liked.json().liked, true);

    const restored = await context.app.inject({
      method: "DELETE",
      url: `/api/artists/${artist.id}/metadata`,
      headers: member,
    });
    assert.equal(restored.statusCode, 204, restored.body);
    const local = await context.app.inject({
      method: "GET",
      url: `/api/artists/${artist.id}`,
      headers: member,
    });
    assert.equal(local.json().name, "Elliot Lake");
    assert.equal(local.json().metadata, null);
    assert.equal(local.json().imageUrl, null);

    const review = await context.app.inject({
      method: "GET",
      url: `/api/artists/${artist.id}`,
      headers: context.authorization,
    });
    const reset = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata/reset",
      headers: context.authorization,
    });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.deepEqual(reset.json<ResetMetadataResponse>(), {
      trackCount: 1,
      artistCount: 0,
    });
    assert.equal(review.json().name, "Elliot Lake");
  } finally {
    await context.close();
  }
});

test("force refresh deduplicates cached artist portraits", async () => {
  const context = await createTestContext({
    metadataFetch: providerFetch(),
    discogsFetch: discogsFetch(),
    metadataRequestIntervalMs: 0,
    discogsRequestIntervalMs: 0,
  });
  try {
    await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: {
        kind: "discogs",
        configuration: {},
        credential: "discogs-user-token",
      },
    });
    await writeFile(
      path.join(context.libraryRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await startScan(context);
    const firstImages = await context.database.orm.ArtistImage.all();
    assert.equal(firstImages.length, 1);

    const refreshed = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata/refresh",
      headers: context.authorization,
    });
    assert.equal(refreshed.statusCode, 202);
    const task = await waitForScan(context, refreshed.json().id);
    assert.equal(task.metadataStatus, "completed");
    assert.equal((await context.database.orm.ArtistImage.all()).length, 1);
  } finally {
    await context.close();
  }
});

test("oversized artist portraits are rejected without losing the name match", async () => {
  const standard = discogsFetch();
  const context = await createTestContext({
    metadataFetch: providerFetch(),
    discogsFetch: async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.hostname === "i.discogs.com") {
        return new Response(png, {
          headers: {
            "content-length": String(6 * 1024 * 1024),
            "content-type": "image/png",
          },
        });
      }
      return standard(input, init);
    },
    metadataRequestIntervalMs: 0,
    discogsRequestIntervalMs: 0,
  });
  try {
    await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: {
        kind: "discogs",
        configuration: {},
        credential: "discogs-user-token",
      },
    });
    await writeFile(
      path.join(context.libraryRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );

    const scan = await startScan(context);
    assert.equal(scan.metadataStatus, "completed");
    assert.ok(scan.metadataFailureMessage);
    const artist = await context.database.orm.ArtistMetadata.firstOrThrow({
      externalArtistId: "artist-1",
    });
    assert.equal(artist.displayName, "Elliot Lake");
    assert.equal(artist.imageId, null);
    assert.equal((await context.database.orm.ArtistImage.all()).length, 0);
  } finally {
    await context.close();
  }
});
