# Peridot handoff

## Automatic duplicate track hiding

Peridot now groups the same recording across all sources and media types,
keeps the best-quality copy visible, and hides the remaining copies through a
dedicated duplicate-detection task. Detection runs after scans and metadata
changes, after source order or membership changes, and during a versioned
startup backfill.

MusicBrainz recording IDs, ISRCs, and AcoustIDs are captured from local tags and
Jellyfin provider IDs. Conservative fallback matching uses normalized title,
artist set, known duration within one second, and collection identity for
audiobooks and podcasts. Canonical copies are selected by lossless status,
bitrate, file size, metadata completeness, source order, import time, and track
ID.

Catalog lists, searches, artwork cards, and collection counts exclude hidden
copies. Existing likes, play events, queue entries, active queue state, and
playlist items move to the canonical copy. `/api/tracks/resolve` returns aliases
so persisted browser queues replace stale hidden IDs.

Verification:

- `pnpm --filter @peridot/server test` (191 passing)
- `pnpm --filter @peridot/web test` (248 passing)
- `pnpm typecheck`
- `pnpm db:validate`
- `pnpm lint`
- `pnpm build`
- `pnpm version:check`

The root `pnpm test` reached successful web and package test results but one
concurrent run hit a Node/V8 loader crash in `jellyfin.test.ts`. Running the
server suite alone passed all 191 tests, including all 11 Jellyfin tests.
`pnpm exec turbo run test --filter=!@peridot/android --concurrency=1` also
completed all six test tasks successfully.

Known limits:

- Fallback matching does not use audio fingerprints, so re-encodes with missing
  recording identities must still agree on title, artists, and duration.
- There is no administrator review or manual unhide workflow; canonical changes
  are automatic.
- Existing local and Jellyfin tracks receive recording identities on their next
  scan because the scan metadata version advanced.

Known checks:

- `pnpm format:check` reports only the unrelated in-progress
  `apps/desktop/src-tauri/tauri.conf.json`.

Uncommitted duplicate work:

- Server contract, migration, scanner, tasks, catalog, API resolution, and
  duplicate service files.
- Shared contracts, task labels, player alias handling, and duplicate tests.

Unrelated in-progress Android media-control changes remain uncommitted in the
same worktree.

## Android native media controls

The Android bridge now keeps a Media3 `MediaController` connected for the
Capacitor plugin lifetime. Raw playback service intents previously updated the
session but did not publish the Android media player and notification; the
connected controller completes that platform path.

`POST_NOTIFICATIONS` and its one-time runtime prompt were removed. Android media
session notifications are exempt from that permission, and the playback
notification now works with notification permission denied.

Verification:

- `.\gradlew.bat testDebugUnitTest`
- `ANDROID_SERIAL=emulator-5554 .\gradlew.bat connectedDebugAndroidTest`
  (4 passing on API 37)
- `pnpm --filter @peridot/android typecheck`
- `pnpm --filter @peridot/android lint`
- `pnpm version:check`

Known checks:

- `pnpm format:check` and the root `pnpm lint` currently fail only in unrelated
  in-progress server/web changes outside this Android fix.

Uncommitted Android changes:

- `apps/android/android/app/src/main/AndroidManifest.xml`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotMediaPlugin.kt`
- `apps/android/android/app/src/test/java/app/peridot/android/playback/AndroidAutoManifestTest.kt`
- `apps/android/android/app/src/androidTest/java/app/peridot/android/playback/PeridotPlaybackCommandTest.kt`

## Eager Jellyfin cover import

Jellyfin scans now prefetch each unique source cover with bounded concurrency and
attach the stored cover before creating or updating its tracks. Tracks sharing an
album cover reuse one fetch and one cached image. Failed or missing eager fetches
remain non-fatal and are retried through the existing artwork job path.

This removes the usual coverless catalog window during Jellyfin imports, while
retaining artwork as best-effort work rather than making a cover failure fail the
source scan.

## Direct built-in source integrations

Peridot now uses trusted built-in source integrations instead of an installable
extension system. Jellyfin is the first implementation and is available directly
from Settings → Admin → Sources without install, enable, restart, or uninstall
state.

The server has a small internal source-integration registry for discovery,
validation, scans, artwork, and audio proxying. Future sources are trusted
compile-time additions: add an implementation, extend the public source-kind
union, register it in `buildApp`, and add the appropriate source form. They do
not need installation persistence or a public SDK.

Source configuration is stored as non-secret JSON on `Source.configuration`;
credentials remain encrypted in `Source.credentialCiphertext`. The removed
installation and generic extension lifecycle fields are not part of the current
schema.

Settings → Sources offers Folder and Jellyfin directly. Jellyfin configuration
uses the server URL and API key to discover libraries, then stores the selected
library and collection type. Scans, artwork retrieval, playback ranges, rescans,
and source removal all use the standard source and task surfaces.

Source removal now deletes source-owned tracks and their catalog projections for
every source kind. Previously this cleanup ran only for built-in integrations,
so removing a folder source left its tracks visible as source-less rows.

## Task cancellation

Settings â†’ Tasks uses a small icon-only close control for queued tasks and keeps
the Stop control for running tasks. Cancelling queued work deletes its task row,
so it is removed from active work and terminal history. Stopping running work
retains a stopped entry in terminal history.

## Verification

- `pnpm --filter @peridot/server exec tsx scripts/run-tests.ts --test-name-pattern "administrators can add and remove path and url sources"` (38 passing)
- `pnpm --filter @peridot/server exec tsx scripts/run-tests.ts --test-name-pattern "queued tasks are removed|administrators cancel queued and running tasks|OpenAPI endpoints publish every documented API route"` (39 passing)
- `pnpm --filter @peridot/web exec node --test test/peridot-client.test.ts test/settings-page.test.ts test/i18n.test.ts` (39 passing)
- `pnpm --filter @peridot/web exec node --test test/settings-page.test.ts` (16 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server exec tsx scripts/run-tests.ts` with
  `PERIDOT_TEST_FILES=jellyfin.test.ts` (11 passing)
- `pnpm --filter @peridot/server test` (188 passing)
- `pnpm lint`
- `pnpm format:check`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web test` (248 passing)
- `pnpm test` (458 passing across contracts, desktop, player, server, UI, and web)
- `pnpm typecheck`
- `pnpm db:validate`
- `pnpm exec turbo run build --filter=!@peridot/android`
- `pnpm build` completed the server and web builds, then stopped at Android
  packaging because the environment has no Java runtime or `JAVA_HOME`.

## Current limits

- Future source integrations are compiled into Peridot releases. User-supplied
  or remotely downloaded runtime code is intentionally unsupported.
- The database was rebuilt from the final contract; no data-transfer migration
  was authored because reset was explicitly allowed.
- Existing source-less tracks are not backfilled or deleted by a migration. The
  five rows already in the local development database remain until removed
  separately.
- Android APK assembly was not verified because `java` is unavailable in this
  environment.
- Eager Jellyfin artwork adds one bounded image-fetch phase per source batch on
  uncached cover changes. Real-server scan timing at large library sizes has not
  been measured.
- Live browser visual QA of the task controls and a live Jellyfin instance were
  not used in this implementation run.

## Uncommitted changes

Eager Jellyfin cover import changes are uncommitted in
`apps/server/src/library-scanner.ts`, `apps/server/test/jellyfin.test.ts`,
`docs/DECISIONS.md`, `docs/DEVELOPMENT.md`, and this handoff.

## Next

Measure first-scan and unchanged-rescan duration against a large real Jellyfin
library, especially albums whose tracks span page boundaries. If duplicate cover
requests appear across pages, carry the fetched-cover map for the full scan rather
than resetting it per 100-item batch.

Run the Sources screen against a real Jellyfin server at desktop and mobile
widths, then exercise a full scan, playback, artwork retry, rescan, and removal
cycle. Remove or rebuild the local development database when the pre-existing
source-less tracks should be cleared.

Open Settings â†’ Tasks with one running and one queued task, then verify that the
queued close control removes only that row and the running Stop control retains
its stopped history entry.
