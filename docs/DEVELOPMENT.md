# Peridot development reference

## Toolchain

Use Node 24.15 or newer within Node 24 and pnpm 11.25.0. The project pins its
preferred Node runtime through pnpm and commits `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Husky installs the repository Git hooks during `pnpm install`. The `pre-commit`
hook runs `npm run version:sync`, formats the repository, and stages the
version-synchronized manifests. The `commit-msg` hook validates the message
with Commitlint.

Development web runs at http://localhost:17430. Nuxt proxies API traffic to a
private Fastify listener on port 17431. A built deployment serves the web
application, API, audio, and realtime traffic from one listener on port 17430.

Set `DATABASE_URL` or `MUSIC_LIBRARY_PATH` to override the development database
or default folder source.

## Structure

- `apps/web`: Nuxt 4 SPA/PWA client and TanStack Query cache.
- `apps/server`: authenticated Fastify API, SQLite storage, scans, playback, and
  realtime updates.
- `apps/desktop`: Tauri 2 shell around the generated web client.
- `apps/android`: Capacitor application with native Media3 playback.
- `packages/contracts`: shared API types.
- `packages/ui`: theme tokens and shadcn-vue components.
- `packages/player`: shared playback contracts.
- `packages/config`: shared TypeScript configuration.
- `apps/server/src/source-integrations.ts`: internal registry for trusted source
  integrations.
- `apps/server/src/jellyfin`: Jellyfin discovery, scan, artwork, and playback.

## Source integrations

Jellyfin is a direct built-in integration. Administrators choose Jellyfin from
Settings → Admin → Sources, enter its URL and API key, discover available
libraries, and select one library. Each selected library is stored as a separate
source with its collection type.

Source rows use `Source.configuration` for non-secret values and
`Source.credentialCiphertext` for encrypted credentials. Jellyfin configuration
contains the normalized server URL, library ID, and collection type. The API key
is never returned to the browser.

The internal `SourceIntegrationRegistry` dispatches discovery, validation, scans,
artwork, and audio requests. Adding another trusted integration requires:

1. A server implementation of `SourceIntegrationDefinition`.
2. Registration in `buildApp`.
3. A member of the public `SourceIntegrationKind` union.
4. The corresponding source creation fields and UI form.

Integrations are shipped with Peridot. User-supplied or remotely downloaded
runtime code is not supported.

## Scans and playback

Adding a folder or Jellyfin source queues its source-scoped scan. A successful
scan queues linked metadata matching for the same source. Source scans can be
run independently or together and share the durable task queue.
Failed executor runs automatically return to the queue up to two times before
the task becomes terminally failed.

Jellyfin requests `Audio` and `AudioBook` items in pages of 100. Core commits at
most 100 records per transaction and publishes catalog changes before requesting
the next page. Jellyfin IDs and ETags provide stable identity and change
detection. Unique cover images referenced by each page are fetched in parallel
with bounded concurrency and attached before their tracks commit. Failed cover
fetches do not fail the scan; the existing artwork job retries them afterward.

Playback and byte-range requests are proxied through Peridot while the Jellyfin
API key remains server-side. Artwork uses the same integration boundary and a
deduplicated WebP cache.

Removing any source stops its tasks, retains a hidden source tombstone, and marks
its tracks and catalog projections unavailable in one transaction. Likes,
playlists, play events, playlist entries, catalog artwork, and offline copies are
retained. Local player snapshots are not server state and remain on the device.
Source configuration and encrypted credentials are cleared, and queued artwork
jobs are removed. Normal catalog queries exclude unavailable entries; personal
surfaces can request them explicitly. Re-adding the same source identity restores
the tombstone and track IDs before queuing a scan.

When connected, the client resolves saved offline track IDs and moves stored
audio and manifests to current canonical duplicate IDs. Android may queue a
source-unavailable track when its device-local audio file exists.

## API summary

Administrators create sources with `POST /api/admin/sources`. Jellyfin uses:

```json
{
  "kind": "jellyfin",
  "url": "http://jellyfin.local:8096",
  "apiKey": "server-only-secret",
  "libraryId": "music-library-id",
  "collectionType": "music"
}
```

Libraries are discovered with
`POST /api/admin/source-integrations/jellyfin/discover`:

```json
{
  "configuration": { "url": "http://jellyfin.local:8096" },
  "credentials": { "apiKey": "server-only-secret" }
}
```

Scannable sources use `POST /api/admin/sources/:id/scans`. Administrators can
cancel tasks with `POST /api/admin/tasks/:id/cancel`. Queued tasks are removed;
running tasks stop and remain in terminal history. Source reordering and removal
use the normal `/api/admin/sources` routes.

Metadata providers remain separate from source integrations and are managed
through `/api/admin/metadata-providers`.

## Web application

The Nuxt application is a client-rendered SPA/PWA with a persistent settings
area, sidebar, main content surface, and fixed bottom player. Authenticated server
state is cached with TanStack Query and persisted per server and user in
IndexedDB.

The selected track, active queue, shuffle state, and playback position are
persisted in browser-local storage per server and user. Reloads restore the
snapshot with playback paused. There is no server queue endpoint or database
queue state; playback state is not synchronized across devices.

Offline audio and download-task state are persisted separately from query cache.
All offline-save controls enqueue a device task; the shared worker resolves the
current catalog target, skips existing copies, and downloads one track at a time.
Tasks resume from IndexedDB after reload and surface alongside server work in
Settings → Tasks.

User preferences use `GET /api/users/me/preferences`,
`PUT /api/users/me/preferences`, and
`POST /api/users/me/preferences/initialize` for one-time account initialization.
The client verifies preferences after authentication before starting automatic
liked-title downloads. Uninitialized accounts use the disabled default and do not
import legacy browser-local values.

The shared UI uses standard Tailwind utilities, shadcn-vue variants, theme tokens,
and bundled Basil Iconify SVG data. Do not add component CSS, inline visual
styles, arbitrary Tailwind values, or local theme overrides.

Render catalog artists through `ArtistLink` or `TrackArtistLinks`, and catalog
albums through `AlbumLink`, so navigation and right-click menu behavior remain
consistent across cards, tables, dialogs, the queue, and both player layouts.

## Desktop and Android

The Tauri desktop shell embeds the generated web client and supports signed
update artifacts. The Android application packages the same client with
Capacitor and a native Media3 service for background playback and Android Auto.

## Verification

```sh
pnpm format:check
pnpm version:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm build
```

Server tests prepare an isolated database from the committed migration graph.
The local development database may be rebuilt when a destructive schema change
is explicitly accepted.

## Database workflow

The current Prisma contract is `apps/server/src/prisma/contract.prisma`.
Generated contract artifacts are emitted beside it and must not be edited by
hand.

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:migration:plan --name <snake_slug>
pnpm db:migration:check
```

