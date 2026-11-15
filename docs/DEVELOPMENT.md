# Peridot development reference

Operational, architecture, and contributor guidance for Peridot.

## Quick start

Use Node 24.15 or newer within Node 24, and pnpm 11.25.0.
pnpm uses the Node 24.22.2 runtime pinned in `package.json`, downloading it when
the active Node version is outside the supported major. A system Node 24
installation remains useful for commands run outside pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://localhost:3000. Server health: http://127.0.0.1:17430/api/health.
Development startup synchronizes the local database with the Prisma 8 contract
and, when the corresponding environment variables are unset, uses `apps/server/peridot.db` and creates
`apps/server/music`. Set `DATABASE_URL` or `MUSIC_LIBRARY_PATH` before starting
to use different development locations.
On first launch, the web app asks for the address of the user's Peridot server.
It then creates the required first user with administrator privileges, or signs
in when the server already has users. The server address and expiring session
are kept in same-site browser cookies. The server can be changed from Settings
→ Admin → Server by disconnecting first. Server selection continuously probes
the typed address and scans the web host's private IPv4 networks for Peridot
servers on port 17430; selecting a
discovered server advances onboarding. Home surfaces bounded album and track
suggestions from the authenticated catalog API, keeping liked records visible
and prioritizing music by liked artists. It also shows the current playlist
state. The focused Liked songs, Playlists, Albums, and Artists routes provide
their complete views and refresh after completed library or metadata tasks.
The Albums view derives release-first groups from available track and provider
metadata. Provider release identity takes precedence, followed by embedded album
artists and title, then the containing source folder and title. Track performer
combinations do not create separate albums, while same-named releases with
different identities remain separate. Album cards open a detail page with
disc/track ordering, album playback actions, and an available provider release
year beside the total duration. Album artwork is read from embedded
front-cover tags or same-folder `cover`, `folder`, `front`, or `albumart` images.
Tracks without album tags remain available in track lists and search but are
omitted from Albums. The Artists view groups every tagged performer in the catalog, including
artists whose tracks have no album metadata, and opens an artist page with album
cards, an all-tracks list, and artist playback actions. Artist names in the
shared track list appear beneath each title and link to their derived artist
pages, while visible album names link to their album details in every track-table
variant. Artist credits in the fixed player and queue also link to their derived
artist pages. Matched artist profiles can replace the local file-tag name with a
provider canonical name and fill the card and detail portrait from Discogs.
Portraits are downloaded into the local database and served through short-lived
artist-scoped image URLs; MusicBrainz-only installations retain the semantic
artist placeholder. Manual artist matching accepts the same signed-in user
correction and restore flow as track metadata while preserving the local name as
the stable route and favorite identity. The fixed
player streams available tracks from the authenticated server through a
short-lived, track-scoped playback URL, with play/pause, seeking, volume,
previous/next, persistent randomized playback, automatic advancement, and
retryable loading and error states. Audio playback is owned by the application
root, so entering fullscreen settings keeps the current track playing while its
controls are hidden. Original files are served with HTTP range support and are
not transcoded. One durable queue is
stored per signed-in user on the server, while a browser-local snapshot scoped
to that server and user records the complete queue, active track, and elapsed
playback position. Reloading restores the same queue and track at its saved
position without autoplay. The queue opens in a
player-clearing, width-constrained custom right-side panel where upcoming tracks
can be reordered or removed and their artist links opened. The queue button
directly toggles the panel, and the now-playing play/pause icon toggles playback.
The panel and overlay stop above the fixed player,
leaving the player unobstructed. Queue rows remain draggable without closing
the panel, which is non-modal so the player controls remain interactive.
Track tables and queue rows show each track's cover artwork beside its title.
Play and pause controls are embedded in the artwork and reveal on hover or
keyboard focus, matching the Quick pick interaction; missing artwork uses the
semantic music-note placeholder. Track rows show normalized multi-valued genres
beside artist credits, and catalog search includes genre text. Metadata menus
show the effective genres and preview provider genres before a match is applied.
The Playlists view provides private per-user collections with create, rename,
delete, like, ordered drag-and-drop editing, removal, and a bounded track
picker. Playlist cards and details derive a live 3x3 mosaic from the first nine
distinct track covers in playlist order; missing positions use the semantic
music placeholder. Playlist entries can originate in the API from stable
external provider identities. They remain visible but unavailable until exactly
one catalog track has the same provider and external ID, and are never matched
by title or artist guesswork.
Right-clicking a track row opens a Reka UI context menu for
playback, adding the track next in the queue, adding it to a playlist,
favorites, making the track available offline, authenticated browser download,
album navigation, and per-artist navigation when a track has multiple credits.
Add to queue stays available for tracks already in the queue and moves them back
to the next position instead of creating duplicates. Right-clicking or
long-pressing an album or artist card opens a collection menu for playing it,
changing its favorite state, or opening its details.
Tracks, albums, artists, and playlists can be liked independently from their
rows, cards, and detail headers. Likes are private to the signed-in user and persist across
reloads, sessions, and server restarts. The server requires an initialized local
SQLite database and a music folder, but no API key or hosted service.
Sources are explicitly classified as music, audiobooks, or podcasts. Existing
sources and tracks default to music. Audiobooks are grouped into books by album
title and author, with chapters ordered by disc and track number. Podcast audio
is grouped into shows by album title and publisher, with episodes newest first
using published metadata and file-date fallback. The Audiobooks and Podcasts
routes provide collection cards, detail pages, collection playback, likes, and
offline saving. Music Albums, Artists, Home suggestions, metadata providers, and
Quick picks remain music-only. Jellyfin sources select one discovered library;
each library is stored as a separate source so one Jellyfin server can expose
music, books, and podcasts independently.
The sidebar's up-to-eight-item `Quick pick` list mixes tracks and albums using
the signed-in user's successful playback starts, with one item per line. Each
start is retained as a timestamped event and receives exponential time decay
with a seven-day half-life; album scores sum the decayed scores of their tracks.
Artwork is the play control. The small type icon and title form one link to the
track's album row, its primary artist page when it has no album, or the album
detail page, while every artist credit links to its artist page. Right-clicking
or long-pressing a row opens the same track or album context menu used elsewhere
in the app. The visible order stays fixed while the pointer or keyboard focus is
inside the list, then adopts the latest order after the interaction ends. Tracks
use their album cover. Playlist playback contributes starts through its tracks,
while the mixed Quick pick list itself remains limited to tracks and albums.

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm build
```

`pnpm test` runs the cross-platform TypeScript and Vue workspace tests.
Android's Kotlin tests use `pnpm android:test`, which runs Capacitor sync first
and requires the Android and Java toolchain described below. After linting, CI
runs Web, Server, shared UI, Desktop, and Android tests in parallel jobs. Any
failed test suite blocks the build jobs.

Build output: `apps/web/.output` and `apps/server/dist`. Start the built server
with `node apps/server/dist/index.js`, and the web app with
`node apps/web/.output/server/index.mjs` (separate terminals).

## Offline SPA

The web app is client-rendered in SPA mode but keeps its Nitro web server for
the SPA document and local server discovery. Nuxt PWA generates the manifest,
service worker, and installable shell during `pnpm build`. The service worker
precaches application chunks, local fonts and icons, and the SPA navigation
fallback. Track and artist artwork uses CacheFirst runtime caching; API JSON is
owned by TanStack Query rather than duplicated in the service worker.
Development enables the PWA development server as well, so the manifest and
development service worker are served as PWA assets instead of the SPA HTML
fallback.

Authenticated server state is cached with TanStack Vue Query and persisted per
server and user in IndexedDB. Previously visited catalog pages, details,
playlists, settings, likes, queue, quick picks, and tasks remain available with no
application-level expiry, subject to browser storage eviction. Discovery,
health checks, filesystem browsing, and metadata-candidate searches remain
ephemeral.

Tracks become playable offline only after the cloud-download control beside the
favorite action has saved them. Saving requests persistent browser storage,
downloads the complete original audio and available artwork into Cache
Storage, and records the track in a local manifest. The same control removes
the offline copy. Queue changes remain local while the server is unreachable and
the latest snapshot is sent after reconnection; other mutations are disabled
offline. Logging out or disconnecting clears persisted queries and saved audio.
Playlist offline saving reuses the same per-track manifest and skips unavailable
or unresolved entries. Offline playback follows playlist order and includes
only tracks that were saved.

Settings → Library includes an enabled-by-default `Make my liked titles
available offline` preference. It is stored separately for each server and
user. While connected, the authenticated web app pages through the complete
liked-track catalog and saves available tracks that are not already present in
the per-track manifest. New or changed likes trigger the same synchronization.
Turning the preference off stops automatic saves; it does not remove existing
offline copies because those may have been created manually.

Browser quotas and eviction still apply. Service-worker registration and offline
playback require one successful online load first, and direct offline routes are
limited to the cached SPA shell and query pages that were previously visited.

## Desktop prototype

`apps/desktop` contains a Tauri 2 desktop shell that embeds the statically
generated Nuxt client. It requires Rust 1.90 or newer and the Tauri platform
prerequisites for the target operating system.

Launch the complete development stack and native window:

```sh
pnpm desktop:dev
```

Build a release executable without creating an installer:

```sh
pnpm desktop:build
```

The executable is written under `apps/desktop/src-tauri/target/release/` and
still connects to a separately running Peridot server. Installer bundling,
code signing, automatic updates, native secure credential storage, and an
embedded server are not included in this prototype.

## Android application

`apps/android` packages the generated Nuxt client with Capacitor 8 and adds a
native Kotlin Media3 service for background playback and Android Auto. The
phone UI remains the shared Vue application; browser deployments continue to
use the existing `HTMLAudioElement` adapter.

The Android app requires Android Studio, Android SDK 36, build tools, and a
JDK supported by AGP. The current project uses `minSdk 28`, Java 21, and the
local Pixel AVD. Android Auto testing uses the SDK's Desktop Head Unit with a
compatible physical device.

```sh
pnpm android:sync
pnpm android:dev
pnpm android:test
pnpm android:instrument
pnpm android:build
pnpm android:bundle
```

`android:sync` builds the shared contracts package, generates the client with
the service worker disabled, and copies it into the Capacitor project.
`android:test` runs Kotlin unit tests.
`android:instrument` runs the MediaBrowser instrumentation test on a connected
device or emulator. `android:build` creates the debug APK, while `android:bundle`
creates signed release APK and AAB artifacts when
`apps/android/android/signing.properties` is present.

Generate the local upload key once and back it up before Play submission:

```powershell
keytool -genkeypair -keystore .peridot/android-release.keystore `
  -alias peridot-upload -keyalg RSA -keysize 4096 -validity 10000
```

