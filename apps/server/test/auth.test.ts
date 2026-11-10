import assert from "node:assert/strict";
import test from "node:test";
import { createTestContext } from "./helpers.js";

test("an empty server requires one administrator and closes bootstrap afterward", async () => {
  const context = await createTestContext();
  try {
    await context.database.user.deleteMany();
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
        username: "owner",
        password: "a-secure-local-password",
      },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(await context.database.user.count(), 0);

    const created = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "Owner@Example.com",
        username: " Owner ",
        password: "a-secure-local-password",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.email, "owner@example.com");
    assert.equal(created.json().user.username, "owner");
    assert.equal(created.json().user.role, "admin");
    assert.ok(created.json().token);
    assert.equal(
      (await context.app.inject("/api/auth/status")).json().requiresAdminUser,
      false,
    );

    const stored = await context.database.user.findUniqueOrThrow({
      where: { username: "owner" },
    });
    assert.equal(stored.email, "owner@example.com");
    assert.notEqual(stored.passwordHash, "a-secure-local-password");
    assert.equal(stored.role, "admin");

    const duplicate = await context.app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "another@example.com",
        username: "another-owner",
        password: "another-secure-password",
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(await context.database.user.count(), 1);
  } finally {
    await context.close();
  }
});

test("users can sign in with a username or email, inspect their account, and revoke their session", async () => {
  const context = await createTestContext();
  try {
    const rejected = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: { identifier: "test-admin", password: "incorrect-password" },
    });
    assert.equal(rejected.statusCode, 401);

    const byUsername = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: {
        identifier: "TEST-ADMIN",
        password: "test-password-with-12-characters",
      },
    });
    assert.equal(byUsername.statusCode, 200);

    const byEmail = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: {
        identifier: "Admin@Example.com",
        password: "test-password-with-12-characters",
      },
    });
    assert.equal(byEmail.statusCode, 200);
    assert.equal(byEmail.json().user.email, "admin@example.com");
    assert.equal(byEmail.json().user.username, "test-admin");

    const token = byUsername.json<{ token: string }>().token;
    const authorization = { authorization: `Bearer ${token}` };
    const me = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: authorization,
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), byUsername.json().user);

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

test("the configured web origin can call onboarding endpoints", async () => {
  const context = await createTestContext();
  try {
    const response = await context.app.inject({
      method: "OPTIONS",
      url: "/api/auth/status",
      headers: {
        origin: "http://127.0.0.1:3000",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      "http://127.0.0.1:3000",
    );
  } finally {
    await context.close();
  }
});
