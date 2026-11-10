# Handoff

Last updated: 2026-11-10.

## Source change toasts

Added success toasts for source lifecycle changes in Administration. Adding or
removing a source includes the configured folder, URL, or integration label;
dragging to save a new order reports “Source order updated.” Notifications are
emitted only after the corresponding server request succeeds and use the shared
app-level Reka toast manager.

Added behavioral coverage for all three toast messages and wiring assertions for
the Administration success paths.

Verified `pnpm --filter @peridot/web test` (34 tests), web typecheck, full
workspace lint, the web production build, `pnpm format:check`, and
`git diff --check`; all passed. Database validation was skipped because this
change does not affect the schema. No browser visual/interaction pass was run.
Changes remain uncommitted on `dev` alongside existing work; no commit, push,
tag, publication, or deployment was performed.

## Local source folder search

Added case-insensitive deep folder search to the local-files source picker. The
browser no longer limits results to branches that were already expanded:
matching folders are found recursively through the admin-only
`GET /api/admin/filesystem/search` endpoint and shown as flat selectable results
with their full paths. Input is debounced, superseded requests are aborted, and
stale responses are ignored. The server also stops recursive traversal when the
response connection closes.

Recursive search is bounded to 100 results, 25,000 scanned directories, 48
levels, and eight seconds, with at most twelve concurrent directory reads. It
does not follow symbolic links, skips platform virtual/system directories, and
returns a truncation flag when a bound stops the traversal. Added behavioral
coverage for a five-level nested folder match, result capping, query validation,
administrator access, API encoding, loading/error states, and accessible search.

Changes remain uncommitted on `dev` alongside existing work. No commit, push, tag,
publication, or deployment was performed. Verified `pnpm typecheck`, `pnpm test`
(26 server, 34 web, and 5 shared UI tests), `pnpm build`, targeted ESLint and
Prettier checks, and `git diff --check`. Database validation was skipped because
the schema is unchanged. The root `pnpm check` passed lint but stopped at
formatting because the unrelated pre-existing `toasts.ts` differs from Prettier;
that file was preserved. No browser visual/interaction pass was run. Next:
exercise the source search against Windows drives and a large mounted directory
to tune the bounds, then format the existing Administration files when their
owner is ready.

## App-level Reka progress and connection toasts

Added one app-level Reka UI managed toast provider in the bottom-right, above the
fixed player. Library scan state and polling now live in a shared composable, so
the persistent queued/running progress toast remains current after leaving the
Administration page. Poll updates refresh discovered/created/updated counts,
then the progress toast becomes a brief completion or failure notification.
Temporary scan-status read failures retry without stacking duplicate toasts.

While a server session is active outside onboarding, the root monitor checks
`GET /api/health` every ten seconds with a four-second timeout and requires the
exact Peridot health signature. Entering the disconnected state adds one
persistent error toast; a successful probe dismisses it. Stable Reka toast IDs
keep repeated health failures to a single notification. The shared scan
composable also keeps the Administration inline state and controls in sync.

Added behavioral tests for progress/completion/failure scan copy, active status
detection, exact health-signature validation, network failures, and root-level
toast/monitor wiring. Updated README and DECISIONS.md.

Verified `pnpm check`, `pnpm test` (24 server, 32 web, and 5 shared UI tests),
`pnpm typecheck`, `pnpm build`, and `git diff --check`; all passed. Database
validation was skipped because this change does not affect the schema. No
browser visual/interaction pass was run. Changes remain uncommitted on `dev`;
prior unrelated changes were preserved. No commit, push, tag, publication, or
deployment was performed.

Known limit: active scan state is tracked after a scan is started in the current
browser session. A full reload cannot rediscover an already-running server scan
because the current API exposes scans only by ID. Next: add an active-scan
lookup or SSE/WebSocket status stream, then visually exercise both toast states.

## Fullscreen settings with Administration, Plugins, and server sources

