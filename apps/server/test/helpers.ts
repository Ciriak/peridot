import { copyFile, mkdtemp, realpath, rm } from "node:fs/promises";
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

export interface TestContextOptions {
  logger?: boolean;
  metadataFetch?: typeof fetch;
  metadataRequestIntervalMs?: number;
  discogsFetch?: typeof fetch;
  discogsRequestIntervalMs?: number;
  credentialEncryptionKey?: string | null;
}

export async function createTestContext(
  options: TestContextOptions = {},
): Promise<TestContext> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "peridot-server-")),
  );
  const libraryRoot = path.join(root, "music");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(libraryRoot);
  const databasePath = path.join(root, "test.db").replaceAll("\\", "/");
  const databaseUrl = `file:${databasePath}`;
  const templatePath = process.env.PERIDOT_TEST_DB_TEMPLATE;
  if (!templatePath) {
    throw new Error(
      "Run server tests through pnpm test so the Prisma 8 test database is prepared.",
    );
  }
  await copyFile(templatePath, databasePath);
  const database = createDatabase(databaseUrl);
  const logBuffer = new ServerLogBuffer();
  const metadataFetch =
    options.metadataFetch ??
    (async () => Response.json({ releases: [], recordings: [] }));
  const discogsFetch =
    options.discogsFetch ??
    (async (input: string | URL | Request) =>
      new URL(String(input)).pathname.endsWith("/oauth/identity")
        ? Response.json({ username: "test-discogs-owner" })
        : new Response("not found", { status: 404 }));
  const metadataRequestIntervalMs = options.metadataRequestIntervalMs ?? 0;
  const credentialEncryptionKey =
    options.credentialEncryptionKey === null
      ? undefined
      : (options.credentialEncryptionKey ??
        Buffer.alloc(32, 7).toString("base64"));
  const app = await buildApp({
    config: {
      databaseUrl,
      libraryRoot,
      webOrigins: ["http://127.0.0.1:3000"],
      ...(credentialEncryptionKey ? { credentialEncryptionKey } : {}),
    },
    database,
    logger: options.logger ?? false,
    logBuffer,
    metadataFetch,
    metadataRequestIntervalMs,
    discogsFetch,
    ...(options.discogsRequestIntervalMs !== undefined
      ? { discogsRequestIntervalMs: options.discogsRequestIntervalMs }
      : { discogsRequestIntervalMs: 0 }),
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
      await database.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function createMemberSession(
  context: TestContext,
): Promise<{ authorization: string }> {
  const user = await context.database.orm.User.create({
    email: "member@example.com",
    username: "test-member",
    passwordHash: "unused",
    role: "member",
  });
  const token = "member-session-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await context.database.orm.Session.create({
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    userId: user.id,
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

function synchsafeInteger(value: number): Buffer {
  const encoded = Buffer.alloc(4);
  encoded[0] = (value >>> 21) & 0x7f;
  encoded[1] = (value >>> 14) & 0x7f;
  encoded[2] = (value >>> 7) & 0x7f;
  encoded[3] = value & 0x7f;
  return encoded;
}

function id3TextFrame(id: string, value: string): Buffer {
  const payload = Buffer.concat([Buffer.from([3]), Buffer.from(value, "utf8")]);
  return id3Frame(id, payload);
}

function id3Frame(id: string, payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(id, "ascii"),
    synchsafeInteger(payload.length),
    Buffer.from([0, 0]),
    payload,
  ]);
}

export function createTaggedMp3(tags: {
  title: string;
  artist: string;
  album: string;
  discNumber: number;
  trackNumber: number;
  cover?: {
    mimeType: string;
    data: Buffer;
  };
}): Buffer {
  const frameBuffers = [
    id3TextFrame("TIT2", tags.title),
    id3TextFrame("TPE1", tags.artist),
    id3TextFrame("TALB", tags.album),
    id3TextFrame("TRCK", String(tags.trackNumber)),
    id3TextFrame("TPOS", String(tags.discNumber)),
  ];
  if (tags.cover) {
    frameBuffers.push(
      id3Frame(
        "APIC",
        Buffer.concat([
          Buffer.from([0]),
          Buffer.from(tags.cover.mimeType, "ascii"),
          Buffer.from([0, 3]),
          Buffer.from([0]),
          tags.cover.data,
        ]),
      ),
    );
  }
  const frames = Buffer.concat(frameBuffers);
  const id3 = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.from([4, 0, 0]),
    synchsafeInteger(frames.length),
    frames,
  ]);
  const audioFrame = Buffer.alloc(417);
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(audioFrame);
  return Buffer.concat([id3, audioFrame]);
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
    if (
      ["completed", "failed", "interrupted"].includes(String(scan.status)) &&
      !["pending", "running"].includes(String(scan.metadataStatus))
    ) {
      return scan;
    }
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