Review destructive operations before applying them. When data preservation is
required, add an explicit transform in the rendered migration source and
self-emit it before applying the migration.

### Jackett / Torznab imports

In Settings → Sources, select + → Torznab indexer. Enter the feed URL, optional display name, and API key. Peridot reads the feed’s audio capabilities before saving it. Repeat for additional indexers. Existing environment-based installations must add their feeds through this dialog.

Under Settings → Download clients → Add download client, choose qBittorrent. Enter the server base URL and choose an authentication method. Enter the Web UI username and password or an API key from qBittorrent 5.2+ (Preferences → Web UI → API Key), test the connection, and save. Repeat for additional instances. Select that client in each indexer’s download settings along with an existing Peridot folder source. Choose the qBittorrent category and any additional tags. Category save paths use automatic torrent management. Select a folder source that maps to the category’s completed directory. For manual paths, enter the qBittorrent-side path if the two services mount the directory differently. Keep incomplete downloads outside that directory.

Existing per-indexer qBittorrent credentials are migrated at startup. Indexers with the same URL, username, and password share a saved client. Migrated clients use their saved Web UI credentials. Administrators can relink existing indexers from their source action menu.

External imports create owner-scoped `release_import` tasks. While the torrent is
in qBittorrent, the task has `waiting` status and reports transfer progress. Once
complete, Peridot stores the torrent's completed audio paths on the task and
scans only those files. Import tasks do not recursively scan the folder or mark
unseen tracks unavailable, and their metadata child task is limited to the
imported track IDs. Use a normal source rescan when the complete folder must be
reconciled. Cancelling the task leaves the torrent and files untouched.
