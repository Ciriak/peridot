import path from "node:path";
import sqlite, { type SqliteClient } from "@prisma/orm-sqlite/runtime";
import { contractFromJson } from "@prisma/orm-sqlite/static";
import type { Contract } from "./prisma/contract.js";
import contractJson from "./prisma/contract.json" with { type: "json" };

export type Database = SqliteClient<Contract>;

const contract = contractFromJson<Contract>(contractJson);

export function sqliteFilePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: URL for SQLite");
  }
  const value = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!value) {
    throw new Error("DATABASE_URL must include a SQLite file path");
  }
  return path.resolve(value);
}

export function createDatabase(databaseUrl: string): Database {
  return sqlite({ contract, path: sqliteFilePath(databaseUrl) });
}
