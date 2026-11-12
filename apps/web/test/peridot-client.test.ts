import assert from "node:assert/strict";
import test from "node:test";
import {
  applyArtistMetadata,
  createAdministrator,
  createLike,
  createMetadataProvider,
  createManagedUser,
  createPlaybackToken,
  createRealtimeTicket,
  createSource,
  createUserSession,
  deleteSource,
  deleteLike,
  deleteManagedUser,
  discoverLocalServers,
  fetchAuthStatus,
  fetchQueue,
  fetchLogs,
  fetchQuickPicks,
  fetchServerSettings,
  getTask,
  applyTrackMetadata,
  isAuthenticationRedirectError,
  PeridotApiError,
  listDirectories,
  listArtistMetadataCandidates,
  listLikes,
  listMetadataCandidates,
  listMetadataProviderDefinitions,
  listMetadataProviders,
  listSources,
  listUsers,
  listTasks,
  listTracks,
  reorderSources,
  reorderMetadataProviders,
  replaceQueue,
  refreshMetadata,
  recordTrackPlay,
  resetMetadata,
  rescanSource,
  revertTrackMetadata,
  revertArtistMetadata,
  revokeSession,
  searchDirectories,
  setAuthenticationRedirectHandler,
  updateMetadataProvider,
  updateManagedUser,
  updateUserProfile,
  startLibraryScan,
  trackAudioUrl,
} from "../app/lib/peridot-client.ts";

function queuedTask(
  id: string,
  kind: "library_scan" | "metadata_fetch",
  source: { id: string; name: string } | null,
) {
  return {
    id,
    kind,
    status: "queued",
    titleMessage: source
      ? { key: "task.title.sourceScan", params: { source: source.name } }
      : { key: "task.title.metadataMatch" },
    parentTaskId: null,
    source,
    progress: { state: "indeterminate", completed: null, total: null },
    details: [],
    failureMessage: null,
    createdAt: "2026-11-11T10:00:00.000Z",
    startedAt: null,
    completedAt: null,
    updatedAt: "2026-11-11T10:00:00.000Z",
  };
}

test("realtime tickets use authenticated POST requests", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return Response.json({
      ticket: "single-use-ticket",
      expiresAt: "2026-11-11T10:00:30.000Z",
    });
  };

  const result = await createRealtimeTicket(
    "http://127.0.0.1:17430",
    "session-token",
  );
  assert.equal(result.ticket, "single-use-ticket");
  assert.equal(request?.method, "POST");
  assert.equal(
    new Headers(request?.headers).get("Authorization"),
    "Bearer session-token",
  );
});

