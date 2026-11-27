import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../src/start.js";

test("startup failures are reported before the server returns", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-start-failure-"));
  const previousExitCode = process.exitCode;
  const failure = new Error("database disk image is malformed");
  const reports: Array<Record<string, unknown>> = [];
  try {
    const started = await startServer(
      {
        DATABASE_URL: `file:${path.join(root, "peridot.db").replaceAll("\\", "/")}`,
        HOST: "127.0.0.1",
        PORT: "17430",
        PERIDOT_SERVE_WEB: "false",
      },
      {
        buildApp: async () => {
          throw failure;
        },
        reportFailure: async (error: unknown, options: unknown) => {
          reports.push({ error, options });
        },
      },
    );

    assert.equal(started, false);
    assert.equal(reports.length, 1);
    assert.equal((reports[0]?.error as Error).message, failure.message);
    assert.deepEqual(reports[0]?.options, {
      message: "Could not start the Peridot server.",
      component: "server",
      operation: "startup",
      logFilePath: path.join(root, "peridot.log"),
      fields: {
        host: "127.0.0.1",
        port: 17430,
        serveWeb: false,
      },
    });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime configuration failures use the same reporting path", async () => {
  const previousExitCode = process.exitCode;
  const reports: Array<Record<string, unknown>> = [];
  try {
    const started = await startServer(
      { PORT: "invalid" },
      {
        buildApp: async () => {
          throw new Error("The application must not be built.");
        },
        reportFailure: async (error: unknown, options: unknown) => {
          reports.push({ error, options });
        },
      },
    );

    assert.equal(started, false);
    assert.equal(reports.length, 1);
    assert.match(
      String((reports[0]?.error as Error).message),
      /PORT must be an integer/,
    );
    assert.deepEqual(reports[0]?.options, {
      message: "Could not resolve the Peridot server runtime.",
      component: "server",
      operation: "startup",
    });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});
