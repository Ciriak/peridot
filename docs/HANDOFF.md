# Handoff

Last updated: 2026-11-18.

## Catalog paging no longer conflicts with library changes

Track, album, artist, audiobook, and podcast lists now continue from stable
sort-key plus ID cursors. New or changed catalog rows during a scan no longer
turn the next page request into a `409`, and rows inserted before the current
position do not duplicate the next page. Published-time track ordering keeps
offset paging because of its explicit null ordering, but those offsets no longer
depend on the catalog revision.

Legacy offset cursors remain readable. When an incompatible cursor still
reaches the web client, recovery now rebuilds the same number of loaded pages
from the first page instead of refetching with the invalid cursor. All shared
auto-load sentinels now show the Peridot spinner and loading label at the bottom
while the next page or recovery runs. A sentinel must leave the viewport before
it can request another page, so scroll anchoring no longer loads the complete
collection automatically.

Persisted catalog infinite queries now restore at most their first page.
Clearing the active query cache once removed pages accumulated by the earlier
cascade; the persistence bound prevents those pages from recurring. The separate
offline catalog snapshot is unaffected.

Catalog card grids use responsive-row virtualization with
`@tanstack/vue-virtual`, and shared track tables virtualize fixed rows against
the main content scroll element. The existing responsive layouts and gaps are
unchanged. Long lists now mount only visible rows and their overscan instead of
mounting every loaded card or track.

Live mobile inspection reproduced the original page-append jump from about
5,563px to 14,429px with a 218ms frame. Browser scroll anchoring was retaining
the loading footer as rows were inserted. Scroll anchoring is now disabled for
the complete virtual list root. A subsequent 40-frame scroll across a page
append advanced in even 500px steps with no reversal while 8-12 card rows were
mounted. The remaining append frame measured 173ms; catalog persistence now
serializes only its first page instead of every loaded page, avoiding work that
grows with the loaded collection.

Checks completed:

- Full workspace suite (247 web, 184 server, 17 UI, and 5 desktop tests)
- Web type check
- Production web build
- `pnpm check`
- `git diff --check`

Known limits: append-frame latency was measured on the live mobile profile but
not profiled on desktop. Published-time offset pages can still shift when rows
are inserted before the current offset, although they no longer fail with
`409`. Changes remain uncommitted on
`feature/cover-art-worker`; no commit, push, tag, publication, or deployment was
performed.

Next: profile an append on the desktop layout and on a low-power phone if the
remaining one-off page-append frame is still perceptible.

## Track navigation and metadata progress polish

Every music credit now uses the shared artist-link component across the main
track table, playlist rows, Quick picks, queue and player metadata, and the
playlist track picker. Playlist and picker credits respect the same artist
normalization as the other catalog surfaces.

The desktop fixed-player artwork now opens the current music track's album.
Tracks without album or artist metadata keep non-navigational artwork, and the
title retains its existing anchored album or artist fallback route.

Liked songs now sets `Liked songs — Peridot` as its browser title and uses the
shared navigation label for the visible heading, matching the other top-level
library pages.

Settings → Metadata now ties provider progress rings to the running shared
metadata task. Every enabled provider row displays the same task progress,
instead of following the briefly changing active-provider detail as matching
falls back between providers. This removes the rapid spinner movement between
rows without changing metadata execution or task progress persistence.

Checks completed:

- Focused navigation, playback, task-progress, and settings tests
- Full web suite (245 passing)
- Web type check
- Targeted ESLint and Prettier checks
- Production web build (144 PWA precache entries)
- `git diff --check`

Known limits: live browser visual confirmation was not run. All changes remain
uncommitted alongside the existing offline-library work; no commit, push, tag,
publication, or deployment was performed.

Next: click artist credits from each track surface, open an album from the
desktop player artwork, then run a refresh with multiple enabled providers and
confirm every provider row keeps one stable progress ring.

## Liked albums sync offline and download progress has details

`Make my liked titles available offline` now covers both liked songs and liked
albums. Each connected synchronization backfills both catalogs, saves every
available album track through the existing per-track manifest, and retries after
later connection, preference, or likes changes. A failed track or album no
longer prevents later liked items from being attempted in the same pass.

Active song and album progress spinners now open a theme-consistent tooltip on
hover or focus. It shows the title, whether the item is a song or album, and the
current percentage, or `Starting download…` when the server has not provided a
content length.

Checks completed:

- Focused library setting and offline tests (27 passing)
- Full web suite (243 passing)
- Web type check
- Targeted ESLint and Prettier checks
- Production web build (144 PWA precache entries)
- `git diff --check`

Known limits: live browser visual QA did not run because Computer Use could not
verify the active Brave URL. All changes are uncommitted; no commit, push, tag,
publication, or deployment was performed.

Next: enable the setting, like an album, confirm its available tracks receive
offline copies, then hover and keyboard-focus the song and album progress
spinners to verify the detail tooltip.

## Artwork uses a bounded external WebP cache

Album covers and artist portraits now pass through one background artwork worker
and are stored as content-addressed WebP files under `/data/artwork`. Each image
is limited to 400 pixels on its longest side, uses quality 75, rejects inputs
above 40 million pixels, and has a 512 KiB output cap. SQLite stores only cover
and portrait hashes.

The migration removes embedded image columns and clears old artwork references.
The track metadata-version bump and cleared artist matching signatures cause the
next scans to regenerate artwork from local files, Jellyfin, or Discogs.
Unreferenced files are pruned after scans, metadata tasks, and source removal.
Migration backups now contain only catalog metadata rather than image bytes.

Checks completed:

- Full server suite: 183 passing
- Workspace type check
- `pnpm check`
- `pnpm db:validate`
- `pnpm build`
- `git diff --check`

Known limits: existing local development data is on an unrelated plugin
migration that is absent from the current migration graph, so the local
development database was not reconciled. No live VPS migration or full
post-migration rescan was run. The change is uncommitted; no commit, push, tag,
publication, or deployment was performed.

Next: deploy the migration, run all-source and metadata scans to rebuild the
artwork cache, stop the service, run `pnpm db:vacuum`, and verify database and
`/data/artwork` sizes.

## Migration backup retention is limited to three snapshots

The migration runner now retains the three newest pre-migration database
snapshots instead of five. Unrelated files in `/data/backups` remain untouched,
and existing installations prune older matching snapshots during startup even
when no migration is pending. README, development guidance, and the durable
migration decision describe the new limit and its storage rationale.

Checks completed:

- Full server suite: 179 passing
- Server type check
- Focused ESLint and Prettier checks
- `git diff --check`

Known limits: no live VPS restart was run, so its existing snapshot count has
not been verified. The change is uncommitted alongside the user's current
Android playback work; no commit, push, tag, publication, or deployment was
performed.

Next: apply the image update to the VPS, restart the container, and confirm
`/data/backups` retains only the three newest snapshots.

## Android playback intent is visible while buffering

The Android player now exposes requested playback state instead of audible
playback state to the shared Vue interface. Pressing play immediately switches
the control to pause while Media3 prepares or buffers, and it returns to play
when the user pauses, playback ends, or a terminal error is reported.

The fullscreen mobile player also shows a visible localized buffering status
with the shared Peridot spinner while the native player is buffering.

Checks completed:

- Full web suite: 239 passing
- Web type check
- Android unit suite, including buffering, pause, completion, and failure states
- `pnpm check`
- Capacitor sync and Android debug APK build
- Current debug APK installed on the connected Pixel 8
- On-device confirmation that pressing play immediately shows the pause control
- `git diff --check`

Known limits: the deployed Peridot server still reports the Jellyfin source as
unavailable, so a complete track could not be played after buffering. The device
shows `Source error` after the failed stream request.

The Android and web changes remain uncommitted alongside the user's current
branch state. No commit, push, tag, publication, or deployment was performed.

Next: restore Jellyfin connectivity for the deployed server, then rerun a source
scan and verify sustained playback on the phone.

## Catalog paging recovers from concurrent library changes

The web catalog query now treats `stale_catalog_cursor` as transient. It keeps
the loaded list visible, stops generic retries for that specific response, waits
for catalog revision messages to settle for 500 ms, and refetches the infinite
query from its first page. Recovery is coalesced per active query and makes at
most three attempts. Other API and network errors continue through the normal
user-facing error path.

Tests cover stale-response classification, first-page retry behavior, unrelated
request failures, catalog quiet-period extension, and composable integration.

Checks completed:

- `pnpm --filter @peridot/web test` — 239 passing
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: this fix makes the existing revision-bound offset cursors
self-healing in the web client. It does not yet replace offset paging with
keyset paging, so a very long-running scan can still cause the client to wait
before another page loads. Browser interaction during a live scan was not
reproduced. Server, schema, and full workspace checks were not needed because
only web query handling and documentation changed. Direct API consumers remain
responsible for restarting stale cursors from the first page. Changes are
uncommitted on `feature/plugin`; no commit, push, publication, or deployment was
performed.

Next: replace offset-based cursor pages with sort-key-plus-ID keyset cursors to
avoid snapshot invalidation during normal scrolling.

## Docker deployment no longer includes Watchtower

Removed the Watchtower service and Docker socket mount from Compose. The Docker
image no longer sets Watchtower environment variables or the enable label, and
the entrypoint no longer generates an updater token. The server update service
still checks public GitHub channel data, but the install endpoint, automatic
install contract fields, client method, Settings install dialog, and
server-to-server Watchtower request were removed.

Settings now reports whether a newer server image is available and directs
administrators to apply it with `docker compose pull peridot` and `docker
compose up -d peridot`. README, Docker guidance, the project brief, and durable
decision history were updated accordingly.

Checks completed:

- `pnpm check`
- Server and web type checks
- Server suite: 178 passing
- Web suite: 234 passing
- `pnpm build`
- `docker compose config`: one `peridot` service, no Docker socket mount
- `git diff --check`

Known limits: the Docker daemon is not running in this environment, so the
image and stack were not built or started. Historical handoff and decision
entries still mention Watchtower as prior implementation context. Existing
unrelated Jellyfin artwork and catalog changes remain uncommitted and preserved.
No commit, push, publication, or deployment was performed.

Next: rebuild the image with Docker running, recreate the Compose stack, and
confirm Settings reports an available channel update without offering an
automatic install.

## Jellyfin artwork retrieval is deferred from metadata sync

Jellyfin library scans now persist tracks and catalog projections without
downloading cover images. Tracks are immediately searchable and playable with
the semantic artwork placeholder. Changed Jellyfin images create durable
`ArtworkJob` rows associated with their track and source.

After the scan, metadata matching is queued first and `artwork_fetch` second.
Task priority enforces `library_scan`, then `metadata_fetch`, then
`artwork_fetch`. Artwork retrieval processes six distinct covers concurrently,
shares work across tracks with the same image identity, updates only the track
and catalog cover fields, and reports per-item progress. Failed jobs remain
pending for a later scan or server restart; missing images clear the cover and
remove the job.

The Prisma 8 migration `20261117T1914_add_artwork_jobs` adds `ArtworkJob` and
`Track.externalCoverKey`, creates its indexes and cascading foreign keys, and was
applied to the local development database. The migration has no data
backfill. Existing covers are adopted by the next unchanged Jellyfin scan.

Checks completed:

- `pnpm check`
- Server and web type checks
- Server suite: 178 passing
- Web suite: 234 passing
- `pnpm db:validate`
- Server build and full workspace build
- `git diff --check`

Known limits: deferred artwork applies to Jellyfin; local-folder embedded and
folder covers remain part of local metadata extraction. Provider metadata runs
to completion before artwork because the task service is serial and metadata was
the selected priority. The complete live 70k-item library has not yet been timed
with this split. The live HTTP smoke check was unavailable because the
development listener was stopped. Unrelated concurrent worktree changes were
preserved. Changes are uncommitted on `dev`; no commit, push, publication, or
deployment was performed.

Next: run a source-scoped live Jellyfin scan, confirm tracks appear before the
artwork task starts, and record the metadata-versus-artwork durations.

## Large Jellyfin imports use pipelined item preparation

Jellyfin scans now prefetch up to six item/artwork preparations concurrently
while applying track, cover, and catalog writes serially. Concurrent requests
for the same Jellyfin image identity share one download, and later changed items
reuse the local cover ID without retaining every decoded image for the complete
scan. Task progress advances after each imported item, throttled to four writes
per second, instead of jumping once per 500-item Jellyfin page.

The local live diagnosis found a 69,878-item Jellyfin library whose first
500-item page took about 6 minutes 49 seconds with the previous serial artwork
path. Regression tests now verify bounded artwork overlap and intermediate task
progress before the current page finishes.

Checks completed:

- `pnpm check`
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server test` (176 passing)
- `pnpm --filter @peridot/server build`
- `git diff --check`

Known limits: the optimized path is covered with mocked Jellyfin responses, not
yet timed against the complete live 69,878-item library. SQLite track and catalog
projection writes remain serialized. The changes are uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

Next: rerun the live `Audio` source scan and record completed page timing and
overall duration. Metadata matching remains a separate rate-limited phase.

## Automatic media detection only

Media classification is now automatic only. Source creation and settings no
longer offer automatic/fixed modes, track context menus no longer expose media
type corrections, and audiobook/podcast details no longer expose collection
reclassification. Local and Jellyfin scanners write detection directly to each
track's `mediaType` and `mediaTypeOrigin`.

The Prisma 8 contract removes source classification, fixed media type, duplicate
detected fields, and manual overrides. Migration
`20261117T1749_automatic_media_detection_only` first replaces every track's
effective type and provenance with its stored detected values, then drops the
obsolete columns and source index. Catalog projection version 6 rebuilds derived
albums and media categories once after the migration. The reviewed migration was
applied to the local development database and the `db` ref advanced.

Checks completed:

- `pnpm check`
- `pnpm typecheck` (7 successful tasks)
- `pnpm test` (server 174, web 233, UI 17, desktop 5)
- `pnpm db:validate`
- `pnpm build` (6 successful tasks, including the Android debug build)
- Migration regression covering fixed-source/manual override normalization

Known limits: `pnpm db:migrate:dev` reached the SQLite backup step and exited
with a platform-level `not an error`; the reviewed migration was therefore
applied with `pnpm exec prisma db migrate --db file:./peridot.db --advance-ref db
--no-interactive`. Android Kotlin tests and browser visual QA were not rerun
because no native Kotlin code changed and the build already covers the packaged
web client. Most of the implementation was recorded on `dev` in `0880056`
during the work. The final migration ordering/hash, advanced `db` ref,
regression test, and documentation updates remain uncommitted alongside the
user's unrelated changes; no push, tag, publication, or deployment was
performed.

Next: visually verify the source creation dialog, source actions menu, track
context menu, and audiobook/podcast detail headers at desktop and mobile widths.

## Server settings show server and client versions

The Software updates card on Settings → Server now labels the running server's
version separately from the web client bundle version. The server value comes
from the authenticated update status, and the client value comes from the
client's build runtime configuration.

Checks completed:

- Focused settings regression suite: 15 passing
- Full web suite: 233 passing
- Web type check, targeted ESLint and Prettier, production web build, and
  `git diff --check`

Known limits: browser visual QA was not run. The change remains uncommitted on
`dev`; unrelated working-tree changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: verify the four-column version summary at desktop and narrow settings
widths.

## Android launcher icon gains additional padding

The Peridot mark is now centered on the Android icon canvas and rendered at 80%
of its previous scale. Square, circular, and adaptive foreground PNGs keep an
even margin at every density, with roughly 28% padding at the artwork's
narrowest side. A round full-icon SVG source was added alongside the square and
foreground sources.

Checks completed:

- Android `lintDebug`, including debug resource compilation
- Dimension, transparent-corner, background-color, centering, and green artwork
  bounds inspected at mdpi, hdpi, xhdpi, xxhdpi, and xxxhdpi
- `git diff --check`

Known limits: launcher appearance was not inspected on a physical Android
device or emulator. The icon changes remain uncommitted on `dev` alongside
unrelated working-tree changes; no commit, push, tag, publication, or deployment
was performed.

Next: install the debug build and compare square, circular, and themed launcher
masks on a device.

## Scheme-less server addresses prefer HTTPS

Server selection now probes HTTPS before HTTP when the user enters a hostname
without a scheme. It still tries both protocols and the default Peridot port,
so HTTP-only LAN servers remain discoverable. Explicit `http://` and `https://`
addresses remain restricted to the protocol the user entered.

This prevents a TLS-only reverse-proxied deployment from being selected through
an HTTP health redirect and then failing the cross-origin auth status request
when the browser refuses the HTTP-to-HTTPS CORS redirect.

Checks completed:

- Focused server-address suite: 9 passing
- Full web suite: 233 passing
- Web type check, targeted ESLint and Prettier, production web build, and
  `git diff --check`

Known limits: the scheme-less flow was not exercised against the live VPS in a
browser or on an Android device. The fix remains uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

Next: rebuild the web image, deploy it, and enter `peridot.cyriaque.dev` without
a scheme from a separate web instance and Android.

## Library lists have title-adjacent scoped search

Albums, Artists, Audiobooks, Podcasts, Playlists, and Liked songs now show a
clearable quick-search field immediately beside the page title. Input is
trimmed and applied after 250 ms, while clearing applies immediately. On narrow
screens the field wraps below the title.

Catalog pages pass the deferred term through their existing server-backed,
paginated queries. Liked songs retains the liked and sort filters. Playlist
search adds `GET /api/playlists?query=` and matches normalized name terms before
pagination, so filtered totals remain exact without a database migration.
Filtered no-match copy is distinct from an empty library.

Checks completed:

- Full server suite: 175 passing, including scoped media and playlist search
- Full web suite: 232 passing, including title adjacency, debounce, clear, and
  no-match behavior
- Workspace typecheck: 7 successful tasks
- Workspace lint, schema validation, and production build: 6 successful build
  tasks across contracts, server, web, desktop, and Android
- Repository-wide Prettier and `git diff --check`

Known limits: browser visual QA was not run. Playlist search normalizes the
current user's playlist rows before paging, which is linear in that user's
playlist count; no schema or migration was added. The work is committed on
`dev` as `f653d66`; no push, tag, publication, or deployment was performed.

Next: visually verify title-adjacent placement at desktop and mobile widths,
then resolve the unrelated Desktop formatting warning separately.

## Server Settings restores log history after restart

The server now restores the latest 500 structured entries from `peridot.log`
into the in-memory administrator Settings log during startup. Recovery occurs
before the public listener starts and also applies when file logging is
currently disabled, so prior history remains available after a full reboot or
an in-app server restart. Live IDs continue above all restored entries.

Application-generated file records now use numeric Pino levels, epoch times,
and `msg`, matching Fastify/Pino JSON lines. Recovery remains compatible with
the previous string-level records. Non-JSON lines remain on disk and are
ignored by the structured Settings reader.

Checks completed:

- Full server suite: 173 passing
- Server type checks, targeted ESLint, Prettier, production build, and
  `git diff --check`

Known limits: recovery loads the latest 500 structured records, not the entire
retained file. Reading the complete retained history still requires direct
access to `peridot.log`. The implementation is committed on `dev` as
`e4930f4`, with startup retention ordering and formatter follow-ups in
`cc450e7`. No push, tag, publication, or deployment was performed.

Next: confirm the recovered history in a live development restart with an
existing `apps/server/peridot.log`.

## Android launcher icon uses a dark canvas and margin

The Android launcher icon now places the green Peridot mark on a `#121312`
background with visible margin. Legacy square and circular PNGs include the
opaque background, while Android 8+ adaptive icons use the background color
resource with a transparent foreground. Editable foreground and full-icon SVG
sources were added under `apps/android/assets`.

Checks completed:

- Android lint and debug resource compilation
- PNG dimension, opacity, background color, and artwork-bound inspection at
  every retained launcher density
- `git diff --check`

Known limits: launcher appearance was not inspected on a physical Android
device or emulator. The change remains uncommitted on `dev`; no commit, push,
tag, publication, or deployment was performed.

Next: install the debug build on devices using square, circular, and themed
launcher masks to confirm the margin visually.

## Playback start retries three times

The browser player and Android Media3 service now retry a track start up to
three times after the initial attempt before showing the loading error state.
The retry path covers preparation failures and media errors before playback
reaches its first playing state; the browser path also retries rejected media
`play()` calls. Once playback has started, failures keep the existing offline
fallback and error behavior. Autoplay-policy rejections still show the immediate
press-play message.

Checks completed:

- Focused playback retry and player tests: 4 passing
- Android unit suite: 5 passing, including the native retry policy
- Full web suite: 228 of 229 passing; the sole failure is the pre-existing
  uncommitted offline-toast locale wording mismatch in `offline-spa.test.ts`
- Web type check, targeted ESLint and Prettier, production web build, and
  `git diff --check`

Known limits: a deliberately failing source was not exercised against a live
browser player or Android device. All changes remain uncommitted on `dev`;
unrelated working-tree changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: manually interrupt a live track start in the browser and Android app and
confirm four total attempts, then the existing error state; resolve the
unrelated offline-toast wording mismatch separately.

## Mobile fullscreen player uses router history

The mobile mini-player now opens fullscreen through a pushed
`player=fullscreen` route query entry. The player derives its dialog state from
the route, so browser history, PWA back navigation, and Android's existing
hardware-back listener close the player and return to the previous view. Closing
from the player UI pops the same entry; direct fullscreen URLs fall back to
replacing the query when there is no prior history.

Checks completed:

- Focused mobile-player and route tests: 4 passing
- Web type check, targeted ESLint, Prettier, production web build, and
  `git diff --check`
- Full web suite: 226 of 227 passing; the sole failure is the pre-existing
  offline-toast locale wording mismatch in `offline-spa.test.ts`

Known limits: browser and Android hardware-back interaction were not exercised
on a device. All changes remain uncommitted on `dev`; unrelated working-tree
changes were preserved. No commit, push, tag, publication, or deployment was
performed.

Next: exercise fullscreen open/close and Android hardware back against the live
mobile build, then resolve the unrelated offline-toast wording mismatch
separately.

## Mobile overflow text scrolls automatically

The shared `ScrollingText` component now activates automatically below the
`md` breakpoint. Every catalog surface already using the component inherits
the behavior, including track tables, cards, queue and playlist rows, context
menus, quick picks, and mobile player metadata. Visible text remains static,
desktop hover/focus behavior is unchanged, interaction pauses automatic
motion, and reduced-motion users still receive no animation.

Checks completed:

- Shared UI suite: 17 passing
- Focused mobile player and scrolling-text suite: 4 passing
- Full web suite: 226 of 227 passing; the sole failure is the pre-existing
  uncommitted offline-toast locale wording mismatch in `offline-spa.test.ts`
- Web type check, production web build, targeted ESLint, Prettier, and
  `git diff --check`

Known limits: a standalone shared-UI type check stops on pre-existing missing
SVG module declarations for spinner assets; the web type check and build cover
the component in its consuming workspace. Browser visual QA was not run. The
change remains uncommitted on `dev`; unrelated working-tree changes were
preserved. No commit, push, tag, publication, or deployment was performed.

Next: verify long and short metadata at mobile and desktop widths.

## File logging enabled by default with five-day retention

Settings → Server now enables persistent file logging for new server settings
by default. The same section exposes a whole-day retention setting with a
five-day default. Saved retention changes take effect immediately.

The file logger removes JSON lines older than the configured cutoff whenever it
opens and checks again hourly while enabled. Unknown or unstructured lines
remain because their age cannot be established safely. The implementation
keeps the existing single `peridot.log` path and preserves explicitly stored
logging enable/disable values during migration.

The API response and update contract now include `retentionDays`. The Prisma
contract adds `ServerSetting.fileLogRetentionDays`, changes the default for
`fileLoggingEnabled` to enabled, and includes migration
`20261117T1421_add_file_log_retention`. The local development database was
updated from contract `05ef14e0` to `ba133506`, and its database ref is current.

Checks completed:

- Server suite: 169 passing, including default-enabled settings, validation,
  persistence, old-entry pruning, and fresh migration application
- Focused web settings/client suite: 33 passing
- Full web suite: 224 of 225 passing; the sole failure is the pre-existing
  uncommitted offline-toast locale wording mismatch in `offline-spa.test.ts`
- Server and web type checks
- Targeted ESLint, Prettier, `git diff --check`, `pnpm db:validate`, and
  `pnpm db:migration:check`

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev`; unrelated working-tree changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: visually verify the retention input at desktop and narrow widths, then
resolve the unrelated offline-toast wording mismatch separately.

## Collection headers show exact totals

Albums, artists, audiobooks, podcasts, liked tracks, playlist lists, search
groups, and artist-detail subsections now place their count badge beside the
section heading. Counts use exact filtered catalog totals from the server
instead of the currently loaded page size with a trailing `+`.

Paginated track and card responses now include `totalCount`, including when
search, liked, artist, album, collection, and availability filters are active.
The web query layer exposes that total and falls back to loaded items only while
an older persisted page is being refreshed.

Checks completed:

- Server suite: 168 passing, including exact totals across pagination and
  filtered track, album, artist, audiobook, and podcast responses
- Web suite: 224 of 225 passing; the sole failure is the pre-existing
  uncommitted offline-toast locale wording mismatch in `offline-spa.test.ts`
- Contract, server, and web type checks
- Workspace ESLint, Prettier, version check, and `git diff --check`
- Full workspace build: 6 successful tasks, including web generation, server
  compilation, and Android debug assembly

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev`; unrelated working-tree changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: visually verify the adjacent badge spacing on the collection pages at
desktop and narrow widths, then resolve the unrelated offline-toast wording
mismatch separately.

## Compact mobile-player metadata stays inside its control area

The fixed bottom mini-player now gives its metadata trigger a zero flex basis and
explicit maximum width before the fixed next, favorite, and play controls are
laid out. The trigger and metadata wrapper clip their contents, so long titles
and artist credits cannot paint over or push those buttons offscreen. The
unrelated shared track-table layout experiments were reverted.

Checks completed:

- Focused mobile-player and player tests: 4 passing
- Web type check, targeted ESLint, Prettier, production web build, and
  `git diff --check`

Known limits: browser screenshot capture was unavailable because Computer Use
stopped when it could not verify the active browser URL. Unrelated concurrent
worktree changes were preserved, including the offline-toast locale mismatch.
The fix and tests remain uncommitted on `dev`; no commit, push, tag, publication,
or deployment was performed.

Next: reload the live mobile layout and confirm the next, favorite, and
play/pause buttons remain visible with the longest artist credit.

## Beta update and Docker channel replaces master

The public update and image channel is now `beta`. The `master` Git branch
remains the beta source branch, but GHCR publishes `dev`, `beta`, commit,
version-tag, and `stable` images instead of a `master` image. Server builds use
`PERIDOT_UPDATE_CHANNEL=beta` and resolve beta updates from the `master` branch
commit. Desktop, Android, and web client update metadata now use the
`client-beta` GitHub release. The Settings label remains Beta and the Compose
channel can be selected with `PERIDOT_CHANNEL=beta`.

Checks completed:

- Server suite: 168 passing, including beta configuration and master-branch
  update lookup
- Targeted web update suite: 6 passing
- Desktop suite: 5 passing
- Workspace ESLint, Prettier, contract/server/web type checks, and version check
- Full workspace build: 6 successful tasks, including Nuxt generation, server
  compilation, and Android debug assembly
- `docker compose config` with `PERIDOT_CHANNEL=beta` resolved
  `ghcr.io/ciriak/peridot:beta`
- Desktop beta updater manifest resolved
  `client-beta/latest.json`
- `git diff --check`

The full web suite remains 223 of 224 passing because the pre-existing
uncommitted offline-toast locale wording does not match `offline-spa.test.ts`.
That unrelated change was preserved. The Docker image was not built or
published, and the hosted CI workflow was not run. All beta-channel changes
remain uncommitted on `dev`; no commit, push, tag, publication, or deployment
was performed.

Next: publish the beta tag through CI, point existing `master` image users at
`beta`, and verify an installed beta server detects and installs the next
`master` build.

## Current-track indicator follows list titles

The waveform shown for the active track now follows the visible title in both
shared track tables and playlist rows. The scrolling title uses its content
width instead of growing across the remaining cell, so a short title no longer
pushes the indicator to the far edge while long titles still shrink and scroll
within the available space.

Checks completed:

- Focused web tests: 34 passing
- Web type check, targeted ESLint, Prettier, production web build, and
  `git diff --check`
- Full web suite: 223 of 224 passing; the sole failure is the pre-existing
  uncommitted offline-toast locale wording mismatch in `offline-spa.test.ts`

Known limits: browser visual QA was not run. The working tree also contains
unrelated concurrent edits, including the offline-toast locale change; those
were preserved. The indicator and test changes remain uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

Next: confirm the current-track indicator spacing in a live catalog at desktop
and narrow widths, then resolve the unrelated offline-toast copy and test
mismatch separately.

## Development `/api` proxy restored

Reported behavior: the development web app stayed on the onboarding pending
state and `/api` requests never completed. The root `dev` and `dev:server`
scripts had been changed to start Fastify on public port `17430`, which Nuxt
already owns. Fastify therefore failed to bind while Nuxt continued proxying
`/api` to an unserved `17431`, producing the pending requests.

The scripts again start the private development API on `17431`; Nuxt remains
the public listener on `17430`. The development configuration test now reads
the root package and verifies that both API scripts use the same private port
targeted by the Nuxt `/api` proxy.

The failing `PORT=17430` override later returned to the local working tree even
though the regression coverage was committed. It has been removed again. This
must not be changed to `17430`: in development, Nuxt owns that public port and
forwards `/api` to Fastify on `17431`.

Checks completed:

- Web suite: 224 passing
- Targeted web configuration test, ESLint, Prettier, and `git diff --check`
- Live root, `/onboarding`, `/api/health`, and `/api/auth/status` requests on
  `17430` returned 200; direct `/api/health` on the private `17431` also
  returned the Peridot signature
- Exact `npm run dev` startup on both `127.0.0.1` and `localhost`; root, health,
  auth status, and discovery requests returned 200 from the rendered web origin

Known limits: full workspace type checks, tests, schema validation, and build
were not repeated for this development-script and regression-test fix. The
restored development stack is running locally. The earlier regression test and
handoff notes were committed in `24c7aa2`; this follow-up only records the
repeated local port override. No push, tag, publication, or deployment was
performed.

Next: continue using `pnpm dev` at `http://127.0.0.1:17430`; restart it after
changes to root scripts or Nuxt proxy configuration.

## Peridot now uses one public port on 17430

The built server again serves the SPA, authenticated API, audio ranges, and
realtime WebSockets from one Fastify listener on `17430`. The separate port-80
web listener, HTTP proxy dependency, `WEB_HOST`, `WEB_PORT`, privileged-port
capability, and second Compose mapping were removed. Nuxt and the Tauri
development window use `http://127.0.0.1:17430`; Nuxt proxies development API
traffic to a private Fastify process on `17431`. Scheme-less server discovery
now falls back only to `17430`.

Checks completed:

- Server suite: 167 passing, including the combined SPA/API origin test
- Web suite: 224 passing
- Desktop config tests passing
- Server, web, and desktop type checks
- Workspace ESLint, Prettier, version synchronization, and migration validation
- Full workspace build: 6 successful tasks, including Nuxt generation, server
  compilation, and Android debug assembly
- Live development checks on `17430`: root, nested route, and proxied health
  returned 200
- Built-server smoke checks on an alternate port: root and nested routes
  returned 200, health returned the Peridot signature, and a missing API route
  returned JSON 404
- `docker compose config` resolved only published port `17430`
- `git diff --check`

