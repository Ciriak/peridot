import { readdir, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  DirectorySearchResponse,
  JellyfinLibraryResponse,
  MessageDescriptor,
  SourceClassificationMode,
  SourceKind,
  SourceResponse,
} from "@peridot/contracts";
import type { CredentialStore } from "./credential-store.js";
import type { Database } from "./database.js";
import { JellyfinClient, JellyfinError } from "./jellyfin.js";
import {
  mediaTypeValue,
  sourceClassificationMode,
} from "./media-classification.js";
import { message } from "./messages.js";
import type { SourceRow } from "./prisma/models.js";

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
): SourceResponse {
  return {
    id: source.id,
    kind: source.kind as SourceKind,
    classificationMode: sourceClassificationMode(source.classificationMode),
    fixedMediaType: mediaTypeValue(source.fixedMediaType),
    externalLibraryCollectionType: source.externalLibraryCollectionType,
    name: source.name,
    path: source.path,
    url: source.url,
    integration: source.integration,
    externalLibraryId: source.externalLibraryId,
    fileCount,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
  };
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
      classificationMode: "auto",
      path: seedLibraryRoot,
      position: 0,
    });
  }
}

export async function listSources(
  database: Database,
): Promise<SourceResponse[]> {
  const sources = await database.orm.Source.orderBy([
    (source) => source.position.asc(),
    (source) => source.createdAt.asc(),
  ]).all();
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
      );
    }),
  );
}

export async function createSource(
  database: Database,
  body: unknown,
  jellyfin: JellyfinClient,
  credentials: CredentialStore,
): Promise<SourceResponse> {
  const value = (body ?? {}) as {
    kind?: unknown;
    name?: unknown;
    path?: unknown;
    url?: unknown;
    integration?: unknown;
    apiKey?: unknown;
    libraryId?: unknown;
    classificationMode?: unknown;
    fixedMediaType?: unknown;
  };
  const kind = value.kind;
  if (kind !== "path" && kind !== "url" && kind !== "integration") {
    throw new SourceError(
      "Choose a valid source type.",
      message("api.message.sourceInvalid"),
    );
  }
  const name =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : null;
  const classification = parseClassification(value);
  const { count: position } = await database.orm.Source.aggregate(
    (aggregate) => ({ count: aggregate.count() }),
  );

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
      throw new SourceError(
        "This folder is already a source.",
        message("api.message.sourceFolderDuplicate"),
      );
    }
    const source = await database.orm.Source.create({
      kind,
      ...classification,
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
      throw new SourceError(
        "This URL is already a source.",
        message("api.message.sourceUrlDuplicate"),
      );
    }
    const source = await database.orm.Source.create({
      kind,
      ...classification,
      name,
      url,
      position,
    });
    return toSourceResponse(source);
  }

  const integration =
    typeof value.integration === "string"
      ? value.integration.trim().toLowerCase()
      : "";
  if (!integration) {
    throw new SourceError(
      "Choose an integration.",
      message("api.message.sourceIntegrationRequired"),
    );
  }
  if (integration !== "jellyfin") {
    throw new SourceError(
      "Choose a supported integration.",
      message("api.message.sourceIntegrationRequired"),
    );
  }
  const url = normalizeIntegrationUrl(value.url);
  if (!url) {
    throw new SourceError(
      "Enter a valid Jellyfin server URL.",
      message("api.message.jellyfinUrlInvalid"),
    );
  }
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 1_024) {
    throw new SourceError(
      "Enter a Jellyfin API key.",
      message("api.message.jellyfinApiKeyRequired"),
    );
  }
  const libraryId =
    typeof value.libraryId === "string" ? value.libraryId.trim() : "";
  if (!libraryId) {
    throw new SourceError(
      "Choose a Jellyfin library.",
      message("api.message.jellyfinLibraryMissing"),
    );
  }
  const duplicate = await database.orm.Source.where({
    kind: "integration",
    integration,
    url,
    externalLibraryId: libraryId,
  }).first();
  if (duplicate) {
    throw new SourceError(
      "This integration is already a source.",
      message("api.message.sourceIntegrationDuplicate"),
    );
  }
  let sourceName: string;
  let selectedLibraryName: string;
  let selectedLibraryCollectionType: string | null;
  try {
    const info = await jellyfin.validate(url, apiKey);
    sourceName = info.name;
    const libraries = await jellyfin.listLibraries(url, apiKey);
    const library = libraries.find((item) => item.id === libraryId);
    if (!library) {
      throw new SourceError(
        "Choose an available Jellyfin library.",
        message("api.message.jellyfinLibraryMissing"),
      );
    }
    selectedLibraryName = library.name;
    selectedLibraryCollectionType = library.collectionType;
  } catch (error) {
    if (error instanceof JellyfinError) {
      throw new SourceError(error.message, error.messageDescriptor);
    }
    throw error;
  }
  const source = await database.orm.Source.create({
    kind,
    ...classification,
    name: name || selectedLibraryName || sourceName,
    url,
    integration,
    externalLibraryId: libraryId,
    externalLibraryCollectionType: selectedLibraryCollectionType,
    credentialCiphertext: credentials.encrypt(apiKey, "source"),
    position,
  });
  return toSourceResponse(source);
}

