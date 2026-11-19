import { readdir, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  DirectorySearchResponse,
  MessageDescriptor,
  SourceIntegrationOptionResponse,
  SourceKind,
  SourceRemovalProgressResponse,
  SourceResponse,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { message } from "./messages.js";
import type { SourceRow } from "./prisma/models.js";
import type { SourceRemovalRegistry } from "./source-removal.js";
import {
  SourceIntegrationError,
  type SourceIntegrationConfiguration,
  type SourceIntegrationService,
} from "./source-integrations.js";

const DIRECTORY_ENTRY_LIMIT = 100;
const DIRECTORY_SEARCH_RESULT_LIMIT = 100;
const DIRECTORY_SEARCH_SCAN_LIMIT = 25_000;
const DIRECTORY_SEARCH_CONCURRENCY = 12;
const DIRECTORY_SEARCH_TIMEOUT_MS = 8_000;
const DIRECTORY_SEARCH_MAX_DEPTH = 48;
const WINDOWS_SKIPPED_DIRECTORIES = new Set([
  "$recycle.bin",
  "system volume information",
]);
const POSIX_ROOT_SKIPPED_DIRECTORIES = new Set(["dev", "proc", "run", "sys"]);

export interface DirectoryEntry {
  name: string;
  path: string;
}

export class SourceError extends Error {
  constructor(
    fallbackMessage: string,
    readonly messageDescriptor?: MessageDescriptor,
  ) {
    super(fallbackMessage);
    this.name = "SourceError";
  }
}

function toSourceResponse(
  source: SourceRow,
  fileCount = 0,
  lastSyncedAt: Date | null = source.lastSyncedAt,
  removal: SourceRemovalProgressResponse | null = null,
): SourceResponse {
  return {
    id: source.id,
    kind: source.kind as SourceKind,
    name: source.name,
    path: source.path,
    url: source.url,
    configuration: parseSourceConfiguration(source.configuration),
    fileCount,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    removal,
  };
}

function parseSourceConfiguration(
  value: string | null,
): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .slice(0, 64),
    );
  } catch {
    return null;
  }
}

function integrationConfiguration(
  value: unknown,
  fallbackMessage: string,
): SourceIntegrationConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceError(
      fallbackMessage,
      message("api.message.sourceInvalid"),
    );
  }
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .slice(0, 64);
  return Object.fromEntries(
    entries.map(([key, entry]) => [key.trim().slice(0, 80), entry]),
  );
}

export async function ensureDefaultSource(
  database: Database,
  seedLibraryRoot: string,
): Promise<void> {
  const { count } = await database.orm.Source.aggregate((aggregate) => ({
    count: aggregate.count(),
  }));
  if (count === 0) {
    await database.orm.Source.create({
      kind: "path",
      path: seedLibraryRoot,
      position: 0,
    });
  }
}

export async function listSources(
  database: Database,
  removals?: SourceRemovalRegistry,
): Promise<SourceResponse[]> {
  const sources = await database.orm.Source.where((source) =>
    source.removedAt.isNull(),
  )
    .orderBy([
      (source) => source.position.asc(),
      (source) => source.createdAt.asc(),
    ])
    .all();
  return Promise.all(
    sources.map(async (source) => {
      const [tracks, lastCompletedScan] = await Promise.all([
        database.orm.Track.where({
          sourceId: source.id,
          available: 1,
        }).aggregate((aggregate) => ({ count: aggregate.count() })),
        source.lastSyncedAt
          ? Promise.resolve(null)
          : database.orm.Task.where({
              kind: "library_scan",
              status: "completed",
              sourceId: source.id,
            })
              .orderBy((task) => task.completedAt.desc())
              .first(),
      ]);
      return toSourceResponse(
        source,
        tracks.count,
        source.lastSyncedAt ?? lastCompletedScan?.completedAt ?? null,
        removals?.get(source.id) ?? null,
      );
    }),
  );
}