Added a fullscreen Settings area (`layout: "settings"`) with a category sidebar:
Account, Library, Playback, Plugins, and Administration. Plugins moved out of the
main navigation into Settings; `/plugins` redirects to `/settings/plugins`. The
Settings screen opens from a user avatar in the main header, replacing the old
Demo badge and the sidebar Settings link. The connected-server label and Change
server control live in the Settings sidebar.

The header avatar loads the signed-in user's Gravatar image using the MD5 hash
of their normalized email (`ts-md5`), falling back to the bundled Peridot logo
when no image exists or the request fails. The profile is kept in a same-site
cookie so the avatar renders without an extra profile fetch.

Administration manages sources — the places the server gets raw audio from. A
source is a local folder, an external URL, or a deferred integration (Spotify,
YouTube Music). The server gained a `Source` model and admin-only
`GET/POST /api/admin/sources`, `DELETE /api/admin/sources/:id`, and a bounded
`GET /api/admin/filesystem/tree` for lazy local-folder browsing. The sources
list is draggable (VueUse/SortableJS) and persists order through
`PUT /api/admin/sources/order`; removal is confirmed in a Reka alert dialog and
adding opens a Reka dialog that first asks for the kind, then shows a folder
tree, a URL field, or a deferred-integration note. Scanning walks every path
source, stores `sourceId` on each track, and audio streaming resolves a track
through its source. The first path source seeds from `MUSIC_LIBRARY_PATH`.
Administration also shows a live server log: Fastify's pino output is captured
in a bounded in-memory buffer and served only to administrators through
`GET /api/admin/logs?after=<id>`, which the page polls every two seconds.

