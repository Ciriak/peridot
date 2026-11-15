export const PLAYER_STATE_STORAGE_VERSION = 1;
export const PLAYER_STATE_STORAGE_PREFIX = "peridot:player-state";

export interface PlayerStateScope {
  serverAddress: string;
  userId: string;
}

export interface PersistedPlayerState {
  currentTrackId: string | null;
  positionSeconds: number;
  queueTrackIds: string[];
  shuffleEnabled: boolean;
  shuffleTrackIds: string[];
}

export interface PlayerStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredPlayerState extends PersistedPlayerState {
  version: number;
  serverAddress: string;
  userId: string;
}

function isTrackId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTrackIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isTrackId);
}

export function playerStateStorageKey(scope: PlayerStateScope): string {
  return `${PLAYER_STATE_STORAGE_PREFIX}:v${PLAYER_STATE_STORAGE_VERSION}:${encodeURIComponent(scope.serverAddress)}:${encodeURIComponent(scope.userId)}`;
}

export function parsePersistedPlayerState(
  raw: string,
  scope: PlayerStateScope,
): PersistedPlayerState | null {
  try {
    const candidate = JSON.parse(raw) as Partial<StoredPlayerState>;
    if (
      candidate.version !== PLAYER_STATE_STORAGE_VERSION ||
      candidate.serverAddress !== scope.serverAddress ||
      candidate.userId !== scope.userId ||
      (candidate.currentTrackId !== null &&
        typeof candidate.currentTrackId !== "string") ||
      typeof candidate.positionSeconds !== "number" ||
      !Number.isFinite(candidate.positionSeconds) ||
      candidate.positionSeconds < 0 ||
      !isTrackIdList(candidate.queueTrackIds) ||
      typeof candidate.shuffleEnabled !== "boolean" ||
      !isTrackIdList(candidate.shuffleTrackIds)
    ) {
      return null;
    }

    return {
      currentTrackId: candidate.currentTrackId,
      positionSeconds: Math.floor(candidate.positionSeconds),
      queueTrackIds: [...candidate.queueTrackIds],
      shuffleEnabled: candidate.shuffleEnabled,
      shuffleTrackIds: [...candidate.shuffleTrackIds],
    };
  } catch {
    return null;
  }
}

export function readPersistedPlayerState(
  storage: PlayerStateStorage,
  scope: PlayerStateScope,
): PersistedPlayerState | null {
  try {
    const raw = storage.getItem(playerStateStorageKey(scope));
    return raw ? parsePersistedPlayerState(raw, scope) : null;
  } catch {
    return null;
  }
}

export function savePersistedPlayerState(
  storage: PlayerStateStorage,
  scope: PlayerStateScope,
  state: PersistedPlayerState,
): boolean {
  const stored: StoredPlayerState = {
    version: PLAYER_STATE_STORAGE_VERSION,
    serverAddress: scope.serverAddress,
    userId: scope.userId,
    currentTrackId: state.currentTrackId,
    positionSeconds: Math.max(0, Math.floor(state.positionSeconds)),
    queueTrackIds: [...state.queueTrackIds],
    shuffleEnabled: state.shuffleEnabled,
    shuffleTrackIds: [...state.shuffleTrackIds],
  };

  try {
    storage.setItem(playerStateStorageKey(scope), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}
