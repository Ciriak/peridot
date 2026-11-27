import assert from "node:assert/strict";
import test from "node:test";
import { resolveBrowserSentryOptions } from "../app/lib/sentry.ts";

test("browser Sentry monitoring stays disabled without a DSN", () => {
  assert.equal(
    resolveBrowserSentryOptions({
      dsn: " ",
      environment: "development",
      release: "0.1.4-local.0",
    }),
    null,
  );
});

test("browser Sentry monitoring samples development and production separately", () => {
  const development = resolveBrowserSentryOptions({
    dsn: "https://public@example.invalid/1",
    environment: "development",
    release: "0.1.4-local.0",
  });
  assert.equal(development?.tracesSampleRate, 1);
  assert.equal(development?.replaysSessionSampleRate, 1);
  assert.equal(development?.replaysOnErrorSampleRate, 1);

  const production = resolveBrowserSentryOptions({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "0.1.4",
  });
  assert.equal(production?.tracesSampleRate, 0.1);
  assert.equal(production?.replaysSessionSampleRate, 0.1);
  assert.equal(production?.replaysOnErrorSampleRate, 1);
});
