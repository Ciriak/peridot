# Decisions

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

Expose the owner-supplied animated blob through a reusable shared Spinner
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
