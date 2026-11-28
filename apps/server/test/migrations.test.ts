import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  createVerifiedBackup,
  runPendingMigrations,
} from "../scripts/migrate-database.js";
import { runPrismaCommand } from "../scripts/prisma-cli.js";

function databaseUrl(databasePath: string): string {
  return `file:${path.resolve(databasePath).replaceAll("\\", "/")}`;
}

async function runMigrationEntry(
  databasePath: string,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/migrate-database-entry.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl(databasePath),
        SENTRY_DSN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (value: string) => {
    stdout += value;
  });
  child.stderr.on("data", (value: string) => {
    stderr += value;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  return { code, stderr, stdout };
}

async function withTemporaryDatabase(
  run: (databasePath: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-migrations-"));
  try {
    await run(path.join(root, "peridot.db"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("fresh databases apply the baseline without a backup", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const result = await runPendingMigrations({
      databaseUrl: databaseUrl(databasePath),
      info: () => undefined,
    });

    const migrationDirectories = (
      await readdir(path.resolve("migrations", "app"), {
        withFileTypes: true,
      })
    ).filter((entry) => entry.isDirectory() && entry.name !== "refs");
    assert.equal(result.pendingCount, migrationDirectories.length);
    assert.equal(result.backupPath, null);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const table = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'",
        )
        .get() as { name?: string } | undefined;
      assert.equal(table?.name, "User");
      const scanWorkerColumn = database
        .prepare(
          "SELECT name FROM pragma_table_info('ServerSetting') WHERE name = 'scanWorkerCount'",
        )
        .get() as { name?: string } | undefined;
      assert.equal(scanWorkerColumn?.name, "scanWorkerCount");
      const passwordResetTable = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'PasswordResetToken'",
        )
        .get() as { name?: string } | undefined;
      assert.equal(passwordResetTable?.name, "PasswordResetToken");
    } finally {
      database.close();
    }
    await assert.rejects(
      readdir(path.join(path.dirname(databasePath), "backups")),
    );
  });
});

test("migration entrypoint logs malformed databases with structured details", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    await writeFile(databasePath, "not a SQLite database");
    const result = await runMigrationEntry(databasePath);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /Checking for pending database migrations/);

    const logPath = path.join(path.dirname(databasePath), "peridot.log");
    const records = (await readFile(logPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const record = records.at(-1);
    assert.equal(record?.component, "database");
    assert.equal(record?.operation, "migration");
    assert.match(String(record?.msg), /Database migration failed/);
    assert.equal(typeof record?.error, "object");
    assert.deepEqual(record?.sentry, {
      enabled: false,
      eventId: null,
      flushRequested: false,
      flushed: null,
    });
    assert.match(result.stderr, /"component":"database"/);
  });
});

test("current-schema databases without a migration ledger need no changes", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const url = databaseUrl(databasePath);
    await runPrismaCommand(
      ["db", "update", "--db", url, "--no-interactive"],
      true,
    );

    const messages: string[] = [];
    const result = await runPendingMigrations({
      databaseUrl: url,
      info: (message) => messages.push(message),
    });

    assert.equal(result.pendingCount, 0);
    assert.equal(result.backupPath, null);
    assert.match(messages.join("\n"), /No pending database migrations/);
  });
});

test("moves an indexer destination source onto its download client", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const url = databaseUrl(databasePath);
    await runPrismaCommand(
      [
        "db",
        "migrate",
        "--db",
        url,
        "--to",
        "7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135",
      ],
      true,
    );

    const database = new DatabaseSync(databasePath);
    database.exec(`
      INSERT INTO "LibrarySource" ("id", "kind", "path", "updatedAt")
      VALUES ('source', 'path', 'C:/Music', '2026-11-25T00:00:00.000Z');
      INSERT INTO "DownloadClient"
        ("id", "kind", "name", "url", "username", "credentialCiphertext", "updatedAt")
      VALUES
        ('client', 'qbittorrent', 'Downloads', 'http://qbit:8080', '', 'secret', '2026-11-25T00:00:00.000Z');
      INSERT INTO "ReleaseIndexer"
        ("id", "url", "downloadClientId", "destinationSourceId", "position", "updatedAt")
      VALUES
        ('indexer', 'http://indexer/feed', 'client', 'source', 0, '2026-11-25T00:00:00.000Z');
    `);
    database.close();

    const result = await runPendingMigrations({
      databaseUrl: url,
      info: () => undefined,
    });
    assert.equal(result.pendingCount, 1);

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const client = migrated
        .prepare(
          'SELECT "destinationSourceId" FROM "DownloadClient" WHERE "id" = ?',
        )
        .get("client") as { destinationSourceId?: string } | undefined;
      assert.equal(client?.destinationSourceId, "source");
      const oldColumn = migrated
        .prepare(
          "SELECT name FROM pragma_table_info('ReleaseIndexer') WHERE name = 'destinationSourceId'",
        )
        .get();
      assert.equal(oldColumn, undefined);
    } finally {
      migrated.close();
    }
  });
});

