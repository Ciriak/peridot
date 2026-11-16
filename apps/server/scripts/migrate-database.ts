import {
  chmod,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  assertPrismaSuccess,
  parsePrismaResult,
  runPrismaCommand,
} from "./prisma-cli.js";

const BACKUP_LIMIT = 5;
const DEFAULT_DATABASE_URL = "file:./peridot.db";

interface MigrationStatus {
  currentContract: string | null;
  targetContract: string;
  migrations: Array<{ status?: string | null }>;
}

interface MigrationStatusResult {
  spaces: MigrationStatus[];
}

export interface MigrationRunResult {
  pendingCount: number;
  backupPath: string | null;
}

interface RunMigrationsOptions {
  databaseUrl?: string;
  advanceRef?: string;
  backupDirectory?: string;
  now?: Date;
  info?: (message: string) => void;
}

interface BackupOptions {
  databasePath: string;
  fromContract: string | null;
  toContract: string;
  backupDirectory?: string;
  now?: Date;
}

export function databasePathFromUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: URL for SQLite");
  }

  const value = databaseUrl.startsWith("file://")
    ? fileURLToPath(databaseUrl)
    : decodeURIComponent(databaseUrl.slice("file:".length));
  if (!value) {
    throw new Error("DATABASE_URL must include a SQLite file path");
  }
  return path.resolve(value);
}

async function ensureDatabaseFile(databasePath: string): Promise<void> {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const databaseFile = await open(databasePath, "a");
  await databaseFile.close();
}

async function readMigrationStatus(
  databaseUrl: string,
): Promise<MigrationStatus[]> {
  const output = await runPrismaCommand(
    ["migration", "status", "--db", databaseUrl, "--json"],
    true,
  );
  const envelope = parsePrismaResult<MigrationStatusResult>(output);
  return assertPrismaSuccess(envelope, "prisma migration status").spaces;
}

function backupTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(".", "");
}

function backupName(
  databasePath: string,
  fromContract: string | null,
  toContract: string,
  now: Date,
): string {
  const databaseName = path.basename(databasePath, path.extname(databasePath));
  const from = fromContract?.slice(0, 8) ?? "empty";
  return `${databaseName}-${backupTimestamp(now)}-before-${from}-to-${toContract.slice(0, 8)}.db`;
}

function backupPattern(databasePath: string): RegExp {
  const databaseName = path
    .basename(databasePath, path.extname(databasePath))
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${databaseName}-\\d{8}T\\d{9}Z-before-(?:empty|[a-f0-9]{8})-to-[a-f0-9]{8}\\.db$`,
  );
}

function verifyBackup(backupPath: string): void {
  const snapshot = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const row = snapshot.prepare("PRAGMA integrity_check").get();
    const result = row ? Object.values(row)[0] : null;
    if (result !== "ok") {
      throw new Error(
        `SQLite backup integrity check failed: ${String(result ?? "no result")}`,
      );
    }
  } finally {
    snapshot.close();
  }
}

export async function pruneMigrationBackups(
  backupDirectory: string,
  databasePath: string,
  keep = BACKUP_LIMIT,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const pattern = backupPattern(databasePath);
  const backups = entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const removed: string[] = [];

  for (const fileName of backups.slice(keep)) {
    const backupPath = path.join(backupDirectory, fileName);
    await rm(backupPath, { force: true });
    removed.push(backupPath);
  }
  return removed;
}

export async function createVerifiedBackup({
  databasePath,
  fromContract,
  toContract,
  backupDirectory = path.join(path.dirname(databasePath), "backups"),
  now = new Date(),
}: BackupOptions): Promise<string> {
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await chmod(backupDirectory, 0o700).catch(() => undefined);

  const fileName = backupName(databasePath, fromContract, toContract, now);
  const partialPath = path.join(backupDirectory, `.${fileName}.partial`);
  const backupPath = path.join(backupDirectory, fileName);
  const source = new DatabaseSync(databasePath, { readOnly: true });

  try {
    await backup(source, partialPath, { rate: 100 });
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  } finally {
    source.close();
  }

  try {
    verifyBackup(partialPath);
    await chmod(partialPath, 0o600);
    await rename(partialPath, backupPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }

  await pruneMigrationBackups(backupDirectory, databasePath);
  return backupPath;
}

export async function runPendingMigrations({
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  advanceRef,
  backupDirectory,
  now = new Date(),
  info = console.log,
}: RunMigrationsOptions = {}): Promise<MigrationRunResult> {
  const databasePath = databasePathFromUrl(databaseUrl);
  await ensureDatabaseFile(databasePath);

  const spaces = await readMigrationStatus(databaseUrl);
  const pending = spaces.flatMap((space) =>
    space.migrations.filter((migration) => migration.status === "pending"),
  );
  if (pending.length === 0) {
    info("No pending database migrations.");
    return { pendingCount: 0, backupPath: null };
  }

  const fromContract =
    spaces.find((space) => space.currentContract)?.currentContract ?? null;
  const toContract =
    spaces.find((space) => space.targetContract)?.targetContract ??
    (() => {
      throw new Error("Prisma did not report a target contract");
    })();

  let backupPath: string | null = null;
  if ((await stat(databasePath)).size > 0) {
    backupPath = await createVerifiedBackup({
      databasePath,
      fromContract,
      toContract,
      ...(backupDirectory ? { backupDirectory } : {}),
      now,
    });
    info(`Created pre-migration database backup: ${backupPath}`);
  } else {
    info("Skipping pre-migration backup for a new empty database.");
  }

  const args = ["db", "migrate", "--db", databaseUrl, "--no-interactive"];
  if (advanceRef) args.push("--advance-ref", advanceRef);
  await runPrismaCommand(args);
  info(`Applied ${pending.length} pending database migration(s).`);

  return { pendingCount: pending.length, backupPath };
}

async function main(): Promise<void> {
  const advanceRefIndex = process.argv.indexOf("--advance-ref");
  const advanceRef =
    advanceRefIndex >= 0 ? process.argv[advanceRefIndex + 1] : undefined;
  if (advanceRefIndex >= 0 && !advanceRef) {
    throw new Error("--advance-ref requires a ref name");
  }

  await runPendingMigrations({
    ...(advanceRef ? { advanceRef } : {}),
  });
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
