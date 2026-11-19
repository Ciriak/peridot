# Peridot decisions

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
stored value, the device conditionally initializes it from that device's prior
local choice, or from the enabled default when no prior choice exists. The
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
playlists, queues, history, and offline downloads. Normal browse, search, and
recommendation queries exclude unavailable entries. Personal surfaces can opt
into unavailable records, and an explicitly downloaded audio copy remains
playable after its source is gone.

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
counts exclude hidden copies. Likes, play history, queues, and playlist entries
move to the canonical copy, while track APIs and persisted client queues resolve
old IDs through aliases.

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
playlist downloads, except for the enabled liked-title preference. Queue edits may
be retained locally while disconnected and synchronized after reconnection.

## 2026-11-14: Activity storage is private

Likes, play events, quick-pick ranking, playlists, and queue state are scoped to
the signed-in user. Public API responses and realtime events must not leak one
user's activity to another.

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
