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

## Verification

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
- Android APK assembly was not verified because `java` is unavailable in this
  environment.
- Live browser visual QA and a live Jellyfin instance were not used in this
  implementation run.

## Next

Run the Sources screen against a real Jellyfin server at desktop and mobile
widths, then exercise a full scan, playback, artwork retry, rescan, and removal
cycle.
