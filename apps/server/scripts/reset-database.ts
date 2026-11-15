import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL ?? "file:./peridot.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a file: URL for SQLite");
}

const databasePath = databaseUrl.startsWith("file://")
  ? fileURLToPath(databaseUrl)
  : path.resolve(process.cwd(), databaseUrl.slice("file:".length));

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  await rm(`${databasePath}${suffix}`, { force: true });
}
