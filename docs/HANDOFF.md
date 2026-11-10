# Handoff

Last updated: 2026-11-10.

## Personal information cleanup

Replaced the demo profile name and initials with generic labels. Removed local
checkout paths, account-specific remote URLs, timezone, and private conversation
references from project documentation. Existing unrelated work is preserved;
changes remain uncommitted on dev. Git history and local Git metadata are outside
this file cleanup and may retain identifying information. No push or deployment.
Next: review the cleanup diff before committing; separately assess history cleanup
if older commits will be shared.

Verified: targeted personal-information scan found no remaining matches in source
and documentation; changed-file formatting, lint, web typecheck, all three web
tests, web production build, and git diff --check passed. No behavioral tests were
added for static text replacements. Server/schema checks and browser visual QA
were skipped because this change only affects documentation and demo labels.

## Windows dev-script toolchain fix

Diagnosed missing pnpm on PATH; Node 24.15.0 and Corepack were installed.
Default corepack enable failed with EPERM writing Program Files/nodejs/pnpm.CMD.
Enabled only pnpm shims in the existing user npm bin directory (APPDATA/npm),
already on PATH, without changing PATH or requiring administrator rights.
pnpm --version now resolves 11.25.0. Verified root pnpm dev starts Nuxt on 3000
and Fastify on 3001; both HTTP endpoints returned 200. Stopped the verification
run with Ctrl+C so the owner can run it. README documents the Windows setup.
No app code or dependencies changed for this fix; app tests/build/schema were
not repeated. All prior changes preserved, no commit/push/deployment.

## Poppins main font

Owner specifies Poppins as the main UI font. Updated both theme sans tokens,
PROJECT.md, DECISIONS.md, and README. Bundled Latin 400/500/600/700 weights locally
through @fontsource/poppins with swap loading; lockfile updated. Rounded preview
650/750 weights to loaded 600/700. Artwork-specific serif styling remains.
Verified pnpm check, build (all four local WOFF2 assets emitted), and git diff
--check. Types/tests/schema were not rerun for this font/CSS-only change. Browser
visual QA remains unavailable. No new behavioral tests needed. Work remains
uncommitted on dev, prior changes preserved; no push/deployment. Next: visually
review typography at desktop/mobile sizes, then continue the library milestone.

## Owner-supplied hex theme and updated specification

Applied the owner's final Tailwind hex configuration. Shared tokens contain the
complete light/dark palettes, font stacks, sidebar/chart colors, radii, and
shadows. Shadow colors also use hex alpha notation. The web stylesheet retains
the supplied utility mappings and base rules plus the monorepo source scan.
Dark mode is applied to HTML. Removed the app-level root palette overrides and
connected main surfaces, selected navigation, and the logo to theme tokens;
illustrative album/hero colors remain artwork-specific.

Owner explicitly confirmed that Tailwind primary overrides the earlier brief:
dark primary is #00A63E, light primary #171717. Updated PROJECT.md and DECISIONS.md
to make this authoritative, including supplied fonts and radius. The earlier
#46B54A theme statements below are historical and superseded.

Verified the final hex configuration with pnpm check, build, git diff --check,
and a direct comparison of all 64 supplied hex palette tokens. HTTP 200 and the
HTML dark class passed. Typecheck and all seven tests passed immediately before
the final equivalent hex token replacement; no behavior changed afterward.
Schema checks were skipped because storage/server code is unchanged. Browser
visual QA remains unavailable. No new test files for this styling-only update.
Preview remains at http://127.0.0.1:3000/. All changes are uncommitted on dev;
existing unrelated changes preserved, no push/deployment. Next: visually review
the theme and keyboard controls, then continue the local library milestone.

## shadcn-vue correction

The preview now uses actual official shadcn-vue registry components in the shared
UI package: Button for every interactive action, Input for search, Badge for
preview indicators, and Slider for seek/volume. Components are built on Reka UI;
Tailwind CSS 4 is configured through its Vite plugin, with an explicit shared UI
source scan. Shared tokens initially retained primary #46B54A (now superseded above) and include the shadcn semantic
colors. Nuxt imports shared components through explicit package exports. Registry
configuration is tracked in both workspaces. Added an optional thumbLabel prop
so each slider's interactive thumb has an accessible name. Copied code retains
its upstream MIT notice; Peridot metadata and LICENSE remain Apache-2.0.