test("metadata provider, source scan, and correction calls use authenticated endpoints", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const url = String(input);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "PUT" && url.endsWith("/metadata")) {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/scans")) {
      return Response.json(
        queuedTask("scan-1", "library_scan", {
          id: "source-1",
          name: "Albums",
        }),
        { status: 202 },
      );
    }
    if (url.endsWith("/api/admin/metadata/refresh")) {
      return Response.json(
        queuedTask("scan-metadata", "metadata_fetch", null),
        { status: 202 },
      );
    }
    if (url.endsWith("/api/admin/metadata/reset")) {
      return Response.json({ trackCount: 3, artistCount: 2 });
    }
    if (url.includes("/metadata/candidates")) {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/metadata-providers/definitions")) {
      return Response.json({ items: [] });
    }
    if (init?.method === "POST" && url.endsWith("/metadata-providers")) {
      return Response.json(
        {
          id: "provider-1",
          kind: "musicbrainz",
          name: "MusicBrainz",
          accountLabel: null,
          configuration: { contact: "owner@example.com" },
          hasCredential: false,
          enabled: true,
        },
        { status: 201 },
      );
    }
    if (init?.method === "PUT" && url.endsWith("/metadata-providers/order")) {
      return Response.json({ items: [] });
    }
    if (
      init?.method === "PUT" &&
      url.endsWith("/metadata-providers/provider-1")
    ) {
      return Response.json({
        id: "provider-1",
        kind: "musicbrainz",
        name: "MusicBrainz",
        accountLabel: null,
        configuration: { contact: "owner@example.com" },
        hasCredential: false,
        enabled: false,
      });
    }
    return Response.json({ items: [] });
  };

  assert.deepEqual(await listMetadataProviders("http://127.0.0.1:17430", "s"), {
    items: [],
  });
  assert.deepEqual(
    await listMetadataProviderDefinitions("http://127.0.0.1:17430", "s"),
    { items: [] },
  );
  assert.equal(
    (
      await createMetadataProvider("http://127.0.0.1:17430", "s", {
        kind: "musicbrainz",
        name: "MusicBrainz",
        configuration: { contact: "owner@example.com" },
      })
    ).id,
    "provider-1",
  );
  await reorderMetadataProviders("http://127.0.0.1:17430", "s", ["provider-1"]);
  assert.equal(
    (
      await updateMetadataProvider(
        "http://127.0.0.1:17430",
        "s",
        "provider-1",
        { enabled: false },
      )
    ).enabled,
    false,
  );
  assert.equal(
    (await refreshMetadata("http://127.0.0.1:17430", "s")).status,
    "queued",
  );
  assert.deepEqual(await resetMetadata("http://127.0.0.1:17430", "s"), {
    trackCount: 3,
    artistCount: 2,
  });
  const sourceScan = await rescanSource(
    "http://127.0.0.1:17430",
    "s",
    "source-1",
  );
  assert.equal(sourceScan.source?.name, "Albums");
  assert.deepEqual(
    await listMetadataCandidates(
      "http://127.0.0.1:17430",
      "s",
      "track/one",
      "blue hours",
    ),
    { items: [] },
  );
  await applyTrackMetadata("http://127.0.0.1:17430", "s", "track/one", {
    providerId: "provider-1",
    externalTrackId: "recording-1",
    externalReleaseId: "release-1",
    title: "Blue Hours",
    artist: "Elliot Lake",
    artists: ["Elliot Lake"],
    album: "Night Sessions",
    discNumber: 1,
    trackNumber: 2,
    sourceUrl: "https://musicbrainz.org/recording/recording-1",
    details: [],
  });
  await revertTrackMetadata("http://127.0.0.1:17430", "s", "track/one");
  assert.deepEqual(
    await listArtistMetadataCandidates(
      "http://127.0.0.1:17430",
      "s",
      "artist/one",
      "canonical name",
    ),
    { items: [] },
  );
  await applyArtistMetadata("http://127.0.0.1:17430", "s", "artist/one", {
    providerId: "provider-1",
    externalArtistId: "artist-1",
    name: "Canonical Name",
    sourceUrl: "https://musicbrainz.org/artist/artist-1",
    portraitAvailable: false,
  });
  await revertArtistMetadata("http://127.0.0.1:17430", "s", "artist/one");

  assert.deepEqual(
    requests.map(({ input, init }) => ({
      input,
      method: init?.method,
    })),
    [
      {
        input: "http://127.0.0.1:17430/api/admin/metadata-providers",
        method: undefined,
      },
      {
        input:
          "http://127.0.0.1:17430/api/admin/metadata-providers/definitions",
        method: undefined,
      },
      {
        input: "http://127.0.0.1:17430/api/admin/metadata-providers",
        method: "POST",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/metadata-providers/order",
        method: "PUT",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/metadata-providers/provider-1",
        method: "PUT",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/metadata/refresh",
        method: "POST",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/metadata/reset",
        method: "POST",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/sources/source-1/scans",
        method: "POST",
      },
      {
        input:
          "http://127.0.0.1:17430/api/tracks/track%2Fone/metadata/candidates?query=blue+hours",
        method: undefined,
      },
      {
        input: "http://127.0.0.1:17430/api/tracks/track%2Fone/metadata",
        method: "PUT",
      },
      {
        input: "http://127.0.0.1:17430/api/tracks/track%2Fone/metadata",
        method: "DELETE",
      },
      {
        input:
          "http://127.0.0.1:17430/api/artists/artist%2Fone/metadata/candidates?query=canonical+name",
        method: undefined,
      },
      {
        input: "http://127.0.0.1:17430/api/artists/artist%2Fone/metadata",
        method: "PUT",
      },
      {
        input: "http://127.0.0.1:17430/api/artists/artist%2Fone/metadata",
        method: "DELETE",
      },
    ],
  );
  for (const request of requests) {
    assert.equal(
      new Headers(request.init?.headers).get("Authorization"),
      "Bearer s",
    );
  }
});

