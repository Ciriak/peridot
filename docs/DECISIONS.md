# Decisions

## 2026-11-13: Whole-album offline saves reuse the per-track manifest

An album is not stored as a separate offline bundle. The album action loads
every cursor page for the release, then saves each available track that is not
already present through the existing per-track audio, artwork, and manifest
path. This keeps offline playback, eviction, partial saves, and scope cleanup
consistent with individually saved tracks. Tracks are downloaded sequentially
to avoid saturating the server or browser quota, and existing copies are skipped
so an interrupted album save can resume by selecting the same action again.

The album action also removes every saved track in the release once all summary
tracks are cached. Individual track and whole-album saves intentionally produce
no success toast; the icon and progress state provide immediate feedback, while
failures retain their error notification.

## 2026-11-13: Sidebar brand mark is embedded in the offline application bundle

The small sidebar logo is imported as an inline Vite asset. The service worker
precaches hashed image files, but an inline logo has no second offline asset
lookup that can fail independently from the application shell. The payload is
small and uses the same source asset, so the sidebar brand remains available
without adding custom styling or changing the server.

## 2026-11-13: Development startup builds runtime workspace contracts

The root development command builds `@peridot/contracts` before starting the web
and server watch processes. The package publishes its source types but resolves
runtime imports through `dist`, so starting from a checkout with ignored, stale
generated output could otherwise fail on newly added runtime exports. Building
the contract package at startup makes a fresh clone and an existing clone behave
the same without committing generated files.

## 2026-11-12: Desktop prototype uses Tauri around the shared Nuxt client

The first desktop application is a Tauri 2 shell in `apps/desktop`. Development
loads the normal Nuxt dev server, while production statically generates the
existing client and embeds those assets in the native executable. This keeps one
Vue UI and avoids creating a desktop-only presentation fork while the client is
still changing quickly.

The Fastify server remains a separate process and authority. The packaged shell
connects to a user-selected server instead of loading that server's frontend code
or embedding the API in the webview. The prototype exposes only Tauri's core
capability; filesystem, shell, HTTP, credential, and plugin permissions are not
granted to the desktop window.

The server's default origin allowlist includes the exact Tauri webview origins on
Windows, macOS, and Linux. These origins apply to both CORS and realtime socket
validation. The packaged app therefore uses no web-security bypass and receives
no broad cross-origin privilege.

## 2026-11-12: Albums use release identity and separate album artists

Album identity is independent from a track's performer credits. The catalog
uses a provider release ID first, embedded album artists plus album title
second, and source folder plus album title as the final fallback. If an
unmatched track shares a folder and title group with exactly one provider
release, it joins that release. Multiple release IDs in one folder are kept
separate rather than guessed.

Albums display release-level artists from MusicBrainz or Discogs, with embedded
`albumartist`/`albumartists` tags as the local source and the existing track
credit behavior only as a final display fallback. Track rows retain their full
performer credits and artist links. Track responses expose the canonical
`albumId`, and album navigation, offline collection playback, Quick picks, and
album likes use that ID instead of comparing title and track artist.

The catalog projection version is now 3 and the scanner metadata version is 4.
This development reset intentionally does not preserve prior catalog, likes,
queue, account, provider, or source data.

## 2026-11-12: Connection recovery is announced with a success toast

The topbar connection warning uses the owner-selected `ooui:network-off` icon
with the standard foreground color. It keeps its reduced-motion-safe pulse and
tooltip, but neither the icon nor the tooltip uses destructive red.

The app-level notifications component watches server reachability only inside
an authenticated, non-onboarding scope. A transition from `lost` to `connected`
shows a five-second `Back online` success toast. Initial reachability checks,
onboarding discovery, and connection loss itself do not create this toast.

## 2026-11-12: Quick-pick rows link names and reuse item context menus

Quick-pick names are navigation controls rather than labels. A track's type icon
and title share one link to the track's anchored row on its album detail page,
because the catalog has no standalone track-detail route. A track without album
metadata links to its primary artist page instead. Album quick-pick titles link
to album details, and every artist credit links to its derived artist page.
Artwork remains the separate playback control.

Each row is wrapped by the existing `TrackContextMenu` or
`AlbumContextMenu` instead of defining a reduced quick-pick-only menu. This
keeps playback, queue, favorite, download, navigation, and metadata actions
consistent across the app.

## 2026-11-12: Player loading uses a reversible primary ray

The persistent player uses a full-width, decorative primary ray along its top
edge to communicate preparation and buffering. The ray continuously crosses
from left to right and back while `loading` is true, using standard Tailwind
transform and transition utilities driven by the existing shared playback
state. The seek slider retains `aria-busy` but no longer pulses, so transient
buffering no longer makes the interactive timeline appear to flicker.

Reduced-motion users receive a static primary line instead of the traversing
ray. The animation is hidden from assistive technology because `loading` is
already exposed by the play control and seek slider.

## 2026-11-12: Playback carries known track metadata across the active-track change

Playback entry points pass complete `TrackResponse` objects to the player when
the catalog or queue already has them. The player merges those details into its
resolved queue before changing the active queue ID. This keeps the foreground
title, credits, artwork, and duration synchronous with the selected track and
avoids a transient ID-only or previously active state while a second detail
request completes.

Whole-album and whole-artist collection loaders therefore return track responses
instead of discarding the loaded metadata and returning IDs only. String track
IDs remain accepted at the player boundary for older or partial callers, but
the active-track selector returns no track rather than substituting the first
resolved queue row when an explicitly active ID is not yet available.

## 2026-11-12: Cached query data takes precedence over refresh failures

Persistent server-state queries use blocking loading only while no query data
exists. Once TanStack Query has data, later fetches are background refreshes and
must not replace the page with a loading or fatal error state. A failed refresh
may update the underlying query status to `error` while retaining its data, so
the UI derives blocking loading and visible errors from the presence of cached
data rather than from `isPending`, `isFetching`, or `error` alone.

Album and artist detail pages initialize their page state from the cached match
query instead of setting a separate loading flag and forcing a refetch on every
mount. Returning to a previously visited detail page therefore renders the
known album or artist immediately. Cold IndexedDB restoration can still show a
loading state until the asynchronous storage read completes.

## 2026-11-12: Development serves generated PWA assets

Nuxt PWA development serving is explicitly enabled. Without `devOptions`, the
development server leaves both the manifest route and generated service worker
request to the SPA fallback, which returns HTML that browsers cannot parse as a
manifest or execute as a worker. Development now serves the same configured
manifest as production, and the development service worker uses the temporary
Nuxt build directory configured by the integration.

Production remains generated only by the PWA build. This affects local
development diagnostics and registration behavior, not the public API, offline
cache data, or application state.

## 2026-11-12: Client-rendered PWA owns offline browsing and media

The web UI runs with Nuxt `ssr: false` while retaining the Nitro server for the
SPA document and `/api/discovery/servers`. Nuxt continues to own file routing,
layouts, i18n, shared component imports, and the deployment build. A generated
PWA service worker precaches the client shell, local assets, and a navigation
fallback, and caches signed track and artist artwork. API JSON is not placed in
Workbox runtime caches because TanStack Query owns its lifecycle and
invalidation.

Authenticated GET-backed UI state uses TanStack Vue Query. Query keys always
include the connected server and user ID but never the bearer token. The
official per-query IndexedDB persister stores visited query data indefinitely
and restores it when the Peridot request fails. Catalog and administrative
mutation responses update or invalidate the affected query prefixes, while
realtime catalog events invalidate catalog queries. Discovery, health,
filesystem browsing, and metadata-candidate searches are intentionally not
persisted.

Offline audio is explicit rather than predictive. A visible cloud icon beside
each track is the sole save action, separate from the normal file Download
action. It stores the original audio and available artwork in app-owned Cache
Storage under a server/user/track key and records metadata in IndexedDB. The
player attempts cached audio only after a typed network failure; authentication
and server rejections retain their normal behavior. Queue edits remain in the
existing local snapshot and the latest queue is retried after reconnection.
Other mutations are disabled while the server is unreachable.

Completing logout, disconnecting, invalidating a session, or changing the
server/user identity clears persisted queries, the saved-track manifest, and
offline audio and artwork caches. Browser quotas and eviction remain external
limits; Peridot applies no time-based expiry of its own.

## 2026-11-12: Catalog backfills defer until listen and yield between tracks

A catalog projection-version change must not delay the development server from
accepting requests. The server schedules its automatic projection backfill from
Fastify's `onListen` hook, after listening begins, and cancels a not-yet-started
backfill during `onClose`. Shutdown still awaits an in-flight backfill through
the catalog service.

The backfill also yields to a macrotask after reindexing each track. SQLite
promise continuations can otherwise keep refilling Node's microtask queues, so
the startup promise and incoming HTTP requests do not resume until the complete
projection rebuild has finished. The same yield applies to full projection
rebuilds used by metadata reset. A regression test requires pending event-loop
work to run before the backfill completes.

## 2026-11-12: Artist profiles preserve local identity while using provider names

Artist metadata is a profile overlay on the derived catalog artist rather than a
replacement for the file-tag identity. The file-tag name remains the artist ID
input, route parameter, like key, and stable fallback. A provider match instead
publishes a separate display name so canonical provider spelling and manual
correction do not break existing links or favorites.

Automatic artist matching runs after track matching in the existing
`metadata_fetch` task. The first exact unique provider match supplies the display
name, while provider traversal continues until an exact Discogs match supplies a
portrait. MusicBrainz-only installations therefore receive canonical names with
the existing placeholder image. Manual matches from any enabled provider replace
the complete profile, and restoring returns to the file-tag name and placeholder.

Artist portraits are downloaded into content-addressed SQLite rows and served
through short-lived artist-scoped URLs, matching the track-cover privacy model.
Only HTTPS JPEG, PNG, or WebP responses from Discogs hosts within the size limit
are accepted. Browser code never receives provider credentials or remote image
URLs, and resetting metadata removes cached portraits.