Verified `pnpm check`, `pnpm typecheck`, `pnpm test` (24 server, 28 web, 5 shared
UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`; all passed. No
browser visual pass was run. Changes remain uncommitted on `dev`; prior unrelated
changes were preserved. No push, tag, publication, or deployment was performed.

Known limits: Account, Library, and Playback are placeholders; Plugins remains a
placeholder under Settings. URL and integration sources are stored but not
fetched yet. Host, port, database URL, and web origins are still
environment-only. Next: implement URL-source fetching, then account/profile
settings, then wire the real library client to the stored session.

## Email/username/password profile

Replaced the display-name account field with a required, unique email address so
a profile consists of email, username, and password. The server validates and
normalizes email at bootstrap, returns email in the user response, and accepts
either the username or the email address at sign-in. Onboarding now collects an
email for the first administrator and presents a single username-or-email
sign-in field. A new migration rebuilds the users table; existing local rows
get a placeholder email derived from their username so sessions remain valid.
Server and web tests were updated and bootstrap email-validation and email
sign-in cases were added.

## Unknown-route home redirect

Added a Nuxt catch-all page so unknown web routes replace the current history
entry with the home page instead of rendering a not-found screen. Existing
server/session middleware remains authoritative, so the home route continues to
send unconfigured or signed-out users through onboarding. Added a focused route
regression test. Changes remain uncommitted on `dev`; unrelated working-tree
changes were preserved. Verification results follow below.

## Development connection-refused fix

Reproduced `pnpm run dev` serving Nuxt successfully while the API port 17430
refused connections. The server watch process had exited because the root quick
start did not supply the newly required `DATABASE_URL` and
`MUSIC_LIBRARY_PATH`; Turbo left the web task running and obscured the failure.

Development startup now applies committed migrations, defaults storage to
`apps/server/peridot.db` and `apps/server/music`, and creates the music directory
when needed. User-provided development paths remain authoritative, while built
server startup still requires explicit storage configuration. Migrations run
before Turborepo starts its persistent tasks, and the server uses Node's native
watch mode with the tsx import hook; both avoid Windows child-process stalls seen
when Prisma or the tsx CLI watch wrapper ran concurrently under Turbo. Added
behavioral coverage for defaults, directory creation, and override preservation.
The exact root `pnpm run dev` command then applied both migrations, started the
API and Nuxt together, and remained healthy. HTTP checks returned 200 from the
web root, server health endpoint, and authentication status endpoint; the latter
reported the expected first-administrator setup state. `pnpm check`, full
typecheck, all 12 server tests, all 18 web tests, all 5 shared UI tests,
`pnpm db:validate`, the production build, and `git diff --check` passed. No
browser visual pass was performed. Changes remain uncommitted on `dev`; no push,
tag, publication, or deployment was performed.

## Shared animated brand spinner

Added a reusable `Spinner` component to the shared UI package around the owner's
animated `spinner.svg`. It exposes a customizable status label and standard
Tailwind class sizing. The component hides the animation and shows the static
brand mark for reduced-motion users. Onboarding network discovery now uses the
shared spinner instead of rotating a generic refresh icon.

Added shared UI SSR coverage for the animated asset, accessible status text,
class overrides, and reduced-motion fallback. README and the durable component
decision are updated. `pnpm test` passed (11 server, 17 web, and 5 shared UI
tests), as did `pnpm typecheck`, `pnpm build`, `pnpm check`, and
`git diff --check`. Unchanged tasks used the Turbo cache. Database validation was
not repeated because this change does not affect storage. No browser visual pass,
commit, push, publication, or deployment was performed. Changes remain
uncommitted on `dev` alongside the owner's existing work.

## Windows first-render dev crash fix

Reproduced the reported `@peridot/web:dev` exit `3221226505` (`0xC0000409`). The
process reached Ready, then Vite discovered the route-level Iconify imports and
linked `@peridot/ui` dependencies during the first onboarding render; its runtime
dependency optimization immediately terminated the Windows Node process. Added
the direct imports and shared UI entries to `vite.optimizeDeps.include`.
Because Vite resolves optimizer entries from the web workspace, the four runtime
packages owned by shared UI are also declared as web development dependencies;
they remain normal runtime dependencies of `@peridot/ui`.

The exact root `pnpm dev` workflow was rerun with a migrated disposable database.
Both tasks reached Ready, onboarding and the discovery API returned HTTP 200, and
the process stayed alive beyond the previous crash point without dependency
warnings. It was then stopped. `pnpm check`, web typecheck, all 17 web tests, web
production build, and `git diff --check` passed. No push or deployment occurred.

## Primary gradient onboarding background

Implemented the full referenced shadcn.io-style Gradient container and applied it
to the fullscreen onboarding screen. Five radial blobs move independently on
their horizontal and vertical axes at non-matching 15–26 second base durations,
with configurable colors, intensity, speed, and film grain. The blobs use eased
transparent radial stops without blur filters. The decoration ignores pointer
input, is hidden from assistive technology, and becomes still when the user
prefers reduced motion.

The owner explicitly approved this component as an exception to the no-custom-
styling rule. Its scoped CSS, animation keyframes, generated CSS variables, and
inline static noise tile are contained inside Gradient.vue and the exception does
not extend elsewhere. Onboarding explicitly passes only `var(--primary)`, which
is also the component's product default for all five blobs. Shared UI SSR coverage
verifies the API, five primary blobs, grain toggle, semantic main element,
decorative accessibility, and foreground content layer. Web styling coverage
guards both the exception boundary and primary-only onboarding configuration.

Verified `pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 18 web, and
5 shared UI tests), `pnpm build`, and `git diff --check`. Unchanged tasks used
the Turbo cache. The production build emitted the scoped onboarding animation
stylesheet successfully. The browser-access host remained unavailable, so no
visual browser pass was completed. No schema validation was run because this
change does not affect the database. Changes remain uncommitted on `dev`; no
push, tag, publication, or deployment was performed.

## Shared favicon and onboarding logo