Store the path and passwords in the ignored
`apps/android/android/signing.properties`. Never commit the keystore or
properties file. The generated application ID is `app.peridot.android`.

The native service exposes Android Auto roots for Queue, Liked songs, Albums,
Artists, and Playlists plus media search. Auto access requires the server to be
reachable; mobile offline playback is available in the phone UI. The Android
WebView uses the exact origin `http://localhost`, which is added to the server's
CORS and realtime allowlists. Android permits cleartext HTTP so users can
connect to a self-hosted server on their LAN.

The Capacitor bridge logs plugin payloads at verbose level when logging is
enabled. Android builds therefore use `loggingBehavior: "none"` so session
tokens are never printed to logcat.

## Windows package-manager setup

If PowerShell cannot find pnpm, enable Corepack's pnpm shim in your existing
user npm bin directory (no administrator terminal required):

```powershell
corepack enable --install-directory "$env:APPDATA\npm" pnpm
pnpm --version
```

This uses the pnpm version pinned in package.json. Ensure the user npm bin
folder is on PATH; it is already configured on the initial development machine.
Enabling Corepack without an install directory may fail when Node is installed
under Program Files. Turbo and nested scripts need pnpm itself on PATH.

## Structure

- `apps/web`: Nuxt 4 SPA/PWA application and TanStack Query cache.
- `apps/server`: authenticated Fastify catalog/task/audio API and Prisma 8 SQLite storage.
- `apps/desktop`: Tauri 2 desktop shell sharing the generated web client.
- `apps/android`: Capacitor Android client, native Media3 playback, offline
  cache, and Android Auto MediaLibraryService.
