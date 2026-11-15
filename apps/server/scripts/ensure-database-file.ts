import { open, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL ?? "file:./peridot.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a file: URL for SQLite");
}

const databasePath = databaseUrl.startsWith("file://")
  ? fileURLToPath(databaseUrl)
  : path.resolve(process.cwd(), databaseUrl.slice("file:".length));

await mkdir(path.dirname(databasePath), { recursive: true });
const databaseFile = await open(databasePath, "a");
await databaseFile.close();
