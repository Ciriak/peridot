import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
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

test("automatic media detection migration preserves the detected track type", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const url = databaseUrl(databasePath);
    await runPrismaCommand(
      [
        "db",
        "migrate",
        "--db",
        url,
        "--to",
        "20261117T1421_add_file_log_retention",
        "--no-interactive",
      ],
      true,
    );

    const database = new DatabaseSync(databasePath);
    try {
      database
        .prepare(
          `INSERT INTO "Source"
            ("id", "kind", "classificationMode", "fixedMediaType", "updatedAt")
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "source-id",
          "path",
          "fixed",
          "podcast",
          "2026-11-17T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "Track"
            ("id", "sourceId", "mediaType", "mediaTypeOrigin",
             "detectedMediaType", "detectedMediaTypeOrigin", "mediaTypeOverride",
             "title", "artist", "relativePath", "mimeType", "fileSizeBytes",
             "fileModifiedAt", "available", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "track-id",
          "source-id",
          "podcast",
          "manual",
          "audiobook",
          "embedded",
          "podcast",
          "Detected Track",
          "Detected Author",
          "detected.m4b",
          "audio/mp4",
          1,
          "2026-11-17T00:00:00.000Z",
          1,
          "2026-11-17T00:00:00.000Z",
        );
    } finally {
      database.close();
    }

    await runPendingMigrations({
      databaseUrl: url,
      info: () => undefined,
    });

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const track = migrated
        .prepare(
          `SELECT "mediaType", "mediaTypeOrigin" FROM "Track" WHERE "id" = ?`,
        )
        .get("track-id") as
        { mediaType?: string; mediaTypeOrigin?: string } | undefined;
      assert.equal(track?.mediaType, "audiobook");
      assert.equal(track?.mediaTypeOrigin, "embedded");

      for (const [table, removedColumn] of [
        ["Source", "classificationMode"],
        ["Source", "fixedMediaType"],
        ["Track", "detectedMediaType"],
        ["Track", "detectedMediaTypeOrigin"],
        ["Track", "mediaTypeOverride"],
      ] as const) {
        const column = migrated
          .prepare(`SELECT name FROM pragma_table_info(?) WHERE name = ?`)
          .get(table, removedColumn) as { name?: string } | undefined;
        assert.equal(column, undefined);
      }
    } finally {
      migrated.close();
    }
  });
});

test("artwork cache migration clears embedded images and references", async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const url = databaseUrl(databasePath);
    await runPrismaCommand(
      [
        "db",
        "migrate",
        "--db",
        url,
        "--to",
        "20261117T1914_add_artwork_jobs",
        "--no-interactive",
      ],
      true,
    );

    const database = new DatabaseSync(databasePath);
    try {
      database
        .prepare(
          `INSERT INTO "TrackCover"
            ("createdAt", "data", "hash", "id", "mimeType", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "2026-11-18T00:00:00.000Z",
          new Uint8Array([1, 2, 3]),
          "cover-hash",
          "cover-id",
          "image/png",
          "2026-11-18T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "ArtistImage"
            ("createdAt", "data", "hash", "id", "mimeType", "sourceUrl", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "2026-11-18T00:00:00.000Z",
          new Uint8Array([4, 5, 6]),
          "portrait-hash",
          "portrait-id",
          "image/png",
          "https://example.test/portrait.png",
          "2026-11-18T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "ArtistMetadata"
            ("artistId", "attemptedSignature", "displayName", "imageId",
             "imageProviderKind", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "artist-id",
          "attempted",
          "Artist",
          "portrait-id",
          "discogs",
          "2026-11-18T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "Track"
            ("id", "coverId", "createdAt", "fileModifiedAt", "fileSizeBytes",
             "mimeType", "relativePath", "title", "artist", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "track-id",
          "cover-id",
          "2026-11-18T00:00:00.000Z",
          "2026-11-18T00:00:00.000Z",
          1n,
          "audio/mpeg",
          "track.mp3",
          "Track",
          "Artist",
          "2026-11-18T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "CatalogTrack"
            ("albumArtist", "albumArtistCredits", "albumFolderKey", "artist",
             "artistCredits", "available", "coverId", "id", "normalizedAlbum",
             "normalizedArtist", "normalizedTitle", "title", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "Artist",
          '["Artist"]',
          "folder",
          "Artist",
          '["Artist"]',
          1,
          "cover-id",
          "track-id",
          "",
          "artist",
          "track",
          "Track",
          "2026-11-18T00:00:00.000Z",
        );
      database
        .prepare(
          `INSERT INTO "CatalogAlbum"
            ("artist", "coverId", "coverTrackId", "id", "normalizedArtist",
             "normalizedTitle", "title", "trackCount", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "Artist",
          "cover-id",
          "track-id",
          "album-id",
          "artist",
          "track",
          "Track",
          1,
          "2026-11-18T00:00:00.000Z",
        );
    } finally {
      database.close();
    }

    await runPendingMigrations({
      databaseUrl: url,
      info: () => undefined,
    });

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const track = migrated.prepare('SELECT "coverId" FROM "Track"').get();
      assert.ok(track);
      assert.equal(track.coverId, null);
      const projectedTrack = migrated
        .prepare('SELECT "coverId" FROM "CatalogTrack"')
        .get();
      assert.ok(projectedTrack);
      assert.equal(projectedTrack.coverId, null);
      const album = migrated
        .prepare('SELECT "coverId", "coverTrackId" FROM "CatalogAlbum"')
        .get();
      assert.ok(album);
      assert.equal(album.coverId, null);
      assert.equal(album.coverTrackId, null);
      const artist = migrated
        .prepare(
          'SELECT "attemptedSignature", "imageId", "imageProviderKind" FROM "ArtistMetadata"',
        )
        .get();
      assert.ok(artist);
      assert.equal(artist.attemptedSignature, null);
      assert.equal(artist.imageId, null);
      assert.equal(artist.imageProviderKind, null);
      const coverCount = migrated
        .prepare('SELECT COUNT(*) AS count FROM "TrackCover"')
        .get();
      assert.ok(coverCount);
      assert.equal(coverCount.count, 0);
      const portraitCount = migrated
        .prepare('SELECT COUNT(*) AS count FROM "ArtistImage"')
        .get();
      assert.ok(portraitCount);
      assert.equal(portraitCount.count, 0);
      const coverColumns = migrated
        .prepare(
          "SELECT COUNT(*) AS count FROM pragma_table_info('TrackCover') WHERE name IN ('data', 'mimeType')",
        )
        .get();
      assert.ok(coverColumns);
      assert.equal(coverColumns.count, 0);
      const portraitColumns = migrated
        .prepare(
          "SELECT COUNT(*) AS count FROM pragma_table_info('ArtistImage') WHERE name IN ('data', 'mimeType')",
        )
        .get();
      assert.ok(portraitColumns);
      assert.equal(portraitColumns.count, 0);
    } finally {
      migrated.close();
    }
  });
});