Known limits: the first full build attempt crashed inside Turbo before any task
started; an immediate retry completed successfully. A user-owned development
process already occupies `127.0.0.1:17430`, so the built-server smoke test used
an alternate port while the runtime default remains covered by automated tests.
The Docker image was not rebuilt and the Compose stack was not started. All
changes are uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed.

Next: rebuild the image and verify the single Compose port from another machine,
then verify audio streaming and realtime reconnection through `17430`.

## Owner-assisted password recovery is implemented

Sign-in now offers password recovery without any email-delivery capability.
`POST /api/auth/password-resets` always returns a generic `202`, while a
matching account receives a 30-minute one-time recovery token in the server
log. Only the SHA-256 token hash is stored in SQLite. The server owner provides
the token out of band; the user enters it with a new password in onboarding.

Completing recovery through `POST /api/auth/password-resets/complete` updates
the scrypt password hash in a transaction, consumes every reset token for the
account, deletes every session, and disconnects affected realtime clients.
Requests are limited per normalized email, and the generic response does not
reveal whether an account exists. The onboarding UI also supports entering an
owner-provided token after a reload.

Checks completed:

- Server suite: 167 passing, including token logging/hash storage, generic
  unknown-account responses, password validation, expiry, single use, session
  revocation, administrator credential-change invalidation, and migration
  coverage
- Web suite: 224 passing, including reset endpoint calls and onboarding recovery
  controls
- Full workspace typecheck, ESLint, Prettier, version synchronization, and
  migration validation
- Full workspace build: 6 successful tasks, including Nuxt generation, server
  compilation, and Android debug assembly
- Development database migrated from `5e5cd624` to `05ef14e0`; the migration
  runner created a verified pre-migration backup under `apps/server/backups`

Known limits: recovery depends on access to server or container logs because
Peridot does not send email. Persistent file logging remains opt-in; the raw
token is also written to standard server output and the in-memory administrator
log. Logs must therefore be treated as sensitive administrative data. The
recovery flow has not yet been exercised manually in a browser or against a
rebuilt Docker container. All changes are uncommitted on `dev`; no commit,
push, tag, publication, or deployment was performed.

Next: run one request in the live web UI, retrieve its token from the server or
container log, complete the reset, and verify the old session is signed out.

## Web defaults to port 80 and the API remains on 17430

The built server now runs a separate web listener on port 80 and an API-only
Fastify listener on port 17430. The web listener serves the generated SPA,
falls back to `200.html` for client routes, and proxies `/api`, audio ranges,
and realtime WebSockets to the API. `WEB_HOST` and `WEB_PORT` configure the web
listener; `HOST` and `PORT` continue to configure the API.

Nuxt and Tauri development now load port 80, while the root development command
runs Fastify on 17430. Nuxt proxies `/api` to that server. Docker and Compose
publish web port 80 and API port 17430. The image grants the non-root Node
process permission to bind port 80, and both environment examples document the
new split.

Checks completed:

- Server suite: 164 passing, including API-only listener boundaries and web
  proxy coverage for static files, SPA fallback, HEAD ranges, and WebSockets
- Web suite: 222 passing
- Desktop config suite: 5 passing
- Server, web, and desktop tests; server and web type checks
- Workspace ESLint, Prettier, version synchronization, and migration validation
- Full workspace build: 6 successful tasks, including web generation, server
  compilation, and Android debug assembly
- Built-server smoke test on web port 80: SPA root returned 200 and proxied
  `/api/health` returned the Peridot signature
- `docker compose config` resolved published ports 80 and 17430
- `git diff --check`

Known limits: the Docker daemon is not running, so the image was not rebuilt
and the Compose stack was not started. A pre-existing user-owned development
process already owns `127.0.0.1:17430`; it was preserved, so the default API
port was verified by runtime tests and the API-side smoke test used an
alternate port. All changes are uncommitted on `feature/auto-updates`; no
commit, push, tag, publication, or deployment was performed.

Next: rebuild the image and verify both published ports in Compose, then run
normal development after the existing 17430 listener is stopped by its owner
to exercise the complete default 80-to-17430 path.

## Update discovery is automatic but installation is explicit

The API now checks the public GitHub repository shortly after startup and every
six hours with jitter. It coalesces manual and automatic checks, logs failures,
and never installs automatically. Watchtower no longer performs periodic
updates; its authenticated endpoint remains available only through the
administrator Install action.

Client updates are silent. The PWA keeps its automatic service-worker update.
Desktop uses signed Tauri update artifacts and restarts after playback stops.
Android web assets use an encrypted and signed Capgo update bundle downloaded
from public GitHub releases, queued for the next launch, with Capgo Cloud,
telemetry, native APK prompts, and update notifications disabled.

CI now generates dev, master, and stable client artifacts. Desktop builds are
produced for Linux x86_64, Windows x86_64, and universal macOS, then assembled
into per-channel GitHub releases with `latest.json`. Android bundle packaging
was exercised locally with the generated OTA key and produced encrypted
`android-web.zip` plus `android-web-manifest.json`.

Checks completed:

- Server suite: 164 passing, including auto-check scheduling and coalescing
- Web suite: 222 passing, including silent updater and anonymous GitHub API tests
- Android typecheck and Kotlin unit suite after syncing the updater plugin
- Desktop Rust check and 5 tests with updater/process plugins
- Signed Windows Tauri release build produced MSI/NSIS installers and two
  updater signatures
- Android web bundle packaging and signed manifest generation
- Version synchronization includes Tauri and Android native versions
- `actionlint`, Docker Compose rendering, repository lint/format, and the full
  workspace type check and production build

Known limits: the new cross-platform Tauri release matrix and GitHub release
publication have not run in hosted CI. Private updater keys are stored outside
the repository, and the three required GitHub Actions signing secrets are
configured. Client updates have not been exercised from a published public
release.

Next: add the signing secrets, run the branch workflow, install one published
desktop and Android update, and verify silent next-launch or idle-restart
activation.

## Local scans use configurable worker threads

Library scans now use a bounded Node worker-thread pool for local directory
discovery and audio metadata extraction. The main thread remains the sole writer
for SQLite track, cover, progress, and catalog projection updates. Progress is
written at most every 250 ms plus completion, and file processing yields between
bounded batches.

Administrators configure the worker count in Settings → Admin → Server. The
default is 3, values from 1 through 32 are accepted, and values above 4 save with
an inline warning. Changes apply to subsequent scans; an active scan retains the
count with which it started. A migration adds `ServerSetting.scanWorkerCount`
with a default of 3.

Performance checks completed:

- Existing directory search: 6,400 directories in 780 ms; event-loop maximum
  14.07 ms
- Metadata parsing: 500 generated WAV files improved from about 1.93 seconds at
  concurrency 1 to 0.41 seconds at 3 and 0.24 seconds at 4
- Initial full-path scan: 300 generated WAV files took about 39 seconds and
  exposed a 5.2-second event-loop stall during the post-scan metadata task
- Scan-only benchmark excluding metadata matching: 300 generated WAV files with
  3 workers completed in 34.3 seconds, with 0.48 ms p95 health latency, 80.61 ms
  p99 event-loop delay, and a 131.4 ms maximum event-loop delay

Checks completed:

- Workspace tests: server 161, web 216, shared UI 17, and Desktop 4 passing
- Full workspace type check, ESLint, Prettier, version check, migration check,
  and production build
- Production worker entrypoint smoke test: directory discovery and WAV parsing
  from compiled JavaScript
- Worker discovery, parsing, and cancellation tests passed

Known limits: the benchmark is synthetic and hardware-dependent. Jellyfin
traversal and metadata-provider matching remain separate serial workloads and
may still create the observed post-scan event-loop stall. No push, tag,
publication, or deployment was performed.

Next: exercise a real large library in the running web application and profile
metadata-provider matching separately if post-scan stalls remain noticeable.

## Docker web UI now recognizes its serving instance

Reported behavior: opening a Docker installation at
`http://192.168.1.5:17430` showed the web UI, but onboarding could not find the
API. The live instance returned HTTP 200 with the Peridot signature from
`/api/health`, so the API was reachable. Its discovery endpoint instead returned
only Docker/container addresses: `10.0.9.1`, `10.0.9.2`, `127.0.0.1`, and
`localhost`. Those names resolve differently in the viewer's browser.

Onboarding now probes its own browser origin before starting the existing
network scan when no server is already saved. A successful same-origin health
check selects that origin and advances directly to setup or sign-in. Separately
hosted web clients, Android, and manual server selection retain their existing
fallback paths. Added coverage for exact same-origin selection and the
same-origin-before-discovery flow.

Checks completed:

- Live Docker instance: root and `/api/health` returned 200 on
  `192.168.1.5:17430`; auth status showed first-administrator setup required
- Web suite: 216 passing
- Workspace suite: server 158, shared UI 17, and Desktop 4 passing; no Android
  package in the workspace test scope
- Web typecheck, ESLint, Prettier, and production web build
- `git diff --check`

Known limits: Docker CLI is present but the daemon is not running, so the image
was not rebuilt and the existing container still runs the previous UI bundle.
The generated static/PWA build also requires a fresh image or browser update to
replace the old service-worker assets. The README already has an unrelated
uncommitted Compose port change, which was preserved.

Next: rebuild and publish the image, pull it into the Docker host, reload the LAN
URL, and verify the first-administrator flow. Until then, entering
`192.168.1.5:17430` in manual server entry bypasses the container-local
discovery result.

## Database upgrades now run through committed migrations

The server database now has a committed Prisma 8 migration graph under
`apps/server/migrations`. `initial_schema` baselines the contract already used
by current databases at storage hash `4e95e705…`; its tracked `db` ref points
at that contract. Fresh databases apply all 84 baseline operations, while the
existing current-schema development database is recognized as already at the
baseline and performs no DDL.

`pnpm db:migrate` is the safe application path used by Docker, `pnpm start`, and
development startup. It checks pending migrations first, creates a consistent
`node:sqlite` snapshot for a non-empty database, verifies the snapshot with
`PRAGMA integrity_check`, and applies `prisma db migrate` before the server
starts. Snapshots live beside the database in `backups/` (`/data/backups` in
Docker), are owner-only, and retain the five newest files. Failed backup,
verification, or migration work exits without starting Fastify.

Development and CI now use the formal graph. `pnpm db:migrate:dev` applies
pending migrations and advances `migrations/app/refs/db.json`;
`pnpm db:migration:check` requires the ref and contract head to match and is part
of `pnpm db:validate`. Server tests build their disposable database from the
migrations rather than `db update`, and `pnpm db:reset` now rebuilds from the
baseline.

Checks completed:

- Full server suite: 158 passing, including fresh baseline application,
  current-schema adoption, failed-apply backup preservation, and five-file
  retention
- Web 215 passing, shared UI 17 passing, and Desktop 4 passing
- Workspace type check, `pnpm check`, and workspace build
- `pnpm db:validate` and `pnpm db:migration:check`
- `pnpm db:migrate` against the existing database reported no pending work and
  created no backup directory
- `pnpm exec prisma migration show 20261116T1754_initial_schema`
- `docker compose config`
- `git diff --check`

Known limits: Docker CLI and Compose are installed, but the Docker daemon is not
running, so the image build and fresh/current-volume container smoke tests were
not run. The baseline intentionally supports databases already at the current
schema; older pre-baseline schemas fail closed and require explicit adoption.
The `pnpm` commands emit Prisma CLI's non-failing notice that its bundled agent
skill is not synced to the repository.

All work is uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed. Next, build the image with Docker running and verify
one new volume and one current-schema `/data` volume, then exercise a real
post-baseline migration before the next schema-changing release.

## Android playback notification restored

Android playback now declares the Android 13 notification permission and
registers a dedicated `peridot_playback` channel before creating the Media3
session. Media3 uses that channel with the Peridot monochrome status-bar icon,
public lock-screen visibility, and localized English, French, and German
channel copy. The native plugin requests notification permission once on the
first playback action; denial does not block playback because media-session
notifications are exempt.

Checks completed:

- Android Kotlin unit suite
- Android instrumentation suite on the Android 36 emulator: 3 passing,
  including real Media3 playback and an active media notification with
  `POST_NOTIFICATIONS` not yet granted
- Android `lintDebug`, including localized resources
- Android debug build
- `git diff --check`

Known limits: the active notification was verified on the Android 36 emulator,
not on the physical Android 13+ device that originally showed no Peridot
notification entry. `dumpsys notification` confirmed the channel and app
notification settings entry on the emulator.

Next: install the rebuilt APK on the affected Android device, play a track, grant
the one-time notification prompt, and verify the system media card on the lock
screen, notification shade, and Quick Settings.

## Large-library catalog synchronization is bounded

Automatic full offline catalog snapshots are now limited to libraries of at
most 10,000 tracks. Track pages use the server's 200-item limit, while album,
artist, audiobook, and podcast pages use their 100-item limit. Track traversal
stops as soon as the limit is exceeded, so oversized libraries no longer fan
out into the remaining card endpoints. A combined 25,000-record cap protects
browser memory.

Successful snapshots and oversized-library decisions are persisted per server
and user for seven days. Catalog revisions are debounced until the catalog has
been quiet for 30 seconds, and revisions during a sync no longer restart the
sync immediately. Oversized libraries clear the obsolete full snapshot while
retaining explicitly downloaded tracks, playlists, and previously persisted
query pages. Settings → Library explains when automatic full offline browsing
is paused.

Catalog-event query invalidation is coalesced to at most once every 10 seconds.
Player queue metadata is no longer force-resolved in full on every catalog
revision; revision hydration requests only missing rows. Eager whole-catalog
artwork warming was removed so artwork is cached as users view it.

Source deletion now emits a `source-removal` catalog event. Connected clients
clear the full offline snapshot immediately, invalidate catalog queries without
waiting for the normal revision throttle, and schedule a fresh bounded rebuild.
Missed realtime events also clear the snapshot during `resync.required`. The
source deletion page performs the same reset directly after a successful DELETE
so stale offline rows disappear even when realtime delivery is unavailable.
Sync-state version 2 invalidates snapshots created before this correction and
forces one bounded refresh on the next client load.

Checks completed:

- Full web suite: 215 passing, including page limits, 10,000-track abort,
  25,000-record cap, seven-day gating, and coalesced revision handling
- Full server suite: 154 passing, including the source-removal realtime event
- Web type check
- Server type check
- Targeted ESLint and Prettier
- Web and server production builds
- `git diff --check`

Known limits: libraries above 10,000 tracks intentionally do not receive an
automatic full offline catalog snapshot. The threshold is checked again after
seven days. No API or database schema changed.

Next: delete a source that previously populated the offline snapshot and verify
its tracks disappear immediately while offline and after reconnecting.

## Persistent server log file and automatic settings saves

Settings → Server now includes a disabled-by-default `Keep server logs in a
file` option. When enabled, Fastify/pino request logs and task warning/error
entries are appended as JSON lines to `peridot.log` beside the SQLite database.
For the container deployment that path is `/data/peridot.log`, inside the
persistent `peridot-data` volume. Disabling the option stops new writes and
leaves the existing file in place.

The setting applies without a server restart and is persisted in
`ServerSetting.fileLoggingEnabled`. The Settings UI displays the resolved file
path. The local development file is `apps/server/peridot.log`.

Server-backed settings cards now save automatically. Toggles save immediately;
the source-refresh cron and profile display name save on blur or Enter. The
corresponding save buttons were removed. User creation, metadata-provider
configuration, and other dialogs that submit credentials or create records keep
their explicit actions.

Checks completed:

- Full server suite: 153 passing, including enabling, writing, and disabling
  file logging
- Full web suite: 210 passing
- Server and web type checks
- Workspace ESLint and targeted Prettier checks
- Server and web production builds
- Prisma contract emission and additive database update
- Live development verification: `apps/server/peridot.log` is receiving entries

Known limits: the log file is append-only and has no built-in rotation or size
cap. Existing file contents are not imported into the in-memory Settings log.
The current commits are on `fix/source-deletion`; no additional push, tag,
publication, or deployment was performed by this work.

Next: decide whether persistent file logs need a maximum size or rotation policy
before production use.

## Source removal responds immediately

Removing a source now updates the web query cache before the API request
finishes. The confirmation closes, the source row disappears, and the existing
success toast is shown immediately. A failed background deletion restores the
source in its previous position and displays the existing removal error.

Jellyfin source deletion now removes the source and all tracks in one SQLite
transaction. This makes the source disappear from subsequent list requests
without waiting for catalog search-index cleanup, which continues in the same
request afterward. Bulk deletion reduces the live Jellyfin case from thousands
of individual source-track deletes to one transaction.

Checks completed:

- Full web suite: 210 passing, including optimistic removal and rollback
- Full server suite: 152 passing
- Web and server type checks
- Workspace ESLint
- Web and server production builds
- Targeted Prettier checks and `git diff --check`

Known limits: catalog search-index cleanup still runs after the durable source
and track deletion and can keep the DELETE request active for a large Jellyfin
library. Cleanup failures are logged after the source is already durably
removed. The change remains uncommitted on `feature/clasicifation-update`; no
commit, push, tag, publication, or deployment was performed.

Next: remove a configured Jellyfin source in the hot-reloaded app and confirm
the row and toast update immediately while a normal refresh keeps it absent.

## Node 24 CI actions

Every CI job now uses `actions/checkout@v7`, `actions/setup-node@v7`, and
`pnpm/action-setup@v6`. These major releases declare Node 24 as their action
runtime, removing GitHub Actions' warning about Node 20 actions being forced to
run on Node 24. Node and pnpm versions configured for repository commands are
unchanged.

Checks completed:

- `actionlint` 1.7.12 against `.github/workflows/ci.yml`
- Targeted Prettier
- `git diff --check`

Known limits: the workflow has not run on GitHub since the action upgrades.
The change remains uncommitted on `feature/clasicifation-update`; no commit,
push, tag, publication, or deployment was performed.

Next: run the workflow on GitHub and confirm the deprecation warning is absent
from every job.

## Version-independent server update test

The development update-check test no longer asserts the application package
version. That assertion was unrelated to the behavior under test and required a
test-only edit whenever the root version changed. The test still verifies the
unchecked, current, and available commit transitions.

Checks completed:

- Full server suite: 152 passing
- Targeted Prettier
- `git diff --check`

Known limits: none for this test-only change. The change remains uncommitted on
`feature/clasicifation-update`; no commit, push, tag, publication, or deployment
was performed.

Next: continue version synchronization and releases without maintaining a
duplicate package-version assertion in this test.

## Automatic pagination without load-more controls

Paginated album, artist, audiobook, podcast, playlist, search, task-history, and
shared track surfaces now request their next page automatically when their
shared sentinel approaches the viewport. The manual load-more buttons are
removed. The trigger remains silent visually and exposes only a screen-reader
loading status.

The sentinel can request again while it stays visible, so short initial pages
continue filling a tall viewport. It does not repeat a request until the item
count changes, which avoids an automatic retry loop after a failed page.
Shared track tables still reveal mounted rows in progressive batches and then
fetch additional server pages through the same trigger.

Checks completed:

- Full web suite: 208 passing
- Web typecheck
- Targeted ESLint

Known limits: browser scrolling and live viewport behavior have not yet been
visually exercised. Changes remain uncommitted on `dev` alongside pre-existing
working-tree edits; no commit, push, tag, publication, or deployment was
performed.

Next: run the production web build and visually confirm automatic prefetch in a
tall and narrow viewport, including the final page where the trigger disappears.

## Server reconnect notification cooldown

The shared server reachability state now delays an offline transition for five
seconds. Transient realtime retries and API failures therefore do not alternate
the toolbar between connected and offline or emit repeated `Back online`
toasts. A successful request or realtime connection during the cooldown cancels
the pending transition, while a sustained outage still becomes offline when the
cooldown expires.

Checks completed:

- Focused notification tests, including fake-timer cooldown and recovery cases
- Full web suite: 205 passing
- Web typecheck, targeted ESLint, and targeted Prettier
- Web production build (`nuxt generate`)

Known limits: the cooldown is covered by deterministic fake-timer tests, but a
live browser session with an intermittently failing realtime server was not
exercised. The cooldown source and test changes are in local commit `b463469`;
this handoff and decision entry remain uncommitted. No push, tag, publication,
or deployment was performed.

Next: interrupt and restore a real server connection repeatedly in the browser
to confirm the toolbar and toast behavior during retry churn.

## Native multi-architecture Docker publication

Docker publication no longer builds ARM64 under QEMU. The workflow now runs
AMD64 and ARM64 image builds in parallel on `ubuntu-24.04` and
`ubuntu-24.04-arm`, pushes each image by digest, and merges the two digests
into the normal branch, commit, release, and `stable` tags. The publication
jobs stop after 30 minutes, and the manifest merge stops after 10 minutes.

The previous combined Buildx job showed a platform-specific failure: AMD64
completed the image in 52 seconds, while ARM64 finished dependency installation
and server compilation before stalling in Vite's client bundle until GitHub
cancelled the job after six hours. The Dockerfile now exposes install,
contracts, server, and web generation as separate build steps.

Checks completed:

- `actionlint` 1.7.12 against `.github/workflows/ci.yml`
- Prettier validation of the workflow
- Contracts, server, and Nuxt production builds
- `git diff --check`

Known limits: Docker is unavailable in this checkout, so neither image nor the
manifest merge has been exercised locally. The GitHub-hosted ARM64 runner path
also requires the next workflow run to validate remotely. Changes remain
uncommitted on `fix/docker-build`; no commit, push, tag, publication, or
deployment was performed.

Next: push the branch and confirm both platform jobs complete, upload two digest
artifacts, and the merge job publishes a two-platform GHCR manifest.

## Per-track media auto-detection

Media classification is now automatic per track. A local folder or selected
Jellyfin library can contain music, audiobooks, and podcasts without separate
sources. Sources default to automatic mode and retain an optional fixed-type
override. Jellyfin `AudioBook` item types, `books` library types, podcast tags,
iTunes audiobook media type, audiobook release types, and `.m4b` extensions are
supported classification evidence. Tracks without a reliable signal remain
music.

Administrators can override an individual track or complete book/show collection
and can restore the stored automatic detection result. The server reindexes
affected catalog rows immediately. Manual overrides take precedence over fixed
source modes and survive rescans. Source and Jellyfin unchanged-item checks now
include classification state.

The Prisma 8 contract replaces source-level `mediaType` with
`classificationMode`, `fixedMediaType`, and the selected Jellyfin library's
collection type. Tracks store effective, detected, and override media types with
detection provenance. Existing source classification data is intentionally
discarded; there is no compatibility migration.

Checks completed:

- Full workspace tests: server 151, web 204, shared UI 16, desktop 4
- Full workspace type check, workspace ESLint, Prettier, and version check
- Prisma 8 contract emit and local `db update` (23 additive operations)
- Prisma migration status: no migration packages in this development setup
- Server production build
- Web production build, including 142 PWA precache entries
- `git diff --check`

Known limits: Jellyfin behavior uses mocked API responses; a live mixed Jellyfin
library and browser interaction QA were not run. Existing source classification
data has no compatibility path. All work remains uncommitted on
`feature/clasicifation-update`; no commit, push, tag, publication, or deployment
was performed.

Next: scan a real mixed library, verify the source and collection correction
menus at desktop and mobile widths, then commit the completed change.

## Single public Peridot port on 17430

The built server now serves the web SPA and API from one Fastify listener on 17430. Static assets use the generated web root, unknown GET/HEAD routes fall
back to `200.html`, and API routes remain owned by the same Fastify instance.
The second web listener and `WEB_PORT` configuration were removed.

Nuxt and Tauri development now load 17430. Nuxt proxies `/api` and WebSockets to
a private Fastify development listener on 17431, so browser development also
uses one public origin. Onboarding defaults and fallback probing use 17430 only.
Bounded LAN discovery moved from Nuxt into the Fastify server so the public
development proxy does not hide the discovery endpoint.

External web deployments can still probe a supplied IP address or URL at
`/api/health`. That public response now permits cross-origin reads; authenticated
cross-origin API access still requires the external web origin in
`PERIDOT_WEB_ORIGINS`. Compose and the Docker image publish only 17430.

Checks completed:

- Server type check and full server suite: 142 passing
- Web type check and full web suite: 204 passing
- Desktop type check and tests: 4 passing
- Shared UI tests: 16 passing
- Prisma contract validation
- `pnpm check` across version synchronization, ESLint, and Prettier
- `git diff --check`
- Server and static web production builds
- Live built-server smoke test: root and nested SPA routes returned 200, health
  returned the Peridot signature with external-origin CORS, and unknown API
  routes returned JSON 404
- Live Nuxt development proxy test: page and `/api/health` both worked through
  public port 17430 while Fastify remained private on 17431

Known limits: the full workspace build stopped at the Android package because
`JAVA_HOME` and Java are unavailable in this shell. Docker is also unavailable,
so image, Compose, and published-channel checks were not exercised. Live
cross-origin authenticated traffic from a separately hosted Peridot web client
has not been exercised. No commit, push, tag, publication, or deployment was
performed.

Next: rebuild the image, verify the Compose stack on 17430, then configure an
external web origin and exercise onboarding discovery, sign-in, realtime, and
audio playback against a LAN server.

## Fixed API and web defaults on 17430 and 17431

The API defaults to 17430 and the browser-facing web listener defaults to 17431.
The built server serves the generated SPA and proxies API, audio, and realtime
traffic through 17431 by default. Nuxt development, Tauri development, default
CORS origins, onboarding discovery, and the manual onboarding address all use
the same port contract. The manual address placeholder is
`my.server.ip:17430`.

The standard web build now runs `nuxt generate`, ensuring `.output/public`
contains the SPA entry and fallback files required by the server. A built-server
smoke test returned 200 from `/`, a nested settings route, and the proxied
`/api/health` endpoint on 17431. The README Compose snippet now includes the
tracked project name and accurately identifies the API and web ports.

Checks completed:

- Server tests: 139 passing, including new default runtime listener tests
- Web tests: 206 passing
- Desktop tests: 4 passing
- Web, server, and desktop type checks
- Server and static web production builds
- Full workspace ESLint and Prettier checks
- `docker compose config`, resolving host and container ports 17430 and 17431
- Live built-server API, SPA, nested-route, and proxied-health checks on the
  default listeners using loopback alias `127.0.0.2`
- `git diff --check`

Known limits: an existing development process already owned
`127.0.0.1:17430` with the embedded web listener disabled, so the live smoke
test used `127.0.0.2` to leave that process running. No Docker image rebuild or
Compose container startup was repeated because the Dockerfile did not change and
the resolved Compose configuration was validated directly. These changes and
the preceding portrait-orientation edits remain uncommitted on `dev`; no commit,
push, tag, publication, or deployment was performed.

Next: rebuild the Docker image from this revision and confirm the Compose stack
serves the UI and proxied health endpoint on 17431 from its default container
ports.

## Mobile portrait orientation lock

The Android activity now declares portrait orientation in the packaged
manifest, and the installable PWA manifest now requests portrait instead of
allowing any orientation. Normal desktop browser layout and the Android Auto
media service are unchanged.

Checks completed:

- New Android manifest test and the full Android Kotlin unit suite
- Android `lintDebug` and debug APK build
- Full web test suite: 206 passing
- Web type check and production build
- ESLint, targeted Prettier checks, and `git diff --check`
- Generated PWA and Android merged manifests both contain `portrait`

Known limit: rotation was not exercised on a physical device or emulator.
These changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed.

Next: install a debug build on a phone and rotate the device to confirm the
activity does not leave portrait.

## Onboarding probes both protocols on both Peridot ports

Onboarding network discovery now checks both fixed Peridot listener ports,
17431 and 17430, over both HTTP and HTTPS, and returns one result per host with
17431 preferred. A scheme-less IP or hostname probes both protocols, including
when it supplies a port. A scheme-less host without a port also probes both
listeners after its normalized default address. Explicit schemes and ports are
preserved, and every candidate must return the exact public Peridot health
signature. This lets setup work whether users enter a bare IP, hostname, or
complete server URL.

Checks completed:

- Focused onboarding, address, discovery, and client tests: 11 passing
- Full web test suite: 206 passing
- Web type check and changed-file ESLint
- Targeted Prettier checks and `git diff --check`
- Production web build, including the discovery server route and 119 PWA
  precache entries

Known limit: live LAN discovery and onboarding interaction were not exercised
against HTTP-only and HTTPS-only servers. HTTPS discovery uses normal
certificate validation, so an untrusted self-signed certificate must be trusted
by the browser or host before it can be selected. The source and decision
changes are recorded in commits `40ad58f` and `a0b86ba`; this handoff update and
the unrelated portrait-orientation edits remain uncommitted. Nothing was
pushed, tagged, published, or deployed.

Next: run onboarding from a LAN address with the embedded web server on 17431
and from development with the API on 17430, entering a bare host over both HTTP
and HTTPS in each case.

## Compose-only installation

The Compose stack now persists `/data` in a named `peridot-data` volume instead
of a relative bind mount. This lets Docker initialize writable server state with
the container user's ownership, so the README no longer requires
`mkdir -p data music`. The music source remains a read-only relative bind that
Docker creates automatically and users can replace with an existing library
path.

Checks completed:

- Current Dockerfile image built locally
- Compose stack started from a clean directory with no pre-created folders
- API health and the embedded web application both returned `200`
- Persistent volume ownership and database/updater-state creation verified
- Root and README Compose configurations, `pnpm check`, and `git diff --check`
  passed

Known limit: the clean-directory run used the locally built image rather than
pulling the published GHCR `stable` tag.

No commit, push, tag, publication, or deployment was performed.

## Mobile search shortcut hint

The global search bar now hides its `Ctrl`/`Command` + `K` keycap hint below the
desktop breakpoint. The input no longer reserves space for the hidden hint on
mobile, while the shortcut continues to open and focus search at every width.
The change was committed as `fc1c10e`.

Checks completed:

- Targeted search shortcut and search view tests: 7 passing
- Web type check
- Targeted ESLint and Prettier checks
- Web production build
- `git diff --check`

Known limits: live visual QA at mobile and desktop widths was not run. The
documentation cleanup below remains uncommitted.

Next: confirm the search header at a narrow viewport and at the `md`
breakpoint.

## AI-facing documentation cleanup

Corrected the malformed README heading markup and inaccurate interface image
alternative text. Updated the infrastructure README so it no longer describes
the already implemented Docker image and Compose orchestration as future work.
Formatting in the decision log is also normalized.

## Multi-type catalog search

The global search page now includes local artists, albums, tracks, audiobooks,
and podcasts. Each result type has its own paginated section and a matching
quick filter. Artists open their existing detail routes, while audiobook books
and podcast shows reuse the established media collection cards for navigation,
playback, likes, and offline controls.

Search continues to use the existing bounded catalog endpoints. Server coverage
now verifies artist-name queries, audiobook-author queries, and podcast-publisher
queries in addition to the existing track search.

Checks completed:

- Web tests: 200 passing
- Server tests: 132 passing
- Web and server type checks
- Workspace ESLint
- Prisma 8 contract emit and validation
- Web and server production builds
- Targeted Prettier checks and `git diff --check`

Known limits: live browser visual QA and interaction testing with a populated
mixed-media library were not run. Search issues one request for the first page
of each result type, so live visual review should confirm the five-section layout
at desktop and mobile widths. No commit, push, tag, publication, or deployment
was performed.

Next: verify the search filters and section spacing with mixed music, audiobook,
and podcast data, then exercise load-more in each paginated result group.

## Docker deployment and embedded web runtime

Added a production Docker image and Compose stack with the API on 17430 and the
embedded Nuxt SPA on 17431. The second Fastify listener serves static/PWA files,
uses the SPA fallback, and proxies API, ranged audio, and realtime WebSocket
traffic to the API listener. Restart lifecycle handling now closes, rebuilds,
and relistens both servers.

