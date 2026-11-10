# Peridot

Your music. Your space. A self-hosted music platform with a plugin-first ecosystem.

## Quick start

Use Node 24.15 or newer within Node 24, and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Web: http://localhost:3000. Server health: http://127.0.0.1:3001/api/health.
The current web shell is static; it does not yet connect to the server or play music.
Neither startup requires a database, API key, or hosted service.

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm db:validate
pnpm build
```

Build output: `apps/web/.output` and `apps/server/dist`. Start the built server
with `node apps/server/dist/index.js`, and the web app with
`node apps/web/.output/server/index.mjs` (separate terminals).

## Structure

- `apps/web`: Nuxt 4 application shell.
- `apps/server`: Fastify API and initial Prisma catalog schema.
- `apps/desktop`: documented future desktop shell.
- `packages/contracts`: shared API types.
- `packages/ui`: shared brand tokens; shadcn-vue components follow as needed.
- `packages/player`: playback state contract, no audio engine yet.
- `packages/plugin-sdk`: initial manifest contract, no execution runtime.
- `packages/config`: shared TypeScript configuration.
- `plugins`: planned official connectors and metadata providers.
- `infra`: future self-hosted deployment assets.

## Configuration

Server defaults to loopback port 3001. Set HOST and PORT in your shell to override.
See apps/server/.env.example for variable names. Environment files are not loaded
automatically. Prisma defaults to a local SQLite URL. The schema is an initial
proposal: runtime client wiring, migrations, storage, and authentication are pending.

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