test("failed migrations preserve a verified pre-migration backup", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE "User" ("id" TEXT PRIMARY KEY)');
    database.prepare('INSERT INTO "User" ("id") VALUES (?)').run("existing");
    database.close();

    await assert.rejects(
      runPendingMigrations({
        databaseUrl: databaseUrl(databasePath),
        info: () => undefined,
      }),
    );

    const backupDirectory = path.join(path.dirname(databasePath), "backups");
    const backups = (await readdir(backupDirectory)).filter((entry) =>
      entry.endsWith(".db"),
    );
    assert.equal(backups.length, 1);
    if (process.platform !== "win32") {
      assert.equal((await stat(backupDirectory)).mode & 0o777, 0o700);
      assert.equal(
        (await stat(path.join(backupDirectory, backups[0]!))).mode & 0o777,
        0o600,
      );
    }

    const snapshot = new DatabaseSync(path.join(backupDirectory, backups[0]!), {
      readOnly: true,
    });
    try {
      const row = snapshot.prepare('SELECT "id" FROM "User"').get() as
        { id?: string } | undefined;
      assert.equal(row?.id, "existing");
    } finally {
      snapshot.close();
    }
  });
});

test("backup retention keeps the three newest snapshots and unrelated files", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const source = new DatabaseSync(databasePath);
    source.exec("CREATE TABLE Sample (value TEXT)");
    source.prepare("INSERT INTO Sample (value) VALUES (?)").run("preserved");
    source.close();

    const backupDirectory = path.join(path.dirname(databasePath), "backups");
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(path.join(backupDirectory, "notes.txt"), "keep");

    const backups: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      backups.push(
        await createVerifiedBackup({
          databasePath,
          fromContract: null,
          toContract: "abcdef0123456789".repeat(4),
          backupDirectory,
          now: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        }),
      );
    }

    const entries = await readdir(backupDirectory);
    assert.equal(entries.filter((entry) => entry.endsWith(".db")).length, 3);
    assert.equal(entries.includes("notes.txt"), true);
    assert.equal(entries.includes(path.basename(backups[0]!)), false);
    assert.equal(entries.includes(path.basename(backups[3]!)), true);
  });
});

test("startup prunes expired snapshots when no migration is pending", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const url = databaseUrl(databasePath);
    await runPrismaCommand(
      ["db", "update", "--db", url, "--no-interactive"],
      true,
    );

    const backupDirectory = path.join(path.dirname(databasePath), "backups");
    const backups: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      backups.push(
        await createVerifiedBackup({
          databasePath,
          fromContract: null,
          toContract: "abcdef0123456789".repeat(4),
          backupDirectory,
          now: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        }),
      );
    }
    const staleBackup = path.join(
      backupDirectory,
      "peridot-20250101T000000000Z-before-empty-to-abcdef01.db",
    );
    await writeFile(staleBackup, "stale snapshot");

    const messages: string[] = [];
    await runPendingMigrations({
      databaseUrl: url,
      info: (message) => messages.push(message),
    });

    const entries = await readdir(backupDirectory);
    assert.equal(entries.filter((entry) => entry.endsWith(".db")).length, 3);
    assert.equal(entries.includes(path.basename(backups[0]!)), false);
    assert.equal(entries.includes(path.basename(backups[3]!)), true);
    assert.equal(entries.includes(path.basename(staleBackup)), false);
    assert.match(messages.join("\n"), /Pruned 1 expired database snapshot/);
  });
});
