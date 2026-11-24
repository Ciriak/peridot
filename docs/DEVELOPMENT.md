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
- `apps/server/src/connectors.ts`: compile-time capability and role registry for
  trusted built-in connectors.
- `apps/server/src/source-integrations.ts`: library-source scan, artwork, and
  playback capability adapter used by the connector runtime.
- `apps/server/src/jellyfin`: Jellyfin discovery, scan, artwork, and playback.

## Connectors

Peridot has one compile-time `ConnectorRegistry`. Connectors are trusted code
shipped with Peridot and are resolved by role:

- Library sources: folders and Jellyfin.
- Release indexers: Torznab.
- Download clients: qBittorrent.
- Metadata providers: MusicBrainz and Discogs.
- Playlist accounts: schema and capability contract only until an adapter is
  registered.

Role-specific capabilities keep settings and runtime behavior focused. Library
sources implement discovery, validation, scans, artwork, and audio access.
Release indexers implement release search. Download clients implement transfer
management. Metadata providers implement lookup and validation. Playlist
accounts implement remote playlist listing, reading, and synchronization input.

Registering a trusted connector requires a server implementation, registration
in `buildApp`, the public response contract when it is supported, and a matching
settings form. Do not load connector code from users or remote services.
Credentials are encrypted with the credential purpose for their role and never
returned to browser code or task payloads.

The settings sidebar lists Library sources, Release indexers, Download clients,
and Metadata providers directly under Administration. There is no Connectors
parent category or heading. Playlist account pages stay hidden until a
playlist-capable production adapter is registered.

## Media and copies

`Media` is the stable catalog identity used by search, likes, play history,
playlists, queues, artwork selection, and offline references. A media item can
have multiple source-backed `MediaCopy` rows. Copy rows own the source identity,
path or external ID, embedded metadata, MIME type, bitrate, lossless state, file
size, recording identities, availability, artwork source, and scan metadata.

Automatic matching uses MusicBrainz recording IDs, ISRCs, and AcoustIDs first.
The conservative fallback requires normalized title, artist set, duration within
one second, and collection identity for audiobooks and podcasts. The oldest
canonical `Media` ID wins a merge, and `MediaAlias` redirects stale IDs.

Playback ranks available copies by lossless state, bitrate, file size, metadata
completeness, library-source order, import time, and copy ID. Removing a library
source only makes its copies unavailable. Media remains available while another
copy can serve it.

## Scans and playback

Adding a folder or Jellyfin library source queues its source-scoped scan. A
successful scan queues metadata matching and catalog projection for the same
source. Library-source scans can run independently or together and share the
durable task queue.
Failed executor runs automatically return to the queue up to two times before
the task becomes terminally failed.

Jellyfin requests `Audio` and `AudioBook` items in pages of 100. Core commits at
most 100 records per transaction and publishes catalog changes before requesting
the next page. Jellyfin IDs and ETags provide stable identity and change
detection. Unique cover images referenced by each page are fetched in parallel
with bounded concurrency and attached before their MediaCopies commit. Failed cover
fetches do not fail the scan; the existing artwork job retries them afterward.

Playback and byte-range requests are proxied through Peridot while the Jellyfin
API key remains server-side. Peridot tries ranked copies before sending response
headers. If a stream fails after headers, the copy is marked unavailable and the
client can retry the same byte range against the next ranked copy. Artwork uses
the same connector boundary and a deduplicated WebP cache.

Removing a library source stops its tasks, retains a hidden source tombstone, and
marks only that source's copies unavailable. Media and catalog projections stay
available while any other copy remains playable. Likes, playlists, play events,
playlist entries, catalog artwork, and offline copies are retained. Library
source configuration and encrypted credentials are cleared, and queued artwork
jobs are removed. Normal catalog queries exclude media with no available copy;
personal surfaces can request unavailable media explicitly.

