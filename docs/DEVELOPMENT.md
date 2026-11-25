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
- `apps/server/src/connector-instance-discovery.ts`: shared bounded network
  scanning, connector probes, and result deduplication.
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
Connectors that can identify their service on a network may also expose instance
discovery. This capability records default ports and an unauthenticated service
probe; the shared server engine owns host enumeration and protocol probing.

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
Both rows store administrator overrides in `manualOverrides`. Automatic writers
must use the shared override helpers so edited values survive rescans while the
latest source value remains available for reset.

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
successful scan queues metadata matching and duplicate-copy matching for the
same source. Library-source scans can run independently or together and share
the durable task queue.
Failed executor runs automatically return to the queue up to two times before
the task becomes terminally failed.

Discovery and catalog projection share one committed-media boundary. Folder
discovery streams bounded file batches while later directories are still being
enumerated. Path writes and remote pages accumulate changed media, and the
catalog materializes once for each 500 unique media IDs or the final partial
batch. Each successful batch atomically updates `CatalogMedia`, album and artist
summaries, links, search terms, and projection-pending state before publishing
one catalog revision. Albums, artists, and search therefore become available
while the scan is still running.

Jellyfin requests `Audio` and `AudioBook` items in pages of 500. Core commits at
most 100 records per transaction and materializes the complete page before
requesting the next page. Jellyfin IDs and ETags provide stable identity and
change detection. Unique cover images referenced by each page are fetched in
parallel with bounded concurrency and attached before their MediaCopies commit.
Failed cover fetches do not fail the scan; the existing artwork job retries them
afterward.

Folder progress remains indeterminate until enumeration completes. Successfully
materialized batches remain browsable if later traversal fails. A full catalog
projection task runs only as a recovery fallback when media remain pending after
all discovery work, so a normal successful scan does not perform a redundant
full pass.

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

Connector instances are discovered with
`POST /api/admin/connectors/:kind/discover-instances`. An empty body searches
the local networks visible to the Peridot server. An optional address hint
limits the scan to one host:

```json
{
  "address": "192.168.1.5"
}
```

The response contains only verified, credential-free instance descriptors:

```json
{
  "items": [
    {
      "kind": "jellyfin",
      "id": "server-id",
      "label": "Living room",
      "url": "https://192.168.1.5:8096",
      "version": "10.10.0"
    }
  ],
  "scannedSubnets": []
}
```

Jellyfin uses port `8096`, probes HTTPS before HTTP, and accepts only the
`Jellyfin Server` public-info signature. The Add source form must use the
selected scanner URL for library discovery and source creation; typed addresses
are scan hints. Docker bridge networking can hide the host LAN, so entering the
Jellyfin host address directly is the reliable container path.

qBittorrent uses port `8080` and accepts only the official Web UI metadata or the
older localized title and bundled Web UI asset. Download clients must use a
scanner-selected URL for saving. Connection testing can probe the currently
typed address directly, including scheme-less HTTP addresses, without
persisting it. Existing saved clients remain editable until their URL changes.
The same host-hint behavior applies when Docker cannot infer the host LAN.

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

Every signed-in user can read the sanitized platform overview at
`GET /api/overview`. It returns library-source names, safe address labels,
available file counts, live `online`, `offline`, or `unknown` checks, and
metadata-provider names with `online`, `unknown`, or `disabled` state. It also
returns available album, podcast, and audiobook counts plus the signed-in user's
visible playlist count. The route never returns source configuration,
credentials, full paths, or remote URLs beyond their host label.
Metadata-provider cards intentionally omit address and count details.

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

The account avatar opens Settings → Overview. The page uses `@xyflow/vue` for a
read-only connection graph with Peridot centered, a library-source subflow on
the left, a metadata-provider subflow on the right, and a download-client
subflow below. Every card keeps its own animated link while the subflow is only
a visual background group; download-client edges run from Peridot toward the
client. Panning and scroll/pinch zoom remain available while node, link, and
connection editing stay disabled. The page polls `/api/overview` while open.
Keep graph cards to basic connection information and do not expose administrator
configuration on this screen. Double-clicking a card routes to the matching
Server or connector settings page; subflow backgrounds remain non-interactive.

Render catalog artists through `ArtistLink` or `TrackArtistLinks`, and catalog
albums through `AlbumLink`, so navigation and right-click menu behavior remain
consistent across cards, tables, dialogs, the queue, and both player layouts.

### Medias manager

Administrators manage all `Media` and `MediaCopy` records at
`/settings/medias`. `GET`, `POST`, and `PATCH /api/admin/medias` plus the
copy-scoped routes provide filtered numbered pages, full-row metadata, and
per-field updates. Field reset routes remove a manual override and restore its
latest source value.

The page is full-bleed within the settings content area. Search and advanced
filters remain above the table, pagination remains below it, and the datatable
owns both vertical and horizontal scrolling. Files on disk are never changed by
this manager.

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
API key from a modal dialog matching the other connector settings. Peridot reads
the feed's audio capabilities before saving it, and keeps save errors visible in
the dialog. Repeat for additional indexers.

Under Settings → Download clients, choose qBittorrent. The form scans port
`8080` automatically and places the scan controls and verified Web UI list
first, directly below the dialog title. Enter a host or URL to scan one
directly, choose a discovered instance to prefill the client fields, then choose
an authentication method. The display name defaults to qBittorrent and remains
editable. Enter the Web UI username and password or an API key from qBittorrent
5.2+ (Preferences → Web UI → API Key), then save. Saving validates the live
qBittorrent connection and rejects without persisting when authentication or
connectivity fails. Repeat for additional instances. Saved rows lead with the
bundled qBittorrent icon, use a cog-icon edit action, and keep removal in the
row's three-dot action menu behind a confirmation dialog because it is
destructive.

Saved release-indexer rows use the same toolbar and row-action pattern: the add
action includes the shared plus icon, Configure is a cog-icon button, and
destructive removal is available only from the row's three-dot menu after an
explicit confirmation.

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
