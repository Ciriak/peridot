import assert from "node:assert/strict";
import test from "node:test";
import type { QuickPickListResponse } from "@peridot/contracts";
import { buildApp } from "../src/app.js";
import {
  decayedPlayScore,
  rankQuickPicks,
  type PlayedTrackEvent,
  type PlayedTrackInfo,
} from "../src/quick-picks.js";
import {
  createMemberSession,
  createTestContext,
  type TestContext,
} from "./helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function track(
  overrides: Partial<PlayedTrackInfo> & Pick<PlayedTrackInfo, "id">,
): PlayedTrackInfo {
  return {
    artist: "Artist",
    album: "Album",
    albumArtist: null,
    albumId: `album-${overrides.id}`,
    metadataArtist: null,
    metadataAlbum: null,
    available: 1,
    ...overrides,
  };
}

function event(playedAt: Date, trackValue: PlayedTrackInfo): PlayedTrackEvent {
  return { playedAt, track: trackValue };
}

async function createTrack(
  context: TestContext,
  overrides: {
    title: string;
    artist?: string;
    album?: string | null;
    metadataArtist?: string | null;
    metadataAlbum?: string | null;
    available?: number;
  },
) {
  return context.database.orm.Track.create({
    title: overrides.title,
    artist: overrides.artist ?? "Play Artist",
    album: overrides.album ?? "Play Album",
    metadataArtist: overrides.metadataArtist ?? null,
    metadataAlbum: overrides.metadataAlbum ?? null,
    available: overrides.available ?? 1,
    relativePath: `${overrides.title.toLowerCase().replaceAll(" ", "-")}.mp3`,
    mimeType: "audio/mpeg",
    durationMs: 60_000,
    fileSizeBytes: 1n,
    fileModifiedAt: new Date(0),
    trackNumber: 1,
  });
}

async function readQuickPicks(
  context: TestContext,
  authorization = context.authorization,
): Promise<QuickPickListResponse> {
  const response = await context.app.inject({
    method: "GET",
    url: "/api/quick-picks",
    headers: authorization,
  });
  assert.equal(response.statusCode, 200);
  return response.json<QuickPickListResponse>();
}

test("decayed play scores halve every seven days", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  assert.equal(decayedPlayScore(new Date(now.getTime() + DAY_MS), now), 1);
  assert.equal(decayedPlayScore(now, now), 1);
  assert.equal(
    decayedPlayScore(new Date(now.getTime() - 7 * DAY_MS), now),
    0.5,
  );
  assert.equal(
    decayedPlayScore(new Date(now.getTime() - 14 * DAY_MS), now),
    0.25,
  );
});

test("ranking combines track and album scores with stable ties", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const first = track({
    id: "first",
    album: "Shared",
    albumId: "album-shared",
  });
  const second = track({
    id: "second",
    album: "Shared",
    albumId: "album-shared",
  });
  const third = track({ id: "third", album: "Other" });
  const ranked = rankQuickPicks(
    [
      event(now, first),
      event(new Date(now.getTime() - 7 * DAY_MS), first),
      event(new Date(now.getTime() - DAY_MS), third),
      event(new Date(now.getTime() - 3 * DAY_MS), second),
    ],
    now,
  );

  assert.deepEqual(
    ranked.map((item) => item.key),
    [
      "album:album-shared",
      "track:first",
      "album:album-third",
      "track:third",
      "track:second",
    ],
  );

  const tied = rankQuickPicks(
    [
      event(now, track({ id: "b", album: null })),
      event(now, track({ id: "a", album: null })),
    ],
    now,
  );
  assert.deepEqual(
    tied.map((item) => item.key),
    ["track:a", "track:b"],
  );
});