- `packages/contracts`: shared API types.
- `packages/ui`: shared brand tokens and reusable Button, Input, Badge, Slider, Gradient, ProgressCircle, PeridotSpinner, and classic Spinner components.
- `packages/player`: shared playback state contract; the web app owns the browser audio adapter.
- `packages/plugin-sdk`: initial manifest contract, no execution runtime.
- `packages/config`: shared TypeScript configuration.
- `plugins`: planned official connectors and metadata providers.
- `infra`: future self-hosted deployment assets.

## Localization

The web app uses Nuxt I18n with one fixed locale, `en-US`. Routes remain
unprefixed, browser-language detection is disabled, and there is no language
selector or stored locale preference yet. Runtime copy is defined in
`apps/web/i18n/locales/en-US.json`; pages and components resolve it through
`useI18n`, while reusable `@peridot/ui` components receive already-localized
accessible labels from their callers.
Keep runtime copy focused on the user's action or current state instead of
making the product the grammatical subject or repeating its name before generic
nouns such as "server" and "account." Reserve the runtime product name for the
application name and browser page titles.

Server responses carry stable `MessageDescriptor` values for errors, tasks,
provider definitions, and metadata details. The browser owns their presentation,
and the shared contract intentionally contains no duplicate English fallback
fields. Adding a future locale requires a new locale resource and locale entry
plus translations for those descriptor keys; API payloads and stored task
messages do not need locale-specific prose.

