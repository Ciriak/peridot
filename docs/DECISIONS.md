# Peridot decisions

## 2026-11-22: Git hooks format commits and validate messages

The repository keeps its Git hooks in `.husky` and configures Git to use them
during `pnpm install`. The `pre-commit` hook runs the repository formatter, and
the `commit-msg` hook runs Commitlint. Keeping both checks in shared hooks makes
formatting and conventional commit messages consistent across contributors
without relying on editor-specific setup.

## 2026-11-22: Search includes playlists as catalog items

Global search treats playlists as a first-class catalog result alongside artists,
albums, tracks, audiobooks, and podcasts. The search route uses the paginated
playlist query and renders results with `CatalogCard`, so playlists keep the
same open, play, context-menu, and unavailable-state behavior as the Playlists
page. The result filters include a Playlists option, and empty searches do not
fall back to listing every playlist.

## 2026-11-22: Scrolled album headers show cover art on desktop

The shared scrolled detail header accepts optional artwork for collection
surfaces. Album detail passes its resolved, cache-aware cover into the dock. The
cover appears only at desktop widths and falls back to the bundled album icon
when artwork is absent or fails to load.

This keeps navigation, the collection title, and playback in one compact row
without changing the mobile dock or duplicating the album title. The optional
prop leaves artist, playlist, audiobook, and podcast headers unchanged until
they intentionally adopt artwork.

## 2026-11-22: Canonical album IDs own track-derived album links

Track-derived album links use the canonical album ID without also filtering the
album detail lookup by the track artist. Track credits can include guests that
are not album artists, so passing them as an artist query can exclude the album
even when its ID is present. Tracks without an album ID continue to use their
track artist and title as the fallback lookup.

Shared track title, table, context-menu, quick-pick, queue, and player links
therefore resolve the same album regardless of per-track featured credits.

## 2026-11-22: Catalog cards never show unavailable badges

Album, track, and playlist items use the same `CatalogCard` component and the
same availability presentation. Unavailable cards never render a status badge.
Their title is dimmed and exposes the localized unavailable label, while their
control replaces the play glyph with the bundled Basil cloud-off icon. The
control uses a muted surface and remains actionable. Selecting it clears the
track's runtime-unavailable state and starts the normal playback attempt; a
failed attempt restores the unavailable state through the player's existing
retry and skip flow. The shared track table and playlist track list show the
same cloud-off hint beside resolved unavailable titles and make their controls
retry through the same player path.

Item kind changes only playback, context-menu, link, metadata, and like
capabilities. It must not change how availability is presented. This supersedes
the earlier exceptions that retained unavailable badges on collection cards.

## 2026-11-22: Notification toasts use shadcn-vue Sonner

Peridot uses the shadcn-vue Sonner `Toaster` component and `vue-sonner` for
imperative toast notifications. Application code continues to call the existing
semantic `notify*` helpers; those helpers map localized title and description
descriptors into Sonner success and error toasts.

The shared UI wrapper keeps Sonner's compact card presentation while applying
Peridot popover, border, foreground, muted, and radius tokens through standard
Tailwind utility options. This avoids the generated wrapper's inline style
mapping and Lucide icons, which conflict with the project's styling authority.
All toast and dismiss icons use bundled Basil SVGs, and loading toasts use the
Peridot spinner.

Toasts remain top-right below the application top bar, show at most three at
once, dismiss to the right, and keep the existing five-second success and
eight-second error durations. Sonner's rich-color backgrounds remain disabled.

## 2026-11-22: The static web shell uses the Peridot title

Nuxt writes `Peridot` into the application's static document head. This gives
the browser a stable window and tab title while the client bundle, i18n, and Vue
application are still loading. Route and runtime metadata continue to replace
the title after initialization.

## 2026-11-22: Exhausted playback tracks become unavailable

When a track exhausts its playback-start attempts and is skipped, the shared
player records that track ID as unavailable for the current playback session.
The UI then uses the existing unavailable treatment: dimmed artwork and title,
with disabled play and queue-selection controls. No additional status badge is
added. Track titles in lists, cards, menus, the queue, and both player layouts
also expose the localized native `title` label “This title is unavailable.”

Runtime-unavailable tracks are excluded from future queue selection and
collection playback, including saved offline copies whose audio also failed.
Such a failed copy does not retain its “Available offline” label because that
copy is not currently playable.
Android reports the same IDs in its playback snapshot so its embedded web UI
matches browser playback. This state is session-local and is discarded when the
player queue scope is cleared; it is not catalog availability and does not alter
the server record.

