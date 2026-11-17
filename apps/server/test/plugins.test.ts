import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginListResponse, PluginResponse } from "@peridot/contracts";
import {
  createMemberSession,
  createTestContext,
  waitForScan,
} from "./helpers.js";

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
