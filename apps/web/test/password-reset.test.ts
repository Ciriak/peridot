import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  completePasswordReset,
  requestPasswordReset,
} from "../app/lib/peridot-client.ts";

test("password recovery calls use the public owner-assisted reset endpoints", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input).endsWith("/complete")) {
      return new Response(null, { status: 204 });
    }
    return Response.json({ status: "requested" }, { status: 202 });
  };
  const server = "http://127.0.0.1:17430";

  assert.deepEqual(
    await requestPasswordReset(server, { email: "member@example.com" }),
    { status: "requested" },
  );
  await completePasswordReset(server, {
    token: "owner-provided-token",
    password: "replacement-password-with-12",
  });

  assert.equal(
    requests[0]?.input,
    "http://127.0.0.1:17430/api/auth/password-resets",
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    email: "member@example.com",
  });
  assert.equal(
    requests[1]?.input,
    "http://127.0.0.1:17430/api/auth/password-resets/complete",
  );
  assert.equal(requests[1]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    token: "owner-provided-token",
    password: "replacement-password-with-12",
  });
});

test("sign-in points users to recovery and the server log", async () => {
  const [source, messagesSource] = await Promise.all([
    readFile(new URL("../app/pages/onboarding.vue", import.meta.url), "utf8"),
    readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
  ]);
  const messages = JSON.parse(messagesSource) as Record<string, string>;
  assert.match(
    messages["onboarding.recoveryDescription"] ?? "",
    /recovery code is available in the server log files/i,
  );
  assert.match(source, /@click="beginPasswordResetRequest"/);
  assert.doesNotMatch(source, /onboarding\.useRecoveryCode/);
  assert.match(source, /id="recovery-email"/);
  assert.match(source, /id="recovery-token"/);
  assert.match(source, /id="reset-password"/);
  assert.match(source, /id="reset-password-confirmation"/);
  assert.match(source, /await requestPasswordReset\(/);
  assert.match(source, /await completePasswordReset\(/);
  assert.match(source, /autocomplete="one-time-code"/);
  assert.doesNotMatch(source, /password reset email|reset email/i);
});