## UI components

The preview uses shared shadcn-vue components from `@peridot/ui/components/ui/*`,
built on Reka UI and styled with Tailwind CSS 4 through its Vite plugin. Theme
tokens use the owner-provided light/dark palette, fonts, radii, and shadows in
`packages/ui/src/tokens.css`; the web stylesheet maps them to
Tailwind utilities and explicitly scans the shared package. Components are
imported explicitly, keeping Nuxt component discovery separate from shared UI.
Poppins is the main UI font, bundled locally via `@fontsource/poppins`.
`components.json` files track the registry aliases for the web and UI workspaces.
Upstream component licensing is preserved in `packages/ui/THIRD_PARTY_NOTICES.md`.
The shared PeridotSpinner uses the animated Peridot brand SVG and substitutes the static
brand mark when the user prefers reduced motion.
The separate classic Spinner follows shadcn-vue's animated LoaderIcon pattern and
is available for future loading states; it is not rendered by the current app.
The shared ProgressCircle accepts a finite `value` from 0 through 100 and clamps
out-of-range values. Its ring keeps rotating while the numeric value controls
the determinate arc, which starts empty and transitions smoothly to the current
value. It becomes a reduced-motion-safe circular spinner when the value is
omitted or invalid. It provides semantic color, size,
accessible-label, optional percentage, custom center-content variants, and
configurable stroke width defaulting to 6. The administrator-only topbar task
indicator uses it to show the average progress of every running or queued task,
appears only while work is pending,
shows indeterminate progress before a queued task starts, and reveals the
current and queued tasks in a hover/focus tooltip. Clicking the circle opens
Settings → Admin → Tasks, which lists active work and paginated terminal history.
The same indicator remains visible in the fullscreen Settings header for
administrators.
When the server health monitor reports a lost connection, the same topbar slot
replaces the progress circle with a static `ooui:network-off` Offline tag in the
standard foreground color and an accessible explanation for every signed-in
user. Administrator task progress returns after a healthy probe.
The Settings sidebar has a persistent Log out action at its bottom. Logout
first asks for confirmation, then attempts to revoke the current session, keeps
the selected server for sign-in, and returns to the current Settings page after
authentication.
The web shell mounts one app-level Reka UI toast region at the top-right, below
the 64px topbar. It uses the same placement in the main shell and fullscreen
settings layouts. It reports source and provider changes, likes, download
failures, and queue operations. Task activity is shown only through the
administrator topbar and Tasks settings view, while connection loss is indicated
by the topbar network-off warning without a toast. When the connection recovers,
an authenticated session receives a `Back online` toast.
The web shell opens one authenticated realtime connection for task, catalog, and
administrator log events. Task progress is coalesced, catalog changes carry only
a revision marker, and HTTP remains the recovery source after a connection gap.
The connection uses a short-lived single-use ticket, reconnects with bounded
backoff, and checks public health only while the socket is unavailable.

