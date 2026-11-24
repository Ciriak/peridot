import { clear, createStore } from "idb-keyval";
import { QUERY_DATABASE, QUERY_STORE } from "./query-persister";

export const CLIENT_STORAGE_RESET_MARKER =
  "peridot:media-connector-client-reset:v1";

const OLD_METADATA_DATABASES = [
  "peridot-web-download-tasks-v1",
  "peridot-web-offline-tracks-v1",
  "peridot-web-offline-catalog-v1",
] as const;

const VERSIONED_LOCAL_STORAGE_PREFIXES = [
  "peridot:player-state:v1:",
  "peridot:search-recents:v1:",
  "peridot:library-settings:v1:",
] as const;

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export async function resetLegacyClientMetadata(
  storage: Storage = window.localStorage,
): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    if (storage.getItem(CLIENT_STORAGE_RESET_MARKER)) return false;
    for (const key of Object.keys(storage)) {
      if (
        VERSIONED_LOCAL_STORAGE_PREFIXES.some((prefix) =>
          key.startsWith(prefix),
        )
      ) {
        storage.removeItem(key);
      }
    }
    await Promise.all([
      clear(createStore(QUERY_DATABASE, QUERY_STORE)),
      ...OLD_METADATA_DATABASES.map(deleteDatabase),
    ]);
    storage.setItem(CLIENT_STORAGE_RESET_MARKER, "1");
    return true;
  } catch {
    return false;
  }
}