## 2026-11-21: Automatic track skips do not wrap

Automatic advancement after exhausted playback-start attempts traverses the
active queue once. Repeat-all may resume a queue after normal completion or a
manual next action, but it cannot renew the queue during automatic failure
handling.

The web shuffle path treats a forced advancement as exhausting its current
shuffle pass. Android temporarily requests the next Media3 item with repeat
disabled, then restores the user's repeat mode. If no later playable item
exists, playback stops and exposes the final error instead of repeatedly
retrying the queue.

## 2026-11-21: Unavailable tracks rely on playback controls

Resolved tracks do not render a redundant “Unavailable” badge in track tables,
playlist track lists, or shared catalog cards. Their title remains dimmed and
their play control remains disabled, while catalog-card controls retain the
localized unavailable tooltip.

Tracks with a saved offline copy still show “Available offline.” Album, artist,
and playlist collection status labels remain unchanged. Playlist entries without
a resolved local track also retain their status label because they have no track
play control.

## 2026-11-20: Detail headers dock after scrolling out of view

Album, artist, playlist, audiobook, and podcast detail cards use one shared
`ScrolledHeader`. Once the entire full card has crossed above the main content
viewport, a fixed compact header appears below the application top bar with an
icon-only history-aware Back control, the collection title, and the collection
play control.

The compact play control reuses the page's existing handler, playable state,
active playback state, and localized play/pause label. It therefore has the
same pending-start, pause, offline, and unavailable behavior as the full header
control. The dock is hidden whenever any portion of the original card is still
visible.

## 2026-11-20: Card lists use two columns on mobile

Every page-level card list starts with two columns at mobile widths, matching
the album list. The shared virtual card grid applies this to standard, wide, and
compact layouts while preserving their existing larger breakpoint column
counts. Home and the non-virtualized recent-search cards use the same
two-column mobile rule directly.

This keeps card width and scan order consistent across Albums, Artists,
Playlists, Audiobooks, Podcasts, detail-page album collections, Search, and
Home.

## 2026-11-20: Linked track rows hold a short selection highlight

Track links already target album title anchors through the shared
`#track-title-*` hash flow. The album track table reuses that decoded target to
scroll to the row and briefly apply `bg-primary/10`, rather than adding a second
navigation representation.

The linked row holds the primary tint for two seconds, then fades back to its
normal background with the standard Tailwind color-transition utilities. The
highlight timer is cleaned up when the target changes or the table unmounts.
Reduced-motion users receive the same two-second state without the color
transition.

## 2026-11-20: Catalog cards use one item-aware component

Album, playlist, and track items displayed as cards use one polymorphic
`CatalogCard`. Album, playlist, and Home card surfaces pass a discriminated item
model, while the sidebar keeps its denser `QuickPickTile` layout and track
collections keep the shared table.

The card frame follows the existing album card, including its compact mode,
cover, play control, unavailable tooltip, mobile treatment, and metadata
spacing. Albums and music tracks show the card like button; playlist cards do
not. Playlist liking remains available through the playlist context menu.

The context menu is selected from the item kind. Albums use
`AlbumContextMenu`, tracks use `TrackContextMenu`, and playlists use
`PlaylistContextMenu`. Manual playlists retain playback, like, rename, delete,
and open actions, while the automatic liked-tracks playlist exposes only play
and open.

This supersedes the earlier Home-only adoption of `AlbumCard`.

## 2026-11-20: Liked tracks cover uses a darker primary tint

The generated liked-tracks cover uses `bg-primary/40` instead of
`bg-primary/60`. This produces a darker, more muted background on the
dark-first surfaces while keeping the cover color linked to the active primary
theme token. The white Basil heart treatment is unchanged.

## 2026-11-20: Catalog detail back buttons follow browser history

Album, artist, playlist, audiobook, and podcast detail surfaces use one shared
`BackButton`. It performs a single Vue Router history step when the current
browser history state has a previous application entry. Direct or deep-linked
entry without that state falls back to Home.

Contextual catalog links in empty and error states continue to point to their
specific list pages instead of using history.

## 2026-11-20: Home albums use the catalog album card