test("task list polling sends status and bounded pagination", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let requestedUrl = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer task-session",
    );
    return Response.json({
      items: [queuedTask("task-1", "library_scan", null)],
      activeCount: 1,
      queuedCount: 1,
    });
  };

  const result = await listTasks("http://127.0.0.1:17430", "task-session", {
    status: "active",
    limit: 25,
    offset: 5,
  });
  assert.equal(result.items[0]?.id, "task-1");
  assert.equal(
    requestedUrl,
    "http://127.0.0.1:17430/api/tasks?status=active&limit=25&offset=5",
  );
});

test("queue reads and writes are authenticated ordered snapshots", async (context) => {
  const queue = {
    trackIds: ["track-2", "track-1"],
    activeTrackId: "track-2",
    shuffleEnabled: true,
    shuffleTrackIds: ["track-1"],
  };
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return Response.json(queue);
  };

  assert.deepEqual(
    await fetchQueue("http://127.0.0.1:17430", "session-token"),
    queue,
  );
  assert.deepEqual(
    await replaceQueue("http://127.0.0.1:17430", "session-token", queue),
    queue,
  );

  assert.equal(requests[0]?.input, "http://127.0.0.1:17430/api/queue");
  assert.equal(requests[1]?.input, "http://127.0.0.1:17430/api/queue");
  assert.equal(requests[1]?.init?.method, "PUT");
  assert.equal(
    new Headers(requests[1]?.init?.headers).get("Authorization"),
    "Bearer session-token",
  );
  assert.equal(
    new Headers(requests[1]?.init?.headers).get("Content-Type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), queue);
});

test("library track listing sends the session to the catalog endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://127.0.0.1:17430/api/tracks");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer session-token");
    return Response.json({
      items: [
        {
          id: "track-1",
          title: "Blue Hours",
          artist: "Elliot Lake",
          artists: ["Elliot Lake"],
          album: "Night Sessions",
          discNumber: 1,
          trackNumber: 2,
          durationMs: 284000,
          mimeType: "audio/mpeg",
          available: true,
        },
      ],
    });
  };

  const result = await listTracks("http://127.0.0.1:17430", "session-token");
  assert.equal(result.items[0]?.title, "Blue Hours");
});

test("playback tokens are requested with authentication and produce a scoped audio URL", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "http://127.0.0.1:17430/api/tracks/track%2Fone/playback-token",
    );
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer session-token",
    );
    return Response.json({
      token: "signed-token",
      expiresAt: "2026-11-10T12:00:00.000Z",
    });
  };

  const issued = await createPlaybackToken(
    "http://127.0.0.1:17430",
    "session-token",
    "track/one",
  );
  assert.equal(issued.token, "signed-token");
  assert.equal(
    trackAudioUrl("http://127.0.0.1:17430", "track/one", issued.token),
    "http://127.0.0.1:17430/api/tracks/track%2Fone/audio?playbackToken=signed-token",
  );
});

test("play history writes and quick-pick reads use authenticated endpoints", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input).endsWith("/plays")) {
      return Response.json(
        { trackId: "track/one", playedAt: "2026-11-11T12:00:00.000Z" },
        { status: 201 },
      );
    }
    return Response.json({
      items: [{ kind: "track", key: "track:track/one", trackId: "track/one" }],
    });
  };

  const recorded = await recordTrackPlay(
    "http://127.0.0.1:17430",
    "session-token",
    "track/one",
  );
  const quickPicks = await fetchQuickPicks(
    "http://127.0.0.1:17430",
    "session-token",
  );

  assert.equal(recorded.trackId, "track/one");
  assert.equal(quickPicks.items[0]?.kind, "track");
  assert.equal(
    requests[0]?.input,
    "http://127.0.0.1:17430/api/tracks/track%2Fone/plays",
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[1]?.input, "http://127.0.0.1:17430/api/quick-picks");
  for (const request of requests) {
    assert.equal(
      new Headers(request.init?.headers).get("Authorization"),
      "Bearer session-token",
    );
  }
});

