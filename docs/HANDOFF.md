# Peridot handoff

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
- `pnpm --filter @peridot/server test` (188 passing)
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
- Live browser visual QA of the task controls and a live Jellyfin instance were
  not used in this implementation run.

## Uncommitted changes

The task cancellation and source-removal code is in current `HEAD` (`b5036d0`).
Only this handoff update remains uncommitted.

## Next

Run the Sources screen against a real Jellyfin server at desktop and mobile
widths, then exercise a full scan, playback, artwork retry, rescan, and removal
cycle. Remove or rebuild the local development database when the pre-existing
source-less tracks should be cleared.

Open Settings â†’ Tasks with one running and one queued task, then verify that the
queued close control removes only that row and the running Stop control retains
its stopped history entry.