Exposed the owner-supplied shared brand directory through `@peridot/ui`, set
`favicon.png` as the global web favicon, and replaced the onboarding text mark
with `logo.svg`. The source files remain in `packages/ui/src/assets/brand`; Vite
inlines them into the production output, so no duplicate files or external
requests were added. The other supplied brand images remain available but are
not used yet.

Added a web test covering both shared asset imports. Web typecheck, all 16 web
tests, the production web build, production SSR verification of the favicon and
logo, formatting, and `git diff --check` passed. The temporary production server
was stopped. No browser visual pass, commit, push, or deployment was performed.

## Automatic local server discovery

Server selection now continuously probes the typed address after a short debounce
and automatically scans localhost plus the Nuxt host's private IPv4 `/24` networks
for the exact Peridot health signature on port 17430. Discovery is bounded to up
to three local subnets, uses concurrent short-timeout probes, coalesces calls for
ten seconds, and repeats automatically while the selection step remains open.
The endpoint does not accept caller-selected targets or ports.

Found servers appear as the only selectable actions. The manual Continue and scan
buttons were removed; clicking a listed server advances to administrator setup or
sign-in. A verified address typed into the field joins that list. The UI uses the
bundled Basil refresh icon as a scanning spinner and otherwise keeps discovery
labels concise with standard Tailwind and existing shadcn-vue variants.

