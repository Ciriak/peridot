import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext } from "./helpers.js";

async function countUsers(
  context: Awaited<ReturnType<typeof createTestContext>>,
): Promise<number> {
  const result = await context.database.orm.User.aggregate((aggregate) => ({
    count: aggregate.count(),
  }));
  return result.count;
}

test("an empty server requires one administrator and closes bootstrap afterward", async () => {
  const context = await createTestContext();
  try {
    await context.database.orm.MetadataProvider.where((provider) =>
      provider.id.isNotNull(),
    ).deleteAndCount();
    await context.database.orm.User.where((user) =>
      user.id.isNotNull(),
    ).deleteAndCount();
    const status = await context.app.inject("/api/auth/status");
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json(), { requiresAdminUser: true });
    const blocked = await context.app.inject({
      method: "GET",
      url: "/api/tracks",
    });
    assert.equal(blocked.statusCode, 428);
    assert.equal(blocked.json().error.code, "setup_required");

    const invalid = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "not-an-email",
        displayName: "Owner",
        password: "a-secure-local-password",
      },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(await countUsers(context), 0);

    const shortDisplayName = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "owner@example.com",
        displayName: " x ",
        password: "a-secure-local-password",
      },
    });
    assert.equal(shortDisplayName.statusCode, 400);
    assert.equal(await countUsers(context), 0);

    const created = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "Owner@Example.com",
        displayName: " Owner ",
        password: "a-secure-local-password",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.email, "owner@example.com");
    assert.equal(created.json().user.displayName, "Owner");
    assert.equal("username" in created.json().user, false);
    assert.equal(created.json().user.role, "admin");
    assert.ok(created.json().token);
    assert.equal(
      (await context.app.inject("/api/auth/status")).json().requiresAdminUser,
      false,
    );

    const stored = await context.database.orm.User.where({
      normalizedDisplayName: "owner",
    }).firstOrThrow();
    assert.equal(stored.email, "owner@example.com");
    assert.equal(stored.displayName, "Owner");
    assert.notEqual(stored.passwordHash, "a-secure-local-password");
    assert.equal(stored.role, "admin");

    const provider = await context.database.orm.MetadataProvider.firstOrThrow({
      kind: "musicbrainz",
    });
    assert.deepEqual(JSON.parse(provider.configuration), {
      contact: "owner@example.com",
    });
    assert.equal(provider.enabled, 1);

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "another@example.com",
        displayName: "Another Owner",
        password: "another-secure-password",
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(await countUsers(context), 1);
  } finally {
    await context.close();
  }
});

test("users can only sign in with email and can inspect and revoke their session", async () => {
  const context = await createTestContext();
  try {
    const rejected = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: { email: "admin@example.com", password: "incorrect-password" },
    });
    assert.equal(rejected.statusCode, 401);

    const byDisplayName = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: {
        displayName: "Test Admin",
        password: "test-password-with-12-characters",
      },
    });
    assert.equal(byDisplayName.statusCode, 401);
    assert.equal(byDisplayName.json().error.code, "invalid_credentials");

    const byEmail = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: {
        email: "Admin@Example.com",
        password: "test-password-with-12-characters",
      },
    });
    assert.equal(byEmail.statusCode, 200);
    assert.equal(byEmail.json().user.email, "admin@example.com");
    assert.equal(byEmail.json().user.displayName, "Test Admin");

    const token = byEmail.json<{ token: string }>().token;
    const authorization = { authorization: `Bearer ${token}` };
    const me = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: authorization,
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), byEmail.json().user);

    assert.equal(
      (
        await context.app.inject({
          method: "DELETE",
          url: "/api/auth/session",
          headers: authorization,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/users/me",
          headers: authorization,
        })
      ).statusCode,
      401,
    );
  } finally {
    await context.close();
  }
});

test("users can update their unique display name without ending their session", async () => {
  const context = await createTestContext();
  try {
    await context.database.orm.User.create({
      email: "member@example.com",
      displayName: "Alice",
      normalizedDisplayName: "alice",
      passwordHash: "unused",
      role: "member",
    });

    const invalid = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: " x " },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_display_name");

    const duplicate = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: "  ALICE  " },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().error.code, "display_name_taken");

    const updated = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: "  Test   Admin  " },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().displayName, "Test Admin");
    assert.equal(updated.json().email, "admin@example.com");

    const me = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: context.authorization,
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), updated.json());

    const minimum = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: "Ab" },
    });
    assert.equal(minimum.statusCode, 200);

    const maximum = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: "x".repeat(80) },
    });
    assert.equal(maximum.statusCode, 200);

    const tooLong = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      headers: context.authorization,
      payload: { displayName: "x".repeat(81) },
    });
    assert.equal(tooLong.statusCode, 400);

    const unauthenticated = await context.app.inject({
      method: "PUT",
      url: "/api/users/me",
      payload: { displayName: "Anonymous" },
    });
    assert.equal(unauthenticated.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("user preferences initialize once, remain account-scoped, and update", async () => {
  const context = await createTestContext();
  try {
    const initial = await context.app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
      headers: context.authorization,
    });
    assert.equal(initial.statusCode, 200);
    assert.deepEqual(initial.json(), {
      likedTitlesOffline: true,
      initialized: false,
    });

    const initialized = await context.app.inject({
      method: "POST",
      url: "/api/users/me/preferences/initialize",
      headers: context.authorization,
      payload: { likedTitlesOffline: false },
    });
    assert.equal(initialized.statusCode, 200);
    assert.deepEqual(initialized.json(), {
      likedTitlesOffline: false,
      initialized: true,
    });

    const losingInitializer = await context.app.inject({
      method: "POST",
      url: "/api/users/me/preferences/initialize",
      headers: context.authorization,
      payload: { likedTitlesOffline: true },
    });
    assert.equal(losingInitializer.statusCode, 200);
    assert.deepEqual(losingInitializer.json(), {
      likedTitlesOffline: false,
      initialized: true,
    });

    const updated = await context.app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: context.authorization,
      payload: { likedTitlesOffline: true },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(updated.json(), {
      likedTitlesOffline: true,
      initialized: true,
    });

    const invalid = await context.app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: context.authorization,
      payload: { likedTitlesOffline: "yes" },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_user_preferences");

    const unauthenticated = await context.app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
    });
    assert.equal(unauthenticated.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("the configured web origin can call onboarding endpoints", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "OPTIONS",
      url: "/api/auth/status",
      headers: {
        origin: "http://127.0.0.1:17430",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://127.0.0.1:17430",
    );
  } finally {
    await context.close();
  }
});
