import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PluginGeneratedPlaylistResponse,
  PluginListResponse,
  PluginProviderListResponse,
  PluginRecommendationListResponse,
  PluginResponse,
  PluginTrackReference,
  TaskResponse,
} from "@peridot/contracts";
import type {
  PluginDefinition,
  PluginGeneratePlaylistInput,
  PluginSimilarTracksInput,
} from "@peridot/plugin-sdk";
import {
  createMemberSession,
  createTestContext,
  waitForTask,
  waitForScan,
} from "./helpers.js";
import { buildApp } from "../src/app.js";

const AUDIO_ID = "plugin-track-id";

function jellyfinResponse(input: string | URL | Request): Response {
  const url = new URL(String(input));
  if (url.pathname === "/System/Info") {
    return Response.json({ ServerName: "Plugin Jellyfin" });
  }
  if (url.pathname === "/Library/VirtualFolders") {
    return Response.json([
      {
        ItemId: "music-library",
        Name: "Music",
        CollectionType: "music",
      },
    ]);
  }
  if (url.pathname === "/Items") {
    return Response.json({
      Items: [
        {
          Id: AUDIO_ID,
          Name: "Plugin Track",
          Etag: "plugin-track-v1",
          Container: "mp3",
          Artists: ["Plugin Artist"],
          Album: "Plugin Album",
          AlbumId: "plugin-album",
          MediaSources: [{ Container: "mp3", Size: 12 }],
        },
      ],
      TotalRecordCount: 1,
    });
  }
  return new Response("not found", { status: 404 });
}

test("Jellyfin is installed by default and can be uninstalled only with confirmation", async () => {
  const context = await createTestContext({
    jellyfinFetch: async (input) => jellyfinResponse(input),
  });
  try {
    const listing = await context.app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: context.authorization,
    });
    assert.equal(listing.statusCode, 200, listing.body);
    const jellyfin = listing
      .json<PluginListResponse>()
      .items.find((plugin) => plugin.id === "jellyfin");
    assert.ok(jellyfin);
    assert.equal(jellyfin.installed, true);
    assert.equal(jellyfin.enabled, true);
    assert.equal(jellyfin.restartRequired, false);
    assert.equal(jellyfin.installSource, "bundled");
    assert.ok(
      jellyfin.contributions.some(
        (contribution) => contribution.kind === "source",
      ),
    );

    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "plugin",
        pluginId: "jellyfin",
        configuration: {
          url: "http://plugin-jellyfin.test",
          apiKey: "plugin-secret",
          libraryId: "music-library",
        },
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const source = created.json<{
      id: string;
      task: { id: string };
    }>();
    await waitForScan(context, source.task.id);
    assert.equal((await context.database.orm.Track.all()).length, 1);

    const missingConfirmation = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/uninstall",
      headers: context.authorization,
      payload: {},
    });
    assert.equal(missingConfirmation.statusCode, 400);
    assert.equal(
      (
        await context.database.orm.Source.where({
          pluginId: "jellyfin",
        }).all()
      ).length,
      1,
    );

    const uninstalled = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/uninstall",
      headers: context.authorization,
      payload: { confirm: true },
    });
    assert.equal(uninstalled.statusCode, 200, uninstalled.body);
    assert.equal(uninstalled.json<PluginResponse>().installed, false);
    assert.equal(uninstalled.json<PluginResponse>().enabled, false);
    assert.equal(
      (
        await context.database.orm.Source.where({
          pluginId: "jellyfin",
        }).all()
      ).length,
      0,
    );
    assert.deepEqual(
      (await context.database.orm.Track.all()).map((track) => ({
        id: track.id,
        sourceId: track.sourceId,
        title: track.title,
      })),
      [],
    );
    assert.equal(
      (
        await context.database.orm.Task.where({
          sourceId: source.id,
        }).all()
      ).length,
      0,
    );

    const discovery = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/sources/discover",
      headers: context.authorization,
      payload: {
        configuration: {
          url: "http://plugin-jellyfin.test",
          apiKey: "plugin-secret",
        },
      },
    });
    assert.equal(discovery.statusCode, 409);

    const reinstalled = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/install",
      headers: context.authorization,
    });
    assert.equal(reinstalled.statusCode, 200, reinstalled.body);
    assert.equal(reinstalled.json<PluginResponse>().installed, true);
    assert.equal(reinstalled.json<PluginResponse>().enabled, true);
    assert.equal(reinstalled.json<PluginResponse>().restartRequired, true);
    assert.equal(
      (
        await context.database.orm.Source.where({
          pluginId: "jellyfin",
        }).all()
      ).length,
      0,
    );
  } finally {
    await context.close();
  }
});

