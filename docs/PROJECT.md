# Project brief

## Source

This file preserves the product and architecture brief in Git so contributors
can work from repository documentation.

## Product requirements

Peridot is a flexible, self-hosted music platform for organizing and listening to
an owner's music collection. Core owns users, the canonical library, audio, and
playlists. Optional plugins extend capabilities through versioned contracts.

The core audio library also supports audiobooks and locally stored podcast
episodes as first-class browse categories. Media type is configured explicitly
per source so music, books, and shows remain deterministic and separately
browsable without title-based classification heuristics.

- In-app marketplace for plugin discovery, permissions, installation, and updates.
- Playlist account linking and synchronization: Spotify, Deezer, SoundCloud,
  YouTube Music. Keep external track references and show unmatched local tracks.
- MusicBrainz and Discogs metadata enrichment with provenance.
- AudioMuse-AI compatibility via an optional connector to the user's own service.
- User-provided API keys and user-hosted services. No mandatory cloud service,
  embedded provider keys, or Peridot-hosted credential proxy.
- Secure plugin isolation, scoped credentials, and explicit permissions. Never run
  arbitrary marketplace plugin code in the main server process.
- OpenSubsonic compatibility is a target requiring future interoperability tests.

Provider availability and API policies must be revalidated before implementation.
Playlist synchronization concerns references and matching against local audio.

## Architecture direction

TypeScript, pnpm workspaces, Turborepo, Nuxt/Vue web, Fastify server, Prisma,
shared UI/player/contracts/plugin SDK packages, and a future desktop client.
Use shadcn-vue for the component system as interactive screens are introduced.

The foundation uses SQLite as a provisional local development starting point.
Desktop shell, production storage, authentication, plugin RPC/isolation, and
marketplace trust/distribution protocols still require implementation decisions.

Production deployment uses immutable multi-architecture GHCR images. The built
Fastify server keeps the authenticated API on port 17430 and runs a second web
listener on port 17431 that serves the generated Nuxt SPA and proxies API,
audio, and realtime traffic. Persistent SQLite state and credentials live in
`/data`; music remains a read-only mounted source. The maintained Watchtower
fork follows the deployed image channel and may be triggered from administrator
Settings for manual checks and installation.

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
3. Users, playlists, matching, and playback persistence.
4. Plugin SDK v1, credential handling, isolated runtime, one trusted provider.
5. Marketplace and further providers; desktop packaging; OpenSubsonic verification.

## Branch policy

Owner confirmed: dev = development; master = beta; tags = production releases.
Docker publishes `dev`, `master`, version/commit tags, and a `stable` alias that
advances only for non-prerelease `vX.Y.Z` tags. The stable/production channel is
the default installation channel.