## 2026-11-12: Playback avoids queue-wide refreshes and repeat cover downloads

The shared track table initially mounts 30 rows and reveals further 30-row
batches as the main page approaches the end of the mounted list. Server cursor
pagination still bounds the loaded track pages, and the table never creates a
nested scroll viewport. This keeps a playback-state update from reconciling all
100 tracks in a default page and postpones artwork work for rows farther down
the page.

Queue hydration resolves only track IDs that are not already present in the
player's resolved queue details. Reordering, starting a track already in the
queue, and other queue mutations that reference known tracks preserve existing
track objects instead of fetching and replacing the complete queue. A catalog
revision still forces a full detail refresh so metadata changes propagate.

Artwork URLs are canonical per deduplicated cover ID rather than per track.
Signed cover tokens are reused for their four-hour validity window, so tracks
that share album artwork receive the same browser URL and image-cache entry.
The cover token remains scoped to that stored cover and cannot authorize audio
or another cover. This supersedes the earlier per-track cover URL contract.

## 2026-11-12: Player foreground updates immediately while its background fades

The persistent player keys both its foreground artwork and decorative cover
background by the resolved cover URL. A track-cover change replaces the visible
square artwork immediately while the blurred decorative background waits 150 ms
and then directly crossfades over three seconds. This keeps track metadata and
the foreground cover responsive without making the atmospheric color treatment
snap between songs.

The transition wraps only the decorative image, not the foreground artwork.
Outgoing and incoming blurred covers overlap rather than passing through an
empty frame, and standard Tailwind reduced-motion utilities remove the fade. The
decorative blur, cover-derived color, gradients, fallback behavior, and semantic
theme treatment remain unchanged.

## 2026-11-12: Track tables keep the main content as the only scroll owner

The shared track table renders its loaded cursor pages in normal document flow.
The button at the end of the table and an intersection sentinel request the next
server page; neither the table nor a nested wrapper has its own vertical or
horizontal scroll viewport. The main content region remains the only scrolling
owner, so the track list, headings, album cards, and other page content move
together behind the fixed player.

This restores the owner requirement that a screen inside the main frame never
has two scrollbars. Server pagination bounds loaded data, while 30-row
progressive batches bound the number of currently mounted rows so page-flow
rendering remains responsive for large libraries.

## 2026-11-12: Metadata provider activity uses a bounded task detail

Metadata matching publishes the ID of the provider currently being queried as
the shared `metadata.activeProvider` task detail before each provider request,
then clears it when that request finishes. This reuses the existing task
progress update and realtime paths without adding persistence columns or
provider-specific browser API calls. The detail contains only a local provider
ID and is hidden from the general Tasks detail list.

Provider rows use the detail to show a progress ring only while their own
request is active. This is intentional during fallback sequences, where several
enabled providers participate in one metadata task but only one is being queried
at a time.

## 2026-11-12: Progress values ease without masking reduced motion

The shared progress circle animates `stroke-dashoffset` on the indicator arc
when a finite value changes. The transition belongs to the arc itself because
the parent SVG owns the continuous rotation and does not pass that transition
to its children. Standard Tailwind motion utilities provide a 300 ms ease while
the reduced-motion variant removes the value transition and the motion-safe
variant suppresses rotation.

The visual arc always renders at zero first. After the component mounts, its
value is applied on the next animation frame so a newly displayed determinate
spinner fills from empty instead of appearing at its current percentage.
Returning to indeterminate progress resets the visual arc before any subsequent
determinate state begins.

This keeps frequent task-progress updates visually continuous without adding a
component stylesheet or a hardcoded animation. The accessible numeric value
still changes immediately. The progress ring, rather than the percentage text,
owns the visual transition.

## 2026-11-12: en-US localization uses structured client-owned messages

The complete user-visible runtime is localized through Nuxt I18n with `en-US`
as the only locale. The app uses the `no_prefix` strategy, disables browser
locale detection, sets the document language explicitly, and does not expose a
language selector or persist a locale preference. Existing URLs and the current
English wording remain unchanged.

The browser owns presentation copy. API errors, task titles/details/failures,
metadata-provider definitions, provider details, and realtime errors carry
stable message descriptors with optional interpolation parameters and plural
counts. The server does not negotiate locales, and the public contracts do not
carry duplicate English fallback strings. This project is still pre-release, so
older task-response shapes are not preserved.

Task title and failure descriptors are stored in nullable task columns so task
history survives future locale additions without rewriting stored prose.
Existing development task rows may be discarded; no compatibility migration is
provided. Shared UI primitives remain locale-neutral and require callers to
provide translated accessible labels.

## 2026-11-12: Administrators manage accounts through User Management

The administrator Settings navigation includes a dedicated `User Management`
page. Administrators can create members or other administrators, edit email and
display-name identity, reset passwords, promote or demote roles, and delete
accounts through administrator-only `/api/admin/users` CRUD routes.
Every create or password-reset form requires the new password to be entered
twice and disables submission until the entries match. Password confirmation is
validated in the browser and is never sent to the server.

Deletion uses the existing account relations to remove sessions and
user-owned likes, queues, and playback history without changing the audio
library. Authentication-affecting edits to another account revoke all of that
account's sessions and disconnect its realtime sockets. An administrator cannot
delete their own account, change their own role, or perform an edit that would
leave the server without an administrator. These rules are enforced by the
server as well as reflected in the UI.

## 2026-11-12: Email is the sole login identifier

User accounts now consist of a unique email address, a required display name,
and a password. Users sign in only with their normalized email address and
password; display names are presentation labels and never authenticate an
account. This supersedes the earlier username-or-email sign-in decision.

Display names preserve their capitalization, trim surrounding whitespace,
collapse internal whitespace, and must contain 2–80 Unicode code points. A
separate normalized display-name value enforces case-insensitive uniqueness, so
`Ada Lovelace` and `ada lovelace` cannot both be used. Signed-in users can update
their display name through `PUT /api/users/me`; their own email remains
immutable through Profile. Administrators can change another account's email
through User Management, where the new identity becomes that account's sign-in
address.

The breaking local schema replacement was completed by resetting the authorized
development database. Local accounts, sessions, catalog data, queues, likes,
sources, and settings were discarded, so a new administrator must be created.

## 2026-11-12: First administrator confirms the password

The first-administrator form asks for the password twice. The browser keeps the
confirmation value client-side, reports a mismatch inline, and disables account
creation until both entries match. The confirmation value is never included in
the bootstrap request; the server continues to validate and hash the single
password it receives.

## 2026-11-12: Settings calls the account area Profile

The common Settings navigation labels `/settings/account` as `Profile`, and the
page heading and header-avatar accessible label use the same term. The route and
profile API remain unchanged so existing redirects, bookmarks, and tests keep
their established identifiers.

## 2026-11-12: Settings logout preserves the selected server

The Settings sidebar has a persistent Log out control below its scrollable
categories. Activating it opens a confirmation dialog before any credentials are
changed. Confirming revokes the current session when the server is reachable,
clears the local session and user cookies, keeps the selected server address,
and opens onboarding in sign-in mode with the current Settings path as the
post-authentication destination.

This is distinct from the administrator Server page's Disconnect action, which
clears the server selection so another server can be chosen. Logout failures do
not trap the user in the signed-in shell because local credentials are cleared
before the server revocation request completes.

## 2026-11-13: Profile owns logout and the sidebar shows build metadata

Move the Settings logout control from the persistent sidebar footer to the
bottom-right of the Profile page. Keep the existing confirmation, session
revocation, offline-data clearing, selected-server retention, and return-route
behavior unchanged.

Use the sidebar footer for compact build diagnostics instead. Read the version
from the `@peridot/web` package and expose it with the build environment through
Nuxt runtime config. `PERIDOT_ENVIRONMENT` can name an explicit deployment
environment; otherwise the footer shows `production` for a production build and
`development` for local development. Render the values with the smallest
standard Tailwind text size and reduced muted-token opacity so they remain
available without competing with Settings navigation.

This supersedes the earlier sidebar placement of Log out while preserving its
session-clearing semantics.

## 2026-11-12: Administrator settings form a separate navigation group

The Settings sidebar keeps Account, Library, and Playback as common categories.
Administrators see a separately divided `Admin` group containing Plugins, Tasks,
User Management, Sources, Metadata, and Server. The group and all six links are
absent for non-administrators; server API authorization remains authoritative
for the underlying operations.

The former Administration category is removed. Its server connection and log
content moves to `/settings/server`, while `/settings` now redirects to the
non-administrator-safe Account category. Source and metadata management remain
on their existing dedicated routes.

Task progress is administrator-only UI. The topbar task spinner and fullscreen
Settings task indicator render only for administrators, and direct access to
`/settings/tasks` shows an access-required state to other users. The shared
connection-loss warning remains visible because it is not task progress. Task
HTTP routes retain their existing authenticated contract. This supersedes the
earlier decision that exposed Tasks and task progress to every signed-in user.

## 2026-11-12: Setup and expired sessions redirect without authentication alerts

The shared authenticated browser client treats `428 setup_required` as an
onboarding setup condition and `401 unauthorized` as a lost-session condition.
Both clear stale browser identity, preserve the current full path, and replace
the current route with onboarding. Setup opens `auth=setup`, which reconnects to
the selected server and presents the required first-administrator form; expired
sessions open `auth=login`.

The client reports the redirect reason through one handler and rejects with a
typed authentication-redirect error. User-facing catalog, player, settings, and
action handlers ignore that error instead of rendering its server message as an
alert or toast. The unauthenticated sign-in endpoint is excluded, so incorrect
credentials remain an inline form error. This supersedes the earlier
lost-authentication-only handling that recognized `401` but left setup-required
responses in page error states.

## 2026-11-12: Realtime events replace UI polling

