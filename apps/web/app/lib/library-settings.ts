export const LIBRARY_SETTINGS_STORAGE_VERSION = 1;
export const LIBRARY_SETTINGS_STORAGE_PREFIX = "peridot:library-settings";

export interface LibrarySettingsScope {
  serverAddress: string;
  userId: string;
}

export interface LibrarySettings {
  likedTitlesOffline: boolean;
}

export interface LibrarySettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredLibrarySettings extends LibrarySettings {
  version: number;
  serverAddress: string;
  userId: string;
}

export const DEFAULT_LIBRARY_SETTINGS: Readonly<LibrarySettings> = {
  likedTitlesOffline: true,
};

export function defaultLibrarySettings(): LibrarySettings {
  return { ...DEFAULT_LIBRARY_SETTINGS };
}

export function librarySettingsStorageKey(scope: LibrarySettingsScope): string {
  return `${LIBRARY_SETTINGS_STORAGE_PREFIX}:v${LIBRARY_SETTINGS_STORAGE_VERSION}:${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}`;
}

export function parsePersistedLibrarySettings(
  raw: string,
  scope: LibrarySettingsScope,
): LibrarySettings | null {
  try {
    const candidate = JSON.parse(raw) as Partial<StoredLibrarySettings>;
    if (
      candidate.version !== LIBRARY_SETTINGS_STORAGE_VERSION ||
      candidate.serverAddress !== scope.serverAddress ||
      candidate.userId !== scope.userId ||
      typeof candidate.likedTitlesOffline !== "boolean"
    ) {
      return null;
    }

    return { likedTitlesOffline: candidate.likedTitlesOffline };
  } catch {
    return null;
  }
}

export function readPersistedLibrarySettings(
  storage: LibrarySettingsStorage,
  scope: LibrarySettingsScope,
): LibrarySettings {
  try {
    const raw = storage.getItem(librarySettingsStorageKey(scope));
    return raw
      ? (parsePersistedLibrarySettings(raw, scope) ?? defaultLibrarySettings())
      : defaultLibrarySettings();
  } catch {
    return defaultLibrarySettings();
  }
}

export function savePersistedLibrarySettings(
  storage: LibrarySettingsStorage,
  scope: LibrarySettingsScope,
  settings: LibrarySettings,
): boolean {
  const stored: StoredLibrarySettings = {
    version: LIBRARY_SETTINGS_STORAGE_VERSION,
    serverAddress: scope.serverAddress,
    userId: scope.userId,
    likedTitlesOffline: settings.likedTitlesOffline,
  };

  try {
    storage.setItem(librarySettingsStorageKey(scope), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}