test("like requests use the authenticated likes endpoint and expected targets", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "POST") {
      return Response.json({
        kind: "track",
        trackId: "track-1",
        likedAt: "2026-11-10T12:00:00.000Z",
      });
    }
    return Response.json({ tracks: [], albums: [], artists: [] });
  };

  assert.deepEqual(await listLikes("http://127.0.0.1:17430", "session-token"), {
    tracks: [],
    albums: [],
    artists: [],
  });
  await createLike("http://127.0.0.1:17430", "session-token", {
    kind: "track",
    trackId: "track-1",
  });
  await deleteLike("http://127.0.0.1:17430", "session-token", {
    kind: "album",
    title: "Night Sessions",
    artist: "Elliot Lake",
  });

  assert.deepEqual(
    requests.map(({ input, init }) => ({ input, method: init?.method })),
    [
      {
        input: "http://127.0.0.1:17430/api/likes",
        method: undefined,
      },
      {
        input: "http://127.0.0.1:17430/api/likes",
        method: "POST",
      },
      {
        input: "http://127.0.0.1:17430/api/likes",
        method: "DELETE",
      },
    ],
  );
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer session-token");
  }
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    kind: "track",
    trackId: "track-1",
  });
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    kind: "album",
    title: "Night Sessions",
    artist: "Elliot Lake",
  });
  assert.equal(
    new Headers(requests[1]?.init?.headers).get("Content-Type"),
    "application/json",
  );
  assert.equal(
    new Headers(requests[2]?.init?.headers).get("Content-Type"),
    "application/json",
  );
});

test("onboarding reads setup status and creates the first administrator", async (context) => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const body = init?.body
      ? JSON.parse(String(init.body))
      : { requiresAdminUser: true };
    return Response.json(
      init?.body
        ? {
            token: "session-token",
            expiresAt: "2026-12-10T00:00:00.000Z",
            user: {
              id: "user-1",
              email: body.email,
              displayName: body.displayName,
              role: "admin",
            },
          }
        : body,
      { status: init?.body ? 201 : 200 },
    );
  };

  assert.deepEqual(await fetchAuthStatus("http://127.0.0.1:17430"), {
    requiresAdminUser: true,
  });
  const session = await createAdministrator("http://127.0.0.1:17430", {
    email: "owner@example.com",
    displayName: "Owner",
    password: "a-secure-local-password",
  });
  assert.equal(session.user.role, "admin");
  assert.equal(session.user.displayName, "Owner");
  assert.equal(requests[0]?.input, "http://127.0.0.1:17430/api/auth/status");
  assert.equal(requests[1]?.input, "http://127.0.0.1:17430/api/auth/bootstrap");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    email: "owner@example.com",
    displayName: "Owner",
    password: "a-secure-local-password",
  });
});

test("sign-in surfaces safe API errors and unreachable servers", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "invalid_credentials",
          messageDescriptor: { key: "api.message.invalidCredentials" },
        },
      },
      { status: 401 },
    );
  await assert.rejects(
    createUserSession("http://127.0.0.1:17430", {
      email: "owner@example.com",
      password: "wrong-password",
    }),
    (reason) =>
      reason instanceof PeridotApiError &&
      reason.code === "invalid_credentials" &&
      reason.messageDescriptor?.key === "api.message.invalidCredentials",
  );

  globalThis.fetch = async () => {
    throw new Error("network detail that must not escape");
  };
  await assert.rejects(
    fetchAuthStatus("http://127.0.0.1:17430"),
    /Could not reach this Peridot server/,
  );
});

test("authenticated requests route to sign-in or setup without treating sign-in failures as redirects", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    setAuthenticationRedirectHandler(null);
  });
  const redirectReasons: string[] = [];
  setAuthenticationRedirectHandler((reason) => {
    redirectReasons.push(reason);
  });

  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "unauthorized",
          messageDescriptor: { key: "api.message.unauthorized" },
        },
      },
      { status: 401 },
    );
  await assert.rejects(
    listTracks("http://127.0.0.1:17430", "expired-session"),
    (reason) =>
      isAuthenticationRedirectError(reason) &&
      reason instanceof Error &&
      "messageDescriptor" in reason &&
      reason.messageDescriptor.key === "api.message.unauthorized",
  );
  assert.deepEqual(redirectReasons, ["login"]);

  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "setup_required",
          messageDescriptor: { key: "api.message.setupRequired" },
        },
      },
      { status: 428 },
    );
  await assert.rejects(
    listTracks("http://127.0.0.1:17430", "stale-session"),
    (reason) =>
      isAuthenticationRedirectError(reason) &&
      reason instanceof Error &&
      "messageDescriptor" in reason &&
      reason.messageDescriptor.key === "api.message.setupRequired",
  );
  assert.deepEqual(redirectReasons, ["login", "setup"]);

  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "unauthorized",
          messageDescriptor: { key: "api.message.unauthorized" },
        },
      },
      { status: 401 },
    );
  await assert.rejects(
    createUserSession("http://127.0.0.1:17430", {
      email: "owner@example.com",
      password: "wrong-password",
    }),
    (reason) =>
      reason instanceof PeridotApiError &&
      reason.messageDescriptor?.key === "api.message.unauthorized",
  );
  assert.deepEqual(redirectReasons, ["login", "setup"]);
});

