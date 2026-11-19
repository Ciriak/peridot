# Peridot decisions

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