export async function createSource(
  database: Database,
  body: unknown,
  integrations: SourceIntegrationService,
  credentials: CredentialStore,
): Promise<SourceResponse> {
  const value = (body ?? {}) as {
    kind?: unknown;
    name?: unknown;
    path?: unknown;
    url?: unknown;
    apiKey?: unknown;
    libraryId?: unknown;
    collectionType?: unknown;
  };
  const kind = value.kind;
  if (kind !== "path" && kind !== "url" && kind !== "jellyfin") {
    throw new SourceError(
      "Choose a valid source type.",
      message("api.message.sourceInvalid"),
    );
  }
  const name =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : null;
  const { count: position } = await database.orm.Source.where((source) =>
    source.removedAt.isNull(),
  ).aggregate((aggregate) => ({ count: aggregate.count() }));

  if (kind === "path") {
    if (typeof value.path !== "string" || !value.path.trim()) {
      throw new SourceError(
        "Enter a folder for this source.",
        message("api.message.sourceFolderRequired"),
      );
    }
    const resolved = await resolveDirectory(
      typeof value.path === "string" ? value.path : "",
    );
    const duplicate = await database.orm.Source.first({
      kind: "path",
      path: resolved,
    });
    if (duplicate) {
      if (duplicate.removedAt) {
        const restored = await database.orm.Source.where({
          id: duplicate.id,
        }).updateAndCount({
          name,
          path: resolved,
          configuration: null,
          credentialCiphertext: null,
          removedAt: null,
          position,
        });
        if (restored) {
          return toSourceResponse(
            await database.orm.Source.firstOrThrow({ id: duplicate.id }),
          );
        }
      }
      throw new SourceError(
        "This folder is already a source.",
        message("api.message.sourceFolderDuplicate"),
      );
    }
    const source = await database.orm.Source.create({
      kind,
      name,
      path: resolved,
      position,
    });
    return toSourceResponse(source);
  }

  if (kind === "url") {
    const url = normalizeSourceUrl(value.url);
    if (!url) {
      throw new SourceError(
        "Enter a valid HTTP or HTTPS URL.",
        message("api.message.sourceUrlInvalid"),
      );
    }
    const duplicate = await database.orm.Source.first({ kind: "url", url });
    if (duplicate) {
      if (duplicate.removedAt) {
        const restored = await database.orm.Source.where({
          id: duplicate.id,
        }).updateAndCount({
          name,
          url,
          configuration: null,
          credentialCiphertext: null,
          removedAt: null,
          position,
        });
        if (restored) {
          return toSourceResponse(
            await database.orm.Source.firstOrThrow({ id: duplicate.id }),
          );
        }
      }
      throw new SourceError(
        "This URL is already a source.",
        message("api.message.sourceUrlDuplicate"),
      );
    }
    const source = await database.orm.Source.create({
      kind,
      name,
      url,
      position,
    });
    return toSourceResponse(source);
  }

  const configuration = {
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(typeof value.libraryId === "string"
      ? { libraryId: value.libraryId }
      : {}),
    ...(typeof value.collectionType === "string"
      ? { libraryCollectionType: value.collectionType }
      : {}),
  };
  const suppliedCredentials = {
    ...(typeof value.apiKey === "string" ? { apiKey: value.apiKey } : {}),
  };
  let validated;
  try {
    validated = await integrations.validateSource(kind, {
      configuration,
      credentials: suppliedCredentials,
    });
  } catch (error) {
    if (error instanceof SourceIntegrationError) {
      throw new SourceError(error.message, error.messageDescriptor);
    }
    throw error;
  }
  const duplicate = await database.orm.Source.where({
    kind,
    sourceIdentity: validated.identity,
  }).first();
  if (duplicate) {
    if (duplicate.removedAt) {
      const restored = await database.orm.Source.where({
        id: duplicate.id,
      }).updateAndCount({
        name: name || validated.name,
        url: validated.configuration.url ?? null,
        sourceIdentity: validated.identity,
        configuration: JSON.stringify(validated.configuration),
        credentialCiphertext: Object.keys(validated.credentials).length
          ? credentials.encrypt(JSON.stringify(validated.credentials), "source")
          : null,
        removedAt: null,
        position,
      });
      if (restored) {
        return toSourceResponse(
          await database.orm.Source.firstOrThrow({ id: duplicate.id }),
        );
      }
    }
    throw new SourceError(
      "This integration source is already configured.",
      message("api.message.sourceIntegrationDuplicate"),
    );
  }
  const source = await database.orm.Source.create({
    kind,
    name: name || validated.name,
    url: validated.configuration.url ?? null,
    sourceIdentity: validated.identity,
    configuration: JSON.stringify(validated.configuration),
    ...(Object.keys(validated.credentials).length
      ? {
          credentialCiphertext: credentials.encrypt(
            JSON.stringify(validated.credentials),
            "source",
          ),
        }
      : {}),
    position,
  });
  return toSourceResponse(source);
}

