import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createTestContext } from "./helpers.js";

test("owner-assisted recovery logs a one-time token and revokes existing sessions", async () => {
  const context = await createTestContext({ logger: true });
  try {
    const requested = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets",
      payload: { email: " Admin@Example.com " },
    });
    assert.equal(requested.statusCode, 202);
    assert.deepEqual(requested.json(), { status: "requested" });

    const logEntry = context.logBuffer
      .list()
      .find((entry) =>
        entry.message.startsWith(
          "Password recovery token for admin@example.com: ",
        ),
      );
    assert.ok(logEntry);
    const token = logEntry.message.slice(
      "Password recovery token for admin@example.com: ".length,
    );
    assert.ok(token.length >= 40);
    assert.equal(requested.body.includes(token), false);

    const pending =
      await context.database.orm.PasswordResetToken.firstOrThrow();
    assert.equal(
      pending.tokenHash,
      createHash("sha256").update(token).digest("hex"),
    );
    assert.equal(pending.userId.length > 0, true);
    assert.equal(Object.values(pending).includes(token), false);

    const missing = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets",
      payload: { email: "missing@example.com" },
    });
    assert.equal(missing.statusCode, 202);
    assert.deepEqual(missing.json(), requested.json());

    const invalidPassword = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets/complete",
      payload: { token, password: "short" },
    });
    assert.equal(invalidPassword.statusCode, 400);
    assert.equal(invalidPassword.json().error.code, "invalid_password");

    const completed = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets/complete",
      payload: { token, password: "replacement-password-with-12" },
    });
    assert.equal(completed.statusCode, 204);
    assert.equal(
      (
        await context.database.orm.PasswordResetToken.aggregate(
          (aggregate) => ({ count: aggregate.count() }),
        )
      ).count,
      0,
    );

    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/users/me",
          headers: context.authorization,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/auth/sessions",
          payload: {
            email: "admin@example.com",
            password: "test-password-with-12-characters",
          },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/auth/sessions",
          payload: {
            email: "admin@example.com",
            password: "replacement-password-with-12",
          },
        })
      ).statusCode,
      200,
    );

    const reused = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets/complete",
      payload: { token, password: "another-replacement-password" },
    });
    assert.equal(reused.statusCode, 400);
    assert.equal(
      reused.json().error.messageDescriptor.key,
      "api.message.invalidPasswordResetToken",
    );
  } finally {
    await context.close();
  }
});

test("expired recovery tokens are rejected without changing the password", async () => {
  const context = await createTestContext({ logger: true });
  try {
    await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets",
      payload: { email: "admin@example.com" },
    });
    const logEntry = context.logBuffer
      .list()
      .find((entry) =>
        entry.message.startsWith(
          "Password recovery token for admin@example.com: ",
        ),
      );
    assert.ok(logEntry);
    const token = logEntry.message.slice(
      "Password recovery token for admin@example.com: ".length,
    );
    await context.database.orm.PasswordResetToken.where((reset) =>
      reset.tokenHash.isNotNull(),
    ).update({ expiresAt: new Date(Date.now() - 1_000) });

    const completed = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets/complete",
      payload: { token, password: "replacement-password-with-12" },
    });
    assert.equal(completed.statusCode, 400);
    assert.equal(completed.json().error.code, "invalid_password_reset_token");
    assert.equal(
      (
        await context.app.inject({
          method: "GET",
          url: "/api/users/me",
          headers: context.authorization,
        })
      ).statusCode,
      200,
    );
  } finally {
    await context.close();
  }
});

test("administrator account changes invalidate pending recovery tokens", async () => {
  const context = await createTestContext({ logger: true });
  try {
    const created = await context.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: context.authorization,
      payload: {
        email: "member@example.com",
        displayName: "Recovery Member",
        password: "member-password-with-12",
        role: "member",
      },
    });
    assert.equal(created.statusCode, 201);
    const member = created.json<{ id: string }>();

    await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets",
      payload: { email: "member@example.com" },
    });
    const logEntry = context.logBuffer
      .list()
      .find((entry) =>
        entry.message.startsWith(
          "Password recovery token for member@example.com: ",
        ),
      );
    assert.ok(logEntry);
    const token = logEntry.message.slice(
      "Password recovery token for member@example.com: ".length,
    );

    const updated = await context.app.inject({
      method: "PUT",
      url: `/api/admin/users/${member.id}`,
      headers: context.authorization,
      payload: { password: "changed-member-password" },
    });
    assert.equal(updated.statusCode, 200);

    const recovered = await context.app.inject({
      method: "POST",
      url: "/api/auth/password-resets/complete",
      payload: { token, password: "unexpected-new-password" },
    });
    assert.equal(recovered.statusCode, 400);
    assert.equal(recovered.json().error.code, "invalid_password_reset_token");
  } finally {
    await context.close();
  }
});