Added tests for private-range filtering, subnet selection, port use, health
signature validation, same-origin discovery calls, and typed-address discovery.
`pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 15 web, and 3 shared UI
tests), `pnpm db:validate`, `pnpm build`, and `git diff --check` passed. A built
Nuxt smoke test scanned the detected private networks and found a temporary
Peridot health responder on localhost:17430; both temporary processes were
stopped. Browser-local subnet enumeration remains intentionally unsupported:
automatic subnet discovery reflects the Nuxt host's network, while the typed
address probe runs in the browser. No browser visual interaction pass was run.

## Required first administrator and onboarding authentication

Implemented the users/authentication foundation and removed the temporary
deployment-wide administrator token. The Prisma schema and second migration now
contain users and expiring sessions. Passwords are salted scrypt hashes, opaque
session tokens are stored only as SHA-256 hashes, and protected routes resolve a
real user session. An empty server returns `428 setup_required` for protected
operations, exposes setup status, and permits exactly one first-user bootstrap;
that user always receives administrator privileges. Bootstrap closes once any
user exists. Sign-in, current-user lookup, and session revocation are available.

Onboarding now connects to the selected server, reads its setup state, and then
either requires first-administrator creation or signs in an existing user. The
server address and 30-day session are persisted in same-site browser cookies.
Configured `PERIDOT_WEB_ORIGINS` controls browser API access. The new server and
onboarding default is port 17430. The old `PERIDOT_ADMIN_TOKEN` setting is no
longer accepted or documented.

Added behavioral coverage for mandatory setup, one-time bootstrap, administrator
assignment, password hashing, sign-in failures, authenticated current-user
access, revocation, CORS, the onboarding API client, safe network errors, and the
17430 defaults. `pnpm check`, `pnpm typecheck`, `pnpm test` (11 server, 11 web,
and 3 shared UI tests), `pnpm db:validate`, `pnpm build`, and `git diff --check`
passed. A fresh database applied both migrations, and the built server smoke test
confirmed health on 17430, unauthenticated setup enforcement, admin bootstrap,
and authenticated track access. The test server was stopped and its repository
temporary files were removed.

Current limits: only bootstrap and sign-in UI exist. Additional user creation,
role management, password changes/recovery, and a session-management UI remain
future work. The web music library is still fictional and does not yet use the
session to fetch real catalog data. All work remains uncommitted on `dev`; prior
unrelated changes were preserved, and no push, tag, publication, or deployment
was performed. Next: connect the real library client with the stored session,
then design administrator-managed user invitations and account settings.

## Fullscreen server onboarding and routed web app

Added a first-launch fullscreen onboarding screen at `/onboarding` that asks for
the user's Peridot server address. HTTP(S) addresses are normalized, credentials
and URL parameters are rejected, and the non-secret value is persisted for one
year in a same-site cookie. Global Nuxt middleware redirects unconfigured app
requests to onboarding and preserves the requested destination. The current
server can be changed from the sidebar. This frontend milestone intentionally
does not probe `/api/health` or fetch server data while the browser/API contract
is still being implemented; onboarding confirms address format, not reachability.

Replaced the single in-memory section switcher with Nuxt file routes for home,
library, liked songs, playlists, and plugins. The approved sidebar/content/player
layout is now shared, navigation uses real links and URLs, and demo player,
search, and liked state survives client-side route changes. No theme tokens,
custom CSS, dependencies, or server files were changed by this work.

Verified frontend ESLint, web typecheck, all nine web tests (including new server
address normalization/rejection coverage), production web build, and git diff
checks. Production HTTP smoke tests confirmed the unconfigured 302 with preserved
redirect, standalone onboarding 200, and SSR 200 plus expected content for all
five configured routes. The temporary production server was stopped. Full root
lint remains blocked by an unrelated unused `waitForScan` helper in the owner's
uncommitted `apps/server/test/library.test.ts`; that server work was preserved.
No browser screenshot/visual interaction pass, schema validation, push, deploy,
or commit was performed. Next: connect the stored address to a typed API client
once the server contract and browser access policy are ready, then add connection
status/error handling and replace demo library data.

## Local library server vertical slice

Implemented the backend-only local library milestone. The Fastify server now
validates its SQLite URL, one music root, and a minimum-length administrator
token; public health remains independent of the database. Prisma 7 uses the
maintained better-sqlite3 adapter and a committed initial migration. Protected
APIs create and inspect persistent asynchronous scans, list real catalog tracks,
fetch a track, and stream original audio with HEAD and single-byte-range support.

Scanning supports MP3, M4A/AAC, OGG/Opus, WAV, and FLAC, skips symlinks, uses
bounded metadata parsing, avoids reparsing unchanged files, preserves existing
metadata on parse failures, and marks missing files unavailable only after a
successful traversal. Scan conflicts, interrupted jobs, sanitized failures,
path containment, and missing files are handled explicitly. Filesystem paths and
statistics are never returned by API contracts. The web preview remains
fictional and unchanged.

Behavioral server tests use disposable SQLite databases and generated WAV data;
they cover configuration, authentication, scan lifecycle and reconciliation,
metadata failures, symlink exclusion, range streaming, missing files, failed
traversal, and conflicts. Final verification results are recorded at the end of
this entry. `pnpm check`, `pnpm typecheck`, `pnpm test` (eight server, nine web,
and three shared UI tests), `pnpm db:validate`, `pnpm build`, a fresh-database
`pnpm db:migrate:deploy`, built-server HTTP smoke checks, and `git diff --check`
all passed. The smoke check returned public health 200, protected catalog 401
without a token, and catalog 200 with a token; its process and temporary files
were stopped and removed.

Concurrent uncommitted web and lint-configuration changes appeared during the
server work and were preserved untouched. Server changes also remain uncommitted
on `dev`; no push, tag, publication, or deployment was performed. Next: review
the API and temporary authentication boundary, then connect the web application
without exposing the administrator token; replace it with user sessions in the
users milestone.

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

## 2026-11-10: Silent empty server discovery

Removed the onboarding network discovery empty-result message. When a completed
scan finds no servers, the section now stays empty; active scans still show the
spinner, discovered servers remain selectable, and discovery failures retain
their existing notice. Added a source regression assertion preventing the
"No servers found" message from returning. Changes remain uncommitted on `dev`;
unrelated working-tree changes were preserved. All 18 web tests, web typecheck,
targeted formatting, and `git diff --check` passed. Schema validation, production
build, and browser visual QA were skipped because this is an isolated empty-state
presentation change. No commit, push, publication, or deployment was performed.