test("profile updates send and return the display name", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://127.0.0.1:17430/api/users/me");
    request = init;
    return Response.json({
      id: "user-1",
      email: "owner@example.com",
      displayName: "New Name",
      role: "admin",
    });
  };

  const updated = await updateUserProfile(
    "http://127.0.0.1:17430",
    "session-token",
    { displayName: "New Name" },
  );
  assert.equal(updated.displayName, "New Name");
  assert.equal(request?.method, "PUT");
  assert.equal(
    new Headers(request?.headers).get("Authorization"),
    "Bearer session-token",
  );
  assert.deepEqual(JSON.parse(String(request?.body)), {
    displayName: "New Name",
  });
});

test("administrator user management calls use authenticated CRUD endpoints", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const account = {
    id: "user/one",
    email: "member@example.com",
    displayName: "Library Member",
    role: "member",
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "POST") return Response.json(account, { status: 201 });
    if (init?.method === "PUT") {
      return Response.json({
        ...account,
        displayName: "Updated Member",
        role: "admin",
      });
    }
    return Response.json({ items: [account] });
  };
  const server = "http://127.0.0.1:17430";

  assert.deepEqual(await listUsers(server, "session-token"), {
    items: [account],
  });
  assert.equal(
    (
      await createManagedUser(server, "session-token", {
        email: "new@example.com",
        displayName: "New Member",
        password: "managed-user-password",
        role: "member",
      })
    ).id,
    "user/one",
  );
  const updated = await updateManagedUser(server, "session-token", "user/one", {
    displayName: "Updated Member",
    role: "admin",
  });
  assert.equal(updated.role, "admin");
  await deleteManagedUser(server, "session-token", "user/one");

  assert.deepEqual(
    requests.map(({ input, init }) => ({
      input,
      method: init?.method,
    })),
    [
      {
        input: "http://127.0.0.1:17430/api/admin/users",
        method: undefined,
      },
      {
        input: "http://127.0.0.1:17430/api/admin/users",
        method: "POST",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/users/user%2Fone",
        method: "PUT",
      },
      {
        input: "http://127.0.0.1:17430/api/admin/users/user%2Fone",
        method: "DELETE",
      },
    ],
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    email: "new@example.com",
    displayName: "New Member",
    password: "managed-user-password",
    role: "member",
  });
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    displayName: "Updated Member",
    role: "admin",
  });
  for (const { init } of requests) {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer session-token",
    );
  }
});

test("local discovery reads the same-origin discovery endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "/api/discovery/servers");
    return Response.json({
      items: [{ address: "http://192.168.1.8:17430", host: "192.168.1.8" }],
      scannedSubnets: ["192.168.1.0/24"],
    });
  };
  assert.deepEqual(await discoverLocalServers(), {
    items: [{ address: "http://192.168.1.8:17430", host: "192.168.1.8" }],
    scannedSubnets: ["192.168.1.0/24"],
  });
});

test("log polling reads from the admin logs endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let seen = "";
  globalThis.fetch = async (input, init) => {
    seen = String(input);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer s");
    assert.equal(headers.get("Content-Type"), null);
    return Response.json({
      items: [
        {
          id: 3,
          time: "2026-11-10T10:00:00.000Z",
          level: "info",
          message: "hello",
        },
      ],
    });
  };
  const result = await fetchLogs("http://127.0.0.1:17430", "s", 2);
  assert.equal(seen, "http://127.0.0.1:17430/api/admin/logs?after=2");
  assert.equal(result.items[0]?.message, "hello");
});