The authenticated web app uses one `/api/realtime` WebSocket for task lifecycle,
catalog revision, and administrator log events. Browser WebSocket clients cannot
send the existing bearer header, so `POST /api/realtime/ticket` issues a
random, single-use, 30-second ticket bound to the current session. The upgrade
requires an exact configured `Origin`, tickets and playback tokens are redacted
from request logs, and session revocation closes matching sockets.

Clients subscribe explicitly to `tasks`, `catalog`, or admin-only `logs`.
Task events carry the complete safe `TaskResponse`, with progress coalesced to at
most four updates per second and status transitions always emitted immediately.
Catalog events carry only the revision, source, reason, and changed count; they
never contain catalog rows. Server sequence numbers and a 512-event in-memory
buffer permit short reconnect replay. A gap or slow-client overflow produces
`resync.required`, after which HTTP pages/tasks remain the canonical recovery
source. This intentionally avoids a durable event outbox in the single-process
SQLite deployment.

## 2026-11-12: Catalog reads use projections and cursor pages

Catalog views no longer fetch every track. The server maintains derived indexed
projections for effective track metadata, album summaries, artist summaries,
artist/album membership, and normalized search terms. Track, album, and artist
endpoints return bounded cursor pages and the current persisted catalog revision;
the track endpoint accepts query, sort, availability, album, artist, and liked
filters. Page cursors are revision-bound so a scan or metadata change invalidates
them instead of allowing skipped/duplicated rows.

Catalog mutations update projections as each changed track is indexed. Existing
databases use an idempotent projection backfill, and mutations are serialized so
backfill, scans, and metadata edits cannot race composite projection writes. The
web app revalidates only loaded/active pages when revisions change, hydrates
player queues through `POST /api/tracks/resolve`, and receives already-resolved
quick picks instead of rebuilding them from the full library.

The shared track table now uses VueUse `useVirtualList` over revision-bound loaded
pages, with an explicit load-more fallback. This supersedes the earlier task/log
polling and page-flow track-table decisions, and changes the public catalog API
from an unpaged list to cursor pages without a compatibility route.

## 2026-11-12: Lost authentication returns to sign-in

Authenticated browser API calls detect a `401 unauthorized` response at the
shared client boundary. The web app clears the stale session and profile cookies,
then routes to the existing onboarding account step with `auth=login` and the
current full path as the post-sign-in destination. This avoids stale library,
player, task, and settings states continuing to retry with a revoked session.

Only authenticated requests report lost authentication. A `401` from the
unauthenticated sign-in endpoint remains an inline invalid-credentials error, and
an intentional disconnect clears local credentials before revoking the session,
so neither case starts the lost-session redirect.

## 2026-11-11: Successful downloads do not add a toast

Downloading a track still creates the browser file through the authenticated
audio response and temporary blob URL, but completing that action no longer
shows a bottom-right success toast. The browser download itself is the
confirmation, so a second notification adds unnecessary interruption.

Download failures and the missing-connection guidance remain toasts because
they explain why no file was downloaded. The obsolete successful-download toast
helper is removed rather than left unused.

## 2026-11-11: Player background reuses the active cover on the left

The persistent player derives its decorative background from the same resolved
cover URL and failure flag as the foreground artwork. The clone is anchored to
the left edge, occupies the left two-thirds on narrow screens and the left half
from the medium breakpoint, and uses a strong blur so it adds album color without
competing with track metadata or controls. A layer-local gradient fades the
clone's right edge into the standard `card` semantic token, while a broader card
gradient restores readability across the player.

The clone is purely presentational: it is hidden from assistive technology and
cannot intercept pointer input. Its image disappears with the foreground
artwork when the track has no cover or the image fails to load, but the
decorative layer remains mounted so the outgoing blurred image can fade out
instead of abruptly removing the background. Standard Tailwind utilities and
semantic theme tokens keep this within the owner's styling authority.

The decorative cover background waits 150 ms and then directly crossfades
between different resolved cover URLs over three seconds. The outgoing and
incoming covers overlap instead of pausing on an empty fade frame, and both use
the same ease-in-out curve to keep the crossfade balanced. The URL key prevents
animation when consecutive tracks share artwork. Displayed metadata and
playback controls remain immediate. Standard Tailwind transition utilities
disable the motion when the user prefers reduced motion.

The persistent player does not expose a separate preparing-audio state in its
metadata line. Artist credits render immediately while the audio is loading, so
starting a track does not temporarily replace useful metadata with a status
label. Playback errors remain separate and continue to replace the artist line
with the existing retryable message.

The persistent player uses larger foreground artwork than its earlier compact
48 px treatment: 64 px below the medium breakpoint and 80 px from it upward.
The placeholder music-note glyph scales with the frame so both artwork and
fallback retain the same visual weight. Standard Tailwind sizing and the
existing semantic muted frame are unchanged.

## 2026-11-11: Track lists embed playback in cover artwork

The shared track table and queue use one `TrackArtwork` component for every
track cover, including queue now-playing and upcoming rows. A full-cover
play/pause control reveals on hover or keyboard focus and uses the Quick pick
70% semantic background so its icon remains legible over artwork. Upcoming
queue covers start their track directly, while the now-playing cover toggles the
active track. Missing or failed artwork uses the existing semantic music-note
placeholder.

The queue remove control uses the standard `icon` button size and a `size-5`
glyph, one step larger than its previous compact control. This keeps removal
separate from cover playback without shrinking the row's primary title space.

## 2026-11-11: Album release years come from explicit provider metadata

The album detail header shows a release year beside the total duration only
when an album track's provider metadata contains an explicit four-digit
`year` detail. Missing years render no placeholder. If matching tracks expose
different years, the header omits the year rather than presenting one edition as
authoritative for a mixed album.

Albums remain client-side projections, so the year is derived while grouping
tracks and does not add an API or storage field. MusicBrainz candidates without
a release-year detail continue to show only the existing album summary.

## 2026-11-11: Queue initialization belongs to the application-root audio owner

The persistent player restores its queue and browser-local snapshot only from
the application-root `useLibraryPlayer({ audio: true })` owner. Layouts observe
and control that shared state but do not initialize the queue themselves.

The default layout previously called `loadQueue()` on every mount. Leaving the
fullscreen Settings layout therefore created a new composable call site whose
local initialization flag was unset; it restored the browser snapshot with
`playing` set to false and paused an active track. Route changes must not run
player initialization independently of the audio owner.

## 2026-11-11: Album play controls restart collections from the first track

Album card, album detail, and album quick-pick controls replace the queue with
the complete ordered album and start at its first track whenever their visible
play action is used. If that album is already playing, the same control shows a
pause action and pauses the current track. A paused album therefore restarts
from its first track instead of resuming a middle track; accessible labels
state that playback starts from the first track.

This supersedes the earlier album card behavior that toggled playback whenever
any track from the album was active, even when the album was paused. Album
context menus continue to start the complete album directly.

## 2026-11-11: Connection loss is a topbar warning without a toast

The server health monitor continues to publish unknown, connected, or lost
status and drives the pulsing cloud-off warning in the topbar. It no longer adds
an app-level toast when the configured server becomes unreachable, and it does
not retain connection-specific toast IDs or helpers.

The persistent topbar warning already communicates the state and remains visible
until a successful health probe, while the app reconnects automatically. A
second bottom-right toast duplicates that warning and competes with user-action
notifications. This supersedes earlier decisions that retained a separate
connection-loss toast.

## 2026-11-11: The account avatar is the sole main-header settings entry

Remove the separate icon-only Settings link from the main header. The account
avatar already enters the full Settings area at `/settings/account`, and the
Settings sidebar exposes every destination from there. Keeping a second adjacent
settings control duplicates the same navigation and adds unnecessary header
clutter. The avatar reveals a Basil settings cog on pointer hover and keyboard
focus so this otherwise implicit settings entry becomes discoverable.

Task progress remains immediately before the avatar. This supersedes the earlier
decision that placed a separate Settings control beside the account avatar.

## 2026-11-11: Topbar connection loss replaces task progress

The existing server health monitor now publishes its unknown, connected, or
lost status through one app-level Nuxt state value, so the topbar indicator
observes the probe result. When the configured server is
unreachable, the topbar replaces any active task progress circle with the
bundled Basil cloud-off icon in the destructive semantic color. The icon uses
the reduced-motion-safe `animate-pulse` utility and exposes its meaning through
an accessible label and hover/focus tooltip.

Connection loss takes precedence over queued or running task state because a
stale progress ring would imply live server work. A successful health probe
returns the topbar to the task progress circle when work remains active. This
adds no polling cadence, API, or storage contract; it only exposes the existing
ten-second health-monitor state to the header.

## 2026-11-11: Durable task queue separates scans from metadata fetches

Replace the combined `LibraryScan` lifecycle with a persistent `Task` record.
Core `library_scan` tasks reconcile source files and report added, updated,
unchanged, unavailable, and failed file counts. A successful scan queues a
linked `metadata_fetch` child, while the Metadata refresh action queues that kind
directly. Each task owns its own queued, running, completed, failed, or
interrupted state and a determinate or indeterminate progress value.

One in-process FIFO worker executes tasks sequentially for SQLite safety and
provider rate-limit predictability. New requests are accepted while work is
active. An equivalent task is coalesced only while it is still queued; work that
has started does not block a later intentional request. Queued tasks resume
after restart, while tasks that were running become interrupted and are not
retried automatically. Metadata reset remains synchronous and is rejected while
any task is queued or running.

All signed-in users can read `GET /api/tasks` and `GET /api/tasks/:id`. Responses
contain safe source display names, bounded labeled details, and timestamps, but
never source paths, provider credentials, or arbitrary plugin payloads. Core
task kinds are `library_scan` and `metadata_fetch`; future isolated jobs may use
validated `plugin:<plugin-id>:<job-name>` kinds. Plugins still cannot execute
inside Fastify or create browser-authored tasks.

