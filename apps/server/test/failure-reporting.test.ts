import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  captureBackgroundError,
  reportFatalFailure,
  type SentryCaptureContext,
} from "../src/failure-reporting.js";

test("fatal failures are captured, flushed, and persisted as structured logs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-failure-report-"));
  const logPath = path.join(root, "peridot.log");
  const writes: string[] = [];
  const captures: Array<{
    error: unknown;
    context: SentryCaptureContext;
  }> = [];
  let flushTimeout: number | null = null;

  try {
    const error = new Error("The database could not be read.", {
      cause: Object.assign(new Error("database disk image is malformed"), {
        code: "SQLITE_CORRUPT",
      }),
    });
    await reportFatalFailure(
      error,
      {
        message: "Database migration failed.",
        component: "database",
        operation: "migration",
        logFilePath: logPath,
        fields: { migrateDev: false },
      },
      {
        sentry: {
          isInitialized: () => true,
          captureException: (capturedError, context) => {
            captures.push({ error: capturedError, context });
            return "event-123";
          },
          captureMessage: () => "unused",
          flush: async (timeout) => {
            flushTimeout = timeout;
            return true;
          },
        },
        log: {
          writeStderr: (value) => writes.push(value),
          appendFile: async (filePath, value) => {
            assert.equal(filePath, logPath);
            const { appendFile } = await import("node:fs/promises");
            await appendFile(filePath, value);
          },
        },
      },
    );

    assert.equal(captures.length, 1);
    assert.equal(captures[0]?.error, error);
    assert.deepEqual(captures[0]?.context.tags, {
      component: "database",
      operation: "migration",
      service: "peridot-server",
    });
    assert.equal(flushTimeout, 2_000);

    const record = JSON.parse(
      (await readFile(logPath, "utf8")).trim(),
    ) as Record<string, unknown>;
    assert.equal(record.level, 50);
    assert.equal(record.component, "database");
    assert.equal(record.operation, "migration");
    assert.equal(record.migrateDev, false);
    assert.match(String(record.msg), /database disk image is malformed/);
    assert.match(String(record.msg), /SQLITE_CORRUPT/);
    assert.deepEqual(record.sentry, {
      enabled: true,
      eventId: "event-123",
      flushRequested: true,
      flushed: true,
    });
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0]!), record);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fatal logging survives unavailable Sentry and capture failures", async () => {
  const writes: string[] = [];
  let flushCalls = 0;
  await reportFatalFailure(
    new Error("startup failed"),
    {
      message: "Could not start the Peridot server.",
      component: "server",
      operation: "startup",
    },
    {
      sentry: {
        isInitialized: () => true,
        captureException: () => {
          throw new Error("Sentry unavailable");
        },
        captureMessage: () => undefined,
        flush: async () => {
          flushCalls += 1;
          return true;
        },
      },
      log: {
        writeStderr: (value) => writes.push(value),
        appendFile: async () => undefined,
      },
    },
  );

  const record = JSON.parse(writes[0]!) as Record<string, unknown>;
  assert.equal(flushCalls, 0);
  assert.match(String(record.msg), /startup failed/);
  assert.deepEqual(record.sentry, {
    enabled: true,
    eventId: null,
    flushRequested: false,
    flushed: null,
    captureError: "Error: Sentry unavailable",
  });
});

test("fatal logging records Sentry flush failures", async () => {
  const writes: string[] = [];
  await reportFatalFailure(
    new Error("database is unavailable"),
    {
      message: "Database migration failed.",
      component: "database",
      operation: "migration",
    },
    {
      sentry: {
        isInitialized: () => true,
        captureException: () => "event-456",
        captureMessage: () => undefined,
        flush: async () => {
          throw new Error("Sentry did not flush");
        },
      },
      log: {
        writeStderr: (value) => writes.push(value),
        appendFile: async () => undefined,
      },
    },
  );

  const record = JSON.parse(writes[0]!) as Record<string, unknown>;
  assert.deepEqual(record.sentry, {
    enabled: true,
    eventId: "event-456",
    flushRequested: true,
    flushed: null,
    flushError: "Error: Sentry did not flush",
  });
});

test("handled background errors become Sentry issues", () => {
  const captures: Array<{
    message: string;
    context: SentryCaptureContext;
  }> = [];
  const eventId = captureBackgroundError(
    "Task failed: library scan. Permission denied.",
    "task",
    { taskKind: "library_scan" },
    {
      isInitialized: () => true,
      captureException: () => undefined,
      captureMessage: (message, context) => {
        captures.push({ message, context });
        return "background-event";
      },
      flush: async () => true,
    },
  );

  assert.equal(eventId, "background-event");
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0]?.context.tags, {
    component: "background-worker",
    operation: "task",
    service: "peridot-server",
  });
  assert.deepEqual(captures[0]?.context.contexts, {
    failure: { taskKind: "library_scan" },
  });
});
