# Peridot

Your music. Your space. A self-hosted music platform with a plugin-first ecosystem.

## Quick start

Use Node 24.15 or newer within Node 24, and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://localhost:3000. Server health: http://127.0.0.1:17430/api/health.
Development startup applies committed migrations and, when the corresponding
environment variables are unset, uses `apps/server/peridot.db` and creates
`apps/server/music`. Set `DATABASE_URL` or `MUSIC_LIBRARY_PATH` before starting
to use different development locations.
On first launch, the web app asks for the address of the user's Peridot server.
It then creates the required first user with administrator privileges, or signs
in when the server already has users. The server address and expiring session
are kept in same-site browser cookies and the server can be changed from the
sidebar. Server selection continuously probes the typed address and scans the
web host's private IPv4 networks for Peridot servers on port 17430; selecting a
discovered server advances onboarding. The routed web preview still uses fictional music, search, favorites,
and simulated player controls; it does not yet fetch library data or play audio.
Demo library/player state resets on reload. The server requires a migrated local
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
- `apps/server`: authenticated Fastify catalog/scanning/audio API and Prisma SQLite storage.
- `apps/desktop`: documented future desktop shell.
- `packages/contracts`: shared API types.
- `packages/ui`: shared brand tokens and reusable Button, Input, Badge, Slider, Gradient, and Spinner components.
- `packages/player`: playback state contract, no audio engine yet.
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
The web shell mounts one app-level Reka UI toast region in the bottom-right,
above the fixed player. It keeps library-scan progress visible across route
changes and keeps a single connection-loss error visible until the configured
server health endpoint responds again.

## Configuration

Server defaults to loopback port 17430. Set HOST and PORT in your shell to override.
See apps/server/.env.example for variables required by built server startup.
Environment files are not loaded automatically. The development command supplies
the local defaults described in Quick start. `DATABASE_URL` selects the local SQLite file,
`MUSIC_LIBRARY_PATH` selects the single authoritative music folder, and
`PERIDOT_WEB_ORIGINS` lists browser origins allowed to call the API. Its defaults
support the local web development server; add the exact web origin when accessing
Peridot from another device.
Administrators can also manage where the server gets raw audio files from
Settings → Administration. Each source is a local folder, an external URL, or a
future integration such as Spotify or YouTube Music. Local folder sources seed
from `MUSIC_LIBRARY_PATH` on first launch and are used by later library scans;
URL and integration sources are stored but not indexed yet.
The local-folder picker supports case-insensitive deep folder search without
requiring folders to be expanded first.

Apply committed migrations before starting a new database:

```sh
pnpm db:migrate:deploy
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
track with `GET /api/tracks/:id/audio`. Scans are explicit and never run at
startup. MP3, M4A/AAC, OGG/Opus, WAV, and FLAC files are cataloged; originals
are streamed without transcoding. The web shell polls an active scan globally
for its progress toast and checks the public health endpoint every ten seconds
while connected.
Administrators can search local directories recursively with
`GET /api/admin/filesystem/search?query=<term>`; results are bounded and do not
follow symbolic links.

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

UI icons use Iconify's offline Vue component with individually bundled
`@iconify-icons/basil` data for all icons. The play icon is
`basil:play-solid`.
Icons render on the server and need no runtime icon API or network access.