Album items in Home quick picks render through the same `AlbumCard` component
used by the album list. Track quick picks continue to use `QuickPickTile`.
Album playback, liking, unavailable state, metadata links, and context-menu
behavior therefore stay aligned across both catalog surfaces.

## 2026-11-20: Unplayable tracks skip after three attempts

Track startup gets three total attempts: the initial load and up to two automatic
retries. After the third non-policy failure, the player clears the loading and
error state and advances to the next item in the active queue. Queue advancement
does not wrap back to the failed track solely because repeat-all is enabled.

The same rule applies to the web and Android media engines. Authentication
redirects remain terminal without queue advancement, and an autoplay rejection
continues to ask the user for playback rather than skipping the track.

## 2026-11-20: Home uses liked tracks and quick-pick content

The “Suggested for you” Home surface is a single uncategorized card grid. It
shows the automatic Liked tracks playlist card alongside the same mixed track
and album items used by Quick pick, rendered with the shared card layout so
every item has the same dimensions. Separate album, track, and playlist groups
are not rendered.

Home reuses the quick-picks query so a successful play refreshes the content
through the existing play-history version signal. It does not issue an
additional catalog-wide suggestion query or maintain a second recommendation
surface.

## 2026-11-20: Track rows open the track context menu

Every track-list row opens the track context menu from a right click or long
press. Artist and album links stop the context-menu event from bubbling to the
row so their matching catalog menus remain authoritative.

Playlist entries without a resolved local track remain plain rows because there
is no track menu target. The shared row wrapper keeps table and playlist
behavior consistent without changing unmatched-entry rendering.

## 2026-11-20: Task progress stays out of application headers

Task progress is shown in Settings navigation and Settings → Tasks rather than
as a circular activity indicator in the default or settings header. The header
continues to show the server-offline badge because connection state is separate
from background work.

## 2026-11-20: Add-to-playlist uses a searchable submenu

The track context menu opens addable playlists in a nested
`ContextMenuSubContent` surface instead of a modal dialog. The submenu preloads
every paginated manual playlist, filters the loaded names locally, and excludes
the read-only liked-tracks playlist.

Playlist creation remains available from the submenu and continues through the
existing name dialog before adding the selected track. Successful additions
close the context menu; failed additions leave the submenu open so the localized
error remains visible.

## 2026-11-20: Collection playback feedback is immediate

Every available collection play control records a shared playback target and
switches to pause synchronously before waiting for track data. The target covers
albums, artists, playlists, audiobook and podcast collections, and quick picks.
Clicking pause while the collection is still loading cancels that pending start.

The audio engine ignores optimistic playback intent until the collection tracks
resolve. This keeps the UI responsive without resuming a previously selected
track while the newly requested collection is buffering.

## 2026-11-20: Cached artwork skips the image fade

Artwork resolved from the local artwork cache renders without the shared
300-millisecond opacity transition. This prevents already available cover art
from repeating a loading animation whenever its component mounts. Artwork that
misses the cache still fades in after its network load, and reduced-motion users
continue to receive no transition in either path.

## 2026-11-20: Liked tracks is a virtual automatic playlist

The first automatic playlist has the reserved ID `liked`, the public kind
`liked-tracks`, and the title “Liked tracks.” It is derived from the signed-in
user's music likes rather than persisted as a `Playlist` row. This keeps
membership authoritative to `TrackLike` without synchronization jobs or a
schema migration.

Automatic playlists appear before manual playlists and use the normal playlist
list and detail response shapes, with `kind` distinguishing their capabilities.
Liked tracks are ordered newest-like-first, remain visible when unavailable,
and use the standard playlist offline-save flow. The cover is generated as a
white Basil heart on a darker primary-derived background rather than a track-art
collage, keeping the treatment linked to the active theme.

Automatic playlists are read-only. Rename, delete, add-item, remove-item, and
reorder requests return `409 automatic_playlist_read_only`; membership changes
only through track likes. The detail view retains playback, track search,
context menus, and offline saving, while omitting per-track like controls
because every entry in this automatic playlist is already liked. The standalone
`/liked` page is removed; the sidebar's Liked Tracks entry opens
`/playlists/liked` through the shared playlist detail surface.

Playlist cards do not expose a separate offline-download control. Offline saving
stays on the playlist detail surface and in the existing bulk download flows so
the cover actions remain limited to opening and playing the playlist.

## 2026-11-20: Unavailable album playback remains discoverable

