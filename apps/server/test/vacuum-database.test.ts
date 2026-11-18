import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { vacuumDatabase } from "../scripts/vacuum-database.js";

test("vacuuming reclaims deleted blob pages", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-vacuum-"));
  const databasePath = path.join(root, "peridot.db");
  try {
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE Artwork (data BLOB NOT NULL)");
    database
      .prepare("INSERT INTO Artwork (data) VALUES (?)")
      .run(new Uint8Array(2 * 1024 * 1024));
    database.exec("DELETE FROM Artwork");
    database.close();

    const before = await stat(databasePath);
    const result = await vacuumDatabase(
      `file:${databasePath.replaceAll("\\", "/")}`,
    );
    assert.equal(result.beforeBytes, before.size);
    assert.equal(result.afterBytes, (await stat(databasePath)).size);
    assert.ok(result.afterBytes < result.beforeBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
