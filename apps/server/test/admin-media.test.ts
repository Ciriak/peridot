import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminMediaListResponse,
  AdminMediaResponse,
} from "@peridot/contracts";
import {
  createMediaFixture,
  createMemberSession,
  createTestContext,
} from "./helpers.js";

test("administrators can manage medias and their file records", async () => {
  const context = await createTestContext();
  try {
    const fixture = await createMediaFixture(context, {
      media: {
        title: "Original title",
        artist: "Original artist",
        album: "Original album",
      },
    });

    const list = await context.app.inject({
      method: "GET",
      url: "/api/admin/medias?page=1&pageSize=25&query=Original",
      headers: context.authorization,
    });
    assert.equal(list.statusCode, 200);
    const page = list.json<AdminMediaListResponse>();
    assert.equal(page.totalCount, 1);
    assert.equal(page.items[0]?.id, fixture.media.id);
    assert.equal(page.items[0]?.copies.length, 1);

    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/medias",
      headers: context.authorization,
      payload: {
        mediaType: "music",
        title: "Draft media",
        artist: "Draft artist",
        album: "Draft album",
      },
    });
    assert.equal(created.statusCode, 201);
    const draft = created.json<AdminMediaResponse>();
    assert.equal(draft.available, false);
    assert.equal(draft.copies.length, 0);
    assert.ok(draft.manualOverrideFields.includes("title"));

    const updated = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/medias/${draft.id}`,
      headers: context.authorization,
      payload: {
        field: "title",
        value: "Persistent title",
        expectedUpdatedAt: draft.updatedAt,
      },
    });
    assert.equal(updated.statusCode, 200);
    const overridden = updated.json<AdminMediaResponse>();
    assert.equal(overridden.title, "Persistent title");
    assert.ok(overridden.manualOverrideFields.includes("title"));

    const source = await context.database.orm.LibrarySource.first({
      removedAt: null,
    });
    assert.ok(source);
    const copyCreated = await context.app.inject({
      method: "POST",
      url: `/api/admin/medias/${draft.id}/copies`,
      headers: context.authorization,
      payload: {
        librarySourceId: source.id,
        relativePath: "manual/new-track.mp3",
        mediaType: "music",
        title: "Copy title",
        artist: "Copy artist",
        mimeType: "audio/mpeg",
        fileSizeBytes: "2048",
        fileModifiedAt: new Date(0).toISOString(),
      },
    });
    assert.equal(copyCreated.statusCode, 201);
    const withCopy = copyCreated.json<AdminMediaResponse>();
    assert.equal(withCopy.copies.length, 1);
    assert.equal(withCopy.available, true);

    const copied = withCopy.copies[0]!;
    const copyUpdated = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/medias/${draft.id}/copies/${copied.id}`,
      headers: context.authorization,
      payload: {
        field: "relativePath",
        value: "manual/renamed-track.mp3",
        expectedUpdatedAt: copied.updatedAt,
      },
    });
    assert.equal(copyUpdated.statusCode, 200);
    const afterCopyUpdate = copyUpdated.json<AdminMediaResponse>();
    assert.equal(
      afterCopyUpdate.copies[0]?.relativePath,
      "manual/renamed-track.mp3",
    );
    assert.ok(
      afterCopyUpdate.copies[0]?.manualOverrideFields.includes("relativePath"),
    );

    const copyDeleted = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/medias/${draft.id}/copies/${copied.id}`,
      headers: context.authorization,
    });
    assert.equal(copyDeleted.statusCode, 200);
    assert.equal(copyDeleted.json<AdminMediaResponse>().available, false);

    const mediaDeleted = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/medias/${draft.id}`,
      headers: context.authorization,
    });
    assert.equal(mediaDeleted.statusCode, 204);
  } finally {
    await context.close();
  }
});

test("medias manager is restricted to administrators", async () => {
  const context = await createTestContext();
  try {
    const member = await createMemberSession(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/medias",
      headers: member,
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await context.close();
  }
});

test("manual media values resist canonical-copy refreshes", async () => {
  const context = await createTestContext();
  try {
    const fixture = await createMediaFixture(context, {
      media: { title: "Scanned title", artist: "Scanned artist" },
    });
    await context.database.orm.Media.where({ id: fixture.media.id }).update({
      title: "Manual title",
      manualOverrides: JSON.stringify({
        title: "Scanned title",
      }),
    } as never);
    const { refreshCanonicalMediaFromCopies } =
      await import("../src/media-copies.js");
    await refreshCanonicalMediaFromCopies(context.database, fixture.media.id);
    const media = await context.database.orm.Media.first({
      id: fixture.media.id,
    });
    assert.equal(media?.title, "Manual title");
  } finally {
    await context.close();
  }
});
