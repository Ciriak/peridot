# Peridot

Your music. Your space. A self-hosted music platform with a plugin-first ecosystem.

## Quick start

Use Node 24.15 or newer within Node 24, and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://localhost:3000. Server health: http://127.0.0.1:3001/api/health.
The web app is an interactive design preview with fictional music, local artwork,
search, favorites, and simulated player controls. It does not yet connect to the
server or play audio. Demo state resets on reload.
Neither startup requires a database, API key, or hosted service.

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
- `apps/server`: Fastify API and initial Prisma catalog schema.
- `apps/desktop`: documented future desktop shell.
- `packages/contracts`: shared API types.
- `packages/ui`: shared brand tokens and shadcn-vue Button, Input, Badge, and Slider components.
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

## Configuration

Server defaults to loopback port 3001. Set HOST and PORT in your shell to override.
See apps/server/.env.example for variable names. Environment files are not loaded
automatically. Prisma defaults to a local SQLite URL. The schema is an initial
proposal: runtime client wiring, migrations, storage, and authentication are pending.

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
