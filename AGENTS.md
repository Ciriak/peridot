# Working on Peridot

Read `docs/PROJECT.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, and
`docs/HANDOFF.md` first. The project brief and contributor guidance are tracked
in this repository. Keep `README.md` user-facing rather than using it as the
agent instruction layer.
Inspect git status and recent commits before editing; preserve unrelated changes.

## Workflow

- Work in the project clone. Verify the Git root before running commands;
  checkout paths may differ between machines.
- dev is development, master is beta, and tags are releases. Target dev for work.
- Do not push, tag, publish, or deploy without user authorization.
- Use Node 24.15+ within major 24 and pnpm 11.25.0; commit pnpm-lock.yaml changes.
- Use the scripts defined in `package.json` and documented in
  `docs/DEVELOPMENT.md`.
  Check formatting, types, tests, schema, and builds for relevant changes;
  report actual results and any skipped verification.
- Add meaningful behavioral tests. Keep package boundaries explicit.
- Never add useless commentary or redundant text to agent updates or
  user-facing copy. State only the required action, result, or context.

## Product constraints

Self-hosted and local-first. External integrations are optional plugins with
user-provided credentials and user-controlled services. No embedded shared keys.
Do not load untrusted plugins into Fastify or expose credentials to browser code.
The plugin SDK is an initial contract, not a secure runtime or stable public API.
Follow the brand and architecture recorded in docs/PROJECT.md.

## Handoff

Update docs/HANDOFF.md before ending a milestone: completed work, checks run,
known limits, uncommitted changes, and concrete next actions. Record durable
choices with reasons in `docs/DECISIONS.md`. Update `docs/DEVELOPMENT.md` when
setup, scripts, configuration, or contributor conventions change. Never include
credentials. The current user's instructions override these conventions.

## License

Peridot uses Apache-2.0. Preserve LICENSE and use Apache-2.0 in new package metadata.

## UI styling authority

Never add custom styling. Use standard Tailwind utilities, existing shadcn-vue
component variants, and the authoritative shared theme tokens only. Do not add
app/component CSS blocks, inline styles, arbitrary Tailwind values, hardcoded
colors or dimensions, or local theme overrides. Preserve the owner-supplied
palette and typography in packages/ui/src/tokens.css. Basic app structure is a
sidebar, main navigation/content screen, and fixed bottom music player.

The shared track table may bind VueUse `useVirtualList` container and wrapper
props, which generate runtime positioning and overflow styles. This narrow
technical exception is limited to virtual-scroll mechanics; all visual styling
must continue to use standard Tailwind utilities, shadcn-vue variants, and theme
tokens.

Use the Basil icon library through bundled Iconify SVGs for all UI icons; never use emoji or text-symbol
placeholders. The play icon is basil:play-solid. Icons must work offline and inherit
semantic colors and standard Tailwind sizing.
