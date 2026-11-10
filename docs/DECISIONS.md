# Decisions

## 2026-11-10: Poppins typography

Owner specifies Poppins as the main UI font, superseding earlier Inter and system
sans defaults. Put Poppins first in both shared --font-sans tokens. Bundle Latin
400/500/600/700 weights through @fontsource/poppins in the web app for local-first
loading with font-display: swap; no hosted font requests. Use those weights in
the preview instead of intermediate weights. Preserve font package OFL licensing.

## 2026-11-10: Owner-supplied Tailwind theme

Use the owner-provided hex theme as the current source of truth for light/dark
palettes, fonts, radii, shadows, chart colors, and sidebar colors. Dark primary
is now #00A63E, superseding the original #46B54A brief for UI theming. Keep dark
mode on the HTML element so body and future portaled controls inherit it.
Shared tokens live in packages/ui; the web entry owns Tailwind imports, utility
mapping, and base rules. Album artwork and the editorial hero retain their
illustrative palettes. Remove app-level root color overrides.

## 2026-11-10: Shared shadcn-vue components

Use official shadcn-vue registry components in `packages/ui` as specified in the
brief. Start with Button, Input, Badge, and Slider, using Reka UI primitives and
Tailwind CSS 4 via the Nuxt Vite plugin. Explicit package exports/imports keep
shared components independent of Nuxt auto-imports. Keep brand colors in shared
CSS tokens. The initial #46B54A value is superseded by the owner-supplied theme
decision above. Local slider labels belong on interactive
thumbs. Preserve upstream MIT notices alongside Apache-2.0 package metadata.

## 2026-11-10: ESLint and Prettier

Use ESLint flat configuration with recommended JavaScript/TypeScript checks and
Vue essential rules across the workspace. Keep Prettier responsible for formatting
and apply eslint-config-prettier last to avoid rule conflicts. Ignore generated
Nuxt, build, coverage, and dependency files. CI checks both tools; type checking
remains separate. Runtime-specific globals are scoped to server/config and web
files rather than enabled across all shared packages.

## 2026-11-10: Conventional Commits

Use commitlint's conventional configuration with a Husky commit-msg hook for
immediate feedback. Pull request CI also validates the introduced commit range
so bypassing local hooks cannot bypass review checks. Existing history is not
retroactively linted.

## 2026-11-10: Track the project brief

Product and architecture requirements are preserved in PROJECT.md. Keep
continuity in the repository without private conversation references or
contributor-specific machine and account details. Demo profiles use generic labels.

## 2026-11-10: TypeScript workspace foundation

Use the previously proposed pnpm/Turborepo, Nuxt, Fastify, and Prisma direction.
Share contracts and brand tokens. Keep desktop and real provider implementations
as explicit future work. Use stable TypeScript 5 and Prisma 7 rather than the
registry's current prerelease Prisma default. Dependency versions are locked.

SQLite is a provisional development schema choice, not a confirmed production
storage commitment. Do not introduce a database dependency into health checks.

## 2026-11-10: Plugin and hosting boundary

Honor the owner's plugin-first, BYOK/BYOS requirements. SDK types do not implement
isolation. Defer execution until scoped permissions, secrets, and isolated RPC
are designed. No shared provider credentials or central integration hosting.

## 2026-11-10: Branch model

The owner specifies dev for development, master for beta, and tags for releases.
Use v-prefixed version tags by convention. CI validates but never publishes.

## 2026-11-10: Apache 2.0 license

Owner confirmed Apache License, Version 2.0. Keep the official LICENSE text and
Apache-2.0 package metadata when adding new workspace packages.

## 2026-11-10: Apache 2.0 license

Owner confirmed Apache License, Version 2.0. Keep the official LICENSE text and
Apache-2.0 package metadata when adding new workspace packages.

## 2026-11-10: No custom UI styling

Owner requires a basic Spotify-style structure: sidebar, main navigation/content,
and a fixed bottom player. Use standard Tailwind utilities and existing
shadcn-vue variants backed by the shared theme tokens. Never introduce custom
CSS blocks, inline styles, arbitrary Tailwind values, hardcoded colors or
sizes, or app-level theme overrides. This supersedes the earlier exception for
editorial hero and artwork styling. Preserve the supplied palette and Poppins.
Persisted the rule in AGENTS.md for subsequent work.

## 2026-11-10: Bundled Iconify icons

Owner requests Iconify icons, specifically andrsrxn:play for playback, replacing
text-symbol placeholders. Import individual andrsrxn icon data and use the
Iconify Vue offline component so SSR includes SVGs and runtime never depends
on a hosted icon API. Icons inherit currentColor and standard Tailwind sizing;
no custom styling or theme changes. Preserve upstream MIT licensing in installed
dependencies. Record the icon rule in AGENTS.md.

## 2026-11-10: Basil play icon

Owner changes the play icon to basil:play-solid, superseding andrsrxn:play.
Keep other icons unchanged. Bundle the individual Basil icon through Iconify's
offline renderer with the existing semantic colors and standard Tailwind sizing.

## 2026-11-10: Basil for all UI icons

Owner specifies Basil for the entire UI icon library, superseding the mixed
andrsrxn/Basil choice above. All current icons now import individual Basil data;
play remains basil:play-solid. Remove the unused andrsrxn dependency. Keep the
Iconify offline renderer, semantic colors, standard Tailwind sizes, and
accessible button labels. Saved the library-wide requirement in AGENTS.md.
