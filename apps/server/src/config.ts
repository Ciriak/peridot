import { realpath, stat } from "node:fs/promises";
import type { UpdateChannel } from "@peridot/contracts";

export const DEFAULT_PORT = 17430;

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
        "http://127.0.0.1:17430",
        "http://localhost:17430",
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
      "PERIDOT_UPDATE_CHANNEL must be dev, beta, stable, or local",
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

  return {
    channel,
    repository,
    currentTag,
    currentCommit,
  };
}

function isUpdateChannel(value: string): value is UpdateChannel {
  return (
    value === "dev" ||
    value === "beta" ||
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
