# Project brief

## Source

Recovered on 2026-11-10 from the Peridot project chats “Monorepo Architecture
Advice” (6af2ede8-3e84-83ed-b897-d258991149e2) and “Prepare Repo Structure”
(6af2fa1a-86bc-83eb-87b5-ef4b1efae968). This file preserves the brief in Git
so future agents do not need project memory or chat access.

## Product requirements

Peridot is a flexible, self-hosted music platform for organizing and listening to
an owner's music collection. Core owns users, the canonical library, audio, and
playlists. Optional plugins extend capabilities through versioned contracts.

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

## Visual identity

Dark-first; primary green #46B54A; near-black surfaces. A green organic SVG blob
with three corners is the logo, and an animated version is the spinner. Exact
logo geometry remains to be finalized. Respect reduced motion. Prefer Inter,
system fallbacks, visible keyboard focus, and accessible contrast.

## Delivery sequence

1. Runnable monorepo foundation and continuity documentation (current milestone).
2. Local library vertical slice: configure a folder, scan tracks into the catalog,
   list real tracks, and play one through an authenticated audio endpoint.
3. Users, playlists, matching, and playback persistence.
4. Plugin SDK v1, credential handling, isolated runtime, one trusted provider.
5. Marketplace and further providers; desktop packaging; OpenSubsonic verification.

## Branch policy

Owner confirmed: dev = development; master = beta; tags = releases.
