# Peridot handoff

## Immediate logout redirect

Profile logout now clears credentials and opens the login screen before waiting
for server revocation or device cleanup. Query cache, download-task,
offline-audio, and artwork cleanup continue in the background, while the
captured session token is still revoked when the server is reachable.

Verification:

- Focused logout and settings tests under Node 24.22.3 (21 passing)
- Full Web suite under Node 24.22.3 (348 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed Web files
- `git diff --check`

Known limits:

- The logout flow was verified through behavioral and source regression tests,
  not a live authenticated browser session.
- Background cleanup and server revocation failures intentionally do not hold
  the login screen open or surface an error.

Uncommitted changes:

- Final await-compatible typing for the login navigation wrapper and the
  decision and handoff records.
- The logout helper and regression tests were captured by interim commits
  during verification.

Next:

- Confirm in a live signed-in client that Profile → Log out shows the login
  screen immediately, then verify offline and download data finish clearing in
  the background.

## Manual Docker update guidance

Settings → Server now shows an informational alert when a newer server image
is available. The alert provides the Compose commands for pulling the latest
image and recreating the Peridot container.

Verification:

- Focused settings and i18n tests (25 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed Web files

Known limits:

- The alert was not opened through a live authenticated administrator session.

Uncommitted changes:

- Software-update alert, English copy, regression assertions, and this handoff
  section.
- Existing Sentry, desktop packaging, dependency, and settings changes remain
  untouched.

Next:

- Check Settings → Server with an available channel update at desktop and
  mobile widths.

## Server update helper label removed

Settings → Server no longer shows the non-local helper sentence explaining
six-hour checks and rollout behavior. Local builds retain their
channel-update-unavailable explanation. The unused `manualHelp` message and
its source assertion were removed, and the settings regression test now
verifies that the sentence stays absent.

Verification:

- Focused settings and i18n tests under Node 24.22.3 (25 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed Web files
- `git diff --check`

Known limits:

- Typecheck and build used the machine's Node 24.15.0 and emitted the
  repository's unsupported-engine warning. The supported-runtime test run used
  Node 24.22.3.
- The settings page was not opened through a live authenticated admin session.

Uncommitted changes:

- Server update helper removal, its locale and regression-test updates, and
  this handoff section.
- Existing Sentry, NSIS-only desktop, settings, dependency, and documentation
  changes remain untouched.

Next:

- Open Settings → Server on a channel build and confirm only the update status
  and Check for updates action remain in the update footer.

## NSIS-only Windows desktop releases

Windows desktop builds now target only NSIS. `pnpm desktop:build` creates
`apps/desktop/src-tauri/target/release/bundle/nsis/Peridot_0.1.5_x64-setup.exe`
without requiring the release updater private key. Linux and macOS retain their
native Tauri bundle targets.

The desktop release workflow still builds with the signed updater configuration.
It now fails unless the Windows job produces exactly one NSIS installer and one
updater signature, and it fails if an MSI is present. The existing release
artifact upload publishes the installer and `.exe.sig` alongside `latest.json`
and the other platform assets.

Verification:

- Focused desktop Tauri configuration tests (6 passing under Node 24.22.3)
- Focused Web client-update workflow tests (6 passing under Node 24.22.3)
- Focused ESLint and Prettier checks on changed tests, configuration, and
  workflow files
- `pnpm desktop:build` produced `Peridot_0.1.5_x64-setup.exe` (2.52 MiB)
- `git diff --check`

Known limits:

- The local command used Node 24.15.0 and emitted the repository's unsupported
  engine warning. The supported-runtime test runs used Node 24.22.3.
- The release workflow has not run because no push was authorized.
- Local installer builds intentionally omit updater signatures. Signed updater
  artifacts are created only by the release workflow.
- Older ignored bundle artifacts from prior builds remain in the local target
  directory until it is cleaned.

Uncommitted changes:

- Windows and local Tauri configuration files, the `desktop:build` scripts,
  release workflow NSIS verification, regression tests, desktop/development
  documentation, the decision record, and this handoff section.
- Existing Sentry, settings, desktop Cargo lock, and test changes remain
  untouched.

Next:

- Commit on `dev` when authorized, push, and confirm the Windows release job
  publishes `Peridot_<version>_x64-setup.exe` and its `.exe.sig` without an MSI.

## Node 24.22.3 for server CI

The server CI failure was an upstream Node 24.15.0 crash in the native
CommonJS lexer used during ESM-to-CommonJS resolution. All twelve Jellyfin
assertions completed, then Node aborted with
`FATAL ERROR: v8::ToLocalChecked Empty MaybeLocal`. Node 24.14 introduced the
crash and Node 24.19.0 contains the upstream fix.

CI now reads Node 24.22.3 from one workflow-level value. The package engine
range requires `>=24.19.0 <25`, and the production container uses Node 24.22.3.

Verification:

- Full server suite under Node 24.22.3 (242 passing)
- Server application and test TypeScript checks under Node 24.22.3
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `git diff --check`

Known limits:

- The Docker daemon was unavailable, so the updated image was not built
  locally.
- The updated GitHub Actions workflow has not run because no push was
  authorized.

Uncommitted changes:

- Docker uses pnpm 12.23.0 to match the repository's package manager, plus this
  handoff section.

Next:

- Commit the Docker pnpm alignment, push when authorized, and confirm the server
  CI job runs on Node 24.22.3 without the lexer crash.

## Web Nuxt module assertions

The locale and offline-shell tests now verify that their own required Nuxt
modules are registered without pinning the complete module array. Adding the
Sentry module had left both tests failing despite a valid configuration.

Verification:

- Focused i18n and offline-shell tests (26 passing)
- `pnpm --filter @peridot/web test` (347 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed test files
- `git diff --check`

Known limits:

- This is a test-only change; no production build was required.

Uncommitted changes:

- The Nuxt module assertions in `apps/web/test/i18n.test.ts` and
  `apps/web/test/offline-spa.test.ts`, plus this handoff section.

Next:

- Commit the test fix and let CI verify the repository-level checks.

## Sentry CI configuration

Sentry is now configured for the Nuxt web client and Fastify server. The
`peridot-web` and `peridot-server` projects include errors and tracing;
the browser also has masked Session Replay and the server captures warning and
error Pino logs. Automatic user, cookie, header, body, query-parameter,
database-value, and stack-variable collection is disabled.

GitHub Actions repository secrets now contain:

- `SENTRY_DSN`
- `NUXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`

Push builds pass the browser DSN to web, desktop, Android, and Docker artifact
builds. The source-map token is scoped to those build steps and Docker BuildKit
secrets. `SENTRY_DSN` remains runtime-only and must be supplied by the deployment
environment.

Verification:

- `gh secret list --repo Ciriak/peridot` confirmed all three repository secrets
- Focused web Sentry and CI regression tests (8 passing)
- Focused server Sentry tests (2 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server typecheck`
- Web and server production builds
- Web production build with a source-map token uploaded maps to Sentry and
  removed them from the public output
- Web production build without a token completed with source-map upload skipped
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

Known limits:

- The server verification error was triggered, but the browser error could not
  be completed because Computer Use could not verify the active Brave URL.
- The server DSN is stored in GitHub but this repository has no deployment job
  that can inject it into a running container.
- Source-map upload requires a push and the configured repository secrets;
  pull-request builds intentionally omit the upload token.

Next:

- Run the updated push workflow and confirm browser source maps and production
  server events reach both Sentry projects.

## Android Auto browse and collection playback

Android Auto now exposes every browse surface already supported by the native
player: Liked tracks, Albums, Playlists, Artists, and the current Queue. The
head unit may display fewer root tabs, but Peridot no longer limits the tree to
three surfaces.

Liked tracks uses `/api/playlists/liked`, preserving automatic-playlist order.
Playlists are fully paged and exclude the automatic liked playlist. Albums,
playlists, and artists are browsable and playable; collection playback replaces
the queue and starts at the selected track. URI-less Android Auto play requests
are resolved by media ID, unavailable tracks without local audio are omitted,
and thumbnails, durations, media types, and collection context are published to
Media3. Signed-out and expired sessions surface the authentication-expired
result.

Verification:

- Android unit tests (13 passing), including the automotive manifest checks
- Android debug lint and `@peridot/android` TypeScript typecheck
- `:app:connectedDebugAndroidTest` on API 37 (12 passing, including API-backed
  MediaBrowser fixtures)
- `pnpm --filter @peridot/android build` (debug APK assembled)
- `pnpm android:auto` cold launch and reuse paths verified: the launcher starts
  or reuses the AVD, waits for boot, forwards port `5277`, and invokes the DHU.
  With the full Android Auto phone connected, the default command now prefers
  that device, starts the server-connected DHU persistently, and reuses both on
  subsequent runs. The current AVD remains a stub image.
- Repository ESLint and Prettier checks

Known limits:

- Android Auto catalog browsing is online-only; saved audio can play, but
  downloaded collections are not reconstructed as an offline car library.
- The prototype declares five root surfaces and leaves final tab visibility to
  the vehicle or DHU.
- Live Desktop Head Unit and physical-vehicle QA were not completed.
- The APK is not submitted to Google Play; physical vehicles require Android
  Auto developer mode and unknown-source permission.

Uncommitted changes:

- Android Auto Media3 service, catalog API/cache, localized tab resources,
  manifest and MediaBrowser tests, MockWebServer test dependency, Android
  documentation, decision record, and this handoff section.
- Cross-platform `pnpm android:auto` launcher for the Android emulator, ADB port
  forwarding, and Desktop Head Unit.
- Existing documentation edits for the download-client source chooser were
  present and preserved.

Next:

- Install full Android Auto on the AVD, enable unknown sources in developer
  mode, start its head unit server, then use `pnpm android:auto` to verify tab
  navigation, collection playback, next/previous, artwork, and notification
  metadata against a real Peridot server.

## Targeted Jellyfin release imports

Completed external imports now preserve their completed path list when the
destination is Jellyfin. The integration requests recently saved audio with
`fields=Path` and `minDateLastSaved`, then keeps only paths that match the
release. The task denominator is the number of unique completed target files,
not the full Jellyfin library.

The filtered query repeats for up to one minute so Jellyfin can finish noticing
new torrent files. Files still missing after that window and matched unsupported
files count as scan errors. There is no automatic full-library fallback.

Verification:

- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server test` (240 passing)
- `pnpm --filter @peridot/server build`
- `pnpm lint`
- `pnpm format:check`

Known limits:

- Path matching uses normalized case-insensitive suffixes. A service that
  renames downloaded files after qBittorrent completes can still require a
  normal source rescan.
- The focused test uses a simulated Jellyfin response, not a live server.

Uncommitted changes:

- Source-scan targeting, the Jellyfin recent-path query and retry, the focused
  regression test, the decision record, and this handoff section.

Next:

- Run a real release import into a live Jellyfin destination and confirm the
  task reports the completed file count instead of the library count.

## Recently added automatic playlist

Playlists and Home now include a read-only “Recently added” automatic playlist
after Liked tracks. It contains at most 50 available music tracks ordered by
canonical media creation time, newest first, with ID descending as the stable
tie break. Adding another copy of a known recording does not move it, and the
recording disappears from the playlist when no playable copy remains.

The detail surface reuses the standard playlist playback, track search,
per-track likes, and offline-save controls. Rename, delete, add, remove, and
reorder requests return `409 automatic_playlist_read_only`. The generated cover
uses `bg-chart-1/60` for a lighter light-blue field and the adaptive-foreground
Basil `folder-plus-outline` icon. There is no sidebar shortcut.

Verification:

- `pnpm test` (server 239, web 345, UI 19, desktop 5)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate` (3-migration graph current)
- Contract, server, and web production builds

Known limits:

- The lighter cover treatment is covered by source assertions and the
  production build, not live authenticated browser visual QA.

Uncommitted changes:

- The Recently added contract, server projection and read-only routing,
  overview count, cover icon and colors, Home/playlist-detail behavior,
  translations, tests, decision record, and this handoff section.
- Unrelated concurrent work was preserved.

Next:

- Open Home, Playlists, and `/playlists/recent` at desktop and phone widths in
  both themes and confirm the lighter blue cover, 50-track ordering, playback,
  search, per-track likes, and offline-save control.

## Determinate progress circles remain static

The shared `ProgressCircle` now applies its reduced-motion-safe spin only while
progress is indeterminate. A set value, including `0`, keeps the arc fixed at
that percentage while retaining the determinate transition when the value
changes.

Verification:

- `pnpm dlx node@24.15.0 --test test/*.test.ts` from `packages/ui`
  (19 passing)
- `pnpm dlx node@24.15.0 --test test/*.test.ts` from `apps/web`
  (344 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed UI and test files
- `git diff --check`

Known limits:

- The state distinction is covered by rendered component assertions, not a live
  authenticated task or offline-download run.

Uncommitted changes:

- Conditional `ProgressCircle` rotation, its regression assertion, decision
  record, and this handoff section.

Next:

- Open Settings → Tasks with a partially complete task and confirm the progress
  arc updates without rotating.

## Overview graph fit includes default padding

The initial Vue Flow overview fit now uses shared `32px` padding around all
nodes instead of the negligible `0.35px` value. The automatic fit and the
post-initialization fit use the same options, keeping the graph inset when it
first loads without reducing the available panning or zoom range.

Verification:

- Focused overview settings regression test
- Focused Prettier and ESLint checks on the changed Web files
- `git diff --check`

Uncommitted changes:

- Overview initial fit padding, its shared configuration and regression
  assertions, and this handoff section.
- Concurrent catalog, layout, task, virtual-scroll, test, and documentation
  changes were present and were left untouched.

Next:

- Open `/settings/overview` at desktop and phone widths and confirm the initial
  fitted graph has a small, even inset from the flow container edge.

## Library settings omit legacy offline audio cleanup

Settings → Library no longer renders the legacy offline audio cleanup card,
removal button, or page-local cleanup state. Retained browser
`peridot-offline-audio-v1` and Android `files/offline` audio remain untouched,
so removing the option does not delete device-local copies.

Verification:

- Focused legacy cache regression test under Node 24.15.0 (1 passing)
- Web test suite under Node 24.15.0 (344 passing)
- Web typecheck under Node 24.15.0
- Web production build under Node 24.15.0
- Focused ESLint and Prettier checks on the changed Web and test files
- `git diff --check`

Known limits:

- The removed card was verified through source-level regression coverage and a
  production build, not live authenticated browser QA.
- The underlying web and Android legacy-cleanup helpers remain available but
  have no Settings entry point.

Uncommitted changes:

- Legacy offline audio cleanup removal from Settings → Library, its regression
  assertion, decision and development notes, and this handoff section.
- Concurrent catalog, sidebar, layout, task, virtual-scroll, test, and handoff
  changes were present during this work and were left untouched.

Next:

- Open Settings → Library at desktop and phone widths and confirm the legacy
  cleanup card is absent while the liked-titles offline preference remains.

## Download progress labels omit file counts only during transfers

Active release-import downloads now show percentage-only progress, such as
`Downloading · 0%`. Determinate progress for scans, metadata work, artwork, and
release imports that have reached the library-ingestion stage retain the
`(completed of total)` file count.

Verification:

- Focused Web task-progress, i18n, settings, and offline-shell tests
  (62 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed Web and test files
- `git diff --check`

Known limits:

- The scoped label was verified through behavioral tests and static checks, not
  against a live qBittorrent transfer.

Uncommitted changes:

- Release-import download progress formatting, its focused regression coverage,
  and this handoff section.
- Concurrent catalog, sidebar, layout, virtual-scroll, test, and handoff changes
  were present during this work and were left untouched.

Next:

- Observe the task tooltip during a live release import and confirm the count
  returns when the task advances to library ingestion.

## Virtual card placeholders use measured row heights

Virtual card rows now register their measured height even when they contain
placeholders. Artist preloader rows previously used the `92px` estimate without
the rendered row gap, so consecutive skeleton rows overlapped and their spacing
did not match populated cards. The artists catalog also renders one card per
phone-width row.

Verification:

- Focused Web virtual-scroll regression test
- `pnpm --filter @peridot/web test` (344 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused Prettier and `git diff --check`
- Live desktop paging: populated and placeholder artist rows both measured
  `105.6px` with the same gap
- Live phone-width paging: one-column artist and skeleton rows retained the same
  rendered gap

Uncommitted changes:

- The shared virtual card measurement fix, its regression assertion, and this
  handoff section.
- Concurrent catalog-card, sidebar, Web test, and handoff changes were present
  during this work and were left untouched.

Next:

- Confirm the same paged-list behavior on other card surfaces during normal
  catalog use.

## Empty playlist cards hide the unavailable icon

Catalog cards and rows no longer render a playlist playback control when the
playlist has zero tracks. Previously the unavailable fallback appeared as a
cloud-off icon over empty cards, including Liked tracks. Playlists with tracks
still use the existing unavailable state when none of those tracks can play.

Verification:

- Focused card, playlist, and album tests (13 passing)
- `pnpm --filter @peridot/web test` (344 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed Web and test files
- `git diff --check`

Uncommitted changes:

- The empty-playlist playback-control condition, its regression assertion, and
  this handoff section.
- Concurrent sidebar swipe, layout, and test changes were present during
  verification and were left untouched.

Next:

- Open Liked tracks with zero liked tracks at desktop and phone widths, then
  confirm the card cover has no playback overlay.

## Mobile sidebars omit close buttons

The main and settings navigation sidebars no longer render a mobile close
button. The existing backdrop tap, menu toggle, route change, and swipe-to-close
paths remain available.

Verification:

- Live main-sidebar DOM inspection confirmed no close control remains.
- Focused sidebar swipe and closure regression test.
- Focused ESLint and Prettier checks on the changed files.

Uncommitted changes:

- Main and settings sidebar close-button removal, regression coverage, and this
  handoff section.

## Mobile fullscreen player keeps a square cover

Each fullscreen carousel panel now fills its slide width. This prevents the
artwork from collapsing against its height and keeps the right-aligned like
control aligned with the carousel edge. The artwork, title, and artists form one
vertically centered group within the carousel. Balanced edge slots keep the
metadata horizontally centered while the like control occupies the right slot.
Adjacent previews use a contents wrapper so they participate in the same flex
height as the active track instead of collapsing their artwork.

Live verification measured a centered `384 × 384` cover at `768 × 1024`; the
content group center differed from the carousel center by less than one pixel,
and the like control's right edge matched the carousel's right edge. A
`375 × 667` check confirmed the smaller square artwork and full-width panel
basis. At that phone width, previous, active, and next slides each measured a
`288 × 288` cover with the same metadata baseline. The focused mobile-player
assertions now cover the panel sizing, centered group, and adjacent-slide
structure.

Verification:

- `pnpm --filter @peridot/web exec node --test test/mobile-player.test.ts`
  (2 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed files
- `git diff --check`
- Live phone-width browser measurement and visual inspection

Uncommitted changes:

- The fullscreen carousel panel width fix, its regression assertion, and this
  handoff section.

## Connector discovery honors standard web ports

Scheme-qualified connector address hints without an explicit port now probe
HTTPS `443` and HTTP `80` instead of replacing the URL's effective port with the
connector default. Scheme-less hosts still use advertised connector ports, and
explicit ports and reverse-proxy paths remain unchanged.

This fixes discovery of `https://jf.cyriaque.dev`, which is served through a
reverse proxy on `443` rather than Jellyfin's direct port `8096`. Live discovery
returned `Raspberry Pi Media` on Jellyfin `10.11.8`.

Verification:

- Focused connector discovery suite under Node 24.15.0 (6 passing)
- Live Jellyfin discovery from `https://jf.cyriaque.dev`
- `pnpm --filter @peridot/server typecheck` under Node 24.15.0
- `pnpm --filter @peridot/server test` (238 passing under the machine's Node 26.13.0)
- Focused ESLint and Prettier checks
- Node 24.15.0 full-suite rerun reached `jellyfin.test.ts` and then hit the
  repository's existing `v8::ToLocalChecked Empty MaybeLocal` module-loader
  crash; all connector discovery tests passed during that run.

Uncommitted changes:

- Connector address-hint port selection, focused regression coverage, decision
  record, development note, and this handoff section.

## Release indexer save without a live connection

Release indexers can now be created while their Torznab feed is unreachable.
Saving validates the URL, credential shape, and configured download-client
settings without performing a network request. New or restored feeds default to
generic Torznab search with audio category `3000`.

The release-indexer dialog includes an explicit Test connection action.
`POST /api/admin/release-indexers/test` checks the currently entered URL and
returns the advertised search mode and audio categories. Testing a saved
indexer with a blank API key reuses its encrypted stored credential. Connection
failures stay visible in the dialog and do not block saving.

Verification:

- `pnpm --filter @peridot/server test` (237 passing)
- `pnpm --filter @peridot/web test` (344 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server build`
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/contracts build`
- `pnpm db:validate` (3 migrations, current at `a9baeceeeaa3`)
- `pnpm lint`
- `pnpm version:check`
- Focused Prettier checks on the changed files
- `git diff --check`

Known limits:

- Live authenticated browser QA with an unreachable feed was not completed.
- A successful test reports advertised capabilities but does not mutate saved
  configuration; feeds saved without a test use the generic `search`/`3000`
  fallback.
- Full-repository Prettier still reports only the concurrently modified
  `apps/desktop/src-tauri/tauri.conf.json`, which was preserved.

Uncommitted changes:

- Release-indexer local save validation, test endpoint and contract, dialog test
  action and feedback, OpenAPI schema, focused tests, decision record,
  development note, and this handoff section.
- Concurrent download-client, overview, migration, version, and desktop changes
  remain present and were preserved.

## Overview connector relationship links

The platform overview now follows configured data relationships. Download
clients link to their Destination source, and release indexers link to their
selected download client. Library sources and metadata providers continue to
link to Peridot. An indexer without a client and a legacy client without an
active Destination source retain the direct Peridot fallback link.

Download-client edges now include every configured Destination source kind,
including Jellyfin and folder sources. Node handles and edges share one
destination mapping so a valid target source cannot render without its link.

Verification:

- Focused overview flow, settings, and server overview tests (16 passing)
- Focused overview flow regression tests (10 passing)
- `pnpm --filter @peridot/web test` (344 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server build`
- `pnpm --filter @peridot/web build`
- `pnpm db:validate`
- `pnpm lint`
- Focused Prettier checks on the changed files

Known limits:

- Live authenticated visual QA of the crossing relationship edges was not
  completed.
- The full server suite passes 229 tests but the Jellyfin file aborts with the
  repository's existing Node/V8 CommonJS loader crash; an isolated rerun also
  aborts after five passing Jellyfin tests.
- Full-repository Prettier currently reports the concurrently modified desktop
  Tauri configuration, which was preserved.

Uncommitted changes:

- Overview relationship IDs, graph edge and handle changes, fallback behavior,
  focused regression tests, development note, decision record, and this handoff
  section.
- Concurrent download-client, migration, overview-layout, and version changes
  remain present and were preserved.

## Download client Destination source and optional connection test

Download clients now own the Destination source selector. Release indexers only
choose the client, category, tags, and save-path behavior. The selector lists
every active library source by name, falling back to its path or kind. Jellyfin
destinations import by running the configured Jellyfin source scan after the
download completes. The chooser uses a rich listbox that shows each source's
folder or Jellyfin icon beside its name in both the selected value and options.

Saving a download client no longer contacts qBittorrent. Administrators can
create or edit a client before its service is reachable. Discovery remains
optional, and the authenticated test endpoint remains available for an explicit
connection check. Save still validates the URL, credential shape, and active
Destination source.

The data-preserving migration copies an existing linked indexer destination to its
download client before dropping the indexer field. If multiple indexers for one
client disagree, the earliest ordered indexer wins.

Verification:

- Focused Torznab integration-source destination tests (8 passing)
- `pnpm --filter @peridot/web test` (344 passing)
- Migration preservation test applies the new migration to a database at the
  prior contract and confirms the linked client receives its indexer destination
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server build`
- `pnpm --filter @peridot/web build`
- `pnpm db:validate` (3 migrations, current at `a9baeceeeaa3`)
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`

Known limits:

- Live authenticated browser QA with an intentionally unreachable qBittorrent
  client was not completed.
- A Jellyfin Destination source performs the normal full Jellyfin source scan
  after transfer completion. It does not map qBittorrent relative file paths to
  Jellyfin item IDs, so the release status may not expose an exact play-imported
  media list even though changed Jellyfin media feed downstream metadata work.

Uncommitted changes:

- Download-client Destination source ownership, schema and data migration,
  optional live connection validation, focused server/web tests, decision
  record, development note, README clarification, and this handoff section.
- Concurrent overview and other in-progress changes remain present and were
  preserved.

Next:

- Add a client with an unreachable URL, confirm it persists and lists the chosen
  Destination source, then make the service reachable and verify categories and
  tags load for indexer transfer settings.

## Release indexer action parity

Release indexers now match the download-client toolbar and saved-row actions.
The toolbar uses the compact settings heading and a plus-icon Add action.
Configure is a cog-only edit button, while destructive removal is available
only from the row's three-dot menu and requires confirmation.

Verification:

- `pnpm --filter @peridot/web test` (340 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed page, test, and docs

Known limits:

- Live authenticated browser QA was not completed.

Uncommitted changes:

- Release-indexer toolbar and action controls, focused test coverage, development
  notes, and this handoff section.
- Concurrent overview and other in-progress changes remain present and were
  preserved.

## Settings platform overview

The account avatar and `/settings` now open `/settings/overview`. Profile remains
a separate settings destination. Overview is a full-workspace, read-only Vue
Flow 2 graph with Peridot centered, a library-source subflow on the left, and a
metadata-provider subflow on the right. A download-client subflow sits below,
with outbound animated edges from Peridot to each client. Release indexers form
a bottom-right subflow with inbound links back to Peridot. The subflows are
visual backgrounds; each card keeps its own animated bezier link. Cards show
icons, names, safe address labels, basic counts/type, and static-or-animated
status dots. The central card uses the default card background with a primary border;
it shows available album, playlist, podcast, and audiobook totals. Only online
dots pulse; disabled/unknown states stay static. Metadata-provider cards show
only icon, name, and status. After node initialization the graph explicitly
fits with padding. Panning and wheel/pinch zoom remain available, while node,
link, and connection editing stay disabled.
Double-clicking a card opens its matching settings page; subflow backgrounds do
not navigate.

`GET /api/overview` is authenticated for every signed-in user and returns only
sanitized summary data. Folder and Jellyfin source checks run server-side with a
short cache and timeout. Metadata cards expose MusicBrainz/Discogs service
names and active/unknown/disabled state without returning configuration,
credentials, addresses, or counts. Download-client cards expose only their saved
name and qBittorrent host; they remain `unknown` until a live probe is added.
Release-indexer cards expose their saved name and Torznab host, also with
`unknown` status until a live probe is added.

Verification:

- `pnpm --filter @peridot/web test` (340 passing)
- Focused server Jellyfin tests (16 passing)
- Focused server overview and OpenAPI tests (8 passing)
- Server and web typechecks
- Server and web production builds
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (2-migration graph current)

Known limits:

- The full server suite reached 224 passing tests but the known Node/V8 loader
  crash terminated `jellyfin.test.ts`; rerunning Jellyfin alone passed.
- Metadata-provider dots represent enabled and required configuration state, not
  a live outbound MusicBrainz or Discogs request.
- Download-client dots remain unknown because the overview does not probe
  qBittorrent yet.
- Computer Use could not verify the active Brave URL, so live post-fix visual QA
  was not completed. Handle orientation is covered by focused geometry tests.

Uncommitted changes:

- Overview contracts, API route and health service, Vue Flow page/components,
  navigation changes, dependency lockfile, translations, tests, and
  decision/development/handoff documentation.

Next:

- Reload `/settings/overview` at desktop and phone widths and confirm all three
  subflow backgrounds contain their cards, download links run outward, graph
  padding is balanced, and panning/zoom remain available without moving cards.

## Saved web audio starts before streaming

The web/desktop player now looks up a saved audio blob before requesting a
playback token or opening the server audio URL. Saved tracks therefore use
Cache Storage while the server is connected instead of waiting on the network
and falling back only after a stream error. Missing or unreadable cache entries
fall back to streaming when connected; disconnected and unavailable states
remain offline-only. Android's existing local-file-first playback path is
unchanged.

Verification:

- Focused offline playback, offline shell, and player tests (27 passing)
- `pnpm --filter @peridot/web test` (333 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed Web and test files

Known limits:

- Live playback QA was not completed against a real saved track and slow audio
  endpoint.
- Starting a saved track still reads and decodes the cached blob, so a brief
  loading state remains possible even though no audio network request is made.

Uncommitted changes:

- Shared playback-source policy, saved-before-stream player ordering, focused
  regression coverage, decision record, and this handoff section.

Next:

- Play a saved track while keeping the server reachable, confirm the audio
  endpoint is not requested, then clear that cache entry and confirm connected
  playback falls back to streaming.

## Liked tracks header offline toggle

The liked-tracks playlist header now shows the account-level “Make my liked
titles available offline” switch instead of the automatic playlist's separate
offline button. The switch is grouped into one compact pill with the shared
Basil cloud-download icon and a short tooltip explaining automatic offline
downloads. Hovering or focusing anywhere on the pill opens the tooltip. The icon
uses the larger control size, and the muted pill plus an explicit primary-token
checked state keep the toggle visible in the dark header. It reads and writes
the existing account preference, so it stays synchronized with Settings →
Library and automatically starts or stops the established liked-title download
flow.

Manual playlists keep their playlist-specific offline save button. The new
header switch is disabled while the preference is unverified or saving and
while the server is disconnected, matching the Library setting.

Verification:

- Focused playlist and library-settings tests (16 passing)
- `pnpm --filter @peridot/web test` (330 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed Web and test files

Known limits:

- The header switch was verified through behavioral source assertions and the
  production build, not an authenticated browser session.

Uncommitted changes:

- Liked-tracks header toggle component, playlist detail wiring, focused test
  coverage, decision record, and this handoff section.
- Concurrent catalog virtualization, search, player, and other in-progress
  changes remain present and were preserved.

Next:

- Open Liked tracks at desktop and phone widths, toggle the header switch, then
  confirm Settings → Library shows the same value and the download task starts
  or stops accordingly.

## Catalog update badge across browse categories

Albums, artists, audiobooks, and podcasts now render the same localized outline
badge beside their count while a library scan is running. The badge is owned by
one shared component, so the task query, spinner, accessibility announcement,
and running-only visibility rule cannot drift between the four catalog pages.

Verification:

- Focused task, album, artist, category, count, badge, and i18n tests (30
  passing)
- `pnpm --filter @peridot/web test` (329 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed app and test files

Known limits:

- The badge was verified through behavioral tests and the production build, not
  an authenticated browser session with a live scan.

Uncommitted changes:

- Shared catalog update badge, four-page wiring, running-scan helper, translations,
  focused regression tests, decision record, and this handoff section.
- Concurrent catalog virtualization, search, player, and other in-progress
  changes remain present and were preserved.

Next:

- Start a long library scan and confirm the pill appears and clears on Albums,
  Artists, Audiobooks, and Podcasts at desktop and phone widths.

## Search results display at most 50 items

Library search now caps the combined All view at 50 rendered results by
allocating the budget across tracks, albums, and playlists in display order.
Each category filter and the filtered External sources list are independently
capped at 50. Search loads one 50-item page per local result type and no longer
auto-paginates.

Verification:

- Focused search, pagination, count, and virtual-scroll tests (17 passing)
- `pnpm --filter @peridot/web test` (328 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on all changed Web and test files

Known limits:

- The capped search surfaces were verified through behavioral tests and the
  production build, not an authenticated desktop or phone browser session.

Uncommitted changes:

- Search display-budget helpers, page wiring, regression tests, the decision
  record, and this handoff section.
- Unrelated in-progress catalog, playlist, player, and desktop changes were
  present in the worktree and left untouched.

Next:

- Run a broad query in the browser at desktop and phone widths, then confirm
  the All view stops at 50 and each category filter and External list stops at
  50 after filtering.

## Counted virtual catalog surfaces

Albums, artist lists, audiobook lists, podcast lists, playlists, and artist
album sections now use a shared offset-window loader. Each grid reserves the
complete result count, fetches only the visible page neighborhood, and renders
matching card placeholders until loaded. Shared track tables now render reduced-
motion-aware skeleton rows for unloaded positions, which covers album, artist,
audiobook, and podcast track sections.

Playlist track rows now use the main-scroll virtualizer while keeping drag
reordering. Drops map through visible neighboring entry IDs to the complete
playlist order. No search-page wiring was changed by this work.

Track-table placeholders now stop as soon as pagination is exhausted. The
virtual count falls back to the actual loaded rows when no next page exists, so
a filtered or stale total cannot leave skeleton rows below the final track.

Verification:

- `pnpm --filter @peridot/web test` (330 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- `pnpm format:check`
- Focused virtual-scroll, playlist, artist, album, media-category, context-menu,
  list-search, and styling tests

Known limits:

- Live authenticated visual QA at desktop and phone widths was not completed.
- Playlist detail still fetches every entry because its existing detail response
  is not paged; only its rendered row count is virtualized.
- Dragging across a rapidly changing virtual viewport has behavioral coverage
  for neighbor mapping but has not been exercised on a long playlist in a live
  browser.

Uncommitted changes:

- Shared virtual catalog loader, card placeholders, track-row placeholders,
  exhausted-pagination placeholder clamping, playlist-row virtualization and
  reorder mapping, page wiring, tests, decision record, and this handoff section.
- Concurrent mobile-player layout changes remain present and were preserved.
- Separate concurrent mobile-player, search-result budget, and task-progress
  changes remain present and were left untouched.

Next:

- Exercise large artist, audiobook, podcast, and playlist collections while
  jumping through the main scrollbar, then drag entries across several virtual
  viewport positions.

## Mobile fullscreen player fits without scrolling

The mobile fullscreen player no longer uses a vertical scroll container. Its
header, timeline, and transport controls keep their height while the artwork
carousel fills the remaining viewport space. The square cover now shrinks with
that space and caps at `max-h-72`, growing to `max-h-96` at the `sm` breakpoint.

Verification:

- `pnpm --filter @peridot/web exec node --test test/mobile-player.test.ts`
  (2 passing)
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed player and test files
- The latest full web suite passes with the concurrent virtual-catalog changes
  (330 passing), and the web typecheck passes.

Known limits:

- Live phone-width visual QA was not completed because Computer Use could not
  verify the active browser URL.

Uncommitted changes:

- Mobile fullscreen flex layout, responsive square artwork sizing, focused
  regression assertions, this decision, and this handoff.
- Concurrent virtual-catalog changes in other web components, pages, and
  composables were present during verification and left untouched.

## Progressive source-neutral media discovery

Folder scans, Jellyfin scans, and targeted release imports now share a
committed-media catalog boundary. Folder discovery streams bounded batches
while later directories are still being enumerated, Jellyfin retains its
500-item pages and 100-record transactions, and the catalog materializes after
at most 500 unique committed media IDs or the final partial batch.

Each materialization transaction reconciles `CatalogMedia`, album and artist
summaries, artist links, card search terms, and pending projection state before
publishing one catalog revision. Albums, artists, and search are usable while a
scan is running. Completed batches remain visible if a later traversal or remote
request fails. The full catalog projection now runs only as a recovery fallback
when media remain pending.

The Albums page shows a localized outline badge with the shared spinner beside
its count while a library scan is running.

Verification:

- `pnpm --filter @peridot/server test` (227 passing)
- `pnpm --filter @peridot/web test` (324 passing)
- `pnpm exec turbo run test --filter=!@peridot/android --concurrency=1`
  (contracts, desktop, player, server, UI, and web successful)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (current at `7fb2e91df85d`, two migrations)
- `pnpm build` (server, web, desktop, and Android debug build)

The normal parallel `pnpm test` run hit the repository's previously observed
Node/V8 loader crash while the Jellyfin test file overlapped with other package
workers. The same aggregate suite passed with Turbo concurrency set to one, and
the server suite also passed independently.

Known limits:

- Folder progress is indeterminate until breadth-first enumeration completes.
- Interrupted scans still restart traversal; this milestone does not persist a
  page checkpoint.
- Album and artist counts are provisional and may increase while indexing.
- A storage-heavy synthetic 70k-item timing benchmark was not added.
- The Albums-page hint was verified through behavioral tests and the production
  build, not an authenticated browser session.

Uncommitted changes:

- Shared scan batching and incremental catalog materialization.
- Folder streaming discovery and catalog reconciliation for unavailable copies.
- Progressive Jellyfin and release-import batches.
- Albums-page indexing badge, translation, tests, and scan documentation.

Next:

- Exercise an authenticated large Jellyfin scan and confirm that albums appear
  after the first page while the task remains running.
- Measure first-album latency, peak memory, SQLite busy errors, and total scan
  duration at 10k and 70k items.
- Add resumable source cursors and retention of cross-batch album identity
  refinements if interrupted scans become a common operational issue.

## Reusable connector instance discovery

Connector discovery now uses one server-side engine for subnet enumeration,
candidate normalization, bounded HTTP/HTTPS probing, result deduplication, and
credential-free response mapping. Peridot onboarding remains on its existing
public discovery endpoint and port `17430`, but now runs through the shared
engine.

Administrators can call
`POST /api/admin/connectors/:kind/discover-instances` with an optional address
hint. The connector registry accepts an optional instance-discovery capability,
so future library sources and download clients can reuse the same contract
without exposing arbitrary network probing. Jellyfin uses port `8096`, HTTPS
preference, and the public `System/Info/Public` `Jellyfin Server` signature.
qBittorrent uses port `8080` and its official Web UI metadata, including the
older localized title and bundled asset markers.

The Jellyfin Add source form starts a local-network scan automatically, supports
explicit rescans, and starts a debounced targeted scan when an address is typed.
Discovered servers show their name, URL, and version. Administrators must
explicitly choose a result; the selected scanner URL is then used for library
discovery and source creation. Editing the address invalidates the selection and
loaded libraries.

The qBittorrent form also starts a local-network scan, supports rescans and
targeted address probes, and requires an explicit discovered result. Scan
controls and the discovered list appear first below the dialog title.
Saving uses the selected scanner URL and performs a live authenticated
qBittorrent check before persisting; failed connections are rejected. Existing
saved clients remain editable from their current verified URL until the
administrator changes it. Choosing a discovered row prefills fields without
showing a checked selection state. Discovered connector rows use a
reduced-motion-aware green pulse to show that the scanner reached the instance,
and new qBittorrent clients default their editable display name to qBittorrent.
Saved download-client rows lead with the bundled qBittorrent icon, use a
cog-icon Edit action, and keep the destructive Remove action inside a three-dot
menu with an explicit confirmation dialog.

Release-indexer Add and Configure actions now open the same modal-dialog pattern
used by library sources and download clients. Torznab fields, import-destination
controls, validation, and save errors remain inside the dialog.

Verification:

- `pnpm --filter @peridot/server test` (225 passing)
- `pnpm --filter @peridot/web test` (323 passing)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (current at `7fb2e91df85d`, two migrations)
- `pnpm build` (server, web, desktop, and Android debug build)
- Focused connector discovery, local discovery, admin authorization, web client,
  settings form, i18n, and OpenAPI tests

Known limits:

- No live Jellyfin or qBittorrent instance or authenticated browser session was
  used for visual QA.
- Automatic subnet enumeration only sees interfaces available to Peridot. The
  default Docker bridge setup may hide the host LAN, so entering the Jellyfin
  host address is the reliable container path.
- Jellyfin currently advertises only port `8096`; later default ports and
  suggested hosts can be added to the connector capability.
- Standard TLS validation is enforced, so self-signed HTTPS Jellyfin endpoints
  and qBittorrent endpoints are skipped and a valid HTTP endpoint may be selected
  instead.
- qBittorrent discovery supports the official built-in Web UI. Alternate Web UIs
  and Web UI roots hidden behind HTTP basic authentication do not expose the
  expected marker.

Uncommitted changes:

- Shared discovery engine and contracts, authenticated administrator route,
  Jellyfin public-info probe, qBittorrent Web UI probe, onboarding refactor, web
  client method, both connector forms, translations, tests, decisions, and
  development notes.
- Existing unrelated source-label icon changes and their tests remain untouched.

Next:

- Run Add source → Jellyfin against live HTTP and trusted HTTPS instances,
  including multiple servers and a reverse-proxy path.
- Verify the automatic sweep and typed-host path in both host-network and default
  Docker bridge deployments.
- Run Download clients → qBittorrent against qBittorrent 4.x and 5.x, with API
  key and username/password authentication, and confirm the scanner URL appears
  in the saved client.

## Medias manager

Administration now includes a Medias manager at `/settings/medias`. It lists all
known media, including unavailable records and zero-copy drafts, with full
metadata and source-backed file/location records. The page provides advanced
filters, sorting, numbered pagination, a right-side inline editor, media and copy
CRUD, persistent manual overrides with reset-to-source actions, and destructive
delete confirmations.

The route is full-bleed inside settings. The page title and subtitle are omitted,
search and filters stay above the independently scrolling datatable, pagination
stays below it, and date cells expose their raw ISO timestamp through a native
`title` tooltip. The table owns vertical and horizontal scrolling.

Verification:

- `pnpm --filter @peridot/server test` (215 passing)
- `pnpm --filter @peridot/web test` (319 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate`
- Local migration marker and `db` ref advanced to
  `7fb2e91df85da52ca54ad7f6ff71621577a757d8b112f95a109d4653e0773135`

Known limits:

- Live authenticated browser QA was not completed because Computer Use could not
  verify the active browser URL.
- The full-screen table layout should still be checked against a genuinely large
  catalog at desktop and phone widths.
- Manual overrides cover the exposed editable data fields; IDs, timestamps,
  availability, aliases, and scan/projection internals intentionally remain
  system-owned.

Uncommitted changes:

- Medias manager contracts, API routes, persistent override helpers and scan
  integration, additive migration, web page/drawer/editors, tests, translations,
  and documentation.

Next:

- Inspect `/settings/medias` at desktop and phone widths, exercise filters and
  pagination with a multi-page catalog, then edit a scanned field and confirm it
  survives a source rescan before using Reset to source.

## Direct connector settings destinations

The settings sidebar now lists Library sources, Release indexers, Download
clients, and Metadata providers directly under Administration. There is no
Connectors parent entry or heading. The connector overview remains available at
`/settings/connectors` by direct URL and uses localized labels.

Verification:

- Focused settings navigation tests (16 passing)
- `pnpm --filter @peridot/web test` (316 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm --filter @peridot/web build`

Known limits:

- The sidebar was verified through behavioral assertions and the production
  build, not an authenticated browser session.

Uncommitted changes:

- Settings sidebar layout, connector overview localization, translations,
  regression tests, documentation, the pnpm 11 lockfile regeneration, and
  formatting-only Tauri configuration cleanup.

Next:

- Inspect the Administration group at desktop and phone widths while one
  metadata task and several library sources are present.

## Short album rows omit trailing placeholders

The shared virtual card grid now limits placeholders to unloaded slots inside the
complete result count. A fully loaded final row with fewer cards remains short,
so a one-album collection no longer shows four loading skeletons. Fully unloaded
rows and partially loaded rows before the end still reserve card placeholders.

Verification:

- Focused virtual album and virtual scroll tests (6 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks on the changed files
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/web test` (316 passing after the connector navigation
  and short-row regression fixes)

Known limits:

- The corrected Albums row was verified through behavioral assertions and the
  production build, not another authenticated browser session.

Uncommitted changes:

- Virtual card row placeholder calculation, grid wiring, regression tests, the
  decision record, and this handoff section.

Next:

- Reload Albums at desktop and phone widths with collections whose last row has
  fewer than two and fewer than five items.

## Media and connector refactor

Peridot now uses canonical `Media`, source-backed `MediaCopy`, and
`MediaAlias` records. Likes, play history, playlists, queues, catalog
projections, artwork selection, and offline references use Media IDs. Source
paths, file properties, embedded metadata, recording identities, scan state,
and availability live on copies. Automatic matching keeps the oldest canonical
Media ID and redirects merged IDs through aliases.

Playback ranks available copies by availability, lossless state, bitrate, file
size, metadata completeness, library-source order, import time, and copy ID. It
tries the next copy for pre-header failures. A mid-stream copy failure marks
that copy unavailable so the client can retry the same range against the next
ranked copy.

The server now has one compile-time connector registry with explicit roles:
library source, release indexer, download client, metadata provider, and
playlist account. Path and Jellyfin are library sources. Torznab is the only
live release-search connector. qBittorrent is a download client. MusicBrainz and
Discogs are metadata providers. Playlist account/link persistence, capability
interfaces, user-owned account routes, import matching, and idempotent sync are
implemented and covered with a test-only typed connector; Spotify and YouTube
Music have contracts but no production adapters.

The public API uses `/api/media`. `/api/tracks`, `/api/torznab`, and
`/api/admin/sources` are absent without aliases. Discover uses
`/api/search/external` and release imports use task-ID status polling.
Connector descriptors and separate connector CRUD routes are exposed under
`/api/admin`.

The migration graph is replaced by one baseline:
`apps/server/migrations/app/20261124T1528_media_connector_baseline`. Existing
legacy databases are intentionally unsupported. Startup reports an actionable
backup-and-remove message and never deletes or recreates the database.

Web query, player, download-task, and offline-manifest generations were bumped.
First launch clears legacy metadata while preserving
`peridot-offline-audio-v1`. Android writes new data under `files/offline-v2` and
leaves `files/offline` untouched. Settings → Library exposes explicit legacy
audio cleanup.

Verification:

- `pnpm test` (server 212, web 315, UI 19, desktop 5, plus shared packages)
- `pnpm --filter @peridot/server test` (212 passing)
- `pnpm --filter @peridot/web test` (316 passing)
- `pnpm --filter @peridot/android test` (Gradle unit tests passing)
- `connectedDebugAndroidTest` (7 passing on Pixel 8, API 37)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (one baseline at `30048626d798`)
- `pnpm build`

Known limits:

- No production Spotify, YouTube Music, or other playlist adapter is included.
- Existing Track/Source databases require a manual backup and reset; this
  release performs no data backfill.
- Legacy audio blobs remain until the owner invokes the explicit cleanup action.
- Torznab remains the only live Discover connector in this milestone.

Uncommitted changes:

- The complete Media/MediaCopy/connector refactor, fresh baseline migration,
  server/web/Android contract updates, client storage reset, tests, and
  documentation changes in this worktree.
- The owner's existing `README.md` concept edits were preserved and extended
  with connector roles and the manual database reset.

Next:

- Back up and remove a real legacy test database, then exercise fresh startup.
- Run desktop and phone visual QA for the connector settings destinations,
  Discover import progress, linked playlist surfaces, Tasks, and legacy-cache
  cleanup.
- Validate a live Jellyfin server and live Torznab/qBittorrent pair after the
  schema reset.

## Incremental external imports

Completed Torznab downloads now store qBittorrent's completed, safe audio paths
on the durable release-import task. The scanner resolves only those paths instead
of recursively reading the configured folder. Targeted imports also skip the
source-wide unavailable-track, cover-cleanup, and artwork-cache passes and do not
advance `lastSyncedAt`, because a partial import is not a complete source
snapshot. Metadata matching receives the imported track IDs and stays scoped to
the new release.

Normal library and source rescans still perform full discovery and
reconciliation. Release-import tasks created before the payload migration have
no stored paths and use the full-scan fallback.

Verification:

- `pnpm --filter @peridot/server test` (207 passing)
- Incremental path and mixed-folder import tests (43 passing)
- `pnpm typecheck`
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server build`
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate` (21-migration graph current)
- `pnpm db:migrate:dev` applied `20261124T1126_add_task_payload` and created a
  pre-migration database backup

Known limits:

- Duplicate detection remains catalog-wide after an import so canonical-copy
  selection stays correct. It reads database rows rather than rescanned files.
- A live qBittorrent transfer against a folder containing more than 70,000 files
  has not been measured in this run.
- Browser-level import progress and toast behavior were not re-exercised after
  the scanner change.

Uncommitted changes:

- The targeted-import skip for source-wide artwork and cover cleanup, final
  formatting adjustments, the advanced database ref, and this handoff.
- The durable payload migration, generated contract artifacts, path handling,
  tests, decision record, and development notes are included in
  `75ad868f feat: implemented download from external sources`.

Next:

- Import a small release into a real qBittorrent-backed folder with a large
  existing library and confirm only the release's audio paths are read.
- Exercise both category-managed and manual-path mappings, including a torrent
  with nested directories and non-audio files.

## Recent search list layout

Recently searched albums now render as the same bordered, divided row list as
library results. Each recent uses the shared row presentation, including cover
playback, title category, artist metadata, source icons, and likes.

Verification:

- Focused search and virtual-scroll tests (8 passing)
- `pnpm --filter @peridot/web test` (314 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on changed web and test files

Known limits:

- The recent list was verified through behavioral assertions and the production
  build, not an authenticated browser session.

Uncommitted changes:

- Recent-list markup, updated behavioral assertions, decision record, and this
  handoff section.

## Search autocomplete disabled

The global header search and reusable list search now disable native browser
autocomplete. Their existing recent-search and catalog results remain unchanged.

Verification:

- Focused search and list-search tests (8 passing)
- `pnpm --filter @peridot/web test` (314 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused Prettier check
- `git diff --check`

Known limit:

- Browser and operating-system text assistance remains platform-controlled
  despite `autocomplete="off"`.

Uncommitted changes:

- Two search inputs, regression tests, the decision record, and this handoff
  section. Existing `feature/tornzab` changes remain untouched.

Next:

- Reload the development client and confirm neither search field opens a native
  suggestion menu while typing.

## Search tab browser history

Library and External sources search tabs are now backed by route history.
Switching tabs pushes a new entry, while clearing the search or losing external
search availability replaces the current entry with the canonical Library URL.
The query and unrelated route state are preserved.

Verification:

- Focused search history and view tests (9 passing)
- `pnpm --filter @peridot/web test` (314 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

Known limit:

- Invalid or unavailable External sources URLs render Library until external
  search becomes available.

Uncommitted changes:

- Search tab route-history helpers, page wiring, tests, and documentation.

## Durable external imports and torrent presence

Torznab search now extracts v1/v2 info hashes from Torznab attributes and magnet
URLs. qBittorrent presence is checked in batches of 50 with a two-second timeout
and a 15-second per-client hash cache. Search does not request the complete
torrent list. Existing releases render as Already added or with their current
transfer progress.

Accepted imports create an owner-scoped `release_import` task in the new
`waiting` status. The task manager polls each indexer's pending tag every five
seconds, updates progress, and promotes completed transfers into the normal task
queue. The release task then scans the folder for embedded tags and queues the
existing metadata-matching child task.

Waiting tasks survive navigation and server restarts. Cancelling stops tracking
and removes only the pending Peridot tag; torrents and downloaded files remain in
qBittorrent. Non-admin users see their own active release imports in the desktop
task indicator, while shared tasks remain visible in Settings → Tasks.

The initiating user receives one owner-scoped toast when downloading begins and
one when the transfer completes and library importing starts. Replayed events
and initial task loads do not emit retrospective toasts.

Verification:

- `pnpm --filter @peridot/web test` (313 passing)
- `pnpm --filter @peridot/server test` (205 passing; the unrelated Jellyfin
  paging test missed its timing window in the full parallel run, then passed
  when rerun alone)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server typecheck`
- `pnpm typecheck`
- Production server and web builds
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate` (20-migration graph current)
- `pnpm version:check`
- `pnpm db:migrate:dev` applied `20261124T1012_add_task_owner`
- Development server health returned the expected Peridot response

Known limits:

- Releases without an info hash are checked only when added.
- Manual qBittorrent transfers without a Peridot release task show the snapshot
  returned by search but are not attached to a durable import task.
- A missing torrent leaves its waiting task active for the 24-hour recovery
  window before failing.

Feature files:

- `apps/server/src/torznab-presence.ts`
- `apps/server/src/torznab.ts`
- `apps/server/src/tasks.ts`
- `apps/web/app/components/AppNotifications.vue`
- `apps/web/app/components/TaskProgressIndicator.vue`

Uncommitted changes:

- Batched presence checks, durable release-import tasks, owner migration,
  waiting-task presentation, stage toasts, tests, documentation, and generated
  migration artifacts.

Next:

- Import a hash-bearing release from the live qBittorrent 5.3 seedbox, navigate
  away from search, and confirm the two owner toasts, task progress, tag scan,
  and metadata child.

## External source media filters

The External sources search tab now shows the shared sticky pill filters. All,
Music, and Audiobooks replace the library filters while that tab is active.
Music and Audiobook filter by the resolved Torznab media type; releases without
a resolved type remain visible under All. The selected external filter is reset
when the search is cleared or external search becomes unavailable.

Empty filtered states use type-specific copy, while the External sources tab
count remains the complete available result count. Known seeder counts sort
descending, unknown counts remain last, and ties preserve indexer order.

Verification:

- `pnpm --filter @peridot/web test` (311 passing)
- `pnpm --filter @peridot/web typecheck`
- Production web build
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`
- Running development server health returned the expected Peridot response

Feature files:

- `apps/web/app/pages/search.vue`
- `apps/web/app/lib/torznab-filters.ts`
- `apps/web/app/components/TorznabResults.vue`

Uncommitted changes:

- External media filters, type-specific empty copy, tests, translations,
  decision record, and this handoff section.

Next:

- Inspect the External tab pill row and filtered empty states at phone width.

## Inline Torznab import status

Torznab release rows now show their own import state. Starting an import replaces
the download action with an indeterminate Peridot spinner, then a determinate
progress circle as qBittorrent reports transfer progress. Metadata shows a
localized queued, metadata, downloading, checking, paused, indexing, ready, or
failed state. Ready and already-present rows are muted and disabled.

The external search loading status now reads “Searching external sources” in
both the visible text and the spinner’s accessible label.

Only attempted releases are polled. Search does not query qBittorrent torrent
state for the result set. Multiple imports poll independently, and Play imported
tracks uses the most recently ready import.

The qBittorrent adapter now accepts legacy `Ok.` add responses and Web API 2.14+
JSON receipts, including 202 pending additions. A qBittorrent 409 returns
Peridot error code `release_already_added`; the attempted row becomes Already
added and shows a specific error toast. The existing Peridot tag precheck
returns the same duplicate response instead of starting a queued-status poll.

Verification:

- `pnpm --filter @peridot/web test` (310 passing)
- `pnpm --filter @peridot/server test` (200 passing)
- `pnpm typecheck`
- Production web and server builds
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate` (19-migration graph current)
- `git diff --check`
- Running development server health returned the expected Peridot response
- Focused en-US i18n tests (5 passing)
- Focused Prettier check on the changed translation and test files

Known limits:

- Import state is page-local and relays qBittorrent progress only while the
  search page remains mounted.
- Legacy qBittorrent `Fails.` responses cannot be distinguished as duplicates
  and remain generic import failures.
- Visual validation with a real qBittorrent 5.3 transfer has not yet been run.

Feature files:

- `apps/server/src/qbittorrent.ts`
- `apps/server/src/torznab.ts`
- `apps/server/src/openapi.ts`
- `apps/web/app/composables/use-torznab-search.ts`
- `apps/web/app/components/TorznabReleaseRow.vue`
- `apps/web/app/lib/torznab-import-status.ts`
- `apps/web/i18n/locales/en-US.json`
- `apps/web/test/i18n.test.ts`

Uncommitted changes:

- Inline Torznab row status, per-attempt queries, qBittorrent Web API 2.14+
  compatibility, duplicate handling, translations, tests, decision record, and
  this handoff section.

Next:

- Run one new and one duplicate import against the configured qBittorrent 5.3
  seedbox, then inspect the rows at desktop and phone widths.

## Full-count virtual catalog paging

Catalog card grids and track tables reserve the complete `totalCount` returned
by the first cursor page. The Albums grid now uses offset-addressable sparse
page windows with a 250 ms scroll quiet period. Dragging waits until scrolling
stops, requests only the target page neighborhood, and immediately removes
off-window page queries. Non-virtual paginated surfaces keep the existing
`AutoLoadMore` sentinel.

The Albums grid now renders card-shaped skeletons for unloaded rows. Placeholder
rows are not measured into the virtualizer, preserving the estimated total
height until real album cards arrive. One live desktop check dragged from the
first page to a deep album range, confirmed visible skeletons, waited for the
scroll quiet period, and observed the target album page resolve directly.

Verification:

- `pnpm --filter @peridot/web test` (309 passing)
- `pnpm --filter @peridot/server test` (199 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server typecheck`
- Production web and server builds
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

Known limits:

- Albums uses sparse offset windows. The other virtual catalog surfaces still
  advance through sequential cursor pages when scrolled incrementally.
- Only Albums has visible loading placeholders in this iteration. Other virtual
  surfaces reserve the correct space but render blank rows until data arrives.
- Live validation used a desktop viewport; phone-width skeleton wrapping was not
  visually inspected.

Feature files:

- `apps/web/app/composables/use-virtual-load-more.ts`
- `apps/web/app/composables/use-virtual-catalog.ts`
- `apps/web/app/lib/virtual-albums.ts`
- `apps/server/src/catalog-routes.ts`
- `apps/server/src/catalog.ts`
- `apps/web/app/components/TrackTable.vue`
- `apps/web/app/components/VirtualCardGrid.vue`
- `apps/web/app/components/AlbumCardPlaceholder.vue`
- `apps/web/app/pages/albums/index.vue`

Uncommitted changes:

- Full-count virtual paging, Albums placeholders, call-site wiring, regression
  tests, decision record, and this handoff section.

Next:

- Inspect Albums placeholders at phone width.
- Add equivalent sparse page windows and placeholders to artists, playlists,
  audiobooks, podcasts, and direct search grids when requested.

## Shared qBittorrent download clients

Settings → Download clients manages named server-side connections. The add dialog starts with a client-type picker. Each qBittorrent instance can use its Web UI username and password or a bearer API key (5.2+). Existing clients retain their authentication method and indexer links. Torznab indexers independently choose a client, category, tags, folder and path mode. The additive database migration creates DownloadClient. Startup transfers existing embedded credentials and links in one transaction. Verify category path mappings on the deployed services.

## Jackett search and completed-release playback

Authenticated search queries the Torznab indexers configured in Settings → Sources. Each feed advertises audio capabilities and may have a qBittorrent import destination. Setup is documented in DEVELOPMENT.md. The search page can queue an import or start the player after the scanner indexes downloaded files. Automatic playback requires keeping the search view open. qBittorrent tags identify transfers across server restarts.

The integration test uses simulated upstream responses, a temporary database, a real WAV file, the scanner, and the authenticated audio endpoint. Deployment verification still requires running a transfer on a configured Jackett and qBittorrent installation.

## Automatic external search tab

Global search now runs a configured Torznab query automatically for each
non-empty debounced search term. External results have a dedicated tab with a
live release-count preview, while Library remains the default and the selected
tab stays local to the page. Clearing the query resets the view to Library.

External rows use the shared bordered search-list surface, 40px muted cover
placeholder, title-adjacent type badge, source/seeders/size metadata, and
Torznab provenance. Category mapping resolves Music, Audiobook, Podcast, or a
generic Release; the placeholder icon follows the same result. The library play
overlay is replaced by one Add to library download action. Play when ready was
removed; Play imported tracks remains available after indexing completes.
Queueing, status, and qBittorrent transfer failures use a release-specific
error toast; the action alert is removed.

Verification:

- `pnpm --filter @peridot/web test` (303 passing)
- `pnpm --filter @peridot/ui test` (19 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm lint`
- `pnpm --filter @peridot/web build`
- Focused Prettier check on every changed file
- `git diff --check`
- Live Brave check at desktop width: Library selected, External sources preview
  showed 25 results, switching tabs hid Library filters, and external rows
  rendered placeholder art, metadata, Release badges, and Add to library
  controls.

Known limits:

- Mobile-width visual inspection was not run.
- The live check did not trigger an actual external import.
- Validation used the shell's Node 26.13.0 and pnpm 12.21.0 because the
  documented Node 24/pnpm 11.25.0 toolchain is not installed on this host.
- Root `pnpm format:check` still reports unrelated formatting in
  `apps/server/src/app.ts` and `apps/server/src/openapi.ts`.

Feature files:

- `apps/web/app/composables/use-torznab-search.ts`
- `apps/web/app/components/TorznabReleaseRow.vue`
- `apps/web/app/components/TorznabResults.vue`
- `apps/web/app/pages/search.vue`
- `packages/ui/src/components/ui/tabs`
- Web and UI tests, translations, decision record, and this handoff section

Uncommitted changes:

- Automatic Torznab query lifecycle, tabbed search results, external release
  rows, shared tab primitives, tests, translations, decision record, and this
  handoff section.

Next:

- Check the tabs and rows at phone width.
- Run one real import and verify progress plus Play imported tracks after the
  completed folder is indexed.

## Desktop top-bar task spinner

The default application top bar now shows combined server and offline-download
task progress at desktop widths. The indicator is hidden below the `md`
breakpoint, links to the active task list, and keeps the existing server-offline
badge separate. Queued-only work is represented by an empty 0% ring rather than
an indeterminate spinner.

Verification:

- `pnpm --filter @peridot/web test` (298 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on the changed files
- `git diff --check`
- Validation used Node 24.22.3 and pnpm 11.25.0

Known limits:

- Browser visual QA with active server and download tasks at desktop and mobile
  widths was not run.

Feature files:

- `apps/web/app/components/TaskProgressIndicator.vue`
- `apps/web/app/layouts/default.vue`
- `apps/web/app/lib/task-progress.ts`
- `apps/web/i18n/locales/en-US.json`
- `apps/web/test/task-progress.test.ts`
- `apps/web/test/download-tasks.test.ts`

Uncommitted changes:

- Desktop task-spinner restoration, queued-only empty progress behavior,
  translations, tests, decision record, and this handoff section.

## Faster Jellyfin scans

Jellyfin scans now list 500 audio items per page instead of 100. Import
batching stays at 100 rows, and the catalog still publishes after each batch,
so the page-size change only reduces listing requests.

Unchanged tracks now synchronize their artwork jobs in one batch per import
transaction instead of one query and write per track. Tracks that already have
a valid cover and no pending job are skipped entirely. Scan task details now
include cumulative discovery, artwork, database, and catalog times in
milliseconds so slow scans can be diagnosed from Settings → Tasks.

Verification:

- `pnpm --filter @peridot/server test` (195 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm lint`
- `pnpm exec prettier --write` on the changed files

Uncommitted changes:

- Jellyfin page size, batched artwork-job sync, scan phase timings, translated
  task-detail labels, Jellyfin and artwork-fetch tests, decision record, and
  this handoff section.
- Earlier scan-worker default and migration work remains uncommitted and was
  preserved.

Next:

- Run the real Jellyfin source through one full scan and compare the discovery,
  artwork, database, and catalog timings against the previous 100-item pages.

## Scan worker default raised to six

New server settings now default to six scan worker threads. The administrator
warning appears only above eight workers, and the web copy names both values.
The SQLite default is migrated through a table rebuild that copies every existing
`ServerSetting` row unchanged.

Existing saved worker counts are intentionally preserved, including servers that
still hold the previous default of three. The new default applies when a server
setting row is created.

Verification:

- `pnpm --filter @peridot/server test` (194 passing)
- Focused web settings, i18n, and client tests (39 passing)
- `pnpm typecheck` (6 tasks passing)
- `pnpm lint`
- `pnpm db:validate` (18-migration graph current)
- Production builds for `@peridot/contracts`, `@peridot/server`, and
  `@peridot/web`
- `pnpm format:check`
- `git diff --check`
- `pnpm db:migrate:dev` applied the migration and advanced the `db` ref with a
  verified pre-migration backup
- The running development server still returns a healthy Peridot API response

Uncommitted changes:

- Shared scan-worker constants, Prisma contract and emitted artifacts, migration
  and snapshot, default-setting tests, web copy, decision record, and this
  handoff section.

Next:

- Open Settings → Server on a fresh server setting and confirm the worker field
  shows six, then enter nine and verify the warning appears.

## Search results align categories, album playback, and provenance

Search result categories now sit beside track and album titles instead of the
right-side action group. Album playback is embedded in the row cover like the
shared track control, so albums no longer render a separate trailing play
button. Playlist playback remains a standalone collection control.

Album summaries now expose the ordered source kinds represented by their
available tracks. Search results render one source icon for a single source and
all source icons for a multi-source album. Hover copy reads “Provided from
{source}” for one source and “Served from multiple sources” for multiple
sources.

Verification:

- `pnpm --filter @peridot/web test` (297 passing)
- `pnpm --filter @peridot/server test` (194 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server typecheck`
- Production builds for `@peridot/web` and `@peridot/server`
- Focused ESLint and Prettier checks

Known limits:

- The search rows were verified through behavioral assertions and production
  builds but were not visually exercised in an authenticated browser session.
- Source kinds are deduplicated by provider family; multiple configured sources
  of the same kind share one icon.

Uncommitted changes:

- Album source-kind summaries, the separate category and source-icon search
  components, embedded album playback, contract and OpenAPI updates, behavioral
  tests, the decision record, and this handoff section.
- Existing authentication, search-history, source-normalization,
  library-preference, and documentation changes remain present and were
  preserved.

Next:

- Search for an album with one source and one represented across multiple source
  kinds, then confirm category placement, cover playback, icon grouping, and
  hover copy at desktop and phone widths.

## Search queries enter browser history

Completed global searches now create URL-backed browser history entries at
`/search?q=...`. The query is committed after the search debounce, Back and
Forward restore the input and results for the selected entry, and reloading or
sharing a search URL retains the query. Clearing the input removes `q`, and
repeating the current query does not add a duplicate entry.

Verification:

- Focused search history, search view, shortcut, and sidebar tests (12 passing)
- `pnpm --filter @peridot/web test` (297 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks

Known limits:

- Browser Back and Forward were covered by route-helper and wiring tests but
  were not exercised in a live authenticated browser session.

Uncommitted changes:

- Search history route helper, layout and search-page wiring, behavioral tests,
  the decision record, and this handoff section.
- Existing authentication, catalog, source, track-table, library-preference,
  contract, and documentation changes remain present and were preserved.

Next:

- Run two searches with a pause between them, then use Back, Forward, and reload
  to confirm the URL, input, and results stay synchronized.

## Jellyfin source icon restored

Jellyfin sources imported before the plugin-system removal were still persisted
with legacy `kind = "plugin"`. Startup normalization now upgrades exact
Jellyfin-shaped legacy rows to `jellyfin` and restores their source identity, so
Sources renders the bundled Jellyfin icon and uses the normal Jellyfin
integration path. Unrelated legacy plugin records are left unchanged.

Verification:

- Focused server source normalization test
- `pnpm --filter @peridot/server test` (194 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server build`
- Focused web source-label and settings tests (19 passing)
- `pnpm db:validate` (17-migration graph current)
- Focused ESLint and Prettier checks
- `git diff --check`
- Local development `Audio` source now has `kind = "jellyfin"` and a restored
  source identity

Known limits:

- Unrelated legacy plugin records are not converted and still fall back to the
  generic server icon.
- The live Sources screen was not visually inspected in this run.

Uncommitted changes:

- Startup source compatibility normalization, its behavioral test, the decision
  record, and this handoff section.
- Existing authentication, track-table, library-preference, and documentation
  changes remain present and were preserved.

Next:

- Reload Settings → Sources and confirm the `Audio` source shows the bundled
  Jellyfin icon.

## Track lists restore default like and artist controls

The shared track table now defaults `allowTrackLike` and `showArtists` to true.
Vue casts omitted Boolean props to false, so album and other callers that did not
pass these flags were suppressing the row like buttons and menu-aware artist
links. Album tracks now show the far-right heart without duplicating explicit
flags at each call site.

Verification:

- `pnpm --filter @peridot/web test` (294 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- The running development client was not visually inspected after hot reload.

Uncommitted changes:

- Shared track-table defaults, an album regression assertion, and this handoff
  section.
- Existing authentication, library-preference, and documentation changes remain
  present and were preserved.

Next:

- Reload an album and confirm the far-right row hearts and linked artist names
  render without callers passing either flag.

## Liked-title offline downloads default off

“Make my liked titles available offline” now defaults to disabled. Uninitialized
accounts receive `false` from the server and the web client initializes the
account preference with the same value. Missing or invalid device state also
falls back to disabled. Existing accounts and devices with an explicit `true`
preference remain enabled.

Verification:

- `pnpm test` (193 server, 294 web, 18 UI, and 5 desktop tests passing)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `pnpm db:validate` (17-migration graph current)
- Production builds for `@peridot/web` and `@peridot/server`

Known limits:

- Existing enabled account preferences are preserved; this change only alters
  the default used when no explicit value exists.
- The Library switch was not visually exercised in a live browser session.

Uncommitted changes:

- Web and server preference defaults, behavioral tests, decision and development
  notes, and this handoff section.

Next:

- In a fresh-account browser session, confirm the Library switch renders off and
  no liked-title download task is queued before the user enables it.

## CI release workflow repaired

GitHub retired all macOS 14 hosted images on November 2, 2026. The signed
universal desktop release job now runs on `macos-15`, and the CI workflow
regression test rejects the retired `macos-14` runner label. Desktop release
uploads now remove duplicate filenames across platform bundle artifacts before
calling `gh release upload`, which previously sent the same asset name more
than once in one update.

Verification:

- Focused CI workflow regression test
- Full repository test and static-check gates rerun before push

Known limits:

- The universal macOS artifact itself must build successfully in the next
  GitHub Actions run.

Uncommitted changes:

- Desktop release runner update, duplicate-asset filtering, workflow
  assertions, and this handoff section.

Next:

- Confirm the complete pushed GitHub Actions workflow succeeds.

## CI test suite restored

The full test suite now matches the current public track contract, the public PWA
manifest, and the configured log-retention policy. The web branding check reads
the authoritative public manifest instead of the removed inline Nuxt PWA
manifest. The library scan assertion includes `sourceKind`, and the restored-log
endpoint fixture uses a current timestamp so startup retention does not prune it.

Verification:

- `pnpm test` (193 server, 294 web, 18 UI, and 5 desktop tests passing)
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm version:check`

Known limits:

- The Android test job was unchanged; the next GitHub Actions run remains the
  final check for that job and the downstream builds.

Uncommitted changes:

- Web branding, server library, and server log test corrections.
- This handoff section.

Next:

- Confirm the pushed `dev` commit passes the complete GitHub Actions workflow.

## Desktop player likes move to the right controls

The desktop player's like action now sits in the right-side utility group before
the queue control instead of beside the artist name. Its like state, pending
state, accessible label, and disabled behavior are unchanged, including when no
track is active. The left metadata block now gives the title and artist more
space.

Verification:

- `pnpm --filter @peridot/web exec node --test test/player.test.ts test/likes-ui.test.ts test/styling.test.ts`
  (8 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` for the changed files
- `pnpm --filter @peridot/web test` (293 of 294 passing; the unrelated existing
  branding assertion expects `background_color: "#000000"` in
  `nuxt.config.ts`)

Known limits:

- The control bar was not visually inspected with an authenticated track at
  desktop widths during this run.

Uncommitted changes:

- The desktop player like-control placement, its regression assertion, and the
  decision and handoff updates.
- Existing catalog, player, sidebar, manifest, source, Android, contract,
  documentation, and lockfile changes remain present and were not modified.

Next:

- Open the player with a track active at desktop widths and confirm the heart
  aligns with the right-side queue and volume group.

## Search filters anchor to the main viewport

The search quick-filter bar now offsets its sticky top position by the same
mobile and desktop padding used by the main scroll panel. `top-0` previously
settled at the scrollport's padded edge once the page scrolled, exposing a strip
of content above the filter background.

Verification:

- Headless Chromium measured a padded scrollport fixture with `top-0` at the
  20px padding edge and with the matching negative top at the true viewport edge.
- `pnpm --filter @peridot/web exec node --test test/search-view.test.ts`
  (4 passing)
- `pnpm --filter @peridot/web exec node --test test/styling.test.ts`
  (2 passing)
- `pnpm --filter @peridot/web test` (293 of 294 passing; the unrelated existing
  branding assertion expects `background_color: "#000000"` in
  `nuxt.config.ts`)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web build`
- `git diff --check` for the changed files

Known limits:

- The isolated browser used for layout measurement had no authenticated Peridot
  session, so the live search page was not visually rechecked.

Uncommitted changes:

- Search filter sticky offset, its regression assertion, and this handoff
  section.
- Existing catalog, player, sidebar, manifest, source, Android, contract,
  documentation, and lockfile changes remain present and were not modified.

Next:

- Reload `/search`, enter a query, and scroll the results at phone and desktop
  widths to confirm the filter bar stays flush below the top bar.

## Playback failures surface a toast

The shared player now shows a localized error toast when a track becomes
runtime-unavailable after its playback attempts are exhausted. The toast names
the failed track and appears whether playback skips to another item or stops.
The same newly-unavailable tracking covers browser audio failures and Android
playback snapshots without reporting retry attempts or repeated snapshots.

Verification:

- Focused notification and playback-retry tests (13 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web build`
- `git diff --check`
- `pnpm --filter @peridot/web test` (293 of 294 passing; the unrelated existing
  branding assertion expects `background_color: "#000000"` in
  `nuxt.config.ts`)

Verification ran with Node 24.15.0 and the repository-configured pnpm 12.21.0;
the contributor policy requests pnpm 11.25.0, and Corepack refused to run the
older version against the project pin.

Known limits:

- Toast presentation will be checked through automated tests rather than by
  forcing a live media failure in the browser during this run.

Uncommitted changes:

- Playback failure toast mapping, shared-player integration, translations,
  regression tests, the decision record, and this handoff section.
- Existing catalog, player, sidebar, manifest, source, Android, and related
  worktree changes remain present and were not modified by this work.

Next:

- Play a source-unavailable track and confirm one toast names it before playback
  advances.

## PWA manifest is valid in development

The development server now serves `/manifest.webmanifest` as a public JSON asset
with `application/manifest+json` instead of returning the SPA HTML fallback. The
manifest is the single source for development and production, and the
development service worker remains disabled.

Verification:

- Live development request returned `200`, `application/manifest+json`, valid
  JSON, the Peridot name, standalone display mode, and three icons.
- `pnpm --filter @peridot/web exec node --test test/offline-spa.test.ts`
  (21 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` for the changed files
- Production output retained the same manifest hash as the public source.
- The production Fastify static path returned `200`,
  `application/manifest+json`, and valid JSON.

Verification ran with Node 24.15.0 and the repository's current pnpm 12.21.0;
the contributor policy requests pnpm 11.25.0.

Known limits:

- The HTTP response was verified directly, but the existing browser tab was not
  inspected after the change.

Uncommitted changes:

- The public PWA manifest, PWA configuration, offline-shell regression
  assertion, decision record, and this handoff section.
- Existing mobile, catalog, playback, source, desktop, and documentation changes
  remain present and were preserved.

Next:

- Reload the open client once and confirm the manifest syntax error is gone.

## Fullscreen mobile player carousel gestures

The fullscreen mobile player now follows the finger. Left swipes advance to the
next track, right swipes return to the previous track, and the previous/current/
next artwork and metadata render as an adjacent carousel preview. Upward swipes
never close the player. Downward swipes close only from outside the scroll body
or while its scroll position is zero.

Gestures lock to an axis, ignore controls and sliders, use distance or velocity
thresholds, and reuse the existing next/previous playback methods. Adjacent
panels are inert and hidden from assistive technology. Their carousel cells clip
all artwork and scrolling-text overflow, and adjacent titles remain transparent
at rest so the previous title cannot overlap the centered title. Player history
details are retained so the previous preview and the committed previous track
resolve to the same item.

Tapping the compact bottom player now opens the fullscreen surface from below
with a 200 ms upward transition and overlay fade. Closing resets all gesture and
carousel state after the route leaves fullscreen, allowing the player to reopen
cleanly after a downward swipe.

Fullscreen buffering uses the desktop player's animated top-edge loading ray
without a buffering text label. The active track's like control is right-aligned
within the centered carousel panel.

Verification:

- Focused player, queue, route, styling, scrolling-text, image, and gesture tests
  (37 passing)
- `pnpm --filter @peridot/web test` (292 of 293 passing; the unrelated concurrent
  branding/manifest assertion expects `background_color: "#000000"` in
  `nuxt.config.ts`)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Gesture behavior has not yet been exercised on a physical phone.
- Native system gestures reserved by a browser cannot be overridden by a page.

Uncommitted changes:

- Fullscreen carousel, swipe player composable, adjacent preview selectors,
  history detail retention, open/close transitions, responsive reset behavior,
  regression tests, the decision record, and this handoff section.

Next:

- Open, swipe between tracks, swipe down, reopen, and repeat in dark and light
  themes on a physical phone; also verify scroll-at-top arbitration and controls
  excluded from gestures.

## Mobile icon-only connection badge

The shared topbar connection badge now hides its “Offline” label below the
`md` breakpoint, leaving the network-off icon. The badge retains its localized
accessible label and tooltip. Desktop widths continue to show the full badge.

Verification:

- `pnpm --filter @peridot/web exec node --test test/task-progress.test.ts test/styling.test.ts`
  (15 passing)
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`

Known limits:

- The responsive badge was covered by source and styling assertions but was
  not visually inspected in a phone-sized browser during this run.

Uncommitted changes:

- The shared connection indicator, its regression assertion, and this handoff
  section.

Next:

- Open the app with the server disconnected at a phone width and confirm the
  topbar badge shows only the icon and retains its accessible label.

## Mobile sidebar swipes and backdrop

The main and settings navigation sidebars now share mobile swipe handling.
The drawer follows horizontal touch movement continuously: swiping right drags a
closed sidebar open, swiping left drags an open sidebar closed, and release
settles the drawer against the nearest side of the midpoint. The backdrop opacity
tracks the same drag progress. Gestures that begin in text fields or sliders are
ignored for opening. The backdrop sits above page controls and below the drawer,
while leaving the fixed player available.

Horizontal panning and overscroll are disabled on the navigation surface, and
the VueUse swipe listener is non-passive. This prevents the app's right swipe
from triggering browser Back navigation where browsers permit touch events to
override that gesture.

Verification:

- `pnpm --filter @peridot/web exec node --test test/sidebar-swipe.test.ts`
  (3 passing)
- Focused sidebar, styling, and mobile-player tests (7 passing)
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`
- Production CSS contains the transition, `z-40`, `z-50`, `touch-pan-y`, and
  `overscroll-x-none` utilities.

Known checks:

- `pnpm --filter @peridot/web typecheck` passes.
- The full web suite currently has concurrent catalog/search failures outside
  the sidebar files, including catalog-card, track-table, playlist, search, and
  virtual-scroll expectations. All focused sidebar, styling, and mobile-player
  tests pass.

Known limits:

- Swipe handling uses touch events through VueUse and was not exercised on a
  physical phone during this run.
- Browsers may reserve edge or system-level navigation gestures that a website
  cannot cancel. In-app touch handling covers the browser gestures that remain
  cancelable from the page.

Uncommitted changes:

- Shared continuous sidebar drag logic, finger-following drawer and backdrop
  positioning, browser gesture suppression, the narrow runtime-style exception,
  regression tests, the decision record, and this handoff section.

Next:

- Test open and close swipes plus backdrop dismissal on a physical phone in dark
  and light themes, including gestures that start on the search field.

## Version manifests sync before commits

The `pre-commit` hook now runs `npm run version:sync` and stages every manifest
updated by the script. The existing formatter still runs afterward, and the
`commit-msg` hook continues to validate conventional commit messages.

Verification:

- `npm run version:sync`
- `npm run version:check`
- Hook invocation and staged-manifest behavior

Uncommitted changes:

- Version synchronization in the pre-commit hook, plus development, decision,
  and handoff updates.

Next:

- None.

## Offline copies survive duplicate promotion

Offline playback now follows canonical duplicate IDs. The local catalog exposed
`Give Life Back to Music` under a canonical ID while its saved offline manifest
still referenced a hidden duplicate ID, so the title appeared unavailable even
though its audio remained cached. Connected clients now resolve saved IDs in
bounded batches and move browser cache entries and Android cached files to the
canonical track while preserving their original save time.

The Android Media3 queue no longer removes a source-unavailable track before
checking for its device-local audio file. Runtime playback failures still mark a
track unavailable after the normal retry limit.

Verification:

- `pnpm --filter @peridot/web test` (280 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm typecheck`
- Focused ESLint and repository Prettier checks
- `pnpm --filter @peridot/android test`
- `pnpm --filter @peridot/android lint`
- `pnpm --filter @peridot/android instrument` (7 passing on API 37)
- `pnpm --filter @peridot/android build`
- `git diff --check`
- `pnpm test` completed desktop, player, contracts, UI, and web tests, but the
  server suite failed the unrelated `server-log.test.ts` restart-history
  assertion (192 of 193 passing). The same failure reproduced when that test was
  run alone.

Known limits:

- A saved copy that references a duplicate ID requires one connected refresh
  before an offline-only session can resolve it to the canonical ID.
- Live browser playback was not rechecked after the fix because the current
  Computer Use session could not verify the active Brave URL.
- The full test gate remains red because the existing server log restoration
  test does not recover its pre-restart entry in this environment.

Uncommitted changes:

- Web offline manifest reconciliation and regression coverage.
- Android cached-track identity migration and source-unavailable queue handling.
- Decision, development, and handoff updates.

Next:

- Reconnect the affected client, confirm the offline badge and playback target
  move to the visible track, then disconnect and play it once.
- Repair or quarantine the unrelated server log restoration test before using
  the aggregate `pnpm test` result as a release gate.

## Git formatter and message hooks

Husky now runs `npm run format` before each commit. The existing `commit-msg`
hook continues to validate the commit message with Commitlint. Installation of
both hooks remains part of the existing `prepare` script executed by
`pnpm install`.

Verification:

- `npm run format`
- Husky `pre-commit` and `commit-msg` wrappers resolve to the tracked hook files

Uncommitted changes:

- The `pre-commit` formatter hook and development, decision, and handoff updates.

Next:

- None.

## Playlists in global search

Global search now includes paginated playlist results and a Playlists quick
filter. Playlist cards use the same shared `CatalogCard` as the Playlists page,
including playback, unavailable handling, and the playlist context menu. The
search empty state does not issue an unfiltered playlist search, and retry
refreshes playlists with the other result types.

Verification:

- `pnpm --filter @peridot/web test` (279 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused search, catalog-card, virtual-scroll, playlist, i18n, and list-search
  tests (18 passing)
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Live browser visual QA was not completed because Computer Use could not
  verify the active Brave URL.

Uncommitted changes:

- Search playlist query, results, filter, translations, regression assertions,
  decision record, and this handoff section.
- Existing Android, playback, toast, catalog, desktop, and related worktree
  changes remain present and were not modified.

Next:

- Search for a saved and an automatic playlist, then confirm both cards open,
  play, and expose the same context-menu actions as the Playlists page.

## Desktop album cover in the scrolled header

The album detail dock now shows the album cover beside its Back control. It
reuses the cache-aware artwork already resolved for the full album header,
disables the fade for cached images, and falls back to the bundled album icon
when artwork is unavailable. The cover is hidden below the desktop breakpoint.

Verification:

- Focused scrolled-header and album-page tests (5 passing)
- `pnpm --filter @peridot/web test` (279 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` for the changed files

Known checks:

- Verification used Node 24.15.0 and the repository-pinned pnpm 12.21.0 rather
  than the contributor-requested pnpm 11.25.0.

Known limits:

- Computer Use stopped before visual navigation because it could not verify the
  active Brave URL. Desktop and mobile visual QA remains pending.

Uncommitted changes:

- The optional scrolled-header cover, album-page wiring, regression assertions,
  decision record, and this handoff section.
- Existing Android, playback, toast, catalog, desktop, and related worktree
  changes remain present and were not modified.

Next:

- Open an album, scroll the full header out of view, and confirm the cover
  appears beside the dock title at desktop widths and stays hidden at phone
  widths.

## Track-derived album links use the canonical album ID

Track item-card titles now link to the canonical album without adding the
track's guest-inclusive artist credit as an album search filter. The same
shared route helper is used by track titles, tables, context menus, quick picks,
queues, and player surfaces. Tracks without an album ID retain the
artist-and-title fallback lookup.

Verification:

- Focused route and media-category tests (32 passing)
- `pnpm --filter @peridot/web test` (279 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` for the changed files

Known checks:

- Verification used Node 24.15.0 and the repository-pinned pnpm 12.21.0 rather
  than the contributor-requested pnpm 11.25.0.

Known limits:

- Live browser visual QA was not run after the route change.

Uncommitted changes:

- The shared album route selection, regression coverage, decision record, and
  this handoff section.
- Existing catalog-card, playback, notification, Android, and related worktree
  changes remain present and were not modified.

Next:

- Reload a collaborative track card and confirm its title opens the album and
  highlights the linked row.

## Compact Home heading spacing

Home now uses `space-y-6` between the greeting and the “Suggested for you”
section instead of `space-y-10`. The heading-to-content spacing inside the
suggestions section is unchanged.

Verification:

- Focused Home test (3 passing)
- `pnpm --filter @peridot/web test` (278 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks
- `git diff --check` for the changed files

Known limits:

- Browser visual QA was not completed because Computer Use could not verify the
  active Brave URL.

Uncommitted changes:

- The Home spacing adjustment, its layout regression assertion, and this handoff
  section.
- The existing concurrent Android, web, UI, lockfile, decision, and handoff
  changes remain present and were preserved.

Next:

- Reload Home and confirm the tighter greeting-to-suggestions gap at desktop and
  phone widths.

## Offline context-menu icons use the primary color

Track and album context menus now color the saved `cloudCheck` icon with the
shared primary token. The same action falls back to the muted foreground color
when the item is not saved offline. This aligns "Remove offline copy" and
"Remove offline" with the existing row, card, and header controls.

Verification:

- `pnpm --filter @peridot/web exec node --test test/context-menu.test.ts`
  (3 passing)
- `pnpm --filter @peridot/web test` (278 passing)
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`

Known limits:

- Live browser visual QA was not run for the context-menu hover state.

Uncommitted changes:

- The primary-color context-menu icon states, regression assertions, and this
  handoff section.
- Concurrent catalog, playback, toast, and Android changes remain present and
  were preserved.

Next:

- Open a saved track and album context menu in the browser and confirm both
  saved cloud icons use the primary color in dark and light themes.

## Catalog cards share unavailable behavior

Home, album lists, artist album grids, playlist lists, and search results already
render track, album, and playlist items through the shared `CatalogCard`. The
component previously retained an unavailable badge for collection items while
track cards used only their dimmed title and disabled control.

That kind-specific badge branch is removed. Every unavailable card now has the
same presentation: no status badge, a dimmed title with the localized native
unavailable label, and a muted cloud-off control in place of the play glyph.
The control remains actionable: tapping it clears the track's runtime
unavailable state and retries through the normal player path. Failed playback
re-establishes the unavailable state through the existing retry and skip flow.
The shared track table and playlist track list show the same cloud-off hint
beside resolved unavailable titles, and their controls use the same retry path.
Item-specific activation and menu behavior are otherwise unchanged.

Verification:

- Focused catalog-card, album-page, and playback-retry tests (9 passing)
- `pnpm --filter @peridot/web test` (278 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks

Known limits:

- Live visual QA was not rerun after this change.

Uncommitted changes:

- The shared card availability treatment, regression assertions, decision
  record, and this handoff section.
- Concurrent Sonner, playback, queue, and card-layout changes remain present and
  were preserved.

Next:

- Reload Home and confirm unavailable album and track cards render without a
  badge at desktop and phone widths.

## shadcn-vue Sonner toasts

The custom Reka toast manager and renderer are replaced by the shadcn-vue
Sonner `Toaster` wrapper and `vue-sonner`. Existing notification helpers,
localized message descriptors, success and error durations, top-right placement,
three-toast limit, close control, and right-swipe dismissal are retained.

The shared UI wrapper passes its icon slots through to the web application,
which supplies bundled Basil success, information, warning, error, and close
icons plus the Peridot spinner. Toast surfaces use standard Tailwind utilities
with Peridot popover, border, foreground, muted, and radius tokens instead of
the generated inline variable map or Lucide icons.

Verification:

- `pnpm --filter @peridot/ui test` (18 passing)
- Focused web notification and styling tests (10 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- `pnpm format:check`
- `pnpm version:check`
- `git diff --check`
- Confirmed the production CSS includes Sonner and the token-based toast class
  overrides

Known checks:

- `pnpm --filter @peridot/web test` reaches two unrelated failures in
  `album-pages.test.ts` and `player.test.ts` from concurrent catalog-card and
  player changes that were already present in the worktree. All focused toast,
  UI, notification, and styling tests pass.
- Verification used Node 24.15.0 and the repository-pinned pnpm 12.21.0 instead
  of the contributor-requested pnpm 11.25.0.

Known limits:

- Live browser visual QA could not run because Computer Use could not verify the
  current Brave URL. Success, error, stacking, dismissal, mobile placement, and
  reduced-motion behavior still need a manual browser pass.

Uncommitted changes:

- The shared Sonner wrapper, web toaster integration, localized toast content,
  exact dependency and lockfile update, icon registration, tests, decision
  record, and this handoff section.
- Concurrent playback, unavailable-track, catalog-card, queue, and player
  changes remain present and were preserved.

Next:

- Open the app in a browser at desktop and phone widths, trigger success and
  error notifications, and verify placement, stacking, close behavior, swipe
  dismissal, focus, and reduced motion.
- Resolve the two unrelated full-suite failures in the concurrent worktree
  changes before running the web suite again.

## Static Peridot document title

The generated web shell now includes `Peridot` as its default document title,
so tabs and windows identify the application before Vue and client code load.
Runtime route titles continue to replace the default after initialization.

Verification:

- Focused web branding regression test
- `pnpm --filter @peridot/web test`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- Generated `apps/web/.output/public/index.html` contains `<title>Peridot</title>`

Uncommitted changes:

- The static Nuxt head title and its branding regression assertion.
- This handoff and decision record.

Next:

- None.

## Offline removal failure toast

Track offline-removal failures now use a dedicated error toast, matching the
browser download failure treatment. The track row button and track context menu
explain that the file could not be made unavailable offline, while offline-save
failures keep the existing save-failure message.

Verification:

- Focused context-menu, offline SPA, notifications, and i18n tests (36 passing)
- `pnpm --filter @peridot/web test` (276 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks for all changed files

Known limits:

- Automated coverage verifies the removal-failure wiring and message resources;
  a browser or Android cache failure was not forced during live UI testing.

Feature files:

- `apps/web/app/lib/toasts.ts`
- `apps/web/app/components/TrackContextMenu.vue`
- `apps/web/app/components/TrackTable.vue`
- `apps/web/i18n/locales/en-US.json`
- `apps/web/app/lib/offline-toast.ts`
- `apps/web/test/context-menu.test.ts`
- `apps/web/test/offline-spa.test.ts`
- `apps/web/test/notifications.test.ts`

Uncommitted changes:

- The offline-removal error toast, copy, regression assertions, and this handoff
  section.
- Concurrent playback, unavailable-track, and catalog-surface changes were
  present before this work and remain untouched.

Next:

- Force an IndexedDB or Cache API removal rejection in a browser and on Android
  to confirm the visible error toast.

## Playback-failed tracks use unavailable UI state

Tracks that exhaust their three playback-start attempts now remain marked
unavailable for the current playback session after the player advances. The
existing unavailable treatment applies: dimmed artwork and title with disabled
play controls. Every visible track title also exposes the localized native
label “This title is unavailable.” Runtime-failed tracks are excluded from later
queue and collection playback, including saved offline copies whose audio
failed.

The shared web player owns the unavailable track IDs. Android includes the same
IDs in playback snapshots so the embedded UI receives the state after native
Media3 skips a failed item.

Verification:

- Focused playback, title-label, i18n, library, playlist, and mobile-player tests
  (46 passing)
- `pnpm --filter @peridot/web test` (278 passing)
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/android test`
- `pnpm --filter @peridot/android lint`
- Focused ESLint and Prettier checks on changed web, test, and documentation
  files
- `git diff --check`

Known checks:

- Concurrent toast/icon work in the worktree currently makes `pnpm lint` fail
  on an unused `props` binding in `LocalizedToastMessage.vue` and `pnpm
typecheck` fail on its `vue-sonner` and Basil info-icon imports. The changed
  playback files pass focused ESLint and the web production build.
- Repository-wide `pnpm format:check` also reports only those concurrent toast
  files; every file changed for this playback feature passes Prettier.

Known limits:

- The failure state is session-local and is not persisted across a full app
  relaunch.
- Native title-label presentation depends on the browser or embedded WebView;
  the localized `title` attribute is present in every track-title surface.
- Live browser and physical Android playback with deliberately corrupt audio
  were not exercised.

Feature files:

- `apps/web/app/composables/use-library-player.ts`
- `apps/web/app/lib/offline-playback.ts`
- `apps/web/app/lib/playlists.ts`
- `apps/web/app/components/TrackTable.vue`
- `apps/web/app/components/PlaylistTrackList.vue`
- `apps/web/app/components/CatalogCard.vue`
- `apps/web/app/components/QueueDrawer.vue`
- `apps/web/app/components/QuickPickTile.vue`
- `apps/web/app/components/QuickPickTileContent.vue`
- `apps/web/app/components/TrackContextMenu.vue`
- `apps/web/app/components/MobilePlayer.vue`
- `apps/web/app/layouts/default.vue`
- `apps/web/i18n/locales/en-US.json`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotPlaybackService.kt`

Uncommitted changes:

- Runtime unavailable-track state, UI availability wiring, Android snapshot
  propagation, regression tests, the decision record, and this handoff section.
- Earlier bounded automatic-skip and unavailable-badge changes in the working
  tree were preserved.

Next:

- Play a queue with a deliberately corrupt track on web and Android, then
  confirm the failed row dims and all of its play controls remain disabled after
  playback advances.

## Bounded unavailable-track queue advancement

Automatic skip after exhausted playback attempts now traverses the active queue
once even when repeat-all is enabled. The web shuffle path no longer renews its
shuffle pool during a forced skip, and Android resolves the next Media3 item
with repeat temporarily disabled before restoring the selected mode. Once no
later item remains, playback stops on the final error instead of looping.
Manual next and normal repeat-all completion still wrap.

Verification:

- Focused web queue and playback-start tests (10 passing)
- `pnpm --filter @peridot/web test` (275 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/android test`
- `pnpm --filter @peridot/android typecheck`
- `pnpm --filter @peridot/android lint`
- Focused web ESLint and Prettier checks

Known limits:

- Automated verification covers the native skip policy and web transition
  wiring; a live device queue where every track fails was not exercised.

Feature files:

- `apps/web/app/composables/use-library-player.ts`
- `apps/web/test/playback-start-retry.test.ts`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PlaybackSkipPolicy.kt`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotPlaybackService.kt`
- `apps/android/android/app/src/test/java/app/peridot/android/playback/PlaybackSkipPolicyTest.kt`
- `docs/DECISIONS.md`

Uncommitted changes:

- The bounded automatic-skip fix, regression coverage, decision record, and this
  handoff section.
- Concurrent unavailable-badge and catalog-surface changes were present before
  this work and remain untouched.

Next:

- Create a queue whose tracks all fail to load with repeat-all enabled, then
  verify it stops after one pass in both a browser and the Android app.

## Unavailable track badges removed

Resolved tracks no longer show a redundant “Unavailable” badge in shared track
tables, playlist track lists, or catalog cards. Titles remain dimmed and play
controls remain disabled; unavailable catalog-card playback keeps its localized
tooltip. “Available offline” remains visible for saved tracks. Album, artist,
playlist, and unresolved playlist-entry status labels are unchanged.

Verification:

- Focused library, playlist, and catalog-card tests (38 passing)
- `pnpm --filter @peridot/web test` (275 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- Focused Prettier check and `git diff --check`

Known checks:

- Verification used Node 24.15.0 and the repository-pinned pnpm 12.21.0 rather
  than the contributor-requested pnpm 11.25.0.

Known limits:

- Live browser visual QA was not run.

Uncommitted changes:

- Unavailable track badge removal in shared track surfaces, regression
  assertions, the decision record, and this handoff section.

Next:

- Confirm unavailable and available-offline tracks at desktop and phone widths
  in an album, playlist, and card grid.

## Queue endpoint TypeScript regression

The queue absence test now probes GET and PUT with separate literal request
objects. The previous method union bypassed Fastify's method-specific `inject`
overloads, and its conditional `payload` conflicted with
`exactOptionalPropertyTypes`. The test behavior and 404 assertions are
unchanged.

Verification:

- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server exec tsx scripts/run-tests.ts --test-name-pattern "playback queue state is not exposed by the server"` (39 passing)
- Focused Prettier check for `apps/server/test/queue.test.ts`

Uncommitted changes:

- The queue test typing correction and this handoff section.

Next:

- No follow-up required.

## Scrolled detail header dock

Album, artist, playlist, audiobook, and podcast detail pages now show a compact
fixed header after their full header card has scrolled completely out of view.
The dock sits below the existing application top bar and provides an icon-only
history-aware Back control, the collection title, and its play/pause control.

The compact and full playback controls share one handler, playable state,
playback-active state, and localized label for each detail surface. The dock
therefore preserves the existing immediate pause feedback, pending collection
cancellation, offline fallback, and unavailable disabled state.

Verification:

- Focused scrolled-header, album, artist, playlist, styling, and back-navigation
  tests (14 passing)
- `pnpm --filter @peridot/web test` (275 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- Focused Prettier check for all changed web and test files
- `git diff --check`

Known limits:

- Live browser visual QA at desktop and mobile widths was not run.
- `pnpm format:check` remains blocked by the pre-existing formatting issue in
  `apps/desktop/src-tauri/tauri.conf.json`.

Feature files:

- `apps/web/app/components/ScrolledHeader.vue`
- `apps/web/app/components/BackButton.vue`
- `apps/web/app/lib/scrolled-header.ts`
- `apps/web/app/components/MediaCollectionDetail.vue`
- `apps/web/app/pages/albums/[album].vue`
- `apps/web/app/pages/artists/[artist].vue`
- `apps/web/app/pages/playlists/[playlist].vue`

Uncommitted changes:

- The shared scrolled header, icon-only back mode, detail-page integrations,
  regression coverage, decision record, and this handoff section.
- Concurrent catalog-card, mobile-grid, track-highlight, and related web changes
  were preserved.

Next:

- Exercise each detail surface at phone and desktop widths while scrolling in
  both directions and while the collection is playing, paused, unavailable,
  and still resolving playback.

## Two-column mobile card grids

All page-level card lists now use two columns at mobile widths. The shared
`VirtualCardGrid` starts standard and wide layouts at two columns and changes
the compact layout from three columns to two. Home’s mixed catalog cards and
Search’s recent album cards apply the same mobile rule directly.

This covers Albums, Artists, Playlists, Audiobooks, Podcasts, artist album
collections, Search result sections, and Home.

Verification:

- Focused virtual-grid, Home, and Search tests (8 passing)
- `pnpm --filter @peridot/web test` (272 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Live browser visual QA at mobile widths was not run.

Feature files:

- `apps/web/app/components/VirtualCardGrid.vue`
- `apps/web/app/pages/index.vue`
- `apps/web/app/pages/search.vue`
- `apps/web/test/virtual-scroll.test.ts`
- `apps/web/test/home-page.test.ts`

Uncommitted changes:

- The shared two-column mobile grid rule, Home and Search adjustments,
  regression coverage, decision record, and this handoff section.
- Concurrent catalog-card, track-highlight, and related web changes were
  preserved.

Next:

- Check Home, Albums, Artists, Playlists, Audiobooks, Podcasts, artist detail,
  and Search at phone width and confirm each card row has two evenly sized
  cards without horizontal overflow.

## Linked track row highlight

Album track links now keep their target row highlighted before returning to the
normal background. The existing `#track-title-*` hash continues to identify and
scroll the row, so link generation did not need a new route format. The shared
track table applies `bg-primary/10` for two seconds, then fades the highlight
out.

Verification:

- `pnpm --filter @peridot/web exec node --test test/album-pages.test.ts`
  (2 passing)
- `pnpm --filter @peridot/web test` (272 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks

Known limits:

- Live browser visual QA was not run for the highlight timing.

Feature files:

- `apps/web/app/components/TrackTable.vue`
- `apps/web/test/album-pages.test.ts`

Uncommitted changes:

- The linked-row highlight, regression coverage, decision record, and this
  handoff section.
- Concurrent catalog-card and related web changes were preserved.

Next:

- Open the supplied album track link at desktop and phone widths and confirm the
  selected row scrolls into view, holds the highlight for two seconds, then fades
  back to normal.

## Shared catalog cards

Album, playlist, and track card surfaces now use one polymorphic
`CatalogCard`. Home renders its liked playlist and mixed quick picks through one
keyed collection, while album lists, artist album grids, playlist lists, and
compact search results use the same component. `AlbumCard` and `PlaylistCard`
were removed, and `QuickPickTile` is now limited to the sidebar tile layout.

The shared card preserves album playback and complete-offline-copy rules, track
direct playback and artist links, playlist playback and unavailable counts, and
the existing mobile and unavailable-control behavior. Albums and music tracks
show the card like button; playlist cards do not. Playlist likes, rename, and
delete remain in `PlaylistContextMenu`, with automatic playlists restricted to
play and open.

Context menus are selected by item type and receive only the listeners that
their component supports: album collection actions, track playback and catalog
actions, or playlist management. This prevents actions from leaking between
item kinds.

Verification:

- `pnpm --filter @peridot/web test` (272 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm lint`
- Focused Prettier formatting on changed web files

Known limits:

- Live browser visual QA at desktop and phone widths was not run.

Feature files:

- `apps/web/app/components/CatalogCard.vue`
- `apps/web/app/components/PlaylistContextMenu.vue`
- `apps/web/app/lib/catalog-cards.ts`
- `apps/web/test/catalog-card.test.ts`

Uncommitted changes:

- The shared card refactor, item-specific menus, regression coverage, decision
  record, and this handoff section.
- Concurrent liked-tracks cover darkening remains present and unchanged.

Next:

- Open Home, Albums, Playlists, and compact Search results at desktop and phone
  widths. Right-click each item type and confirm the matching menu appears, and
  confirm tracks show a like button while playlists do not.

## Liked tracks cover darkening

The generated liked-tracks artwork now uses `bg-primary/40`, replacing the
previous 60% primary tint. The white Basil heart and shared playlist card/detail
presentation are unchanged.

Verification:

- Focused liked-tracks artwork test (1 passing)
- Focused ESLint check
- Focused Prettier check
- Web typecheck passes; the temporary untracked playlist playback helper was
  folded into `CatalogCard` during the shared-card refactor
- `git diff --check`

Known limits:

- Live browser visual QA was not run.

Feature files:

- `apps/web/app/components/PlaylistCover.vue`
- `apps/web/test/playlists.test.ts`

Uncommitted changes:

- The darker liked-tracks cover, its regression assertion, decision record, and
  this handoff section.
- The shared catalog card refactor preserves this darker cover while absorbing
  playlist playback into the card.

Next:

- Open the Liked tracks card and detail at desktop and phone widths and confirm
  the darker primary-derived cover has sufficient separation from the white
  heart.

## History-aware catalog back buttons

Album, artist, playlist, audiobook, and podcast detail pages now use one generic
Back button. It returns one step through browser history when an application
history entry is available and otherwise navigates to Home. The specific
catalog links in empty and error states remain destination-aware. The shared
control uses a wider 10rem hitbox with its icon and label aligned left.

Verification:

- Focused navigation, album, artist, and styling tests (9 passing)
- Focused navigation test after widening the hitbox (3 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web test` (268 passing; one unrelated existing
  `likes-ui.test.ts` Like-button size assertion failure)
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` on the feature files

Known check:

- The repository pins pnpm 12.21.0 while contributor instructions require
  11.25.0. Verification used Node 24.15.0 and pnpm 12.21.0.

Known limits:

- Live browser QA was not run for in-app back traversal, direct deep-link
  fallback, or desktop and phone layout.

Feature files:

- `apps/web/app/components/BackButton.vue`
- `apps/web/app/lib/navigation.ts`
- `apps/web/app/pages/albums/[album].vue`
- `apps/web/app/pages/artists/[artist].vue`
- `apps/web/app/pages/playlists/[playlist].vue`
- `apps/web/app/components/MediaCollectionDetail.vue`
- `apps/web/test/back-navigation.test.ts`
- `apps/web/test/album-pages.test.ts`
- `apps/web/test/artist-pages.test.ts`
- `apps/web/test/styling.test.ts`

Uncommitted changes:

- The shared history-aware back button, its detail-page integrations, tests,
  decision record, and this handoff section.
- Concurrent working-tree changes were preserved.

Next:

- Open a catalog detail from its list and confirm Back returns to that list.
  Then load a detail route directly and confirm Back opens Home.

## Home album cards

Album items in Home quick picks now use the shared `AlbumCard` component from
the album list. Track quick picks remain on `QuickPickTile`. This makes album
playback, liking, unavailable state, metadata links, and context-menu behavior
consistent across both surfaces.

Verification:

- Focused Home test (3 passing)
- `pnpm --filter @peridot/web test` (268 passing; one unrelated existing
  `likes-ui.test.ts` Like-button size assertion failure)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused Prettier and ESLint checks
- `git diff --check`

Known limits:

- Live browser visual QA at desktop and phone widths was not run.

Feature files:

- `apps/web/app/pages/index.vue`
- `apps/web/test/home-page.test.ts`

Uncommitted changes:

- Home album-card reuse, its regression assertion, decision record, and this
  handoff section.
- Concurrent working-tree changes were preserved.

Next:

- Open Home with album quick picks and confirm the cards match the Albums list
  at desktop and phone widths.

## Album header actions

The album detail header card now owns the album context menu across its full
surface. The separate offline button is removed from the header, and the like
action occupies the former top-right control position. Whole-album offline
storage remains available from the album context menu.

Verification:

- Focused album, context-menu, and offline tests (25 passing)
- `pnpm --filter @peridot/web typecheck`
- Prettier check on the changed files
- `git diff --check`

Known limits:

- Live browser visual QA at desktop and phone widths was not run.

Feature files:

- `apps/web/app/pages/albums/[album].vue`
- `apps/web/test/album-pages.test.ts`
- `apps/web/test/context-menu.test.ts`
- `apps/web/test/offline-spa.test.ts`

Uncommitted changes:

- Album header context-menu and action placement, its regression assertions, and
  this handoff section.
- Concurrent working-tree changes were preserved.

Next:

- Right-click the album artwork, metadata, and action row, then verify the
  top-right like control and header layout at desktop and phone widths.

## Playlist card layout alignment

Playlist cards now use the same cover-to-text spacing, compact title treatment,
type icon, and metadata width as the album and track cards. The change applies
to Home and the Playlists surface through the shared `PlaylistCard`.

Verification:

- Focused playlist tests (7 passing)
- `pnpm --filter @peridot/web test` (265 passing; one unrelated existing
  `likes-ui.test.ts` Like-button size failure)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Live browser visual QA at desktop and phone widths was not run.

Feature files:

- `apps/web/app/components/PlaylistCard.vue`
- `apps/web/test/playlists.test.ts`

Uncommitted changes:

- Playlist card layout alignment, its regression assertion, and this handoff.
- Concurrent Home, catalog, player, source, and other in-progress changes were
  preserved.

Next:

- Open Home with liked tracks and confirm the Liked tracks card has the same
  title and metadata alignment as the adjacent album and track cards.

## Playback failures skip after three attempts

The web and Android players now limit a track to three total playback attempts.
After the initial attempt and two automatic retries fail, the player advances to
the next queue item instead of stopping on the failed track. The exhausted
attempt budget cannot wrap repeat-all back to that same track.

Autoplay blocking still requests user interaction, and authentication redirects
remain terminal without consuming the queue.

Verification:

- Focused playback retry and player tests (5 passing)
- `pnpm --filter @peridot/web test` (265 passing; one unrelated existing
  `likes-ui.test.ts` icon-size assertion failure)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/android test`
- `pnpm --filter @peridot/android lint`
- Focused Prettier and ESLint checks
- `git diff --check`

Known check:

- The repository pins pnpm 12.21.0 while contributor instructions require
  11.25.0. Verification used 11.25.0 with the package-manager version check
  bypassed.

Known limits:

- Exhausting a one-track queue stops playback because there is no next track.
- Live browser and physical Android playback with deliberately corrupt audio
  were not exercised.

Feature files:

- `apps/web/app/lib/playback-start-retry.ts`
- `apps/web/app/composables/use-library-player.ts`
- `apps/web/test/playback-start-retry.test.ts`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PlaybackStartRetryPolicy.kt`
- `apps/android/android/app/src/main/java/app/peridot/android/playback/PeridotPlaybackService.kt`
- `apps/android/android/app/src/test/java/app/peridot/android/playback/PlaybackStartRetryPolicyTest.kt`

Uncommitted changes:

- Bounded playback-start retries and queue skipping, decision record, and this
  handoff section.
- Concurrent working-tree changes were preserved.

Next:

- Play a queue whose first track has a deliberately corrupt source and confirm
  three attempts occur before the second track starts on web and Android.

## Home content simplification

The “Suggested for you” Home surface now renders the automatic Liked tracks
playlist card and mirrors the existing mixed Quick pick content with the shared
`QuickPickTile` component using its card layout. All items share one equal-sized
card grid. The former catalog album and track suggestions, liked-artist ranking,
Tracks heading, and separate Playlists section are removed.

Home reuses the quick-picks query and refreshes it through the shared
playback-history version signal. Loading, error, retry, and empty states cover
the combined liked-card and quick-pick surface.

Verification:

- Focused Home, Quick pick, and playlist tests (13 passing)
- `pnpm --filter @peridot/web test` (265 passing; one unrelated existing
  failure in `likes-ui.test.ts` for the Like button icon size)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Browser visual QA was unavailable because Computer Use could not verify the
  local browser URL.

Feature files:

- `apps/web/app/pages/index.vue`
- `apps/web/test/home-page.test.ts`
- `apps/web/i18n/locales/en-US.json`

Uncommitted changes:

- Home content simplification, its tests, translations, decision record, and
  this handoff.
- Concurrent working-tree changes were preserved.

Next:

- Open Home with liked tracks and play history, then verify the equal-sized
  uncategorized cards at desktop and phone widths and confirm a newly played
  item refreshes in Quick pick.

## Track rows open the track context menu

Track tables and playlist track lists now open the track context menu from
anywhere on a track row. Artist and album links stop context-menu bubbling and
continue to open their matching catalog menus. Playlist references without a
resolved local track retain their plain-row rendering.

Verification:

- Focused context-menu, catalog-link, playlist, and styling tests (15 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` on all feature files
- Full web test run; the only failure is the unrelated `LikeButton` size
  expectation in `likes-ui.test.ts`

Known limits:

- Live browser pointer QA against a populated playlist was not run.

Feature files:

- `apps/web/app/components/TrackRowContextMenu.vue`
- `apps/web/app/components/PlaylistTrackList.vue`
- `apps/web/app/components/ArtistLink.vue`
- `apps/web/app/components/AlbumLink.vue`
- `apps/web/test/context-menu.test.ts`
- `apps/web/test/catalog-links.test.ts`

Uncommitted changes:

- Row-level track context menus, catalog-link event boundaries, tests, decision
  record, and this handoff section.
- Concurrent working-tree changes were preserved.

Next:

- Right-click an empty part, title, duration, and action area of a playlist track
  row, then confirm artist and album names open their catalog menus instead.

## Playlist routes and liked tracks page

The playlist list now lives at `pages/playlists/index.vue` instead of
`pages/playlists.vue`. `/playlists` and `/playlists/:playlist` are sibling
routes, so the automatic liked-tracks detail no longer triggers Nuxt E4016.

The standalone `/liked` page is removed. The sidebar keeps its Liked Tracks
entry and liked-count display, both targeting `/playlists/liked`.

Verification:

- Focused playlist, routing, likes, search, pagination, and scrolling tests
  (19 passing)
- `pnpm --filter @peridot/web test` (267 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check` on the changed routes, tests, and layout

Known limits:

- Browser visual QA was not run.

Feature files:

- `apps/web/app/layouts/default.vue`
- `apps/web/app/pages/playlists/index.vue`
- `apps/web/app/pages/playlists/[playlist].vue`
- `apps/web/test/library-page-headers.test.ts`
- `apps/web/test/playlists.test.ts`

Uncommitted changes:

- Playlist route restructuring, standalone liked-page removal, sidebar count
  correction, tests, and documentation.
- Concurrent working-tree changes were preserved.

Next:

- Open `/playlists` and `/playlists/liked` in the running client and confirm the
  Nuxt E4016 warning no longer appears.

## Topbar task spinner removed

The default and settings headers no longer render task progress. Active server
and offline download work remains visible in Settings navigation, and the
Tasks page remains the detailed activity view. The server-offline badge remains
in both headers.

Verification:

- Focused header, task, settings, offline, and styling tests (61 passing)
- `pnpm --filter @peridot/web test` (267 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Browser visual QA at desktop and mobile widths was not run.

Known check:

- The repository pins pnpm 12.21.0 while contributor instructions require
  11.25.0. Verification used 11.25.0 with the package-manager version check
  bypassed for the command.

Feature files:

- `apps/web/app/components/ServerConnectionIndicator.vue`
- `apps/web/app/layouts/default.vue`
- `apps/web/app/layouts/settings.vue`
- `apps/web/app/lib/server-connection.ts`
- `apps/web/test/task-progress.test.ts`

Uncommitted changes:

- Header task-spinner removal, retained offline badge, tests, translations,
  decision record, and this handoff.
- Concurrent work already present in the worktree was preserved.

Next:

- Verify the headers at desktop and mobile widths with active server and offline
  download tasks, then induce a connection loss to confirm the offline badge.

## Searchable add-to-playlist submenu

Track context menus now open a nested playlist picker instead of a dialog. The
submenu preloads every paginated manual playlist, focuses a search field when it
opens, filters names locally, marks existing memberships, and keeps create,
pending, empty, loading, and error states within the menu. Creating a playlist
still uses the existing name dialog and adds the selected track immediately.

The automatic liked-tracks playlist remains excluded because its membership is
derived from likes and cannot be edited directly.

Verification:

- Focused web tests for playlists, context menus, styling, and scrolling surfaces
  (13 passing)
- `pnpm --filter @peridot/web test` (268 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web build`

Known limits:

- Opening the submenu preloads all playlist pages. This is intentionally bounded
  by the user's playlist count and may take longer to open for very large lists.
- Live pointer and keyboard visual QA against a running development server was
  not performed.

Feature files:

- `apps/web/app/components/AddTrackToPlaylistSubmenu.vue`
- `apps/web/app/components/TrackContextMenu.vue`
- `apps/web/app/lib/playlists.ts`
- `apps/web/i18n/locales/en-US.json`
- `apps/web/test/playlists.test.ts`

Uncommitted changes:

- The playlist submenu, filtering helper, translations, tests, decision record,
  and this handoff.
- Concurrent working-tree changes were preserved.

Next:

- Open a track menu at desktop and mobile widths, verify search keyboard
  navigation, add to an existing playlist, create-and-add, and confirm an add
  failure remains visible before retrying.

## Immediate collection playback feedback

Available collection play buttons now switch to pause on the click that starts
loading tracks, rather than waiting for the audio element to begin playback.
The shared player records a typed collection target for albums, artists,
playlists, audiobook and podcast collections, and quick picks. A second click
during loading cancels the request.

Optimistic playback intent is isolated from the audio engine. Pending collection
starts cannot resume the previously selected track; audio preparation begins
only after the requested tracks resolve.

Verification:

- `pnpm --filter @peridot/web test` (267 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits:

- Browser visual QA under throttled network conditions was not run.

Feature files:

- `apps/web/app/composables/use-library-player.ts`
- `apps/web/app/components/AlbumCard.vue`
- `apps/web/app/pages/albums/[album].vue`
- `apps/web/app/pages/artists/[artist].vue`
- `apps/web/app/components/PlaylistCard.vue`
- `apps/web/app/pages/playlists/[playlist].vue`
- `apps/web/app/components/MediaCollectionCard.vue`
- `apps/web/app/components/MediaCollectionDetail.vue`
- `apps/web/app/components/QuickPickTile.vue`
- `apps/web/test/player.test.ts`

Uncommitted changes:

- Shared optimistic collection playback intent, immediate pause-state wiring,
  cancellation behavior, translations, tests, decision record, and this handoff.
- Concurrent artwork, catalog-link, mobile UI, scrolling, preference, player,
  source, and other in-progress changes remain in the worktree and were
  preserved.

Next:

- Throttle the browser network and confirm album, artist, playlist, audiobook,
  podcast, and quick-pick controls show pause immediately, then remain responsive
  when a second click cancels loading.

## Cached cover-art images skip fade-in

Shared artwork now reports whether its bytes came from the per-user artwork
cache. Cached track, album, artist, playlist, audiobook, podcast, and player
artwork renders without the fade transition; network-loaded artwork retains the
existing fade. All artwork surfaces pass the cache state through the shared
`FadeInImage` component.

Verification:

- `pnpm --filter @peridot/web exec node --test test/image-fade.test.ts`
  (5 passing)
- `pnpm --filter @peridot/web test` (267 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- `pnpm version:check`
- Focused ESLint on all feature files
- Focused Prettier check on the cache helper, shared image, unaffected artwork
  consumers, and tests
- `git diff --check` on the feature files

Known checks:

- `pnpm format:check` reports only the unrelated
  `apps/desktop/src-tauri/tauri.conf.json`.

Known limits:

- Browser-level visual QA of cache-hit and first-load playback has not run.

Uncommitted changes:

- Cache-first artwork loading, cache-aware `FadeInImage`, artwork consumer
  wiring, tests, decision record, and this handoff.

Next:

- Visually verify a cached cover on album/card/player remount and a first-time
  uncached cover in the running web client.

## Automatic liked-tracks playlist

Liked tracks is now exposed as a virtual automatic playlist with the reserved ID
`liked` and route `/playlists/liked`. It appears first on Home and Playlists,
contains only liked music tracks in newest-like-first order, keeps unavailable
tracks visible for downloaded playback, and supports track search, playback,
and the standard playlist offline-save flow. Its track list omits like controls
because every entry is already liked.

The generated cover is a large white Basil heart on a darker primary-derived
background, so it remains linked to the active theme. The primary tint uses
60% opacity after a final darkness adjustment. Compact like controls use a
16px heart while retaining their 24px hit target.
Playlist cards expose only their open and play actions; offline saving remains
available from the playlist detail surface and bulk download flows.
The playlist cannot be liked, renamed, reordered, edited, or deleted. Those
mutations return `409 automatic_playlist_read_only`, and the automatic entry is
excluded from manual add-to-playlist choices. The standalone `/liked` page has
been removed; the sidebar opens the automatic playlist directly.

Verification:

- Focused playlist, styling, and download-task tests (12 passing)
- `pnpm --filter @peridot/web test` (267 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused Prettier checks on the changed files
- `pnpm --filter @peridot/web build`
- `pnpm --filter @peridot/server test` (193 passing)
- `pnpm --filter @peridot/web test` (263 passing)
- `pnpm test` (all non-Android test packages passing)
- `pnpm --filter @peridot/web typecheck`
- Server source typecheck
- Contract, server, and web production builds
- `pnpm db:validate` (17-migration graph current)
- `pnpm lint`
- Focused ESLint on all changed feature files

Known checks:

- `pnpm typecheck` reaches unrelated existing errors in
  `apps/server/test/queue.test.ts`.
- `pnpm format:check` reports only the unrelated
  `apps/desktop/src-tauri/tauri.conf.json`.

Known limits:

- Query invalidation updates the playlist immediately within the running app;
  there is no new cross-device realtime like event.
- The automatic detail loads its complete liked-track list, consistent with
  existing manual playlist details.
- Browser visual QA of the darkened cover and simplified playlist-card actions
  was not performed.

Feature files:

- `packages/contracts/src/index.ts`
- `apps/server/src/playlist-routes.ts`
- `apps/web/app/components/PlaylistCover.vue`
- `apps/web/app/components/PlaylistCard.vue`
- `apps/web/app/pages/playlists/[playlist].vue`
- `apps/web/app/composables/use-likes.ts`
- `apps/server/test/playlists.test.ts`
- `apps/web/test/playlists.test.ts`

Uncommitted changes:

- Automatic liked-tracks playlist implementation, tests, OpenAPI schemas,
  translations, decision record, and this handoff.
- Concurrent queue removal, catalog-link, unavailable-album, player, source,
  and formatting changes remain in the worktree and were preserved.

Next:

- In a populated development client, verify the automatic card on Home and
  Playlists, then unlike a track and confirm it disappears immediately and its
  downloaded copy remains playable.

## Unavailable album card playback

Album cards now expose their play control as disabled when neither the connected
catalog nor saved offline copies can provide a playable track. Pointer and
keyboard focus show a localized “Unavailable” tooltip. An actively playing album
remains enabled so it can still be paused if its source becomes unavailable.
`album.available` is treated as the authoritative immediate-play state, including
offline copies. Offline activation resolves saved tracks before checking any
live-server credentials, so an available album can start from local audio while
the connection remains lost. Complete albums remain playable from local storage;
partial offline saves are marked unavailable because the card starts the whole
collection.

Verification:

- Focused album page test (2 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `pnpm --filter @peridot/web test` (260 passing; one unrelated existing
  failure in `library-page-headers.test.ts` for the liked-songs redirect page)

Known limits:

- Browser visual QA with a real unavailable album was not run.

Feature files:

- `apps/web/app/components/AlbumCard.vue`
- `apps/web/test/album-pages.test.ts`

Uncommitted changes:

- Unavailable album playback state, tooltip, regression assertions, decision
  record, and this handoff.
- Concurrent catalog-link, mobile UI, scrolling, preference, player, source, and
  other in-progress changes remain in the worktree and were preserved.

Next:

- Open a catalog grid with an unavailable album at desktop and phone widths,
  confirm the control is dimmed, the tooltip appears by pointer and keyboard,
  and the card cannot start playback.

## Device-local player state

The player now persists its selected track, active queue, shuffle state, and
playback position in browser-local storage scoped by server and user. Reloading
or reopening Peridot restores the snapshot with playback paused. The web client
no longer reads or writes `/api/queue`, and the server queue routes, contracts,
database models, and API documentation have been removed. The migration was
applied to the development database; a pre-migration backup was created at
`apps/server/backups/peridot-20261120T174437856Z-before-91a30409-to-65d6faa9.db`.

Verification:

- `pnpm --filter @peridot/web test` (261 passing)
- `pnpm --filter @peridot/server test` (192 passing)
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm db:validate` (17-migration graph current at `65d6faa975e2`)
- Contract, server, and web production builds

Known limits:

- Playback state is device-local and does not follow an account to another
  device.
- Clearing site data removes the local snapshot.
- A restored queue starts paused because browsers do not permit unattended audio
  playback.
- Existing server-backed queue rows are discarded by the migration rather than
  copied into any browser-local snapshot. The pre-migration database backup
  retains those rows while it remains available.

Feature files:

- `apps/web/app/lib/player-storage.ts`
- `apps/web/app/composables/use-library-player.ts`
- `apps/web/app/components/QueueDrawer.vue`
- `apps/web/test/player-storage.test.ts`
- `apps/web/test/player.test.ts`
- `apps/server/migrations/app/20261120T1740_local_player_state`
- `apps/server/src/prisma/contract.prisma`

Uncommitted changes:

- Local-only player state, removal of the database queue API and tables, tests,
  contract artifacts, migration, decisions, development notes, and this handoff.
- Concurrent catalog-link, mobile UI, scrolling, album-card, preference, and
  source changes remain in the worktree and were preserved.

Next:

- In a running browser, play a track, advance its position, reload, and confirm
  the same selected track, queue order, and paused progress are restored.

## Mobile overflow text stays still by default

Default `ScrollingText` labels no longer start scrolling automatically solely
because the viewport is below the mobile breakpoint. Catalog metadata now waits
for pointer or focus interaction on every viewport, while explicitly configured
`mode="always"` text such as active player metadata retains automatic scrolling.

Verification:

- `pnpm --filter @peridot/ui test` (17 passing)
- Focused scrolling-text surface test (2 passing)
- `pnpm --filter @peridot/web typecheck`
- Focused ESLint and Prettier checks

Known limits:

- Browser visual QA at a phone viewport was not run.

Feature files:

- `packages/ui/src/components/ui/scrolling-text/ScrollingText.vue`
- `packages/ui/src/lib/scrolling-text.ts`
- `packages/ui/test/components.test.ts`

Uncommitted changes:

- Mobile automatic-scroll removal, its regression assertion, decision record,
  and this handoff.
- Concurrent catalog-link, playback-state, album-card, preference, source, and
  other in-progress changes remain in the worktree and were preserved.

Next:

- Open a catalog page at a phone viewport and confirm long titles remain still
  until interacted with, while the active player text still rolls when needed.

## Mobile album card playback

Album card play buttons are now permanently visible below the `sm` breakpoint.
They use a 44px touch target and a larger play or pause icon on phones, while
desktop cards retain the existing hover- and focus-revealed behavior.

Verification:

- Focused album page test (2 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- Full web test run: 3 unrelated failures remain in the concurrent shared-link,
  queue, and artist scrolling work.

Known limits:

- Browser visual QA at a phone viewport was not run.

Feature files:

- `apps/web/app/components/AlbumCard.vue`
- `apps/web/test/album-pages.test.ts`

Uncommitted changes:

- Mobile album-card playback sizing and visibility, its regression assertion,
  decision record, and this handoff.
- Concurrent catalog-link, preference, source, and other in-progress changes
  remain in the worktree and were preserved.

Next:

- Check the albums, home, search, and artist grids on a phone and confirm the
  44px control remains clear of album titles and the like action.

## Catalog artist and album name links

Catalog artist and album names now share link and context-menu behavior across
cards, detail headers, track tables, playlist rows, add-to-playlist results,
the queue, and desktop and mobile player surfaces. Artist-only references
resolve their full summary when a menu opens before enabling collection
actions. Album references derived from tracks reuse the track's album identity.

Verification:

- `pnpm --filter @peridot/web test` (261 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks on all changed files

Feature files:

- `apps/web/app/components/ArtistLink.vue`
- `apps/web/app/components/AlbumLink.vue`
- `apps/web/app/components/TrackArtistLinks.vue`
- `apps/web/app/components/ArtistContextMenu.vue`
- `apps/web/app/components/TrackTable.vue`
- `apps/web/app/components/ArtistCard.vue`
- `apps/web/app/components/PlaylistTrackList.vue`
- `apps/web/app/lib/library.ts`
- `apps/web/test/catalog-links.test.ts`

Known limits:

- Artist and album labels inside external metadata candidate results remain
  provider data rather than local catalog links.

Uncommitted changes:

- Shared catalog-name links, surface integrations, tests, app specification,
  decision record, development notes, and this handoff.
- Concurrent preference, player, queue, contract, and duplicate-detection
  changes remain in the worktree and were preserved.

Next:

- Verify artist and album right-click menus on a desktop pointer device and a
  touch/pen device after signing in with a populated library.

## Legacy liked-title preference initialization removed

An account without a stored liked-titles preference now initializes from the
enabled default. The client no longer reads or imports the legacy version 1
browser value. Current version 2 local storage remains a cache of the
server-authoritative preference.

Verification:

- `pnpm --filter @peridot/web test` (259 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Focused ESLint and Prettier checks
- `git diff --check`

Feature files:

- `apps/web/app/lib/library-settings.ts`
- `apps/web/app/composables/use-library-settings.ts`
- `apps/web/test/library-settings.test.ts`

Known limits:

- Accounts that have already initialized a server preference retain that value.
- A browser-level upgrade scenario with a legacy `false` value has not been
  exercised manually.

Uncommitted changes:

- Legacy preference removal, tests, decision and development notes, and this
  handoff.

Next:

- Sign in on a device containing a version 1 local value for an account with an
  uninitialized server preference and confirm the switch initializes to enabled.

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
without a stored value is initialized once from the enabled default.

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
