import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy metadata resets without deleting offline audio caches", async () => {
  const [reset, offlineAudio, settings, androidStore] = await Promise.all([
    readFile(
      new URL("../app/lib/client-storage-reset.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/offline-audio.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/pages/settings/library.vue", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../android/android/app/src/main/java/app/peridot/android/playback/OfflineStore.kt",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(reset, /peridot-web-download-tasks-v1/);
  assert.match(reset, /peridot-web-offline-tracks-v1/);
  assert.match(reset, /peridot-web-offline-catalog-v1/);
  assert.doesNotMatch(reset, /peridot-offline-audio-v1/);
  assert.match(offlineAudio, /peridot-offline-audio-v1/);
  assert.match(offlineAudio, /caches\.delete\(LEGACY_OFFLINE_AUDIO_CACHE\)/);
  assert.doesNotMatch(
    settings,
    /clearLegacyOfflineTracks|Legacy offline audio/,
  );
  assert.match(androidStore, /File\(appContext\.filesDir, "offline"\)/);
  assert.match(
    androidStore,
    /File\(File\(appContext\.filesDir, "offline-v2"\)/,
  );
});