Added build-channel update metadata and administrator Settings controls for
checking and installing updates. `dev` follows development, `master` is beta,
and `stable` (the default production channel) follows non-prerelease
`vX.Y.Z` releases. CI publishes multi-architecture GHCR images for branches,
commits, release tags, and stable. The maintained Watchtower fork polls every
six hours and accepts private manual update requests.
The container entrypoint generates the shared updater token automatically in
`/data`; copying the Compose file does not require a separately supplied
environment token.

Synchronized all workspace packages to `0.0.1`. The root version is
authoritative; `pnpm version:sync` updates package manifests and
`pnpm version:check` is part of `pnpm check` and CI. Release tags must match the
root version.

The README now shows the concise Docker installation flow with production as
the default channel.

Checks completed:

- `peridot:test` image built successfully with Node 24.15
- Container startup migrated a fresh volume, became healthy, served the UI and
  nested Settings route on 17431, and returned the proxied health response
- Web tests: 202 passing
- Server tests: 137 passing
- Full workspace typecheck and cross-platform test suite passed
- Server and web production builds passed
- Compose configuration validated without a user-provided environment token
- A copied Compose stack generated its updater token, started both services,
  became healthy, and served the UI and proxied API on alternate test ports
- Watchtower 1.24.0 image and required update/label flags were verified
- Formatting, lint, version synchronization, schema validation, and
  `git diff --check` passed

Known limits: the GHCR publish job has not run until changes are pushed, and
the updater cannot replace the container when Peridot is run outside the
included Compose stack. Live GitHub update discovery and Watchtower container
replacement were not exercised because this work was not pushed or deployed.

## Parallel CI test suites

Fixed the Android test job's Linux checkout failure by tracking
`apps/android/android/gradlew` as executable (`100755`). The root `pnpm test`
command now excludes the Android package from the cross-platform workspace
suite. CI now runs Web, Server, shared UI, Desktop, and Android tests in
independent parallel jobs after linting. The matrix uses `fail-fast: false` so
all package results are reported, while any failed matrix entry fails the
aggregate `test` job. All artifact builds require both `test` and `test-android`
to pass. Both Android jobs use `android-actions/setup-android@v4` with
`platform-tools`, avoiding the removed legacy `tools` package that broke v3
before SDK 36 installation began. Android generation now builds
`@peridot/contracts` before generating the shared web client, fixing clean-check
CI runs that could not resolve the package's `dist` entrypoint.

Checks completed:

- Each CI matrix command passed independently: web 200, server 132, shared UI
  16, and desktop 4 tests
- `pnpm android:test`: Capacitor sync and Android Kotlin unit tests passed
- `pnpm android:build`: Capacitor sync and debug APK build passed
- `pnpm --filter @peridot/android generate`: dependency build and web
  generation passed
- Workflow YAML formatting, syntax, and Android SDK action configuration
  validation passed
- `git diff --check` and indexed Git mode verification passed

No commit, push, tag, publication, or deployment was performed. The workflow and
documentation changes remain uncommitted.

The upgraded setup-android action has not executed remotely yet; the next CI run
on the updated workflow should be used to confirm the Linux SDK installation.

## Android client with Android Auto

Added `apps/android`, a Capacitor 8 Android client that packages the shared
Nuxt UI and includes a native Kotlin Media3 `MediaLibraryService`. The service
owns background playback, lock-screen and media-button control, queue state,
playback resumption, and Android Auto browsing for Queue, Liked songs, Albums,
Artists, Playlists, and search.

The shared Vue player now selects a native Android transport while retaining
the browser audio adapter elsewhere. Android session tokens are stored in
Keystore-backed native preferences, playback URLs resolve through short-lived
server tokens, and offline phone playback uses app-private files. Android Auto
remains online-only.

Packaged Android builds disable the PWA service worker and use the server's
exact `http://localhost` CORS origin. The app supports self-hosted HTTP servers
through Android cleartext networking. A local upload key and ignored signing
configuration were created for Play-ready APK/AAB builds.

Checks completed:

- Full workspace tests: web 198, server 132, shared UI 16, desktop 4, and
  Android Kotlin 3
- On-device MediaBrowser instrumentation test for the Android Auto root on the
  Pixel 8 AVD
- Pixel AVD onboarding, login, catalog load, native playback, media session,
  native offline file creation, black system bars, and absence of browser
  plugin/service-worker errors
- Android `lintDebug`, workspace ESLint, full type checking, Prisma validation,
  full production workspace build, and `git diff --check`
- Signed release APK and AAB builds; APK v2 signature verification passed

Android Auto Desktop Head Unit verification against a physical Android device
was not completed because no physical device was connected. Play Console upload,
publication, tagging, and deployment were not performed.

`pnpm format:check` still reports only the pre-existing formatting issue in
`README.md`. The local upload key is
`.peridot/android-release.keystore`; signing values are in the ignored
`apps/android/android/signing.properties`. Back up both before submitting to
Play. The signed APK is
`apps/android/android/app/build/outputs/apk/release/app-release.apk` and the AAB
is `apps/android/android/app/build/outputs/bundle/release/app-release.aab`.

## Audiobooks and podcasts categories

Audiobooks and podcasts are now first-class browse categories beside Albums,
Artists, and Playlists. Sources are explicitly classified as music, audiobooks,
or podcasts; existing rows migrate to music. Audiobooks group into book
collections by title and author with chapter ordering, while podcasts group into
shows by title and publisher with newest-first episode ordering. Both use the
existing player, queue, likes storage, and per-track offline cache.

The web app adds Audiobooks and Podcasts navigation routes, collection cards,
detail pages, collection playback, collection likes, and offline collection
controls. Music-only Albums, Artists, Home suggestions, metadata providers, and
Quick picks exclude the new media types. Search and playlists support explicit
mixed-media track results. Settings → Admin → Sources now shows each source's
media type, supports changing it with an automatic reclassification scan, and
lets administrators discover and add individual Jellyfin libraries.

The Prisma 8 contract adds media type and publication fields plus a Jellyfin
library ID. The additive `db update` applied 12 operations to the local
development database without resetting existing data. The catalog projection
version is 5 and the local metadata version is 6 so existing tracks are
reindexed once. Browser offline catalog storage moved to a v2 database so old
snapshots are rebuilt while saved audio manifests remain reusable.

Checks run:

- Server tests: 131 passing
- Web tests: 194 passing
- Shared UI tests: 16 passing
- Desktop tests: 4 passing
- Full workspace lint and type check
- Prisma 8 contract emit, validation, and additive local `db update`
- Full workspace production build, including 115 PWA precache entries
- Targeted Prettier checks and `git diff --check`

Known limits: live browser visual QA of the new navigation and source-library
dialog was not run. Jellyfin behavior is covered with mocked API responses; a
complete mixed-library Jellyfin sync was not exercised. RSS/OPML podcast
subscriptions are intentionally out of scope. The root `pnpm format:check`
still reports only the pre-existing unformatted `README.md`, which was preserved.
All work remains uncommitted with unrelated changes preserved; no commit, push,
tag, publication, or deployment was performed.

Next: visually confirm Audiobooks, Podcasts, playback/offline controls, and
Jellyfin library selection at desktop and mobile widths, then exercise one real
mixed Jellyfin server.

## Automatic source and metadata refresh

The server now refreshes configured library sources when it starts and on a
persisted cron schedule. Automatic refresh is enabled by default with the
five-field local-time expression `0 3 * * *`; six-field expressions with seconds
are also accepted. The all-source scan queues metadata matching on completion,
so source discovery and metadata enrichment use one scheduled pipeline.

Administrators can enable, pause, and change the schedule from
Settings → Admin → Server, with a crontab.guru help link beside the cron
guidance. `GET /api/admin/server` now returns the saved schedule and next run,
while `PUT /api/admin/server` validates and persists changes and reschedules the
active job without a restart. Invalid cron expressions leave stored settings
unchanged. Timed refreshes coalesce with active scans, and the job timer is
stopped during server shutdown.

Checks run:

- Full workspace tests (server 128, web 191, shared UI 16, desktop 4)
- Full workspace type check and ESLint
- Prisma contract generation and validation
- Production workspace build, including 106 web PWA precache entries
- Targeted Prettier checks and `git diff --check`

Previously existing uncommitted genre, artwork-fade, metadata-settings, and
documentation changes were preserved. No commit, push, tag, publication, or
deployment was performed.

`pnpm format:check` still reports only the pre-existing formatting issue in
`README.md`. Live browser visual QA and a live Jellyfin startup refresh were not
run; startup and cron behavior are covered with local-server integration tests.

Next: verify the schedule control visually in Settings → Admin → Server and
exercise startup refresh against a live Jellyfin source.

## Track genres and metadata provider support

Tracks now store normalized multi-valued genres from embedded file tags and
Jellyfin items. Discogs release genres and styles plus MusicBrainz release
genres and tags are included in provider candidates and persisted when a
metadata match is applied. Provider genres override file genres while a match
is active; reverting or resetting metadata restores the file genres.

Track API responses expose an effective `genres` array and provider metadata
responses expose the selected provider genres. Track rows and metadata menus
show genres, metadata candidates preview provider genres, and catalog search
matches genre text through the indexed projection. The local metadata version
is now 5 and the catalog projection version is 4 so unchanged tracks are
rescanned once and indexed without manual database recreation.

Checks run:

- Full workspace test suite (server 125, web 191, shared UI 16, desktop 4)
- Full workspace type check and ESLint
- Prisma contract generation and validation
- Production workspace build, including 106 web PWA precache entries
- Targeted Prettier checks and `git diff --check`

`pnpm format:check` still reports only the pre-existing formatting issue in
`README.md`.

Known limits: live Jellyfin, MusicBrainz, and Discogs response QA was not run;
provider behavior is covered with mocked API responses. Album-level genre
editing and dedicated genre filters were not added. Existing unrelated
uncommitted artwork, metadata-settings, and documentation changes were
preserved. No commit, push, tag, publication, or deployment was performed.

Next: visually confirm genre presentation in library, album, and
metadata-correction surfaces.

## Cover art and artist portraits fade in after loading

Album cover art and artist portraits now start transparent and fade to full
opacity only after the browser reports that the image loaded. A shared
fade-in-image primitive resets when its source changes and keeps the semantic
placeholder underneath while an image is loading or unavailable. The behavior
covers album cards, album details, track rows and queue artwork, playlist
mosaics, quick picks, both fixed-player cover layers, artist cards, and artist
details. Reduced-motion users receive the loaded image without an opacity
transition.

Checks run:

- Focused image-fade, album, artist, player, quick-pick, and styling tests
  (13 passing)
- Full web test suite (191 passing)
- Web type check
- Workspace ESLint
- Targeted Prettier checks
- Production web build (106 PWA precache entries)

Known limits: live browser visual confirmation of the fade was not run. The
separate uncommitted changes in `apps/web/app/pages/settings/metadata.vue` and
`apps/web/test/settings-page.test.ts` were preserved and are not part of this
image-fade change. All image-fade changes remain uncommitted on `dev`; no commit,
push, tag, publication, or deployment was performed.

Next: visually confirm the fade and reduced-motion behavior with a library cover
that does not remain in the browser cache.

## Tasks can be stopped and active sources can be deleted

Administrators can stop queued or running tasks from Settings → Admin → Tasks.
Stopping a queued task prevents it from starting. Running library scans and
metadata tasks receive a task-specific abort signal, stop at their next safe
iteration, and finish with a distinct `stopped` status and administrator-stop
message. The authenticated stop endpoint is
`POST /api/admin/tasks/:id/stop`.

Source removal is available while tasks are active. Before deleting a source,
the server stops running or queued tasks scoped to that source plus unscoped
all-source tasks that could access it. Source-specific tasks for other sources
continue. The source row menu no longer disables Remove while any task is active,
and its confirmation explains the cleanup behavior.

Task change emissions are now tracked and awaited during shutdown before the
catalog and SQLite database close. This fixed a late-event race exposed while
testing source creation immediately followed by teardown.

Checks run:

- Full server test suite (123 passing), including running/queued cancellation,
  administrator authorization, source deletion with relevant and unrelated
  tasks, and shutdown emission cleanup
- Full web test suite (189 passing)
- Full workspace type check, including the desktop shell
- Workspace ESLint
- Prisma contract validation and generation
- Server and web production builds
- Targeted Prettier checks and `git diff --check`

Known limits: live browser interaction QA of Stop and source removal was not
run. Automated core executors honor cancellation, while future isolated plugin
runtimes must implement equivalent abort handling when they are introduced. The
pre-existing `package-lock.json` deletion remains untouched, and the root
`pnpm format:check` still reports only the pre-existing `README.md` formatting
issue. All changed files pass targeted Prettier checks. No commit, push, tag,
publication, or deployment was performed.

## Sources sidebar keeps its count during scans

The Settings sidebar no longer replaces or supplements the Sources counter with
library-scan progress. Sources always shows the configured-source count once
loaded, including while a scan is active. Scan progress remains beside each
source row so it stays associated with the source being processed. Task and
metadata progress indicators are unchanged.

Checks run:

- Full web test suite (189 passing)
- Web type check
- Targeted ESLint and Prettier checks
- Production web build
- `git diff --check`

Known limits: live browser visual confirmation was not run. The pre-existing
deletion of `package-lock.json` remains untouched. No commit, push, tag,
publication, or deployment was performed.

## Jellyfin audio sources

Settings → Admin → Sources now offers `Jellyfin instance` beside the
server-internal folder option. Administrators enter the Jellyfin server URL and
an API key; Peridot validates the connection, stores the key encrypted, derives
the source name from Jellyfin, and queues the first source scan. Multiple
instances are supported, while duplicate normalized URLs are rejected.

Jellyfin scans request only `Audio` items and import MP3, M4A/AAC, OGG/Opus,
WAV, and FLAC originals. Item IDs and ETags update the local catalog without
duplicates, album artwork is cached with the existing cover store, and removed
remote items become unavailable without being deleted. Unsupported audio
containers are skipped and reported in the scan error count. The existing
automatic metadata task still runs after successful scans.
Each source row shows its current available file count and the latest successful
sync time. The Settings sidebar shows the number of configured sources beside
Sources; both views refresh after completed source-scoped or all-source scans.
Active metadata tasks show a compact progress circle beside Metadata in the
settings sidebar, and every active task shows one beside Tasks. Library-scan
progress appears on the corresponding source row while the Sources navigation
item keeps its configured-source count.
Jellyfin pages are processed incrementally so progress advances while large
libraries are importing, and repeated album covers are fetched once per scan.
The Jellyfin header timeout is 60 seconds to account for large library pages.
Failed tasks, completed tasks with warnings, and running tasks interrupted by a
server restart now appear in Settings → Admin → Logs.

The existing authenticated Peridot audio endpoint now proxies Jellyfin GET,
HEAD, and byte-range requests using the server-side API key. Browser code and
logs never receive the credential. Removing a Jellyfin source removes that
instance's imported catalog rows while preserving playlist display snapshots.

Checks run:

- Server tests (120 passing), including credential encryption, multiple
  instances, audio-only scans, artwork, ETag updates, deleted-item availability,
  source removal, task failure logging, and proxied GET/HEAD/range playback
- Web tests (189 passing) and shared UI tests (16 passing)
- Full workspace type check
- Workspace ESLint
- Prisma contract validation and generation
- Full workspace production build, including the bundled Jellyfin WebP asset
  and a 106-entry web precache
- Targeted Prettier checks
- `git diff --check`

Known limits: live Jellyfin authentication and the first audio page were
verified, but a complete large-library sync and browser visual QA were not run.
Automated behavior remains covered with mocked Jellyfin API responses. No
commit, push, tag, publication, or deployment was performed. The root
`pnpm format:check` still reports the pre-existing formatting issue in
`README.md`; all changed files pass Prettier.

## Add-source dialog uses server-internal folders

The administrator add-source dialog now labels the path source as
`Server internal folder` and no longer offers external URL creation. Existing
URL source records remain visible and removable for compatibility, and the
server source contract is unchanged.

Checks run:

- Focused settings and localization tests (19 passing)
- Full web test suite (187 passing)
- Web type check
- Targeted ESLint and Prettier checks
- Production web build (107 PWA precache entries)
- `git diff --check`

Known limits: live browser visual confirmation was not run. No server, schema,
dependency, or lockfile changes were made. The work is uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

## Toasts moved below the topbar

The shared app-level toast region now opens at the top-right, below the 64px
topbar, in both the main player shell and fullscreen settings layouts. Mobile
keeps full-width side insets while desktop uses a bounded right-aligned stack.

Checks run:

- Focused notification placement test
- Full web test suite (187 passing)
- Web type check
- Targeted ESLint and Prettier checks
- Production web build (107 PWA precache entries)
- `git diff --check`

Known limits: live visual confirmation was not run. Existing uncommitted
server, web, shared UI, and documentation changes were preserved. No commit,
push, tag, publication, or deployment was performed.

## Homepage keeps liked suggestions visible

Homepage tracks and albums no longer disappear when their like state changes.
The suggestion selectors no longer filter against the likes set, so selecting a
heart updates the existing row or card in place. Liked artists still affect
suggestion order, and the bounded candidate queries and complete collection
routes are unchanged.

Checks run:

- Focused homepage and suggestion tests (5 passing)
- Full web test suite (187 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (107 PWA precache entries)
- `git diff --check`

Known limits: existing uncommitted server, web, shared UI, and documentation
changes were preserved. No commit, push, tag, publication, or deployment was
performed.

Next: perform visual confirmation that a liked homepage title remains in place
during the next browser pass.

## Liked titles offline library setting

The previously empty Library settings page now has an enabled-by-default
`Make my liked titles available offline` option with a bundled Basil
cloud-download icon. The preference persists in browser storage separately for
each server and user, and malformed values return to the enabled default.

When the preference is on, the authenticated root client pages through the
complete liked-track catalog, reuses the existing offline collection saver, and
caches only available tracks that are not already present. Existing likes are
backfilled after a connected load, and changes to the likes set trigger another
synchronization so a newly liked track is saved automatically. Turning the
option off stops further automatic saves and deliberately leaves existing
offline copies in place, including copies that may have been requested manually.

Checks run:

- Focused Library setting and pagination tests (4 passing)
- Full web test suite (187 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (107 PWA precache entries)

Known limits: live browser visual QA did not run because Computer Use could not
verify the active Brave URL and stopped the UI automation session. Automatic
save failures are retried by a later connection, preference, or likes change
rather than producing background failure toasts. Existing uncommitted server,
web, shared UI, and documentation changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: confirm the icon, text, switch alignment, and enabled default in Settings
→ Library at desktop and mobile widths during the next available browser pass.

## Confirmed server restart

Administrators now have a confirmed `Restart server` action in
Settings â†’ Admin â†’ Server. The authenticated endpoint returns `202` before
closing the current Fastify runtime and building a fresh runtime on the same
host and port. Sessions, catalog data, and settings persist in SQLite; running
tasks become interrupted and queued tasks resume.

The destructive Disconnect control is placed at the bottom-right of the page,
while Restart remains a separate confirmed outline action in the server card.
The restart button stays disabled and reads `Restarting` after the request is
accepted until the realtime connection reports a loss and then reconnects. The
existing connection monitor announces when the server is back online.
Focused server tests cover administrator authorization, the accepted response,
and runtimes without a restart hook. Web tests cover the API request,
confirmation dialog, and destructive Disconnect treatment.

Checks run:

- Full server test suite (114 passing)
- Full web test suite (187 passing)
- Server and web typechecks
- Web and server production builds
- Workspace lint and targeted Prettier checks
- `pnpm format:check` reports only the pre-existing unformatted `README.md`
- Isolated live restart smoke test with a temporary database: accepted
  `restarting` response, observed down/up cycle, same process and port, fresh
  Fastify listen, and the original administrator session remained valid
- `git diff --check`

This work is uncommitted on `dev`; unrelated working-tree changes were
preserved. No commit, push, tag, publication, or deployment was performed.

Next: verify the live restart path against a running development server and
confirm the disconnect/reconnect indicator in the browser.

## Offline save success toasts

Making a track or album available offline now shows a success toast after the
save completes. The track message is shared by the track table and track
context menu through the existing toast manager, while the album message is
emitted from the shared album offline composable. Removing an offline copy
remains silent, and save failures continue to use their existing error toasts.

Checks run:

- Focused notification, offline, and context-menu tests (28 passing)
- Full web test suite (182 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: live browser toast positioning and dismissal were not visually
verified. Existing uncommitted changes were preserved. No commit, push, tag,
publication, or deployment was performed.

Next: confirm both toast variants appear above the player after completing an
offline save during the next browser pass.

## Liked songs live removal

Removing a track like now removes that track from the Liked songs page
immediately. The page filters its cached catalog results against the
authoritative likes query, including the visible track count and empty state.
Track-table like controls use the loaded likes cache instead of stale `liked`
flags from an earlier catalog response, while preserving server state until the
likes query is available. Successful like changes also invalidate cached track
queries so newly liked tracks and later page visits reflect server membership.

Checks run:

- Focused likes and library tests (31 passing)
- Full web test suite (181 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)

Known limits: live browser visual QA was not run. Schema validation was skipped
because no server, contract, or database code changed. Existing uncommitted
changes were preserved. No commit, push, tag, publication, or deployment was
performed.

Next: confirm the row removal, count, empty state, and failed-request rollback
during the next browser pass.

## GitHub Actions quality pipeline

Split CI into ordered quality stages. Pull requests, pushes to `dev` and
`master`, and `v*` tag pushes run formatting, linting, schema validation, and
type checking before tests. Web, server, and desktop builds start only after
tests pass. Commit linting remains an independent pull-request check.

The desktop job installs the Linux Tauri prerequisites and Rust toolchain, while
the web and server jobs use filtered Turbo builds. Pull requests now run for all
target branches, and superseded runs on the same ref are cancelled.

Checks run:

- Workflow Prettier and `git diff --check`
- `pnpm lint`
- `pnpm db:validate`
- `pnpm typecheck`
- `pnpm test`
- Filtered web and server production builds
- `pnpm desktop:build`, including the generated client and Windows executable

`pnpm format:check` currently reports only the existing unformatted `README.md`
edit, which was preserved. Local desktop verification required
`NUXT_IGNORE_LOCK=1` because a development server was already using the web
workspace; CI runners start without that lock. The workflow has not run on
GitHub yet, so the Ubuntu Tauri dependency installation remains to be confirmed
there. Changes are uncommitted, and no commit, push, tag, publication, or
deployment was performed.

Next: push the workflow and confirm all lint, test, web, server, and desktop jobs
pass on a GitHub pull request or `dev` push.

## Library landing headers

Removed the descriptive subtitle beneath the page title on Liked songs,
Playlists, Albums, and Artists. Their headings and page actions remain
unchanged, and the unused English message keys were removed. A focused source
regression test keeps the four titles while preventing those subtitles from
returning.

Checks run:

- Full web test suite (181 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: live browser visual QA was not run. Existing uncommitted web,
server, shared UI, and documentation changes were preserved. No server, schema,
dependency, or lockfile changes were made. No commit, push, tag, publication, or
deployment was performed.

Next: visually confirm the four landing-page headers at desktop and mobile
widths during the next browser pass.

## Product-neutral runtime copy

Updated the `en-US` runtime messages to describe the action, state, or relevant
server instead of making Peridot the grammatical subject. Examples include
`Reconnected to your server.`, `Server found.`, `Could not update your
profile.`, and simplified references such as `your server`. The onboarding
heading is now `Get started`, and logout asks `Log out?`.

The runtime product name remains in `app.name` and browser page titles. Matching
fallback messages in the web client and server-address validation were updated
so missing localization resources do not restore the old product-led wording.

Checks run:

- Focused localization, client, and address tests (25 passing)
- Full web test suite (180 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)
- `git diff --check`

Known limits: live browser copy review was not run. Existing concurrent web,
server, shared UI, and documentation changes were preserved. No server, schema,
dependency, or lockfile changes were made. No commit, push, tag, publication, or
deployment was performed.

Next: review the revised copy in onboarding, connection recovery, and settings
states during the next live browser pass.

## Automatic local credential encryption key

`PERIDOT_CREDENTIAL_KEY` is now optional for normal local installation. When it
is unset, server startup creates a random 32-byte AES-256-GCM key beside the
SQLite database as `<database path>.key`, with restrictive creation permissions
where supported, and reuses that file across restarts. The key remains outside
the database so a database-only copy or backup does not expose the provider
token. The environment variable remains available as an explicit override for
container deployments, secret managers, and migration between hosts. A working
environment key is imported into the local key file when existing credentials
need migration. Startup refuses to generate a replacement when stored
credentials exist but neither available key can decrypt them.

Credential creation no longer depends on a manual setup step. Tests cover key
creation, reuse across store instances, environment-key migration, rejection of
incompatible keys, invalid key file handling, and automatic Discogs token
storage without an environment key. The local key must be retained with the
deployment; replacing it after credentials have been encrypted makes their
existing ciphertext unreadable.

Checks run:

- Server typecheck
- Root ESLint on all changed server source and test files
- Full server suite (112 passing)
- Production server build
- Prettier checks for changed source, tests, and documentation

No schema or browser-code changes were made. Existing uncommitted web, shared UI,
and documentation changes were preserved. No commit, push, tag, publication, or
deployment was performed.

## Catalog metadata overflow coverage

Extended the shared `ScrollingText` behavior across all catalog metadata that
can be clipped. Track and album titles, artist credits, playlist names, album
cards, artist cards, track tables, queue rows, quick picks, playlist entries
and pickers, detail headers, context-menu labels, and metadata correction
results now scroll only when their content exceeds the available width.

The player title and artist line remain always-on and pause during hover or
keyboard focus. All other adopted surfaces use the default hover/focus
activation so the interface does not move continuously. Links and context-menu
triggers remain interactive through the single slotted content tree, and
reduced-motion users retain static clipping. Settings, folder paths, task
details, user-management records, and other non-catalog text were intentionally
left unchanged.

Checks run:

- Focused catalog, player, card, queue, quick-pick, styling, and overflow tests
  (43 passing)
- Shared UI suite (16 passing)
- Full web test suite (180 passing)
- Web typecheck
- Root ESLint
- Targeted Prettier checks for all changed source and test files
- Production web build (96 PWA precache entries)
- Development server startup with web and health endpoints returning HTTP 200

Known limits: live browser visual QA was not repeated because Computer Use
could not verify the active browser URL in the prior session. Existing
concurrent context-menu, offline, search-shortcut, playlist, and
contributor-guidance changes were preserved. No server, schema, localization,
README, package dependency, or lockfile changes were made. No commit, push,
tag, publication, or deployment was performed.

## Search shortcut malformed event guard

The global search shortcut now ignores keydown input whose `key` value is not a
string before attempting case normalization. This prevents the development
runtime crash reported at `event.key.toLowerCase()` while preserving the
Ctrl/Command + K behavior.

Checks run:

- Focused search-shortcut tests
- Web typecheck
- Targeted ESLint and Prettier checks

Existing uncommitted player, scrolling-text, context-menu, offline, playlist,
and contributor-guidance changes were preserved. No commit, push, publication,
or deployment was performed.

## Track context menu offline availability

The shared track context menu now exposes `Make available offline` immediately
above the browser Download action. It reuses the per-track offline manifest,
shows determinate or indeterminate save progress, disables duplicate actions,
and changes to `Remove offline copy` once the track is stored. Saving and
removing remain available through the existing offline control in track rows,
and failures use the same offline-save toast.

Checks run:

- Focused context-menu tests (2 passing)
- Full web test suite (178 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)

Known limits: live browser pointer and keyboard QA of the updated menu was not
run. Existing uncommitted player, scrolling-text, playlist, like, offline, and
contributor-guidance changes were preserved. No server, schema, dependency,
README, or lockfile changes were made. No commit, push, tag, publication, or
deployment was performed.

## Initial player title overflow motion

Added the shared `ScrollingText` component and initially applied it to the fixed
player's active track title. Overflowing titles move at 30 px/s from their
starting position to reveal the ending, hold for 1.5 seconds, return to the
start, hold again, and repeat continuously. Hovering or focusing the title
pauses at the current position; leaving resumes. Short titles remain static and
unchanged.

The component uses one slotted content tree, so title links and the existing
track context-menu trigger remain interactive without duplicated markup.
Viewport and content changes remeasure and restart the motion. Reduced motion
keeps the previous static clipped presentation. The player gained a bounded
metadata width for correct overflow measurement, and the shared UI entry is
included in Nuxt's development dependency pre-bundling.

Checks run:

- Shared UI suite (16 passing)
- Full web test suite (178 passing)
- Web typecheck
- Root ESLint
- Targeted Prettier checks for every changed source and test file
- Production web build (96 PWA precache entries)
- Development server startup with web and health endpoints returning HTTP 200

Known limits: live browser visual QA could not run because Computer Use could
not verify the active browser URL as allowed and stopped the UI automation
session. The final root `pnpm check` also reports the pre-existing README
formatting warning; the changed files pass Prettier. No server, schema,
localization, README, package dependency, or lockfile changes were made. No
commit, push, tag, publication, or deployment was performed.

This initial player-only scope was subsequently extended across catalog
metadata as documented above.

## Player metadata like and context menu

The fixed player's like control now sits immediately to the right of the active
track's artist links instead of in the transport row. The active title and
artist block is now a trigger for the shared track context menu, so right-click
or long-press exposes the same playback, queue, playlist, favorite, download,
album/artist navigation, and metadata actions used by track lists.

Checks run:

- Focused player, context-menu, and styling tests (6 passing)
- Full web test suite (178 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)
- Live Tauri verification against `http://127.0.0.1:3000`: like placement,
  right-click activation, and rendered context-menu actions
- `git diff --check`

Known limits: the live menu was exercised at the current desktop window size;
compact/mobile visual QA was not repeated. Existing uncommitted playlist, like,
offline, and contributor-guidance changes were preserved. No commit, push, tag,
publication, or deployment was performed.

## Home album and track suggestions

Home no longer mirrors the user's liked collections. It now shows a bounded
suggestion feed of up to ten albums and ten tracks, excluding liked records and
prioritizing albums and tracks by artists the user has liked. The suggestion
heading has no count badge or collection links. Artists are not rendered as
suggestions, while the separate playlist preview remains on Home.

Checks run:

- Focused suggestions, homepage, progressive-loading, and playlist tests
  (13 passing)
- Full web test suite (177 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)
- `git diff --check`

Known limits: live browser visual QA was not run. The query uses the first 100
album and track candidates, so an unusually large block of liked records can
reduce the number of suggestions. Existing uncommitted playlist, likes,
offline, and contributor-guidance changes were preserved. No commit, push, tag,
publication, or deployment was performed.

## Player like control beside repeat

The fixed player's existing track like control now sits directly after the
repeat control in the transport row instead of beside the active-track
metadata. Its persisted liked state, pending state, accessible label, and
authentication-aware disabled state are unchanged. A player regression asserts
the control's position so it remains part of the transport group.

Checks run:

- Focused player tests (2 passing)
- Full web test suite (175 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (97 PWA precache entries)
- `git diff --check`

Known limits: live browser visual QA was not run. Existing uncommitted playlist,
likes, offline, and contributor-guidance changes were preserved. No commit,
push, tag, publication, or deployment was performed.

## Contributor guidance moved out of README

The operational and contributor guidance previously contained in `README.md`
was moved to `docs/DEVELOPMENT.md` without dropping its setup commands,
architecture notes, configuration, API behavior, formatting rules, commit
conventions, branch policy, or UI rules. `AGENTS.md` now requires agents to read
that reference and to treat the README as user-facing documentation rather than
the agent instruction layer.

`README.md` is intentionally reduced to the project name, tagline, and product
description so the owner can rewrite it. The duplicated license section in
`AGENTS.md` was also removed.

Checks run:

- Prettier check for every changed Markdown file
- Local Markdown link validation for every changed documentation file
- `git diff --check`

Known limits: documentation-only change; application code, dependencies, schema,
tests, and builds were not changed. No commit, push, tag, publication, or
deployment was performed.

Next: rewrite `README.md` for the audience and structure requested by the owner.

## Home library overview

The standalone Library page and sidebar item are removed. Home now acts as the
library overview with bounded liked-song, liked-album, and liked-artist
previews, plus the current playlist state. Focused routes still provide complete
liked songs, playlists, albums, and artists. The sidebar order is Home, Liked
songs, Playlists, Albums, and Artists, and old `/library` links fall through the
existing catch-all redirect to Home.

Checks run:

- Focused homepage, navigation, localization, and progressive-loading tests
  (12 passing)
- Full web test suite (170 passing)
- Web typecheck
- Production web build (94 PWA precache entries)
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: playlist creation remains unavailable, and live browser visual
QA was not run. Schema and server checks were skipped because this change only
uses existing catalog and likes APIs. Existing uncommitted onboarding, splash,
offline-tag, and desktop changes were preserved. No commit, push, tag,
publication, or deployment was performed.

## Branded startup splash

The web app now mounts a full black startup splash before the application
layout. The shared PeridotSpinner is centered in the viewport, shows the
localized Loading status to assistive technology, and fades into the mounted
app after a short minimum interval. Reduced-motion users retain the shared
static brand mark and skip the fade.

Nuxt's `app/spa-loading-template.html` places an inline copy of the spinner in
the initial HTML. The splash therefore appears before the client bundle loads
and remains through SPA startup, then hands off to the mounted Vue overlay for
its fade-out. The inline geometry is covered by the branding test so it cannot
drift from the shared spinner accidentally. The PWA manifest now uses black as
its launch background to avoid a white frame in installed-app startup.

The splash is limited to the root application startup and does not replace the
existing page-level loading states during client-side navigation.

The Tauri main window also has an opaque black `backgroundColor`, preventing
the native webview surface from showing a different default before the client
shell or splash paints.

The desktop sidebar now has back and forward history controls immediately to
the right of the Peridot brand. They use Vue Router history, larger `size-5`
bundled Basil caret icons, and localized accessible labels. The control group
is rendered only inside the Tauri desktop shell, and remains hidden below the
existing desktop breakpoint so it does not appear in either the web sidebar or
the mobile navigation drawer.

Checks run:

- Focused branding, history, icon, localization, and styling tests
- Focused desktop-only sidebar history regression (1 passing)
- Web test suite (169 passing)
- Web typecheck
- Production web build (95 PWA precache entries)
- Production HTML contains the inline loader before the first body script; the
  served manifest uses `#000000` as its launch background
- Desktop suite (4 passing)
- Desktop `cargo check`
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: live browser visual QA pending. Existing uncommitted onboarding,
splash, and offline-tag changes were preserved. No commit, push, tag,
publication, or deployment was performed.

## Static offline tag

The topbar connection warning no longer pulses. Its bundled
`ooui:network-off` icon, Offline label, standard foreground color, accessible
connection explanation, and tooltip are unchanged.

Checks run:

- Focused task-progress tests (9 passing)
- Full web suite
- Web typecheck
- Targeted ESLint and Prettier checks
- `git diff --check`

Known limits: browser visual QA was not run. No commit, push, tag, publication,
or deployment was performed.

## Search shortcut and desktop media keys

The top-bar search can now be opened from anywhere in the authenticated app with
`Ctrl+K` on Windows/Linux or `Cmd+K` on Apple platforms. The shortcut activates
the existing `/search` route and focuses its single input. The bar shows the
platform-specific shortcut using the official shadcn-vue `Kbd`/`KbdGroup`
components, while `aria-keyshortcuts` provides the accessible instruction.

The desktop app now registers Play/Pause, Previous, and Next media keys through
Tauri's official global-shortcut plugin while an active track exists. The keys
drive the existing app-level player and are unregistered when no track is active
or the app unmounts, so an idle Peridot window does not capture keys from other
apps. The Tauri capability allows only shortcut registration and
unregistration.

Browsers and installed PWAs that support the Media Session API publish the
current track metadata, artwork, playback state, and position, with transport
handlers for play, pause, previous, next, and seeking. Desktop skips this browser
path while using the native Tauri shortcuts.

Checks run:

- Full web suite (167 passing)
- Shared UI suite (14 passing)
- Desktop suite (4 passing)
- Web typecheck
- Desktop `cargo check`
- Desktop Rust media-key parser test (1 passing)
- Root ESLint
- Production web build (97 PWA precache entries)
- Desktop package build
- Rust formatting check

Known limits: live browser and physical media-key QA were not completed.
Computer Use stopped because it could not verify the active Brave URL as
allowed. The shortcut routing and event mapping are covered by behavioral
tests, and the Tauri plugin compiles. No commit, push, tag, publication, or
deployment was performed.

## Profile logout and build metadata

The Settings logout control now sits at the bottom-right of the Profile page.
Its confirmation dialog and session-clearing behavior are unchanged: confirming
revokes the current session when possible, clears local session and offline
data, retains the selected server, and returns to sign-in with the Profile route
as the return destination.

The fixed Settings sidebar footer now shows the `@peridot/web` package version
and the current environment. Version `0.1.0` comes from `apps/web/package.json`;
the environment uses `PERIDOT_ENVIRONMENT` when set, otherwise `production` or
`development` from `NODE_ENV`. The metadata uses `text-xs` and a 60%-opacity
muted theme token to stay visually secondary.

Checks run:

- Focused Settings tests (13 passing)
- Full web suite (159 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Live development response at `/settings/account` (HTTP 200, with runtime
  config reporting version `0.1.0` and environment `development`)
- Production web build (96 PWA precache entries, with generated runtime config
  reporting version `0.1.0` and environment `production`)
- `git diff --check`

Known limits: a browser visual pass was not completed. Unrelated concurrent
album/offline edits were present and preserved. No commit, push, tag,
publication, or deployment was performed.

## Whole-album offline saving

Album detail headers expose the icon-only whole-album offline action in the
header card's top-right corner. Album cards no longer duplicate that button;
their navigation, playback, likes, and context menus are unchanged. The album
context menu provides the matching text action. Activating the control loads
every paginated album track, saves each available track that is not already
cached, and updates the shared saved-track manifest. The action shows
determinate or indeterminate aggregate progress while it works. Once the whole
album is saved, the same control removes all of its offline copies.

Individual track and whole-album saves no longer emit success toasts. The icon
and progress state provide completion feedback, while failures still produce
the existing error reports.

Checks run:

- Focused album/context/offline tests (23 passing)
- Full web suite (159 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (96 PWA precache entries)

Known limits: browser visual QA was not run. Existing uncommitted Settings work
was preserved. No commit, push, tag, publication, or deployment was performed.

## Separate offline IndexedDB databases

Offline catalog snapshots and saved-track manifests now use separate IndexedDB
databases. Both previously called `idb-keyval.createStore` with the same
database name, allowing the first store to create the database while the second
handle later failed with `One of the specified object stores was not found`.

The catalog database is `peridot-web-offline-catalog-v1`; the saved-track
manifest database is `peridot-web-offline-tracks-v1`. Per owner direction,
legacy offline IndexedDB data is not migrated. The existing Cache Storage media
cache remains unchanged and can be repopulated after saving tracks again.

Checks run:

- Focused offline tests (16 passing, including separate database regression)
- Full web suite (156 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (94 PWA precache entries)

Known limits: the browser error was not reproduced against the live IndexedDB
because computer-use browser access was unavailable. Static regression coverage
confirms the two stores no longer share a database. Existing uncommitted work
was preserved. No commit, push, tag, publication, or deployment was performed.

## Offline download progress and quiet removal

Saving an offline track now streams the audio response through a byte counter
and shows the shared determinate `ProgressCircle` in the track action while the
download is active. When the server does not expose a usable content length, the
same progress control uses its indeterminate state. Progress is shared through
Nuxt state so the track action remains stable across component instances.

Removing an offline copy no longer emits a success toast. Removal failures still
report through the existing offline failure toast and localized message.

Checks run:

- Focused offline tests (15 passing, including determinate and indeterminate
  progress plus removal-toast regressions)
- Full web suite (155 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (94 PWA precache entries)

Known limits: live authenticated browser download timing was not exercised
because the computer-use browser access host was unavailable. The progress flow
and Cache Storage payload are covered with streamed `Response` tests. Existing
uncommitted work was preserved. No commit, push, tag, publication, or deployment
was performed.

## Offline player availability state

Saved offline tracks now use one shared Nuxt state value across the fixed player,
track lists, queue drawer, quick picks, album cards, and artist controls.
Previously, each `useOfflineTracks()` caller held a separate local snapshot, so
the player could remain disabled after another component successfully saved a
track. The player composable now owns `currentTrackPlayable` and evaluates it
with the shared saved-track ID set, using the same offline-aware availability
rule as the other playback surfaces.

Checks run:

- Focused offline tests (12 passing, including shared player availability)
- Full web suite (152 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (93 PWA precache entries)

Known limits: live authenticated browser playback was not exercised because
the computer-use browser access host was unavailable. Existing uncommitted work
was preserved. No commit, push, tag, publication, or deployment was performed.

## Offline save proxy snapshot

Saving a track for offline playback now snapshots its metadata as plain data
before writing the manifest to IndexedDB. TanStack Query exposes track responses
as deeply reactive Vue proxies, which caused IndexedDB's structured clone to
throw `DataCloneError` after the audio download completed. The snapshot keeps
the existing track contract while making the manifest storage-compatible. If
manifest persistence still fails, the newly cached audio is removed so a failed
save does not leave an unreachable media cache entry.

Checks run:

- Focused offline tests (11 passing, including a reactive `DataCloneError`
  regression)
- Full web suite (151 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (93 PWA precache entries)

Known limits: the save button was not exercised in an authenticated browser
because the computer-use browser access host was unavailable. The regression
reproduces the proxy failure and verifies that the persisted snapshot is
structured-cloneable. Existing uncommitted work was preserved. No commit, push,
tag, publication, or deployment was performed.

## Offline sidebar brand mark

The sidebar logo is now embedded in the web application bundle instead of being
requested as a separate hashed image. Offline mode therefore does not depend on
that image receiving its own successful service-worker cache lookup. The logo
asset, sizing, semantic link, and app name are unchanged.

Checks run:

- `pnpm --filter @peridot/web exec node --test
test/settings-page.test.ts` (13 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build` (93 PWA precache entries; sidebar PNG no
  longer emitted as a separate asset)
- Prettier checks for the changed layout, test, and documentation files
- `git diff --check`

Known limits: browser-level visual verification was blocked because Computer Use
could not verify the local browser URL. The production build and regression
review the asset boundary rather than claiming a live offline render.

No commit, push, tag, publication, or deployment was performed.

## Development contracts build

The root `pnpm dev` command now rebuilds `@peridot/contracts` before starting the
web and server development processes. This fixes the stale ignored `dist`
artifact that omitted the runtime export
`TASK_ACTIVE_METADATA_PROVIDER_DETAIL_KEY` and made Nuxt return HTTP 500.

Checks run:

- `pnpm --filter @peridot/contracts build`
- Direct runtime import from `@peridot/contracts` returned
  `metadata.activeProvider`
- `pnpm --filter @peridot/web exec node --test test/task-progress.test.ts`
  (9 passing)
- `pnpm --filter @peridot/contracts typecheck`
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/server test` (101 passing)
- `pnpm --filter @peridot/web build`
- Root `pnpm dev` startup, followed by HTTP 200 responses from `/` and
  `/settings/tasks` and an `ok` response from `/api/health`
- Prettier checks for changed files and `git diff --check`

Generated `dist` files remain ignored. Changes to contracts made while `pnpm
dev` is already running still require rebuilding the package or restarting the
development command. These changes remain uncommitted.

## Tauri desktop prototype

Added a runnable Tauri 2 desktop application in `apps/desktop`. The shell embeds
the statically generated Nuxt client, uses Peridot branding and icons, opens a
sized native window, and exposes only the Tauri core capability. Development
starts the existing web and Fastify stack through the root `pnpm dev` workflow;
production runs `nuxt generate` before embedding the client.

The server defaults now accept Tauri's HTTP and custom-scheme webview origins for
both CORS and realtime validation. The packaged client was exercised against an
isolated local server: manual server selection succeeded and advanced to the
first-administrator screen. The documented `pnpm desktop:dev` path also launched
the native window with discovered local server access.

Checks run:

- `pnpm --filter @peridot/desktop test` (2 passing)
- `pnpm --filter @peridot/desktop typecheck` (`cargo check`)
- `pnpm --filter @peridot/web test` (145 passing)
- `pnpm --filter @peridot/server test` (101 passing, including Tauri CORS)
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm db:validate`
- `pnpm build`
- `pnpm desktop:build`
- Production executable launch and manual onboarding API handshake
- `pnpm desktop:dev` launch with the development web/API stack

Known limits: embedded network discovery is unavailable because that endpoint
belongs to the Nuxt server, so packaged-server discovery currently requires
manual address entry. Fastify is not bundled as a sidecar yet. The webview cookie
continues to hold the session instead of native secure credential storage.
Installers, signing, publishing, and automatic updates are not implemented.
Windows release verification was performed on this machine; macOS and Linux
webview behavior has not been tested.

This work remains uncommitted alongside existing unrelated changes. No commit,
push, tag, publication, deployment, or installer was produced.

## Release-first album identity

Albums now group by canonical release identity instead of each track's artist
combination. Provider release IDs take precedence; embedded album artists plus
title are next; source folder plus title is the fallback. An unmatched track in
a folder/title group with exactly one provider release joins that release, while
ambiguous folders remain separate.

MusicBrainz and Discogs release artists are stored as album artist overlays.
Album cards use those release artists, while every track retains its own
performer credits and artist links. Track responses now include `albumId`; album
navigation, active playback state, offline collection playback, Quick picks,
and album likes use that canonical ID. Search recents persist recent album IDs.

The Prisma contract and generated artifacts include the new track, catalog
projection, and album-like fields. The development database was intentionally
reset, so accounts, sources, provider configuration, catalog data, likes, and
queues must be recreated.

Checks run:

- `pnpm test` (101 server, 145 web, 13 UI, and 2 desktop tests passing)
- `pnpm typecheck`
- `pnpm db:reset`; after local state was recreated and rescanned, a direct
  catalog check showed one `Random Access Memories` album containing all 13
  scanned tracks with `Daft Punk` as the album artist
- `pnpm db:validate`
- `pnpm build` (PWA precached 92 entries; existing non-fatal Rolldown
  `PLUGIN_TIMINGS` warning)
- Targeted ESLint and Prettier checks for every changed source, test, and
  documentation file
- `git diff --check`

Repository-wide lint and formatting now ignore Tauri's generated schema,
capability, and target artifacts; both checks pass without exclusions at the
command line. Authenticated browser visual QA and a fresh live-provider match
were not run; the rebuilt local projection currently uses embedded album-artist
tags for the reported album.

No commit, push, tag, publication, or deployment was performed.

## Neutral offline icon and reconnection toast

The topbar connection warning now uses bundled `ooui:network-off`, rendered in
the standard foreground color with a neutral tooltip. The existing pulse and
accessible lost-connection explanation remain. When an authenticated session
transitions from lost to connected, the shared toast region announces
`Back online`; initial connections and onboarding discovery do not show it.

Checks run:

- `pnpm --filter @peridot/web test` (145 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for all changed web files
- `pnpm --filter @peridot/web build` (92 PWA precache entries; existing
  non-fatal Rolldown `PLUGIN_TIMINGS` warning)
- `git diff --check`

Known limits: browser visual QA was not run. The source regressions cover the
exact bundled icon, absence of destructive color, lost-to-connected transition,
authenticated-scope guard, and reconnection toast copy. Existing uncommitted
work was preserved. No commit, push, tag, publication, or deployment was
performed.

Next: visually confirm the topbar warning and recovered toast by interrupting
and restoring the connected server.

## Empty-player subtitle

The persistent player's no-track subtitle now reads `Select a track to get
started` instead of prompting the user to scan the library. A locale regression
assertion covers the exact copy.

Checks run:

- `pnpm --filter @peridot/web exec node --test test/i18n.test.ts` (5 passing)
- Targeted ESLint and Prettier checks for the locale and test files
- `git diff --check` for the changed app files

The full web suite reached 140 passing and 4 failing tests. The failures are in
pre-existing uncommitted changes to `library.test.ts` and
`search-recents.test.ts`; the i18n tests pass. No commit, push, tag,
publication, or deployment was performed.

## Quick-pick links and context menus

Quick-pick titles and artist credits are now links. A track title, including its
type icon, links to the track's anchored row on its album detail page; an album
quick pick links directly to its album detail page. Tracks without album
metadata fall back to their primary artist page. The artist line uses the shared
`TrackArtistLinks` component so every credited artist has an independent route.
Artwork remains the playback control.

Each quick-pick row now reuses the existing `TrackContextMenu` or
`AlbumContextMenu`, sharing playback, queue, like, download, navigation,
metadata, and collection actions with the rest of the app. The presentational
row was extracted to `QuickPickTileContent.vue` so the same linked content is
used under either context-menu wrapper.

Checks run:

- `pnpm --filter @peridot/web exec node --test test/quick-picks.test.ts`
  (3 passing)
- `pnpm --filter @peridot/web test` (144 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm --filter @peridot/web build` (92 PWA precache entries; existing
  non-fatal Rolldown `PLUGIN_TIMINGS` warning)
- `git diff --check`

Known limits: authenticated browser visual and pointer/keyboard context-menu QA
was not run. The source-level regression covers both menu wrappers, linked
track and album names, the icon/name link boundary, artist links, and artwork
playback. Server and schema checks were skipped because only web presentation
and interaction code changed. Existing uncommitted work was preserved. No
commit, push, tag, publication, or deployment was performed.

Next: confirm the track-name anchor and both quick-pick context menus in an
authenticated browser at desktop and mobile widths.

## Player loading ray

The fixed player now shows a primary-colored ray along its top edge while audio
is being prepared or buffered. It traverses left-to-right and then reverses,
continuing until the shared player `loading` state clears. Reduced-motion users
see a static primary line. The previous seek-slider pulse was removed while
keeping its taller hit target and `aria-busy` announcement.

Checks run:

- `pnpm --filter @peridot/web test` (144 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the player layout, regression test,
  and documentation
- `pnpm --filter @peridot/web build` (94 PWA precache entries)
- `git diff --check`

Known limits: an authenticated buffering track was not available for live
browser timing QA. The regression test covers the conditional ray, primary
color, reversible transform state, and reduced-motion fallback. Existing
uncommitted player metadata work was preserved. No commit, push, tag,
publication, or deployment was performed.

## Player metadata switches without an unresolved frame

Playback now passes already-loaded track objects into the player for track
rows, queue rows, Quick picks, and whole-album/artist collections. The player
seeds those details before it changes the active queue ID, so the title,
credits, artwork, and duration switch directly to the selected track instead of
waiting for a second queue-detail resolution. Collection loaders now return
their track responses rather than discarding them after extracting IDs.

The active-track selector also no longer falls back to the first resolved queue
row when a different active ID is still pending. That prevents another track's
metadata from being displayed as a temporary substitute.

Checks run:

- `pnpm --filter @peridot/web test` (144 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for all changed app and test files
- `pnpm --filter @peridot/web build` (94 PWA precache entries; existing
  non-fatal Rolldown `PLUGIN_TIMINGS` warning)
- `git diff --check`

Known limits: browser visual/timing QA was not run because no authenticated
browser session was available. Server and schema checks were skipped because
only browser playback and presentation state changed. Repository state changed
concurrently: the main playback changes were committed as `e1ab80c` and a
targeted lint correction followed in `f907533`, with both present on
`origin/dev`. This agent did not create, push, tag, publish, or deploy a commit.
The active-track selector extraction and these documentation updates remain
uncommitted; unrelated work was preserved.

## Cache-first query presentation

Cached TanStack data now renders immediately instead of being hidden by
background refresh activity or a failed refresh. Shared query presentation
helpers distinguish blocking initial loading from a refresh with data, and
suppress fatal query errors while cached data exists.

Album and artist detail pages derive their loading state from the cached match
query and the resolved page entity. They no longer set a manual loading flag on
mount or force the match query to refetch. Cached tracks start loading without
forcing another request. Track and album-list failures are shown within their
own sections, so a secondary failure does not hide an otherwise usable detail
header. Administrator list loading follows the same data-first rule.

Checks run:

- `pnpm --filter @peridot/web test` (142 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted Prettier and ESLint checks for the changed query, detail-page, and
  regression-test files
- `pnpm --filter @peridot/web build` (PWA precached 94 entries)
- `git diff --check`

Known limits: the exact away-and-back interaction was not exercised in a live
browser during this run. The runtime regression covers TanStack's
data-plus-error state and the page tests guard against forced mount loading.
Cold offline restoration may briefly show loading until IndexedDB resolves.
Server, schema, and non-web package checks were skipped because this change is
limited to client query presentation and detail-page state. Existing
uncommitted work remains preserved. No commit, push, tag, publication, or
deployment was performed.

Next: manually revisit an album and artist from another page while the server is
online, then repeat with the server stopped after those pages have been cached.

## Cover play controls use the pointer cursor

The full-cover play controls in the shared track table and both the current and
upcoming queue artwork now use the standard `cursor-pointer` utility. This
matches the existing album-card play control, including tracks shown on album
detail pages.

Checks run:

- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the changed components and tests
- `git diff --check`

Browser visual QA was not run for this presentation-only change. Existing
uncommitted work remains preserved. No commit, push, tag, publication, or
deployment was performed.

## Vite Lucide optimizer resolution

Nuxt's explicit Vite pre-bundle list includes `@lucide/vue` through the shared
spinner entry. pnpm's strict workspace layout did not make that package
resolvable from `apps/web`, producing the `NUXT_B7002` warning during dev
startup. The web workspace now declares the same `@lucide/vue` version as a
development dependency, keeping runtime ownership in `@peridot/ui` while making
the optimizer entry resolvable. A dev-config regression test checks that
declaration.

Checks run:

- `pnpm install`
- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks
- `pnpm --filter @peridot/web build` (94 PWA precache entries; existing
  non-fatal Rolldown `PLUGIN_TIMINGS` warning)
- Isolated Nuxt dev startup on port 3011 (ready without `NUXT_B7002`)
- HTTP smoke test for `/` (200)
- `git diff --check`

No commit, push, tag, publication, or deployment was performed. Existing
uncommitted work remains preserved.

## PWA manifest dev-server fix

The browser's `Manifest: Line: 1, column: 1, Syntax error` came from the Nuxt
development server returning the SPA HTML document for
`/manifest.webmanifest`. `@vite-pwa/nuxt` does not serve generated PWA assets in
development unless `devOptions.enabled` is true. The Nuxt configuration now
enables that development mode, and the offline-SPA regression test requires it.

Checks run:

- Dev-server HTTP check: `GET /manifest.webmanifest` returned 200 with
  `application/manifest+json`; JSON parsed with the Peridot name and three icons
- Dev-server HTTP check: `GET /dev-sw.js?dev-sw` returned 200 with JavaScript
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (PWA precached 94 entries)
- Production Nitro smoke test: root and manifest returned 200; manifest JSON
  parsed and the root HTML contained the manifest link

Known limits: browser DevTools was not manually inspected after the fix; the
equivalent manifest and service-worker requests were validated over HTTP.
Existing uncommitted offline, catalog, localization, and account work remains
preserved. This fix and its documentation are also uncommitted. No commit,
push, tag, publication, or deployment was performed.

Next: reload `http://127.0.0.1:3000/` with a fresh development server and
confirm the manifest syntax message is absent from the browser console.

## Native track action tooltips

The cloud save/remove control and favorite control in each shared track row now
use native browser `title` tooltips. Their text follows the current localized
action, so it changes between save/remove and like/unlike states alongside the
existing accessible label. The shared favorite button derives both labels from
one computed value. No custom styling or tooltip runtime was added.

Checks run:

- Focused likes UI and offline SPA tests (7 passing)
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (PWA precached 94 entries)

Known limits: browser-native tooltip placement and timing remain controlled by
the browser, and visual hover QA was not run. Existing uncommitted work remains
preserved. No commit, push, tag, publication, or deployment was performed.

## Player progress-bar loading effect

The persistent player's playback slider now pulses while a track is being
prepared or the native audio element is buffering. The slider exposes
`aria-busy` during the same period, uses the shared primary progress styling,
and applies the pulse with `motion-safe:animate-pulse` so reduced-motion users
receive a static loading state. Native `waiting` and `stalled` events start the
effect, while `playing` clears it, covering both initial preparation and stalls
later in a track.

Checks run:

- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the player composable, layout, and
  regression test
- `pnpm --filter @peridot/web build` (PWA precached 94 entries)
- `git diff --check` for the changed files

Known limits: visual browser QA was not run against a live buffering track. The
existing uncommitted offline, catalog, localization, and account work remains
preserved. No commit, push, tag, publication, or deployment was performed.

## Profile email field removed

Settings → Profile now contains only the editable display-name form. The
read-only email field and its now-unused helper copy were removed because the
signed-in user's email is immutable through Profile. Email remains visible on
each account row and in the administrator edit dialog under
Settings → Admin → User Management. Regression coverage asserts the profile
field is absent while User Management continues to render `account.email`.

Checks run:

- Focused settings tests (13 passing)
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build

Server, schema, and browser visual checks were skipped because this change only
removes a client-side form field and its unused locale copy.

## Offline-compatible SPA and TanStack Query cache

The web application now runs in Nuxt SPA mode while retaining Nitro for the
application document and local server discovery. `@vite-pwa/nuxt` generates an
installable manifest and service worker that precaches the SPA root shell, all
client chunks, fonts, icons, and the navigation fallback. Signed cover and artist
image routes use a non-expiring browser CacheFirst cache; API JSON is not routed
through Workbox.

Authenticated read state now uses TanStack Vue Query. The official per-query
IndexedDB persister stores visited data indefinitely with a versioned buster,
query keys are scoped by server and user, and realtime catalog events invalidate
the matching catalog query prefix. Catalog tracks, albums, artists, detail
lookups, likes, quick picks, queue, tasks, administrator lists, and server logs
were migrated. Discovery, health, filesystem browsing, and metadata-candidate
searches remain ephemeral. Likes and task creation use Query mutations; task
realtime updates and queue snapshots update the persistent cache explicitly.

Each shared track row has a Basil cloud-download/check action beside Favorite.
Saving requests persistent browser storage, fetches the complete authenticated
audio and available artwork, and stores them under a server/user/track key. The
player falls back to that cached blob only for a typed network failure and
revokes object URLs on track changes and teardown. Album and artist play controls
use the saved-track manifest when the server is unavailable. Logout, disconnect,
session invalidation, or identity changes clear persisted queries and offline
audio/artwork. Queue edits remain local offline and the latest snapshot is
retried after server reachability returns; other mutations are disabled offline.

Checks run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (141 web, 98 server, and 13 UI tests passing)
- `pnpm build` (5 successful tasks; PWA precached 94 entries and emitted `sw.js`
  plus Workbox)
- Production Nitro smoke test: root and deep `/albums` returned 200; manifest,
  service worker, and discovery returned 200; the root HTML contained the manifest
  link and client mount; the service worker contained the root precache and
  artwork route
- `git diff --check`

Known limits: offline catalog coverage is limited to pages previously visited
online, and offline audio requires the explicit row action. Saved media remains
subject to browser quota and eviction. The browser automation host was
unavailable, so service-worker activation, an offline browser reload, and real
cached-audio playback were not exercised end to end. Queue synchronization is
the only offline write retained; likes, metadata, scans, and administrator
changes require connectivity. All changes remain uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

Next: in a supported browser, load library and detail pages online, save a track,
activate the service worker, stop the Peridot server, and verify deep-link reload,
search over visited terms, artwork, seek/next playback, queue reconnection, and
private-cache clearing on logout.

## Development server startup during catalog backfills

`npm run dev` now starts Fastify immediately even when the local catalog needs a
projection rebuild. The previous startup scheduled the backfill inside
`buildApp()`; SQLite work continuously refilled Node's microtask queues, delaying
`app.listen()` and making the server appear not to start. The backfill now starts
from Fastify's `onListen` hook and yields to the event loop after each reindexed
track. Pending scheduled work is cancelled on close, while an already running
backfill is still awaited.

Added a catalog regression test that verifies pending macrotask work runs before
the projection backfill completes. Verification passed:

- `pnpm --filter @peridot/server test` (98 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server build`
- Targeted ESLint and Prettier checks for the changed server files and test
- `npm run dev`; web returned 200 on `127.0.0.1:3000` and
  `GET /api/health` returned 200 on `127.0.0.1:17430` while the existing
  `apps/server/peridot.db` projection backfill was active
- `git diff --check`

All changes remain uncommitted on `dev` alongside the existing artist-metadata
work. No commit, push, tag, publication, or deployment was performed. The local
database's full 848-track projection rebuild should be allowed to finish before
stopping the development server; an interrupted rebuild resumes on the next
start.

## Artist metadata profiles

Artist pages now support automatic and manual provider-backed profiles with a
canonical display name and a locally cached portrait. The file-tag name remains
the stable local artist ID for routes, links, and likes. The catalog projection
stores a separate display name, includes both names in search terms, and returns
signed artist-image URLs.

`metadata_fetch` now processes artists after tracks. MusicBrainz can supply
canonical identity; Discogs supplies portraits when configured. The first exact
provider match supplies the name, and provider traversal continues until an
exact Discogs candidate supplies an image. Artist image downloads accept only
bounded HTTPS JPEG, PNG, or WebP responses from Discogs hosts and are
content-addressed in SQLite. Signed-in members can search merged artist
candidates, apply a manual match, view its source, or restore local metadata from
artist cards, detail headers, and collection context menus. Reset metadata now
clears track and artist overrides and removes cached portraits.

Checks run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (137 web, 97 server, and 13 UI tests passing)
- `pnpm db:validate`
- `pnpm build`
- `pnpm db:update` against `apps/server/peridot.db`; Prisma reports no pending
  migrations
- `git diff --check`

Known limits: portraits require the existing Discogs provider, so
MusicBrainz-only installations receive canonical names with placeholders.
Automatic matching performs provider lookups per distinct artist and can lengthen
large background metadata tasks. Live provider responses and browser
visual/pointer QA were not exercised. Existing uncommitted playback, catalog,
and UI changes were preserved alongside this work. No commit, push, tag,
publication, or deployment was performed.

Next: visually verify portrait and alternate-name layouts at desktop and mobile
widths, then run a real MusicBrainz plus Discogs matching pass against a curated
library. The prior playback-regression note below predates this completed artist
work.

## Playback cover-loading regression

Starting a track could make playback and the player feel unresponsive because
queue hydration replaced every resolved queue item, and the shared track table
kept reconciling the complete 100-row catalog page. Cover URLs were also issued
per track with a fresh token, so tracks sharing one stored album image bypassed
the browser cache and requested the same bitmap repeatedly.

Queue hydration now resolves only missing track IDs and preserves existing
track objects during ordinary queue changes; catalog revisions still trigger a
full refresh. The shared track table keeps main-frame page-flow scrolling but
initially mounts 30 rows and reveals 30-row batches near the end. Cover URLs now
use a canonical `/api/covers/:coverId` route, and the server reuses signed cover
tokens during their validity window. Tracks sharing deduplicated artwork now
share the same browser-cache entry.

Checks run:

- `pnpm --filter @peridot/web test` (137 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Targeted server cover/token tests (passing)
- Targeted ESLint and Prettier checks for changed files
- `pnpm --filter @peridot/server test` (87 passing, 4 failing in pre-existing
  uncommitted metadata/source work)
- `git diff --check`

Known limits: server typecheck is currently blocked by pre-existing uncommitted
artist-metadata errors in `metadata-enrichment.ts` and `catalog.ts`. The
supported server suite's four failures are also outside this fix: three
metadata cases and one source-management case. Local server startup is blocked
until the concurrent schema work is applied because the development database
does not yet contain `CatalogArtist.displayName`. Browser visual and network QA
could not run because the computer-use host rejected the local page URL. All
work remains uncommitted on `dev` alongside the existing artist-metadata work;
no commit, push, tag, publication, or deployment was performed. Next: after the
concurrent metadata work is resolved and its schema is applied, exercise play,
queue reorder, and queue open/close with browser network tools and confirm one
request per distinct cover.

## Player background crossfade restored

The persistent player's decorative blurred cover now waits 150 ms and directly
crossfades to a different resolved cover over three seconds. The fade wraps only
the decorative background; the visible square artwork and track metadata remain
immediate, so no foreground element lingers after a track change. Reduced motion
continues to disable the transition. The transition is absent when consecutive
tracks share the same cover URL, and the existing mounted decorative layer still
allows the background to fade out when artwork disappears or fails.

The player regression test now requires the background transition, rejects an
`out-in` mode that would create an empty frame, and verifies that only one player
cover layer uses the transition. Durable behavior is recorded in
`docs/DECISIONS.md`. Browser visual QA remains pending. All changes remain
uncommitted on `dev` with the existing localization, catalog, realtime, account,
and offline work preserved; no commit, push, tag, publication, or deployment was
performed.

Checks run:

- Focused player regression test
- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the player and tests
- `pnpm --filter @peridot/web build`
- `git diff --check`

Server tests and schema validation were skipped because this change only
affects web player presentation. Next: switch between tracks with distinct
artwork and verify the foreground cover changes immediately while the blurred
background crossfades, then repeat with reduced motion enabled.

## Main-frame track-list scrolling

Restored page-flow scrolling for the shared track table. Loaded track pages now
render in the main content region without a table-level maximum height or
independent vertical scrollbar. The load-more intersection sentinel and visible
button still request the next bounded server page.

The library regression test now rejects virtualization container props and
table-level `overflow`/maximum-height utilities, and verifies that
`#main-content` remains the vertical scroll owner. This was a correction to the
earlier virtual-list implementation, which violated the recorded decision that
track tables must not create a second scrollbar beside the main screen.

Checks run:

- `pnpm --filter @peridot/web test`
- Web typecheck
- Targeted ESLint and Prettier checks for the component and tests
- Production web build
- `git diff --check`

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev` with the existing localization and catalog work; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm one full-page
scrollbar at desktop and mobile widths and verify automatic and button-based
loading of the next track page.

## Per-item task progress

Each library source row now shows the shared `ProgressCircle` while an active
task belongs to that source. Running work supplies the determinate progress
value; queued work renders the indeterminate ring. If more than one active task
belongs to a source, the running task takes precedence, and other sources'
tasks do not add a spinner to the row. The indicator uses the source's localized
accessible label and existing semantic theme and standard Tailwind sizing.

Metadata provider rows use the same progress ring while that provider is being
queried. Metadata matching adds a bounded active-provider ID to task progress
before each provider request and clears it when the request finishes. The page
matches that ID to only the affected provider row, while the general Tasks view
keeps the technical detail hidden. This avoids implying that every enabled
provider is active during a fallback sequence.

Behavioral coverage asserts source-specific active-task selection, running-over-
queued priority, metadata-provider attribution before and after a blocked
provider request, and the settings progress bindings.

Checks run:

- `pnpm --filter @peridot/server test` (90 passing)
- `pnpm --filter @peridot/web test` (136 passing)
- `pnpm --filter @peridot/contracts build`
- Targeted ESLint and Prettier checks for the changed TypeScript, Vue, locale,
  and test files
- `pnpm typecheck`
- `pnpm build` (completed with the existing non-fatal Rolldown
  `PLUGIN_TIMINGS` warning)

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev` alongside the existing localization, catalog, realtime, and account work;
no commit, push, tag, publication, or deployment was performed. Next: open
Settings → Admin → Sources and Metadata while scans and provider fallbacks are
active, then verify determinate progress, the queued source state, provider
handoff, and reduced-motion behavior at desktop and mobile widths.

## Smooth progress-circle value transitions

The shared `ProgressCircle` now applies its 300 ms motion-safe transition to the
determinate indicator arc. Previously the transition utility was on the parent
SVG, which rotates continuously but does not animate its child's
`stroke-dashoffset`, so task-progress updates changed abruptly. The visual arc
now renders at zero first, applies the current value on the next animation frame
after mount, and resets to zero whenever progress becomes indeterminate. A newly
shown task spinner therefore fills from empty instead of appearing at its
current percentage. The accessible and displayed percentage values remain
immediate, while reduced motion disables both the value transition and rotation.

Focused shared UI coverage asserts that the transition and reduced-motion
utilities render on the progress indicator rather than its parent, and that the
first server-rendered determinate arc remains at zero while accessibility
exposes the actual value. This change preserves the existing component API and
all uncommitted localization, catalog, realtime, and account work.

Checks run:

- `pnpm --filter @peridot/ui test` (13 passing)
- Focused Prettier and ESLint checks for the component and its test
- `pnpm typecheck`
- `pnpm build` (passed with the existing non-fatal Rolldown
  `PLUGIN_TIMINGS` warning)
- `git diff --check`

Known limits: browser visual QA was not run; the continuous task-progress
indicator should receive a final live visual check. All changes remain
uncommitted on `dev`; no commit, push, tag, publication, or deployment was
performed. Next: verify the topbar task ring while live progress values update
with normal and reduced-motion preferences.

## en-US localization across the runtime

Added Nuxt I18n with a fixed `en-US` runtime locale, unprefixed routes, disabled
browser locale detection, explicit `<html lang="en-US">`, and no language
selector or persisted preference. All web runtime copy, metadata, page titles,
loading/empty/error states, notifications, and accessibility labels now resolve
through `apps/web/i18n/locales/en-US.json`. Dates use named Vue I18n formats,
and plural counts use locale resources.

API errors, task titles/details/failures, provider definitions, provider details,
and realtime errors now return structured `MessageDescriptor` values. The
pre-release contracts no longer include duplicate English fallback properties.
Task title and failure descriptors are stored in nullable task columns; old
development task shapes are intentionally unsupported and require a local
database update or reset. Shared UI spinners and progress indicators now require
caller-supplied accessible labels instead of embedding English defaults.

Behavioral coverage verifies the fixed locale/configuration, interpolation,
plurals, all referenced message keys, date formats, task descriptor responses,
typed client errors, toast descriptors, and updated UI accessibility labels.

Checks run: `pnpm --filter @peridot/web test` (133 passing),
`pnpm --filter @peridot/server test` (88 passing),
`pnpm --filter @peridot/ui test` (13 passing),
`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm typecheck`, `pnpm test`,
`pnpm db:validate`, `pnpm build`, and `git diff --check`. The built web server
smoke-tested `/onboarding` with HTTP 200, `lang="en-US"`, localized page copy,
and no locale-prefixed links; `/` continued redirecting to
`/onboarding?redirect=/`. Development browser visual QA was not run.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed. Next: visually review en-US typography and wrapping
across desktop/mobile layouts, then add another locale resource when translation
content is available.

## Administrator user management

Administrators now have a `User Management` category under Settings → Admin.
The page lists local accounts with role and current-user indicators, supports
member or administrator creation, edits display name, email, password, and role,
and deletes accounts after confirmation. Each row shows the account's Gravatar
with the brand-logo fallback used by the topbar. The current account can edit
its own identity but cannot change its role or delete itself. New account
passwords and password resets require matching confirmation before the form can
submit.

The server exposes authenticated administrator-only `GET/POST /api/admin/users`
and `PUT/DELETE /api/admin/users/:id`. It validates unique normalized email and
display names, hashes new passwords, prevents removal of the final
administrator, revokes affected sessions and realtime connections on
authentication or role changes, and relies on the existing account relations to
remove user-owned state on deletion.

Behavioral coverage verifies administrator-only access, member and administrator
creation, identity and password edits, role promotion, session revocation, old
credential rejection, deletion, self-deletion prevention, and self-role
immutability. Verification passed: 88 server tests, 128 web tests, 13 shared UI
tests, full lint/format checks, full typecheck, Prisma schema validation, the
production build, and `git diff --check`. Browser visual QA was not run.

All changes remain uncommitted on `dev` alongside the pre-existing catalog and
realtime work. No commit, push, tag, publication, or deployment was performed.
Next: open Settings → Admin → User Management as an administrator and verify
member/administrator creation, edit/delete dialogs, and self-action restrictions
at desktop and mobile widths.

## Settings account tab renamed to Profile

The common Settings navigation now labels `/settings/account` as `Profile`. The
page heading and header-avatar accessible label use the same term, while the
existing route and profile API remain unchanged for bookmark and redirect
compatibility. Regression assertions require the visible Profile label and
reject the former Account navigation label.

Verification passed: the focused Settings tests (12 passing), all 124 web tests,
web typecheck, targeted ESLint, full formatting, the production web build, and
`git diff --check`. Server, schema, and browser visual checks were skipped
because this change only affects labels and existing client navigation.

## Email-only identity, editable display names, and password confirmation

Authentication now uses email as the sole login identifier. User records store
a required display name plus a normalized display-name value that enforces
case-insensitive uniqueness. Display names preserve capitalization, trim and
collapse whitespace, and must contain 2–80 Unicode code points. Existing users
sign in with normalized email and password, and signed-in users can update their
display name from Account settings while email remains read-only.

First-administrator creation now asks for the password twice. The form reports
an inline mismatch, blocks submission until both entries match, and sends only
the single confirmed password to the server. Sign-in continues to show only
email and password.

The new account contract changed the local SQLite schema. The authorized
development database was reset and recreated; all previous local accounts,
sessions, catalog data, queues, likes, sources, and settings were discarded. The
development server was restarted after the reset and now requires creation of a
new first administrator.

Behavioral coverage includes email-only sign-in, rejected display-name
authentication, email normalization, display-name boundaries and uniqueness,
profile edits, session continuity, administrator request shapes, Account
cookie updates, and password-confirmation visibility and mismatch blocking.
Verification passed: 86 server tests, 124 web tests, 13 shared UI tests, full
typecheck, lint, formatting, Prisma schema validation, the production build, and
`git diff --check`. Browser visual QA was attempted but Computer Use stopped
because it could not determine the active browser URL confidently enough to
continue safely.

All changes remain uncommitted on `dev` alongside the pre-existing catalog and
realtime work. No commit, push, tag, publication, or deployment was performed.
Next: open the onboarding flow with the empty database, create the first
administrator using matching passwords, sign out, verify email-only sign-in, and
edit the display name from Account settings.

## Plugins navigation moved under Admin

The Settings sidebar now places Plugins inside the administrator-only `Admin`
group, immediately before Tasks. Account, Library, and Playback remain the
common categories, so non-administrators no longer see a Plugins menu entry.
The `/settings/plugins` route and its page content are unchanged.

Regression assertions now require Plugins in the administrator category list,
exclude it from the common list, and keep its page on the Settings layout.
Verification passed: the focused settings tests (11 passing), all 121 web
tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server, API, storage, or schema contract changed. Browser visual QA
was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
verify in the browser that administrator sessions show Plugins inside Admin and
member sessions do not show the menu entry.

## Settings sidebar logout

The Settings sidebar now has a persistent Log out button at its bottom, outside
the scrollable category list. Activating it opens a confirmation dialog before
any credentials are changed. Confirming revokes the current session when
possible, clears the local session and user cookies, retains the selected
server, and opens onboarding in sign-in mode with the current Settings path
preserved as the return destination. The button shows a disabled `Logging out…`
state while the request is pending.

This remains separate from the administrator Server page's Disconnect action,
which also clears the selected server. Regression assertions cover the
confirmation gate, session revocation, local credential clearing, server-address
preservation, sign-in redirect parameters, and the fixed footer control.

Verification passed: focused settings/task/styling tests (19 passing), all 121
web tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server, API, storage, or schema contract changed. Browser visual QA
was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Administrator settings grouped under Server

The Settings sidebar now keeps Account, Library, Playback, and Plugins in the
common list and presents Tasks, Sources, Metadata, and Server in a separately
divided `Admin` group visible only to administrators. The former Administration
category is removed; its connected-server and server-log content now lives at
`/settings/server`. `/settings` redirects to Account so the shared settings entry
works for every signed-in role.

The topbar task spinner is now administrator-only, including in the fullscreen
Settings header. Non-administrators still receive the separate connection-loss
warning because it communicates server reachability rather than task activity.
Direct access to `/settings/tasks` now renders an access-required state and skips
task history/loading requests for non-administrators.

Regression assertions cover the admin-only group condition, Tasks placement,
separation styling, new route, removed Administration category, `/settings`
redirect, task-page access state, and task-spinner role gate. The existing server
settings access message and API authorization remain in place.

Verification passed: focused settings/task/realtime/notification/styling tests (25
passing), all 120 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server, API, storage, or schema contract
changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
verify at desktop and mobile widths that an administrator sees the separated
Admin group and a non-administrator sees only the common categories.

## Sortable grip cursors

Library sources, metadata providers, and upcoming queue items now show the
`grab` cursor over their grip controls and switch to `grabbing` while the grip
is pressed. This keeps the drag affordance visible when the pointer is directly
over the handle instead of only on the surrounding sortable row. The change uses
standard Tailwind cursor utilities and does not alter which part of each row is
draggable.

Regression assertions cover the grip cursor classes on all three sortable
surfaces. Verification passed: the focused settings and queue tests (12
passing), all 120 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. The build reported the existing
non-fatal Rolldown `PLUGIN_TIMINGS` warning. Server tests, schema validation, and
browser visual QA were skipped because no server, API, storage, or schema
contract changed.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm the cursor changes while hovering and dragging each grip at desktop and
mobile widths.

## Avatar reveals settings affordance

The topbar account avatar now shows a Basil settings cog when its link is
hovered or receives keyboard focus. The cog is an overlay on the existing avatar
link at `/settings/account`, so the header still has one settings destination
and the task-progress/connection indicator remains immediately before it. The
overlay uses semantic theme utilities, respects reduced-motion preferences, and
disappears while preserving the avatar when the link is not active.

The header regression now requires the cog and both hover/focus reveal states.
Verification passed: all 120 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. The build
reported the existing non-fatal Rolldown `PLUGIN_TIMINGS` warning. Server tests
and schema validation were skipped because no server, API, or storage contract
changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm the avatar-to-cog transition on pointer hover and keyboard focus at
desktop and mobile widths.

## Setup and session loss redirect to onboarding

Authenticated browser requests now treat both `401 unauthorized` and
`428 setup_required` as navigation conditions instead of page errors. A `401`
clears the stale session and user cookies and opens
`/onboarding?auth=login`, while `428 setup_required` opens
`/onboarding?auth=setup` with the original destination preserved. The setup
route automatically reconnects to the existing server address and advances to
the first-administrator account form, so “Create the first administrator
account before using Peridot” is not rendered as an alert.

Catalog, likes, quick-pick, player, album/artist, folder-search, metadata
context-menu, and administrator views suppress the typed redirect error from
their local alerts and toasts while navigation is pending. Invalid credentials
submitted on the existing sign-in form remain an inline error because that
request is not part of the authenticated-session redirect path.

Verification passed: the focused client and onboarding tests (15 passing), all
120 web tests, web typecheck, targeted ESLint and Prettier checks, the production
web build, and `git diff --check`. Server tests and schema validation were
skipped because no server, API, or storage contract changed. Browser visual QA
was not run. Next: start with an empty server or revoke an active session, then
confirm onboarding opens without an authentication alert, creates the first
administrator (or signs in), and returns to the original page.

Changes remain uncommitted on `dev` alongside the pre-existing catalog/realtime
work; no commit, push, tag, publication, or deployment was performed.

## Realtime events and paged catalog

The task and administration-log polls are replaced by one authenticated
`/api/realtime` WebSocket. `POST /api/realtime/ticket` issues a 30-second,
single-use ticket bound to the current session because browser sockets cannot
send the normal bearer header. Upgrades require an exact configured web origin.
Subscriptions cover task lifecycle, admin-only logs, and compact catalog
revision events. The hub keeps the latest 512 events for reconnects and sends
`resync.required` after a gap or slow-client overflow. Session revocation closes
matching sockets.

Task events carry complete safe `TaskResponse` values; progress is coalesced to
at most four updates per second and status transitions are immediate. Catalog
events contain only revision, source, reason, and changed count, with no track
rows. The web client uses bounded reconnect backoff, updates task state with
monotonic `updatedAt` ordering, subscribes administrator pages to logs on demand,
and falls back to HTTP task/catalog snapshots after resync.

Catalog APIs now use cursor pages instead of returning the complete collection.
`GET /api/tracks`, `/api/albums`, and `/api/artists` support bounded pages,
search/sort/filter options, and catalog revisions. `POST /api/tracks/resolve`
hydrates queue IDs in bounded batches, and quick picks now contain server-resolved
track or album summaries. The server maintains normalized track, album, artist,
membership, and search projections, updates them during scans and metadata
changes, and backfills existing databases idempotently. The shared track table
uses VueUse `useVirtualList` with an explicit load-more fallback; library,
album, artist, liked, search, quick-pick, and player queue views no longer rely
on a full-catalog `useLibraryTracks` cache.

The authorized development database reset was applied with `pnpm db:reset`.
Local accounts, sessions, catalog, queue, likes, sources, and settings were
discarded and the new contract/projection tables were created.

Verification passed:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test` — 85 server tests, 120 web tests, and 13 shared UI tests passed
- `pnpm db:validate`
- `pnpm build`
- `git diff --check`

The build emitted non-fatal Rolldown `PLUGIN_TIMINGS` performance warnings, and
Prisma emitted its existing outdated-agent-skills notice. Browser visual QA was
not run. Known limits are the intentional single-process/in-memory realtime
replay model, no durable event outbox, no live queue/like synchronization, and
no plugin-originated socket events. All changes remain uncommitted on `dev`;
no commit, push, tag, publication, or deployment was performed.

Next: start `pnpm dev`, recreate the local administrator after the reset, add a
music source, and verify desktop/mobile virtual scrolling, live task progress,
admin log streaming, reconnect/resync, and catalog refresh during and after a
large scan.

## Missing-cover player background fade

Selecting a track without cover art now fades the previous decorative player
background out over the existing three-second crossfade instead of removing it
abruptly. The decorative layer remains mounted while its child image is
conditional, allowing Vue's leave transition to run when the resolved cover URL
becomes empty. Foreground artwork still switches immediately to the semantic
music-note placeholder.

The player regression test now covers the mounted decorative layer and the
conditional image. The existing styling constraints are unchanged: the fix uses
only standard Tailwind utilities and semantic theme tokens.

Verification passed: all 117 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. Server tests,
schema validation, and browser visual QA were skipped because no server,
storage, or schema contract changed and the transition behavior is covered by
the player regression test.

## Lost authentication redirects to sign-in

Authenticated web API requests now report `401 unauthorized` responses through
one client-level handler. The handler clears the stale session and user cookies,
opens the existing onboarding account step directly with `auth=login`, and
preserves the current full path for the post-sign-in redirect. Concurrent
requests cannot begin multiple redirects, and incorrect credentials entered on
the sign-in form remain an inline error rather than a lost-session redirect.

Verification passed: the focused authentication/client and onboarding tests
(14 passing), all 117 web tests, web typecheck, targeted ESLint and Prettier
checks, the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server, API, or storage contract changed.
Browser visual QA was not run. Next: revoke or expire an active session in a
running app and confirm the account sign-in step opens without a server-selection
flash, then sign in and return to the original page.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed.

## Successful download toast removed

Completing a track download no longer adds a bottom-right success toast. The
browser download remains the confirmation, while failure and missing-connection
messages still use the app-level toast region to explain why no file was saved.
The successful-download toast helper and its call site are removed.

Verification passed: the focused player test, the full web test suite, web
typecheck, targeted ESLint and Prettier checks, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server, API, or storage contract changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm in a browser that a successful download produces no toast while a
failed request still explains the failure.

## Current cover background in the player

The fixed player now reuses the active track's resolved cover as a decorative
background clone. The clone covers the left two-thirds of the player on narrow
screens and the left half from the medium breakpoint, remains anchored to the
left edge, and uses a strong `blur-3xl` treatment with a scale-up to avoid
visible blur edges. A second layer-local card-token gradient fades its right
edge into the normal surface before the rest of the player begins, while a
broader card gradient preserves semantic contrast for track details and
transport controls.

The decorative cover clone waits 150 ms and then directly crossfades over three
seconds when its resolved URL changes. Both covers use the same ease-in-out
curve so their opacity remains balanced as outgoing and incoming blurred
artwork overlap. Tracks that share the same cover do not animate because the
image key does not change. The displayed title, artist, and controls update
immediately. Reduced-motion preferences disable the transition.

The player no longer renders a preparing-audio label while a new track starts.
The active track's artist list is shown immediately as soon as track metadata is
available. Playback failures still replace that secondary line with the existing
retryable error message.

The player's foreground artwork is larger at every responsive size: 64 px on
compact layouts and 80 px from the medium breakpoint. Its music-note fallback
uses a matching larger glyph while keeping the existing rounded artwork frame.

The layer is hidden from assistive technology, ignores pointer input, and uses
the same missing-or-failed-cover condition as the foreground artwork, so no
broken image is shown. No custom CSS, inline styles, hardcoded colors, or
arbitrary Tailwind values were introduced.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed. Verification passed: the focused player and styling
tests, all 116 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. The build reported non-fatal
Rolldown `PLUGIN_TIMINGS` performance warnings. Server tests and schema
validation were skipped because no server or storage code changed. Browser
visual QA was not run.

## Track lists show cover artwork with embedded playback

The shared track table now shows each track's cover artwork beside its title,
so the library, album detail, artist detail, liked songs, and search track
lists use the same presentation. The queue also shows artwork in its
now-playing card and every upcoming row. A reusable `TrackArtwork` component
resolves the server-relative cover URL and falls back to the semantic music-note
placeholder when artwork is missing or fails to load.

Playback controls now cover the full artwork like the Quick pick list: they
reveal on hover or keyboard focus with a 70% semantic background behind a
readable play icon. The shared table toggles the current track or starts the
selected list item, the now-playing queue cover toggles playback, and every
upcoming queue cover starts that track directly. The queue remove action is one
standard button size larger while retaining its close icon and existing
behavior.

Verification passed: all 116 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. The build
reported non-fatal Rolldown `PLUGIN_TIMINGS` performance warnings. Server tests
and schema validation were skipped because no server or storage code changed.
Browser visual and pointer QA was not run, so hover/focus reveal behavior,
embedded controls on touch layouts, and queue remove spacing still need review
at desktop and mobile widths.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm artwork and embedded controls across library, album, artist,
liked, search, and queue lists with both present and missing cover images.

## Album release year beside total duration

Album detail headers now show an available release year immediately before the
total duration, for example `1999 · 1:01:01`. The year is derived from an
explicit four-digit `year` entry in a track's provider metadata. Albums with no
year keep the existing track count and duration summary, and albums whose
matched tracks expose conflicting years omit the year rather than choosing an
edition arbitrarily.

Added behavioral coverage for matching, unanimous, conflicting, and invalid
provider years plus an album-page regression for the adjacent summary. Verified
the focused album/library tests (27 passing), all 115 web tests, web typecheck,
full-workspace lint and formatting, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server, API, or storage contract changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm the year/duration summary with a catalog containing a Discogs
year and at narrow widths.

## Playback continues after leaving Settings

Returning from the fullscreen Settings layout no longer pauses the active song.
The default layout had called `loadQueue()` whenever it remounted; leaving
Settings therefore created a fresh composable call site that restored the
browser snapshot, set `playing` to false, and paused the application-root audio
element. Queue initialization now stays with the application-root audio owner,
while layouts only observe and control the shared player state.

The regression test now rejects layout-level `loadQueue()` calls. Runtime
verification with a mocked audio element reproduced the original pause on the
return navigation and then confirmed the active element remained playing after
the fix. The headless-browser run used mocked API responses and a deterministic
audio element so it could assert play, pause, source removal, and control state
without depending on a local audio file.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, the web production build, and `git diff --check`. Server tests
and schema validation were skipped because no server or storage code changed.
Browser sound output was not exercised; the runtime check covered the player
lifecycle and navigation transitions. Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: confirm the same round trip
once with normal browser playback and real catalog audio.

## Album playback starts from the first track

Album card, album detail, and album quick-pick controls now start the complete
album from its first ordered track whenever their visible play state is
activated. If the album is already playing, the control remains a pause action.
The previous behavior could resume a paused middle track when an album was
already considered active.

Accessible labels now state that album playback starts from the first track.
Context-menu album playback retains its existing direct full-collection start.

Verification passed: the focused album and quick-pick tests, all 114 web tests,
web typecheck, targeted ESLint and Prettier checks, full-workspace `pnpm check`,
the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server or storage code changed. Browser
visual and audio interaction QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm that playing a paused album restarts on track one in the card,
detail header, and quick-pick controls, while the pause state still pauses.

## Connection-loss toast removed

The app-level server health monitor no longer creates or manages a connection
toast. Losing the configured server now changes only the shared connection state,
so the existing pulsing cloud-off warning and accessible reconnect explanation
remain in the topbar without a duplicate bottom-right notification. The
connection-specific toast ID, helpers, and unused description formatter were
removed. Other user-action toasts are unchanged.

Verification passed: all 114 web tests, the focused notification regression,
web typecheck, targeted ESLint and Prettier checks, the production web build,
and `git diff --check`. Server tests and schema validation were skipped because
no server or storage code changed. Live visual QA was not run; the remaining
check is to stop the server with the signed-in app open and confirm that the
topbar warning appears without a toast, then restart it and confirm the warning
clears.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Main-header settings shortcut removed

The redundant icon-only Settings link is removed from the main header. The
account avatar remains directly before where it was and opens
`/settings/account`, which provides access to the full Settings navigation. The
topbar regression now requires the avatar to be the sole settings destination
while retaining task progress immediately before it.

The decision log records this removal as superseding the earlier
settings-beside-avatar choice. Changes remain uncommitted on `dev` alongside the
pre-existing working-tree edits; no commit, push, tag, publication, or
deployment was performed.

Verification passed: the focused settings regression suite (10 tests), all 114
web tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server or storage code changed. Browser visual QA was not run.
Next: confirm the simplified header at desktop and mobile widths.

## ProgressCircle rotation for determinate values

The shared `ProgressCircle` now keeps its reduced-motion-safe rotation when a
numeric value is present. The numeric value still controls the determinate arc,
visible percentage, and accessible `aria-valuenow`/`aria-valuetext`; indeterminate
values retain their existing rotating arc. The shared UI regression suite now
asserts that determinate progress includes `motion-safe:animate-spin`.

Verification passed: all 13 shared UI tests, workspace typecheck, targeted
ESLint and Prettier checks, the production workspace build, and
`git diff --check`. Server tests and schema validation were skipped because
only the shared progress component, its test, and documentation changed.
Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm the rotating
determinate ring in the topbar and Tasks settings view with active work.

## Topbar connection-loss indicator

The topbar now replaces the task progress circle with a pulsing
destructive-color Basil cloud-off icon whenever the existing server health
monitor reports that the configured server is unreachable. Connection loss
takes precedence over queued or running task state so stale task progress does
not imply a live server. The icon has a focusable accessible label and a
tooltip explaining that Peridot will reconnect automatically. A later successful
health probe removes the icon and restores the task circle if work is active.

The health monitor's status and the topbar indicator now share one app-level
Nuxt state value, avoiding a second polling loop. The pulse uses the standard
`motion-safe:animate-pulse` utility; no custom CSS or new API contract was
introduced.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, full-workspace `pnpm check`, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server or storage code changed.
Live visual and keyboard QA was not run. Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm the pulse,
tooltip, and placement at desktop and mobile widths while the server is stopped,
then confirm the task circle returns after restart.

## Topbar task progress queue indicator

The main topbar now shows a task-aware progress circle while any task is running
or queued, replacing the static metadata-only placeholder. Its fill is the
equal-weighted average of the active queue: a running determinate task
contributes its completion percentage, each queued task contributes zero, a
zero-total running task counts as complete, and an indeterminate running task
makes the overall ring indeterminate. Queued-only work also renders the ring as
indeterminate instead of an empty zero-percent circle. The indicator is absent
whenever no active work exists.

Hovering or focusing the circle opens a Reka UI tooltip containing the running
task followed by queued tasks in FIFO creation order. Each row shows its title,
status, and available percentage or completed/total detail. The row list has a
bounded scrolling height for larger queues. The existing global task monitor
continues to provide 500 ms active polling; no API, storage, or schema changes
were introduced.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, full-workspace `pnpm check`, the production workspace build,
and `git diff --check`. Server tests and schema validation were skipped because
no server or storage code changed. Live pointer and keyboard visual QA was not
completed because Computer Use could not verify the existing Brave window URL
and stopped before interaction. The hover/focus presentation, long-list
scrolling, and desktop/mobile placement still need visual review.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
review the real task tooltip with an authenticated active queue and confirm its
desktop/mobile layout and keyboard focus treatment.

## Tasks settings and silent task monitoring

The task progress indicator now remains visible in the fullscreen Settings
header and links to `/settings/tasks`. The new Tasks settings view is available
to every signed-in user and separates running/queued work from terminal history.
Active rows use the shared task state and live progress. History is loaded from
`GET /api/tasks?status=terminal` in pages of 50 with a Load older tasks control,
and refreshes when an observed task transitions from active to terminal.

Task-specific progress, completion, and failure toasts were removed, along with
their formatter, manager hooks, and progress-toast rendering. Task polling still
runs every 500 ms while active and every five seconds while idle, remains silent
across transient failures, and still reloads the catalog after library or
metadata transitions. The Metadata refresh button is disabled and labeled
`Processing…` whenever any task is queued or running.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. Server tests
and schema validation were skipped because no server or storage code changed.
Live pointer and keyboard visual QA remains pending because Computer Use could
not verify the existing browser URL. The Tasks layout, long history pagination,
click-to-navigate behavior, and shared Settings-header indicator still need
visual review.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Queued task activity foundation

Replaced the combined `LibraryScan` record with a persistent task queue. Source
scans and metadata fetches are separate linked tasks with queued, running,
completed, failed, or interrupted states and determinate or indeterminate
progress. One FIFO worker executes tasks sequentially, accepts new work while
another task is active, and coalesces equivalent requests only while they are
still queued. Queued work resumes after restart; tasks that were running become
interrupted.

Authenticated clients can list active-first task history through
`GET /api/tasks` and read one task through `GET /api/tasks/:id`. Responses use
bounded safe source names and labeled details without source paths, credentials,
or arbitrary plugin payloads. Core kinds are `library_scan` and `metadata_fetch`;
the contract also validates future `plugin:<plugin-id>:<job-name>` kinds without
adding a plugin execution runtime. Terminal history is retained for 30 days,
capped at the newest 500 tasks.

The web client now polls the shared task list every 500 ms while work is active
and every five seconds while idle. Task progress and history are shown in the
topbar and Tasks settings view rather than toast notifications. The catalog
refreshes after library or metadata work. Sources can enqueue work while another
task is active, while Metadata refresh and Reset are blocked until active work
finishes. WebSocket transport remains deferred.

Verification passed: all 78 server tests, all 107 web tests, all 13 shared UI
tests, workspace typecheck, ESLint, Prisma contract emission and
`pnpm db:validate`, the production workspace build, `git diff --check`, and a
built-server health smoke test on loopback port 43101. The local database was
synchronized to storage hash
`ef2695cd1e8e734e1b52913f67e3ec61a956f8be5dcf97751c89b07220e31beb`;
the obsolete `LibraryScan` table and its scan history were dropped, while catalog,
account, source, queue, like, and provider tables were preserved.

Known limits: task execution is serialized within one server process; the task
queue does not provide cancellation, retry controls, or cross-process locking.
Browser visual QA was not run. Changes remain
uncommitted on `dev` alongside the pre-existing working-tree edits; no commit,
push, tag, publication, or deployment was performed. Next: use the task
progress/details contract for task-level controls.

## Sidebar quick pick uses decayed play history

The sidebar block below primary navigation is now an up-to-eight-item,
single-column `Quick pick` list. It mixes tracks and albums using
server-persisted, per-user playback events with continuous seven-day exponential
decay. Album scores aggregate the decayed scores of their available tracks.
Tracks use their album artwork, and each complete row is the play/pause control,
including its title and artist names, with a pointer cursor over the full
target. A small music or collection icon before the title identifies track versus
album. The visible order is frozen while the pointer or keyboard focus is inside
the list, then applies the latest order after all interactions end.

Successful browser audio starts create `POST /api/tracks/:id/plays` events.
Pause/resume, seeking, failed playback, restored paused sessions, and retries in
the same run do not double-count. `GET /api/quick-picks` returns up to eight ordered
track and album identities without exposing scores. The player refreshes the
ranking after each confirmed event. The former All music and Liked songs rows are
removed; both remain in primary navigation. Playlist quick picks remain deferred
until playlist records and playback exist.

Verification for the current eight-item, single-column, full-row interaction
passed: all 78 server tests, all 114 web tests, workspace typecheck, targeted
ESLint and Prettier, the production workspace build, and `git diff --check`.
The web coverage includes overlapping pointer and focus interactions retaining
the visible order until both end. Schema validation was skipped because no
database schema changed. Browser visual and pointer QA was not run, so the final
hover/focus treatment and single-column spacing still need review at desktop and
mobile widths. Playlist quick-pick entries remain unimplemented with playlists.
Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Shared ProgressCircle component

Added `ProgressCircle` under `@peridot/ui/components/ui/progress-circle`. A
finite `value` renders determinate progress, clamps out-of-range numbers to
`0–100`, and exposes accessible progressbar semantics. Omitted, null, or
non-finite values render a rotating quarter-arc spinner with reduced-motion
support. The component provides small through extra-large sizes, primary,
secondary, success, warning, and destructive semantic colors, opt-in percentage
text, and custom center content. Its numeric stroke width is configurable and
defaults to 6.

The package exports the component, `progressCircleVariants`, and its variant
type. Nuxt pre-bundles the new package path, the no-custom-styling guard covers
the component, and README plus the decision log document the value-driven API.
The topbar metadata badge now uses the indeterminate variant in place of
`PeridotSpinner`; other loading surfaces keep the branded spinner.

Verification passed: all 12 shared UI tests, all 104 web tests, all 67 server
tests, workspace typecheck, ESLint, targeted Prettier for all changed component
files, the production build, and `git diff --check`. The full `pnpm check`
Prettier phase still reports the pre-existing unrelated formatting issue in
`apps/web/app/layouts/default.vue`; that file was intentionally left untouched.
The shared UI package has no workspace typecheck task, so it was also checked
directly with `vue-tsc`: the new component is clean, while the existing
`PeridotSpinner` still lacks TypeScript declarations for its bundled SVG imports.
Browser visual QA was not run for the new topbar integration. Changes remain
uncommitted on `dev` alongside the existing
working-tree edits; no commit, push, tag, publication, or deployment was
performed. Next: visually verify the compact indeterminate badge and use the
determinate form in a screen with real numeric progress.

## Shared spinner renamed to PeridotSpinner

The shared branded loading component is now named and exported as
`PeridotSpinner` from the existing `@peridot/ui/components/ui/spinner` package
path. Its component file is `PeridotSpinner.vue`, and its data slot is
`peridot-spinner`. Every app loading surface, the onboarding discovery status,
toast progress, and the header metadata-status badge use the new name.

The same package also exports the classic shadcn-vue `Spinner`, built on
`@lucide/vue`'s `LoaderIcon` with the standard `size-4 animate-spin` treatment.
It has shared UI coverage but is intentionally unused in app pages and layouts
for now.

The main app header shows a compact `Fetching metadata` badge containing
`PeridotSpinner` before the icon-only Settings link and avatar. The sidebar footer
no longer links to Settings. The shared component and app regressions verify the
new name, data slot, header ordering, accessible labels, and player behavior.

Verification passed: all 7 shared UI tests, all 104 web tests, web typecheck,
targeted ESLint and Prettier, the production web build, and
`git diff --check`. Changes remain uncommitted on `dev` alongside the
pre-existing working-tree edits; no commit, push, tag, publication, or deployment
was performed.

## New local sources scan and metadata-match automatically

Adding a local folder source now creates the source and immediately queues a
source-scoped scan on the server. The source-creation response includes the scan,
and the Sources page adopts it into the shared scan tracker so progress and
completion notifications continue normally. Remote URL and integration sources
remain stored without scans until those source kinds become indexable.

Source scans already continue into metadata matching after file discovery and
catalog reconciliation. A new server regression now verifies that automatically
added source scans complete both phases, including one processed metadata
track. If another library operation is active, source creation succeeds
without a queued scan and the page instructs the administrator to rescan later.

Verification passed: all 67 server tests, all 104 web tests, workspace
typecheck, `pnpm check`, `pnpm db:validate`, the production build, and
`git diff --check`. The Prisma CLI again reported that its optional agent skills
are out of date; validation itself passed. Browser interaction QA was not run
because the new behavior is covered by the server integration regression and no
new UI presentation was introduced. Changes remain uncommitted on `dev`
alongside the existing working-tree edits; no commit, push, tag, publication, or
deployment was performed.

## Source action menu items use a pointer cursor

The Sources row action menu keeps its existing text-row presentation. Rescan and
Remove now use a pointer cursor where they are actionable, while disabled menu
items retain the default cursor and reduced opacity.

The source-page regression test checks the pointer-cursor treatment on both
actions. All 104 web tests, `pnpm check`, web typecheck, the production web
build, and `git diff --check` pass; the built CSS includes the disabled-state
cursor override. Schema/server checks and browser visual QA were skipped because
this change only affects web menu presentation. Changes remain uncommitted on
`dev` alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed.

## Track lists lazily reveal rows with page scrolling

The shared track table no longer mounts every sorted row at once or renders
inside a virtualized, maximum-height scroll frame. It initially renders 60 rows
in normal page flow, appends 60 more as a sentinel approaches the viewport, and
keeps a visible Load more tracks button for keyboard and constrained clients.
The main content region remains the only vertical scroll owner for library,
album, artist, liked-song, and search track lists.

The complete sorted list remains available to queue construction, so playing a
mounted row still queues every track in that table. Direct title-hash navigation
uses the progressive reveal state to mount the target row before scrolling it
into view. Table accessibility structure, sorting, collection playback, artist
links, album links, likes, and fixed player behavior remain intact.

Verification passed: all 104 web tests, web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check`. Schema/server checks
and browser interaction QA were skipped because this is a web presentation and
scroll-container change. Changes remain uncommitted on `dev` alongside the
existing working-tree edits. No commit, push, tag, publication, or deployment
was performed. Next: visually verify automatic batch revelation, the Load more
fallback, and deep-link scrolling at desktop and mobile widths.

## Linked local metadata and interactive now-playing control

The shared track row now always renders linked artist credits beneath the track
title, including album and artist detail lists and narrow viewports. Visible
album names link to their album details in every applicable table variant, so
artist-page track lists no longer show plain album text. The redundant desktop
Artist column was removed.

Fixed-player and queue artist credits use the same `trackArtistNames` fallback
and therefore link even when only the legacy artist credit string is populated.
The now-playing play/pause icon is a shared Button that toggles the active track.
External metadata candidates intentionally remain plain provider results.

`pnpm --filter @peridot/web test` passes all 103 tests. Web typecheck,
`pnpm check`, the web production build, and `git diff --check` pass. Server,
schema, and browser interaction checks were skipped because this change is
limited to web presentation and existing playback actions. The changes remain
uncommitted on `dev` alongside the pre-existing working-tree changes; no commit,
push, tag, publication, or deployment was performed. Next: visually verify
linked metadata and the now-playing toggle at desktop and mobile widths.

## Track-list playback queues the whole list

Playing a shared track-table row now queues every track currently displayed in
that table instead of reducing the queue to the selected track. The selected
track starts first, followed by the rows below it and then the rows above it.
This covers the library, liked songs, search results, album detail tracks, and
artist detail tracks, including row controls, double-click, and context-menu
Play.

Queue construction uses a pure rotation helper so duplicate or unavailable
entries are normalized before the selected track is placed first. Album and
artist collection buttons retain their existing full-collection behavior.

Focused album, artist, context-menu, search, and queue tests pass (17 of 17).
Web typecheck, targeted ESLint, Prettier, and the production web build pass. The
full web suite passes 100 of 101 tests; the only failure is the previously
documented sidebar assertion expecting the `logo` variable while the checked-in
layout uses `logoNop`. Schema/server checks and browser interaction QA were
skipped because this change is limited to web queue behavior and shared track
presentation. The queue rotation intentionally places preceding rows after the
following rows so forward playback starts with the next visible track.

The listed changes remain uncommitted on `dev`, alongside pre-existing web,
test, and documentation changes. No commit, push, tag, publication, or
deployment was performed. Next: interactively verify row playback from a sorted
library list and an artist track list, then resolve the known sidebar logo
assertion.

## Unlinked player title selection

The fixed player's non-link title fallback now uses `select-none`, so titles
without an album destination cannot be text-selected. Titles that link to an
album keep their existing selectable link behavior.

Added a focused shared-player regression assertion for the fallback class.

Focused player coverage, web typecheck, targeted ESLint, Prettier, the production
web build, and `git diff --check` pass. The full web suite passes 95 of 96 tests;
the only failure is the previously documented sidebar assertion expecting the
`logo` variable while the checked-in layout uses `logoNop`. Schema/server checks
and browser visual QA were skipped because this only changes player title
selection behavior.

## Library source controls

The Sources settings list now identifies source categories with larger bundled
Basil icons instead of textual `path`/`url` badges: folder for local files,
globe for remote URLs, and apps for integrations. The icon keeps an accessible
category label and also exposes that label through its native hover title. Local
source rows show the folder name first and the complete path beneath it as a
muted subtitle. The Add source selection dialog shows the same folder, globe,
and integration icons beside its choices.

The Sources header now includes a Rescan all action wired to the existing global
library-scan flow. It scans every configured local path source through one
authenticated library scan and is disabled while source or metadata scan work is
active. Per-source rescan behavior is unchanged.

Targeted source-page and bundled-icon tests, web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check` pass. The full web
suite still passes 95 of 96 tests; the only failure is the previously documented
sidebar assertion expecting the `logo` variable while the checked-in layout uses
`logoNop`. Browser visual QA was not run. The listed changes remain uncommitted
on `dev`; no commit, push, tag, publication, or deployment was performed.

## Player title album navigation

The current track's title in the fixed player now links to that track's album
detail page. The destination includes a stable track-title hash, and the album
page scrolls to that title after its asynchronously loaded catalog rows render.
Tracks without album metadata keep the non-link title treatment because no
album destination exists.

Added route/anchor helper coverage plus layout and album-page regressions for
the player link and deferred hash scrolling.

## Playing track waveform

The shared track table now shows the bundled AT Icons
`waveform` glyph in the primary color immediately after the current
track title. It remains visible while that track is paused. The active-row
background tint was removed, leaving only the existing hover treatment. The
icon remains decorative to assistive technology because the play/pause control
already exposes the playback state.

Added focused icon and album-page regressions for the requested bundled glyph,
the current-track condition, and the removed active-row background.

Verified with a frozen-lockfile install, 26 passing focused album/icon/library
tests, web typecheck, targeted ESLint, Prettier, and the production web build.
The full web suite passes 95 of 96 tests; the only failure is the previously
documented sidebar assertion expecting the `logo` variable while the checked-in
layout uses `logoNop`.

## Unavailable track title opacity

Shared track-table titles now use the existing 60% opacity utility when their
catalog entry is unavailable. Available track titles and all other row content
remain unchanged. Queue entries do not need the treatment because unavailable
tracks are removed from playback queues.

Added a focused regression assertion for the shared title rendering. Existing
unrelated scanner changes and the pre-existing untracked `$null` file were
preserved.

Focused album/library tests (23 passing), web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check` pass. The full web
suite passes 94 of 95 tests; the only failure is the previously documented
sidebar assertion expecting the `logo` variable while the checked-in layout uses
`logoNop`.

## SQLite-safe library scanning

Library file processing is now serialized for SQLite. The scanner previously
ran four file workers in parallel, each reading and writing the same local
database. Repeated scans of existing files could therefore fail with
`SqlConnectionError: database is locked`, which the scan record reported as a
misleading configured-root failure.

All per-file work, including existing-file lookup and unchanged-file updates, is
now inside the per-file error guard. A persistent SQLite lock still counts as a
file error instead of aborting the entire scan. If a scan-level database lock is
encountered, the stored failure now identifies database contention rather than
file traversal.

Added a regression that scans four files, then repeats the scan three times and
requires every run to complete with four unchanged tracks and no errors.

## Dedicated search view and quick filters

Search now opens a dedicated `/search` content view from the persistent top-bar
input. Clicking or focusing that input navigates to `/search`, and the same input
owns the query state while the page renders results only. The view uses the
available main content width, keeps the sidebar, header, and fixed player, and
replaces the previous shared query that filtered Home, Library, Albums, Artists,
and detail pages.

With an empty query, search shows up to eight recently opened local albums,
newest first. With a query, it groups local album cards and the shared track
table, then shows the non-functional External sources notice. The `All`,
`Albums`, and `Tracks` toggle tags below the input act as client-side quick
filters over the current results and expose `aria-pressed` state.

Search album cards use a compact variant with tighter padding, smaller artwork
placeholders, smaller titles and like controls, and a dense grid that reaches ten
columns on wide screens.
Album cards elsewhere retain their existing size.

Every shared album card now exposes a small cover play button that appears on
hover, uses a pointer cursor, and starts the album immediately without following
the card link. Focus on other card controls does not keep the button visible;
keyboard focus on the play control itself still reveals it. The album-detail
cover is not a shared album card and remains unchanged.

When a card's album contains the active player track, its cover control mirrors
the main player button: it shows pause while playing, play while paused, shows
the loading spinner while preparing audio, and toggles the existing playback
instead of restarting the album.

The album-detail header button follows the same active-album behavior as a
circular icon-only control. Play, pause, and loading states are conveyed through
the icon or spinner, with a descriptive accessible label.

Track-table active styling now follows the player's current track even while
playback is paused. Play/pause icons and labels still depend on whether that
current track is actually playing. The active row uses a slightly stronger
`bg-primary/10` tint.

Recent albums are stored in browser-local storage under a versioned key scoped
by server and user. Saved identities are normalized and deduplicated, then
reconciled against the current catalog so removed albums do not appear. Album
card navigation emits an open event so likes and other controls do not
incorrectly update the recent list. Existing album context menus, likes, track
playback, and player behavior are unchanged.

Verified: web typecheck, targeted ESLint, Prettier, the production web build,
and all new search tests passed. The full web suite passed 93 of 94 tests; the
only failure is the previously documented stale sidebar assertion expecting the
`logo` variable while the checked-in layout uses `logoNop`. A native browser
visual pass was attempted, but Computer Use stopped because it could not verify
that the local browser URL was allowed.

No server API, schema, credential, provider, or download integration changed.
The external-source section intentionally has no simulated items or actions.
Changes remain uncommitted on `dev`; the pre-existing untracked `$null` file was
preserved. No commit, push, tag, publication, or deployment was performed.

## Like hover scoped to the control

The shared like button now changes its icon color only when the button itself is
hovered or active. Previously its `group-hover` and `group-active` utilities also
matched the album and artist cards' ancestor hover group, so hovering anywhere
on a card colored the heart. All track, collection, header, player, and context
menu uses inherit the corrected shared behavior.

An application-wide scan found the remaining `group-hover` uses only on player
buttons contained in their own button groups and on album/artist placeholder
artwork; neither reproduces the card-to-like-button coupling.

The focused likes UI test (3/3), targeted ESLint and Prettier checks, web
typecheck, and `git diff --check` pass. The full web suite passes 86 of 87 tests;
the only failure is the previously documented sidebar assertion expecting the
`logo` variable while the current layout uses `logoNop`. Existing unrelated
working-tree changes were preserved. No commit, push, tag, publication, or
deployment was performed.

## Full-row sortable targets

Queue tracks, library sources, and configured metadata providers now use their
entire row as the drag target rather than exposing only the grip icon as the
handle. Action buttons, links, and inputs are filtered from drag initiation so
their normal click and keyboard behavior remains available. Unconfigured
metadata providers remain visible but are not sortable. Rows show a grab cursor
and switch to a grabbing cursor while dragging.

Focused queue and settings tests pass except for the previously documented
sidebar logo assertion. Web typecheck, targeted ESLint, formatting checks, and
the production web build pass. Browser interaction QA was unavailable because
Computer Use rejected URL verification. No commit, push, tag, publication, or
deployment was performed.

## Metadata provider list controls

The Metadata settings list now renders every server-provided provider
definition, including providers that have not been configured. The add-provider
button and the separate provider-picker step were removed. Each row uses the
Simple Icons MusicBrainz or Discogs mark, a cog that opens that provider's
configuration dialog, and a state subtitle: `Not configured` in the warning
color, `Active` in the success color, or `Disabled` in the muted color.
Unconfigured titles are dimmed. Enabled providers with missing required fields
or credentials show a destructive warning above the cog with an explanatory
tooltip.

The enabled switch now lives inside the configuration dialog and is saved
together with provider configuration. Discogs credential help links only the
`Discogs account settings` phrase, with an external-link icon, to
`https://www.discogs.com/settings/developers` in a new tab with
`noopener noreferrer`. The shared UI package now provides a Reka-based Switch,
and the web app includes bundled `@iconify-icons/simple-icons` data for offline
rendering.

Verified focused metadata settings, notification, and provider-configuration
tests (17 passing; the only focused failure is the pre-existing sidebar logo
assertion), web typecheck, targeted ESLint, and Prettier. Browser interaction QA
was attempted but Computer Use rejected browser URL verification, so the visual
dialog and tooltip behavior still need an interactive pass. Changes remain
uncommitted on `dev`; no commit, push, tag, publication, or deployment was
performed.

## Extensible Discogs metadata integration

Metadata providers now use a registry of trusted resolver adapters with
declarative configuration fields, credential requirements, provider-specific
automatic-match policies, and canonical source URLs. MusicBrainz remains the
default first provider. Discogs is the second provider, receives only tracks
MusicBrainz leaves unresolved during automatic matching, and uses a token
validated through the Discogs identity endpoint. Manual candidate search merges
results from every enabled provider in configured order.

Track metadata storage now uses provider-neutral external track and release IDs,
a canonical source URL, and bounded labeled details. Discogs preserves release
year, label, catalog number, country, format, and raw track position. Settings
builds provider cards and forms from server definitions and supports editing
configuration, replacing tokens, disabling, re-enabling, and reordering
providers. Provider tokens are encrypted with AES-256-GCM using the required
`PERIDOT_CREDENTIAL_KEY`; they are never returned to the browser or placed in
request URLs.

The approved clean schema break replaced the MusicBrainz-shaped metadata
columns and generated a new Prisma 8 contract. `pnpm db:reset` was applied to
`apps/server/peridot.db`, so the local database is intentionally empty and must
be onboarded and scanned again. Existing local catalog, account, queue, and like
data were removed as expected. The new storage hash is
`2d939d6fb2d0c3a5d74f66440e1baac30c1fdc5277131579abb64ec07eb0029a`.

Checks passed: workspace type check (6 packages), `pnpm check`, Prisma contract
emission and `pnpm db:validate`, all 66 server tests, all 5 shared UI tests,
the production workspace build, and a fresh-database built-server smoke test
returning the expected health payload. The web suite passed 84 of 85 tests. Its
only failure is the previously documented sidebar test expecting the `logo`
variable while the current checked-in layout uses `logoNop`.

No live Discogs request was performed because no administrator token or
credential encryption key was supplied. Next: set a base64-encoded 32-byte
`PERIDOT_CREDENTIAL_KEY`, onboard the reset server, add a personal Discogs
token, rescan the library, and verify one exact automatic match plus one manual
edition override. Changes remain uncommitted on `dev`; unrelated existing
working-tree changes, including the pre-existing untracked files, were
preserved. No commit, push, tag, publication, or deployment was performed.

## Browser-local queue and playback position

The player now writes a versioned, server-and-user-scoped `localStorage`
snapshot containing the complete queue, active track, shuffle state and
remaining random pool, and elapsed playback position. Queue mutations and media
clock updates refresh the snapshot. On reload, a valid local snapshot is restored
paused before the existing server queue fallback, so the same queue and track
return at the saved position without autoplay.

Added serialization and validation helpers plus behavioral coverage for full
snapshot round trips, queue ordering, scope isolation, malformed data, and
invalid progress. Extended the native-player regression coverage for the
local-storage read/write and reactive persistence wiring.

Verified the focused player/storage tests (3/3), web typecheck, targeted ESLint
and Prettier checks, the production web build, and `git diff --check`. The full
web suite passed 84 of 85 tests; the remaining pre-existing failure expects the
sidebar logo variable `logo`, while the checked-in layout uses `logoNop`.
Browser interaction QA could not run because Computer Use rejected browser URL
verification. Schema/server checks were skipped because this is web-only state
persistence. Changes remain uncommitted on `dev`; no commit, push, tag,
publication, or deployment was performed.

Known limits: progress is browser- and origin-local and does not synchronize
between devices or reset when the server database is reset. If browser storage
is unavailable or invalid, the player falls back to the server queue and starts
that queue at position zero.

## Default MusicBrainz provider and disable lifecycle

MusicBrainz is now created and enabled when the first administrator account is
created, using the required administrator email as the MusicBrainz contact.
Startup also backfills the default provider for an existing installation that
has an administrator but no provider row. A persisted `enabled` flag keeps an
administrator-disabled provider from being recreated or silently re-enabled.

Settings â†’ Metadata now shows Disable for an active provider and Enable for a
disabled one. Disabling requires confirmation, preserves the provider record
and contact, and leaves existing track matches intact. The provider remains in
the ordered list but is ignored by automatic enrichment, manual candidate
search, and manual match application until enabled again. The admin API now
uses `PUT /api/admin/metadata-providers/:id` with `{ "enabled": boolean }`;
physical provider deletion is no longer exposed.

Verified server and web type checks, all 59 server tests, the focused metadata
web tests, notification wiring tests, `pnpm check`, Prisma contract
emission/validation, the local `pnpm db:update` (including the new
`MetadataProvider.enabled` column), and the full production workspace build.
The full web suite passed 82 of 83 tests; the remaining pre-existing failure
expects the sidebar logo variable `logo`, while the current unrelated worktree
uses `logoNop`. Browser interaction QA was not run. Changes remain uncommitted
on `dev`; no commit, push, tag, publication, or deployment was performed.

## Persistent randomized playback toggle

Randomize is now an explicit per-user playback toggle rather than an immediate
queue shuffle. The queue API and SQLite state persist the source-order queue, an
independent active track, the enabled flag, and the remaining no-repeat random
pool. Reloading resumes the same active track and pass paused. Repeat-all starts
a new shuffled pass after exhaustion; repeat-one intentionally replays the
active track.

The player uses a separate random pool, so enabling randomization leaves the
visible queue order unchanged. The drawer pins the active track, keeps
source-order rows below it, and displays a secondary `Randomized` badge while
the mode is enabled. Add, remove, direct-play, Previous, and drag-reorder actions
keep the source queue unique and the random pool consistent.

Verification results and any remaining limits are recorded after the final
workspace checks. Changes remain uncommitted on `dev`; unrelated working-tree
changes and the pre-existing untracked files were preserved. No commit, push,
tag, publication, or deployment was performed.

## Prisma 8 upgrade and fresh local database

The server now runs on Prisma 8's contract-first ORM instead of Prisma 7 and its
generated client. `prisma@8.0.0-rc.33`, `@prisma/cli-engine@0.9.0`, and
`@prisma/orm-sqlite@8.0.0-rc.23` form the currently published compatible stack.
The authoritative model is `apps/server/src/prisma/contract.prisma`; emitted
`contract.json` and `contract.d.ts` are committed beside it. All server queries
and tests now use `db.orm`, `db.transaction`, `db.close`, and scalar row types
derived from the emitted contract.

The upgrade intentionally has no migration path. The old Prisma 7 schema,
twelve committed migrations, generated client, and `prisma7.config.ts` were
removed. A temporary recoverable copy of those old artifacts is under
`C:\Users\CYRIAQ~1.DEL\AppData\Local\Temp\peridot-prisma7-artifacts-20261111`.
`pnpm db:update` applies the current contract to an existing local database;
`pnpm db:reset` explicitly deletes and recreates it. Prisma's local refs and
snapshots are written under ignored `apps/server/.peridot/`. Development startup
uses `db:update`, never `db:reset`.

The actual `apps/server/peridot.db` was reset from scratch. Verification opened
it read-only and found all 12 application tables plus Prisma's marker, with zero
users, tracks, sources, and server settings. The database marker matches contract
storage hash `a80f96be326f8d1f4f7c7fc115b56c0fbae666a95214c66cbae73423cd2d8547`.
SQLite track availability is stored as `Int` because this SQLite target does not
provide a boolean codec; API contracts still expose booleans.

Checks passed: frozen-lockfile install, contract emission, workspace typecheck,
all 79 web tests, all 5 shared UI tests, all 58 server tests, lint/format checks,
the full workspace build, and a built-server smoke test against a separately
initialized fresh database. The smoke server returned the expected health payload
and `requiresAdminUser: true`. The CLI prints a non-failing notice that its
bundled agent skill is not synced to the repository.

Known limits: Prisma 8 is still a release candidate, so dependency updates require
checking the published ORM/CLI pairing. No migrations are retained and no data
was preserved from the previous local database. Changes remain uncommitted on
`dev`; unrelated working-tree changes, including the pre-existing untracked
`package-lock.json`, were preserved. No commit, push, tag, publication, or
deployment was performed. Next: continue normal development against the fresh
database, then revisit a migration strategy before any production data upgrade.

## Reliable Node 24 development startup

The root development command now runs under a project-scoped Node 24.22.2
runtime even when the machine-wide Node installation is outside the supported
major. The previous system Node 22 startup failed with Windows exit
`3221226505` (`0xC0000409`) after migrations, and its native SQLite module used
an incompatible ABI. `devEngines.runtime` lets pnpm download and use Node
24.22.2 for workspace lifecycle scripts.

The development launcher now starts the web and server workspace tasks in
parallel through pnpm instead of Turbo. Turbo remains the runner for build,
typecheck, and test, but `turbo run dev` inherited the Windows terminal crash
even with streamed output. The exact root `pnpm dev` command was verified in an
interactive terminal: migrations completed, Nuxt served on port 3000, Fastify
served health on port 17430, and both endpoints returned HTTP 200.

Server test fixtures now canonicalize their temporary roots before constructing
paths. Node 24 can return a Windows 8.3 alias from `mkdtemp()` while `realpath()`
returns the long form, which made source deduplication and audio lookup tests
compare different names for the same directory.

Verified `pnpm install --frozen-lockfile`, `pnpm check`, workspace typecheck,
`pnpm db:validate`, all 58 server tests after the path fix, and the interactive
development smoke test. The earlier full test run passed all 79 web and 5
shared UI tests. The machine-wide Node installer could not be replaced without
administrator elevation; the project runtime makes that optional. Changes are
uncommitted on `dev`, including `package.json`, `pnpm-lock.yaml`, the server test
fixtures, this handoff, and the decision log. The pre-existing untracked
`package-lock.json` was preserved. No commit, push, tag, publication, or
deployment was performed.

## Persistent onboarding server discovery

Onboarding now keeps the branded spinner and "Looking for a server on this
network" status visible throughout server selection, including between
automatic discovery cycles. Discovered Peridot servers remain listed as direct
selection actions below the status.

The URL field is no longer shown by default. A bottom-aligned manual-entry
option reveals and focuses it; address probing remains debounced and verified
servers are added to the same discovery list. Selection errors stay outside the
collapsed manual section so they remain visible.

Added onboarding coverage for the permanent spinner copy, found-server list,
reveal control, and collapsed URL field. The focused test, all 79 web tests,
web type check, `pnpm check`, the web production build, and `git diff --check`
passed. A built-app request to `/onboarding` returned HTTP 200 with the spinner
copy and manual option present and the URL field absent from the initial render.
Server/schema checks were skipped because no server or storage code changed.
Browser visual interaction QA was not run. Changes remain uncommitted on `dev`
with unrelated working-tree changes preserved; no commit, push, tag,
publication, or deployment was performed.

## Quiet default sort state in track tables

Inactive track-table sort headers and the default sort state no longer show the
neutral sort glyph. A sorted column shows only its ascending or descending
caret. Removed the now-unused `basil:sort-outline` import from the bundled icon
registry and added regression coverage for the conditional direction icons.

All 79 web tests, web typecheck, targeted ESLint and Prettier checks, the web
production build, and `git diff --check` passed. Server checks and database
schema validation were skipped because no server or storage code changed.
Browser visual QA was not run. Changes remain uncommitted on `dev`; no commit,
push, tag, publication, or deployment was performed.

## Silent source and provider reordering

Dragging library sources or metadata providers into a new order no longer emits
a success toast after the server saves the order. The new row order is visible
immediately, and failed order requests still show their existing inline error.
Add and remove toasts remain unchanged.

Updated the notification wiring coverage to require the order APIs but reject
success-toast calls from both reorder handlers. All 78 web tests, web typecheck,
targeted ESLint and Prettier checks, the web production build, and
`git diff --check` passed. Server checks and database schema validation were
skipped because no server or storage code changed. Browser interaction QA was
not run. Changes remain uncommitted on `dev`; no commit, push, tag, publication,
or deployment was performed.

## Bulk track metadata reset

The Metadata settings page now has a confirmed Reset metadata action. It clears
automatic and manual metadata matches for every catalog track, restores the
display to original file tags, reloads the browser catalog, and leaves
configured providers and audio files unchanged. The reset also clears attempted
match signatures, provider provenance, MusicBrainz recording/release IDs,
numbering, and match timestamps. The action is unavailable while a library
operation is active, and the server returns `409` if one is already running.

Added `POST /api/admin/metadata/reset` and a shared reset response contract. The
server endpoint is administrator-only. Behavioral coverage verifies successful
clearing of automatic and manual modes, file-tag fallback, provider retention,
and member/anonymous rejection. Web coverage verifies the authenticated client
call, confirmation dialog, catalog reload, and success-toast wiring.

Verified all 58 server tests, all 78 web tests, workspace type checking,
`pnpm check`, the full production `pnpm build`, and Prettier formatting. Database
schema validation was skipped because no schema or migration changed. Browser
visual and interaction QA was not run. Changes remain uncommitted on `dev` and
existing concurrent work was preserved; no commit, push, tag, publication, or
deployment was performed. Next: visually verify the destructive confirmation
and reset the real Tron: Legacy catalog to confirm it returns to one album.

## Playback across fullscreen layouts

Audio playback is now owned by the persistent Nuxt application root instead of
the main layout. Opening fullscreen Settings no longer tears down the native
audio element, so the current track keeps playing and its shared position,
volume, and queue remain intact while the player controls are hidden. Returning
to the main shell reconnects the controls to the same audio manager.

Updated the player lifecycle regression test to require root ownership and
prevent `default.vue` from creating a second audio manager. Checks and browser
verification results will be recorded after validation. Changes remain
uncommitted on `dev`; no commit, push, publication, or deployment was performed.

## Like success toasts

Liking a track, album, or artist now shows a five-second success toast after
the server confirms the like. Track likes use a generic confirmation because
the like target carries only the catalog ID; album and artist confirmations
include their trimmed display name. Heart buttons, context menus, cards, and
detail headers all inherit the behavior from the shared optimistic likes
composable. Unlikes remain silent on success and retain the existing rollback
error toast on failure.

Added pure target-specific toast content and a wiring regression test. All 78
web tests, web typecheck, workspace `pnpm check`, the full production
`pnpm build`, and `git diff --check` passed. Browser visual QA was not run.
Server behavioral tests, database schema validation, and server-specific type
checks were skipped because no server or storage code changed. Changes remain
uncommitted on `dev` alongside the existing library, metadata, playback, likes,
queue, and artwork work; no commit, push, tag, publication, or deployment was
performed.

## Album and artist card context menus

Album and artist cards now expose Reka UI context menus on right-click and touch
long-press across the complete card, including their artwork and title links.
The menus provide collection-aware Play, Like/Unlike, and Open actions. Play
replaces the persistent queue with the collection order through the shared
player, likes use the existing optimistic synchronized store, and Open uses the
existing encoded album and artist routes.

Added `AlbumContextMenu` and `ArtistContextMenu` wrappers and composed them into
the shared cards so home, Albums, and artist detail surfaces inherit the same
behavior. Added context-menu interaction coverage and included both components
in the styling-authority scan.

`pnpm --filter @peridot/web typecheck`, targeted ESLint and Prettier, all 77 web
tests, the production web build, and `git diff --check` passed. Browser pointer,
touch long-press, and keyboard visual QA was not run. Database/schema checks were
skipped because no server or storage code changed. Changes remain uncommitted on
`dev` with the existing work preserved; no commit, push, tag, publication, or
deployment was performed. Next: visually exercise right-click and touch
long-press on both card types and confirm menu actions against a real library.

## Folder-based album metadata matching

Automatic metadata enrichment now treats every containing folder as an album.
Tracks are grouped by source and directory, remain grouped when album tags are
missing or inconsistent, and use the folder name as the release title fallback.
This ensures tracks in an untagged album folder go through shared release search
and lookup instead of being treated as unrelated recording searches. Tracks in
a source root fall back to the source directory's name.

Added a behavioral test with two untagged MP3s in a `Night Sessions` folder,
asserting one release search for that folder title and two successful matches.
The targeted server test run passed all 57 server tests, and the server
typecheck, server build, workspace `pnpm check`, targeted ESLint, targeted
Prettier, and `git diff --check` checks passed.

Changes remain uncommitted on `dev` alongside the existing library, metadata,
playback, likes, queue, and artwork work. No commit, push, tag, publication, or
deployment was performed. Next: exercise the folder-based group against a real
untagged album and confirm releases with inconsistent per-track artist credits
are matched as expected.

## Local album artwork and signed cover URLs

The scanner now extracts preferred embedded front-cover artwork and falls back to
same-folder JPEG, PNG, or WebP files named `cover`, `folder`, `front`, or
`albumart`. Covers are capped at 5 MiB, hashed by content, deduplicated in the
new `TrackCover` table, and associated with tracks through `coverId`. Metadata
version 3 makes the next scan backfill covers for existing rows.

Track responses now include a relative cover URL with a four-hour HMAC token
scoped to that track's cover image. The scanner, player, and catalog do not
expose the user session to image requests. Album cards, album detail headers,
and the fixed player render the actual image and keep the semantic music-note
placeholder whenever no usable cover exists or the image request fails.

Added migration `20261110280000_track_covers`, cover-token authorization and log
redaction, embedded/folder artwork extraction, deduplication, authenticated
image serving, album grouping cover selection, and UI regression coverage for
the image/fallback branches.

## Metadata providers and dedicated source management

Settings now has dedicated administrator-only Sources and Metadata pages.
Sources retains add, drag-to-sort, and confirmed deletion, and each local source
row has a three-dot action menu for a source-scoped rescan or removal. Remote URL
and integration sources show Rescan disabled until those source kinds become
indexable. Administration now contains only the connected-server control and
server log; the former Library status and global Rescan library panel is gone.

Added the `POST /api/admin/sources/:id/scans` endpoint and nullable source
context on scans. Scoped scans read only the selected local path and only mark
missing tracks from that source unavailable. Global scan behavior remains for
compatibility and tests.

Added administrator-managed MusicBrainz providers with list, create, reorder,
delete, contact validation, duplicate protection, credential secrecy, and a
reserved encrypted credential column for future providers. MusicBrainz uses no
API key, so the UI collects a contact email or URL for the required User-Agent.
The Add provider dialog uses a Sources-style two-step flow: selectable cards for
MusicBrainz and a disabled Spotify coming-soon placeholder, followed by a
contact-only MusicBrainz form without a display-name option.
Configured kinds are disabled in the picker and the server uniqueness constraint
prevents duplicate MusicBrainz providers. The Metadata page also exposes a
Refresh metadata action backed by `POST /api/admin/metadata/refresh`, which
re-runs automatic matching for current tracks without scanning files or touching
manual/file-mode overrides.
The fixed-origin client serializes requests to one per second, applies timeouts,
response-size limits, retry backoff, and rate-limit handling.

Library scans now continue into background metadata matching after local file
scanning completes. New or changed tracks are grouped for release matching or
queried as recordings, and matching metadata is stored as an overlay with a
provider snapshot, recording/release MBIDs, match mode, time, and MusicBrainz
link. Local tags remain the fallback. Successful unchanged matches and prior
no-match signatures are not polled again; transient failures remain retryable.
Track context menus expose provenance, MusicBrainz candidate search, manual
correction, and return-to-file-metadata actions for signed-in members. Reverting
selects file mode so the next scan does not immediately restore the same
automatic match.

Added migration `20261110270000_metadata_providers` for provider configuration,
track overlay fields, and scan metadata/source context. Behavioral coverage now
includes provider CRUD and authorization, contact and CORS validation,
MusicBrainz request headers/origin/rate limiting, automatic matching, no-match
and unchanged skipping, manual correction/reversion, source-scoped scan
isolation, dedicated Settings pages, context-menu correction, metadata toast
progress, and styling authority.

Verified `pnpm check`, full workspace typecheck, all 138 tests (76 web, 57
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all twelve
migrations against a disposable SQLite database, and `git diff --check`; all
passed. A browser visual/interaction pass was not run.

Known limits: MusicBrainz is the only provider; URL and integration source types
remain stored but not indexable; matching is deterministic best-match rather than
a confidence-review queue; any signed-in member can change shared catalog
metadata; several tracks in one album share a release search/lookup but manual
searches remain per track; and creating a provider that requires an API key is
not exposed until such a provider is implemented. Album artwork only uses
embedded pictures and four well-known same-folder filenames; it does not search
parent directories or fetch remote Cover Art Archive images.

Changes remain uncommitted on `dev` alongside the existing album, artist,
playback, likes, queue, and library work. No commit, push, tag, publication, or
deployment was performed. Next: visually review the two new Settings pages,
three-dot menus, provider dialog, metadata correction dialog, and toast phases at
desktop and mobile widths; then exercise a real MusicBrainz match against a
small tagged album.

## Sortable Reka track tables

Library, album, and artist track lists now use one shared real-DOM table that
follows the Reka UI data-table example for client-side sorting and row
interaction composition. The visible Track number, Title, Artist, Album, and
Duration fields expose accessible sort buttons with `aria-sort`, bundled Basil
sort-direction icons, and a three-state cycle through ascending, descending,
and default. Library tables return to Title ascending in their default state;
album and artist tables return to track number ascending so their existing
album/disc semantics remain the default.
Missing text, duration, and track-number values sort last in both directions.

The refactor centralizes row rendering for playback, liking, double-click, album
and artist links, and the existing Reka context menu. Added behavioral coverage
for case-insensitive text sorting, the three-state toggle cycle, null placement,
numeric duration sorting, album/disc/track ordering, and non-mutating input.
Updated component regression coverage to verify all three screens use the
shared table.

The tri-state sorting regression test, web typecheck, `pnpm check` (workspace
lint and formatting), production web build, and `git diff --check` passed. The
full web run passed 74 of 75 tests; the remaining unrelated album-cover fixture
expects a cover URL that its catalog fixture does not define. Database/schema
checks were skipped because no server or storage code changed. Browser visual,
pointer, and keyboard interaction QA was not run. Changes remain uncommitted on
`dev` alongside the existing work; no commit, push, tag, publication, or
deployment was performed. Next: visually verify the sortable headers at desktop
and mobile widths, then exercise default, ascending, descending, reset, and
keyboard activation in a browser.

## Durable player queue and right-side queue drawer

The player now uses one ordered, per-user queue with the first available track
as the active item. Individual track playback moves that track to the front;
album and artist Play actions replace the queue with the ordered collection.
Next and natural completion consume the active item and stop at the end.
Previous restores an in-memory history entry and puts the displaced current
track back at the front of upcoming. Add to queue inserts directly after the
active track without duplicating an existing entry. The action remains enabled
for queued tracks and re-adding one normalizes and repositions it rather than
creating a duplicate.

Queue order is stored relationally in the new `QueueItem` model and migration
`20261110260000_user_queue`. Authenticated `GET /api/queue` and
`PUT /api/queue` expose an ordered track-ID snapshot; PUT rejects duplicates
and unknown tracks and atomically replaces the user's queue. Browser mutations
are serialized, auth-scope guarded, and last-write-wins. Queue loading restores
the first available track paused at the start without auto-play.

The fixed player includes randomize-upcoming and queue controls. Randomize
shuffles only upcoming entries and preserves the active track and playback
state. The queue opens in a player-clearing, width-constrained custom right-side
panel with a pinned now-playing row, drag-sorted upcoming rows, playback
context, artist links, delete actions, and retryable loading errors. Upcoming
queue rows are not playback controls. The panel and overlay stop at the top of
the fixed player, so neither overlaps or blocks player interaction. The queue
button directly toggles the panel. Entire queue rows are sortable with
SortableJS. The new order is calculated from its old and new indexes before
persistence. Close-button, Escape, and backdrop dismissal are handled by the
custom panel. The panel is non-modal so the fixed player remains interactive
while it is open. The now-playing row cannot be reordered or removed.
Queue drag handles use the bundled `akar-icons:drag-vertical` glyph, imported
offline through `@iconify-icons/akar-icons`.

Added server coverage for ordering, validation, per-user privacy,
authentication, restart persistence, and cascade deletion. Added pure queue
logic, authenticated client, context-menu, control-placement, custom drawer, and
styling coverage. Full workspace lint, formatting, typecheck, tests, schema
validation, production build, and deployment of all ten migrations passed
before the final drawer layout adjustments. Web typecheck and all 69 web tests
passed after changing the drawer to a right-side panel and then constraining
its width. Browser visual/interaction QA remains unavailable because Computer
Use could not verify the active Brave URL.

Changes remain uncommitted on `dev` alongside concurrent work, including the
shared track-table refactor and player seek hit-area change. No commit, push,
tag, publication, deployment, or credentials were created. Next: visually
verify the full-screen drawer controls and a real drag sort at desktop and
mobile widths when browser automation is available.

## Sidebar brand logo

The main sidebar now displays the bundled shared Peridot logo immediately before
the lowercase “peridot” title. The image is decorative because the adjacent text
already names the home link, and it uses the existing Button gap with a standard
Tailwind `size-6` scale. A regression assertion covers the logo placement.

Verified the web typecheck, all 65 web tests, targeted Prettier, the production
web build, and `git diff --check`; all passed. Targeted ESLint still reports the
preexisting unused `queueTracks` binding in `default.vue`; that unrelated
uncommitted code was preserved. No browser visual pass was run. Changes remain
uncommitted on `dev`; no commit, push, publication, or deployment was performed.

## Durable track, album, and artist likes

Track, album, and artist favorites now persist per signed-in user in SQLite.
The migration adds separate track, album, and artist like models. Track likes
reference catalog IDs and cascade with user or track deletion; derived album and
artist likes store trimmed display labels plus normalized identities so they
match the existing case-insensitive projections. The authenticated likes API is
an aggregate `GET /api/likes` plus idempotent `POST` and `DELETE` mutations with
a discriminated target.

The web app now loads likes once into shared Nuxt state and uses it from the
fixed player, every track heart and context menu, the Liked songs view and count,
album cards, artist cards, and both detail headers. Mutations are optimistic,
per-target pending operations ignore duplicate clicks, failures roll back and
surface an app toast, and state resets when the connected server or user changes.
Album and artist cards separate their navigation links from like buttons so
interactive controls are not nested. Likes never cascade from albums or artists
to tracks. No new liked-album or liked-artist browsing page was added.

Added migration `20261110250000_user_likes` and behavioral coverage for
normalization and idempotency, identity independence, per-user privacy,
authentication, validation, missing tracks, persistence across restart, and
cascade deletion. Added client coverage for authenticated API calls, JSON
bodies, identity helpers, the shared state wiring, Liked songs filtering, and all
album/artist card and detail controls.

Verified `pnpm check`, full workspace typecheck, all 101 tests (59 web, 37
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all nine
migrations against a disposable database, and `git diff --check`; all passed. No
browser visual or interaction pass was run.

Known limits: existing in-memory likes cannot be migrated because they were
never persisted; unavailable track likes remain stored but are hidden from the
available catalog; retagging an album or artist to a new normalized identity
leaves the prior like stored but unmatched. Changes remain uncommitted on `dev`
alongside the existing work; no commit, push, tag, publication, or deployment
was performed.

## Track context menus, downloads, and multiple artist credits

Track rows in the library, album detail, and artist detail now share a Reka UI
context menu built on new shadcn-style wrappers in `@peridot/ui`. Right-clicking
or long-pressing a row offers Play, Like/Unlike, Download, Go to album, and Go
to artist. Tracks with multiple credits use a Go to artists submenu. Menu
playback preserves each screen's existing queue, and downloads use a
short-lived playback token plus a temporary blob URL with a safe filename based
on the track title and MIME type.

The catalog contract now includes an artist-credit array while retaining the
combined display artist string. The scanner retains every metadata artist and
recognizes common single-field separators. A new optional `artistCredits`
column stores the array as JSON, and metadata version 2 triggers one backfill
scan for existing rows. Artist browsing now places a collaboration track under
each credited artist and renders individual artist links.

Verified `pnpm check`, full workspace typecheck, all 101 tests (59 web, 37
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`;
all passed. The server tests apply all migration files to disposable databases,
including the new artist-credit migration. No browser visual/interaction pass
was run.

Changes remain uncommitted on `dev` alongside the existing album, artist,
playback, library, source, likes, and settings work. No commit, push, tag,
publication, or deployment was performed. Known limits: existing tracks receive
separate artist credits after their next scan, and downloads buffer the complete
audio file in browser memory before saving. Next: right-click and long-press
rows at desktop and mobile widths, test the multi-artist submenu with real
tagged files, and confirm a download in a browser.

## Functional native audio playback

The fixed player now streams real tracks through an `HTMLAudioElement` instead
of advancing a simulated timer. Play/pause, previous/next, restart, seek,
volume, native media time, track duration, loading, and retryable error states
are connected to the shared player state. Album and artist queues advance
automatically when audio ends, while a single library-track choice returns to
the full catalog queue. Switching tracks aborts stale setup work and preserves
the intended play/pause state.

The browser cannot attach the session bearer header to a native media request,
so available tracks now issue a four-hour HMAC-signed token scoped to that track
and audio route. The token is supplied only in the audio URL, never replaces the
user session, and is redacted from request logs. Audio continues through the
existing authenticated HTTP range endpoint, so original formats stream and seek
without full-file downloads or transcoding.

Added server coverage for scoped tokens, expiry, tampering, route/method
restrictions, log redaction, token issuance, and unauthenticated ranged audio
streaming. Added web coverage for token issuance and the native audio/player
wiring. Updated README and DECISIONS.md.

Verified `pnpm check`, full workspace typecheck, all 87 tests (50 web, 32 server,
5 shared UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`; all
passed. A browser runtime playback pass was not completed because Computer Use
stopped when it could not verify the current browser URL. Changes remain
uncommitted on `dev` alongside the existing artist, album, library, source, and
settings work; no commit, push, tag, publication, or deployment was performed.

Known limits: selected-track and favorite state still reset on reload; playback
tokens are process-local and expire after four hours; fullscreen Settings
unmounts the audio element, so playback resumes at the saved position after
returning to the main layout. Next: manually play, pause, seek, change volume,
and exercise next/end-of-track behavior against a tagged local library in Brave.

## Artist browsing, detail, and artist queues

Added an Artists navigation destination and responsive artist grid derived from
every non-empty track artist in the loaded catalog, including albumless tracks
and Unknown Artist. Each card opens an artist detail route with album cards, a
complete artist track list, search, individual favorites/playback, and a Play
artist action. Artist tracks are ordered by album, disc, and track number, with
albumless tracks last. Both Play artist and individual artist-track actions use
an artist-scoped queue; album playback retains its existing album-scoped queue.

Artist names in the shared library track list and album detail now link to the
artist page, and the Artists navigation item remains active on detail routes.
The grouping helpers are case-insensitive and remain a client-side projection
with no server endpoint, schema change, or migration.

Verified `pnpm check`, full workspace typecheck, all 87 workspace tests (50 web,
32 server, 5 shared UI), the web production build, and `git diff --check`; all
passed. Database validation was unnecessary because no schema or server code
changed. No browser visual/interaction pass was run.

Changes remain uncommitted on `dev` alongside the existing album, playback,
library, source, and settings work. No commit, push, tag, publication, or
deployment was performed. Next: visually review the artist grid/detail and
artist links at desktop and mobile widths.

## Track-row double-click playback

Double-clicking a row in the shared library track list or an album detail track
list now starts that track. Row playback keeps the existing queue semantics:
library rows play from the full catalog and album rows remain inside the album.
Double-clicks on the title button, favorite control, and album link stop at those
controls so they do not trigger a second row action.

Added component regression assertions for both row handlers and the child-event
guard. Verified all 43 web tests, the web typecheck, targeted ESLint and Prettier
checks, the production web build, and `git diff --check`; all passed. Database
validation was skipped because no schema or server code changed, and no browser
interaction pass was run. Changes remain uncommitted on `dev` alongside the
existing album-browsing work; no commit, push, tag, publication, or deployment
was performed.

Next: exercise row double-click playback in the library and an album at desktop
widths, including double-clicks over title, favorite, and album controls.

## Track-list album links

Album names in the shared track list now link to the album detail route using
the same trimmed album title and artist identity as the Albums index. Tracks
without album or artist metadata continue to show the existing dash instead of
linking to an unavailable album.

Added route-identity coverage for trimmed track album metadata and a component
regression assertion for the track-list link. Verified all 43 web tests, the web
typecheck, targeted ESLint and Prettier checks, the production web build, and
`git diff --check`; all passed. Database validation was skipped because no
schema or server code changed, and no browser visual pass was run. Changes
remain uncommitted on `dev` alongside the existing album-browsing work; no
commit, push, tag, publication, or deployment was performed.

Next: visually confirm the album link's hover and keyboard-focus states at
desktop widths, where the track-list Album column is visible.

## Album browsing, detail, and album queues

Added an Albums navigation destination and responsive album grid derived from
the loaded track catalog. Albums group by case-insensitive artist and title;
albumless tracks remain in the normal library and are excluded from album
browsing. Each card opens a detail route with placeholder artwork, track and
total-duration summaries, search, per-track playback/favorites, and a Play album
action. The navigation highlights the Albums section on detail routes.

The player now supports an ordered album queue. Album actions keep previous,
next, and automatic advancement inside the album, while choosing a library track
resets the active queue to the full catalog. The persistent layout is now the
sole owner of the simulated playback timer, avoiding duplicate clocks when
screens also consume player state.

Extended the Track catalog with nullable disc and track numbers plus a private
metadata version. The scanner reads positive `disk.no` and `track.no` metadata;
the next scan reparses legacy rows once to backfill them, then marks tagless
files current so unchanged scans remain cheap. `TrackResponse` exposes the two
public ordering fields. Added migration
`20261110230000_track_album_order`.

Verified `pnpm check`, full workspace typecheck, all 77 tests (43 web, 29 server,
5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all seven
migrations against a disposable database, and `git diff --check`; all passed.
No browser visual/interaction pass was run.

Known limits: album artwork remains a semantic placeholder because cover
extraction/serving is deferred; albums are still a client-side projection with
no album entity or `/api/albums` endpoint; existing catalogs receive disc/track
metadata only after their next scan; and playback remains simulated. Changes
remain uncommitted on `dev` alongside the existing library, source, settings,
and documentation work. No commit, push, tag, publication, or deployment was
performed.

Next: run a scan against a tagged multi-disc library, then visually review the
album grid/detail at desktop and mobile widths. A later artwork slice should
extract embedded covers or folder images and expose a bounded image endpoint.

## Real scanned tracks in the library

The Home, Library, and Liked songs views now read the authenticated
`GET /api/tracks` catalog instead of the former five fictional records. A shared
Nuxt state loads the catalog once, exposes loading and retry states, supports
title/artist/album search and in-memory favorite filtering, and reloads
automatically when the global scan watcher reports a completed scan. The fixed
player now displays selected real track metadata; its timer and transport remain
simulated until the audio engine is connected.

Removed `demo-library.ts`, `use-demo-player.ts`, and their tests. Added pure
library filtering/duration tests and client coverage that verifies the bearer
token and `/api/tracks` endpoint. A read-only check of the active local database
confirmed real catalog rows such as Daft Punk's TRON soundtrack tracks.

Verified `pnpm check`, all 37 web tests, web typecheck, production web build, the
full 70-test monorepo suite (37 web, 28 server, 5 UI), and `git diff --check`;
all passed. Database schema validation was skipped because no schema or server
route changed. A browser visual pass could not run because Computer Use stopped
when it could not confidently determine Brave's current URL.

Changes remain uncommitted on `dev` alongside the existing source, disconnect,
logging, and documentation work; unrelated changes were preserved. No commit,
push, tag, publication, or deployment was performed. Known limits: likes are
in-memory, the track list uses the server's default available-only ordering,
and playback remains simulated. Next: visually verify the table at desktop and
mobile sizes, then connect the authenticated `/api/tracks/:id/audio` endpoint.

## Fullscreen toast anchoring

Fixed app-level toast placement in the playerless fullscreen Settings layout.
The shared toast viewport now follows the active Nuxt layout: it keeps the
existing player clearance in the main shell and anchors to the bottom edge in
fullscreen routes. A focused placement test covers default, Settings, false,
and custom layouts.

Verified all 37 web tests, web typecheck, targeted lint and formatting, the web
production build, and `git diff --check`; all passed. Database validation was
skipped because the schema is unchanged. No browser visual pass was run. Next:
trigger a toast in Settings at desktop and mobile widths to confirm the final
spacing against the viewport edge.

Changes remain uncommitted on `dev` alongside the existing library-player and
server work; unrelated files were preserved. No commit, push, tag, publication,
or deployment was performed.

## Server disconnect control

Added a Disconnect button to the right of the connected-server card in
Administration. It uses the bundled Basil logout icon, stacks below the address
on narrow screens, opens a Reka UI confirmation dialog naming the connected
server, and becomes disabled with a disconnecting label while the action runs.
Canceling the dialog preserves the current browser identity. Confirming clears
the server, session, and profile cookies, attempts to revoke the server-side
session, and returns to onboarding.

Added client coverage for `DELETE /api/auth/session`, icon pre-bundling coverage,
and settings regression assertions for card placement, confirmation-dialog
wiring, and local credential cleanup. Verified `pnpm check`, web typecheck, all
35 web tests, and `git diff --check`; all passed. A production build was
attempted but Nuxt reported that the checkout's active dev server already owns
the build lock, so it was skipped to avoid disrupting that process. Database
validation was skipped because the schema is unchanged. No browser
visual/interaction pass was run.

Changes remain uncommitted on `dev` alongside concurrent unrelated changes in
`apps/server/src/app.ts` and `apps/server/test/sources.test.ts`; those files were
preserved. No commit, push, tag, publication, or deployment was performed.
Known limit: if the server cannot be reached during disconnect, local identity
is still cleared but that remote session cannot be revoked and remains valid
until expiry. Next: visually verify the desktop and mobile card layouts and
exercise the server-unreachable path in a browser.

## Source deletion request and warning logs

Fixed the follow-up source-deletion failure after CORS was corrected. The shared
web API client was adding `Content-Type: application/json` to `DELETE` requests
that had no body, so Fastify rejected them with `FST_ERR_CTP_EMPTY_JSON_BODY`.
The client now adds the JSON content type only when a body is present; source
removal and session revocation remain authenticated requests without a content
type.

The server previously logged every completed response at `info`. Successful
HTTP requests are now logged at `debug`, while failed HTTP responses are
logged at `warn`; request method, URL, status, and response time remain
available in the Administration log. The log view now starts with `debug`,
`warn`, `error`, and `fatal` selected, hiding `trace` and `info` by default.
Added client assertions for headers with and without bodies, server coverage
for both request-log levels, and a settings assertion for the default filter.

Verified all 28 server tests, all 35 web tests, `pnpm check`, `pnpm typecheck`,
`pnpm db:validate`, `pnpm build`, and `git diff --check`; all passed. Changes
remain uncommitted on `dev` alongside concurrent disconnect work; no commit,
push, tag, publication, or deployment was performed.

## Source mutation CORS fix

Fixed source removal and drag-to-reorder from Settings when the web app and API
are on different development origins. The server previously relied on
`@fastify/cors` defaults, which advertise only `GET`, `HEAD`, and `POST`; browsers
therefore rejected the `DELETE` source-removal request and `PUT` order request
before either reached Fastify. The CORS policy now explicitly advertises `GET`,
`HEAD`, `POST`, `PUT`, `DELETE`, and `OPTIONS` while retaining the configured
origin and authorization/content/range header allowlists.

Added behavioral preflight coverage for both source mutations. Verified
`pnpm --filter @peridot/server test` (27 tests), `pnpm check`, `pnpm typecheck`,
`pnpm db:validate`, and `pnpm build`; all passed. `git diff --check` is recorded
after the final documentation edit. No browser interaction pass was repeated,
and the schema is unchanged. Changes remain uncommitted on `dev`; unrelated web
changes that appeared during verification were preserved. No commit, push, tag,
publication, or deployment was performed.

## Source change toasts

Added success toasts for source lifecycle changes in Administration. Adding or
removing a source includes the configured folder, URL, or integration label;
dragging to save a new order originally reported “Source order updated.”
Reordering is now silent and confirmed by the visible row order; add and remove
notifications remain. Notifications are emitted only after the corresponding
server request succeeds and use the shared app-level Reka toast manager.

Added behavioral coverage for all three toast messages and wiring assertions for
the Administration success paths.

Verified `pnpm --filter @peridot/web test` (34 tests), web typecheck, full
workspace lint, the web production build, `pnpm format:check`, and
`git diff --check`; all passed. Database validation was skipped because this
change does not affect the schema. No browser visual/interaction pass was run.
Changes remain uncommitted on `dev` alongside existing work; no commit, push,
tag, publication, or deployment was performed.

## Local source folder search

Added case-insensitive deep folder search to the local-files source picker. The
browser no longer limits results to branches that were already expanded:
matching folders are found recursively through the admin-only
`GET /api/admin/filesystem/search` endpoint and shown as flat selectable results
with their full paths. Input is debounced, superseded requests are aborted, and
stale responses are ignored. The server also stops recursive traversal when the
response connection closes.

Recursive search is bounded to 100 results, 25,000 scanned directories, 48
levels, and eight seconds, with at most twelve concurrent directory reads. It
does not follow symbolic links, skips platform virtual/system directories, and
returns a truncation flag when a bound stops the traversal. Added behavioral
coverage for a five-level nested folder match, result capping, query validation,
administrator access, API encoding, loading/error states, and accessible search.

Changes remain uncommitted on `dev` alongside existing work. No commit, push, tag,
publication, or deployment was performed. Verified `pnpm typecheck`, `pnpm test`
(26 server, 34 web, and 5 shared UI tests), `pnpm build`, targeted ESLint and
Prettier checks, and `git diff --check`. Database validation was skipped because
the schema is unchanged. The root `pnpm check` passed lint but stopped at
formatting because the unrelated pre-existing `toasts.ts` differs from Prettier;
that file was preserved. No browser visual/interaction pass was run. Next:
exercise the source search against Windows drives and a large mounted directory
to tune the bounds, then format the existing Administration files when their
owner is ready.

## App-level Reka progress and connection toasts

Added one app-level Reka UI managed toast provider in the bottom-right, above the
fixed player. Library scan state and polling now live in a shared composable, so
the persistent queued/running progress toast remains current after leaving the
Administration page. Poll updates refresh discovered/created/updated counts,
then the progress toast becomes a brief completion or failure notification.
Temporary scan-status read failures retry without stacking duplicate toasts.

While a server session is active outside onboarding, the root monitor checks
`GET /api/health` every ten seconds with a four-second timeout and requires the
exact Peridot health signature. Entering the disconnected state adds one
persistent error toast; a successful probe dismisses it. Stable Reka toast IDs
keep repeated health failures to a single notification. The shared scan
composable also keeps the Administration inline state and controls in sync.

Added behavioral tests for progress/completion/failure scan copy, active status
detection, exact health-signature validation, network failures, and root-level
toast/monitor wiring. Updated README and DECISIONS.md.

Verified `pnpm check`, `pnpm test` (24 server, 32 web, and 5 shared UI tests),
`pnpm typecheck`, `pnpm build`, and `git diff --check`; all passed. Database
validation was skipped because this change does not affect the schema. No
browser visual/interaction pass was run. Changes remain uncommitted on `dev`;
prior unrelated changes were preserved. No commit, push, tag, publication, or
deployment was performed.

Known limit: active scan state is tracked after a scan is started in the current
browser session. A full reload cannot rediscover an already-running server scan
because the current API exposes scans only by ID. Next: add an active-scan
lookup or SSE/WebSocket status stream, then visually exercise both toast states.

## Fullscreen settings with Administration, Plugins, and server sources

Added a fullscreen Settings area (`layout: "settings"`) with a category sidebar:
Account, Library, Playback, Plugins, and Administration. Plugins moved out of the
main navigation into Settings; `/plugins` redirects to `/settings/plugins`. The
Settings screen opens from a user avatar in the main header, replacing the old
Demo badge and the sidebar Settings link. The connected-server label and Change
server control live in the Settings sidebar.

The header avatar loads the signed-in user's Gravatar image using the MD5 hash
of their normalized email (`ts-md5`), falling back to the bundled Peridot logo
when no image exists or the request fails. The profile is kept in a same-site
cookie so the avatar renders without an extra profile fetch.

Administration manages sources — the places the server gets raw audio from. A
source is a local folder, an external URL, or a deferred integration (Spotify,
YouTube Music). The server gained a `Source` model and admin-only
`GET/POST /api/admin/sources`, `DELETE /api/admin/sources/:id`, and a bounded
`GET /api/admin/filesystem/tree` for lazy local-folder browsing. The sources
list is draggable (VueUse/SortableJS) and persists order through
`PUT /api/admin/sources/order`; removal is confirmed in a Reka alert dialog and
adding opens a Reka dialog that first asks for the kind, then shows a folder
tree, a URL field, or a deferred-integration note. Scanning walks every path
source, stores `sourceId` on each track, and audio streaming resolves a track
through its source. The first path source seeds from `MUSIC_LIBRARY_PATH`.
Administration also shows a live server log: Fastify's pino output is captured
in a bounded in-memory buffer and served only to administrators through
`GET /api/admin/logs?after=<id>`, which the page polls every two seconds.

Verified `pnpm check`, `pnpm typecheck`, `pnpm test` (24 server, 28 web, 5 shared
UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`; all passed. No
browser visual pass was run. Changes remain uncommitted on `dev`; prior unrelated
changes were preserved. No push, tag, publication, or deployment was performed.

Known limits: Account, Library, and Playback are placeholders; Plugins remains a
placeholder under Settings. URL and integration sources are stored but not
fetched yet. Host, port, database URL, and web origins are still
environment-only. Next: implement URL-source fetching, then account/profile
settings, then wire the real library client to the stored session.

## Email/username/password profile

Replaced the display-name account field with a required, unique email address so
a profile consists of email, username, and password. The server validates and
normalizes email at bootstrap, returns email in the user response, and accepts
either the username or the email address at sign-in. Onboarding now collects an
email for the first administrator and presents a single username-or-email
sign-in field. A new migration rebuilds the users table; existing local rows
get a placeholder email derived from their username so sessions remain valid.
Server and web tests were updated and bootstrap email-validation and email
sign-in cases were added.

## Unknown-route home redirect

Added a Nuxt catch-all page so unknown web routes replace the current history
entry with the home page instead of rendering a not-found screen. Existing
server/session middleware remains authoritative, so the home route continues to
send unconfigured or signed-out users through onboarding. Added a focused route
regression test. Changes remain uncommitted on `dev`; unrelated working-tree
changes were preserved. Verification results follow below.

## Development connection-refused fix

Reproduced `pnpm run dev` serving Nuxt successfully while the API port 17430
refused connections. The server watch process had exited because the root quick
start did not supply the newly required `DATABASE_URL` and
`MUSIC_LIBRARY_PATH`; Turbo left the web task running and obscured the failure.

Development startup now applies committed migrations, defaults storage to
`apps/server/peridot.db` and `apps/server/music`, and creates the music directory
when needed. User-provided development paths remain authoritative, while built
server startup still requires explicit storage configuration. Migrations run
before Turborepo starts its persistent tasks, and the server uses Node's native
watch mode with the tsx import hook; both avoid Windows child-process stalls seen
when Prisma or the tsx CLI watch wrapper ran concurrently under Turbo. Added
behavioral coverage for defaults, directory creation, and override preservation.
The exact root `pnpm run dev` command then applied both migrations, started the
API and Nuxt together, and remained healthy. HTTP checks returned 200 from the
web root, server health endpoint, and authentication status endpoint; the latter
reported the expected first-administrator setup state. `pnpm check`, full
typecheck, all 12 server tests, all 18 web tests, all 5 shared UI tests,
`pnpm db:validate`, the production build, and `git diff --check` passed. No
browser visual pass was performed. Changes remain uncommitted on `dev`; no push,
tag, publication, or deployment was performed.

## Shared animated brand spinner

Added a reusable `PeridotSpinner` component to the shared UI package around the owner's
animated `spinner.svg`. It exposes a customizable status label and standard
Tailwind class sizing. The component hides the animation and shows the static
brand mark for reduced-motion users. Onboarding network discovery now uses the
shared spinner instead of rotating a generic refresh icon.

Added shared UI SSR coverage for the animated asset, accessible status text,
class overrides, and reduced-motion fallback. README and the durable component
decision are updated. `pnpm test` passed (11 server, 17 web, and 5 shared UI
tests), as did `pnpm typecheck`, `pnpm build`, `pnpm check`, and
`git diff --check`. Unchanged tasks used the Turbo cache. Database validation was
not repeated because this change does not affect storage. No browser visual pass,
commit, push, publication, or deployment was performed. Changes remain
uncommitted on `dev` alongside the owner's existing work.

## Windows first-render dev crash fix

Reproduced the reported `@peridot/web:dev` exit `3221226505` (`0xC0000409`). The
process reached Ready, then Vite discovered the route-level Iconify imports and
linked `@peridot/ui` dependencies during the first onboarding render; its runtime
dependency optimization immediately terminated the Windows Node process. Added
the direct imports and shared UI entries to `vite.optimizeDeps.include`.
Because Vite resolves optimizer entries from the web workspace, the four runtime
packages owned by shared UI are also declared as web development dependencies;
they remain normal runtime dependencies of `@peridot/ui`.

The exact root `pnpm dev` workflow was rerun with a migrated disposable database.
Both tasks reached Ready, onboarding and the discovery API returned HTTP 200, and
the process stayed alive beyond the previous crash point without dependency
warnings. It was then stopped. `pnpm check`, web typecheck, all 17 web tests, web
production build, and `git diff --check` passed. No push or deployment occurred.

## Primary gradient onboarding background

Implemented the full referenced shadcn.io-style Gradient container and applied it
to the fullscreen onboarding screen. Five radial blobs move independently on
their horizontal and vertical axes at non-matching 15–26 second base durations,
with configurable colors, intensity, speed, and film grain. The blobs use eased
transparent radial stops without blur filters. The decoration ignores pointer
input, is hidden from assistive technology, and becomes still when the user
prefers reduced motion.

The owner explicitly approved this component as an exception to the no-custom-
styling rule. Its scoped CSS, animation keyframes, generated CSS variables, and
inline static noise tile are contained inside Gradient.vue and the exception does
not extend elsewhere. Onboarding explicitly passes only `var(--primary)`, which
is also the component's product default for all five blobs. Shared UI SSR coverage
verifies the API, five primary blobs, grain toggle, semantic main element,
decorative accessibility, and foreground content layer. Web styling coverage
guards both the exception boundary and primary-only onboarding configuration.

Verified `pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 18 web, and
5 shared UI tests), `pnpm build`, and `git diff --check`. Unchanged tasks used
the Turbo cache. The production build emitted the scoped onboarding animation
stylesheet successfully. The browser-access host remained unavailable, so no
visual browser pass was completed. No schema validation was run because this
change does not affect the database. Changes remain uncommitted on `dev`; no
push, tag, publication, or deployment was performed.

## Shared favicon and onboarding logo

Exposed the owner-supplied shared brand directory through `@peridot/ui`, set
`favicon.png` as the global web favicon, and replaced the onboarding text mark
with `logo.svg`. The source files remain in `packages/ui/src/assets/brand`; Vite
inlines them into the production output, so no duplicate files or external
requests were added. The other supplied brand images remain available but are
not used yet.

Added a web test covering both shared asset imports. Web typecheck, all 16 web
tests, the production web build, production SSR verification of the favicon and
logo, formatting, and `git diff --check` passed. The temporary production server
was stopped. No browser visual pass, commit, push, or deployment was performed.

## Automatic local server discovery

Server selection now continuously probes the typed address after a short debounce
and automatically scans localhost plus the Nuxt host's private IPv4 `/24` networks
for the exact Peridot health signature on port 17430. Discovery is bounded to up
to three local subnets, uses concurrent short-timeout probes, coalesces calls for
ten seconds, and repeats automatically while the selection step remains open.
The endpoint does not accept caller-selected targets or ports.

Found servers appear as the only selectable actions. The manual Continue and scan
buttons were removed; clicking a listed server advances to administrator setup or
sign-in. A verified address typed into the field joins that list. The UI uses the
bundled Basil refresh icon as a scanning spinner and otherwise keeps discovery
labels concise with standard Tailwind and existing shadcn-vue variants.

Added tests for private-range filtering, subnet selection, port use, health
signature validation, same-origin discovery calls, and typed-address discovery.
`pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 15 web, and 3 shared UI
tests), `pnpm db:validate`, `pnpm build`, and `git diff --check` passed. A built
Nuxt smoke test scanned the detected private networks and found a temporary
Peridot health responder on localhost:17430; both temporary processes were
stopped. Browser-local subnet enumeration remains intentionally unsupported:
automatic subnet discovery reflects the Nuxt host's network, while the typed
address probe runs in the browser. No browser visual interaction pass was run.

## Required first administrator and onboarding authentication

Implemented the users/authentication foundation and removed the temporary
deployment-wide administrator token. The Prisma schema and second migration now
contain users and expiring sessions. Passwords are salted scrypt hashes, opaque
session tokens are stored only as SHA-256 hashes, and protected routes resolve a
real user session. An empty server returns `428 setup_required` for protected
operations, exposes setup status, and permits exactly one first-user bootstrap;
that user always receives administrator privileges. Bootstrap closes once any
user exists. Sign-in, current-user lookup, and session revocation are available.

Onboarding now connects to the selected server, reads its setup state, and then
either requires first-administrator creation or signs in an existing user. The
server address and 30-day session are persisted in same-site browser cookies.
Configured `PERIDOT_WEB_ORIGINS` controls browser API access. The new server and
onboarding default is port 17430. The old `PERIDOT_ADMIN_TOKEN` setting is no
longer accepted or documented.

Added behavioral coverage for mandatory setup, one-time bootstrap, administrator
assignment, password hashing, sign-in failures, authenticated current-user
access, revocation, CORS, the onboarding API client, safe network errors, and the
17430 defaults. `pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 11 web,
and 3 shared UI tests), `pnpm db:validate`, `pnpm build`, and `git diff --check`
passed. A fresh database applied both migrations, and the built server smoke test
confirmed health on 17430, unauthenticated setup enforcement, admin bootstrap,
and authenticated track access. The test server was stopped and its repository
temporary files were removed.

Current limits: only bootstrap and sign-in UI exist. Additional user creation,
role management, password changes/recovery, and a session-management UI remain
future work. The web music library is still fictional and does not yet use the
session to fetch real catalog data. All work remains uncommitted on `dev`; prior
unrelated changes were preserved, and no push, tag, publication, or deployment
was performed. Next: connect the real library client with the stored session,
then design administrator-managed user invitations and account settings.

## Fullscreen server onboarding and routed web app

Added a first-launch fullscreen onboarding screen at `/onboarding` that asks for
the user's Peridot server address. HTTP(S) addresses are normalized, credentials
and URL parameters are rejected, and the non-secret value is persisted for one
year in a same-site cookie. Global Nuxt middleware redirects unconfigured app
requests to onboarding and preserves the requested destination. The current
server can be changed from the sidebar. This frontend milestone intentionally
does not probe `/api/health` or fetch server data while the browser/API contract
is still being implemented; onboarding confirms address format, not reachability.

Replaced the single in-memory section switcher with Nuxt file routes for home,
library, liked songs, playlists, and plugins. The approved sidebar/content/player
layout is now shared, navigation uses real links and URLs, and demo player,
search, and liked state survives client-side route changes. No theme tokens,
custom CSS, dependencies, or server files were changed by this work.

Verified frontend ESLint, web typecheck, all nine web tests (including new server
address normalization/rejection coverage), production web build, and git diff
checks. Production HTTP smoke tests confirmed the unconfigured 302 with preserved
redirect, standalone onboarding 200, and SSR 200 plus expected content for all
five configured routes. The temporary production server was stopped. Full root
lint remains blocked by an unrelated unused `waitForScan` helper in the owner's
uncommitted `apps/server/test/library.test.ts`; that server work was preserved.
No browser screenshot/visual interaction pass, schema validation, push, deploy,
or commit was performed. Next: connect the stored address to a typed API client
once the server contract and browser access policy are ready, then add connection
status/error handling and replace demo library data.

## Local library server vertical slice

Implemented the backend-only local library milestone. The Fastify server now
validates its SQLite URL, one music root, and a minimum-length administrator
token; public health remains independent of the database. Prisma 7 uses the
maintained better-sqlite3 adapter and a committed initial migration. Protected
APIs create and inspect persistent asynchronous scans, list real catalog tracks,
fetch a track, and stream original audio with HEAD and single-byte-range support.

Scanning supports MP3, M4A/AAC, OGG/Opus, WAV, and FLAC, skips symlinks, uses
bounded metadata parsing, avoids reparsing unchanged files, preserves existing
metadata on parse failures, and marks missing files unavailable only after a
successful traversal. Scan conflicts, interrupted jobs, sanitized failures,
path containment, and missing files are handled explicitly. Filesystem paths and
statistics are never returned by API contracts. The web preview remains
fictional and unchanged.

Behavioral server tests use disposable SQLite databases and generated WAV data;
they cover configuration, authentication, scan lifecycle and reconciliation,
metadata failures, symlink exclusion, range streaming, missing files, failed
traversal, and conflicts. Final verification results are recorded at the end of
this entry. `pnpm check`, `pnpm typecheck`, `pnpm test` (eight server, nine web,
and three shared UI tests), `pnpm db:validate`, `pnpm build`, a fresh-database
`pnpm db:migrate:deploy`, built-server HTTP smoke checks, and `git diff --check`
all passed. The smoke check returned public health 200, protected catalog 401
without a token, and catalog 200 with a token; its process and temporary files
were stopped and removed.

Concurrent uncommitted web and lint-configuration changes appeared during the
server work and were preserved untouched. Server changes also remain uncommitted
on `dev`; no push, tag, publication, or deployment was performed. Next: review
the API and temporary authentication boundary, then connect the web application
without exposing the administrator token; replace it with user sessions in the
users milestone.

## Personal information cleanup

Replaced the demo profile name and initials with generic labels. Removed local
checkout paths, account-specific remote URLs, timezone, and private conversation
references from project documentation. Existing unrelated work is preserved;
changes remain uncommitted on dev. Git history and local Git metadata are outside
this file cleanup and may retain identifying information. No push or deployment.
Next: review the cleanup diff before committing; separately assess history cleanup
if older commits will be shared.

Verified: targeted personal-information scan found no remaining matches in source
and documentation; changed-file formatting, lint, web typecheck, all three web
tests, web production build, and git diff --check passed. No behavioral tests were
added for static text replacements. Server/schema checks and browser visual QA
were skipped because this change only affects documentation and demo labels.

## Windows dev-script toolchain fix

Diagnosed missing pnpm on PATH; Node 24.15.0 and Corepack were installed.
Default corepack enable failed with EPERM writing Program Files/nodejs/pnpm.CMD.
Enabled only pnpm shims in the existing user npm bin directory (APPDATA/npm),
already on PATH, without changing PATH or requiring administrator rights.
pnpm --version now resolves 11.25.0. Verified root pnpm dev starts Nuxt on 3000
and Fastify on 3001; both HTTP endpoints returned 200. Stopped the verification
run with Ctrl+C so the owner can run it. README documents the Windows setup.
No app code or dependencies changed for this fix; app tests/build/schema were
not repeated. All prior changes preserved, no commit/push/deployment.

## Poppins main font

Owner specifies Poppins as the main UI font. Updated both theme sans tokens,
PROJECT.md, DECISIONS.md, and README. Bundled Latin 400/500/600/700 weights locally
through @fontsource/poppins with swap loading; lockfile updated. Rounded preview
650/750 weights to loaded 600/700. Artwork-specific serif styling remains.
Verified pnpm check, build (all four local WOFF2 assets emitted), and git diff
--check. Types/tests/schema were not rerun for this font/CSS-only change. Browser
visual QA remains unavailable. No new behavioral tests needed. Work remains
uncommitted on dev, prior changes preserved; no push/deployment. Next: visually
review typography at desktop/mobile sizes, then continue the library milestone.

## Owner-supplied hex theme and updated specification

Applied the owner's final Tailwind hex configuration. Shared tokens contain the
complete light/dark palettes, font stacks, sidebar/chart colors, radii, and
shadows. Shadow colors also use hex alpha notation. The web stylesheet retains
the supplied utility mappings and base rules plus the monorepo source scan.
Dark mode is applied to HTML. Removed the app-level root palette overrides and
connected main surfaces, selected navigation, and the logo to theme tokens;
illustrative album/hero colors remain artwork-specific.

Owner explicitly confirmed that Tailwind primary overrides the earlier brief:
dark primary is #00A63E, light primary #171717. Updated PROJECT.md and DECISIONS.md
to make this authoritative, including supplied fonts and radius. The earlier
#46B54A theme statements below are historical and superseded.

Verified the final hex configuration with pnpm check, build, git diff --check,
and a direct comparison of all 64 supplied hex palette tokens. HTTP 200 and the
HTML dark class passed. Typecheck and all seven tests passed immediately before
the final equivalent hex token replacement; no behavior changed afterward.
Schema checks were skipped because storage/server code is unchanged. Browser
visual QA remains unavailable. No new test files for this styling-only update.
Preview remains at http://127.0.0.1:3000/. All changes are uncommitted on dev;
existing unrelated changes preserved, no push/deployment. Next: visually review
the theme and keyboard controls, then continue the local library milestone.

## shadcn-vue correction

The preview now uses actual official shadcn-vue registry components in the shared
UI package: Button for every interactive action, Input for search, Badge for
preview indicators, and Slider for seek/volume. Components are built on Reka UI;
Tailwind CSS 4 is configured through its Vite plugin, with an explicit shared UI
source scan. Shared tokens initially retained primary #46B54A (now superseded above) and include the shadcn semantic
colors. Nuxt imports shared components through explicit package exports. Registry
configuration is tracked in both workspaces. Added an optional thumbLabel prop
so each slider's interactive thumb has an accessible name. Copied code retains
its upstream MIT notice; Peridot metadata and LICENSE remain Apache-2.0.

Verified frozen-lockfile installation, pnpm check, typecheck, test (three UI SSR
cases, three library cases, and the existing server test), build, and git diff
--check. Unchanged Turbo tasks used cache. The HTTP preview returned 200 with 29
shadcn buttons, one input, two sliders, and two badges. UI tests cover native
disabled buttons, initial search model/label, and slider initial progress plus
bounds/label. Reka initializes thumb position/current-value ARIA after hydration;
SSR checks do not claim to test client interaction. Browser visual and keyboard
QA remain unverified because the browser host was unavailable earlier in this
session. Schema validation was not repeated: no schema/server changes here.

Local web preview restarted at http://127.0.0.1:3000/. Changes remain uncommitted
on dev, with earlier unrelated changes preserved. Lockfile includes new UI and
Tailwind dependencies. No push or deployment. Next: visually review desktop and
mobile, exercise slider keyboard controls, then proceed with the real local
library slice. The earlier custom-only preview is superseded by this correction.

## Interactive web design preview

Replaced the static Nuxt shell with a responsive dark music dashboard: sidebar,
featured mix, five fictional album covers made in CSS, recent tracks, library
search, favorites, playlist placeholders, optional-plugin cards, and a persistent
simulated player with seek, skip, and volume controls. All assets are local;
no external requests, credentials, or audio files are used. Demo state resets on
reload. The logo is an initial organic SVG sketch, not finalized brand geometry.

Added three behavioral tests covering search, favorites filtering with stable
playback indexes, and reversible favorite changes. README describes demo limits.
Verified pnpm check, typecheck, test (three web cases and existing server test),
db:validate, build, git diff --check, and HTTP 200 with expected server-rendered
preview content. Some unchanged Turbo tasks used cache. Browser automation host
was unavailable: no screenshot, visual responsive QA, or browser interaction test
was completed. CSS includes mobile breakpoints and reduced-motion handling.

Preview started at http://127.0.0.1:3000/ using the web dev script. pnpm was not
on PATH; used Corepack 11.25.0 with shims in the system temporary directory for
nested scripts. No repository toolchain configuration was changed for this.
Work remains uncommitted on dev; prior tooling and documentation edits preserved.
No push or deployment. Next: review design in a browser, refine shared components
and icons, then implement the local library vertical slice with real storage/auth.

## Code linting and formatting update

Added root ESLint flat configuration for JavaScript, TypeScript, and Vue, using
recommended JS/TS and essential Vue rules. Existing Prettier commands are retained
with explicit default settings and eslint-config-prettier compatibility. Added
lint, lint:fix, and check scripts, a CI lint step, and README usage instructions.
Generated/build/dependency files are excluded. All work remains uncommitted on dev;
existing commitlint and other working-tree changes were preserved.

Verified: frozen-lockfile installation, pnpm check, pnpm typecheck, pnpm test,
and git diff --check passed. In-memory invalid TypeScript and Vue examples were
correctly rejected by ESLint without adding test files to the repository.
No application behavior was changed; application builds and database schema
validation were not rerun for this tooling-only change. CI has not run on GitHub.

## Commit linting update

Added commitlint with Conventional Commits rules, a Husky commit-msg hook,
automatic hook installation through prepare, and pull request commit-range CI.
README documents accepted messages and manual checks. Work is uncommitted on dev;
no commits or pushes were made.

Verified: frozen-lockfile installation, valid/invalid message checks through both
the CLI and installed hook, formatting, and git diff --check. Git hooks are active
in this clone. GitHub CI has not run. Application types, tests, database validation,
and builds were not rerun because application code was unchanged.

## Repository and workflow

Initial baseline: c783498. All foundation changes are currently uncommitted on dev.
No commits, pushes, tags, deployment, or release publication were performed.

Owner policy: dev is development; master is beta; Git tags are releases.
Verify the Git root before running commands, especially on another machine.

## Project context

Read PROJECT.md for product and architecture requirements before starting work.

## Completed foundation

- pnpm 11.25.0 workspaces, Turbo tasks, pinned lockfile, Node 24 requirements.
- Nuxt 4 dark web shell and shared brand tokens.
- Fastify server, health endpoint, graceful shutdown, and behavioral health test.
- Strict TypeScript packages for API contracts, player state, plugin manifests.
- Prisma 7 SQLite catalog schema and validation/generation scripts.
- Desktop, official plugins, and infrastructure roadmap directories.
- CI for development/beta/version tags; formatting and repository hygiene.
- README setup instructions, agent conventions, project brief, and decision log.

## Verification performed

On Windows with Node 24.15.0 and pnpm 11.25.0:

- pnpm install --frozen-lockfile: passed after explicitly configuring required
  dependency build scripts via pnpm 11 allowBuilds.
- pnpm format:check: passed.
- pnpm typecheck: passed for five TypeScript projects.
- pnpm test: passed (health payload, HTTP status, unknown route).
- pnpm db:validate: passed.
- pnpm build: passed for web, server, and three shared TypeScript packages.
- Built server and built Nuxt app startup: HTTP responses passed on temporary
  loopback ports 43101/43102. Verification processes were stopped afterward.
- git diff --check: passed.

CI is configured but has not run on GitHub. No browser visual QA was performed.

## Known limits

The web shell is now an interactive fictional preview. Real playback, library scanning, authentication, database
runtime/client, migrations, marketplace, isolation, provider integrations,
OpenSubsonic and desktop packaging are not implemented.
The SDK is an early type contract, not a stable API or secure execution runtime.
SQLite is provisional. No external credentials or hosted services are required.

## Next milestone

Implement a local library vertical slice: administrator-configured music folder,
track scanning and persistence, library API/UI, then authenticated audio playback.
First decide the storage/auth boundary and validate the schema before creating a
migration. Add relevant behavioral tests and update README setup commands.

Preserve BYOK/BYOS and plugin isolation requirements. Finalize the organic
three-corner SVG logo and reduced-motion spinner when building UI components.

## Resume prompt

Continue Peridot from AGENTS.md and docs/HANDOFF.md on dev. Read PROJECT.md,
inspect the working tree, preserve changes, and implement the next milestone.

## License update

Owner confirmed Apache 2.0. Added the official Apache LICENSE text, set all
workspace package license fields to Apache-2.0, and documented it in README and
agent conventions. Formatting and diff checks passed.

## 2026-11-10: Basic token-driven music layout

Replaced the custom editorial preview CSS with standard Tailwind utilities and
shared shadcn-vue Button/Input/Badge/Slider variants. Layout has a sidebar,
scrollable main screen, and a fixed bottom player with matching reserved space.
Mobile navigation has a labeled toggle and close control. Removed decorative
hero/artwork palettes and style overrides; shared theme tokens and Poppins are
unchanged. Search, favorites, track selection, simulated transport, seek, and
volume remain. Playlist/plugin screens explicitly show their pending status.
Saved the owner's no-custom-styling rule in AGENTS.md and DECISIONS.md.

Changes remain uncommitted on dev with previous unrelated edits preserved.
No push, tag, publication, or deployment. Real audio and persisted data remain
pending. Next: review the responsive layout, then continue the local library
vertical slice. Verification results are recorded below.

Verified: pnpm check, pnpm typecheck, pnpm test (seven existing tests), and
pnpm build passed; unchanged tasks used Turbo cache. Added a styling guard test
rejecting custom CSS blocks, inline styles, arbitrary Tailwind values, and local
color literals; all four web tests passed afterward. Production HTTP smoke check
returned 200 with navigation, main content, player controls, search, and mobile
toggle. git diff --check passed. Browser visual/keyboard checks were not run;
responsive behavior still needs visual review. Schema validation skipped because
no schema/server changes were made. No dependencies or lockfile changes in this
layout update.

## 2026-11-10: Iconify UI icons

Replaced every text-symbol UI icon with locally bundled Iconify andrsrxn SVGs,
including andrsrxn:play, pause, skip/restart controls, favorites, navigation,
menu/close controls, and music placeholders. The offline Vue renderer imports
individual icon data; no icon API or external runtime request is needed. Icons
inherit semantic colors and use existing shadcn/Tailwind sizing. Saved the icon
rule in AGENTS.md and documented the dependency choice in DECISIONS.md/README.
Added @iconify/vue and @iconify-icons/andrsrxn to the web package and updated
pnpm-lock.yaml; upstream MIT licensing stays in the dependency packages.

Verified pnpm check, typecheck, and test (ten total tests, including two new
Iconify SSR tests). Tests cover bundled SVG output for every registered icon,
decorative accessibility, Tailwind sizing, exact andrsrxn:play data, and distinct
play/pause output. Production build and HTTP verification results follow below.
Schema validation skipped because no database/server changes were made. Browser
visual/keyboard QA was not run. Changes remain uncommitted on dev with unrelated
work preserved. No push, tag, or deployment. Next: visually review the icons and
continue the local library vertical slice; real audio remains unimplemented.

Production build passed. HTTP smoke check passed with 200, the exact
andrsrxn:play SVG body in initial HTML, accessible play-button label, and no
remaining text-symbol icons. git diff --check passed.

## 2026-11-10: Basil play-solid replacement

Switched the bundled play icon to basil:play-solid per owner request. Other UI
icons retain andrsrxn. Added @iconify-icons/basil and updated pnpm-lock.yaml;
updated the exact-icon SSR test, AGENTS.md, README, and DECISIONS.md. Offline
rendering, semantic colors, and standard Tailwind/shadcn sizing are preserved.
No custom styling added. Changes remain uncommitted on dev, with unrelated
work preserved; no push or deployment. Next: visually review the new play icon,
then continue the local library milestone. Browser visual QA and schema/server
checks are skipped for this icon-only change. Check results follow below.

Validation initially caught an accidental playlist import replacement; corrected
it back to andrsrxn/playlist. Final lint/format checks, web typecheck, and all six
web tests passed. git diff --check passed. Production build result follows.

## 2026-11-10: Basil across the UI

Owner expanded the icon choice to Basil for every UI icon. All navigation,
favorites, placeholders, mobile menu/close, and transport icons now use bundled
@iconify-icons/basil data. Removed the unused andrsrxn dependency and updated
the lockfile, AGENTS.md, README, and DECISIONS.md. The earlier play-only entry is
superseded. Existing offline SVG tests cover every icon and the exact
basil:play-solid selection. Previous play-only production build passed; final
library-wide verification results follow below.

No custom CSS or theme changes. Work remains uncommitted on dev; unrelated
changes preserved. No push or deployment. Schema/server checks and browser
visual QA skipped for this icon-only update. Next: visually review Basil icons,
then continue the local library milestone.

Final Basil-only verification passed: pnpm check, web typecheck, all six web
tests, production web build, and git diff --check. No andrsrxn references remain
in app source, web dependency metadata, lockfile, or current contributor/README
rules; older decision/handoff entries remain historical.

## 2026-11-10: Main header search placement

Removed the section title from the main panel's top header and moved search to
the left. Sidebar and content heading remain unchanged. Added a locally bundled
Basil search-outline icon inside the search field, with standard Tailwind
positioning/padding and semantic muted-foreground color. The decorative icon is
hidden from assistive technology and does not intercept pointer input; the input
retains its accessible name and search binding. No custom styling added.

Work remains uncommitted on dev; unrelated changes preserved. No dependency
changes, push, or deployment. Browser visual QA, separate typecheck, and schema/
server checks skipped for this presentation-only update. Existing search tests
and the icon SSR suite cover filtering and the new icon's server rendering;
no new behavioral test needed for positioning. Next: visually review the header
on desktop/mobile, then continue the local library milestone. Results follow.

Verified: pnpm check, all six web tests, production web build, and
git diff --check passed for the final search placement/icon change.

## 2026-11-10: Larger player and favorite controls

Enlarged album favorite buttons and bottom player controls from shadcn icon-sm
to icon-lg, with explicit Tailwind size-6 Basil icons. The primary play/pause
button uses size-12 for emphasis. Sidebar icons and controls remain unchanged.
All sizing uses standard utilities and existing variants; no custom CSS or theme
changes. Existing favorite/playback behavior is unchanged, so no new behavioral
tests were added. Lint/format and all six web tests passed; build result follows.
Separate types, schema/server checks, and browser visual QA skipped for this
size-only update. Work remains uncommitted on dev with unrelated edits preserved;
no push/deployment. Next: visually review larger controls at desktop/mobile sizes,
then continue the local library milestone.

Production web build and git diff --check also passed.

## 2026-11-10: Silent empty server discovery

Removed the onboarding network discovery empty-result message. When a completed
scan finds no servers, the section now stays empty; active scans still show the
spinner, discovered servers remain selectable, and discovery failures retain
their existing notice. Added a source regression assertion preventing the
"No servers found" message from returning. Changes remain uncommitted on `dev`;
unrelated working-tree changes were preserved. All 18 web tests, web typecheck,
targeted formatting, and `git diff --check` passed. Schema validation, production
build, and browser visual QA were skipped because this is an isolated empty-state
presentation change. No commit, push, publication, or deployment was performed.

## 2026-11-10: Larger player progress hit target

Added a 44px minimum-height invisible hit area to the bottom player's progress
slider while preserving the existing 6px track and 16px thumb. The shared
Slider component and volume control are unchanged. A player regression assertion
now covers the player-only target class.

All 59 web tests, web typecheck, targeted ESLint/Prettier checks, the production
web build, and `git diff --check` passed. Schema/server checks were skipped
because no server or storage code changed. Browser visual QA was not run.
Changes remain uncommitted on `dev` with unrelated work preserved. No commit,
push, publication, or deployment was performed. Next: visually confirm pointer
seeking near the top and bottom edges of the progress row.