## Configuration

Server defaults to loopback port 17430. Set HOST and PORT in your shell to override.
See apps/server/.env.example for variables required by built server startup.
Environment files are not loaded automatically. The development command supplies
the local defaults described in Quick start. `DATABASE_URL` selects the local SQLite file,
`MUSIC_LIBRARY_PATH` seeds the first local music source, and
`PERIDOT_WEB_ORIGINS` lists web and desktop origins allowed to call the API. Its
defaults support the local web development server and Tauri's HTTP and custom
scheme webview origins; add the exact web origin when accessing Peridot from
another device.
Discogs metadata uses an administrator-provided personal access token. Peridot
encrypts provider credentials at rest with an automatically generated local key
stored as `<database path>.key`, for example `peridot.db.key`, and reuses that
file across restarts. The file is ignored by Git and should be backed up
separately from database backups. Deployments may instead set
`PERIDOT_CREDENTIAL_KEY` to a base64-encoded 32-byte key. When existing
credentials are present, a working environment key is validated and imported
into the local key file so later starts do not require the variable. If stored
credentials exist but their key is unavailable, startup stops rather than
replacing it with an incompatible key. Keep using the same key after credentials
have been stored; changing it makes their existing ciphertext unreadable.
Administrators can restart the running server from Settings â†’ Admin â†’ Server
after confirming the action. The server briefly disconnects clients, rebuilds
its Fastify runtime on the same host and port, interrupts running tasks, and
resumes queued tasks. Sessions and persisted data are retained.
Settings → Admin → Server also persists an automatic source-refresh toggle and
cron expression. It is enabled by default with the five-field schedule
`0 3 * * *`. When enabled, Peridot queues an all-source library scan at server
startup and on each cron occurrence. Five-field expressions use minute
precision; six-field expressions may add seconds. Cron times use the server's
local timezone. Scheduled scans share the normal task queue, coalesce with
active library scans, and continue into metadata matching after a successful
scan. Disabling the schedule prevents both startup and recurring automatic
scans while retaining manual rescans.
Administrators can manage where the server gets raw audio files from
Settings → Admin → Sources. The add-source dialog offers a folder inside the
server or a Jellyfin instance. Existing URL sources remain listed and removable
for compatibility, but the dialog no longer offers URL creation. Folder sources
seed from `MUSIC_LIBRARY_PATH` on first launch.
Jellyfin sources use the instance's HTTP(S) base URL and an
administrator-generated API key. The connection is validated before it is
stored, and the API key is encrypted with the same local credential-key
mechanism as metadata-provider credentials. Multiple Jellyfin instances with
different URLs are supported. Adding a folder or Jellyfin source queues its
source-scoped library scan automatically. A successful scan queues a linked
metadata-fetch task for the same source. Each scannable source row has a
three-dot action menu for a source-scoped rescan or confirmed removal. Source
removal remains available while work is active; the server first stops running
or queued work for that source and stops unscoped all-source work that could
access it. Unrelated source-specific tasks continue.
Jellyfin scans request only `Audio` items, page through the complete result set,
import Peridot-supported original audio containers, and cache bounded album
artwork. Item IDs and ETags provide stable identity and change detection. Static
audio and byte-range requests are proxied through Peridot with the encrypted API
key remaining server-side. Unsupported Jellyfin audio containers are skipped and
reported in the scan error count. Pages are processed incrementally so large
remote libraries update progress without holding the complete Jellyfin catalog
in memory. Jellyfin requests allow up to 60 seconds for response headers because
large library pages can be slow to prepare. Task failures, partial-completion
warnings, and startup interruptions are written to the administrator log.
Source rows show the current available file count and latest successful sync
time. The Settings sidebar shows the number of configured sources beside
Sources. Both refresh from the shared source query after a completed library
scan. Active tasks add a compact progress circle beside Tasks, and active
metadata tasks also identify Metadata. The Sources item keeps its configured
source count visible during scans; source-specific scan progress remains on
each source row.
The local-folder picker supports case-insensitive deep folder search without
requiring folders to be expanded first.

