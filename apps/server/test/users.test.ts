import assert from "node:assert/strict";
import test from "node:test";
import type { UserResponse } from "@peridot/contracts";
import { createMemberSession, createTestContext } from "./helpers.js";

const USER_PASSWORD = "managed-user-password";
const NEW_USER_PASSWORD = "replacement-user-password";

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

test("administrators can create, edit, promote, and delete user accounts", async () => {
  const context = await createTestContext();
  try {
    const member = await createMemberSession(context);
    const denied = await context.app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: member.authorization },
    });
    assert.equal(denied.statusCode, 403);

    const initial = await context.app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: context.authorization,
    });
    assert.equal(initial.statusCode, 200);
    assert.deepEqual(
      initial.json().items.map((account: UserResponse) => account.email),
      ["admin@example.com", "member@example.com"],
    );
    assert.equal("passwordHash" in initial.json().items[0], false);

    const invalid = await context.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: context.authorization,
      payload: {
        email: "new@example.com",
        displayName: "New User",
        password: USER_PASSWORD,
        role: "owner",
      },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "invalid_user");

    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: context.authorization,
      payload: {
        email: "New@Example.com",
        displayName: "  New   User  ",
        password: USER_PASSWORD,
        role: "member",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().email, "new@example.com");
    assert.equal(created.json().displayName, "New User");
    assert.equal(created.json().role, "member");
    assert.equal("passwordHash" in created.json(), false);

    const duplicateEmail = await context.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: context.authorization,
      payload: {
        email: "NEW@example.com",
        displayName: "Another User",
        password: USER_PASSWORD,
        role: "member",
      },
    });
    assert.equal(duplicateEmail.statusCode, 409);
    assert.equal(duplicateEmail.json().error.code, "email_taken");

    const duplicateDisplayName = await context.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: context.authorization,
      payload: {
        email: "another@example.com",
        displayName: "new user",
        password: USER_PASSWORD,
        role: "member",
      },
    });
    assert.equal(duplicateDisplayName.statusCode, 409);
    assert.equal(duplicateDisplayName.json().error.code, "display_name_taken");

    const originalSignIn = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: { email: "new@example.com", password: USER_PASSWORD },
    });
    assert.equal(originalSignIn.statusCode, 200);

    const updated = await context.app.inject({
      method: "PUT",
      url: `/api/admin/users/${created.json().id}`,
      headers: context.authorization,
      payload: {
        email: "renamed@example.com",
        displayName: "Renamed User",
        password: NEW_USER_PASSWORD,
        role: "admin",
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().email, "renamed@example.com");
    assert.equal(updated.json().displayName, "Renamed User");
    assert.equal(updated.json().role, "admin");

    const revokedSession = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: authorization(originalSignIn.json().token),
    });
    assert.equal(revokedSession.statusCode, 401);

    const oldIdentity = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: { email: "new@example.com", password: USER_PASSWORD },
    });
    assert.equal(oldIdentity.statusCode, 401);

    const newIdentity = await context.app.inject({
      method: "POST",
      url: "/api/auth/sessions",
      payload: {
        email: "renamed@example.com",
        password: NEW_USER_PASSWORD,
      },
    });
    assert.equal(newIdentity.statusCode, 200);
    assert.equal(newIdentity.json().user.role, "admin");

    const removedAdmin = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/users/${created.json().id}`,
      headers: context.authorization,
    });
    assert.equal(removedAdmin.statusCode, 204);

    const deletedSession = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: authorization(newIdentity.json().token),
    });
    assert.equal(deletedSession.statusCode, 401);
    assert.equal(
      (
        await context.database.orm.Session.where({
          userId: created.json().id,
        }).aggregate((aggregate) => ({ count: aggregate.count() }))
      ).count,
      0,
    );

    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/auth/sessions",
          payload: {
            email: "renamed@example.com",
            password: NEW_USER_PASSWORD,
          },
        })
      ).statusCode,
      401,
    );
  } finally {
    await context.close();
  }
});

test("administrator accounts cannot delete themselves or change their own role", async () => {
  const context = await createTestContext();
  try {
    const me = await context.app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: context.authorization,
    });
    assert.equal(me.statusCode, 200);

    const selfDelete = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/users/${me.json().id}`,
      headers: context.authorization,
    });
    assert.equal(selfDelete.statusCode, 409);
    assert.equal(selfDelete.json().error.code, "own_account_delete_forbidden");

    const selfDemotion = await context.app.inject({
      method: "PUT",
      url: `/api/admin/users/${me.json().id}`,
      headers: context.authorization,
      payload: { role: "member" },
    });
    assert.equal(selfDemotion.statusCode, 409);
    assert.equal(selfDemotion.json().error.code, "own_role_immutable");

    const missing = await context.app.inject({
      method: "PUT",
      url: "/api/admin/users/missing-user",
      headers: context.authorization,
      payload: { displayName: "Missing User" },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "user_not_found");
  } finally {
    await context.close();
  }
});
