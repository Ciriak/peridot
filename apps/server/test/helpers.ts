import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createDatabase, type Database } from "../src/database.js";
import { ServerLogBuffer } from "../src/server-log.js";

export interface TestContext {
  app: FastifyInstance;
  database: Database;
  databaseUrl: string;
  libraryRoot: string;
  root: string;
  authorization: { authorization: string };
  logBuffer: ServerLogBuffer;
  close(): Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-server-"));
  const libraryRoot = path.join(root, "music");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(libraryRoot);
  const databasePath = path.join(root, "test.db").replaceAll("\\", "/");
  const databaseUrl = `file:${databasePath}`;
  const database = createDatabase(databaseUrl);
  const logBuffer = new ServerLogBuffer();
  for (const migrationName of [
    "20261110120000_local_library",
    "20261110180000_users",
    "20261110190000_user_email",
    "20261110200000_server_settings",
    "20261110210000_sources",
    "20261110220000_source_order",
  ]) {
    const migrationPath = new URL(
      `../prisma/migrations/${migrationName}/migration.sql`,
      import.meta.url,
    );
    const migration = await readFile(migrationPath, "utf8");
    for (const statement of migration
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      await database.$executeRawUnsafe(statement);
    }
  }
  const app = await buildApp({
    config: {
      databaseUrl,
      libraryRoot,
      webOrigins: ["http://127.0.0.1:3000"],
    },
    database,
    logger: false,
    logBuffer,
  });
  const bootstrap = await app.inject({
    method: "POST",
    url: "/api/auth/bootstrap",
    payload: {
      email: "admin@example.com",
      username: "test-admin",
      password: "test-password-with-12-characters",
    },
  });
  if (bootstrap.statusCode !== 201) throw new Error(bootstrap.body);
  const authorization = {
    authorization: `Bearer ${bootstrap.json<{ token: string }>().token}`,
  };
  return {
    app,
    database,
    databaseUrl,
    libraryRoot,
    root,
    authorization,
    logBuffer,
    async close() {
      await app.close();
      await database.$disconnect();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function createMemberSession(
  context: TestContext,
): Promise<{ authorization: string }> {
  const user = await context.database.user.create({
    data: {
      email: "member@example.com",
      username: "test-member",
      passwordHash: "unused",
      role: "member",
    },
  });
  const token = "member-session-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await context.database.session.create({
    data: {
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: user.id,
    },
  });
  return { authorization: `Bearer ${token}` };
}

export function createWav(durationMilliseconds = 100): Buffer {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 8;
  const dataLength = Math.max(
    1,
    Math.round((sampleRate * durationMilliseconds) / 1000),
  );
  const buffer = Buffer.alloc(44 + dataLength, 128);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  buffer.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

export async function waitForScan(
  context: TestContext,
  scanId: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/library/scans/${scanId}`,
      headers: context.authorization,
    });
    const scan = response.json<Record<string, unknown>>();
    if (["completed", "failed", "interrupted"].includes(String(scan.status)))
      return scan;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Scan did not finish in time");
}

export async function startScan(
  context: TestContext,
): Promise<Record<string, unknown>> {
  const response = await context.app.inject({
    method: "POST",
    url: "/api/library/scans",
    headers: context.authorization,
  });
  if (response.statusCode !== 202) throw new Error(response.body);
  return waitForScan(context, response.json<{ id: string }>().id);
}