Administrators can configure ordered metadata providers from
Settings → Admin → Metadata. MusicBrainz requires a contact email or URL for its
User-Agent and is enabled automatically for the first administrator. Discogs
uses a personal access token validated against the user's Discogs account.
Peridot stores tokens encrypted and never returns them to browser code.
Administrators can disable, re-enable, or edit a provider without deleting its
stored configuration. After a library scan discovers new or changed tracks,
Peridot resolves unmatched tracks in provider order in the background.
Requests to each provider are rate-limited separately.
Artist name and portrait matching runs after track matching in the same metadata
task. Provider candidates are merged for correction, and matched artist names,
portrait provenance, and cached image content are stored locally. Artist image
downloads accept only bounded HTTPS JPEG, PNG, or WebP responses from approved
Discogs hosts.
Each containing folder can supply an album fallback title when tracks have no
album tag or their tags disagree. Album identity uses provider release IDs
first, then album artists and title, and finally source folder and title.
Unmatched tracks join the unique release found in the same folder and album
title group; ambiguous folders remain separate.
The Metadata page also has a Refresh metadata action that queues automatic
matching without rescanning audio files and a confirmed Reset metadata action
that removes all automatic and manual track matches so tracks use their original
file tags. Refresh is disabled and labeled as processing while any task is
active. Reset waits until queued and running tasks finish. A configured
provider kind cannot be added twice and is disabled or re-enabled instead of
removed.
Provider metadata is stored separately from local file tags, including
provider-specific details such as Discogs release year, label, catalog number,
country, format, track position, and genres. Discogs genres and styles plus
MusicBrainz release genres and tags become the active track genres when a match
is applied; reverting the match restores embedded or source genres. Track
context menus merge candidates from every enabled provider and let signed-in
users choose another match or return to the original file metadata. Artist
context menus provide the equivalent profile correction and local-metadata
restore actions. Reset metadata clears track and artist matches and removes
cached artist portraits. Peridot never rewrites the audio files.

Synchronize an existing local database with the current Prisma 8 contract:

```sh
pnpm db:update
```

To intentionally discard local catalog, account, server queue, and settings data
and start from an empty database:

```sh
pnpm db:reset
```