Browser clients poll the task list every 500 ms while queued or running work
exists and at a slower idle interval. WebSockets are intentionally deferred for
this foundation. Terminal history is retained for 30 days with a hard cap of the
newest 500 tasks. The source-creation `scan` response property becomes `task`,
and the previous scan-specific routes and combined metadata fields are removed.
This supersedes the earlier decision that treated metadata enrichment as a
second phase of the same scan record and rejected concurrent operations.

## 2026-11-11: Sidebar quick pick uses continuous seven-day decay

The sidebar quick pick list uses one retained `TrackPlayEvent` per successful
browser playback run. Events are scoped to the signed-in user and cascade with
their user or track. Recording happens only after `HTMLAudioElement.play()`
resolves, so pause/resume, seeking, failed starts, restored paused sessions, and
retries in an already-counted run do not add events. New runs created by explicit
selection, next/previous, automatic advancement, or repeat-one do count.

Each event contributes `0.5^(ageDays / 7)` to its track score. Album score is the
sum of decayed events belonging to its available tracks, so album and track
identities participate in one ranking by decayed score, latest play, and stable
key. The server exposes only the ordered identity list from
`GET /api/quick-picks`; individual events and scores stay server-side. The
sidebar's up-to-eight cover-play rows are labeled `Quick pick`, use one item per
line, and show artwork, a track or album type icon, title, and artist names.
Each complete row is one button so artwork and text share the same play/pause
interaction. The visible order is frozen while the pointer or keyboard focus is
inside the list, preventing rows from moving beneath an active target; the
latest resolved order is applied after all interactions end. Retaining events
makes continuous decay exact without periodic total rewrites. Playlist entries
remain deferred until playlists exist.

## 2026-11-11: ProgressCircle uses one value-driven progress contract

The shared `ProgressCircle` treats a finite numeric `value` as determinate and
clamps it to `0–100`. An omitted, null, non-finite, or otherwise non-numeric
value renders indeterminate progress with a rotating arc. A separate mode prop
is unnecessary because callers already have a single optional progress value,
and zero must remain distinguishable from "no value available."

The ring continues to rotate for determinate values. Numeric state controls the
indicator dash geometry and accessible value rather than whether the visual is
moving, which keeps active work recognizable in both determinate and
indeterminate states. Rotation retains the reduced-motion fallback.

The component defaults to the primary semantic color at medium size. Indicator
colors use the existing primary, secondary, success, warning, and destructive
tokens; sizes use standard Tailwind utilities. The numeric stroke width defaults
to 6 and is applied through an inherited SVG presentation attribute, allowing
callers to tune the ring without arbitrary utility values. Percentage text is
opt-in and a default slot takes precedence for custom center content. Dynamic
ring geometry uses native SVG presentation attributes so the shared styling rule
continues to forbid inline styles.

Progress exposes accessible progressbar semantics with clamped values and a
percentage value text. Indeterminate progress omits `aria-valuenow`, while both
states use either the caller-provided label or the context-appropriate default
of `Progress` or `Loading`. The topbar task indicator can use either state, while
other application loading surfaces continue to use the branded
`PeridotSpinner`.

## 2026-11-11: Topbar task progress uses a queue average

The main-header progress circle reflects every task currently running or queued.
Its value is the equal-weighted average of the active tasks: a running task
contributes its determinate completion percentage, while each queued task
contributes zero until it starts. A zero-total running task counts as complete.
If no task is running or the running progress is indeterminate, the overall
circle is indeterminate rather than showing a fabricated percentage. The circle
is hidden when no active tasks remain.

Hovering or focusing the task indicator opens a tooltip with the running task
first and queued tasks in FIFO creation order. Rows show the task title, status,
and available percentage or completed/total work. A bounded scrolling list keeps
large queues usable. Completed, failed, and interrupted history does not affect
the indicator.

The indicator reads the existing shared task state and therefore adds no API,
polling, or storage contract. This supersedes the earlier metadata-only
indeterminate header badge. The fullscreen Settings header uses the same
indicator.

## 2026-11-11: Task activity uses the headers and Tasks settings, not toasts

The task progress indicator is shared by the main application header and the
fullscreen Settings header. Clicking the task circle opens
`/settings/tasks`, which is available to every signed-in user because the task
read API is authenticated rather than administrator-only. The Settings page
lists running and queued tasks with their live progress, source, kind, and
timestamps. It independently pages terminal history and keeps active-task state
live through the existing monitor.

Task-specific progress, completion, and failure toasts are removed. Polling
failures continue to retry silently, while server connection loss uses its
topbar warning. Other user-action notifications, including
source/provider changes, likes, downloads, and queue operations, remain toasts.

The Metadata refresh button is disabled while any task is queued or running and
changes its label to `Processing…`. This prevents duplicate refresh requests
from the UI while preserving the server's task coalescing rules for other
clients.

## 2026-11-11: Branded loading indicator is named PeridotSpinner

The shared animated loading component is named and exported as
`PeridotSpinner`. Its file, data slot, imports, tests, and documentation use the
same product-specific identity so it is not confused with a generic spinner
control. The package import path remains `@peridot/ui/components/ui/spinner` to
keep component grouping stable.

The same package also exports the classic shadcn-vue `Spinner` using Lucide's
`LoaderIcon` and the standard `animate-spin` utility. It is available for future
loading states but intentionally unused for now, while the branded
`PeridotSpinner` remains the active application spinner.

## 2026-11-11: Settings access lives beside the account avatar

The persistent main-header actions place an icon-only Settings link immediately
before the account avatar. The avatar continues to open account settings
directly, while the new Settings control opens the full Settings area. This
makes the application-level destination consistently available in the top-right
header rather than requiring the sidebar footer.

A compact non-interactive metadata-status badge uses `PeridotSpinner` and
`Fetching metadata` in the header actions, without duplicating the Settings
navigation. The former sidebar-footer slot is removed.

## 2026-11-11: Adding a local source starts scanning and metadata matching

Creating a `path` source queues a source-scoped file scan on the server and
returns that scan with the created source. The browser adopts the returned scan
so its existing progress and completion notifications track work that started
server-side. URL and integration sources do not start scans because they are not
indexable yet.

The source scan keeps its existing continuation behavior: once catalog
reconciliation completes, metadata enrichment runs against available automatic
tracks from that source. It remains part of the same scan record, with
`metadataStatus` exposing its pending, running, and terminal state. If another
library operation is already active, source creation still succeeds with a null
scan result and the Sources page tells the administrator to rescan after the
active operation finishes.

## 2026-11-11: Track tables use the page scroll

Shared track tables keep the complete sorted list for queue construction but
render it in progressive page-flow batches. The first 60 rows mount immediately,
then another 60 mount as the load-more sentinel approaches the viewport. A
visible Load more control remains available as the keyboard and
constrained-client fallback. The table does not create a virtualized viewport,
maximum-height frame, or independent vertical scrollbar. The main content
region remains the only vertical scroll owner, so long lists scroll together
with the rest of the page and the fixed player remains unobstructed.

Track-title hash navigation still resolves the target row's element and calls
`revealThrough` before `scrollIntoView`, so a linked track beyond the initial
batch mounts first. This keeps album links working without requiring an internal
table scroll position. This supersedes the virtualized track-table portion of
the earlier progressive-card and virtual-row decision.

## 2026-11-11: Local album and artist credits are links in compact track surfaces

Shared track rows place linked artist credits directly beneath the track title
for every library, search, album, and artist-table variant and at every
viewport. The separate Artist column is removed because the under-title credit
is now the canonical location. Visible album names link to their album detail in
every applicable table variant, including artist-page track lists.

The fixed player, now-playing queue card, and upcoming queue rows derive linked
artist credits through `trackArtistNames`, which preserves the file-tag fallback
when the structured artist list is empty. The now-playing play/pause glyph uses
the shared Button rather than a decorative Icon and controls the active track.

External metadata-search candidates remain plain provider results because they
do not necessarily identify a local album or artist route. Local catalog
identities should be navigable wherever they are displayed.

## 2026-11-11: Catalog views use progressive cards and a virtualized track table

Catalog pages keep the complete track response in memory so album and artist
grouping, collection playback, likes, and sidebar totals remain correct without
server API changes. Album and artist grids reveal cards in batches of 60 as the
end sentinel approaches the viewport, with a visible Load more fallback for
keyboard and constrained clients. Search resets the batch when its filtered
album set changes. Card cover images load lazily.

The shared track table uses VueUse `useVirtualList` with fixed 56-pixel rows,
eight overscan rows, and its own bounded scroll area. ARIA table roles expose the
total row count and original track indices. Album title deep links pass the
target track ID into the table so the corresponding virtual row is mounted
before its title anchor is scrolled into view.

This supports personal libraries up to roughly 10,000 tracks without moving
catalog paging to the server. VueUse-generated container and wrapper positioning
styles are the sole runtime style-binding exception; all visual styling remains
standard Tailwind, shadcn-vue variants, and shared theme tokens.

## 2026-11-11: Track-table playback queues the displayed list

The shared track table queues every track in its current displayed order when a
row is played by its button, double-click, or context-menu Play action. The
selected track is rotated to the front so playback starts there, then continues
through the following rows and wraps through any rows that preceded it. The
queue retains the complete list, while sorting changes the queue order because
sorting changes what the user sees.

This applies to the library, liked songs, search results, album details, and
artist detail track lists because they share the track table. Album and artist
collection play buttons continue to queue their complete collections through
`playCollection`.

## 2026-11-11: Current-track waveform uses AT Icons

The shared track table marks the current track with the bundled
`at-icons:waveform` glyph in the primary color. It remains visible
when the track is paused and does not add an active-row background. This is an
owner-requested exception to the otherwise Basil-only UI icon rule for this
specific playback indicator.

## 2026-11-11: Search is a dedicated local-library view with result-type quick filters

Search now has one dedicated `/search` route instead of filtering whichever
catalog page happens to be open. The persistent top-bar input owns the query and
navigates to the route when clicked or focused; the page itself does not render a
second input. The route uses the full main content area while retaining the
sidebar, header, and fixed player. An empty query shows recently opened albums;
a non-empty query groups local album and track results before the external-source
section.

