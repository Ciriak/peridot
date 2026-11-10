# Working on Peridot

Read README.md, docs/PROJECT.md, docs/DECISIONS.md, and docs/HANDOFF.md first.
The brief was recovered from project chats and is now tracked in this repository.
Inspect git status and recent commits before editing; preserve unrelated changes.

## Workflow

- Work in the real clone (C:\Users\cyria\Desktop\peridot on the initial machine).
  The chat workspace at Documents/ChatGPT/Peridot was empty. Paths on future
  machines may differ: verify the Git root rather than assuming this path.
- dev is development, master is beta, and tags are releases. Target dev for work.
- Do not push, tag, publish, or deploy without user authorization.
- Use Node 24.15+ within major 24 and pnpm 11.25.0; commit pnpm-lock.yaml changes.
- Use the scripts in README.md. Check formatting, types, tests, schema, and builds
  for relevant changes; report actual results and any skipped verification.
- Add meaningful behavioral tests. Keep package boundaries explicit.

## Product constraints

Self-hosted and local-first. External integrations are optional plugins with
user-provided credentials and user-controlled services. No embedded shared keys.
Do not load untrusted plugins into Fastify or expose credentials to browser code.
The plugin SDK is an initial contract, not a secure runtime or stable public API.
Follow the brand and architecture recorded in docs/PROJECT.md.

## Handoff

Update docs/HANDOFF.md before ending a milestone: completed work, checks run,
known limits, uncommitted changes, and concrete next actions. Record durable
choices with reasons in docs/DECISIONS.md. Keep README commands accurate. Never
include credentials. The current user's instructions override these conventions.

## License

Peridot uses Apache-2.0. Preserve LICENSE and use Apache-2.0 in new package metadata.

## License

Peridot uses Apache-2.0. Preserve LICENSE and use Apache-2.0 in new package metadata.