The web onboarding checks `GET /api/auth/status`. An empty server permits exactly
one `POST /api/auth/bootstrap`, which creates the first user — with an email
address, display name, and password — as an administrator. Email is the sole
sign-in identifier, and every account must have a unique, case-insensitive
display name of 2–80 characters. Existing users sign in with their email address
and password through `POST /api/auth/sessions`. Signed-in users can update their
display name through `PUT /api/users/me`; administrators can manage every
account from Settings → Admin → User Management. They can create members or
administrators and edit display names, email addresses, passwords, and roles
through `GET/POST /api/admin/users` and
`PUT/DELETE /api/admin/users/:id`. Administrators cannot delete their own
account, change their own role, remove the final administrator, or leave the
server without an administrator. Credential or role changes revoke the affected
user's sessions, and deleting an account removes its sessions and user-owned
library state. Passwords are stored as salted scrypt hashes and opaque sessions
expire after 30 days. If an authenticated browser request loses its session, the
web app clears the stale local session and returns to sign-in with its original
destination preserved.
Except for health and these setup/sign-in routes, server routes require the
returned session as `Authorization: Bearer <token>`.
Queue a scan with `POST /api/library/scans`, list tasks with `GET /api/tasks`,
read one with `GET /api/tasks/:id`, page tracks and summaries with
`GET /api/tracks`, `GET /api/albums`, and `GET /api/artists`, and stream a track
with `GET /api/tracks/:id/audio`. Catalog pages default to 100 tracks or 50
album/artist summaries, with `cursor`, `query`, sort, availability, and
authenticated like filters. `POST /api/tracks/resolve` hydrates at most 500
queue track IDs in requested order.
Signed-in clients list derived books with `GET /api/audiobooks`, read one with
`GET /api/audiobooks/:id`, and page its chapters through
`GET /api/audiobooks/:id/chapters`. Podcast shows use
`GET /api/podcasts`, `GET /api/podcasts/:id`, and
`GET /api/podcasts/:id/episodes`. Track responses include `mediaType` and
optional `publishedAt`. `/api/tracks` filters by media type and defaults to
music; `mediaType=all` supports mixed search and playlists.
`POST /api/realtime/ticket` issues a 30-second single-use ticket for the
authenticated `/api/realtime` WebSocket. Subscriptions cover tasks, catalog
revisions, and administrator-only logs; catalog events never include track rows.
Authenticated clients list the current
user's favorites with `GET /api/likes`; `POST /api/likes` and
`DELETE /api/likes` accept an independent track, album, artist, or playlist
target. Track
likes use catalog IDs, album likes use canonical catalog album IDs, and artist
likes match trimmed, case-insensitive metadata identities. Playlist likes are
owner-only and use the playlist ID.
Signed-in users create and list private playlists with
`POST /api/playlists` and `GET /api/playlists`; detail, rename, and delete use
`GET/PATCH/DELETE /api/playlists/:id`. Add and remove entries through
`POST /api/playlists/:id/items` and
`DELETE /api/playlists/:id/items/:itemId`, and replace the complete item order
with `PUT /api/playlists/:id/items/order`. The item request accepts either a
catalog track ID or an external reference containing a provider, provider track
ID, title, artist, album, and duration. `GET /api/playlists?trackId=<id>` marks
which returned playlists already contain that catalog track. `GET /api/queue`
returns the current
user's source-order track IDs, active track, and remaining randomized pool;
`PUT /api/queue` atomically replaces that snapshot. Duplicate IDs, an active
track outside the queue, and random-pool entries outside the non-active queue
are rejected. Randomized playback keeps the visible queue order unchanged,
plays each eligible track once per pass, and resumes the same pass after a
reload. When automatic source refresh is enabled, an all-source library scan
starts after server initialization and recurs on its configured cron schedule.
Explicitly queued tasks resume after a restart while tasks that were running
become interrupted. Library scans and metadata fetches are separate linked tasks
with queued, running, completed, failed, interrupted, or stopped states and
determinate or indeterminate progress. Active tasks can be stopped from
Settings → Admin → Tasks; stopping a queued task prevents it from starting,
while stopping running core work aborts the scan or metadata executor before the
request completes. Finished task history is retained for 30 days, capped at the
newest 500 terminal tasks. MP3, M4A/AAC, OGG/Opus, WAV, and FLAC files are
cataloged; originals are streamed without transcoding. Catalog responses include
nullable disc and track numbers used for album ordering and an effective genre
array. A metadata-version marker makes the next scan backfill those fields once
for catalog rows created before the columns existed, including files whose
contents have not changed. The web shell receives shared task events for the
administrator topbar and Tasks settings view. The server maintains indexed
catalog projections and returns bounded cursor pages so the browser never
downloads the complete catalog.
Successful browser playback starts are recorded with
`POST /api/tracks/:id/plays`. The authenticated per-user mixed ranking is
available from `GET /api/quick-picks`; the server returns up to eight ordered track
and album entries with their current catalog summaries after applying seven-day
exponential decay.
Album covers are deduplicated by content hash in the local SQLite database and
served through short-lived signed URLs keyed by the deduplicated cover ID, so
browser image requests do not expose the user session and tracks sharing
artwork reuse one browser-cache entry. Tracks without readable embedded or
folder artwork keep the semantic music-note placeholder in album cards, album
details, and the player.
Administrators can search local directories recursively with
`GET /api/admin/filesystem/search?query=<term>`; results are bounded and do not
follow symbolic links.
`GET /api/admin/server` returns catalog counts plus the persisted source-refresh
schedule and its next run. `PUT /api/admin/server` accepts
`{ "sourceRefresh": { "enabled": boolean, "cron": string } }`, validates the
expression, persists it, and reschedules the active timer without restarting the
server.
Creating a folder or Jellyfin source with `POST /api/admin/sources` returns the
source plus its automatically queued scan task. A Jellyfin create request uses
`kind: "integration"`, `integration: "jellyfin"`, `url`, and the write-only
`apiKey`. Administrators can rescan one scannable source with
`POST /api/admin/sources/:id/scans`; a scoped scan only changes availability for
tracks from that source and queues metadata matching for that source. Requests
are queued behind active work, and equivalent requests that are still queued
coalesce into the existing task. Administrators stop an active task with
`POST /api/admin/tasks/:id/stop`.
Source creation accepts `mediaType`, and Jellyfin creation also accepts the
selected `libraryId`. Administrators discover Jellyfin libraries through
`POST /api/admin/integrations/jellyfin/libraries` using write-only connection
credentials. `PATCH /api/admin/sources/:id` changes a source's media type; the
server stops source-scoped operations and queues a rescan that reclassifies
unchanged tracks.
Administrators manage metadata providers through
`GET/POST /api/admin/metadata-providers`,
`GET /api/admin/metadata-providers/definitions`,
`PUT /api/admin/metadata-providers/order`, and
`PUT /api/admin/metadata-providers/:id` with configuration, credential, or
enabled-state updates.
Disabled providers remain listed but are excluded from matching.
Administrators restart the server through `POST /api/admin/server/restart`,
which returns `202` with `{ "status": "restarting" }`.
`POST /api/admin/metadata/refresh` queues automatic metadata matching without a
file scan, while
`POST /api/admin/metadata/reset` clears every track and artist override and
removes cached artist portraits. Signed-in clients can list merged provider
candidates and apply or clear an override through
`GET /api/tracks/:id/metadata/candidates` and
`PUT/DELETE /api/tracks/:id/metadata`, and through the equivalent
`GET /api/artists/:id/metadata/candidates` and
`PUT/DELETE /api/artists/:id/metadata` routes. Cached portraits are served from
short-lived artist-scoped `GET/HEAD /api/artists/:id/image` URLs.
Task responses expose only safe titles, source display names, bounded labeled
details, progress, and lifecycle timestamps. Source paths and provider
credentials are never included. Core task kinds are `library_scan` and
`metadata_fetch`; future isolated jobs may use validated
`plugin:<plugin-id>:<job-name>` kinds without loading plugin code into Fastify.