The first quick-filter tags are `All`, `Albums`, and `Tracks`. They are
client-side toggles over the current query results. They are not catalog genre
metadata because the track contract does not expose tags or genres.

Recent search albums are identified by normalized title and artist, scoped in
browser storage by server and user, deduplicated, bounded to eight entries, and
reconciled against the current catalog before display. External sources remain a
non-functional placeholder with no provider calls, downloads, or simulated
results until a real credential-backed integration exists.

## 2026-11-11: Like hover stays scoped to the like control

The shared `LikeButton` applies its primary hover and active colors to the
button itself instead of using `group-hover` or `group-active`. Album and artist
cards deliberately mark their full card as a hover group for placeholder
treatment, and descendant `group-hover` utilities also match that ancestor
group. Scoping the color change to the control prevents hovering anywhere else
on a card from making its like button appear active.

## 2026-11-11: Sortable rows use the full item as the drag target

User-reorderable rows use the complete row as the Sortable target. The grip icon
is an affordance rather than a restrictive handle. Interactive descendants
(`a`, `button`, and `input`) are filtered from drag initiation so links, action
menus, and controls keep their normal behavior. Unconfigured provider rows are
excluded from sorting because they do not yet have persisted provider order.

## 2026-11-11: Provider definitions drive the always-visible settings list

The Metadata settings list is built from provider definitions rather than
configured provider rows, so MusicBrainz and Discogs remain discoverable before
setup. An unconfigured provider has a dimmed title, a `Not configured` warning
label, no drag handle, and a cog that opens its setup form. Configured providers
show `Active` or `Disabled`, remain reorderable, and expose their on/off switch
inside the configuration dialog so provider state and settings are saved
together.

Enabled providers that lack required configuration or credentials retain their
row but show a warning above the cog with a tooltip. The shared theme adds
semantic warning and success colors so these labels and the enabled-state
indicator do not use hardcoded component colors.

## 2026-11-11: Metadata providers use a resolver registry and generic provenance

Metadata providers are trusted core resolver adapters registered through a
shared contract. Each adapter declares its provider definition, configuration
fields, credential requirements, discovery methods, automatic-match policy, and
canonical source URL. Settings renders provider cards and forms from those
definitions, so adding a provider does not require provider-specific branches in
the enrichment engine or metadata dialog.

MusicBrainz and Discogs remain ordered automatic fallbacks. Automatic matching
passes only unresolved tracks to the next provider. Manual candidate search
queries every enabled provider and preserves provider order in the merged
result list. Discogs applies an automatic match only when exactly one exact
normalized release and track candidate remains; multiple exact editions stay
manual.

Track matches store provider-neutral track and release IDs, a canonical source
URL, and bounded labeled details. Discogs preserves year, label, catalog number,
country, format, and raw track position without adding provider-specific Track
columns. This replaces the earlier MusicBrainz-shaped ID columns and requires a
local database reset because the project has no migration history.

Discogs uses an administrator-provided personal access token instead of OAuth.
`PERIDOT_CREDENTIAL_KEY` supplies a base64-encoded 32-byte AES key required
before a token can be stored. Credentials use versioned AES-256-GCM envelopes,
never enter browser responses or URLs, and can be rotated without deleting
existing matches. MusicBrainz-only installations continue to run without the
credential key until a keyed provider is configured.

## 2026-11-11: Browser-local playback resumes the queue and position

The full player queue, its active track, shuffle state and remaining pool, and
the active track's elapsed position are mirrored to `localStorage` under a key
scoped by server address and user ID. A valid browser snapshot is restored
before the server queue fallback, so a reload presents the same queue and track
at the saved position. Restoration remains paused and does not attempt autoplay.

The existing per-user server queue remains the cross-session queue source and
continues receiving every queue mutation. Browser snapshots provide the reload
fast path and preserve playback progress, which the server queue does not store.
Malformed, wrong-version, or cross-scope snapshots are ignored, allowing the
normal server queue load to recover. localStorage remains browser- and
origin-local; it is not a substitute for account or cross-device persistence.

## 2026-11-11: MusicBrainz is enabled by default and providers are disabled, not deleted

The first administrator's required email is also the MusicBrainz contact used
in Peridot's MusicBrainz User-Agent. Creating that administrator enables
MusicBrainz automatically. On startup, Peridot also creates the default
MusicBrainz provider for an existing installation that has an administrator but
no provider row, so upgrades receive the same zero-configuration behavior.

Providers persist an enabled state and administrators disable or re-enable them
instead of deleting them. Disabled providers remain visible in Settings with
their contact information intact, but automatic enrichment, manual candidate
search, and applying a manual match ignore them. Reordering includes disabled
rows so their position is retained for later re-enabling. This supersedes the
earlier deletion behavior, which stopped enrichment while preserving existing
track match snapshots.

## 2026-11-11: Persistent randomized playback without queue reordering

Randomization is a per-user playback mode, not an immediate queue mutation.
The queue API returns the source-order `trackIds`, an independent
`activeTrackId`, `shuffleEnabled`, and the ordered `shuffleTrackIds` remaining in
the current no-repeat pass. `QueueState` persists the active track and enabled
flag per user, while `QueueItem.randomPosition` persists the remaining pass
order. SQLite stores the enabled flag as an integer and the API exposes a
boolean.

Enabling randomization seeds a Fisher-Yates pool from every source track except
the current track. Forward advancement consumes the pool once, so a track
cannot play twice within a pass. Repeat-all starts a fresh shuffled pass only
after the current pool is exhausted. Repeat-one remains an explicit exception
and may replay the active track. Disabling randomization clears the pool and
compacts the visible queue to the active track followed by unplayed source-order
tracks.

The queue drawer pins the independent active track and renders the saved source
order below it with a `Randomized` badge. Toggling randomization never shuffles
the visible source array. Browser writes remain serialized and last-write-wins,
and the persisted active track and remaining pool restore paused after reload.

## 2026-11-11: Prisma 8 contract runtime with no migration history

Use Prisma 8's contract-first data layer instead of the Prisma 7 generated client.
The server pins `prisma@8.0.0-rc.33` with
`@prisma/cli-engine@0.9.0`, matching the toolchain pinned by
`@prisma/orm-sqlite@8.0.0-rc.23`; these are the current published Prisma 8 CLI
and SQLite ORM package lines. Prisma 8 remains a release candidate, so these
versions must move together after checking the ORM package's release tags.

The authoritative schema is `apps/server/src/prisma/contract.prisma`. Contract
emission writes the committed `contract.json` and `contract.d.ts` beside it.
Server code uses `db.orm` from the initialized SQLite runtime. SQLite stores the
track availability flag as an integer because the current SQLite target exposes
integer, not boolean, codecs; API responses continue to expose a boolean.

Local development intentionally keeps no migration history. `db:update`
synchronizes an existing database directly from the emitted contract, and
`db:reset` explicitly removes the configured local SQLite file before applying
the contract to a new database. Startup never resets data implicitly. Prisma's
local ref/snapshot state lives under ignored `.peridot/` rather than a tracked
migrations directory. The old Prisma 7 schema, generated client, and committed
migrations were removed after the local database was reset.

## 2026-11-11: Project-scoped Node 24 and parallel dev launcher

Pin Node 24.22.2 through pnpm's `devEngines.runtime` with automatic download so
repository commands honor the required Node major even when a contributor's
system Node is older. pnpm uses this runtime for workspace lifecycle and package
scripts, and `pnpm-lock.yaml` records the platform binaries. A system Node
installation in the supported range remains preferred, but it is not required
for the documented pnpm workflow.

Run development as two pnpm workspace tasks for the web and server, after the
same migration step as before. Turbo remains the task graph for build,
typecheck, and test. On this Windows environment, `turbo run dev` terminated
with `0xC0000409` when attached to the interactive terminal, while pnpm's
parallel workspace runner started both persistent tasks and kept them running.

Server test helpers canonicalize their temporary root before deriving database
and library paths. Node 24 on Windows can return an 8.3 temporary alias from
`mkdtemp()` while filesystem operations report the long canonical path; using
the canonical root keeps duplicate-source and audio-file tests aligned with the
runtime configuration boundary.

## 2026-11-11: Onboarding discovery remains visible beside optional manual entry

Server onboarding presents automatic network discovery as the primary path. The
shared brand spinner and the exact status "Looking for a server on this network"
remain visible for the whole server-selection step, including between polling
cycles and after a scan completes. Found Peridot servers appear in a selectable
list below that status.

The URL field stays collapsed behind a bottom-aligned "Enter the server address
manually" option so manual configuration does not compete with the normal
discovery path. Activating the option reveals and focuses the URL field; the
existing debounced probe still verifies that address and adds a valid server to
the same found-server list. Connection failures remain visible outside the
collapsible section.

## 2026-11-10: Bulk metadata reset returns tracks to file metadata

Administrators can clear every stored track metadata match from Settings →
Metadata after confirming the destructive action. Reset sets all tracks to file
mode and clears provider provenance, MusicBrainz recording and release IDs,
album/title/artist/numbering overlays, match timestamps, and attempted-match
signatures. It does not delete metadata providers, track rows, queue or like
data, artwork, source configuration, or audio files.

Bulk reset shares the per-track “Use file metadata” destination: tracks use
their original file tags and are not immediately re-enriched. This gives the
owner a reliable recovery path when individual manual matches split one folder
album into several derived Albums entries. The reset endpoint is administrator
only, rejects requests while a scan or metadata refresh is active, and returns
the number of catalog tracks reset.

## 2026-11-10: Playback survives fullscreen layout changes

The web application root owns the single native audio element. Layouts render
playback controls and queue UI but do not mount or destroy audio themselves.
Switching from the main shell to the playerless fullscreen Settings layout
therefore leaves the current media playing and its shared position, volume, and
queue state intact. Returning to the main shell reconnects those controls to the
same audio manager.

