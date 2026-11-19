# Peridot handoff

## Unified server and offline task display

Settings → Tasks is now a common settings destination for every signed-in user.
It combines durable server work with local offline-download work in the same
active and history lists. Administrators see server tasks; every user sees their
own device downloads, including paused work and retryable failures. Queue, stop,
and retry actions continue to call the correct server or device queue.

The separate Library download panel and standalone download indicator have been
removed. The topbar, Tasks navigation item, and task page use one combined
indicator, and local downloads now receive the same conservative remaining-time
estimate treatment as eligible server tasks.

Verification:

- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- Focused Prettier checks on changed web files and tests

Known limits:

- Browser visual QA at desktop and mobile widths has not been run for the merged
  task list.
- Download workers still run only while the app process is open.

Known checks:

- `pnpm format:check` still reports the pre-existing formatting issue in
  `apps/desktop/src-tauri/tauri.conf.json`; changed task files pass focused
  Prettier checks.

Feature files:

- `apps/web/app/pages/settings/tasks.vue`
- `apps/web/app/components/TaskProgressIndicator.vue`
- `apps/web/app/layouts/settings.vue`
- `apps/web/app/pages/settings/library.vue`
- `apps/web/app/lib/task-progress.ts`

Uncommitted changes:

- Unified task rendering, navigation, indicator, translations, tests, decisions,
  development notes, and this handoff.
- Concurrent task-completion messaging and deployment startup changes were
  preserved.

Next:

- Exercise the merged list at desktop and mobile widths with one running server
  task, one queued server task, and one active offline download.

## Completed tasks with partial errors

Library artwork retrieval and other durable tasks can finish with some items
unprocessed. These executions now remain `completed`, display “Completed with
errors” with warning styling, and explain that some items could not be processed
instead of showing the terminal-failure message. Existing completed rows are
corrected when serialized through the API.

Verification:

- `pnpm --filter @peridot/server test` (196 passing)
- `pnpm --filter @peridot/web test` (259 passing)
- Server and web type checks
- Focused ESLint and Prettier checks

Uncommitted changes:

- Task completion messaging, Settings → Tasks styling, translations, tests,
  decision record, and this handoff.

Next:

- Confirm the updated warning copy and badge styling in the running web client.

## Deployment startup timeout

Deployed startup failed after migrations completed because Fastify's default
10-second plugin limit expired while `@fastify/swagger-ui` initialized. The
same build and OpenAPI routes start successfully locally, so the server now
allows built-in plugins up to 60 seconds during slow container filesystem or CPU
initialization. The timeout remains finite to surface an actual plugin
deadlock.

Verification:

- Server tests (40 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server build`
- Built server production-path startup; `/api/health` and `/api/docs/` both
  returned 200

Uncommitted changes:

- Fastify plugin timeout, OpenAPI regression assertion, decision record, and
  this handoff.
- Concurrent changes in `apps/web/app/lib/task-progress.ts` and
  `apps/web/app/pages/settings/tasks.vue` were present during verification and
  were left untouched.

Next:

- Rebuild the development image, redeploy it, and confirm `/api/health` and
  `/api/docs/` respond after startup.

## Account-synced offline downloads

The “Make my liked titles available offline” switch is now stored per user on the
server. After a successful sign-in or authenticated startup, the web client
verifies the preference before starting automatic liked-item work. An account
without a stored value is initialized once from the device's legacy local choice
when present, otherwise from the enabled default.

All offline saves now enter one persistent device queue: liked songs and albums,
individual tracks, albums, audiobook and podcast collections, and playlists.
Queue state is scoped by server and user in IndexedDB. Work runs one task and one
track at a time, resumes after reload, pauses while disconnected, retries failed
items twice, preserves successful downloads, and supports cancel and manual
retry. The topbar shows active download progress for members and administrators,
and Settings → Tasks exposes active work and recent task history together with
server work.

The browser's direct file-download action remains separate. Successful task
completion now emits the offline-save toast; enqueueing a task does not claim the
file is already available.

Verification:

- `pnpm test` (server 195, web 258, UI 17, desktop 5)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (16-migration graph current)
- `pnpm build` (server, web, desktop, and Android APK assembly)
- `pnpm db:migrate:dev` applied the preference migration and advanced `db`

Known limits:

- Download workers run while the app is open; tasks resume after relaunch but do
  not continue after the process is terminated.
- Automatic liked downloads include liked songs and tracks in liked albums, not
  liked audiobooks or podcast episodes.
- Existing accounts are seeded by the first upgraded device that verifies an
  uninitialized preference. That first device wins if several upgraded devices
  connect concurrently.

Feature files:

- `apps/web/app/lib/download-tasks.ts`
- `apps/web/app/composables/use-offline-download-tasks.ts`
- `apps/web/app/pages/settings/tasks.vue`
- `apps/web/app/components/TaskProgressIndicator.vue`
- `apps/server/src/auth.ts`
- `apps/server/migrations/app/20261119T2112_user_preferences`

Uncommitted changes:

- Account preference contract/API, migration, generated artifacts, and DB ref.
- Device queue implementation, task UI, offline-save integration, translations,
  tests, decision record, development notes, and this handoff.
- Concurrent source-removal, task-estimate, and other in-progress changes remain
  in the worktree and were not reverted.

## Resilient source removal

Source removal is now synchronous rather than a background task. The Sources
page keeps the source row visible with live realtime progress while the server
marks its tracks and catalog projections unavailable in bounded batches. A
successful removal returns counts for unavailable tracks and affected albums and
artists; failures roll back the transaction.

Removed sources retain hidden tombstones and their track IDs. Likes, liked
albums, playlists, queues, play history, catalog artwork, and offline copies are
retained. Normal browse and search exclude unavailable entries; Likes requests
unavailable tracks explicitly. Downloaded tracks remain playable even when the
connected server no longer has the source. Re-adding the same path, URL, or
integration identity restores the same source and track IDs and queues a scan.

The migration backfills catalog source ownership and available album/artist
counts. Source removal clears source configuration and encrypted credentials;
integration credentials must be entered again when the source is re-added.

Verification:

- `pnpm --filter @peridot/server test` (195 passing)
- `pnpm --filter @peridot/web test` (257 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm db:validate` (16-migration graph current)
- `pnpm format:check`
- `pnpm exec turbo run build --filter=!@peridot/android`

Known limits:

- There is no automatic purge for unavailable records.
- Re-adding a source with changed files adds new records for new paths while old
  unavailable IDs remain historical.

Uncommitted changes:

- Source-removal implementation refinements, migration backfills, tests, and
  the decision/development/handoff updates.
- Concurrent authentication, user-preference, task-estimate, and offline
  download-queue work was preserved.

## Task remaining-time estimates

Settings → Tasks now replaces the start timestamp for eligible running tasks
with a localized `<duration> Remaining` label. Estimates require determinate
progress, a valid start time, at least 10 seconds elapsed, at least 5% progress,
and remaining work. The calculation uses average elapsed time per completed item
and rounds durations upward through minutes, hours, and days.

Queued tasks retain their queued timestamp. Running tasks without a reliable
estimate show no timestamp. The settings page refreshes the estimate every 10
seconds and also responds to realtime task updates.

Verification:

- `pnpm --filter @peridot/web exec node --test --test-name-pattern "tasks have a settings view" test/settings-page.test.ts`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint on all changed web and test files
- Focused Prettier check on all changed web, test, and i18n files
- `pnpm --filter @peridot/web test` (248 passing, 5 unrelated pre-existing
  failures in album, like-state, offline-playback, playlist, and source-page
  tests)
- `pnpm lint` reaches unrelated unused-destructuring errors in
  `apps/web/app/pages/settings/sources.vue`.
- `pnpm format:check` reports unrelated formatting changes across the
  in-progress server, contract, and source-removal work.

Known limits:

- The estimate assumes a roughly linear task rate based on average progress
  since the task started.
- Early progress spikes and long stalls can temporarily make the estimate
  optimistic or pessimistic.

Feature files:

- `apps/web/app/lib/task-progress.ts`
- `apps/web/app/lib/relative-time.ts`
- `apps/web/app/pages/settings/tasks.vue`
- `apps/web/i18n/locales/en-US.json`
- `apps/web/test/task-progress.test.ts`
- `apps/web/test/relative-time.test.ts`
- `apps/web/test/settings-page.test.ts`
- `apps/web/test/i18n.test.ts`
- `docs/DECISIONS.md`
- `docs/HANDOFF.md`

Uncommitted changes:

- The task ETA implementation, tests, translations, decision record, and this
  handoff.
- Concurrent authentication, user-preference, source-removal, contract, and
  server-test changes were preserved and not modified by this work.

Next:

- Exercise Settings → Tasks with a long-running scan at desktop and mobile
  widths and compare a few observed completion times with the displayed
  estimate.

## Automatic task retries

Failed durable task executions now return the same task to the queue for up to
two additional attempts. The initial run plus two retries retains the task ID,
source and parent context, while stale progress, details, and failure state are
cleared before each retry. Cancellation, interruption, parent failure, missing
executors, and completed runs with partial errors remain terminal paths.

The `Task.retryCount` migration is additive and defaults existing rows to zero.
Behavioral tests cover exhaustion after three failed executions and recovery when
a retry succeeds.

Verification:

- `pnpm --filter @peridot/server exec tsx scripts/run-tests.ts --test-name-pattern "failed task executions are retried|a failed task completes"` (40 passing)
- `pnpm --filter @peridot/server test` (193 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server db:validate` (14-migration graph current)
- `pnpm lint`
- `pnpm format:check`
- `pnpm --filter @peridot/server build`

The additive migration was applied to the local development database and the `db`
ref was advanced to `8dc83638331d`.

Known limits:

- Retries begin immediately from the durable queue; there is no backoff schedule.
- The retry count is internal and is not exposed in the public task response.

Feature files:

- `apps/server/src/tasks.ts`
- `apps/server/test/tasks.test.ts`
- `apps/server/src/prisma/contract.prisma`
- `apps/server/migrations/app/20261119T2046_retry_failed_tasks`
- `apps/server/migrations/snapshots/8dc83638331d0248c225aa4c02d8fd63cf01fbd1c34c464d02566bdaf8e740c7`
- `apps/server/migrations/app/refs/db.json`

Uncommitted changes:

- The server contract, retry migration and snapshot, DB ref, task service,
  task tests, decisions, development notes, and this handoff.

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

## Android native media controls

The Android bridge now keeps a Media3 `MediaController` connected for the
Capacitor plugin lifetime. Raw playback service intents previously updated the
session but did not publish the Android media player and notification; the
connected controller completes that platform path.

`POST_NOTIFICATIONS` and its one-time runtime prompt were removed. Android media
session notifications are exempt from that permission, and the playback
notification now works with notification permission denied.

Tapping the media notification opens the existing mobile fullscreen player.
The media session uses a `peridot://player` launch intent, and the Android shell
handles both cold and warm launches. Routes that cannot host the shared player
layout, such as Settings, return through Home before opening the player.

Verification:

- `.\gradlew.bat testDebugUnitTest`
- `ANDROID_SERIAL=emulator-5554 .\gradlew.bat connectedDebugAndroidTest`
  (6 passing on API 37, including a cold-launch WebView route check)
- `pnpm --filter @peridot/web test` (251 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/android typecheck`
- `pnpm --filter @peridot/android lint`
- `pnpm --filter @peridot/android build`
- `pnpm version:check`

Known checks:

- `pnpm format:check` reports only the unrelated
  `apps/desktop/src-tauri/tauri.conf.json`.

Feature files:

- `apps/android/android/app/src/main/AndroidManifest.xml`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotMediaPlugin.kt`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotPlaybackService.kt`
- `apps/android/android/app/src/test/java/app/peridot/android/playback/AndroidAutoManifestTest.kt`
- `apps/android/android/app/src/androidTest/java/app/peridot/android/playback/PeridotPlaybackCommandTest.kt`
- `apps/android/android/app/src/androidTest/java/app/peridot/android/playback/PeridotPlayerIntentTest.kt`
- `apps/web/app/lib/mobile-player-route.ts`
- `apps/web/app/plugins/android-shell.client.ts`
- `apps/web/test/mobile-player-route.test.ts`

Uncommitted notification-player follow-up:

- `apps/android/android/app/src/androidTest/java/app/peridot/android/playback/PeridotPlayerIntentTest.kt`
- `apps/web/app/plugins/android-shell.client.ts`
- `apps/web/test/mobile-player-route.test.ts`
- `docs/DECISIONS.md`
- `docs/HANDOFF.md`

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
