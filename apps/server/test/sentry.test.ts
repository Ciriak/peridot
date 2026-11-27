import assert from "node:assert/strict";
import test from "node:test";
import { resolveSentryRuntimeOptions } from "../src/sentry-options.js";

test("server Sentry monitoring stays disabled without a DSN", () => {
  assert.equal(resolveSentryRuntimeOptions({}), null);
  assert.equal(resolveSentryRuntimeOptions({ SENTRY_DSN: "   " }), null);
});

test("server Sentry monitoring chooses environment-sensitive sampling", () => {
  const development = resolveSentryRuntimeOptions({
    SENTRY_DSN: "https://public@example.invalid/1",
    NODE_ENV: "development",
  });
  assert.equal(development?.tracesSampleRate, 1);
  assert.equal(development?.environment, "development");

  const production = resolveSentryRuntimeOptions({
    SENTRY_DSN: "https://public@example.invalid/1",
    PERIDOT_ENVIRONMENT: "production",
    SENTRY_RELEASE: "v1.2.3",
  });
  assert.equal(production?.tracesSampleRate, 0.1);
  assert.equal(production?.environment, "production");
  assert.equal(production?.release, "v1.2.3");
});
