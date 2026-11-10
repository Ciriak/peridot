# Handoff

Last updated: 2026-11-10.

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
dragging to save a new order reports “Source order updated.” Notifications are
emitted only after the corresponding server request succeeds and use the shared
app-level Reka toast manager.

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

Added a reusable `Spinner` component to the shared UI package around the owner's
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
