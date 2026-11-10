# Decisions

## 2026-11-10: Local-source folder search

The local-files source picker searches directories recursively on the server so
users do not need to expand every level first. Search is case-insensitive and
returns selected flat matching folders with their full paths. The admin-only
endpoint starts from all filesystem roots by default, or an optional supplied
path, and uses bounded traversal: at most 100 results, 25,000 scanned
directories, 48 levels, and eight seconds, with twelve directory reads in
flight. It does not follow symbolic links and skips platform virtual/system
directories. Results report whether a bound stopped the search. The web client
debounces input, aborts superseded requests, and ignores stale responses; the
server stops a traversal when its response connection closes.

## 2026-11-10: App-level Reka toast notifications

Use Reka UI's managed Toast provider once at the web app root for work-in-progress
and connection errors. Library scan state and polling live in a shared composable
rather than the Administration page, so a progress toast remains current after
navigation. The active scan maps to a single persistent `loading` toast that
updates through queued/running and then becomes a brief completion or failure
toast. The toast viewport is fixed to the bottom-right and sits above the player.

While the app is connected, probe the configured server's public
`GET /api/health` endpoint every ten seconds with a bounded timeout and require
the exact Peridot health signature. Entering the lost state adds one persistent
error toast; a successful later probe dismisses it. Onboarding is excluded so
the connection monitor does not interfere with server selection. Reka's manager
updates toasts by stable IDs, preventing repeated poll failures from stacking
duplicate notifications.

Successful source changes also use the app-level toast system. Added and removed
sources include their configured label, while persisting a new source order uses
the update notification. Toasts are emitted only after the server confirms the
mutation, so they report durable state rather than an optimistic local edit.

## 2026-11-10: Gravatar avatar with offline fallback

The signed-in user's avatar in the main header loads from Gravatar using the MD5
hash of their normalized email, computed with `ts-md5` both in the browser and
during SSR. The request uses `d=404` and falls back to the bundled Peridot logo
when the email has no Gravatar image or the network fails, so the header stays
usable offline. The user profile is stored in a same-site cookie to avoid an
extra profile fetch. This is an owner-requested exception to the local-first
default; no other external images are fetched.

## 2026-11-10: Server sources for raw audio

Where the server gets raw files is modeled as a list of `Source` rows rather
than a single folder. A source is one of `path` (a local directory), `url` (an
external HTTP(S) location), or `integration` (Spotify, YouTube Music, and other
services, deferred). Administrators manage sources from Settings and each local
folder source is resolved to an existing directory with a bounded, admin-only
filesystem autocomplete endpoint. A first `path` source seeds from
`MUSIC_LIBRARY_PATH` when the table is empty, and scanning walks every `path`
source while storing the owning `sourceId` on each track; audio streaming
resolves a track through its source. URL and integration sources are stored but
not fetched yet. Exposing configured paths and listing directories are
intentional, admin-only exceptions to the earlier no-filesystem-paths rule, so
the owner can manage their own server.

## 2026-11-10: Sources management UI

The Administration Sources list is draggable via VueUse `useSortable`
(SortableJS) and persists order through `PUT /api/admin/sources/order`, backed
by a `position` column on each source. Removing a source asks for confirmation
in a Reka UI alert dialog. Adding a source opens a Reka UI dialog that first
asks for the kind, then shows the matching form: local folders use a Reka UI
tree backed by `GET /api/admin/filesystem/tree`, which lazily lists one
directory level at a time from server filesystem roots; remote sources use a
URL field; integrations remain deferred.

## 2026-11-10: Server log view

The Administration screen includes a live server log. Fastify's pino output is
teed through an in-memory ring buffer (bounded to the 500 most recent entries)
and exposed only to administrators through `GET /api/admin/logs?after=<id>`.
The web page polls that endpoint every two seconds and appends new entries, so
the log refreshes live without a push channel. Request-completion lines are
summarized as `METHOD URL STATUS (ms)`; other pino messages keep their text.

## 2026-11-10: User profile identity fields

A user profile consists of an email address, a username, and a password. The
display-name field is replaced by a required, unique email address. Emails are
trimmed, lowercased, and validated at account creation. Users sign in with
either their username or their email address; both stay unique. The users
migration rebuilds the table and, for any pre-existing local rows, derives a
placeholder email from the username so existing sessions stay valid.

## 2026-11-10: Zero-configuration local development storage

Keep built server startup strict: deployments must explicitly provide
`DATABASE_URL` and `MUSIC_LIBRARY_PATH`. For the repository development command,
default those values to `apps/server/peridot.db` and `apps/server/music`, create
the default or configured music directory when absent, and apply committed
migrations before starting the watch server. This makes the documented
`pnpm dev` quick start complete while preserving explicit production storage
configuration and respecting any developer-provided paths. Run the server through
Node's native watch mode with the tsx import hook; the tsx CLI watch wrapper can
stall its child process when Turborepo starts the Nuxt task concurrently on
Windows.

## 2026-11-10: Gradient component styling exception