Verified frozen-lockfile installation, pnpm check, typecheck, test (three UI SSR
cases, three library cases, and the existing server test), build, and git diff
--check. Unchanged Turbo tasks used cache. The HTTP preview returned 200 with 29
shadcn buttons, one input, two sliders, and two badges. UI tests cover native
disabled buttons, initial search model/label, and slider initial progress plus
bounds/label. Reka initializes thumb position/current-value ARIA after hydration;
SSR checks do not claim to test client interaction. Browser visual and keyboard
QA remain unverified because the browser host was unavailable earlier in this
session. Schema validation was not repeated: no schema/server changes here.

Local web preview restarted at http://127.0.0.1:3000/. Changes remain uncommitted
on dev, with earlier unrelated changes preserved. Lockfile includes new UI and
Tailwind dependencies. No push or deployment. Next: visually review desktop and
mobile, exercise slider keyboard controls, then proceed with the real local
library slice. The earlier custom-only preview is superseded by this correction.

## Interactive web design preview

Replaced the static Nuxt shell with a responsive dark music dashboard: sidebar,
featured mix, five fictional album covers made in CSS, recent tracks, library
search, favorites, playlist placeholders, optional-plugin cards, and a persistent
simulated player with seek, skip, and volume controls. All assets are local;
no external requests, credentials, or audio files are used. Demo state resets on
reload. The logo is an initial organic SVG sketch, not finalized brand geometry.

Added three behavioral tests covering search, favorites filtering with stable
playback indexes, and reversible favorite changes. README describes demo limits.
Verified pnpm check, typecheck, test (three web cases and existing server test),
db:validate, build, git diff --check, and HTTP 200 with expected server-rendered
preview content. Some unchanged Turbo tasks used cache. Browser automation host
was unavailable: no screenshot, visual responsive QA, or browser interaction test
was completed. CSS includes mobile breakpoints and reduced-motion handling.

Preview started at http://127.0.0.1:3000/ using the web dev script. pnpm was not
on PATH; used Corepack 11.25.0 with shims in the system temporary directory for
nested scripts. No repository toolchain configuration was changed for this.
Work remains uncommitted on dev; prior tooling and documentation edits preserved.
No push or deployment. Next: review design in a browser, refine shared components
and icons, then implement the local library vertical slice with real storage/auth.

## Code linting and formatting update

Added root ESLint flat configuration for JavaScript, TypeScript, and Vue, using
recommended JS/TS and essential Vue rules. Existing Prettier commands are retained
with explicit default settings and eslint-config-prettier compatibility. Added
lint, lint:fix, and check scripts, a CI lint step, and README usage instructions.
Generated/build/dependency files are excluded. All work remains uncommitted on dev;
existing commitlint and other working-tree changes were preserved.

Verified: frozen-lockfile installation, pnpm check, pnpm typecheck, pnpm test,
and git diff --check passed. In-memory invalid TypeScript and Vue examples were
correctly rejected by ESLint without adding test files to the repository.
No application behavior was changed; application builds and database schema
validation were not rerun for this tooling-only change. CI has not run on GitHub.

## Commit linting update

Added commitlint with Conventional Commits rules, a Husky commit-msg hook,
automatic hook installation through prepare, and pull request commit-range CI.
README documents accepted messages and manual checks. Work is uncommitted on dev;
no commits or pushes were made.

Verified: frozen-lockfile installation, valid/invalid message checks through both
the CLI and installed hook, formatting, and git diff --check. Git hooks are active
in this clone. GitHub CI has not run. Application types, tests, database validation,
and builds were not rerun because application code was unchanged.

## Repository and workflow

Initial baseline: c783498. All foundation changes are currently uncommitted on dev.
No commits, pushes, tags, deployment, or release publication were performed.

Owner policy: dev is development; master is beta; Git tags are releases.
Verify the Git root before running commands, especially on another machine.

## Project context

Read PROJECT.md for product and architecture requirements before starting work.

## Completed foundation