Album card playback uses `aria-disabled` instead of the native `disabled`
attribute while no catalog or saved track can be played. This keeps the control
focusable so pointer and keyboard users can read its localized “Unavailable”
tooltip. The click handler still refuses playback, and an actively playing album
remains enabled so it can be paused even if its source becomes unavailable.

`album.available` is the authoritative immediate-play state, including albums
that are playable from a connected server or from local offline copies. The card
does not infer a different availability rule from connection state. When the
server is offline or live credentials are unavailable, its playback action
resolves saved tracks directly before requesting anything from the server.

Playing an album starts the whole collection, so offline availability requires
every album track to be saved. A partially saved album is shown as unavailable
and cannot start playback; a complete saved copy remains playable after source
removal or loss of connectivity.

## 2026-11-20: Mobile catalog text does not scroll automatically

Overflow-aware catalog text stays still until pointer or focus interaction on
every viewport. Only an explicit `always` scrolling mode starts automatically,
which remains reserved for active player metadata.

## 2026-11-20: Playback state is device-local

The selected track, active queue, shuffle state, and playback position are
stored in browser-local storage scoped by server and user. Reloading or
reopening the client restores that snapshot with playback paused; the selected
track and elapsed position remain visible.

The player does not read or write queue state through the server. The durable
queue API and its database models are removed. Playback state does not follow
an account to another device, and clearing site data removes it. Duplicate
track aliases are applied when the client resolves its locally persisted queue
against the catalog or offline copies.

## 2026-11-20: Album card playback stays visible on phones

Album card playback remains a hover-revealed overlay on larger viewports but is
always visible below the `sm` breakpoint. The button uses a 44px touch target and
a larger play or pause icon on phones so playback does not depend on a hover
state that touch input cannot provide.

## 2026-11-20: Catalog names share link and context-menu behavior

Every catalog artist and album name rendered in the web client is a navigation
link and a right-click menu trigger. Shared `ArtistLink`, `AlbumLink`, and
`TrackArtistLinks` components own that behavior so cards, track lists, dialogs,
queue views, and player surfaces cannot drift.

Artist references that contain only a name resolve their full catalog summary
when the menu opens. Album references derived from tracks use the track's
album identity and metadata, keeping the existing track and album response
contracts unchanged.

## 2026-11-20: Preference initialization ignores legacy local values

An account without a stored liked-titles preference initializes from the enabled
default. Previously stored browser-local values are not imported during account
initialization. The current server preference remains authoritative on every
device after initialization.

## 2026-11-19: Partial task failures remain completed with warning state

Durable tasks use `completed` for successful execution even when some items could
not be processed. The task response distinguishes that outcome with
`api.message.taskCompletedWithErrors`, and Settings → Tasks labels it
“Completed with errors” using the warning token instead of presenting it as a
terminal failure.

The persisted `failureSummary` remains available for logs, while the localized
`failureMessage` provides user-facing copy. Older completed task rows without a
stored failure message derive the same completion warning when serialized.

## 2026-11-19: Built-in plugins receive a 60-second startup allowance

Fastify's default 10-second plugin timeout can expire while Swagger UI performs
its first filesystem-backed initialization in a constrained deployment. Peridot
allows built-in plugins 60 seconds to initialize instead of treating a slow
container startup as a permanent failure.

The limit remains finite so a plugin deadlock still fails startup and the
container health check can report the failure.

## 2026-11-19: Offline downloads are persistent device tasks

The liked-titles preference is stored on the user account. A device verifies it
from `GET /api/users/me/preferences` after authentication. If the account has no
stored value, the device initializes it from the enabled default. The current
server value then becomes authoritative on every device.

Track, album, audiobook, podcast, playlist, and liked-title offline saves all
enter one persistent per-server/user device queue. The queue stores task state
and target descriptors in IndexedDB but never stores credentials. It runs one
task and one download at a time, resumes interrupted work after restart, pauses
while disconnected, retries failed items twice, and preserves completed files.
Completed task history is retained for 30 days and capped at 100 entries.

The browser file-download action is separate from offline storage. It continues
to download a file directly and does not create an offline task.

## 2026-11-19: Server and offline work share one task display

Settings → Tasks is available to every signed-in user and combines durable
server work with device offline-download work in one active list and one history
list. Server rows remain administrator-only; device rows use the signed-in
user's scoped IndexedDB queue. The topbar and Tasks navigation expose one
combined activity indicator instead of separate server and download indicators.