This supersedes the earlier decision that the persistent main layout was the
sole audio owner. Layout changes still hide the visual player, but they no longer
pause, clear, or recreate playback.

## 2026-11-10: Album and artist cards share collection context menus

Album and artist cards use dedicated wrapper components around the shared Reka
UI context-menu primitives. The complete card, including its artwork and title
link, is the trigger, so right-click and touch long-press work consistently
without adding page-specific pointer handlers. Each menu exposes only actions
that make sense for a collection: Play, Like/Unlike, and Open.

Play uses the same `playCollection` queue replacement as the detail headers.
Like state and pending mutations use the shared optimistic likes store, so a
card menu and its heart button stay synchronized. Open reuses the existing
encoded album and artist routes instead of duplicating route construction.

## 2026-11-10: Folders are album boundaries for metadata matching

Automatic metadata enrichment groups tracks by source and containing directory
rather than by file-tag album and artist identity. Every folder is therefore an
album even when its files have no album tags, so those tracks use release search
and release lookup instead of falling back to individual recording searches.

When every track in the folder agrees on the same non-empty album tag, that tag
is used as the release title. If tags are absent or disagree within the folder,
the folder name is used instead. Tracks directly below a source root use that
source directory's name. Exact title and credited-artist matching still decides
whether any provider result is applied, and provider metadata remains an overlay
over the original file metadata.

## 2026-11-10: Local album artwork with placeholder fallback

The scanner reads the preferred embedded front-cover picture from each changed
audio file, falling back to same-folder `cover`, `folder`, `front`, or `albumart`
JPEG/PNG/WebP files. Images are limited to 5 MiB, hashed by content, and stored
once as SQLite BLOBs so tracks from the same album do not duplicate artwork.
Metadata version 3 re-reads existing catalog rows so covers are backfilled by the
next scan.

Track responses expose a relative cover URL containing a short-lived HMAC token
scoped to that track's GET/HEAD cover route. Browser image requests therefore do
not need to expose the long-lived session bearer token, and cover URLs are
redacted from request logs. A missing, unreadable, oversized, expired, or
unsupported cover leaves the music-note placeholder in album cards, album
details, and the persistent player. Peridot does not fetch external artwork or
rewrite audio files.

## 2026-11-10: MusicBrainz metadata overlays with per-source scans

Metadata providers are ordered server-wide configuration managed by
administrators. MusicBrainz is the first provider. The public read API currently
requires no API key, but it requires a meaningful contact-bearing User-Agent and
at most one request per second. Peridot collects a contact email or URL,
serializes requests through one rate-limited client, uses only the official
MusicBrainz origin, and applies bounded responses, timeouts, and retry backoff.
Provider credentials are reserved for future keyed providers, are never returned
to the browser, and are not collected for MusicBrainz.

The Add provider dialog follows the Sources picker's two-step flow. Its service
choices are large selectable cards rather than a button list. MusicBrainz is the
only enabled card; Spotify appears disabled with a coming-soon label. The
MusicBrainz step collects only the required contact, with no display-name field,
because the provider name is derived from its fixed provider kind.

Enrichment runs as a background continuation after a file scan marks the local
catalog complete. It processes only new or changed tracks with automatic
matching enabled, stores no-match signatures to avoid polling unchanged misses,
and leaves transient failures retryable. Album tracks are grouped through
release search and lookup; albumless tracks use recording search. Automatic
matches require normalized title and credited-artist agreement, with album,
numbering, and duration used to disambiguate. Provider values are stored as
overlays instead of rewriting local file tags. Manual matches use manual mode;
reverting selects file mode so later scans do not immediately reapply the same
automatic result. Provider deletion stops future enrichment but preserves
existing overlay snapshots and provenance.

Sources and metadata providers each have dedicated administrator-only Settings
pages. A local source's three-dot action menu starts a source-scoped scan or
confirms removal. Source-scoped scans only reconcile availability for tracks
belonging to that source, so a missing file in one source cannot hide tracks from
another source. The former Administration Library status panel and global rescan
control were removed; scan progress remains visible through the global toast,
including the background metadata phase.

## 2026-11-10: Sortable shared Reka-style track tables

The library, album detail, and artist detail screens share one track-table
component rather than maintaining three copies of row markup. It follows the
Reka UI data-table example's composition pattern: a semantic table wraps Reka
context-menu interactions, client-side sort state drives a copied row array, and
header buttons toggle the active direction. Reka does not provide a table or
sorting primitive, so sorting remains a small typed helper over the catalog
model while interaction primitives and shared shadcn-style controls continue to
come from Reka UI.

Title, artist, album, duration, and visible track-number fields are sortable.
Each header cycles through ascending, descending, and default. The default state
clears the active header sort; library tables return to title ascending, while
album and artist tables return to track-number ordering so album/disc order
remains intact. Inactive headers and the default state show no sort glyph;
active ascending and descending headers show only the matching direction caret.
Missing text, duration, and track-number values remain last in both directions,
and equal values retain source order. Sorting is per-table client state and does
not mutate or persist the catalog order.

## 2026-11-10: Durable per-user player queue

The player has one ordered queue whose first available catalog track is the
active track. Playing a track moves it to the front while preserving the rest
of the queue; playing an album or artist replaces the queue with that ordered
collection. Next and natural completion consume the active item and stop when
the queue is empty. Previous uses a non-persistent in-memory history and places
the displaced current track back at the front of upcoming. Track IDs are unique
within the queue, including explicit Add to queue operations. Adding any track
that is already queued moves it back to the next position; re-adding the active
track leaves the normalized order intact and still reports success. The Add to
queue action is never disabled solely because the track is already present.

Queue order is private to each authenticated user and stored in a relational
`QueueItem` table keyed by user and track with cascading deletion. The
authenticated API is an ordered `GET /api/queue` snapshot plus an idempotent
`PUT /api/queue` replacement. Requests reject duplicate and unknown track IDs.
Browser writes are serialized and last-write-wins; stale writes are skipped when
the authenticated server or user changes. Playback continues locally if a save
fails, and the next queue mutation sends the complete current snapshot.

The web shell restores a saved queue paused at the first available track. A
player-clearing, width-constrained custom right-side panel pins the now-playing
item and uses the existing SortableJS integration for upcoming drag reordering.
Upcoming rows display title context and artist links without acting as playback
controls. The panel and overlay stop at the top edge of the fixed player, so
there is no overlapping interactive surface. Entire queue rows are draggable.
Reordering calculates the new order from SortableJS's old and new indexes
before updating and persisting the authoritative array. The queue button
directly toggles the panel. Close-button, Escape, and backdrop dismissal are
implemented explicitly. The panel is non-modal so the fixed player keeps
pointer and keyboard interaction while the panel is open. No local CSS or theme
overrides are used. Randomize shuffles only upcoming tracks so the active track
and playback state remain unchanged.

Queue drag handles use the bundled Akar Icons `drag-vertical` glyph instead of
the previous four-direction Basil move icon. It is imported as local icon data,
so drag handles still render offline and inherit semantic colors and Tailwind
sizing.

## 2026-11-10: Player seek target uses a larger invisible hit area

The bottom player's progress slider uses a standard `min-h-11` minimum height
on its Reka UI root. Pointer interactions are handled by the root, so this makes
the seek target 44px tall without changing the shared 6px track or 16px thumb.
The larger hit area is scoped to playback progress; the volume slider and the
shared Slider defaults remain visually and dimensionally unchanged.

## 2026-11-10: Durable per-user track, album, and artist likes

Tracks, albums, and artists have independent likes stored per authenticated
user. Track likes use the stable catalog ID and cascade when the track or user is
deleted. Albums and artists remain client-side projections rather than server
entities, so their likes store trimmed display metadata plus normalized identity
fields and are unique per user and normalized identity. The same case-insensitive
trimming used by the album and artist projections determines whether a like
matches.

One authenticated `GET /api/likes` response feeds a shared browser composable.
`POST /api/likes` and `DELETE /api/likes` accept a discriminated target and are
idempotent. The client updates the UI optimistically, locks the affected target
while its request is pending, restores the previous state and reports a toast on
failure, and clears favorite state when the server or signed-in user changes.
After the server confirms a new like, the client also shows a five-second
success toast. Album and artist confirmations include their trimmed display
name; track confirmations are generic because the like target carries only the
catalog ID. Successful unlikes do not show a toast, so the confirmation is
reserved for adding an item to the user's likes.
Liking an album or artist never likes its tracks. Album and artist metadata
retags create a new normalized identity, so an old like remains stored but stops
matching the retagged entity.

## 2026-11-10: Track context menus and multiple artist credits

Track rows in the library, album detail, and artist detail use one shared Reka
UI context menu exposed through `@peridot/ui`. The native context trigger opens
on right-click or touch long-press and offers Play, Like/Unlike, Download, Go to
album, and Go to artist. A track with multiple credited artists shows a submenu
listing each artist destination. Menu playback preserves the queue of the
screen that owns the row. The browser obtains a short-lived playback token and
downloads the original file through a temporary blob URL, so neither the
long-lived session nor a server credential is embedded in media URLs or menu
markup.

The catalog now carries `artists: string[]` alongside the combined display
`artist` value. Scanning retains every value from the tag's artist list and
also recognizes semicolon, comma, and featuring separators in single artist
fields. The JSON-encoded `artistCredits` column is optional because SQLite and
Prisma do not provide a portable array column for this provisional schema;
legacy rows fall back to their display artist until rescanned. Bumping the
metadata version to 2 makes the next scan backfill existing rows. Artist
browsing groups a collaboration track under every credited artist, and artist
links render each credit separately.

## 2026-11-10: Browser playback through track-scoped stream URLs

Use the browser's native audio element against the existing authenticated audio
route instead of downloading each track into memory or introducing a second
streaming protocol. Because a media element cannot attach the session bearer
header, the authenticated client first requests a short-lived playback token,
then supplies it in the audio request URL. Tokens are HMAC-signed, scoped to one
track and the exact GET/HEAD audio route, expire after four hours, and are
redacted from request logs. They never replace or expose the 30-day user session.

