import { realpath, stat } from "node:fs/promises";

export const DEFAULT_SERVER_PORT = 17430;

export const DESKTOP_WEB_ORIGINS = [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
] as const;

export const MOBILE_WEB_ORIGINS = ["http://localhost"] as const;

export interface ServerConfig {
  databaseUrl: string;
  libraryRoot: string;
  webOrigins: string[];
  credentialEncryptionKey?: string;
}

function requireValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ServerConfig> {
  const databaseUrl = requireValue(environment, "DATABASE_URL");
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: URL for SQLite");
  }

  const configuredRoot = requireValue(environment, "MUSIC_LIBRARY_PATH");
  const libraryRoot = await realpath(configuredRoot);
  const rootStat = await stat(libraryRoot);
  if (!rootStat.isDirectory()) {
    throw new Error("MUSIC_LIBRARY_PATH must reference a directory");
  }

  const configuredOrigins =
    environment.PERIDOT_WEB_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const baseOrigins = configuredOrigins.length
    ? configuredOrigins.map(normalizeOrigin)
    : [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        ...DESKTOP_WEB_ORIGINS,
      ];
  const webOrigins = [...new Set([...baseOrigins, ...MOBILE_WEB_ORIGINS])];

  const credentialEncryptionKey =
    environment.PERIDOT_CREDENTIAL_KEY?.trim() || undefined;

  return {
    databaseUrl,
    libraryRoot,
    webOrigins,
    ...(credentialEncryptionKey ? { credentialEncryptionKey } : {}),
  };
}

function normalizeOrigin(value: string): string {
  if (value === "tauri://localhost") return value;

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("PERIDOT_WEB_ORIGINS must contain valid HTTP(S) origins");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== value.replace(/\/$/, "")
  ) {
    throw new Error("PERIDOT_WEB_ORIGINS must contain HTTP(S) origins only");
  }
  return origin.origin;
}