- pnpm 11.25.0 workspaces, Turbo tasks, pinned lockfile, Node 24 requirements.
- Nuxt 4 dark web shell and shared brand tokens.
- Fastify server, health endpoint, graceful shutdown, and behavioral health test.
- Strict TypeScript packages for API contracts, player state, plugin manifests.
- Prisma 7 SQLite catalog schema and validation/generation scripts.
- Desktop, official plugins, and infrastructure roadmap directories.
- CI for development/beta/version tags; formatting and repository hygiene.
- README setup instructions, agent conventions, project brief, and decision log.

## Verification performed

On Windows with Node 24.15.0 and pnpm 11.25.0:

- pnpm install --frozen-lockfile: passed after explicitly configuring required
  dependency build scripts via pnpm 11 allowBuilds.
- pnpm format:check: passed.
- pnpm typecheck: passed for five TypeScript projects.
- pnpm test: passed (health payload, HTTP status, unknown route).
- pnpm db:validate: passed.
- pnpm build: passed for web, server, and three shared TypeScript packages.
- Built server and built Nuxt app startup: HTTP responses passed on temporary
  loopback ports 43101/43102. Verification processes were stopped afterward.
- git diff --check: passed.

CI is configured but has not run on GitHub. No browser visual QA was performed.

## Known limits

The web shell is now an interactive fictional preview. Real playback, library scanning, authentication, database
runtime/client, migrations, marketplace, isolation, provider integrations,
OpenSubsonic and desktop packaging are not implemented.
The SDK is an early type contract, not a stable API or secure execution runtime.
SQLite is provisional. No external credentials or hosted services are required.

## Next milestone

Implement a local library vertical slice: administrator-configured music folder,
track scanning and persistence, library API/UI, then authenticated audio playback.
First decide the storage/auth boundary and validate the schema before creating a
migration. Add relevant behavioral tests and update README setup commands.

Preserve BYOK/BYOS and plugin isolation requirements. Finalize the organic
three-corner SVG logo and reduced-motion spinner when building UI components.

## Resume prompt

Continue Peridot from AGENTS.md and docs/HANDOFF.md on dev. Read PROJECT.md,
inspect the working tree, preserve changes, and implement the next milestone.

## License update

Owner confirmed Apache 2.0. Added the official Apache LICENSE text, set all
workspace package license fields to Apache-2.0, and documented it in README and
agent conventions. Formatting and diff checks passed.

## 2026-11-10: Basic token-driven music layout

Replaced the custom editorial preview CSS with standard Tailwind utilities and
shared shadcn-vue Button/Input/Badge/Slider variants. Layout has a sidebar,
scrollable main screen, and a fixed bottom player with matching reserved space.
Mobile navigation has a labeled toggle and close control. Removed decorative
hero/artwork palettes and style overrides; shared theme tokens and Poppins are
unchanged. Search, favorites, track selection, simulated transport, seek, and
volume remain. Playlist/plugin screens explicitly show their pending status.
Saved the owner's no-custom-styling rule in AGENTS.md and DECISIONS.md.

Changes remain uncommitted on dev with previous unrelated edits preserved.
No push, tag, publication, or deployment. Real audio and persisted data remain
pending. Next: review the responsive layout, then continue the local library
vertical slice. Verification results are recorded below.

Verified: pnpm check, pnpm typecheck, pnpm test (seven existing tests), and
pnpm build passed; unchanged tasks used Turbo cache. Added a styling guard test
rejecting custom CSS blocks, inline styles, arbitrary Tailwind values, and local
color literals; all four web tests passed afterward. Production HTTP smoke check
returned 200 with navigation, main content, player controls, search, and mobile
toggle. git diff --check passed. Browser visual/keyboard checks were not run;
responsive behavior still needs visual review. Schema validation skipped because
no schema/server changes were made. No dependencies or lockfile changes in this
layout update.

## 2026-11-10: Iconify UI icons

Replaced every text-symbol UI icon with locally bundled Iconify andrsrxn SVGs,
including andrsrxn:play, pause, skip/restart controls, favorites, navigation,
menu/close controls, and music placeholders. The offline Vue renderer imports
individual icon data; no icon API or external runtime request is needed. Icons
inherit semantic colors and use existing shadcn/Tailwind sizing. Saved the icon
rule in AGENTS.md and documented the dependency choice in DECISIONS.md/README.
Added @iconify/vue and @iconify-icons/andrsrxn to the web package and updated
pnpm-lock.yaml; upstream MIT licensing stays in the dependency packages.