Task actions remain scoped to their owner: server queue and stop requests still
use the administrator task API, while download cancel, stop, and retry continue
to update only the local device queue. Mixing the rows in one view avoids
parallel task surfaces without changing either execution model.

## 2026-11-19: Source removal preserves catalog and user references

Removing a source keeps a hidden source tombstone and all of its track rows,
marks those tracks unavailable, and retains catalog projections, likes,
playlists, history, and offline downloads. Normal browse, search, and
recommendation queries exclude unavailable entries. Personal surfaces can opt
into unavailable records, and an explicitly downloaded audio copy remains
playable after its source is gone. A device-local player queue is unaffected by
server source removal.

Removal updates tracks and projections in bounded batches inside one
transaction and publishes live administrator-only progress over the realtime
connection. It is not a background task. The `DELETE` response is the durable
completion boundary; concurrent removal attempts receive a conflict.

Adding the same path, URL, or built-in integration identity later restores the
same source and track IDs and queues a scan, so likes and saved references
reconnect automatically. Source configuration and credentials are cleared when
the source is removed and credentials must be supplied again.

## 2026-11-19: Task remaining-time estimates use conservative observed progress

Settings → Tasks replaces a running task's start timestamp with a
`<duration> Remaining` estimate when the task has a valid start time,
determinate progress, at least 10 seconds of elapsed execution, at least 5%
progress, and work remaining.

The estimate divides elapsed execution time by completed items and multiplies by
remaining items. Durations round up to minutes, hours, or days with `Intl`
formatting. Queued tasks continue to show their queued timestamp, and running
tasks without a reliable estimate show no timestamp. A historical duration model
or additional dependency is not required for this first implementation.

## 2026-11-19: Failed task executions retry twice

When a durable task executor reports a failed run, the task returns to the queue
and starts again, up to two additional attempts. The original task row and its
source, parent, and force-refresh context are retained; retry progress and failure
fields are cleared before each new run.

Cancellation, server interruption, parent failure, missing executors, and completed
runs with partial errors are not automatically retried. Administrator cancellation
can still remove a queued retry or stop a running retry. A task becomes terminally
failed only after its third failed execution.

## 2026-11-19: Duplicate detection is automatic and catalog-level

Tracks are compared across every configured source and media type using
recording-level MusicBrainz, ISRC, and AcoustID identities first. Tracks without
identities may match only when normalized titles and artist sets agree and known
durations are within one second; audiobook chapters and podcast episodes must
also share their collection title.

The best available copy remains canonical, ranked by lossless status, bitrate,
file size, metadata and artwork completeness, configured source order, import
time, then track ID. Other copies are hidden through `duplicateOfId` without
changing source availability or deleting files. Catalog searches, cards, and
counts exclude hidden copies. Likes, play history, and playlist entries move to
the canonical copy, while track APIs and persisted client queues resolve old IDs
through aliases.

Durable duplicate detection runs after scans and metadata changes, after source
order or membership changes, and once at startup when the algorithm version
changes. There is no manual review or override workflow.

## 2026-11-19: Android media notification opens the full player without runtime permission

Media-session notifications are exempt from Android 13's
`POST_NOTIFICATIONS` runtime permission. Peridot omits that permission and
keeps a Media3 controller connected while its Capacitor plugin is active so the
raw service transport commands produce the platform media player and controls.

The media session activity uses the `peridot://player` deep link. The Android
web shell handles both cold launches and `appUrlOpen` events by adding the
existing `player=fullscreen` route query. Routes without the shared player
layout are redirected through the home route first.

## 2026-11-19: Jellyfin cover art is fetched eagerly during scans

Cover images referenced by Jellyfin scan items are fetched once per unique
source cover with bounded concurrency while the source batch is being imported.
The stored image is attached before its tracks enter the catalog, so a normal
album import does not expose a temporary coverless state.

Artwork retrieval remains best-effort. Missing or failed eager fetches leave the
track available and create an artwork job so a later artwork task or rescan can
retry the cover.

## 2026-11-19: Cancelling queued tasks removes them from task history

Administrator cancellation deletes a task that is still queued because it has not
started. A running task is stopped and retained in terminal history so completed
or partly completed work remains auditable.

## 2026-11-19: Source removal deletes source-owned tracks