test("authenticated admin calls send the bearer token and expected bodies", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/api/library/scans")) {
      return Response.json(queuedTask("scan-1", "library_scan", null), {
        status: 202,
      });
    }
    if (url.includes("/api/tasks/")) {
      return Response.json({
        ...queuedTask("scan-1", "library_scan", null),
        status: "completed",
        completedAt: "2026-11-11T10:01:00.000Z",
      });
    }
    if (init?.method === "POST" && url.endsWith("/api/admin/sources")) {
      return Response.json(
        {
          id: "src-1",
          kind: "path",
          name: null,
          path: "/music",
          url: null,
          integration: null,
        },
        { status: 201 },
      );
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (init?.method === "PUT" && url.endsWith("/api/admin/sources/order")) {
      return Response.json({ items: [] });
    }
    if (url.includes("/api/admin/filesystem/tree")) {
      return Response.json({
        items: [{ name: "Artist", path: "/music/Artist" }],
      });
    }
    if (url.includes("/api/admin/filesystem/search")) {
      return Response.json({
        items: [{ name: "Deep Music", path: "/music/A/B/Deep Music" }],
        truncated: false,
      });
    }
    if (url.endsWith("/api/admin/sources")) {
      return Response.json({ items: [] });
    }
    return Response.json({
      trackCount: 2,
      availableTrackCount: 1,
    });
  };

  assert.deepEqual(await fetchServerSettings("http://127.0.0.1:17430", "s"), {
    trackCount: 2,
    availableTrackCount: 1,
  });
  assert.deepEqual(await listSources("http://127.0.0.1:17430", "s"), {
    items: [],
  });
  assert.equal(
    (
      await createSource("http://127.0.0.1:17430", "s", {
        kind: "path",
        path: "/music",
      })
    ).id,
    "src-1",
  );
  assert.deepEqual(
    await reorderSources("http://127.0.0.1:17430", "s", ["src-1"]),
    { items: [] },
  );
  assert.equal(
    (await listDirectories("http://127.0.0.1:17430", "s", "/music")).items
      .length,
    1,
  );
  assert.deepEqual(
    await searchDirectories("http://127.0.0.1:17430", "s", "Deep Music"),
    {
      items: [{ name: "Deep Music", path: "/music/A/B/Deep Music" }],
      truncated: false,
    },
  );
  await deleteSource("http://127.0.0.1:17430", "s", "src-1");
  await revokeSession("http://127.0.0.1:17430", "s");
  assert.equal(
    (await startLibraryScan("http://127.0.0.1:17430", "s")).status,
    "queued",
  );
  assert.equal(
    (await getTask("http://127.0.0.1:17430", "s", "scan-1")).status,
    "completed",
  );

  assert.deepEqual(
    requests.map((request) => request.input),
    [
      "http://127.0.0.1:17430/api/admin/server",
      "http://127.0.0.1:17430/api/admin/sources",
      "http://127.0.0.1:17430/api/admin/sources",
      "http://127.0.0.1:17430/api/admin/sources/order",
      "http://127.0.0.1:17430/api/admin/filesystem/tree?path=%2Fmusic",
      "http://127.0.0.1:17430/api/admin/filesystem/search?query=Deep+Music",
      "http://127.0.0.1:17430/api/admin/sources/src-1",
      "http://127.0.0.1:17430/api/auth/session",
      "http://127.0.0.1:17430/api/library/scans",
      "http://127.0.0.1:17430/api/tasks/scan-1",
    ],
  );
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer s");
  }
  assert.equal(
    new Headers(requests[2]?.init?.headers).get("Content-Type"),
    "application/json",
  );
  assert.equal(
    new Headers(requests[3]?.init?.headers).get("Content-Type"),
    "application/json",
  );
  assert.equal(requests[2]?.init?.method, "POST");
  assert.equal(requests[3]?.init?.method, "PUT");
  assert.equal(requests[6]?.init?.method, "DELETE");
  assert.equal(requests[7]?.init?.method, "DELETE");
  assert.equal(
    new Headers(requests[6]?.init?.headers).get("Content-Type"),
    null,
  );
  assert.equal(
    new Headers(requests[7]?.init?.headers).get("Content-Type"),
    null,
  );
});