test("plugin enable changes wait for a server restart", async () => {
  const context = await createTestContext({
    jellyfinFetch: async (input) => jellyfinResponse(input),
  });
  let restartedApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    const disabled = await context.app.inject({
      method: "PUT",
      url: "/api/admin/plugins/jellyfin/enabled",
      headers: context.authorization,
      payload: { enabled: false },
    });
    assert.equal(disabled.statusCode, 200, disabled.body);
    const disabledPlugin = disabled.json<PluginResponse>();
    assert.equal(disabledPlugin.enabled, false);
    assert.equal(disabledPlugin.restartRequired, true);

    const beforeRestart = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/sources/discover",
      headers: context.authorization,
      payload: {
        configuration: {
          url: "http://plugin-jellyfin.test",
          apiKey: "plugin-secret",
        },
      },
    });
    assert.equal(beforeRestart.statusCode, 200, beforeRestart.body);

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
    const listing = await restartedApp.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: context.authorization,
    });
    assert.equal(listing.statusCode, 200, listing.body);
    const jellyfin = listing
      .json<PluginListResponse>()
      .items.find((plugin) => plugin.id === "jellyfin");
    assert.ok(jellyfin);
    assert.equal(jellyfin.enabled, false);
    assert.equal(jellyfin.restartRequired, false);

    const afterRestart = await restartedApp.inject({
      method: "POST",
      url: "/api/admin/plugins/jellyfin/sources/discover",
      headers: context.authorization,
      payload: {
        configuration: {
          url: "http://plugin-jellyfin.test",
          apiKey: "plugin-secret",
        },
      },
    });
    assert.equal(afterRestart.statusCode, 409, afterRestart.body);
    assert.equal(
      afterRestart.json<{ error: { code: string } }>().error.code,
      "plugin_disabled",
    );
  } finally {
    await restartedApp?.close();
    await context.close();
  }
});

test("plugin lifecycle mutations require an administrator", async () => {
  const context = await createTestContext({
    jellyfinFetch: async (input) => jellyfinResponse(input),
  });
  try {
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/plugins",
      headers: member,
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await context.close();
  }
});