Verified pnpm check, typecheck, and test (ten total tests, including two new
Iconify SSR tests). Tests cover bundled SVG output for every registered icon,
decorative accessibility, Tailwind sizing, exact andrsrxn:play data, and distinct
play/pause output. Production build and HTTP verification results follow below.
Schema validation skipped because no database/server changes were made. Browser
visual/keyboard QA was not run. Changes remain uncommitted on dev with unrelated
work preserved. No push, tag, or deployment. Next: visually review the icons and
continue the local library vertical slice; real audio remains unimplemented.

Production build passed. HTTP smoke check passed with 200, the exact
andrsrxn:play SVG body in initial HTML, accessible play-button label, and no
remaining text-symbol icons. git diff --check passed.

## 2026-11-10: Basil play-solid replacement

Switched the bundled play icon to basil:play-solid per owner request. Other UI
icons retain andrsrxn. Added @iconify-icons/basil and updated pnpm-lock.yaml;
updated the exact-icon SSR test, AGENTS.md, README, and DECISIONS.md. Offline
rendering, semantic colors, and standard Tailwind/shadcn sizing are preserved.
No custom styling added. Changes remain uncommitted on dev, with unrelated
work preserved; no push or deployment. Next: visually review the new play icon,
then continue the local library milestone. Browser visual QA and schema/server
checks are skipped for this icon-only change. Check results follow below.

Validation initially caught an accidental playlist import replacement; corrected
it back to andrsrxn/playlist. Final lint/format checks, web typecheck, and all six
web tests passed. git diff --check passed. Production build result follows.

## 2026-11-10: Basil across the UI

Owner expanded the icon choice to Basil for every UI icon. All navigation,
favorites, placeholders, mobile menu/close, and transport icons now use bundled
@iconify-icons/basil data. Removed the unused andrsrxn dependency and updated
the lockfile, AGENTS.md, README, and DECISIONS.md. The earlier play-only entry is
superseded. Existing offline SVG tests cover every icon and the exact
basil:play-solid selection. Previous play-only production build passed; final
library-wide verification results follow below.

No custom CSS or theme changes. Work remains uncommitted on dev; unrelated
changes preserved. No push or deployment. Schema/server checks and browser
visual QA skipped for this icon-only update. Next: visually review Basil icons,
then continue the local library milestone.

Final Basil-only verification passed: pnpm check, web typecheck, all six web
tests, production web build, and git diff --check. No andrsrxn references remain
in app source, web dependency metadata, lockfile, or current contributor/README
rules; older decision/handoff entries remain historical.

## 2026-11-10: Main header search placement

Removed the section title from the main panel's top header and moved search to
the left. Sidebar and content heading remain unchanged. Added a locally bundled
Basil search-outline icon inside the search field, with standard Tailwind
positioning/padding and semantic muted-foreground color. The decorative icon is
hidden from assistive technology and does not intercept pointer input; the input
retains its accessible name and search binding. No custom styling added.

Work remains uncommitted on dev; unrelated changes preserved. No dependency
changes, push, or deployment. Browser visual QA, separate typecheck, and schema/
server checks skipped for this presentation-only update. Existing search tests
and the icon SSR suite cover filtering and the new icon's server rendering;
no new behavioral test needed for positioning. Next: visually review the header
on desktop/mobile, then continue the local library milestone. Results follow.

Verified: pnpm check, all six web tests, production web build, and
git diff --check passed for the final search placement/icon change.

## 2026-11-10: Larger player and favorite controls

Enlarged album favorite buttons and bottom player controls from shadcn icon-sm
to icon-lg, with explicit Tailwind size-6 Basil icons. The primary play/pause
button uses size-12 for emphasis. Sidebar icons and controls remain unchanged.
All sizing uses standard utilities and existing variants; no custom CSS or theme
changes. Existing favorite/playback behavior is unchanged, so no new behavioral
tests were added. Lint/format and all six web tests passed; build result follows.
Separate types, schema/server checks, and browser visual QA skipped for this
size-only update. Work remains uncommitted on dev with unrelated edits preserved;
no push/deployment. Next: visually review larger controls at desktop/mobile sizes,
then continue the local library milestone.

Production web build and git diff --check also passed.