The persistent main layout remains the sole owner of the audio element. Shared
Nuxt state exposes playback status and actions so library, album, artist, and
player controls stay synchronized. The player uses the native media clock for
position and duration, preserves HTTP range seeking, handles browser autoplay or
decode failures visibly, and advances within the active album or artist queue.
Fullscreen settings do not render a player; returning to the main layout resumes
the current track at its saved position.

## 2026-11-10: Derived artist browsing and artist queues

Artist browsing is a client-side projection of the canonical track catalog,
matching the album boundary rather than introducing an artist entity or server
endpoint. Artists are grouped from trimmed, case-insensitive track artist values
and include albumless tracks as well as the scanner's Unknown Artist fallback.
The index filters by artist name. An artist page derives its album cards from
the same tracks and orders the complete track table by album title, disc, and
track number, with albumless tracks last.

The shared simulated player accepts general ordered queues. Album pages retain
album-scoped queues, while artist pages use an artist-wide queue for both the
Play artist action and individual track selection. Artist names in the shared
track list and album details link to the derived artist page. Artist and album
artwork remain semantic placeholders until artwork extraction is designed.

## 2026-11-10: Derived album browsing and album playback queues

Album browsing is a client-side projection of the canonical track catalog rather
than a separate album entity. Available tracks with non-empty album metadata are
grouped by case-insensitive, trimmed artist and album values, so same-named
albums by different artists remain separate. Albumless tracks stay in the normal
library. Album cards use semantic placeholder artwork until embedded or folder
cover extraction is designed.

Album ordering uses nullable disc and track numbers scanned from file metadata.
Positive track numbers sort across discs, with a missing disc treated as disc
one; unnumbered tracks sort alphabetically after numbered tracks. A private
metadata-version field causes the first scan after this change to re-read
unchanged legacy files once, then records the current version so tagless files
are not repeatedly parsed.

The shared simulated player supports an optional ordered queue. Playing an album
or one of its tracks keeps previous, next, and automatic advancement within that
album; choosing a track from the main library returns the player to the full
catalog queue. The playback clock is owned by the persistent layout so multiple
screens can consume player state without creating duplicate timers.

## 2026-11-10: Library UI reads the server catalog

The web library uses the authenticated `GET /api/tracks` response as its only
track source. A shared Nuxt composable owns loading, errors, retry, and completed-
scan refresh so Home, Library, Liked songs, and the fixed player do not maintain
separate catalog copies. Search and favorites filter the loaded catalog locally;
favorites remain in-memory until persistence is designed. The player now uses
real track metadata, but its transport stays explicitly simulated until audio
playback is connected.

The previous hardcoded demo records and demo player module are removed. This
avoids presenting fictional content as a user's scanned library and gives later
playback work a single real-track state contract to build on.

## 2026-11-10: Disconnect from the connected server

Administration presents server disconnection beside the connected-server
address. The Disconnect button opens a Reka UI alert dialog so canceling or
dismissing the confirmation leaves the browser identity untouched. Confirming
clears the browser's server, session, and profile cookies, then calls the
server's session-revocation endpoint when both the server address and token are
available. Local disconnecting succeeds even when the server is unreachable or
revocation fails, so stale browser credentials cannot trap the user; in that
failure case the server-side session may remain valid until it expires or is
revoked separately.

## 2026-11-10: JSON content type only for request bodies

The web API client adds `Content-Type: application/json` only when the request
has a body. A `DELETE` with no body must not claim to contain JSON because
Fastify correctly rejects that contradictory request before routing it. This
applies to both source removal and session revocation.

## 2026-11-10: Request completion log severity

Fastify's default request-completion line uses `info` for every response status.
Peridot replaces that completion logging so successful HTTP requests are
logged at `debug` and failed HTTP responses are logged at `warn`. The line
retains the request method, URL, response status, and elapsed time so the
Administration log can identify rejected requests after the fact. The
Administration log initially selects `debug`, `warn`, `error`, and `fatal`,
hiding `trace` and `info` until the user explicitly enables them or selects All.

## 2026-11-10: Explicit browser API CORS methods