export async function discoverIntegrationSources(
  integrations: SourceIntegrationService,
  kind: string,
  body: unknown,
): Promise<SourceIntegrationOptionResponse[]> {
  const value = (body ?? {}) as {
    configuration?: unknown;
    credentials?: unknown;
  };
  const configuration = integrationConfiguration(
    value.configuration,
    "Enter the source integration configuration.",
  );
  const credentials = integrationConfiguration(
    value.credentials,
    "Enter the source integration credentials.",
  );
  try {
    return await integrations.discover(kind, {
      configuration,
      credentials,
    });
  } catch (error) {
    if (error instanceof SourceIntegrationError) {
      throw new SourceError(error.message, error.messageDescriptor);
    }
    throw error;
  }
}

async function resolveDirectory(value: string): Promise<string> {
  try {
    const resolved = await realpath(value.trim());
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new SourceError(
        "Choose an existing folder.",
        message("api.message.sourceFolderMissing"),
      );
    }
    return resolved;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(
      "Choose an existing folder.",
      message("api.message.sourceFolderMissing"),
    );
  }
}

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
  if (url.username || url.password) return null;
  return url.toString();
}

export async function reorderSources(
  database: Database,
  ids: unknown,
): Promise<SourceResponse[]> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new SourceError(
      "Source order must be a list of source ids.",
      message("api.message.sourceOrderInvalid"),
    );
  }
  const existing = await database.orm.Source.where((source) =>
    source.removedAt.isNull(),
  )
    .select("id")
    .all();
  const existingIds = new Set(existing.map((source) => source.id));
  if (
    ids.length !== existingIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !existingIds.has(id))
  ) {
    throw new SourceError(
      "Source order does not match the configured sources.",
      message("api.message.sourceOrderMismatch"),
    );
  }
  await database.transaction(async (transaction) => {
    for (const [index, id] of ids.entries()) {
      await transaction.orm.Source.where({ id }).update({ position: index });
    }
  });
  return listSources(database);
}

export interface PathSource {
  id: string;
  name: string | null;
  path: string;
}

export async function getPathSources(
  database: Database,
): Promise<PathSource[]> {
  const sources = await database.orm.Source.where({ kind: "path" })
    .where((source) => source.removedAt.isNull())
    .all();
  return sources
    .filter((source): source is SourceRow & { path: string } =>
      Boolean(source.path),
    )
    .map((source) => ({
      id: source.id,
      name: source.name,
      path: source.path!,
    }));
}

