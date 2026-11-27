import "../src/instrument.js";
import path from "node:path";
import { reportFatalFailure } from "../src/failure-reporting.js";
import {
  databasePathFromUrl,
  runPendingMigrations,
} from "./migrate-database.js";

const DEFAULT_DATABASE_URL = "file:./peridot.db";

function migrationLogPath(databaseUrl: string): string | undefined {
  try {
    return path.join(
      path.dirname(databasePathFromUrl(databaseUrl)),
      "peridot.log",
    );
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const advanceRefIndex = process.argv.indexOf("--advance-ref");
  const advanceRef =
    advanceRefIndex >= 0 ? process.argv[advanceRefIndex + 1] : undefined;
  if (advanceRefIndex >= 0 && !advanceRef) {
    throw new Error("--advance-ref requires a ref name");
  }

  console.log("Checking for pending database migrations.");
  await runPendingMigrations({
    ...(advanceRef ? { advanceRef } : {}),
  });
}

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

main().catch(async (error: unknown) => {
  const logFilePath = migrationLogPath(databaseUrl);
  await reportFatalFailure(error, {
    message: "Database migration failed.",
    component: "database",
    operation: "migration",
    ...(logFilePath ? { logFilePath } : {}),
    fields: { migrateDev: process.argv.includes("--advance-ref") },
  });
  process.exitCode = 1;
});
