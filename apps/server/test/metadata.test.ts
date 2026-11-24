import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
  type TaskResponse,
} from "@peridot/contracts";
import { buildApp } from "../src/app.js";
import {
  createMemberSession,
  createTaggedMp3,
  createTestContext,
  startScan,
  waitForTask,
  waitForScan,
} from "./helpers.js";

const providerBody = {
  kind: "musicbrainz",
  name: "MusicBrainz",
  configuration: { contact: "owner@example.com" },
};

function musicBrainzResponses(): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://musicbrainz.org");
    assert.deepEqual(
      new Headers(init?.headers).get("User-Agent"),
      "Peridot/0.1.0 (admin@example.com)",
    );
    if (url.pathname.endsWith("/ws/2/release")) {
      return Response.json({
        releases: [
          {
            id: "release-1",
            title: "Night Sessions",
            score: 100,
            "artist-credit": [
              { name: "Elliot Lake", artist: { name: "Elliot Lake" } },
            ],
          },
        ],
      });
    }
    if (url.pathname.endsWith("/ws/2/release/release-1")) {
      return Response.json({
        id: "release-1",
        title: "Night Sessions",
        genres: [{ name: "Electronic" }],
        tags: [{ name: "Night" }],
        media: [
          {
            position: 1,
            tracks: [
              {
                position: 1,
                recording: {
                  id: "recording-1",
                  title: "Blue Hours",
                  length: 125000,
                  "artist-credit": [
                    {
                      name: "Elliot Lake",
                      artist: { name: "Elliot Lake" },
                    },
                  ],
                },
              },
              {
                position: 2,
                recording: {
                  id: "recording-2",
                  title: "Last Train",
                  length: 125000,
                  "artist-credit": [
                    {
                      name: "Elliot Lake",
                      artist: { name: "Elliot Lake" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
    }
    if (url.pathname.endsWith("/ws/2/recording")) {
      return Response.json({
        recordings: [
          {
            id: "recording-manual",
            title: "Blue Hours",
            score: 100,
            length: 125000,
            genres: [{ name: "Electronic" }],
            "artist-credit": [
              { name: "Elliot Lake", artist: { name: "Elliot Lake" } },
            ],
            releases: [{ id: "release-1", title: "Night Sessions" }],
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  };
}

test("administrators can manage ordered metadata providers", async () => {
  const context = await createTestContext();
  try {
    const initial = await context.app.inject({
      method: "GET",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
    });
    assert.equal(initial.statusCode, 200);
    assert.deepEqual(initial.json(), {
      items: [
        {
          id: initial.json().items[0].id,
          kind: "musicbrainz",
          name: "MusicBrainz",
          accountLabel: null,
          configuration: { contact: "admin@example.com" },
          hasCredential: false,
          enabled: true,
        },
      ],
    });
    assert.doesNotMatch(initial.body, /apiKey|api-key/i);
    const providerId = initial.json().items[0].id;

    const definitions = await context.app.inject({
      method: "GET",
      url: "/api/admin/metadata-providers/definitions",
      headers: context.authorization,
    });
    assert.equal(definitions.statusCode, 200);
    assert.deepEqual(
      definitions
        .json<{ items: Array<{ kind: string }> }>()
        .items.map((item) => item.kind),
      ["musicbrainz", "discogs"],
    );

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: providerBody,
    });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(duplicate.json().error.code, "invalid_metadata_provider");

    const keyed = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: { ...providerBody, credential: "not-needed" },
    });
    assert.equal(keyed.statusCode, 400);

    const reordered = await context.app.inject({
      method: "PUT",
      url: "/api/admin/metadata-providers/order",
      headers: context.authorization,
      payload: { ids: [providerId] },
    });
    assert.equal(reordered.statusCode, 200);
    assert.deepEqual(reordered.json(), initial.json());

    const disabled = await context.app.inject({
      method: "PUT",
      url: `/api/admin/metadata-providers/${providerId}`,
      headers: context.authorization,
      payload: { enabled: false },
    });
    assert.equal(disabled.statusCode, 200);
    assert.deepEqual(disabled.json(), {
      id: providerId,
      kind: "musicbrainz",
      name: "MusicBrainz",
      accountLabel: null,
      configuration: { contact: "admin@example.com" },
      hasCredential: false,
      enabled: false,
    });
    const stillListed = await context.app.inject({
      method: "GET",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
    });
    assert.deepEqual(stillListed.json(), { items: [disabled.json()] });
    const unsupportedDelete = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/metadata-providers/${providerId}`,
      headers: context.authorization,
    });
    assert.equal(unsupportedDelete.statusCode, 404);
    const refresh = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata/refresh",
      headers: context.authorization,
    });
    assert.equal(refresh.statusCode, 202);
    const skipped = await waitForScan(context, refresh.json().id);
    assert.equal(skipped.metadataStatus, "failed");
    assert.deepEqual(skipped.metadataFailureMessage, {
      key: "api.message.metadataProvidersDisabled",
    });

    const enabled = await context.app.inject({
      method: "PUT",
      url: `/api/admin/metadata-providers/${providerId}`,
      headers: context.authorization,
      payload: { enabled: true },
    });
    assert.equal(enabled.statusCode, 200);
    assert.deepEqual(enabled.json(), initial.json().items[0]);

    const invalidToggle = await context.app.inject({
      method: "PUT",
      url: `/api/admin/metadata-providers/${providerId}`,
      headers: context.authorization,
      payload: { enabled: "no" },
    });
    assert.equal(invalidToggle.statusCode, 400);
    assert.equal(invalidToggle.json().error.code, "invalid_metadata_provider");

    const member = await createMemberSession(context);
    const forbidden = await context.app.inject({
      method: "GET",
      url: "/api/admin/metadata-providers",
      headers: member,
    });
    assert.equal(forbidden.statusCode, 403);
    const anonymous = await context.app.inject({
      method: "GET",
      url: "/api/admin/metadata-providers",
    });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/metadata/refresh",
          headers: member,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/metadata/refresh",
        })
      ).statusCode,
      401,
    );
  } finally {
    await context.close();
  }
});

test("Discogs token storage creates a local encryption key automatically", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: {
        kind: "discogs",
        configuration: {},
        credential: "discogs-token",
      },
    });
    assert.equal(response.statusCode, 201);
    const storedKey = (
      await readFile(context.credentialKeyFile, "utf8")
    ).trim();
    assert.equal(Buffer.from(storedKey, "base64").length, 32);
  } finally {
    await context.close();
  }
});

test("invalid MusicBrainz contacts are rejected", async () => {
  const context = await createTestContext();
  try {
    for (const contact of ["", "owner", "ftp://example.com/contact"]) {
      const response = await context.app.inject({
        method: "POST",
        url: "/api/admin/metadata-providers",
        headers: context.authorization,
        payload: {
          ...providerBody,
          configuration: { contact },
        },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "invalid_metadata_provider");
    }
  } finally {
    await context.close();
  }
});

test("startup backfills MusicBrainz without re-enabling a disabled provider", async () => {
  const context = await createTestContext();
  try {
    const provider = await context.database.orm.MetadataProvider.firstOrThrow({
      kind: "musicbrainz",
    });
    await context.database.orm.MetadataProvider.where({
      id: provider.id,
    }).update({ enabled: 0 });

    let restarted = await buildApp({
      config: {
        databaseUrl: context.databaseUrl,
        libraryRoot: context.libraryRoot,
        webOrigins: ["http://127.0.0.1:17430"],
      },
      database: context.database,
      logger: false,
    });
    await restarted.close();
    assert.equal(
      (
        await context.database.orm.MetadataProvider.firstOrThrow({
          id: provider.id,
        })
      ).enabled,
      0,
    );

    await context.database.orm.MetadataProvider.where({
      id: provider.id,
    }).delete();
    restarted = await buildApp({
      config: {
        databaseUrl: context.databaseUrl,
        libraryRoot: context.libraryRoot,
        webOrigins: ["http://127.0.0.1:17430"],
      },
      database: context.database,
      logger: false,
    });
    await restarted.close();
    const backfilled = await context.database.orm.MetadataProvider.firstOrThrow(
      {
        kind: "musicbrainz",
      },
    );
    assert.deepEqual(JSON.parse(backfilled.configuration), {
      contact: "admin@example.com",
    });
    assert.equal(backfilled.enabled, 1);
  } finally {
    await context.close();
  }
});

test("metadata provider mutations allow the configured web origin", async () => {
  const context = await createTestContext();
  try {
    for (const method of ["PUT", "DELETE"]) {
      const response = await context.app.inject({
        method: "OPTIONS",
        url: "/api/admin/metadata-providers/order",
        headers: {
          origin: "http://127.0.0.1:17430",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
      assert.equal(response.statusCode, 204);
      assert.equal(
        response.headers["access-control-allow-origin"],
        "http://127.0.0.1:17430",
      );
    }
  } finally {
    await context.close();
  }
});

test("metadata tasks identify the provider while its request is in flight", async () => {
  let providerRequestStarted!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    providerRequestStarted = resolve;
  });
  let releaseProviderRequest!: () => void;
  const providerResponse = new Promise<void>((resolve) => {
    releaseProviderRequest = resolve;
  });
  const metadataResponses = musicBrainzResponses();
  const context = await createTestContext({
    metadataFetch: async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/ws/2/release")) {
        providerRequestStarted();
        await providerResponse;
      }
      return metadataResponses(input, init);
    },
    metadataRequestIntervalMs: 0,
  });
  const albumRoot = path.join(context.libraryRoot, "Night Sessions");
  try {
    await mkdir(albumRoot);
    await writeFile(
      path.join(albumRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const scan = await context.app.inject({
      method: "POST",
      url: "/api/library/scans",
      headers: context.authorization,
    });
    assert.equal(scan.statusCode, 202);

    await Promise.race([
      requestStarted,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Metadata provider request did not start")),
          30_000,
        ).unref();
      }),
    ]);

    const metadata = await context.database.orm.Task.firstOrThrow({
      kind: "metadata_enrichment",
    });
    const provider = await context.database.orm.MetadataProvider.firstOrThrow({
      kind: "musicbrainz",
    });
    const active = await context.app.inject({
      method: "GET",
      url: `/api/tasks/${metadata.id}`,
      headers: context.authorization,
    });
    const activeTask = active.json<TaskResponse>();
    assert.equal(activeTask.status, "running");
    assert.equal(
      activeTask.details.find(
        (detail) => detail.key === TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
      )?.value,
      provider.id,
    );

    releaseProviderRequest();
    const completed = await waitForTask(context, metadata.id);
    assert.equal(completed.status, "completed");
    assert.equal(
      completed.details.some(
        (detail) => detail.key === TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY,
      ),
      false,
    );
  } finally {
    releaseProviderRequest();
    await context.close();
  }
});

test("scans automatically enrich album tracks with MusicBrainz provenance", async () => {
  const context = await createTestContext({
    metadataFetch: musicBrainzResponses(),
    metadataRequestIntervalMs: 0,
  });
  const albumRoot = path.join(context.libraryRoot, "Night Sessions");
  try {
    await mkdir(albumRoot);
    await writeFile(
      path.join(albumRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(albumRoot, "02 - Last Train.mp3"),
      createTaggedMp3({
        title: "Last Train",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 2,
      }),
    );
    const scan = await startScan(context);
    assert.equal(scan.status, "completed");
    assert.equal(scan.metadataStatus, "completed");
    assert.equal(scan.metadataTotalCount, 2);
    assert.equal(scan.metadataMatchedCount, 2);
    assert.equal(scan.metadataUnmatchedCount, 0);
    const projectedTracks = await context.database.orm.CatalogMedia.all();
    assert.equal(projectedTracks.length, 2);
    assert.ok(
      projectedTracks.every(
        (track) =>
          track.albumArtist === "Elliot Lake" &&
          track.albumId === projectedTracks[0]?.albumId,
      ),
    );

    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    assert.equal(tracks.statusCode, 200, tracks.body);
    const items = tracks.json<{
      items: Array<{
        title: string;
        album: string | null;
        albumId: string | null;
        genres: string[];
        metadata: Record<string, unknown> | null;
      }>;
    }>().items;
    assert.equal(items.length, 2);
    for (const track of items) {
      assert.equal(track.album, "Night Sessions");
      assert.equal(track.albumId, projectedTracks[0]?.albumId);
      assert.equal(track.metadata?.providerKind, "musicbrainz");
      assert.equal(track.metadata?.mode, "automatic");
      assert.match(String(track.metadata?.sourceUrl), /recording/);
      assert.deepEqual(track.genres, ["Electronic", "Night"]);
      assert.deepEqual(track.metadata?.genres, ["Electronic", "Night"]);
    }
  } finally {
    await context.close();
  }
});

test("Discogs credentials fall back after MusicBrainz and manual results merge providers", async () => {
  const discogsToken = "discogs-private-token";
  let expectedToken = discogsToken;
  const context = await createTestContext({
    metadataRequestIntervalMs: 0,
    discogsRequestIntervalMs: 0,
    metadataFetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/ws/2/release")) {
        return Response.json({ releases: [] });
      }
      if (url.pathname.endsWith("/ws/2/recording")) {
        return Response.json({
          recordings: [
            {
              id: "mb-recording",
              title: "Blue Hours",
              score: 100,
              length: 125000,
              "artist-credit": [
                { name: "Elliot Lake", artist: { name: "Elliot Lake" } },
              ],
              releases: [{ id: "mb-release", title: "Night Sessions" }],
            },
          ],
        });
      }
      return Response.json({});
    },
    discogsFetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.discogs.com");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Discogs token=${expectedToken}`,
      );
      if (url.pathname.endsWith("/oauth/identity")) {
        return Response.json({ username: "peridot-owner" });
      }
      if (url.pathname.endsWith("/database/search")) {
        return Response.json({ results: [{ id: 301 }] });
      }
      if (url.pathname.endsWith("/releases/301")) {
        return Response.json({
          id: 301,
          title: "Night Sessions",
          year: 1999,
          country: "UK",
          genres: ["Electronic"],
          styles: ["Downtempo"],
          labels: [{ name: "Night Records", catno: "NIGHT-301" }],
          formats: [{ name: "Vinyl", descriptions: ["LP", "Album"] }],
          artists: [{ name: "Elliot Lake" }],
          tracklist: [{ position: "A1", type_: "track", title: "Blue Hours" }],
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata-providers",
      headers: context.authorization,
      payload: {
        kind: "discogs",
        configuration: {},
        credential: discogsToken,
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().accountLabel, "peridot-owner");
    assert.equal(created.json().hasCredential, true);
    assert.doesNotMatch(created.body, /discogs-private-token/);
    const stored = await context.database.orm.MetadataProvider.firstOrThrow({
      kind: "discogs",
    });
    assert.ok(stored.credentialCiphertext);
    assert.doesNotMatch(stored.credentialCiphertext!, /discogs-private-token/);

    const rotatedToken = "discogs-rotated-token";
    expectedToken = rotatedToken;
    const rotated = await context.app.inject({
      method: "PUT",
      url: `/api/admin/metadata-providers/${created.json().id}`,
      headers: context.authorization,
      payload: { credential: rotatedToken },
    });
    assert.equal(rotated.statusCode, 200);
    assert.doesNotMatch(rotated.body, /discogs-rotated-token/);

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
    assert.equal(scan.metadataMatchedCount, 1);

    const catalog = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    const track = catalog.json<{
      items: Array<{
        id: string;
        metadata: {
          providerKind: string;
          externalTrackId: string;
          genres: string[];
          details: Array<{ key: string; value: string }>;
          sourceUrl: string;
        } | null;
      }>;
    }>().items[0]!;
    assert.equal(track.metadata?.providerKind, "discogs");
    assert.equal(track.metadata?.externalTrackId, "301:0");
    assert.equal(
      track.metadata?.details.find((detail) => detail.key === "year")?.value,
      "1999",
    );
    assert.match(track.metadata?.sourceUrl ?? "", /discogs\.com\/release\/301/);
    assert.deepEqual(track.metadata?.genres, ["Electronic", "Downtempo"]);

    const candidates = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}/metadata/candidates`,
      headers: context.authorization,
    });
    assert.equal(candidates.statusCode, 200);
    const merged = candidates.json<{
      items: Array<{
        providerId: string;
        providerKind: string;
        externalTrackId: string;
        externalReleaseId: string | null;
        title: string;
        artist: string;
        artists: string[];
        albumArtists: string[];
        album: string | null;
        genres: string[];
        discNumber: number | null;
        trackNumber: number | null;
        sourceUrl: string;
        details: Array<{
          key: string;
          value: string;
          labelMessage: { key: string };
        }>;
      }>;
    }>().items;
    assert.deepEqual(
      merged.map((item) => item.providerKind),
      ["musicbrainz", "discogs"],
    );
    const discogsCandidate = merged.find(
      (item) => item.providerKind === "discogs",
    )!;
    const applied = await context.app.inject({
      method: "PUT",
      url: `/api/media/${track.id}/metadata`,
      headers: context.authorization,
      payload: {
        providerId: discogsCandidate.providerId,
        externalTrackId: discogsCandidate.externalTrackId,
        externalReleaseId: discogsCandidate.externalReleaseId,
        title: discogsCandidate.title,
        artist: discogsCandidate.artist,
        artists: discogsCandidate.artists,
        albumArtists: discogsCandidate.albumArtists,
        album: discogsCandidate.album,
        genres: discogsCandidate.genres,
        discNumber: discogsCandidate.discNumber,
        trackNumber: discogsCandidate.trackNumber,
        sourceUrl: discogsCandidate.sourceUrl,
        details: discogsCandidate.details,
      },
    });
    assert.equal(applied.statusCode, 204);
    assert.deepEqual(discogsCandidate.albumArtists, ["Elliot Lake"]);
    assert.deepEqual(discogsCandidate.genres, ["Electronic", "Downtempo"]);
    assert.equal(
      (
        await context.database.orm.CatalogMedia.firstOrThrow({
          id: track.id,
        })
      ).albumArtist,
      "Elliot Lake",
    );
    const manual = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}`,
      headers: context.authorization,
    });
    assert.equal(manual.json().metadata.mode, "manual");
    assert.equal(
      manual
        .json()
        .metadata.details.find(
          (detail: { key: string }) => detail.key === "catalogNumber",
        ).value,
      "NIGHT-301",
    );
    assert.deepEqual(manual.json().genres, ["Electronic", "Downtempo"]);
  } finally {
    await context.close();
  }
});

test("treats a containing folder as an album when its tracks have no album tags", async () => {
  const searchQueries: string[] = [];
  const context = await createTestContext({
    metadataRequestIntervalMs: 0,
    metadataFetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/ws/2/release")) {
        searchQueries.push(url.searchParams.get("query") ?? "");
        return Response.json({
          releases: [
            {
              id: "folder-release",
              title: "Night Sessions",
              score: 100,
              "artist-credit": [
                { name: "Elliot Lake", artist: { name: "Elliot Lake" } },
              ],
            },
          ],
        });
      }
      if (url.pathname.endsWith("/ws/2/release/folder-release")) {
        return Response.json({
          id: "folder-release",
          title: "Night Sessions",
          media: [
            {
              position: 1,
              tracks: [
                {
                  position: 1,
                  recording: {
                    id: "folder-recording-1",
                    title: "Blue Hours",
                    length: 125000,
                    "artist-credit": [
                      {
                        name: "Elliot Lake",
                        artist: { name: "Elliot Lake" },
                      },
                    ],
                  },
                },
                {
                  position: 2,
                  recording: {
                    id: "folder-recording-2",
                    title: "Last Train",
                    length: 125000,
                    "artist-credit": [
                      {
                        name: "Elliot Lake",
                        artist: { name: "Elliot Lake" },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
      }
      throw new Error(`Unexpected MusicBrainz request: ${url}`);
    },
  });
  const albumRoot = path.join(context.libraryRoot, "Night Sessions");
  try {
    await mkdir(albumRoot);
    await writeFile(
      path.join(albumRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(albumRoot, "02 - Last Train.mp3"),
      createTaggedMp3({
        title: "Last Train",
        artist: "Elliot Lake",
        album: "",
        discNumber: 1,
        trackNumber: 2,
      }),
    );
    const scan = await startScan(context);
    assert.equal(scan.metadataStatus, "completed");
    assert.equal(scan.metadataTotalCount, 2);
    assert.equal(scan.metadataMatchedCount, 2);
    assert.deepEqual(searchQueries, [
      'release:"Night Sessions" AND artist:"Elliot Lake"',
    ]);
  } finally {
    await context.close();
  }
});

test("unchanged successful matches are not queried again", async () => {
  let requests = 0;
  const responses = musicBrainzResponses();
  const context = await createTestContext({
    metadataRequestIntervalMs: 0,
    metadataFetch: async (input, init) => {
      requests += 1;
      return responses(input, init);
    },
  });
  try {
    await writeFile(
      path.join(context.libraryRoot, "song.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Night Sessions",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await startScan(context);
    assert.ok(requests > 0);
    const requestsAfterFirstScan = requests;

    const second = await startScan(context);
    assert.equal(second.metadataTotalCount, 0);
    assert.equal(requests, requestsAfterFirstScan);

    const refreshed = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata/refresh",
      headers: context.authorization,
    });
    assert.equal(refreshed.statusCode, 202);
    assert.equal(refreshed.json<{ status: string }>().status, "queued");
    const refreshScan = await waitForScan(context, refreshed.json().id);
    assert.equal(refreshScan.metadataStatus, "completed");
    assert.equal(refreshScan.metadataMatchedCount, 1);
    assert.ok(requests > requestsAfterFirstScan);
  } finally {
    await context.close();
  }
});

test("members can replace and revert a manual metadata match", async () => {
  const context = await createTestContext({
    metadataFetch: musicBrainzResponses(),
    metadataRequestIntervalMs: 0,
  });
  try {
    const trackPath = path.join(context.libraryRoot, "song.mp3");
    await writeFile(
      trackPath,
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Local Album",
        genres: ["Local Rock"],
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const provider = await context.database.orm.MetadataProvider.firstOrThrow({
      kind: "musicbrainz",
    });
    const member = await createMemberSession(context);
    await startScan(context);
    const tracks = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: member,
    });
    assert.equal(tracks.statusCode, 200, tracks.body);
    const track = tracks.json<{ items: Array<{ id: string }> }>().items[0];
    assert.ok(track, tracks.body);

    const candidates = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}/metadata/candidates`,
      headers: member,
    });
    assert.equal(candidates.statusCode, 200);
    const candidate = candidates.json<{
      items: Array<Record<string, unknown>>;
    }>().items[0]!;
    const applied = await context.app.inject({
      method: "PUT",
      url: `/api/media/${track.id}/metadata`,
      headers: member,
      payload: {
        providerId: provider.id,
        externalTrackId: candidate.externalTrackId,
        externalReleaseId: candidate.externalReleaseId,
        title: candidate.title,
        artist: candidate.artist,
        artists: candidate.artists,
        albumArtists: candidate.albumArtists,
        album: candidate.album,
        genres: candidate.genres,
        discNumber: candidate.discNumber,
        trackNumber: candidate.trackNumber,
        sourceUrl: candidate.sourceUrl,
        details: candidate.details,
      },
    });
    assert.equal(applied.statusCode, 204);
    const matched = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}`,
      headers: member,
    });
    assert.equal(matched.json().metadata.mode, "manual");
    assert.equal(matched.json().title, "Blue Hours");
    assert.deepEqual(matched.json().genres, ["Electronic"]);

    const reverted = await context.app.inject({
      method: "DELETE",
      url: `/api/media/${track.id}/metadata`,
      headers: member,
    });
    assert.equal(reverted.statusCode, 204);
    const local = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}`,
      headers: member,
    });
    assert.equal(local.json().album, "Local Album");
    assert.deepEqual(local.json().genres, ["Local Rock"]);
    assert.equal(local.json().metadata, null);

    await startScan(context);
    const afterScan = await context.app.inject({
      method: "GET",
      url: `/api/media/${track.id}`,
      headers: member,
    });
    assert.equal(afterScan.json().album, "Local Album");
    assert.deepEqual(afterScan.json().genres, ["Local Rock"]);
    assert.equal(afterScan.json().metadata, null);
  } finally {
    await context.close();
  }
});

test("administrators can reset all track metadata to file tags", async () => {
  const context = await createTestContext({
    metadataFetch: musicBrainzResponses(),
    metadataRequestIntervalMs: 0,
  });
  const albumRoot = path.join(context.libraryRoot, "Night Sessions");
  try {
    await mkdir(albumRoot);
    await writeFile(
      path.join(albumRoot, "01 - Blue Hours.mp3"),
      createTaggedMp3({
        title: "Blue Hours",
        artist: "Elliot Lake",
        album: "Local Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(albumRoot, "02 - Last Train.mp3"),
      createTaggedMp3({
        title: "Last Train",
        artist: "Elliot Lake",
        album: "Local Album",
        discNumber: 1,
        trackNumber: 2,
      }),
    );
    await startScan(context);
    const tracks = await context.database.orm.Media.orderBy((track) =>
      track.title.asc(),
    ).all();
    assert.equal(tracks.length, 2);
    await context.database.orm.Media.where({ id: tracks[0]!.id }).update({
      metadataMode: "manual",
      metadataAlbum: "Wrong Album",
    });

    const member = await createMemberSession(context);
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/metadata/reset",
          headers: member,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/admin/metadata/reset",
        })
      ).statusCode,
      401,
    );

    const reset = await context.app.inject({
      method: "POST",
      url: "/api/admin/metadata/reset",
      headers: context.authorization,
    });
    assert.equal(reset.statusCode, 200);
    assert.deepEqual(reset.json(), { mediaCount: 2, artistCount: 0 });

    const resetTracks = await context.database.orm.Media.orderBy((track) =>
      track.title.asc(),
    ).all();
    for (const track of resetTracks) {
      assert.equal(track.metadataMode, "file");
      assert.equal(track.metadataTitle, null);
      assert.equal(track.metadataArtist, null);
      assert.equal(track.metadataArtistCredits, null);
      assert.equal(track.metadataAlbum, null);
      assert.equal(track.metadataGenres, null);
      assert.equal(track.metadataDiscNumber, null);
      assert.equal(track.metadataTrackNumber, null);
      assert.equal(track.metadataProviderId, null);
      assert.equal(track.metadataProviderKind, null);
      assert.equal(track.metadataProviderName, null);
      assert.equal(track.metadataExternalTrackId, null);
      assert.equal(track.metadataExternalReleaseId, null);
      assert.equal(track.metadataSourceUrl, null);
      assert.equal(track.metadataDetails, null);
      assert.equal(track.metadataMatchedAt, null);
      assert.equal(track.metadataAttemptedSignature, null);
    }

    const catalog = await context.app.inject({
      method: "GET",
      url: "/api/media",
      headers: context.authorization,
    });
    for (const track of catalog.json<{
      items: Array<{ album: string | null; metadata: unknown }>;
    }>().items) {
      assert.equal(track.album, "Local Album");
      assert.equal(track.metadata, null);
    }
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/admin/metadata-providers",
          headers: context.authorization,
        })
      ).json().items.length,
      1,
    );
  } finally {
    await context.close();
  }
});
