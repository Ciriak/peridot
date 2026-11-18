import { stat, statfs } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { databasePathFromUrl } from "./migrate-database.js";

export interface VacuumDatabaseResult {
  afterBytes: number;
  beforeBytes: number;
  freeBytes: number;
}

export async function vacuumDatabase(
  databaseUrl = process.env.DATABASE_URL ?? "file:./peridot.db",
): Promise<VacuumDatabaseResult> {
  const databasePath = databasePathFromUrl(databaseUrl);
  const before = await stat(databasePath);
  const filesystem = await statfs(path.dirname(databasePath), { bigint: true });
  const freeBytes = BigInt(filesystem.bavail) * BigInt(filesystem.bsize);
  if (freeBytes < (BigInt(before.size) * 12n) / 10n) {
    throw new Error(
      "VACUUM requires free disk space at least 20% larger than the database.",
    );
  }

  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("VACUUM");
  } finally {
    database.close();
  }
  const after = await stat(databasePath);
  return {
    afterBytes: after.size,
    beforeBytes: before.size,
    freeBytes: Number(freeBytes),
  };
}

async function main(): Promise<void> {
  const result = await vacuumDatabase();
  const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(
    `Vacuumed SQLite database from ${mib(result.beforeBytes)} MiB to ${mib(result.afterBytes)} MiB.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
