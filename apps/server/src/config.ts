import { readFile, realpath, stat } from "node:fs/promises";
import type { UpdateChannel } from "@peridot/contracts";

export const DEFAULT_SERVER_PORT = 17430;
export const DEFAULT_WEB_PORT = 17431;

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
  updates?: UpdateConfig;
}

export interface UpdateConfig {
  channel: UpdateChannel;
  repository: string;
  currentTag: string | null;
  currentCommit: string | null;
  watchtowerUrl?: string;
  watchtowerToken?: string;
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
        "http://127.0.0.1:17431",
        "http://localhost:17431",
        ...DESKTOP_WEB_ORIGINS,
      ];
  const webOrigins = [...new Set([...baseOrigins, ...MOBILE_WEB_ORIGINS])];

  const credentialEncryptionKey =
    environment.PERIDOT_CREDENTIAL_KEY?.trim() || undefined;
  const updates = await loadUpdateConfig(environment);

  return {
    databaseUrl,
    libraryRoot,
    webOrigins,
    ...(credentialEncryptionKey ? { credentialEncryptionKey } : {}),
    updates,
  };
}

async function loadUpdateConfig(
  environment: NodeJS.ProcessEnv,
): Promise<UpdateConfig> {
  const channelValue = environment.PERIDOT_UPDATE_CHANNEL?.trim();
  const channel =
    channelValue && isUpdateChannel(channelValue) ? channelValue : "local";
  if (channelValue && !isUpdateChannel(channelValue)) {
    throw new Error(
      "PERIDOT_UPDATE_CHANNEL must be dev, master, stable, or local",
    );
  }

  const repository =
    environment.PERIDOT_UPDATE_REPOSITORY?.trim() || "Ciriak/peridot";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      "PERIDOT_UPDATE_REPOSITORY must use the owner/repository form",
    );
  }

  const currentTag = environment.PERIDOT_BUILD_TAG?.trim() || null;
  const currentCommit = environment.PERIDOT_BUILD_COMMIT?.trim() || null;
  const watchtowerUrlValue = environment.PERIDOT_WATCHTOWER_URL?.trim();
  let watchtowerToken = environment.PERIDOT_WATCHTOWER_TOKEN?.trim();
  const watchtowerTokenFile = environment.PERIDOT_WATCHTOWER_TOKEN_FILE?.trim();
  if (!watchtowerToken && watchtowerTokenFile) {
    try {
      watchtowerToken = (await readFile(watchtowerTokenFile, "utf8")).trim();
    } catch {
      throw new Error("PERIDOT_WATCHTOWER_TOKEN_FILE could not be read");
    }
    if (!watchtowerToken) {
      throw new Error("PERIDOT_WATCHTOWER_TOKEN_FILE must not be empty");
    }
  }
  let watchtowerUrl: string | undefined;
  if (watchtowerUrlValue) {
    let parsed: URL;
    try {
      parsed = new URL(watchtowerUrlValue);
    } catch {
      throw new Error("PERIDOT_WATCHTOWER_URL must be a valid HTTP(S) URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("PERIDOT_WATCHTOWER_URL must be a valid HTTP(S) URL");
    }
    watchtowerUrl = parsed.toString().replace(/\/$/, "");
  }

  return {
    channel,
    repository,
    currentTag,
    currentCommit,
    ...(watchtowerUrl ? { watchtowerUrl } : {}),
    ...(watchtowerToken ? { watchtowerToken } : {}),
  };
}

function isUpdateChannel(value: string): value is UpdateChannel {
  return (
    value === "dev" ||
    value === "master" ||
    value === "stable" ||
    value === "local"
  );
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
