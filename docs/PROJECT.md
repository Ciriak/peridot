# Project brief

## Source

This file preserves the product and architecture brief in Git so contributors
can work from repository documentation.

## Product requirements

Peridot is a flexible, self-hosted music platform for organizing and listening to
an owner's music collection. Core owns users, the canonical library, audio,
playlists, and trusted built-in source integrations.

The core audio library also supports audiobooks and locally stored podcast
episodes as first-class browse categories. Media type is detected per track
from authoritative Jellyfin and embedded metadata. One source may contain music,
books, and shows; ambiguous tracks default to music. Classification is
automatic only and does not use title- or folder-name heuristics.

- Playlist account linking and synchronization: Spotify, Deezer, SoundCloud,
  YouTube Music. Keep external track references and show unmatched local tracks.
- MusicBrainz and Discogs metadata enrichment with provenance.
- AudioMuse-AI compatibility via an optional connector to the user's own service.
- User-provided API keys and user-hosted services. No mandatory cloud service,
  embedded provider keys, or Peridot-hosted credential proxy.
- Jellyfin is a direct built-in library source. Future integrations are trusted
  built-ins behind the same internal source interface and ship with Peridot.
- Never load untrusted integration code into the server process.
- OpenSubsonic compatibility is a target requiring future interoperability tests.
- Every catalog artist and album name is an interactive reference. Artist names
  link to their artist page, album names link to their album page, and
  right-clicking either name opens the corresponding artist or album menu.

Provider availability and API policies must be revalidated before implementation.
Playlist synchronization concerns references and matching against local audio.

## Architecture direction

TypeScript, pnpm workspaces, Turborepo, Nuxt/Vue web, Fastify server, Prisma,
shared UI/player/contracts packages, and a future desktop client.
Use shadcn-vue for the component system as interactive screens are introduced.

The foundation uses SQLite as a provisional local development starting point.
Desktop shell, production storage, authentication, and additional built-in
source integrations still require implementation decisions.

Production deployment uses immutable multi-architecture GHCR images. The web
application, authenticated API, audio, and realtime traffic share one Fastify
listener on port 17430. External web clients discover and connect to that
server address. Persistent SQLite state and credentials live in `/data`; music
remains a read-only mounted source. Artwork and artist portraits use a
deduplicated WebP cache in `/data/artwork`. The deployed image channel is
checked against the public GitHub repository; administrators apply server image
updates manually with Compose.

Public GitHub release data drives automatic update checks without requiring a
GitHub account. Browser and desktop clients update silently in the background.
The Android web bundle updates independently through a signed, encrypted
bundle; native APK distribution remains outside the in-app updater.

## Visual identity

Dark-first. The owner's supplied Tailwind hex theme is authoritative and
supersedes the earlier #46B54A theme color and font defaults. Dark-mode primary
is #00A63E, background #0A0A0A, and foreground #FAFAFA. Light-mode primary is
#171717, background #FFFFFF, and foreground #0A0A0A. Use the complete semantic
palette, sidebar/chart tokens, font stacks, radius (0.625rem), and shadows in
packages/ui/src/tokens.css. The web Tailwind entry maps these tokens to utilities;
components should consume semantic tokens rather than redefine theme colors.
Default to dark mode on the HTML element so portaled UI inherits the same theme.
Poppins is the main UI font in both themes, overriding the supplied theme's
system sans default. Bundle font files locally; retain system sans fallbacks.

A green organic SVG blob with three corners is the logo, and an animated version
is the spinner. Exact logo geometry remains to be finalized. Respect reduced
motion, visible keyboard focus, and accessible contrast.

## Delivery sequence

1. Runnable monorepo foundation and continuity documentation (current milestone).
2. Local library vertical slice: configure a folder, scan tracks into the catalog,
   list real tracks, classify music, audiobooks, and podcasts, and play one
   through an authenticated audio endpoint.
3. Users, playlists, matching, and device-local playback persistence.
4. Direct built-in source integrations with Jellyfin as the first implementation.
5. Further built-in providers; desktop packaging; OpenSubsonic verification.

## Branch policy

Owner confirmed: dev = development; the master source branch publishes beta;
tags = production releases. Docker publishes `dev`, `beta`, version/commit
tags, and a `stable` alias that
advances only for non-prerelease `vX.Y.Z` tags. The stable/production channel is
the default installation channel.