Configure the browser API CORS policy with the methods Peridot actually exposes
instead of relying on the CORS plugin default. `@fastify/cors` defaults to
allowing only `GET`, `HEAD`, and `POST`, which omitted the `PUT` source-order and
`DELETE` source-removal requests behind a browser preflight. The explicit
allowlist is `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, and `OPTIONS`; configured web
origins and the smaller authorization/content/range header allowlist remain
authoritative.

## 2026-11-10: Local-source folder search

The local-files source picker searches directories recursively on the server so
users do not need to expand every level first. Search is case-insensitive and
returns selected flat matching folders with their full paths. The admin-only
endpoint starts from all filesystem roots by default, or an optional supplied
path, and uses bounded traversal: at most 100 results, 25,000 scanned
directories, 48 levels, and eight seconds, with twelve directory reads in
flight. It does not follow symbolic links and skips platform virtual/system
directories. Results report whether a bound stopped the search. The web client
debounces input, aborts superseded requests, and ignores stale responses; the
server stops a traversal when its response connection closes.

## 2026-11-10: App-level Reka toast notifications

Use Reka UI's managed Toast provider once at the web app root for work-in-progress
and connection errors. Library scan state and polling live in a shared composable
rather than the Administration page, so a progress toast remains current after
navigation. The active scan maps to a single persistent `loading` toast that
updates through queued/running and then becomes a brief completion or failure
toast. The toast viewport is fixed to the bottom-right. It clears the fixed
player in the main shell and anchors to the bottom edge in playerless fullscreen
layouts such as Settings.

While the app is connected, probe the configured server's public
`GET /api/health` endpoint every ten seconds with a bounded timeout and require
the exact Peridot health signature. Entering the lost state adds one persistent
error toast; a successful later probe dismisses it. Onboarding is excluded so
the connection monitor does not interfere with server selection. Reka's manager
updates toasts by stable IDs, preventing repeated poll failures from stacking
duplicate notifications.

Successful source and metadata-provider additions and removals use the app-level
toast system and include their configured labels. Reordering either list is
confirmed by the drag result itself and does not show a success toast; a failed
order request still reports its error in the management page. Add and remove
toasts are emitted only after the server confirms the mutation, so they report
durable state rather than an optimistic local edit.

## 2026-11-10: Gravatar avatar with offline fallback

The signed-in user's avatar in the main header loads from Gravatar using the MD5
hash of their normalized email, computed with `ts-md5` both in the browser and
during SSR. The request uses `d=404` and falls back to the bundled Peridot logo
when the email has no Gravatar image or the network fails, so the header stays
usable offline. The user profile is stored in a same-site cookie to avoid an
extra profile fetch. This is an owner-requested exception to the local-first
default; no other external images are fetched.

## 2026-11-10: Server sources for raw audio

Where the server gets raw files is modeled as a list of `Source` rows rather
than a single folder. A source is one of `path` (a local directory), `url` (an
external HTTP(S) location), or `integration` (Spotify, YouTube Music, and other
services, deferred). Administrators manage sources from Settings and each local
folder source is resolved to an existing directory with a bounded, admin-only
filesystem autocomplete endpoint. A first `path` source seeds from
`MUSIC_LIBRARY_PATH` when the table is empty, and scanning walks every `path`
source while storing the owning `sourceId` on each track; audio streaming
resolves a track through its source. URL and integration sources are stored but
not fetched yet. Exposing configured paths and listing directories are
intentional, admin-only exceptions to the earlier no-filesystem-paths rule, so
the owner can manage their own server.

## 2026-11-10: Sources management UI

The Administration Sources list is draggable via VueUse `useSortable`
(SortableJS) and persists order through `PUT /api/admin/sources/order`, backed
by a `position` column on each source. Removing a source asks for confirmation
in a Reka UI alert dialog. Adding a source opens a Reka UI dialog that first
asks for the kind, then shows the matching form: local folders use a Reka UI
tree backed by `GET /api/admin/filesystem/tree`, which lazily lists one
directory level at a time from server filesystem roots; remote sources use a
URL field; integrations remain deferred.

## 2026-11-10: Server log view

The Administration screen includes a live server log. Fastify's pino output is
teed through an in-memory ring buffer (bounded to the 500 most recent entries)
and exposed only to administrators through `GET /api/admin/logs?after=<id>`.
The web page polls that endpoint every two seconds and appends new entries, so
the log refreshes live without a push channel. Request-completion lines are
summarized as `METHOD URL STATUS (ms)`; other pino messages keep their text.

## 2026-11-10: User profile identity fields

A user profile consists of an email address, a username, and a password. The
display-name field is replaced by a required, unique email address. Emails are
trimmed, lowercased, and validated at account creation. Users sign in with
either their username or their email address; both stay unique. The users
migration rebuilds the table and, for any pre-existing local rows, derives a
placeholder email from the username so existing sessions stay valid.

## 2026-11-10: Zero-configuration local development storage

Keep built server startup strict: deployments must explicitly provide
`DATABASE_URL` and `MUSIC_LIBRARY_PATH`. For the repository development command,
default those values to `apps/server/peridot.db` and `apps/server/music`, create
the default or configured music directory when absent, and apply committed
migrations before starting the watch server. This makes the documented
`pnpm dev` quick start complete while preserving explicit production storage
configuration and respecting any developer-provided paths. Run the server through
Node's native watch mode with the tsx import hook; the tsx CLI watch wrapper can
stall its child process when Turborepo starts the Nuxt task concurrently on
Windows.

## 2026-11-10: Gradient component styling exception

The shared Gradient component is the sole explicit exception to the general
no-custom-styling rule. It may use component-scoped CSS, keyframes, generated CSS
variables, and a local inline noise texture to reproduce the referenced
shadcn.io gradient behavior. The exception does not extend to other components.
Onboarding passes only the authoritative shared primary color; the component's
product default also repeats that token across all five blobs. Preserve reduced-
motion behavior, decorative accessibility, and pointer transparency.

## 2026-11-10: Shared animated brand spinner

Expose the owner-supplied animated blob through a reusable shared PeridotSpinner
component. The component provides a status label, accepts standard Tailwind
classes for context-specific sizing, and replaces the animation with the static
brand mark when reduced motion is preferred. Keep both assets local and bundled
through `@peridot/ui`; do not recreate the animation with custom CSS.

## 2026-11-10: Pre-bundle first-render web dependencies

Explicitly pre-bundle the offline Iconify modules, shared UI component entries,
and their runtime packages in Nuxt's Vite development configuration. Vite 8 did
not discover route and linked-workspace dependencies until the first onboarding
render on Windows, then its runtime optimizer terminated Node with `0xC0000409`.
Expose the four `@peridot/ui` runtime packages to the web optimizer as development
dependencies only; component ownership and production runtime declarations remain
in `@peridot/ui`.

## 2026-11-10: Shared owner-supplied brand assets

Keep reusable owner-supplied logos and images in `packages/ui/src/assets` and
export brand files through `@peridot/ui/assets/brand/*`. The web app uses the
provided PNG favicon globally and the provided SVG mark on onboarding. Import
these files through the package so Vite bundles or inlines them locally; do not
duplicate them into an app or fetch them from an external host.

## 2026-11-10: Constrained local server discovery

During server selection, debounce and probe the address field directly from the
browser. Also let the Nuxt host scan localhost and up to three private IPv4 `/24`
networks from its own non-internal interfaces on Peridot's fixed default port 17430. Accept only the exact public Peridot health signature, return only matching
servers, coalesce discovery calls for ten seconds, and never accept caller-chosen
scan targets or ports. This keeps the unauthenticated onboarding discovery route
bounded and prevents it from becoming a general network scanner.

Run discovery automatically every ten seconds while server selection is open.
Show only a spinner, the result list, and concise empty/error states; do not add a
manual scan or Continue button. A verified typed address joins the same list, and
clicking a listed server is the sole transition to account setup or sign-in.
Because browsers cannot reliably reveal their LAN address, subnet discovery sees
the network of the machine hosting the web app; direct field probing still runs
from the browser.

## 2026-11-10: Required first administrator and local sessions

Replace the temporary deployment-wide administrator token with database-backed
users and expiring opaque bearer sessions. An empty server exposes setup status
and refuses protected operations until onboarding creates exactly one first user,
which always receives the administrator role. After that first creation, the
bootstrap endpoint closes and users must sign in. Store passwords only as salted
scrypt hashes and session tokens only as SHA-256 hashes; browser storage contains
the opaque session credential, never a password or deployment secret.

Onboarding is a two-step server connection and account flow. It reads public
setup status from the selected server, presents required administrator creation
when no user exists, otherwise presents sign-in, and persists the server address
and successful session in same-site cookies. Allow cross-origin browser API calls
only from configured `PERIDOT_WEB_ORIGINS`. The default server port is 17430.

This supersedes the temporary `PERIDOT_ADMIN_TOKEN` authentication boundary in
the local-library decision below. User invitations, password recovery, session
management UI, and administrator management remain future work.

## 2026-11-10: Browser-owned server selection and Nuxt routes

Require a server address before entering the web application. Normalize HTTP(S)
addresses and persist the non-secret value for one year in a same-site browser
cookie so both Nuxt middleware and server rendering can route first visits to the
fullscreen onboarding screen without a client-side flash. Keep server selection
changeable from the existing sidebar. Address reachability remains unverified
until the server's browser access and API contract are ready; format validation
must not imply a successful connection.

Use Nuxt's file-based router as the web navigation contract. Home, library, liked
songs, playlists, and plugins have stable URLs while the approved sidebar,
content, and fixed-player layout remains shared. Demo player, search, and liked
state use Nuxt state so navigation does not reset the current session.

## 2026-11-10: Local library server boundary

The first server vertical slice uses one deployment-configured
`MUSIC_LIBRARY_PATH`, a local SQLite catalog through Prisma 7's maintained
better-sqlite3 adapter, and explicit persistent scan jobs. Scans do not run at
startup and never follow symlinks. Successfully completed scans mark unseen
tracks unavailable instead of deleting their metadata. Failed traversals do not
reconcile availability.

Until the users milestone, every catalog, scan, and audio route uses a single
administrator bearer token supplied through `PERIDOT_ADMIN_TOKEN`; health stays
public and database-independent. The token is a server-only deployment secret,
not a browser credential. Audio is streamed in its original format with HTTP
single-range support. Transcoding, artwork, watchers, multiple roots, stable
identity across renames, and web integration remain deferred.

## 2026-11-10: Poppins typography

Owner specifies Poppins as the main UI font, superseding earlier Inter and system
sans defaults. Put Poppins first in both shared --font-sans tokens. Bundle Latin
400/500/600/700 weights through @fontsource/poppins in the web app for local-first
loading with font-display: swap; no hosted font requests. Use those weights in
the preview instead of intermediate weights. Preserve font package OFL licensing.

## 2026-11-10: Owner-supplied Tailwind theme

Use the owner-provided hex theme as the current source of truth for light/dark
palettes, fonts, radii, shadows, chart colors, and sidebar colors. Dark primary
is now #00A63E, superseding the original #46B54A brief for UI theming. Keep dark
mode on the HTML element so body and future portaled controls inherit it.
Shared tokens live in packages/ui; the web entry owns Tailwind imports, utility
mapping, and base rules. Album artwork and the editorial hero retain their
illustrative palettes. Remove app-level root color overrides.

## 2026-11-10: Shared shadcn-vue components

Use official shadcn-vue registry components in `packages/ui` as specified in the
brief. Start with Button, Input, Badge, and Slider, using Reka UI primitives and
Tailwind CSS 4 via the Nuxt Vite plugin. Explicit package exports/imports keep
shared components independent of Nuxt auto-imports. Keep brand colors in shared
CSS tokens. The initial #46B54A value is superseded by the owner-supplied theme
decision above. Local slider labels belong on interactive
thumbs. Preserve upstream MIT notices alongside Apache-2.0 package metadata.

## 2026-11-10: ESLint and Prettier

Use ESLint flat configuration with recommended JavaScript/TypeScript checks and
Vue essential rules across the workspace. Keep Prettier responsible for formatting
and apply eslint-config-prettier last to avoid rule conflicts. Ignore generated
Nuxt, build, coverage, and dependency files. CI checks both tools; type checking
remains separate. Runtime-specific globals are scoped to server/config and web
files rather than enabled across all shared packages.

## 2026-11-10: Conventional Commits

Use commitlint's conventional configuration with a Husky commit-msg hook for
immediate feedback. Pull request CI also validates the introduced commit range
so bypassing local hooks cannot bypass review checks. Existing history is not
retroactively linted.

## 2026-11-10: Track the project brief

Product and architecture requirements are preserved in PROJECT.md. Keep
continuity in the repository without private conversation references or
contributor-specific machine and account details. Demo profiles use generic labels.

## 2026-11-10: TypeScript workspace foundation

Use the previously proposed pnpm/Turborepo, Nuxt, Fastify, and Prisma direction.
Share contracts and brand tokens. Keep desktop and real provider implementations
as explicit future work. Use stable TypeScript 5 and Prisma 7 rather than the
registry's current prerelease Prisma default. Dependency versions are locked.

SQLite is a provisional development schema choice, not a confirmed production
storage commitment. Do not introduce a database dependency into health checks.

## 2026-11-10: Plugin and hosting boundary

Honor the owner's plugin-first, BYOK/BYOS requirements. SDK types do not implement
isolation. Defer execution until scoped permissions, secrets, and isolated RPC
are designed. No shared provider credentials or central integration hosting.

## 2026-11-10: Branch model

The owner specifies dev for development, master for beta, and tags for releases.
Use v-prefixed version tags by convention. CI validates but never publishes.

## 2026-11-10: Apache 2.0 license

Owner confirmed Apache License, Version 2.0. Keep the official LICENSE text and
Apache-2.0 package metadata when adding new workspace packages.

## 2026-11-10: Apache 2.0 license

Owner confirmed Apache License, Version 2.0. Keep the official LICENSE text and
Apache-2.0 package metadata when adding new workspace packages.

## 2026-11-10: No custom UI styling

Owner requires a basic Spotify-style structure: sidebar, main navigation/content,
and a fixed bottom player. Use standard Tailwind utilities and existing
shadcn-vue variants backed by the shared theme tokens. Never introduce custom
CSS blocks, inline styles, arbitrary Tailwind values, hardcoded colors or
sizes, or app-level theme overrides. This supersedes the earlier exception for
editorial hero and artwork styling. Preserve the supplied palette and Poppins.
Persisted the rule in AGENTS.md for subsequent work.

## 2026-11-10: Bundled Iconify icons

Owner requests Iconify icons, specifically andrsrxn:play for playback, replacing
text-symbol placeholders. Import individual andrsrxn icon data and use the
Iconify Vue offline component so SSR includes SVGs and runtime never depends
on a hosted icon API. Icons inherit currentColor and standard Tailwind sizing;
no custom styling or theme changes. Preserve upstream MIT licensing in installed
dependencies. Record the icon rule in AGENTS.md.

## 2026-11-10: Basil play icon

Owner changes the play icon to basil:play-solid, superseding andrsrxn:play.
Keep other icons unchanged. Bundle the individual Basil icon through Iconify's
offline renderer with the existing semantic colors and standard Tailwind sizing.

## 2026-11-10: Basil for all UI icons

Owner specifies Basil for the entire UI icon library, superseding the mixed
andrsrxn/Basil choice above. All current icons now import individual Basil data;
play remains basil:play-solid. Remove the unused andrsrxn dependency. Keep the
Iconify offline renderer, semantic colors, standard Tailwind sizes, and
accessible button labels. Saved the library-wide requirement in AGENTS.md.
