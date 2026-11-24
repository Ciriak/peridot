import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePersistedPlayerState,
  playerStateStorageKey,
  readPersistedPlayerState,
  savePersistedPlayerState,
  type PlayerStateScope,
  type PlayerStateStorage,
} from "../app/lib/player-storage.ts";

function memoryStorage(): PlayerStateStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test("player snapshots persist the current track, progress, and full queue", () => {
  const storage = memoryStorage();
  const scope: PlayerStateScope = {
    serverAddress: "http://127.0.0.1:17430",
    userId: "user-1",
  };
  const state = {
    currentTrackId: "track-b",
    positionSeconds: 143,
    queueTrackIds: ["track-b", "track-c", "track-a"],
    shuffleEnabled: true,
    shuffleTrackIds: ["track-c", "track-a"],
  };

  assert.equal(savePersistedPlayerState(storage, scope, state), true);
  assert.deepEqual(readPersistedPlayerState(storage, scope), state);
  assert.match(playerStateStorageKey(scope), /^peridot:player-state:v2:/);
  assert.equal(
    readPersistedPlayerState(storage, { ...scope, userId: "user-2" }),
    null,
  );
});

test("invalid or mismatched player snapshots are ignored", () => {
  const scope: PlayerStateScope = {
    serverAddress: "http://localhost:17430",
    userId: "user-1",
  };

  assert.equal(
    parsePersistedPlayerState(
      JSON.stringify({
        version: 1,
        serverAddress: scope.serverAddress,
        userId: "another-user",
        currentTrackId: "track-a",
        positionSeconds: 12,
        queueTrackIds: ["track-a"],
        shuffleEnabled: false,
        shuffleTrackIds: [],
      }),
      scope,
    ),
    null,
  );
  assert.equal(parsePersistedPlayerState("{not-json", scope), null);
  assert.equal(
    parsePersistedPlayerState(
      JSON.stringify({
        version: 1,
        serverAddress: scope.serverAddress,
        userId: scope.userId,
        currentTrackId: "track-a",
        positionSeconds: -1,
        queueTrackIds: ["track-a"],
        shuffleEnabled: false,
        shuffleTrackIds: [],
      }),
      scope,
    ),
    null,
  );
});