When connected, the client resolves saved offline Media IDs and moves stored
audio and manifests to current canonical IDs. Android may queue unavailable
media when its device-local audio file exists.

## API summary

Administrators create library sources with `POST /api/admin/library-sources`.
Jellyfin uses:

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

Library sources use `POST /api/admin/library-sources/:id/scans`. Administrators can
cancel tasks with `POST /api/admin/tasks/:id/cancel`. Queued tasks are removed;
running tasks stop and remain in terminal history. Library-source reordering and
removal use the `/api/admin/library-sources` routes.

Connector discovery and descriptors use `GET /api/admin/connectors`.
Release indexers, download clients, and metadata providers have separate
`/api/admin/release-indexers`, `/api/admin/download-clients`, and
`/api/admin/metadata-providers` routes.

Media catalog routes use `/api/media`, `/api/media/:id`,
`POST /api/media/resolve`, and `/api/media/:id/audio`. Likes and play history
also use Media IDs. The removed `/api/tracks`, `/api/torznab`, and
`/api/admin/sources` surfaces have no compatibility aliases.

Discover uses `GET /api/search/external?query=...` and returns result items plus
per-connector statuses. Imports use `POST /api/release-imports` and
`GET /api/release-imports/:taskId`.

## Web application

The Nuxt application is a client-rendered SPA/PWA with a persistent settings
area, sidebar, main content surface, and fixed bottom player. Authenticated server
state is cached with TanStack Query and persisted per server and user in
IndexedDB.

The selected media item, active queue, shuffle state, and playback position are
persisted in browser-local storage per server and user. Reloads restore the
snapshot with playback paused. There is no server queue endpoint or database
queue state; playback state is not synchronized across devices.

Offline audio and download-task state are persisted separately from query cache.
All offline-save controls enqueue a device task; the shared worker resolves the
current catalog target, skips existing copies, and downloads one media item at a time.
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

This pre-release schema reset has one baseline migration. Existing databases
from the Track/Source schema are unsupported. Startup fails with an actionable
error instead of deleting or recreating them. Back up the SQLite database,
remove it manually, and restart to initialize the Media/connector schema.

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

### Discover and release imports

In Settings → Release indexers, add a Torznab feed and optional display name and
API key. Peridot reads the feed's audio capabilities before saving it. Repeat
for additional indexers.

Under Settings → Download clients, choose qBittorrent. Enter the server base URL
and choose an authentication method. Enter the Web UI username and password or
an API key from qBittorrent 5.2+ (Preferences → Web UI → API Key), test the
connection, and save. Repeat for additional instances.

Select a download client in each indexer's settings together with a destination
folder library source. Choose the qBittorrent category and additional tags.
Category save paths use automatic torrent management. The destination library
source must map to the category's completed directory. For manual paths, enter
the qBittorrent-side path when the services mount the directory differently.
Keep incomplete downloads outside that directory.

Discover is the external-search surface. Torznab is the only live external
search connector in this milestone. Release IDs are opaque and scoped to their
indexer. Search reports one status per connector and keeps successful results
when another connector fails.

Release imports create owner-scoped `release_import` tasks. While the torrent is
in qBittorrent, the task has `waiting` status and reports transfer progress.
Once complete, Peridot stores the completed audio paths in the task payload and
scans only those files. Import tasks do not recursively scan the folder or mark
unseen media unavailable, and their metadata child task is limited to the
imported Media IDs. Use a normal library-source rescan when the complete folder
must be reconciled. Cancelling the task leaves the torrent and files untouched.

### Client storage reset

The web client bumps its query cache, player state, download-task storage, and
offline-manifest generations. On first launch it clears legacy metadata while
retaining `peridot-offline-audio-v1`. Android uses `files/offline-v2` for new
manifests and audio while leaving `files/offline` untouched.

Settings → Library includes the explicit legacy audio cleanup action. It removes
the retained web or Android legacy audio only when invoked by the user.