The shared Gradient component is the sole explicit exception to the general
no-custom-styling rule. It may use component-scoped CSS, keyframes, generated CSS
variables, and a local inline noise texture to reproduce the referenced
shadcn.io gradient behavior. The exception does not extend to other components.
Onboarding passes only the authoritative shared primary color; the component's
product default also repeats that token across all five blobs. Preserve reduced-
motion behavior, decorative accessibility, and pointer transparency.

## 2026-11-10: Shared animated brand spinner

Expose the owner-supplied animated blob through a reusable shared Spinner
component. The component provides a status label, accepts standard Tailwind
classes for context-specific sizing, and replaces the animation with the static
brand mark when reduced motion is preferred. Keep both assets local and bundled
through `@peridot/ui`; do not recreate the animation with custom CSS.

## 2026-11-10: Pre-bundle first-render web dependencies

Explicitly pre-bundle the offline Iconify modules, shared UI component entries,
and their runtime packages in Nuxt's Vite development configuration. Vite 8 did
not discover route and linked-workspace dependencies until the first onboarding
render on Windows, then its runtime optimizer terminated Node with `0xC0000409`.
Expose the four `@peridot/ui` runtime packages to the web optimizer as development
dependencies only; component ownership and production runtime declarations remain
in `@peridot/ui`.

## 2026-11-10: Shared owner-supplied brand assets

Keep reusable owner-supplied logos and images in `packages/ui/src/assets` and
export brand files through `@peridot/ui/assets/brand/*`. The web app uses the
provided PNG favicon globally and the provided SVG mark on onboarding. Import
these files through the package so Vite bundles or inlines them locally; do not
duplicate them into an app or fetch them from an external host.

## 2026-11-10: Constrained local server discovery

During server selection, debounce and probe the address field directly from the
browser. Also let the Nuxt host scan localhost and up to three private IPv4 `/24`
networks from its own non-internal interfaces on Peridot's fixed default port 17430. Accept only the exact public Peridot health signature, return only matching
servers, coalesce discovery calls for ten seconds, and never accept caller-chosen
scan targets or ports. This keeps the unauthenticated onboarding discovery route
bounded and prevents it from becoming a general network scanner.

Run discovery automatically every ten seconds while server selection is open.
Show only a spinner, the result list, and concise empty/error states; do not add a
manual scan or Continue button. A verified typed address joins the same list, and
clicking a listed server is the sole transition to account setup or sign-in.
Because browsers cannot reliably reveal their LAN address, subnet discovery sees
the network of the machine hosting the web app; direct field probing still runs
from the browser.

## 2026-11-10: Required first administrator and local sessions

Replace the temporary deployment-wide administrator token with database-backed
users and expiring opaque bearer sessions. An empty server exposes setup status
and refuses protected operations until onboarding creates exactly one first user,
which always receives the administrator role. After that first creation, the
bootstrap endpoint closes and users must sign in. Store passwords only as salted
scrypt hashes and session tokens only as SHA-256 hashes; browser storage contains
the opaque session credential, never a password or deployment secret.

Onboarding is a two-step server connection and account flow. It reads public
setup status from the selected server, presents required administrator creation
when no user exists, otherwise presents sign-in, and persists the server address
and successful session in same-site cookies. Allow cross-origin browser API calls
only from configured `PERIDOT_WEB_ORIGINS`. The default server port is 17430.

This supersedes the temporary `PERIDOT_ADMIN_TOKEN` authentication boundary in
the local-library decision below. User invitations, password recovery, session
management UI, and administrator management remain future work.

## 2026-11-10: Browser-owned server selection and Nuxt routes

Require a server address before entering the web application. Normalize HTTP(S)
addresses and persist the non-secret value for one year in a same-site browser
cookie so both Nuxt middleware and server rendering can route first visits to the
fullscreen onboarding screen without a client-side flash. Keep server selection
changeable from the existing sidebar. Address reachability remains unverified
until the server's browser access and API contract are ready; format validation
must not imply a successful connection.

Use Nuxt's file-based router as the web navigation contract. Home, library, liked
songs, playlists, and plugins have stable URLs while the approved sidebar,
content, and fixed-player layout remains shared. Demo player, search, and liked
state use Nuxt state so navigation does not reset the current session.

## 2026-11-10: Local library server boundary

The first server vertical slice uses one deployment-configured
`MUSIC_LIBRARY_PATH`, a local SQLite catalog through Prisma 7's maintained
better-sqlite3 adapter, and explicit persistent scan jobs. Scans do not run at
startup and never follow symlinks. Successfully completed scans mark unseen
tracks unavailable instead of deleting their metadata. Failed traversals do not
reconcile availability.

Until the users milestone, every catalog, scan, and audio route uses a single
administrator bearer token supplied through `PERIDOT_ADMIN_TOKEN`; health stays
public and database-independent. The token is a server-only deployment secret,
not a browser credential. Audio is streamed in its original format with HTTP
single-range support. Transcoding, artwork, watchers, multiple roots, stable
identity across renames, and web integration remain deferred.

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
