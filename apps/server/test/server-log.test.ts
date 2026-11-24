import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ServerLogBuffer } from "../src/server-log.js";
import { createMemberSession, createTestContext } from "./helpers.js";

test("administrators can read recent server logs", async () => {
  const context = await createTestContext();
  try {
    context.logBuffer.add("info", "first entry");
    context.logBuffer.add("error", "second entry");

    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    const items = response.json<{ items: Array<Record<string, unknown>> }>()
      .items;
    assert.equal(items.length, 2);
    assert.equal(items[0]?.message, "first entry");
    assert.equal(items[1]?.message, "second entry");
  } finally {
    await context.close();
  }
});

test("request completions are debug and errors are warnings", async () => {
  const context = await createTestContext({ logger: true });
  try {
    const healthy = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });
    assert.equal(healthy.statusCode, 200);

    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/admin/library-sources/missing",
      headers: {
        ...context.authorization,
        "content-type": "application/json",
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "FST_ERR_CTP_EMPTY_JSON_BODY");
    const entries = context.logBuffer.list();
    assert.ok(
      entries.some(
        (entry) =>
          entry.level === "debug" &&
          entry.message.startsWith("GET /api/health 200 "),
      ),
    );
    assert.ok(
      entries.some(
        (entry) =>
          entry.level === "warn" &&
          entry.message.startsWith(
            "DELETE /api/admin/library-sources/missing 400 ",
          ),
      ),
    );
    assert.ok(
      !entries.some(
        (entry) =>
          ["info", "error", "fatal"].includes(entry.level) &&
          entry.message.includes("request completed"),
      ),
    );
  } finally {
    await context.close();
  }
});

test("log polling continues after the last seen entry", async () => {
  const context = await createTestContext();
  try {
    const first = context.logBuffer.add("info", "one");
    context.logBuffer.add("info", "two");

    const response = await context.app.inject({
      method: "GET",
      url: `/api/admin/logs?after=${first.id}`,
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    const items = response.json<{ items: Array<{ message: string }> }>().items;
    assert.deepEqual(
      items.map((item) => item.message),
      ["two"],
    );
  } finally {
    await context.close();
  }
});

test("server logs require an administrator", async () => {
  const context = await createTestContext();
  const member = await createMemberSession(context);
  try {
    const memberResponse = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
      headers: member,
    });
    assert.equal(memberResponse.statusCode, 403);

    const anonymousResponse = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
    });
    assert.equal(anonymousResponse.statusCode, 401);
  } finally {
    await context.close();
  }
});

test("file logging removes entries older than its retention period", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-log-retention-"));
  const logPath = path.join(root, "peridot.log");
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const lines = [
    JSON.stringify({ time: now - 6 * day, level: "info", msg: "expired" }),
    JSON.stringify({ time: now - 4 * day, level: "info", msg: "retained" }),
    "unparseable line",
  ];
  await writeFile(logPath, `${lines.join("\n")}\n`);

  const logBuffer = new ServerLogBuffer(logPath);
  try {
    await logBuffer.configureFileLogging(true, 5);
    const content = await readFile(logPath, "utf8");
    assert.doesNotMatch(content, /expired/);
    assert.match(content, /retained/);
    assert.match(content, /unparseable line/);
  } finally {
    await logBuffer.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("server logs reload persisted history after a restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-log-recovery-"));
  const logPath = path.join(root, "peridot.log");
  const previous = new ServerLogBuffer(logPath);
  try {
    await previous.configureFileLogging(true, 5);
    previous.add("info", "before restart");
    previous.add("error", "restart failure");
    await previous.close();

    const content = await readFile(logPath, "utf8");
    const records = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.ok(
      records.every(
        (record) =>
          typeof record.time === "number" &&
          typeof record.level === "number" &&
          typeof record.msg === "string",
      ),
    );

    const restarted = new ServerLogBuffer(logPath);
    try {
      assert.equal(await restarted.loadPersistedHistory(), 2);
      const recovered = restarted.list();
      assert.deepEqual(
        recovered.map(({ level, message }) => ({ level, message })),
        [
          { level: "info", message: "before restart" },
          { level: "error", message: "restart failure" },
        ],
      );
      const live = restarted.add("warn", "after restart");
      assert.ok(live.id > (recovered.at(-1)?.id ?? 0));
    } finally {
      await restarted.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the admin log endpoint exposes history restored from the log file", async () => {
  const time = Date.now() - 60_000;
  const context = await createTestContext({
    persistedLogLines: [
      JSON.stringify({
        time,
        level: 30,
        msg: "request before restart",
      }),
    ],
  });
  try {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response
        .json<{ items: Array<Record<string, unknown>> }>()
        .items.map(({ level, message }) => ({ level, message })),
      [{ level: "info", message: "request before restart" }],
    );
  } finally {
    await context.close();
  }
});

test("startup recovery only exposes history retained by the file policy", async () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const context = await createTestContext({
    persistedLogLines: [
      JSON.stringify({
        time: now - 6 * day,
        level: 30,
        msg: "expired before startup",
      }),
      JSON.stringify({
        time: now - day,
        level: 30,
        msg: "retained through startup",
      }),
    ],
  });
  try {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/admin/logs",
      headers: context.authorization,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response
        .json<{ items: Array<{ message: string }> }>()
        .items.map(({ message }) => message),
      ["retained through startup"],
    );
  } finally {
    await context.close();
  }
});

test("log recovery accepts legacy string levels and keeps the latest entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-log-compat-"));
  const logPath = path.join(root, "peridot.log");
  const now = Date.UTC(2026, 10, 17, 12);
  const lines = Array.from({ length: 502 }, (_, index) =>
    JSON.stringify({
      time: now + index,
      level: index === 500 ? "warn" : 30,
      msg: `entry ${index}`,
    }),
  );
  lines.push("interleaved non-JSON output");
  await writeFile(logPath, `${lines.join("\n")}\n`);

  const logBuffer = new ServerLogBuffer(logPath);
  try {
    assert.equal(await logBuffer.loadPersistedHistory(), 500);
    const entries = logBuffer.list();
    assert.equal(entries.length, 500);
    assert.equal(entries[0]?.message, "entry 2");
    assert.equal(entries.at(-1)?.message, "entry 501");
    assert.equal(entries.at(-2)?.level, "warn");
  } finally {
    await logBuffer.close();
    await rm(root, { recursive: true, force: true });
  }
});