test("album rankings use metadata identity and omit unavailable tracks", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const ranked = rankQuickPicks(
    [
      event(
        now,
        track({
          id: "matched-a",
          artist: "File Artist",
          album: "File Album",
          metadataArtist: "Matched Artist",
          metadataAlbum: "Matched Album",
          albumArtist: "Matched Artist",
          albumId: "album-matched",
        }),
      ),
      event(
        now,
        track({
          id: "matched-b",
          artist: "File Artist",
          album: "File Album",
          metadataArtist: "Matched Artist",
          metadataAlbum: "Matched Album",
          albumArtist: "Matched Artist",
          albumId: "album-matched",
        }),
      ),
      event(now, track({ id: "unavailable", available: 0 })),
    ],
    now,
  );

  assert.deepEqual(ranked[0], {
    kind: "album",
    key: "album:album-matched",
    albumId: "album-matched",
    title: "Matched Album",
    artist: "Matched Artist",
  });
  assert.equal(
    ranked.some(
      (item) => item.kind === "track" && item.trackId === "unavailable",
    ),
    false,
  );
});

test("play starts are authenticated, private, and persist across a restart", async () => {
  const context = await createTestContext();
  let restartedApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const available = await createTrack(context, { title: "Available" });
    const unavailable = await createTrack(context, {
      title: "Unavailable",
      available: 0,
    });

    assert.deepEqual(await readQuickPicks(context), { items: [] });
    const anonymous = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${available.id}/plays`,
    });
    assert.equal(anonymous.statusCode, 401);
    const missing = await context.app.inject({
      method: "POST",
      url: "/api/tracks/missing/plays",
      headers: context.authorization,
    });
    assert.equal(missing.statusCode, 404);
    const hidden = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${unavailable.id}/plays`,
      headers: context.authorization,
    });
    assert.equal(hidden.statusCode, 404);

    const recorded = await context.app.inject({
      method: "POST",
      url: `/api/tracks/${available.id}/plays`,
      headers: context.authorization,
    });
    assert.equal(recorded.statusCode, 201);
    assert.equal(recorded.json().trackId, available.id);
    await context.app.inject({
      method: "POST",
      url: `/api/tracks/${available.id}/plays`,
      headers: context.authorization,
    });
    const playCount = await context.database.orm.TrackPlayEvent.where({
      trackId: available.id,
    }).aggregate((aggregate) => ({ count: aggregate.count() }));
    assert.equal(playCount.count, 2);

    const member = await createMemberSession(context);
    assert.deepEqual(await readQuickPicks(context, member), { items: [] });

    await context.app.close();
    restartedApp = await buildApp({
      config: {
        databaseUrl: context.databaseUrl,
        libraryRoot: context.libraryRoot,
        webOrigins: ["http://127.0.0.1:17430"],
      },
      database: context.database,
      logger: false,
    });
    const response = await restartedApp.inject({
      method: "GET",
      url: "/api/quick-picks",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    const items = response.json<QuickPickListResponse>().items;
    assert.equal(items[0]?.kind, "album");
    assert.equal(
      items[0]?.kind === "album" && items[0].album.title,
      "Play Album",
    );
    assert.equal(
      items[0]?.kind === "album" && items[0].album.artist,
      "Play Artist",
    );
    assert.equal(items.length, 2);
  } finally {
    await restartedApp?.close();
    await context.close();
  }
});

test("quick picks return at most eight mixed items", async () => {
  const context = await createTestContext();
  try {
    const userId = (await context.database.orm.User.firstOrThrow()).id;
    await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const trackValue = await createTrack(context, {
          title: `Track ${index + 1}`,
          album: `Album ${index + 1}`,
        });
        await context.database.orm.TrackPlayEvent.create({
          userId,
          trackId: trackValue.id,
          playedAt: new Date(Date.now() - index * DAY_MS),
        });
      }),
    );

    const response = await readQuickPicks(context);
    assert.equal(response.items.length, 8);
    assert.deepEqual(
      response.items.map((item) => item.kind),
      ["album", "track", "album", "track", "album", "track", "album", "track"],
    );
  } finally {
    await context.close();
  }
});