test("installed plugins expose configurable recommendation and playlist providers", async () => {
  const calls: {
    similar?: PluginSimilarTracksInput;
    playlist?: PluginGeneratePlaylistInput;
  } = {};
  const recommendationContribution = {
    kind: "recommendation-provider" as const,
    methods: ["similar", "for-you"] as const,
  };
  const playlistContribution = {
    kind: "playlist-generator" as const,
    supportsPrompt: true,
    supportsSeed: true,
  };
  const taskContribution = {
    id: "analyze",
    titleMessage: { key: "test.plugin.task.analyze" },
  };
  const dataContribution = {
    kind: "data-processor" as const,
    tasks: [taskContribution],
  };
  const plugin: PluginDefinition = {
    manifest: {
      id: "recommendations",
      name: "Recommendations",
      descriptionMessage: { key: "test.plugin.recommendations" },
      version: "1.0.0",
      sdkVersion: "1",
      capabilities: [
        "recommendations:read",
        "recommendations:generate",
        "playlist:generate",
      ],
      permissions: ["network:recommendations"],
      contributionKinds: [
        "recommendation-provider",
        "playlist-generator",
        "data-processor",
      ],
      installSource: "bundled",
      installSourceLocator: "@peridot/test-recommendations",
      icon: null,
    },
    contributions: [
      recommendationContribution,
      playlistContribution,
      dataContribution,
    ],
    settingsFields: [
      {
        key: "endpoint",
        labelMessage: { key: "test.plugin.endpoint" },
        type: "url",
        required: true,
        secret: false,
        visible: true,
        placeholderMessage: null,
        helpMessage: null,
      },
      {
        key: "token",
        labelMessage: { key: "test.plugin.token" },
        type: "password",
        required: true,
        secret: true,
        visible: true,
        placeholderMessage: null,
        helpMessage: null,
      },
    ],
    recommendationProvider: {
      contribution: recommendationContribution,
      async similar(input) {
        calls.similar = input;
        return [
          {
            sourceId: input.seed.sourceId,
            externalId: "similar-track",
            score: 0.91,
            reason: "Close sonic match",
          },
          {
            sourceId: input.seed.sourceId,
            externalId: "unavailable-track",
            score: 0.8,
            reason: null,
          },
          {
            sourceId: input.seed.sourceId,
            externalId: "missing-track",
            score: null,
            reason: null,
          },
        ];
      },
      async forYou(input) {
        assert.deepEqual(
          input.recentTracks.map((track) => track.externalId),
          ["seed-track"],
        );
        assert.equal(input.likedTracks.length, 0);
        return [
          {
            sourceId: input.recentTracks[0]!.sourceId,
            externalId: "similar-track",
            score: 0.75,
            reason: null,
          },
        ];
      },
    },
    playlistGenerator: {
      contribution: playlistContribution,
      async generate(input) {
        calls.playlist = input;
        return {
          name: input.name ?? "Generated mix",
          items: [
            {
              sourceId: input.seed!.sourceId,
              externalId: "similar-track",
              score: null,
              reason: input.prompt,
            },
          ],
        };
      },
    },
    dataProcessor: {
      contribution: dataContribution,
      tasks: [
        {
          contribution: taskContribution,
          async run(input) {
            assert.equal(input.credentials.token, "server-side-secret");
            await input.progress.update(1, 1);
          },
        },
      ],
    },
  };
  const context = await createTestContext({
    additionalPlugins: [plugin],
  });
  try {
    const source = await context.database.orm.Source.create({
      kind: "path",
      name: "Test Library",
      path: context.libraryRoot,
    });
    const trackInput = (
      title: string,
      externalId: string,
      available: number,
    ) => ({
      title,
      artist: "Test Artist",
      album: "Test Album",
      relativePath: `${externalId}.mp3`,
      mimeType: "audio/mpeg",
      fileSizeBytes: 1n,
      fileModifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      externalId,
      sourceId: source.id,
      available,
    });
    const seed = await context.database.orm.Track.create(
      trackInput("Seed", "seed-track", 1),
    );
    await context.database.orm.Track.create(
      trackInput("Similar", "similar-track", 1),
    );
    await context.database.orm.Track.create(
      trackInput("Unavailable", "unavailable-track", 0),
    );

    const unconfigured = await context.app.inject({
      method: "POST",
      url: "/api/plugins/recommendations/recommendations/similar",
      headers: context.authorization,
      payload: { trackId: seed.id },
    });
    assert.equal(unconfigured.statusCode, 409, unconfigured.body);
    assert.equal(
      unconfigured.json<{ error: { code: string } }>().error.code,
      "not_configured",
    );

    const configured = await context.app.inject({
      method: "PUT",
      url: "/api/admin/plugins/recommendations/settings",
      headers: context.authorization,
      payload: {
        configuration: { endpoint: "http://recommendations.test" },
        credentials: { token: "server-side-secret" },
      },
    });
    assert.equal(configured.statusCode, 200, configured.body);
    const settings = configured.json<PluginResponse>().settings;
    assert.equal(settings.configured, true);
    assert.equal(
      settings.configuration.endpoint,
      "http://recommendations.test",
    );
    assert.equal("token" in settings.configuration, false);

    const stored = await context.database.orm.PluginInstallation.firstOrThrow({
      pluginId: "recommendations",
    });
    assert.ok(stored.credentialCiphertext);
    assert.equal(
      stored.credentialCiphertext.includes("server-side-secret"),
      false,
    );

    const listed = await context.app.inject({
      method: "GET",
      url: "/api/plugins/providers",
      headers: context.authorization,
    });
    assert.equal(listed.statusCode, 200, listed.body);
    const provider = listed
      .json<PluginProviderListResponse>()
      .items.find((item) => item.id === "recommendations");
    assert.ok(provider);
    assert.deepEqual(provider.recommendationMethods, ["similar", "for-you"]);
    assert.equal(provider.playlistGeneration, true);
    assert.equal(provider.configured, true);

    const similar = await context.app.inject({
      method: "POST",
      url: "/api/plugins/recommendations/recommendations/similar",
      headers: context.authorization,
      payload: { trackId: seed.id, limit: 5 },
    });
    assert.equal(similar.statusCode, 200, similar.body);
    const similarResponse = similar.json<PluginRecommendationListResponse>();
    assert.deepEqual(
      similarResponse.items.map((item) => item.track.title),
      ["Similar"],
    );
    assert.equal(similarResponse.items[0]!.reason, "Close sonic match");
    assert.equal(similarResponse.unmatchedCount, 2);
    assert.equal(
      calls.similar?.configuration.endpoint,
      "http://recommendations.test",
    );
    assert.equal(calls.similar?.credentials.token, "server-side-secret");
    assert.deepEqual(calls.similar?.seed, {
      trackId: seed.id,
      sourceId: source.id,
      sourcePluginId: null,
      externalId: "seed-track",
    } satisfies PluginTrackReference);

    await context.database.orm.TrackPlayEvent.create({
      userId: (
        await context.database.orm.User.firstOrThrow({
          email: "admin@example.com",
        })
      ).id,
      trackId: seed.id,
    });
    const forYou = await context.app.inject({
      method: "POST",
      url: "/api/plugins/recommendations/recommendations/for-you",
      headers: context.authorization,
      payload: {},
    });
    assert.equal(forYou.statusCode, 200, forYou.body);
    assert.equal(
      forYou.json<PluginRecommendationListResponse>().items[0]?.track.title,
      "Similar",
    );

    const generated = await context.app.inject({
      method: "POST",
      url: "/api/plugins/recommendations/playlists/generate",
      headers: context.authorization,
      payload: {
        name: "Evening mix",
        prompt: "calm but rhythmic",
        seedTrackId: seed.id,
      },
    });
    assert.equal(generated.statusCode, 200, generated.body);
    const playlist = generated.json<PluginGeneratedPlaylistResponse>();
    assert.equal(playlist.name, "Evening mix");
    assert.equal(playlist.items[0]?.track.title, "Similar");
    assert.equal(calls.playlist?.credentials.token, "server-side-secret");

    const pluginTask = await context.app.inject({
      method: "POST",
      url: "/api/admin/plugins/recommendations/tasks/analyze",
      headers: context.authorization,
    });
    assert.equal(pluginTask.statusCode, 202, pluginTask.body);
    const queuedTask = pluginTask.json<TaskResponse>();
    assert.equal(queuedTask.kind, "plugin:recommendations:analyze");
    const completedTask = await waitForTask(context, queuedTask.id);
    assert.equal(completedTask.status, "completed");
    assert.equal(completedTask.progress.completed, 1);
    assert.equal(completedTask.progress.total, 1);

    const member = await createMemberSession(context);
    const memberProviders = await context.app.inject({
      method: "GET",
      url: "/api/plugins/providers",
      headers: member,
    });
    assert.equal(memberProviders.statusCode, 200);
    const memberSettings = await context.app.inject({
      method: "PUT",
      url: "/api/admin/plugins/recommendations/settings",
      headers: member,
      payload: { configuration: {} },
    });
    assert.equal(memberSettings.statusCode, 403);
  } finally {
    await context.close();
  }
});