export async function listJellyfinLibraries(
  jellyfin: JellyfinClient,
  body: unknown,
): Promise<JellyfinLibraryResponse[]> {
  const value = (body ?? {}) as { url?: unknown; apiKey?: unknown };
  const url = normalizeIntegrationUrl(value.url);
  if (!url) {
    throw new SourceError(
      "Enter a valid Jellyfin server URL.",
      message("api.message.jellyfinUrlInvalid"),
    );
  }
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 1_024) {
    throw new SourceError(
      "Enter a Jellyfin API key.",
      message("api.message.jellyfinApiKeyRequired"),
    );
  }
  try {
    return await jellyfin.listLibraries(url, apiKey);
  } catch (error) {
    if (error instanceof JellyfinError) {
      throw new SourceError(error.message, error.messageDescriptor);
    }
    throw error;
  }
}

export async function updateSourceClassification(
  database: Database,
  id: string,
  value: unknown,
): Promise<SourceResponse> {
  const source = await database.orm.Source.first({ id });
  if (!source) {
    throw new SourceError(
      "Source not found",
      message("api.message.sourceNotFound"),
    );
  }
  if (
    source.kind !== "path" &&
    !(source.kind === "integration" && source.integration === "jellyfin")
  ) {
    throw new SourceError(
      "Only configured folder and Jellyfin sources can change classification.",
      message("api.message.sourceNotRescanable"),
    );
  }
  const classification = parseClassification(
    (value ?? {}) as Record<string, unknown>,
  );
  const updated = await database.orm.Source.where({ id }).update({
    ...classification,
  });
  return toSourceResponse(updated ?? source);
}

function parseClassification(value: {
  classificationMode?: unknown;
  fixedMediaType?: unknown;
}): {
  classificationMode: SourceClassificationMode;
  fixedMediaType: string | null;
} {
  const classificationMode =
    value.classificationMode === undefined
      ? "auto"
      : sourceClassificationMode(value.classificationMode, "auto");
  if (
    value.classificationMode !== undefined &&
    value.classificationMode !== classificationMode
  ) {
    throw new SourceError(
      "Choose automatic or fixed source classification.",
      message("api.message.sourceClassificationInvalid"),
    );
  }
  if (classificationMode === "auto") {
    return { classificationMode, fixedMediaType: null };
  }
  const fixedMediaType = mediaTypeValue(value.fixedMediaType);
  if (!fixedMediaType) {
    throw new SourceError(
      "Choose a valid fixed media type.",
      message("api.message.sourceMediaTypeInvalid"),
    );
  }
  return { classificationMode, fixedMediaType };
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

function normalizeIntegrationUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.toString();
}

export async function deleteSource(
  database: Database,
  id: string,
): Promise<boolean> {
  try {
    await database.orm.Source.where({ id }).delete();
    return true;
  } catch {
    return false;
  }
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
  const existing = await database.orm.Source.select("id").all();
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
  const sources = await database.orm.Source.where({ kind: "path" }).all();
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