export async function listDirectoryEntries(
  parent?: string,
): Promise<DirectoryEntry[]> {
  const base = parent?.trim();
  if (!base) return roots();

  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: DirectoryEntry[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    results.push({ name: entry.name, path: path.join(base, entry.name) });
    if (results.length >= DIRECTORY_ENTRY_LIMIT) break;
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

interface SearchQueueItem {
  path: string;
  depth: number;
}

interface SearchMatch extends DirectoryEntry {
  depth: number;
}

export async function searchDirectoryEntries(
  parent: string | undefined,
  query: string,
  signal?: AbortSignal,
): Promise<DirectorySearchResponse> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return { items: [], truncated: false };

  const queue: SearchQueueItem[] = parent?.trim()
    ? [{ path: parent.trim(), depth: 0 }]
    : roots().map((root) => ({ path: root.path, depth: 0 }));
  const matches: SearchMatch[] = [];
  const deadline = Date.now() + DIRECTORY_SEARCH_TIMEOUT_MS;
  let cursor = 0;
  let scannedDirectories = 0;
  let truncated = false;

  while (cursor < queue.length) {
    if (signal?.aborted) {
      truncated = true;
      break;
    }
    if (matches.length >= DIRECTORY_SEARCH_RESULT_LIMIT) {
      truncated = true;
      break;
    }
    if (scannedDirectories >= DIRECTORY_SEARCH_SCAN_LIMIT) {
      truncated = true;
      break;
    }

    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) {
      truncated = true;
      break;
    }

    const batch: SearchQueueItem[] = [];
    while (
      cursor < queue.length &&
      batch.length < DIRECTORY_SEARCH_CONCURRENCY
    ) {
      const item = queue[cursor];
      cursor += 1;
      if (item) batch.push(item);
    }
    scannedDirectories += batch.length;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), remainingTime);
    });
    let resolveAbort: (() => void) | undefined;
    const aborted = signal
      ? new Promise<null>((resolve) => {
          resolveAbort = () => resolve(null);
          signal.addEventListener("abort", resolveAbort, { once: true });
        })
      : undefined;
    const childLists = await Promise.race([
      Promise.all(batch.map((item) => searchableChildren(item.path))),
      timeout,
      ...(aborted ? [aborted] : []),
    ]);
    if (timer) clearTimeout(timer);
    if (resolveAbort) signal?.removeEventListener("abort", resolveAbort);
    if (!childLists) {
      truncated = true;
      break;
    }

    for (const [index, children] of childLists.entries()) {
      const item = batch[index];
      if (!item) continue;
      for (const child of children) {
        if (!isSearchableDirectory(item, child.name)) continue;

        if (child.name.toLocaleLowerCase().includes(normalizedQuery)) {
          matches.push({ ...child, depth: item.depth + 1 });
          if (matches.length >= DIRECTORY_SEARCH_RESULT_LIMIT) {
            truncated = true;
            break;
          }
        }

        if (item.depth + 1 < DIRECTORY_SEARCH_MAX_DEPTH) {
          if (queue.length < DIRECTORY_SEARCH_SCAN_LIMIT) {
            queue.push({ path: child.path, depth: item.depth + 1 });
          } else {
            truncated = true;
          }
        } else {
          truncated = true;
        }
      }
      if (matches.length >= DIRECTORY_SEARCH_RESULT_LIMIT) break;
    }
  }

  matches.sort(
    (left, right) =>
      left.depth - right.depth ||
      left.name.localeCompare(right.name) ||
      left.path.localeCompare(right.path),
  );
  return {
    items: matches.map(({ name, path: entryPath }) => ({
      name,
      path: entryPath,
    })),
    truncated,
  };
}

async function searchableChildren(parent: string): Promise<DirectoryEntry[]> {
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => ({
        name: entry.name,
        path: path.join(parent, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

function isSearchableDirectory(item: SearchQueueItem, name: string): boolean {
  const normalizedName = name.toLocaleLowerCase();
  if (process.platform === "win32") {
    return !WINDOWS_SKIPPED_DIRECTORIES.has(normalizedName);
  }
  return !(
    item.depth === 0 &&
    path.parse(item.path).root === item.path &&
    POSIX_ROOT_SKIPPED_DIRECTORIES.has(normalizedName)
  );
}

function roots(): DirectoryEntry[] {
  if (process.platform === "win32") {
    const drives: DirectoryEntry[] = [];
    for (let code = 65; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (existsSync(drive)) drives.push({ name: drive, path: drive });
    }
    return drives;
  }
  return [{ name: "/", path: "/" }];
}