Removing a folder, URL, or built-in integration source deletes every track owned
by that source and its catalog projections. Deleting only the source record is
not sufficient because the optional track relation would otherwise leave those
tracks visible as source-less catalog entries.

## 2026-11-19: Jellyfin is a direct built-in source integration

Jellyfin is part of the application and requires no installation or enablement
lifecycle. The server owns a small internal registry of trusted integrations for
source discovery, validation, scanning, artwork, and playback.

Future integrations are compile-time additions shipped with Peridot. They may
reuse generic source configuration, encrypted credentials, scans, artwork,
playback, tasks, and removal. They must not introduce user-supplied runtime code
or a public execution boundary without a separate security design.

Runtime configuration is persisted as non-secret JSON on the source record, while
credentials are encrypted with the existing source credential purpose. The
database does not retain installation or enablement state.

## 2026-11-19: Source integrations use generic persistence

All integration-specific non-secret state belongs in `Source.configuration`.
This allows a future trusted integration to add behavior without adding another
configuration table or changing scan, artwork, playback, and task orchestration.
An integration-specific source identity is stored for duplicate detection.

Public source kinds remain a typed union. Adding a new built-in integration
therefore changes the contract, server registration, and web source form
explicitly rather than accepting arbitrary external strings.

## 2026-11-19: Credentials remain server-side

Jellyfin and any future integration must send credentials only to the Peridot
server. The server encrypts them with the source credential purpose and never
includes them in source responses, logs, task details, playback URLs, or browser
payloads.

## 2026-11-17: Media type is automatic

Each track's media type is derived from authoritative source metadata or embedded
file metadata. Ambiguous tracks default to music. Classification does not use
title or folder-name heuristics, and the web client does not expose manual media
type controls.

## 2026-11-17: Background work uses durable tasks

Source scans, metadata matching, catalog projection, and artwork retrieval use the
shared task queue. Task responses expose safe source display names, bounded
labeled details, progress, and lifecycle timestamps. Source paths, credentials,
and arbitrary integration payloads are never exposed.

## 2026-11-16: SQLite and the single Fastify listener

SQLite is the current persistent store. The production image serves the web
application, API, audio, realtime traffic, and public health endpoint through one
Fastify listener on port 17430. Persistent state lives in `/data`; the music mount
is read-only.

## 2026-11-16: Self-hosted and user-controlled services

Peridot does not embed shared provider keys or proxy credentials through a
Peridot-hosted service. Optional integrations use services and credentials chosen
by the owner.

## 2026-11-15: Offline behavior is explicit

TanStack Query persists authenticated server state per server and user in
IndexedDB. Audio becomes available offline only through explicit track, album, or
playlist downloads, except for the enabled liked-title preference. The active
player queue and position are device-local and never synchronize through the
server.

## 2026-11-14: Activity storage is private

Likes, play events, quick-pick ranking, and playlists are scoped to the signed-in
user. The player queue is scoped to the server and user in local browser storage.
Public API responses and realtime events must not leak one user's activity to
another.

## 2026-11-13: Authentication uses expiring server sessions

Passwords are hashed server-side. Browser sessions use opaque bearer tokens with a
same-site cookie scope, and realtime connections use single-use tickets. Revoking
a session closes its active realtime connection.

## 2026-11-12: Browser playback uses short-lived track tokens

The authenticated web client requests a short-lived playback token for one track.
The audio endpoint accepts only that track's valid token and supports original
audio with HTTP range responses. Playback tokens are redacted from request logs.

## 2026-11-11: Branch channels

`dev` is development, `master` is beta, and `vX.Y.Z` tags are production releases.
No work is pushed, tagged, published, or deployed without owner authorization.

## 2026-11-10: UI styling authority

Use standard Tailwind utilities, existing shadcn-vue variants, and the shared theme
tokens in `packages/ui/src/tokens.css`. Do not add component CSS blocks, inline
visual styles, arbitrary Tailwind values, hardcoded colors or dimensions, or local
theme overrides.

The dark and light palettes, Poppins typography, radii, and shadows in the shared
tokens are authoritative.

## 2026-11-10: Icons are bundled Basil SVGs

Use Basil icons through bundled Iconify data so UI rendering works offline. Icons
inherit semantic colors and standard Tailwind sizing. The play icon is
`basil:play-solid`.

## 2026-11-09: Apache-2.0

Peridot is licensed under Apache-2.0. All first-party package metadata uses
Apache-2.0, and `LICENSE` is preserved.
