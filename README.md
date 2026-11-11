# Peridot

Your music. Your space. A self-hosted music platform with a plugin-first ecosystem.

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
→ Administration by disconnecting first. Server selection continuously probes
the typed address and scans the web host's private IPv4 networks for Peridot
servers on port 17430; selecting a
discovered server advances onboarding. The routed library view reads scanned
tracks from the authenticated catalog API and refreshes after a completed scan.
The Albums view derives groups from available track tags, keeps same-named
albums by different artists separate, and opens a detail page with disc/track
ordering and album playback actions. Album artwork is read from embedded
front-cover tags or same-folder `cover`, `folder`, `front`, or `albumart` images.
Tracks without album tags remain in the Library view and are omitted from
Albums. The Artists view groups every tagged performer in the catalog, including
artists whose tracks have no album metadata, and opens an artist page with album
cards, an all-tracks list, and artist playback actions. Artist names in the
shared track list and album detail link to their derived artist pages. The fixed
player streams available tracks from the authenticated server through a
short-lived, track-scoped playback URL, with play/pause, seeking, volume,
previous/next, persistent randomized playback, automatic advancement, and
retryable loading and error states. Audio playback is owned by the application
root, so entering fullscreen settings keeps the current track playing while its
controls are hidden. Original files are served with HTTP range support and are
not transcoded. One durable queue is
stored per signed-in user, restores paused after reloads, and opens in a
player-clearing, width-constrained custom right-side panel where upcoming tracks
can be reordered or removed and their artist links opened. The queue button
directly toggles the panel. The panel and overlay stop above the fixed player,
leaving the player unobstructed. Queue rows remain draggable without closing
the panel, which is non-modal so the player controls remain interactive.
Right-clicking a track row opens a Reka UI context menu for
playback, adding the track next in the queue, favorites, authenticated download,
album navigation, and per-artist navigation when a track has multiple credits.
Add to queue stays available for tracks already in the queue and moves them back
to the next position instead of creating duplicates. Right-clicking or
long-pressing an album or artist card opens a collection menu for playing it,
changing its favorite state, or opening its details.
Tracks, albums, and artists can be liked independently from their rows, cards,
and detail headers. Likes are private to the signed-in user and persist across
reloads, sessions, and server restarts. The server requires an initialized local
SQLite database and a music folder, but no API key or hosted service.

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm build
```

Build output: `apps/web/.output` and `apps/server/dist`. Start the built server
with `node apps/server/dist/index.js`, and the web app with
`node apps/web/.output/server/index.mjs` (separate terminals).

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

- `apps/web`: Nuxt 4 application shell.
- `apps/server`: authenticated Fastify catalog/scanning/audio API and Prisma 8 SQLite storage.
- `apps/desktop`: documented future desktop shell.
- `packages/contracts`: shared API types.
- `packages/ui`: shared brand tokens and reusable Button, Input, Badge, Slider, Gradient, and Spinner components.
- `packages/player`: shared playback state contract; the web app owns the browser audio adapter.
- `packages/plugin-sdk`: initial manifest contract, no execution runtime.
- `packages/config`: shared TypeScript configuration.
- `plugins`: planned official connectors and metadata providers.
- `infra`: future self-hosted deployment assets.

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
The shared Spinner uses the animated Peridot brand SVG and substitutes the static
brand mark when the user prefers reduced motion.
The web shell mounts one app-level Reka UI toast region in the bottom-right. It
sits above the fixed player in the main shell and against the bottom edge in
playerless fullscreen layouts. It keeps library-scan progress visible across
route changes and keeps a single connection-loss error visible until the
configured server health endpoint responds again.

## Configuration

Server defaults to loopback port 17430. Set HOST and PORT in your shell to override.
See apps/server/.env.example for variables required by built server startup.
Environment files are not loaded automatically. The development command supplies
the local defaults described in Quick start. `DATABASE_URL` selects the local SQLite file,
`MUSIC_LIBRARY_PATH` seeds the first local music source, and
`PERIDOT_WEB_ORIGINS` lists browser origins allowed to call the API. Its defaults
support the local web development server; add the exact web origin when accessing
Peridot from another device.
Administrators can manage where the server gets raw audio files from
Settings → Sources. Each source is a local folder, an external URL, or a future
integration such as Spotify or YouTube Music. Local folder sources seed from
`MUSIC_LIBRARY_PATH` on first launch and are used by library scans; URL and
integration sources are stored but not indexed yet. Each local source row has a
three-dot action menu for a source-scoped rescan or confirmed removal.
The local-folder picker supports case-insensitive deep folder search without
requiring folders to be expanded first.

Administrators can configure ordered metadata providers from
Settings → Metadata. MusicBrainz is supported first and requires a contact email
or URL for its User-Agent. Peridot enables MusicBrainz automatically when the
first administrator is created and uses that account's email as the contact.
It does not require an API key. Administrators can
disable and re-enable a provider without deleting its stored configuration.
After a library scan discovers new or changed tracks, Peridot matches them
against enabled providers in the background at no more than one MusicBrainz
request per second.
Each containing folder is treated as an album: the folder name supplies the
release title when tracks have no album tag, or when their tags disagree.
The Metadata page also has a Refresh metadata action that re-runs automatic
matching without rescanning audio files and a confirmed Reset metadata action
that removes all automatic and manual track matches so tracks use their original
file tags. A configured provider kind cannot be added twice and is disabled or
re-enabled instead of removed.
Provider metadata is stored separately from local file tags, and track context
menus let signed-in users choose another match or return to the original file
metadata. Peridot never rewrites the audio files.

Synchronize an existing local database with the current Prisma 8 contract:

```sh
pnpm db:update
```

To intentionally discard local catalog, account, queue, and settings data and
start from an empty database:

```sh
pnpm db:reset
```

The web onboarding checks `GET /api/auth/status`. An empty server permits exactly
one `POST /api/auth/bootstrap`, which creates the first user — with an email
address, username, and password — as an administrator. Existing users sign in
with their username or email address and password through
`POST /api/auth/sessions`. Passwords are stored as salted scrypt hashes and
opaque sessions expire after 30 days.
Except for health and these setup/sign-in routes, server routes require the
returned session as `Authorization: Bearer <token>`.
Start a scan with `POST /api/library/scans`, poll
`GET /api/library/scans/:id`, list tracks with `GET /api/tracks`, and stream a
track with `GET /api/tracks/:id/audio`. Authenticated clients list the current
user's favorites with `GET /api/likes`; `POST /api/likes` and
`DELETE /api/likes` accept an independent track, album, or artist target. Track
likes use catalog IDs, while album and artist likes match trimmed,
case-insensitive metadata identities. `GET /api/queue` returns the current
user's source-order track IDs, active track, and remaining randomized pool;
`PUT /api/queue` atomically replaces that snapshot. Duplicate IDs, an active
track outside the queue, and random-pool entries outside the non-active queue
are rejected. Randomized playback keeps the visible queue order unchanged,
plays each eligible track once per pass, and resumes the same pass after a
reload. Scans are explicit and never run at
startup. MP3, M4A/AAC, OGG/Opus, WAV, and FLAC files are cataloged; originals are
streamed without transcoding. Catalog responses include nullable disc and track
numbers used for album ordering. A metadata-version marker makes the next scan
backfill those fields once for catalog rows created before the columns existed,
including files whose contents have not changed. The web shell polls an active
scan globally for its progress toast and checks the public health endpoint every
ten seconds while connected.
Album covers are deduplicated by content hash in the local SQLite database and
served through short-lived, track-scoped cover URLs so browser image requests do
not expose the user session. Tracks without readable embedded or folder artwork
keep the semantic music-note placeholder in album cards, album details, and the
player.
Administrators can search local directories recursively with
`GET /api/admin/filesystem/search?query=<term>`; results are bounded and do not
follow symbolic links.
Administrators can rescan one local source with
`POST /api/admin/sources/:id/scans`; a scoped scan only changes availability for
tracks from that source. Administrators manage metadata providers through
`GET/POST /api/admin/metadata-providers`,
`PUT /api/admin/metadata-providers/order`, and
`PUT /api/admin/metadata-providers/:id` with an `enabled` boolean.
Disabled providers remain listed but are excluded from matching.
`POST /api/admin/metadata/refresh` re-runs automatic metadata matching without
a file scan, while
`POST /api/admin/metadata/reset` clears every track override. Signed-in clients
can list MusicBrainz candidates for a track and apply or clear an override
through `GET /api/tracks/:id/metadata/candidates` and
`PUT/DELETE /api/tracks/:id/metadata`.

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

Read [AGENTS.md](AGENTS.md), [project brief](docs/PROJECT.md),
[decisions](docs/DECISIONS.md), and [handoff](docs/HANDOFF.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## UI layout and styling

The web preview uses a sidebar, scrollable main content, and a fixed bottom
player. Mobile navigation is collapsible. Use standard Tailwind utilities,
existing shadcn-vue variants, and the shared semantic theme tokens only; custom
CSS, inline styles, arbitrary utility values, and local theme overrides are
not permitted. Album placeholders use the theme's muted/secondary surfaces.
When no readable album image is available, the music-note placeholder remains.

UI icons use Iconify's offline Vue component with individually bundled icon
data. UI icons are Basil, with `basil:play-solid` for play and the owner-requested
`akar-icons:drag-vertical` for queue drag handles.
Icons render on the server and need no runtime icon API or network access.