## Linting and formatting

ESLint checks JavaScript, TypeScript, and Vue files across the workspace using
recommended JavaScript/TypeScript rules and Vue's essential rules. Prettier owns
formatting; eslint-config-prettier prevents conflicting style rules.

Run `pnpm check` to check lint and formatting, `pnpm lint:fix` for automatic lint
fixes, and `pnpm format` to format files. CI checks both lint and formatting.
Type checking remains a separate `pnpm typecheck` command.

## Commit messages

Use Conventional Commits: `type(optional-scope): short description`, such as
`feat: add library scanning` or `fix(player): resume playback`.
Supported types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, and `test`.

`pnpm install` installs the Husky commit-msg hook automatically. Run `pnpm prepare`
to reinstall it if needed. The hook rejects invalid messages before committing;
pull request CI checks all commits introduced by the pull request.
To check a message manually: `echo "feat: add library scanning" | pnpm commitlint`.

## Branches and releases

- `dev`: active development; target ordinary pull requests here.
- `master`: beta channel; promote reviewed changes from dev.
- Git tags: releases. Use version tags such as `v0.1.0` for release candidates
  approved by the owner. CI checks dev, master, and v-prefixed tags; it does not publish.

## Continue the work

Read [AGENTS.md](../AGENTS.md), [project brief](PROJECT.md),
[decisions](DECISIONS.md), and [handoff](HANDOFF.md).

## License

Licensed under the [Apache License, Version 2.0](../LICENSE).

## UI layout and styling

The web preview uses a sidebar, scrollable main content, and a fixed bottom
player. Mobile navigation is collapsible. Use standard Tailwind utilities,
existing shadcn-vue variants, and the shared semantic theme tokens only; custom
CSS, inline styles, arbitrary utility values, and local theme overrides are
not permitted. Album placeholders use the theme's muted/secondary surfaces.
When no readable album image is available, the music-note placeholder remains.

UI icons use Iconify's offline Vue component with individually bundled icon
data. UI icons are Basil, with `basil:play-solid` for play,
`akar-icons:drag-vertical` for queue drag handles, and the owner-requested
`at-icons:waveform` for the current-track indicator and `ooui:network-off` for
the topbar connection warning.
Icons render on the server and need no runtime icon API or network access.
