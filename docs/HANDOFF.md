# Handoff

Last updated: 2026-11-12.

## Cache-first query presentation

Cached TanStack data now renders immediately instead of being hidden by
background refresh activity or a failed refresh. Shared query presentation
helpers distinguish blocking initial loading from a refresh with data, and
suppress fatal query errors while cached data exists.

Album and artist detail pages derive their loading state from the cached match
query and the resolved page entity. They no longer set a manual loading flag on
mount or force the match query to refetch. Cached tracks start loading without
forcing another request. Track and album-list failures are shown within their
own sections, so a secondary failure does not hide an otherwise usable detail
header. Administrator list loading follows the same data-first rule.

Checks run:

- `pnpm --filter @peridot/web test` (142 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted Prettier and ESLint checks for the changed query, detail-page, and
  regression-test files
- `pnpm --filter @peridot/web build` (PWA precached 94 entries)
- `git diff --check`

Known limits: the exact away-and-back interaction was not exercised in a live
browser during this run. The runtime regression covers TanStack's
data-plus-error state and the page tests guard against forced mount loading.
Cold offline restoration may briefly show loading until IndexedDB resolves.
Server, schema, and non-web package checks were skipped because this change is
limited to client query presentation and detail-page state. Existing
uncommitted work remains preserved. No commit, push, tag, publication, or
deployment was performed.

Next: manually revisit an album and artist from another page while the server is
online, then repeat with the server stopped after those pages have been cached.

## Cover play controls use the pointer cursor

The full-cover play controls in the shared track table and both the current and
upcoming queue artwork now use the standard `cursor-pointer` utility. This
matches the existing album-card play control, including tracks shown on album
detail pages.

Checks run:

- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the changed components and tests
- `git diff --check`

Browser visual QA was not run for this presentation-only change. Existing
uncommitted work remains preserved. No commit, push, tag, publication, or
deployment was performed.

## Vite Lucide optimizer resolution

Nuxt's explicit Vite pre-bundle list includes `@lucide/vue` through the shared
spinner entry. pnpm's strict workspace layout did not make that package
resolvable from `apps/web`, producing the `NUXT_B7002` warning during dev
startup. The web workspace now declares the same `@lucide/vue` version as a
development dependency, keeping runtime ownership in `@peridot/ui` while making
the optimizer entry resolvable. A dev-config regression test checks that
declaration.

Checks run:

- `pnpm install`
- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks
- `pnpm --filter @peridot/web build` (94 PWA precache entries; existing
  non-fatal Rolldown `PLUGIN_TIMINGS` warning)
- Isolated Nuxt dev startup on port 3011 (ready without `NUXT_B7002`)
- HTTP smoke test for `/` (200)
- `git diff --check`

No commit, push, tag, publication, or deployment was performed. Existing
uncommitted work remains preserved.

## PWA manifest dev-server fix

The browser's `Manifest: Line: 1, column: 1, Syntax error` came from the Nuxt
development server returning the SPA HTML document for
`/manifest.webmanifest`. `@vite-pwa/nuxt` does not serve generated PWA assets in
development unless `devOptions.enabled` is true. The Nuxt configuration now
enables that development mode, and the offline-SPA regression test requires it.

Checks run:

- Dev-server HTTP check: `GET /manifest.webmanifest` returned 200 with
  `application/manifest+json`; JSON parsed with the Peridot name and three icons
- Dev-server HTTP check: `GET /dev-sw.js?dev-sw` returned 200 with JavaScript
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (PWA precached 94 entries)
- Production Nitro smoke test: root and manifest returned 200; manifest JSON
  parsed and the root HTML contained the manifest link

Known limits: browser DevTools was not manually inspected after the fix; the
equivalent manifest and service-worker requests were validated over HTTP.
Existing uncommitted offline, catalog, localization, and account work remains
preserved. This fix and its documentation are also uncommitted. No commit,
push, tag, publication, or deployment was performed.

Next: reload `http://127.0.0.1:3000/` with a fresh development server and
confirm the manifest syntax message is absent from the browser console.

## Native track action tooltips

The cloud save/remove control and favorite control in each shared track row now
use native browser `title` tooltips. Their text follows the current localized
action, so it changes between save/remove and like/unlike states alongside the
existing accessible label. The shared favorite button derives both labels from
one computed value. No custom styling or tooltip runtime was added.

Checks run:

- Focused likes UI and offline SPA tests (7 passing)
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build (PWA precached 94 entries)

Known limits: browser-native tooltip placement and timing remain controlled by
the browser, and visual hover QA was not run. Existing uncommitted work remains
preserved. No commit, push, tag, publication, or deployment was performed.

## Player progress-bar loading effect

The persistent player's playback slider now pulses while a track is being
prepared or the native audio element is buffering. The slider exposes
`aria-busy` during the same period, uses the shared primary progress styling,
and applies the pulse with `motion-safe:animate-pulse` so reduced-motion users
receive a static loading state. Native `waiting` and `stalled` events start the
effect, while `playing` clears it, covering both initial preparation and stalls
later in a track.

Checks run:

- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the player composable, layout, and
  regression test
- `pnpm --filter @peridot/web build` (PWA precached 94 entries)
- `git diff --check` for the changed files

Known limits: visual browser QA was not run against a live buffering track. The
existing uncommitted offline, catalog, localization, and account work remains
preserved. No commit, push, tag, publication, or deployment was performed.

## Profile email field removed

Settings → Profile now contains only the editable display-name form. The
read-only email field and its now-unused helper copy were removed because the
signed-in user's email is immutable through Profile. Email remains visible on
each account row and in the administrator edit dialog under
Settings → Admin → User Management. Regression coverage asserts the profile
field is absent while User Management continues to render `account.email`.

Checks run:

- Focused settings tests (13 passing)
- Full web tests (141 passing)
- Web typecheck
- Targeted ESLint and Prettier checks
- Production web build

Server, schema, and browser visual checks were skipped because this change only
removes a client-side form field and its unused locale copy.

## Offline-compatible SPA and TanStack Query cache

The web application now runs in Nuxt SPA mode while retaining Nitro for the
application document and local server discovery. `@vite-pwa/nuxt` generates an
installable manifest and service worker that precaches the SPA root shell, all
client chunks, fonts, icons, and the navigation fallback. Signed cover and artist
image routes use a non-expiring browser CacheFirst cache; API JSON is not routed
through Workbox.

Authenticated read state now uses TanStack Vue Query. The official per-query
IndexedDB persister stores visited data indefinitely with a versioned buster,
query keys are scoped by server and user, and realtime catalog events invalidate
the matching catalog query prefix. Catalog tracks, albums, artists, detail
lookups, likes, quick picks, queue, tasks, administrator lists, and server logs
were migrated. Discovery, health, filesystem browsing, and metadata-candidate
searches remain ephemeral. Likes and task creation use Query mutations; task
realtime updates and queue snapshots update the persistent cache explicitly.

Each shared track row has a Basil cloud-download/check action beside Favorite.
Saving requests persistent browser storage, fetches the complete authenticated
audio and available artwork, and stores them under a server/user/track key. The
player falls back to that cached blob only for a typed network failure and
revokes object URLs on track changes and teardown. Album and artist play controls
use the saved-track manifest when the server is unavailable. Logout, disconnect,
session invalidation, or identity changes clear persisted queries and offline
audio/artwork. Queue edits remain local offline and the latest snapshot is
retried after server reachability returns; other mutations are disabled offline.

Checks run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (141 web, 98 server, and 13 UI tests passing)
- `pnpm build` (5 successful tasks; PWA precached 94 entries and emitted `sw.js`
  plus Workbox)
- Production Nitro smoke test: root and deep `/albums` returned 200; manifest,
  service worker, and discovery returned 200; the root HTML contained the manifest
  link and client mount; the service worker contained the root precache and
  artwork route
- `git diff --check`

Known limits: offline catalog coverage is limited to pages previously visited
online, and offline audio requires the explicit row action. Saved media remains
subject to browser quota and eviction. The browser automation host was
unavailable, so service-worker activation, an offline browser reload, and real
cached-audio playback were not exercised end to end. Queue synchronization is
the only offline write retained; likes, metadata, scans, and administrator
changes require connectivity. All changes remain uncommitted on `dev`; no
commit, push, tag, publication, or deployment was performed.

Next: in a supported browser, load library and detail pages online, save a track,
activate the service worker, stop the Peridot server, and verify deep-link reload,
search over visited terms, artwork, seek/next playback, queue reconnection, and
private-cache clearing on logout.

## Development server startup during catalog backfills

`npm run dev` now starts Fastify immediately even when the local catalog needs a
projection rebuild. The previous startup scheduled the backfill inside
`buildApp()`; SQLite work continuously refilled Node's microtask queues, delaying
`app.listen()` and making the server appear not to start. The backfill now starts
from Fastify's `onListen` hook and yields to the event loop after each reindexed
track. Pending scheduled work is cancelled on close, while an already running
backfill is still awaited.

Added a catalog regression test that verifies pending macrotask work runs before
the projection backfill completes. Verification passed:

- `pnpm --filter @peridot/server test` (98 passing)
- `pnpm --filter @peridot/server typecheck`
- `pnpm --filter @peridot/server build`
- Targeted ESLint and Prettier checks for the changed server files and test
- `npm run dev`; web returned 200 on `127.0.0.1:3000` and
  `GET /api/health` returned 200 on `127.0.0.1:17430` while the existing
  `apps/server/peridot.db` projection backfill was active
- `git diff --check`

All changes remain uncommitted on `dev` alongside the existing artist-metadata
work. No commit, push, tag, publication, or deployment was performed. The local
database's full 848-track projection rebuild should be allowed to finish before
stopping the development server; an interrupted rebuild resumes on the next
start.

## Artist metadata profiles

Artist pages now support automatic and manual provider-backed profiles with a
canonical display name and a locally cached portrait. The file-tag name remains
the stable local artist ID for routes, links, and likes. The catalog projection
stores a separate display name, includes both names in search terms, and returns
signed artist-image URLs.

`metadata_fetch` now processes artists after tracks. MusicBrainz can supply
canonical identity; Discogs supplies portraits when configured. The first exact
provider match supplies the name, and provider traversal continues until an
exact Discogs candidate supplies an image. Artist image downloads accept only
bounded HTTPS JPEG, PNG, or WebP responses from Discogs hosts and are
content-addressed in SQLite. Signed-in members can search merged artist
candidates, apply a manual match, view its source, or restore local metadata from
artist cards, detail headers, and collection context menus. Reset metadata now
clears track and artist overrides and removes cached portraits.

Checks run:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (137 web, 97 server, and 13 UI tests passing)
- `pnpm db:validate`
- `pnpm build`
- `pnpm db:update` against `apps/server/peridot.db`; Prisma reports no pending
  migrations
- `git diff --check`

Known limits: portraits require the existing Discogs provider, so
MusicBrainz-only installations receive canonical names with placeholders.
Automatic matching performs provider lookups per distinct artist and can lengthen
large background metadata tasks. Live provider responses and browser
visual/pointer QA were not exercised. Existing uncommitted playback, catalog,
and UI changes were preserved alongside this work. No commit, push, tag,
publication, or deployment was performed.

Next: visually verify portrait and alternate-name layouts at desktop and mobile
widths, then run a real MusicBrainz plus Discogs matching pass against a curated
library. The prior playback-regression note below predates this completed artist
work.

## Playback cover-loading regression

Starting a track could make playback and the player feel unresponsive because
queue hydration replaced every resolved queue item, and the shared track table
kept reconciling the complete 100-row catalog page. Cover URLs were also issued
per track with a fresh token, so tracks sharing one stored album image bypassed
the browser cache and requested the same bitmap repeatedly.

Queue hydration now resolves only missing track IDs and preserves existing
track objects during ordinary queue changes; catalog revisions still trigger a
full refresh. The shared track table keeps main-frame page-flow scrolling but
initially mounts 30 rows and reveals 30-row batches near the end. Cover URLs now
use a canonical `/api/covers/:coverId` route, and the server reuses signed cover
tokens during their validity window. Tracks sharing deduplicated artwork now
share the same browser-cache entry.

Checks run:

- `pnpm --filter @peridot/web test` (137 passing)
- `pnpm --filter @peridot/web typecheck`
- `pnpm --filter @peridot/web build`
- Targeted server cover/token tests (passing)
- Targeted ESLint and Prettier checks for changed files
- `pnpm --filter @peridot/server test` (87 passing, 4 failing in pre-existing
  uncommitted metadata/source work)
- `git diff --check`

Known limits: server typecheck is currently blocked by pre-existing uncommitted
artist-metadata errors in `metadata-enrichment.ts` and `catalog.ts`. The
supported server suite's four failures are also outside this fix: three
metadata cases and one source-management case. Local server startup is blocked
until the concurrent schema work is applied because the development database
does not yet contain `CatalogArtist.displayName`. Browser visual and network QA
could not run because the computer-use host rejected the local page URL. All
work remains uncommitted on `dev` alongside the existing artist-metadata work;
no commit, push, tag, publication, or deployment was performed. Next: after the
concurrent metadata work is resolved and its schema is applied, exercise play,
queue reorder, and queue open/close with browser network tools and confirm one
request per distinct cover.

## Player background crossfade restored

The persistent player's decorative blurred cover now waits 150 ms and directly
crossfades to a different resolved cover over three seconds. The fade wraps only
the decorative background; the visible square artwork and track metadata remain
immediate, so no foreground element lingers after a track change. Reduced motion
continues to disable the transition. The transition is absent when consecutive
tracks share the same cover URL, and the existing mounted decorative layer still
allows the background to fade out when artwork disappears or fails.

The player regression test now requires the background transition, rejects an
`out-in` mode that would create an empty frame, and verifies that only one player
cover layer uses the transition. Durable behavior is recorded in
`docs/DECISIONS.md`. Browser visual QA remains pending. All changes remain
uncommitted on `dev` with the existing localization, catalog, realtime, account,
and offline work preserved; no commit, push, tag, publication, or deployment was
performed.

Checks run:

- Focused player regression test
- `pnpm --filter @peridot/web test` (141 passing)
- `pnpm --filter @peridot/web typecheck`
- Targeted ESLint and Prettier checks for the player and tests
- `pnpm --filter @peridot/web build`
- `git diff --check`

Server tests and schema validation were skipped because this change only
affects web player presentation. Next: switch between tracks with distinct
artwork and verify the foreground cover changes immediately while the blurred
background crossfades, then repeat with reduced motion enabled.

## Main-frame track-list scrolling

Restored page-flow scrolling for the shared track table. Loaded track pages now
render in the main content region without a table-level maximum height or
independent vertical scrollbar. The load-more intersection sentinel and visible
button still request the next bounded server page.

The library regression test now rejects virtualization container props and
table-level `overflow`/maximum-height utilities, and verifies that
`#main-content` remains the vertical scroll owner. This was a correction to the
earlier virtual-list implementation, which violated the recorded decision that
track tables must not create a second scrollbar beside the main screen.

Checks run:

- `pnpm --filter @peridot/web test`
- Web typecheck
- Targeted ESLint and Prettier checks for the component and tests
- Production web build
- `git diff --check`

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev` with the existing localization and catalog work; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm one full-page
scrollbar at desktop and mobile widths and verify automatic and button-based
loading of the next track page.

## Per-item task progress

Each library source row now shows the shared `ProgressCircle` while an active
task belongs to that source. Running work supplies the determinate progress
value; queued work renders the indeterminate ring. If more than one active task
belongs to a source, the running task takes precedence, and other sources'
tasks do not add a spinner to the row. The indicator uses the source's localized
accessible label and existing semantic theme and standard Tailwind sizing.

Metadata provider rows use the same progress ring while that provider is being
queried. Metadata matching adds a bounded active-provider ID to task progress
before each provider request and clears it when the request finishes. The page
matches that ID to only the affected provider row, while the general Tasks view
keeps the technical detail hidden. This avoids implying that every enabled
provider is active during a fallback sequence.

Behavioral coverage asserts source-specific active-task selection, running-over-
queued priority, metadata-provider attribution before and after a blocked
provider request, and the settings progress bindings.

Checks run:

- `pnpm --filter @peridot/server test` (90 passing)
- `pnpm --filter @peridot/web test` (136 passing)
- `pnpm --filter @peridot/contracts build`
- Targeted ESLint and Prettier checks for the changed TypeScript, Vue, locale,
  and test files
- `pnpm typecheck`
- `pnpm build` (completed with the existing non-fatal Rolldown
  `PLUGIN_TIMINGS` warning)

Known limits: browser visual QA was not run. All changes remain uncommitted on
`dev` alongside the existing localization, catalog, realtime, and account work;
no commit, push, tag, publication, or deployment was performed. Next: open
Settings → Admin → Sources and Metadata while scans and provider fallbacks are
active, then verify determinate progress, the queued source state, provider
handoff, and reduced-motion behavior at desktop and mobile widths.

## Smooth progress-circle value transitions

The shared `ProgressCircle` now applies its 300 ms motion-safe transition to the
determinate indicator arc. Previously the transition utility was on the parent
SVG, which rotates continuously but does not animate its child's
`stroke-dashoffset`, so task-progress updates changed abruptly. The visual arc
now renders at zero first, applies the current value on the next animation frame
after mount, and resets to zero whenever progress becomes indeterminate. A newly
shown task spinner therefore fills from empty instead of appearing at its
current percentage. The accessible and displayed percentage values remain
immediate, while reduced motion disables both the value transition and rotation.

Focused shared UI coverage asserts that the transition and reduced-motion
utilities render on the progress indicator rather than its parent, and that the
first server-rendered determinate arc remains at zero while accessibility
exposes the actual value. This change preserves the existing component API and
all uncommitted localization, catalog, realtime, and account work.

Checks run:

- `pnpm --filter @peridot/ui test` (13 passing)
- Focused Prettier and ESLint checks for the component and its test
- `pnpm typecheck`
- `pnpm build` (passed with the existing non-fatal Rolldown
  `PLUGIN_TIMINGS` warning)
- `git diff --check`

Known limits: browser visual QA was not run; the continuous task-progress
indicator should receive a final live visual check. All changes remain
uncommitted on `dev`; no commit, push, tag, publication, or deployment was
performed. Next: verify the topbar task ring while live progress values update
with normal and reduced-motion preferences.

## en-US localization across the runtime

Added Nuxt I18n with a fixed `en-US` runtime locale, unprefixed routes, disabled
browser locale detection, explicit `<html lang="en-US">`, and no language
selector or persisted preference. All web runtime copy, metadata, page titles,
loading/empty/error states, notifications, and accessibility labels now resolve
through `apps/web/i18n/locales/en-US.json`. Dates use named Vue I18n formats,
and plural counts use locale resources.

API errors, task titles/details/failures, provider definitions, provider details,
and realtime errors now return structured `MessageDescriptor` values. The
pre-release contracts no longer include duplicate English fallback properties.
Task title and failure descriptors are stored in nullable task columns; old
development task shapes are intentionally unsupported and require a local
database update or reset. Shared UI spinners and progress indicators now require
caller-supplied accessible labels instead of embedding English defaults.

Behavioral coverage verifies the fixed locale/configuration, interpolation,
plurals, all referenced message keys, date formats, task descriptor responses,
typed client errors, toast descriptors, and updated UI accessibility labels.

Checks run: `pnpm --filter @peridot/web test` (133 passing),
`pnpm --filter @peridot/server test` (88 passing),
`pnpm --filter @peridot/ui test` (13 passing),
`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm typecheck`, `pnpm test`,
`pnpm db:validate`, `pnpm build`, and `git diff --check`. The built web server
smoke-tested `/onboarding` with HTTP 200, `lang="en-US"`, localized page copy,
and no locale-prefixed links; `/` continued redirecting to
`/onboarding?redirect=/`. Development browser visual QA was not run.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed. Next: visually review en-US typography and wrapping
across desktop/mobile layouts, then add another locale resource when translation
content is available.

## Administrator user management

Administrators now have a `User Management` category under Settings → Admin.
The page lists local accounts with role and current-user indicators, supports
member or administrator creation, edits display name, email, password, and role,
and deletes accounts after confirmation. Each row shows the account's Gravatar
with the brand-logo fallback used by the topbar. The current account can edit
its own identity but cannot change its role or delete itself. New account
passwords and password resets require matching confirmation before the form can
submit.

The server exposes authenticated administrator-only `GET/POST /api/admin/users`
and `PUT/DELETE /api/admin/users/:id`. It validates unique normalized email and
display names, hashes new passwords, prevents removal of the final
administrator, revokes affected sessions and realtime connections on
authentication or role changes, and relies on the existing account relations to
remove user-owned state on deletion.

Behavioral coverage verifies administrator-only access, member and administrator
creation, identity and password edits, role promotion, session revocation, old
credential rejection, deletion, self-deletion prevention, and self-role
immutability. Verification passed: 88 server tests, 128 web tests, 13 shared UI
tests, full lint/format checks, full typecheck, Prisma schema validation, the
production build, and `git diff --check`. Browser visual QA was not run.

All changes remain uncommitted on `dev` alongside the pre-existing catalog and
realtime work. No commit, push, tag, publication, or deployment was performed.
Next: open Settings → Admin → User Management as an administrator and verify
member/administrator creation, edit/delete dialogs, and self-action restrictions
at desktop and mobile widths.

## Settings account tab renamed to Profile

The common Settings navigation now labels `/settings/account` as `Profile`. The
page heading and header-avatar accessible label use the same term, while the
existing route and profile API remain unchanged for bookmark and redirect
compatibility. Regression assertions require the visible Profile label and
reject the former Account navigation label.

Verification passed: the focused Settings tests (12 passing), all 124 web tests,
web typecheck, targeted ESLint, full formatting, the production web build, and
`git diff --check`. Server, schema, and browser visual checks were skipped
because this change only affects labels and existing client navigation.

## Email-only identity, editable display names, and password confirmation

Authentication now uses email as the sole login identifier. User records store
a required display name plus a normalized display-name value that enforces
case-insensitive uniqueness. Display names preserve capitalization, trim and
collapse whitespace, and must contain 2–80 Unicode code points. Existing users
sign in with normalized email and password, and signed-in users can update their
display name from Account settings while email remains read-only.

First-administrator creation now asks for the password twice. The form reports
an inline mismatch, blocks submission until both entries match, and sends only
the single confirmed password to the server. Sign-in continues to show only
email and password.

The new account contract changed the local SQLite schema. The authorized
development database was reset and recreated; all previous local accounts,
sessions, catalog data, queues, likes, sources, and settings were discarded. The
development server was restarted after the reset and now requires creation of a
new first administrator.

Behavioral coverage includes email-only sign-in, rejected display-name
authentication, email normalization, display-name boundaries and uniqueness,
profile edits, session continuity, administrator request shapes, Account
cookie updates, and password-confirmation visibility and mismatch blocking.
Verification passed: 86 server tests, 124 web tests, 13 shared UI tests, full
typecheck, lint, formatting, Prisma schema validation, the production build, and
`git diff --check`. Browser visual QA was attempted but Computer Use stopped
because it could not determine the active browser URL confidently enough to
continue safely.

All changes remain uncommitted on `dev` alongside the pre-existing catalog and
realtime work. No commit, push, tag, publication, or deployment was performed.
Next: open the onboarding flow with the empty database, create the first
administrator using matching passwords, sign out, verify email-only sign-in, and
edit the display name from Account settings.

## Plugins navigation moved under Admin

The Settings sidebar now places Plugins inside the administrator-only `Admin`
group, immediately before Tasks. Account, Library, and Playback remain the
common categories, so non-administrators no longer see a Plugins menu entry.
The `/settings/plugins` route and its page content are unchanged.

Regression assertions now require Plugins in the administrator category list,
exclude it from the common list, and keep its page on the Settings layout.
Verification passed: the focused settings tests (11 passing), all 121 web
tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server, API, storage, or schema contract changed. Browser visual QA
was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
verify in the browser that administrator sessions show Plugins inside Admin and
member sessions do not show the menu entry.

## Settings sidebar logout

The Settings sidebar now has a persistent Log out button at its bottom, outside
the scrollable category list. Activating it opens a confirmation dialog before
any credentials are changed. Confirming revokes the current session when
possible, clears the local session and user cookies, retains the selected
server, and opens onboarding in sign-in mode with the current Settings path
preserved as the return destination. The button shows a disabled `Logging out…`
state while the request is pending.

This remains separate from the administrator Server page's Disconnect action,
which also clears the selected server. Regression assertions cover the
confirmation gate, session revocation, local credential clearing, server-address
preservation, sign-in redirect parameters, and the fixed footer control.

Verification passed: focused settings/task/styling tests (19 passing), all 121
web tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server, API, storage, or schema contract changed. Browser visual QA
was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Administrator settings grouped under Server

The Settings sidebar now keeps Account, Library, Playback, and Plugins in the
common list and presents Tasks, Sources, Metadata, and Server in a separately
divided `Admin` group visible only to administrators. The former Administration
category is removed; its connected-server and server-log content now lives at
`/settings/server`. `/settings` redirects to Account so the shared settings entry
works for every signed-in role.

The topbar task spinner is now administrator-only, including in the fullscreen
Settings header. Non-administrators still receive the separate connection-loss
warning because it communicates server reachability rather than task activity.
Direct access to `/settings/tasks` now renders an access-required state and skips
task history/loading requests for non-administrators.

Regression assertions cover the admin-only group condition, Tasks placement,
separation styling, new route, removed Administration category, `/settings`
redirect, task-page access state, and task-spinner role gate. The existing server
settings access message and API authorization remain in place.

Verification passed: focused settings/task/realtime/notification/styling tests (25
passing), all 120 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server, API, storage, or schema contract
changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
verify at desktop and mobile widths that an administrator sees the separated
Admin group and a non-administrator sees only the common categories.

## Sortable grip cursors

Library sources, metadata providers, and upcoming queue items now show the
`grab` cursor over their grip controls and switch to `grabbing` while the grip
is pressed. This keeps the drag affordance visible when the pointer is directly
over the handle instead of only on the surrounding sortable row. The change uses
standard Tailwind cursor utilities and does not alter which part of each row is
draggable.

Regression assertions cover the grip cursor classes on all three sortable
surfaces. Verification passed: the focused settings and queue tests (12
passing), all 120 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. The build reported the existing
non-fatal Rolldown `PLUGIN_TIMINGS` warning. Server tests, schema validation, and
browser visual QA were skipped because no server, API, storage, or schema
contract changed.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm the cursor changes while hovering and dragging each grip at desktop and
mobile widths.

## Avatar reveals settings affordance

The topbar account avatar now shows a Basil settings cog when its link is
hovered or receives keyboard focus. The cog is an overlay on the existing avatar
link at `/settings/account`, so the header still has one settings destination
and the task-progress/connection indicator remains immediately before it. The
overlay uses semantic theme utilities, respects reduced-motion preferences, and
disappears while preserving the avatar when the link is not active.

The header regression now requires the cog and both hover/focus reveal states.
Verification passed: all 120 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. The build
reported the existing non-fatal Rolldown `PLUGIN_TIMINGS` warning. Server tests
and schema validation were skipped because no server, API, or storage contract
changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm the avatar-to-cog transition on pointer hover and keyboard focus at
desktop and mobile widths.

## Setup and session loss redirect to onboarding

Authenticated browser requests now treat both `401 unauthorized` and
`428 setup_required` as navigation conditions instead of page errors. A `401`
clears the stale session and user cookies and opens
`/onboarding?auth=login`, while `428 setup_required` opens
`/onboarding?auth=setup` with the original destination preserved. The setup
route automatically reconnects to the existing server address and advances to
the first-administrator account form, so “Create the first administrator
account before using Peridot” is not rendered as an alert.

Catalog, likes, quick-pick, player, album/artist, folder-search, metadata
context-menu, and administrator views suppress the typed redirect error from
their local alerts and toasts while navigation is pending. Invalid credentials
submitted on the existing sign-in form remain an inline error because that
request is not part of the authenticated-session redirect path.

Verification passed: the focused client and onboarding tests (15 passing), all
120 web tests, web typecheck, targeted ESLint and Prettier checks, the production
web build, and `git diff --check`. Server tests and schema validation were
skipped because no server, API, or storage contract changed. Browser visual QA
was not run. Next: start with an empty server or revoke an active session, then
confirm onboarding opens without an authentication alert, creates the first
administrator (or signs in), and returns to the original page.

Changes remain uncommitted on `dev` alongside the pre-existing catalog/realtime
work; no commit, push, tag, publication, or deployment was performed.

## Realtime events and paged catalog

The task and administration-log polls are replaced by one authenticated
`/api/realtime` WebSocket. `POST /api/realtime/ticket` issues a 30-second,
single-use ticket bound to the current session because browser sockets cannot
send the normal bearer header. Upgrades require an exact configured web origin.
Subscriptions cover task lifecycle, admin-only logs, and compact catalog
revision events. The hub keeps the latest 512 events for reconnects and sends
`resync.required` after a gap or slow-client overflow. Session revocation closes
matching sockets.

Task events carry complete safe `TaskResponse` values; progress is coalesced to
at most four updates per second and status transitions are immediate. Catalog
events contain only revision, source, reason, and changed count, with no track
rows. The web client uses bounded reconnect backoff, updates task state with
monotonic `updatedAt` ordering, subscribes administrator pages to logs on demand,
and falls back to HTTP task/catalog snapshots after resync.

Catalog APIs now use cursor pages instead of returning the complete collection.
`GET /api/tracks`, `/api/albums`, and `/api/artists` support bounded pages,
search/sort/filter options, and catalog revisions. `POST /api/tracks/resolve`
hydrates queue IDs in bounded batches, and quick picks now contain server-resolved
track or album summaries. The server maintains normalized track, album, artist,
membership, and search projections, updates them during scans and metadata
changes, and backfills existing databases idempotently. The shared track table
uses VueUse `useVirtualList` with an explicit load-more fallback; library,
album, artist, liked, search, quick-pick, and player queue views no longer rely
on a full-catalog `useLibraryTracks` cache.

The authorized development database reset was applied with `pnpm db:reset`.
Local accounts, sessions, catalog, queue, likes, sources, and settings were
discarded and the new contract/projection tables were created.

Verification passed:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test` — 85 server tests, 120 web tests, and 13 shared UI tests passed
- `pnpm db:validate`
- `pnpm build`
- `git diff --check`

The build emitted non-fatal Rolldown `PLUGIN_TIMINGS` performance warnings, and
Prisma emitted its existing outdated-agent-skills notice. Browser visual QA was
not run. Known limits are the intentional single-process/in-memory realtime
replay model, no durable event outbox, no live queue/like synchronization, and
no plugin-originated socket events. All changes remain uncommitted on `dev`;
no commit, push, tag, publication, or deployment was performed.

Next: start `pnpm dev`, recreate the local administrator after the reset, add a
music source, and verify desktop/mobile virtual scrolling, live task progress,
admin log streaming, reconnect/resync, and catalog refresh during and after a
large scan.

## Missing-cover player background fade

Selecting a track without cover art now fades the previous decorative player
background out over the existing three-second crossfade instead of removing it
abruptly. The decorative layer remains mounted while its child image is
conditional, allowing Vue's leave transition to run when the resolved cover URL
becomes empty. Foreground artwork still switches immediately to the semantic
music-note placeholder.

The player regression test now covers the mounted decorative layer and the
conditional image. The existing styling constraints are unchanged: the fix uses
only standard Tailwind utilities and semantic theme tokens.

Verification passed: all 117 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. Server tests,
schema validation, and browser visual QA were skipped because no server,
storage, or schema contract changed and the transition behavior is covered by
the player regression test.

## Lost authentication redirects to sign-in

Authenticated web API requests now report `401 unauthorized` responses through
one client-level handler. The handler clears the stale session and user cookies,
opens the existing onboarding account step directly with `auth=login`, and
preserves the current full path for the post-sign-in redirect. Concurrent
requests cannot begin multiple redirects, and incorrect credentials entered on
the sign-in form remain an inline error rather than a lost-session redirect.

Verification passed: the focused authentication/client and onboarding tests
(14 passing), all 117 web tests, web typecheck, targeted ESLint and Prettier
checks, the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server, API, or storage contract changed.
Browser visual QA was not run. Next: revoke or expire an active session in a
running app and confirm the account sign-in step opens without a server-selection
flash, then sign in and return to the original page.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed.

## Successful download toast removed

Completing a track download no longer adds a bottom-right success toast. The
browser download remains the confirmation, while failure and missing-connection
messages still use the app-level toast region to explain why no file was saved.
The successful-download toast helper and its call site are removed.

Verification passed: the focused player test, the full web test suite, web
typecheck, targeted ESLint and Prettier checks, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server, API, or storage contract changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
confirm in a browser that a successful download produces no toast while a
failed request still explains the failure.

## Current cover background in the player

The fixed player now reuses the active track's resolved cover as a decorative
background clone. The clone covers the left two-thirds of the player on narrow
screens and the left half from the medium breakpoint, remains anchored to the
left edge, and uses a strong `blur-3xl` treatment with a scale-up to avoid
visible blur edges. A second layer-local card-token gradient fades its right
edge into the normal surface before the rest of the player begins, while a
broader card gradient preserves semantic contrast for track details and
transport controls.

The decorative cover clone waits 150 ms and then directly crossfades over three
seconds when its resolved URL changes. Both covers use the same ease-in-out
curve so their opacity remains balanced as outgoing and incoming blurred
artwork overlap. Tracks that share the same cover do not animate because the
image key does not change. The displayed title, artist, and controls update
immediately. Reduced-motion preferences disable the transition.

The player no longer renders a preparing-audio label while a new track starts.
The active track's artist list is shown immediately as soon as track metadata is
available. Playback failures still replace that secondary line with the existing
retryable error message.

The player's foreground artwork is larger at every responsive size: 64 px on
compact layouts and 80 px from the medium breakpoint. Its music-note fallback
uses a matching larger glyph while keeping the existing rounded artwork frame.

The layer is hidden from assistive technology, ignores pointer input, and uses
the same missing-or-failed-cover condition as the foreground artwork, so no
broken image is shown. No custom CSS, inline styles, hardcoded colors, or
arbitrary Tailwind values were introduced.

Changes remain uncommitted on `dev`; no commit, push, tag, publication, or
deployment was performed. Verification passed: the focused player and styling
tests, all 116 web tests, web typecheck, targeted ESLint and Prettier checks,
the production web build, and `git diff --check`. The build reported non-fatal
Rolldown `PLUGIN_TIMINGS` performance warnings. Server tests and schema
validation were skipped because no server or storage code changed. Browser
visual QA was not run.

## Track lists show cover artwork with embedded playback

The shared track table now shows each track's cover artwork beside its title,
so the library, album detail, artist detail, liked songs, and search track
lists use the same presentation. The queue also shows artwork in its
now-playing card and every upcoming row. A reusable `TrackArtwork` component
resolves the server-relative cover URL and falls back to the semantic music-note
placeholder when artwork is missing or fails to load.

Playback controls now cover the full artwork like the Quick pick list: they
reveal on hover or keyboard focus with a 70% semantic background behind a
readable play icon. The shared table toggles the current track or starts the
selected list item, the now-playing queue cover toggles playback, and every
upcoming queue cover starts that track directly. The queue remove action is one
standard button size larger while retaining its close icon and existing
behavior.

Verification passed: all 116 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. The build
reported non-fatal Rolldown `PLUGIN_TIMINGS` performance warnings. Server tests
and schema validation were skipped because no server or storage code changed.
Browser visual and pointer QA was not run, so hover/focus reveal behavior,
embedded controls on touch layouts, and queue remove spacing still need review
at desktop and mobile widths.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm artwork and embedded controls across library, album, artist,
liked, search, and queue lists with both present and missing cover images.

## Album release year beside total duration

Album detail headers now show an available release year immediately before the
total duration, for example `1999 · 1:01:01`. The year is derived from an
explicit four-digit `year` entry in a track's provider metadata. Albums with no
year keep the existing track count and duration summary, and albums whose
matched tracks expose conflicting years omit the year rather than choosing an
edition arbitrarily.

Added behavioral coverage for matching, unanimous, conflicting, and invalid
provider years plus an album-page regression for the adjacent summary. Verified
the focused album/library tests (27 passing), all 115 web tests, web typecheck,
full-workspace lint and formatting, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server, API, or storage contract changed. Browser visual QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm the year/duration summary with a catalog containing a Discogs
year and at narrow widths.

## Playback continues after leaving Settings

Returning from the fullscreen Settings layout no longer pauses the active song.
The default layout had called `loadQueue()` whenever it remounted; leaving
Settings therefore created a fresh composable call site that restored the
browser snapshot, set `playing` to false, and paused the application-root audio
element. Queue initialization now stays with the application-root audio owner,
while layouts only observe and control the shared player state.

The regression test now rejects layout-level `loadQueue()` calls. Runtime
verification with a mocked audio element reproduced the original pause on the
return navigation and then confirmed the active element remained playing after
the fix. The headless-browser run used mocked API responses and a deterministic
audio element so it could assert play, pause, source removal, and control state
without depending on a local audio file.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, the web production build, and `git diff --check`. Server tests
and schema validation were skipped because no server or storage code changed.
Browser sound output was not exercised; the runtime check covered the player
lifecycle and navigation transitions. Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: confirm the same round trip
once with normal browser playback and real catalog audio.

## Album playback starts from the first track

Album card, album detail, and album quick-pick controls now start the complete
album from its first ordered track whenever their visible play state is
activated. If the album is already playing, the control remains a pause action.
The previous behavior could resume a paused middle track when an album was
already considered active.

Accessible labels now state that album playback starts from the first track.
Context-menu album playback retains its existing direct full-collection start.

Verification passed: the focused album and quick-pick tests, all 114 web tests,
web typecheck, targeted ESLint and Prettier checks, full-workspace `pnpm check`,
the production web build, and `git diff --check`. Server tests and schema
validation were skipped because no server or storage code changed. Browser
visual and audio interaction QA was not run.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
visually confirm that playing a paused album restarts on track one in the card,
detail header, and quick-pick controls, while the pause state still pauses.

## Connection-loss toast removed

The app-level server health monitor no longer creates or manages a connection
toast. Losing the configured server now changes only the shared connection state,
so the existing pulsing cloud-off warning and accessible reconnect explanation
remain in the topbar without a duplicate bottom-right notification. The
connection-specific toast ID, helpers, and unused description formatter were
removed. Other user-action toasts are unchanged.

Verification passed: all 114 web tests, the focused notification regression,
web typecheck, targeted ESLint and Prettier checks, the production web build,
and `git diff --check`. Server tests and schema validation were skipped because
no server or storage code changed. Live visual QA was not run; the remaining
check is to stop the server with the signed-in app open and confirm that the
topbar warning appears without a toast, then restart it and confirm the warning
clears.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Main-header settings shortcut removed

The redundant icon-only Settings link is removed from the main header. The
account avatar remains directly before where it was and opens
`/settings/account`, which provides access to the full Settings navigation. The
topbar regression now requires the avatar to be the sole settings destination
while retaining task progress immediately before it.

The decision log records this removal as superseding the earlier
settings-beside-avatar choice. Changes remain uncommitted on `dev` alongside the
pre-existing working-tree edits; no commit, push, tag, publication, or
deployment was performed.

Verification passed: the focused settings regression suite (10 tests), all 114
web tests, web typecheck, targeted ESLint and Prettier checks, the production web
build, and `git diff --check`. Server tests and schema validation were skipped
because no server or storage code changed. Browser visual QA was not run.
Next: confirm the simplified header at desktop and mobile widths.

## ProgressCircle rotation for determinate values

The shared `ProgressCircle` now keeps its reduced-motion-safe rotation when a
numeric value is present. The numeric value still controls the determinate arc,
visible percentage, and accessible `aria-valuenow`/`aria-valuetext`; indeterminate
values retain their existing rotating arc. The shared UI regression suite now
asserts that determinate progress includes `motion-safe:animate-spin`.

Verification passed: all 13 shared UI tests, workspace typecheck, targeted
ESLint and Prettier checks, the production workspace build, and
`git diff --check`. Server tests and schema validation were skipped because
only the shared progress component, its test, and documentation changed.
Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm the rotating
determinate ring in the topbar and Tasks settings view with active work.

## Topbar connection-loss indicator

The topbar now replaces the task progress circle with a pulsing
destructive-color Basil cloud-off icon whenever the existing server health
monitor reports that the configured server is unreachable. Connection loss
takes precedence over queued or running task state so stale task progress does
not imply a live server. The icon has a focusable accessible label and a
tooltip explaining that Peridot will reconnect automatically. A later successful
health probe removes the icon and restores the task circle if work is active.

The health monitor's status and the topbar indicator now share one app-level
Nuxt state value, avoiding a second polling loop. The pulse uses the standard
`motion-safe:animate-pulse` utility; no custom CSS or new API contract was
introduced.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, full-workspace `pnpm check`, the production web build, and
`git diff --check`. Server tests and schema validation were skipped because no
server or storage code changed.
Live visual and keyboard QA was not run. Changes remain uncommitted on `dev`
alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed. Next: visually confirm the pulse,
tooltip, and placement at desktop and mobile widths while the server is stopped,
then confirm the task circle returns after restart.

## Topbar task progress queue indicator

The main topbar now shows a task-aware progress circle while any task is running
or queued, replacing the static metadata-only placeholder. Its fill is the
equal-weighted average of the active queue: a running determinate task
contributes its completion percentage, each queued task contributes zero, a
zero-total running task counts as complete, and an indeterminate running task
makes the overall ring indeterminate. Queued-only work also renders the ring as
indeterminate instead of an empty zero-percent circle. The indicator is absent
whenever no active work exists.

Hovering or focusing the circle opens a Reka UI tooltip containing the running
task followed by queued tasks in FIFO creation order. Each row shows its title,
status, and available percentage or completed/total detail. The row list has a
bounded scrolling height for larger queues. The existing global task monitor
continues to provide 500 ms active polling; no API, storage, or schema changes
were introduced.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, full-workspace `pnpm check`, the production workspace build,
and `git diff --check`. Server tests and schema validation were skipped because
no server or storage code changed. Live pointer and keyboard visual QA was not
completed because Computer Use could not verify the existing Brave window URL
and stopped before interaction. The hover/focus presentation, long-list
scrolling, and desktop/mobile placement still need visual review.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed. Next:
review the real task tooltip with an authenticated active queue and confirm its
desktop/mobile layout and keyboard focus treatment.

## Tasks settings and silent task monitoring

The task progress indicator now remains visible in the fullscreen Settings
header and links to `/settings/tasks`. The new Tasks settings view is available
to every signed-in user and separates running/queued work from terminal history.
Active rows use the shared task state and live progress. History is loaded from
`GET /api/tasks?status=terminal` in pages of 50 with a Load older tasks control,
and refreshes when an observed task transitions from active to terminal.

Task-specific progress, completion, and failure toasts were removed, along with
their formatter, manager hooks, and progress-toast rendering. Task polling still
runs every 500 ms while active and every five seconds while idle, remains silent
across transient failures, and still reloads the catalog after library or
metadata transitions. The Metadata refresh button is disabled and labeled
`Processing…` whenever any task is queued or running.

Verification passed: all 114 web tests, web typecheck, targeted ESLint and
Prettier checks, the production web build, and `git diff --check`. Server tests
and schema validation were skipped because no server or storage code changed.
Live pointer and keyboard visual QA remains pending because Computer Use could
not verify the existing browser URL. The Tasks layout, long history pagination,
click-to-navigate behavior, and shared Settings-header indicator still need
visual review.

Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Queued task activity foundation

Replaced the combined `LibraryScan` record with a persistent task queue. Source
scans and metadata fetches are separate linked tasks with queued, running,
completed, failed, or interrupted states and determinate or indeterminate
progress. One FIFO worker executes tasks sequentially, accepts new work while
another task is active, and coalesces equivalent requests only while they are
still queued. Queued work resumes after restart; tasks that were running become
interrupted.

Authenticated clients can list active-first task history through
`GET /api/tasks` and read one task through `GET /api/tasks/:id`. Responses use
bounded safe source names and labeled details without source paths, credentials,
or arbitrary plugin payloads. Core kinds are `library_scan` and `metadata_fetch`;
the contract also validates future `plugin:<plugin-id>:<job-name>` kinds without
adding a plugin execution runtime. Terminal history is retained for 30 days,
capped at the newest 500 tasks.

The web client now polls the shared task list every 500 ms while work is active
and every five seconds while idle. Task progress and history are shown in the
topbar and Tasks settings view rather than toast notifications. The catalog
refreshes after library or metadata work. Sources can enqueue work while another
task is active, while Metadata refresh and Reset are blocked until active work
finishes. WebSocket transport remains deferred.

Verification passed: all 78 server tests, all 107 web tests, all 13 shared UI
tests, workspace typecheck, ESLint, Prisma contract emission and
`pnpm db:validate`, the production workspace build, `git diff --check`, and a
built-server health smoke test on loopback port 43101. The local database was
synchronized to storage hash
`ef2695cd1e8e734e1b52913f67e3ec61a956f8be5dcf97751c89b07220e31beb`;
the obsolete `LibraryScan` table and its scan history were dropped, while catalog,
account, source, queue, like, and provider tables were preserved.

Known limits: task execution is serialized within one server process; the task
queue does not provide cancellation, retry controls, or cross-process locking.
Browser visual QA was not run. Changes remain
uncommitted on `dev` alongside the pre-existing working-tree edits; no commit,
push, tag, publication, or deployment was performed. Next: use the task
progress/details contract for task-level controls.

## Sidebar quick pick uses decayed play history

The sidebar block below primary navigation is now an up-to-eight-item,
single-column `Quick pick` list. It mixes tracks and albums using
server-persisted, per-user playback events with continuous seven-day exponential
decay. Album scores aggregate the decayed scores of their available tracks.
Tracks use their album artwork, and each complete row is the play/pause control,
including its title and artist names, with a pointer cursor over the full
target. A small music or collection icon before the title identifies track versus
album. The visible order is frozen while the pointer or keyboard focus is inside
the list, then applies the latest order after all interactions end.

Successful browser audio starts create `POST /api/tracks/:id/plays` events.
Pause/resume, seeking, failed playback, restored paused sessions, and retries in
the same run do not double-count. `GET /api/quick-picks` returns up to eight ordered
track and album identities without exposing scores. The player refreshes the
ranking after each confirmed event. The former All music and Liked songs rows are
removed; both remain in primary navigation. Playlist quick picks remain deferred
until playlist records and playback exist.

Verification for the current eight-item, single-column, full-row interaction
passed: all 78 server tests, all 114 web tests, workspace typecheck, targeted
ESLint and Prettier, the production workspace build, and `git diff --check`.
The web coverage includes overlapping pointer and focus interactions retaining
the visible order until both end. Schema validation was skipped because no
database schema changed. Browser visual and pointer QA was not run, so the final
hover/focus treatment and single-column spacing still need review at desktop and
mobile widths. Playlist quick-pick entries remain unimplemented with playlists.
Changes remain uncommitted on `dev` alongside the pre-existing working-tree
edits; no commit, push, tag, publication, or deployment was performed.

## Shared ProgressCircle component

Added `ProgressCircle` under `@peridot/ui/components/ui/progress-circle`. A
finite `value` renders determinate progress, clamps out-of-range numbers to
`0–100`, and exposes accessible progressbar semantics. Omitted, null, or
non-finite values render a rotating quarter-arc spinner with reduced-motion
support. The component provides small through extra-large sizes, primary,
secondary, success, warning, and destructive semantic colors, opt-in percentage
text, and custom center content. Its numeric stroke width is configurable and
defaults to 6.

The package exports the component, `progressCircleVariants`, and its variant
type. Nuxt pre-bundles the new package path, the no-custom-styling guard covers
the component, and README plus the decision log document the value-driven API.
The topbar metadata badge now uses the indeterminate variant in place of
`PeridotSpinner`; other loading surfaces keep the branded spinner.

Verification passed: all 12 shared UI tests, all 104 web tests, all 67 server
tests, workspace typecheck, ESLint, targeted Prettier for all changed component
files, the production build, and `git diff --check`. The full `pnpm check`
Prettier phase still reports the pre-existing unrelated formatting issue in
`apps/web/app/layouts/default.vue`; that file was intentionally left untouched.
The shared UI package has no workspace typecheck task, so it was also checked
directly with `vue-tsc`: the new component is clean, while the existing
`PeridotSpinner` still lacks TypeScript declarations for its bundled SVG imports.
Browser visual QA was not run for the new topbar integration. Changes remain
uncommitted on `dev` alongside the existing
working-tree edits; no commit, push, tag, publication, or deployment was
performed. Next: visually verify the compact indeterminate badge and use the
determinate form in a screen with real numeric progress.

## Shared spinner renamed to PeridotSpinner

The shared branded loading component is now named and exported as
`PeridotSpinner` from the existing `@peridot/ui/components/ui/spinner` package
path. Its component file is `PeridotSpinner.vue`, and its data slot is
`peridot-spinner`. Every app loading surface, the onboarding discovery status,
toast progress, and the header metadata-status badge use the new name.

The same package also exports the classic shadcn-vue `Spinner`, built on
`@lucide/vue`'s `LoaderIcon` with the standard `size-4 animate-spin` treatment.
It has shared UI coverage but is intentionally unused in app pages and layouts
for now.

The main app header shows a compact `Fetching metadata` badge containing
`PeridotSpinner` before the icon-only Settings link and avatar. The sidebar footer
no longer links to Settings. The shared component and app regressions verify the
new name, data slot, header ordering, accessible labels, and player behavior.

Verification passed: all 7 shared UI tests, all 104 web tests, web typecheck,
targeted ESLint and Prettier, the production web build, and
`git diff --check`. Changes remain uncommitted on `dev` alongside the
pre-existing working-tree edits; no commit, push, tag, publication, or deployment
was performed.

## New local sources scan and metadata-match automatically

Adding a local folder source now creates the source and immediately queues a
source-scoped scan on the server. The source-creation response includes the scan,
and the Sources page adopts it into the shared scan tracker so progress and
completion notifications continue normally. Remote URL and integration sources
remain stored without scans until those source kinds become indexable.

Source scans already continue into metadata matching after file discovery and
catalog reconciliation. A new server regression now verifies that automatically
added source scans complete both phases, including one processed metadata
track. If another library operation is active, source creation succeeds
without a queued scan and the page instructs the administrator to rescan later.

Verification passed: all 67 server tests, all 104 web tests, workspace
typecheck, `pnpm check`, `pnpm db:validate`, the production build, and
`git diff --check`. The Prisma CLI again reported that its optional agent skills
are out of date; validation itself passed. Browser interaction QA was not run
because the new behavior is covered by the server integration regression and no
new UI presentation was introduced. Changes remain uncommitted on `dev`
alongside the existing working-tree edits; no commit, push, tag, publication, or
deployment was performed.

## Source action menu items use a pointer cursor

The Sources row action menu keeps its existing text-row presentation. Rescan and
Remove now use a pointer cursor where they are actionable, while disabled menu
items retain the default cursor and reduced opacity.

The source-page regression test checks the pointer-cursor treatment on both
actions. All 104 web tests, `pnpm check`, web typecheck, the production web
build, and `git diff --check` pass; the built CSS includes the disabled-state
cursor override. Schema/server checks and browser visual QA were skipped because
this change only affects web menu presentation. Changes remain uncommitted on
`dev` alongside the pre-existing working-tree edits; no commit, push, tag,
publication, or deployment was performed.

## Track lists lazily reveal rows with page scrolling

The shared track table no longer mounts every sorted row at once or renders
inside a virtualized, maximum-height scroll frame. It initially renders 60 rows
in normal page flow, appends 60 more as a sentinel approaches the viewport, and
keeps a visible Load more tracks button for keyboard and constrained clients.
The main content region remains the only vertical scroll owner for library,
album, artist, liked-song, and search track lists.

The complete sorted list remains available to queue construction, so playing a
mounted row still queues every track in that table. Direct title-hash navigation
uses the progressive reveal state to mount the target row before scrolling it
into view. Table accessibility structure, sorting, collection playback, artist
links, album links, likes, and fixed player behavior remain intact.

Verification passed: all 104 web tests, web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check`. Schema/server checks
and browser interaction QA were skipped because this is a web presentation and
scroll-container change. Changes remain uncommitted on `dev` alongside the
existing working-tree edits. No commit, push, tag, publication, or deployment
was performed. Next: visually verify automatic batch revelation, the Load more
fallback, and deep-link scrolling at desktop and mobile widths.

## Linked local metadata and interactive now-playing control

The shared track row now always renders linked artist credits beneath the track
title, including album and artist detail lists and narrow viewports. Visible
album names link to their album details in every applicable table variant, so
artist-page track lists no longer show plain album text. The redundant desktop
Artist column was removed.

Fixed-player and queue artist credits use the same `trackArtistNames` fallback
and therefore link even when only the legacy artist credit string is populated.
The now-playing play/pause icon is a shared Button that toggles the active track.
External metadata candidates intentionally remain plain provider results.

`pnpm --filter @peridot/web test` passes all 103 tests. Web typecheck,
`pnpm check`, the web production build, and `git diff --check` pass. Server,
schema, and browser interaction checks were skipped because this change is
limited to web presentation and existing playback actions. The changes remain
uncommitted on `dev` alongside the pre-existing working-tree changes; no commit,
push, tag, publication, or deployment was performed. Next: visually verify
linked metadata and the now-playing toggle at desktop and mobile widths.

## Track-list playback queues the whole list

Playing a shared track-table row now queues every track currently displayed in
that table instead of reducing the queue to the selected track. The selected
track starts first, followed by the rows below it and then the rows above it.
This covers the library, liked songs, search results, album detail tracks, and
artist detail tracks, including row controls, double-click, and context-menu
Play.

Queue construction uses a pure rotation helper so duplicate or unavailable
entries are normalized before the selected track is placed first. Album and
artist collection buttons retain their existing full-collection behavior.

Focused album, artist, context-menu, search, and queue tests pass (17 of 17).
Web typecheck, targeted ESLint, Prettier, and the production web build pass. The
full web suite passes 100 of 101 tests; the only failure is the previously
documented sidebar assertion expecting the `logo` variable while the checked-in
layout uses `logoNop`. Schema/server checks and browser interaction QA were
skipped because this change is limited to web queue behavior and shared track
presentation. The queue rotation intentionally places preceding rows after the
following rows so forward playback starts with the next visible track.

The listed changes remain uncommitted on `dev`, alongside pre-existing web,
test, and documentation changes. No commit, push, tag, publication, or
deployment was performed. Next: interactively verify row playback from a sorted
library list and an artist track list, then resolve the known sidebar logo
assertion.

## Unlinked player title selection

The fixed player's non-link title fallback now uses `select-none`, so titles
without an album destination cannot be text-selected. Titles that link to an
album keep their existing selectable link behavior.

Added a focused shared-player regression assertion for the fallback class.

Focused player coverage, web typecheck, targeted ESLint, Prettier, the production
web build, and `git diff --check` pass. The full web suite passes 95 of 96 tests;
the only failure is the previously documented sidebar assertion expecting the
`logo` variable while the checked-in layout uses `logoNop`. Schema/server checks
and browser visual QA were skipped because this only changes player title
selection behavior.

## Library source controls

The Sources settings list now identifies source categories with larger bundled
Basil icons instead of textual `path`/`url` badges: folder for local files,
globe for remote URLs, and apps for integrations. The icon keeps an accessible
category label and also exposes that label through its native hover title. Local
source rows show the folder name first and the complete path beneath it as a
muted subtitle. The Add source selection dialog shows the same folder, globe,
and integration icons beside its choices.

The Sources header now includes a Rescan all action wired to the existing global
library-scan flow. It scans every configured local path source through one
authenticated library scan and is disabled while source or metadata scan work is
active. Per-source rescan behavior is unchanged.

Targeted source-page and bundled-icon tests, web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check` pass. The full web
suite still passes 95 of 96 tests; the only failure is the previously documented
sidebar assertion expecting the `logo` variable while the checked-in layout uses
`logoNop`. Browser visual QA was not run. The listed changes remain uncommitted
on `dev`; no commit, push, tag, publication, or deployment was performed.

## Player title album navigation

The current track's title in the fixed player now links to that track's album
detail page. The destination includes a stable track-title hash, and the album
page scrolls to that title after its asynchronously loaded catalog rows render.
Tracks without album metadata keep the non-link title treatment because no
album destination exists.

Added route/anchor helper coverage plus layout and album-page regressions for
the player link and deferred hash scrolling.

## Playing track waveform

The shared track table now shows the bundled AT Icons
`waveform` glyph in the primary color immediately after the current
track title. It remains visible while that track is paused. The active-row
background tint was removed, leaving only the existing hover treatment. The
icon remains decorative to assistive technology because the play/pause control
already exposes the playback state.

Added focused icon and album-page regressions for the requested bundled glyph,
the current-track condition, and the removed active-row background.

Verified with a frozen-lockfile install, 26 passing focused album/icon/library
tests, web typecheck, targeted ESLint, Prettier, and the production web build.
The full web suite passes 95 of 96 tests; the only failure is the previously
documented sidebar assertion expecting the `logo` variable while the checked-in
layout uses `logoNop`.

## Unavailable track title opacity

Shared track-table titles now use the existing 60% opacity utility when their
catalog entry is unavailable. Available track titles and all other row content
remain unchanged. Queue entries do not need the treatment because unavailable
tracks are removed from playback queues.

Added a focused regression assertion for the shared title rendering. Existing
unrelated scanner changes and the pre-existing untracked `$null` file were
preserved.

Focused album/library tests (23 passing), web typecheck, targeted ESLint,
Prettier, the production web build, and `git diff --check` pass. The full web
suite passes 94 of 95 tests; the only failure is the previously documented
sidebar assertion expecting the `logo` variable while the checked-in layout uses
`logoNop`.

## SQLite-safe library scanning

Library file processing is now serialized for SQLite. The scanner previously
ran four file workers in parallel, each reading and writing the same local
database. Repeated scans of existing files could therefore fail with
`SqlConnectionError: database is locked`, which the scan record reported as a
misleading configured-root failure.

All per-file work, including existing-file lookup and unchanged-file updates, is
now inside the per-file error guard. A persistent SQLite lock still counts as a
file error instead of aborting the entire scan. If a scan-level database lock is
encountered, the stored failure now identifies database contention rather than
file traversal.

Added a regression that scans four files, then repeats the scan three times and
requires every run to complete with four unchanged tracks and no errors.

## Dedicated search view and quick filters

Search now opens a dedicated `/search` content view from the persistent top-bar
input. Clicking or focusing that input navigates to `/search`, and the same input
owns the query state while the page renders results only. The view uses the
available main content width, keeps the sidebar, header, and fixed player, and
replaces the previous shared query that filtered Home, Library, Albums, Artists,
and detail pages.

With an empty query, search shows up to eight recently opened local albums,
newest first. With a query, it groups local album cards and the shared track
table, then shows the non-functional External sources notice. The `All`,
`Albums`, and `Tracks` toggle tags below the input act as client-side quick
filters over the current results and expose `aria-pressed` state.

Search album cards use a compact variant with tighter padding, smaller artwork
placeholders, smaller titles and like controls, and a dense grid that reaches ten
columns on wide screens.
Album cards elsewhere retain their existing size.

Every shared album card now exposes a small cover play button that appears on
hover, uses a pointer cursor, and starts the album immediately without following
the card link. Focus on other card controls does not keep the button visible;
keyboard focus on the play control itself still reveals it. The album-detail
cover is not a shared album card and remains unchanged.

When a card's album contains the active player track, its cover control mirrors
the main player button: it shows pause while playing, play while paused, shows
the loading spinner while preparing audio, and toggles the existing playback
instead of restarting the album.

The album-detail header button follows the same active-album behavior as a
circular icon-only control. Play, pause, and loading states are conveyed through
the icon or spinner, with a descriptive accessible label.

Track-table active styling now follows the player's current track even while
playback is paused. Play/pause icons and labels still depend on whether that
current track is actually playing. The active row uses a slightly stronger
`bg-primary/10` tint.

Recent albums are stored in browser-local storage under a versioned key scoped
by server and user. Saved identities are normalized and deduplicated, then
reconciled against the current catalog so removed albums do not appear. Album
card navigation emits an open event so likes and other controls do not
incorrectly update the recent list. Existing album context menus, likes, track
playback, and player behavior are unchanged.

Verified: web typecheck, targeted ESLint, Prettier, the production web build,
and all new search tests passed. The full web suite passed 93 of 94 tests; the
only failure is the previously documented stale sidebar assertion expecting the
`logo` variable while the checked-in layout uses `logoNop`. A native browser
visual pass was attempted, but Computer Use stopped because it could not verify
that the local browser URL was allowed.

No server API, schema, credential, provider, or download integration changed.
The external-source section intentionally has no simulated items or actions.
Changes remain uncommitted on `dev`; the pre-existing untracked `$null` file was
preserved. No commit, push, tag, publication, or deployment was performed.

## Like hover scoped to the control

The shared like button now changes its icon color only when the button itself is
hovered or active. Previously its `group-hover` and `group-active` utilities also
matched the album and artist cards' ancestor hover group, so hovering anywhere
on a card colored the heart. All track, collection, header, player, and context
menu uses inherit the corrected shared behavior.

An application-wide scan found the remaining `group-hover` uses only on player
buttons contained in their own button groups and on album/artist placeholder
artwork; neither reproduces the card-to-like-button coupling.

The focused likes UI test (3/3), targeted ESLint and Prettier checks, web
typecheck, and `git diff --check` pass. The full web suite passes 86 of 87 tests;
the only failure is the previously documented sidebar assertion expecting the
`logo` variable while the current layout uses `logoNop`. Existing unrelated
working-tree changes were preserved. No commit, push, tag, publication, or
deployment was performed.

## Full-row sortable targets

Queue tracks, library sources, and configured metadata providers now use their
entire row as the drag target rather than exposing only the grip icon as the
handle. Action buttons, links, and inputs are filtered from drag initiation so
their normal click and keyboard behavior remains available. Unconfigured
metadata providers remain visible but are not sortable. Rows show a grab cursor
and switch to a grabbing cursor while dragging.

Focused queue and settings tests pass except for the previously documented
sidebar logo assertion. Web typecheck, targeted ESLint, formatting checks, and
the production web build pass. Browser interaction QA was unavailable because
Computer Use rejected URL verification. No commit, push, tag, publication, or
deployment was performed.

## Metadata provider list controls

The Metadata settings list now renders every server-provided provider
definition, including providers that have not been configured. The add-provider
button and the separate provider-picker step were removed. Each row uses the
Simple Icons MusicBrainz or Discogs mark, a cog that opens that provider's
configuration dialog, and a state subtitle: `Not configured` in the warning
color, `Active` in the success color, or `Disabled` in the muted color.
Unconfigured titles are dimmed. Enabled providers with missing required fields
or credentials show a destructive warning above the cog with an explanatory
tooltip.

The enabled switch now lives inside the configuration dialog and is saved
together with provider configuration. Discogs credential help links only the
`Discogs account settings` phrase, with an external-link icon, to
`https://www.discogs.com/settings/developers` in a new tab with
`noopener noreferrer`. The shared UI package now provides a Reka-based Switch,
and the web app includes bundled `@iconify-icons/simple-icons` data for offline
rendering.

Verified focused metadata settings, notification, and provider-configuration
tests (17 passing; the only focused failure is the pre-existing sidebar logo
assertion), web typecheck, targeted ESLint, and Prettier. Browser interaction QA
was attempted but Computer Use rejected browser URL verification, so the visual
dialog and tooltip behavior still need an interactive pass. Changes remain
uncommitted on `dev`; no commit, push, tag, publication, or deployment was
performed.

## Extensible Discogs metadata integration

Metadata providers now use a registry of trusted resolver adapters with
declarative configuration fields, credential requirements, provider-specific
automatic-match policies, and canonical source URLs. MusicBrainz remains the
default first provider. Discogs is the second provider, receives only tracks
MusicBrainz leaves unresolved during automatic matching, and uses a token
validated through the Discogs identity endpoint. Manual candidate search merges
results from every enabled provider in configured order.

Track metadata storage now uses provider-neutral external track and release IDs,
a canonical source URL, and bounded labeled details. Discogs preserves release
year, label, catalog number, country, format, and raw track position. Settings
builds provider cards and forms from server definitions and supports editing
configuration, replacing tokens, disabling, re-enabling, and reordering
providers. Provider tokens are encrypted with AES-256-GCM using the required
`PERIDOT_CREDENTIAL_KEY`; they are never returned to the browser or placed in
request URLs.

The approved clean schema break replaced the MusicBrainz-shaped metadata
columns and generated a new Prisma 8 contract. `pnpm db:reset` was applied to
`apps/server/peridot.db`, so the local database is intentionally empty and must
be onboarded and scanned again. Existing local catalog, account, queue, and like
data were removed as expected. The new storage hash is
`2d939d6fb2d0c3a5d74f66440e1baac30c1fdc5277131579abb64ec07eb0029a`.

Checks passed: workspace type check (6 packages), `pnpm check`, Prisma contract
emission and `pnpm db:validate`, all 66 server tests, all 5 shared UI tests,
the production workspace build, and a fresh-database built-server smoke test
returning the expected health payload. The web suite passed 84 of 85 tests. Its
only failure is the previously documented sidebar test expecting the `logo`
variable while the current checked-in layout uses `logoNop`.

No live Discogs request was performed because no administrator token or
credential encryption key was supplied. Next: set a base64-encoded 32-byte
`PERIDOT_CREDENTIAL_KEY`, onboard the reset server, add a personal Discogs
token, rescan the library, and verify one exact automatic match plus one manual
edition override. Changes remain uncommitted on `dev`; unrelated existing
working-tree changes, including the pre-existing untracked files, were
preserved. No commit, push, tag, publication, or deployment was performed.

## Browser-local queue and playback position

The player now writes a versioned, server-and-user-scoped `localStorage`
snapshot containing the complete queue, active track, shuffle state and
remaining random pool, and elapsed playback position. Queue mutations and media
clock updates refresh the snapshot. On reload, a valid local snapshot is restored
paused before the existing server queue fallback, so the same queue and track
return at the saved position without autoplay.

Added serialization and validation helpers plus behavioral coverage for full
snapshot round trips, queue ordering, scope isolation, malformed data, and
invalid progress. Extended the native-player regression coverage for the
local-storage read/write and reactive persistence wiring.

Verified the focused player/storage tests (3/3), web typecheck, targeted ESLint
and Prettier checks, the production web build, and `git diff --check`. The full
web suite passed 84 of 85 tests; the remaining pre-existing failure expects the
sidebar logo variable `logo`, while the checked-in layout uses `logoNop`.
Browser interaction QA could not run because Computer Use rejected browser URL
verification. Schema/server checks were skipped because this is web-only state
persistence. Changes remain uncommitted on `dev`; no commit, push, tag,
publication, or deployment was performed.

Known limits: progress is browser- and origin-local and does not synchronize
between devices or reset when the server database is reset. If browser storage
is unavailable or invalid, the player falls back to the server queue and starts
that queue at position zero.

## Default MusicBrainz provider and disable lifecycle

MusicBrainz is now created and enabled when the first administrator account is
created, using the required administrator email as the MusicBrainz contact.
Startup also backfills the default provider for an existing installation that
has an administrator but no provider row. A persisted `enabled` flag keeps an
administrator-disabled provider from being recreated or silently re-enabled.

Settings â†’ Metadata now shows Disable for an active provider and Enable for a
disabled one. Disabling requires confirmation, preserves the provider record
and contact, and leaves existing track matches intact. The provider remains in
the ordered list but is ignored by automatic enrichment, manual candidate
search, and manual match application until enabled again. The admin API now
uses `PUT /api/admin/metadata-providers/:id` with `{ "enabled": boolean }`;
physical provider deletion is no longer exposed.

Verified server and web type checks, all 59 server tests, the focused metadata
web tests, notification wiring tests, `pnpm check`, Prisma contract
emission/validation, the local `pnpm db:update` (including the new
`MetadataProvider.enabled` column), and the full production workspace build.
The full web suite passed 82 of 83 tests; the remaining pre-existing failure
expects the sidebar logo variable `logo`, while the current unrelated worktree
uses `logoNop`. Browser interaction QA was not run. Changes remain uncommitted
on `dev`; no commit, push, tag, publication, or deployment was performed.

## Persistent randomized playback toggle

Randomize is now an explicit per-user playback toggle rather than an immediate
queue shuffle. The queue API and SQLite state persist the source-order queue, an
independent active track, the enabled flag, and the remaining no-repeat random
pool. Reloading resumes the same active track and pass paused. Repeat-all starts
a new shuffled pass after exhaustion; repeat-one intentionally replays the
active track.

The player uses a separate random pool, so enabling randomization leaves the
visible queue order unchanged. The drawer pins the active track, keeps
source-order rows below it, and displays a secondary `Randomized` badge while
the mode is enabled. Add, remove, direct-play, Previous, and drag-reorder actions
keep the source queue unique and the random pool consistent.

Verification results and any remaining limits are recorded after the final
workspace checks. Changes remain uncommitted on `dev`; unrelated working-tree
changes and the pre-existing untracked files were preserved. No commit, push,
tag, publication, or deployment was performed.

## Prisma 8 upgrade and fresh local database

The server now runs on Prisma 8's contract-first ORM instead of Prisma 7 and its
generated client. `prisma@8.0.0-rc.33`, `@prisma/cli-engine@0.9.0`, and
`@prisma/orm-sqlite@8.0.0-rc.23` form the currently published compatible stack.
The authoritative model is `apps/server/src/prisma/contract.prisma`; emitted
`contract.json` and `contract.d.ts` are committed beside it. All server queries
and tests now use `db.orm`, `db.transaction`, `db.close`, and scalar row types
derived from the emitted contract.

The upgrade intentionally has no migration path. The old Prisma 7 schema,
twelve committed migrations, generated client, and `prisma7.config.ts` were
removed. A temporary recoverable copy of those old artifacts is under
`C:\Users\CYRIAQ~1.DEL\AppData\Local\Temp\peridot-prisma7-artifacts-20261111`.
`pnpm db:update` applies the current contract to an existing local database;
`pnpm db:reset` explicitly deletes and recreates it. Prisma's local refs and
snapshots are written under ignored `apps/server/.peridot/`. Development startup
uses `db:update`, never `db:reset`.

The actual `apps/server/peridot.db` was reset from scratch. Verification opened
it read-only and found all 12 application tables plus Prisma's marker, with zero
users, tracks, sources, and server settings. The database marker matches contract
storage hash `a80f96be326f8d1f4f7c7fc115b56c0fbae666a95214c66cbae73423cd2d8547`.
SQLite track availability is stored as `Int` because this SQLite target does not
provide a boolean codec; API contracts still expose booleans.

Checks passed: frozen-lockfile install, contract emission, workspace typecheck,
all 79 web tests, all 5 shared UI tests, all 58 server tests, lint/format checks,
the full workspace build, and a built-server smoke test against a separately
initialized fresh database. The smoke server returned the expected health payload
and `requiresAdminUser: true`. The CLI prints a non-failing notice that its
bundled agent skill is not synced to the repository.

Known limits: Prisma 8 is still a release candidate, so dependency updates require
checking the published ORM/CLI pairing. No migrations are retained and no data
was preserved from the previous local database. Changes remain uncommitted on
`dev`; unrelated working-tree changes, including the pre-existing untracked
`package-lock.json`, were preserved. No commit, push, tag, publication, or
deployment was performed. Next: continue normal development against the fresh
database, then revisit a migration strategy before any production data upgrade.

## Reliable Node 24 development startup

The root development command now runs under a project-scoped Node 24.22.2
runtime even when the machine-wide Node installation is outside the supported
major. The previous system Node 22 startup failed with Windows exit
`3221226505` (`0xC0000409`) after migrations, and its native SQLite module used
an incompatible ABI. `devEngines.runtime` lets pnpm download and use Node
24.22.2 for workspace lifecycle scripts.

The development launcher now starts the web and server workspace tasks in
parallel through pnpm instead of Turbo. Turbo remains the runner for build,
typecheck, and test, but `turbo run dev` inherited the Windows terminal crash
even with streamed output. The exact root `pnpm dev` command was verified in an
interactive terminal: migrations completed, Nuxt served on port 3000, Fastify
served health on port 17430, and both endpoints returned HTTP 200.

Server test fixtures now canonicalize their temporary roots before constructing
paths. Node 24 can return a Windows 8.3 alias from `mkdtemp()` while `realpath()`
returns the long form, which made source deduplication and audio lookup tests
compare different names for the same directory.

Verified `pnpm install --frozen-lockfile`, `pnpm check`, workspace typecheck,
`pnpm db:validate`, all 58 server tests after the path fix, and the interactive
development smoke test. The earlier full test run passed all 79 web and 5
shared UI tests. The machine-wide Node installer could not be replaced without
administrator elevation; the project runtime makes that optional. Changes are
uncommitted on `dev`, including `package.json`, `pnpm-lock.yaml`, the server test
fixtures, this handoff, and the decision log. The pre-existing untracked
`package-lock.json` was preserved. No commit, push, tag, publication, or
deployment was performed.

## Persistent onboarding server discovery

Onboarding now keeps the branded spinner and "Looking for a server on this
network" status visible throughout server selection, including between
automatic discovery cycles. Discovered Peridot servers remain listed as direct
selection actions below the status.

The URL field is no longer shown by default. A bottom-aligned manual-entry
option reveals and focuses it; address probing remains debounced and verified
servers are added to the same discovery list. Selection errors stay outside the
collapsed manual section so they remain visible.

Added onboarding coverage for the permanent spinner copy, found-server list,
reveal control, and collapsed URL field. The focused test, all 79 web tests,
web type check, `pnpm check`, the web production build, and `git diff --check`
passed. A built-app request to `/onboarding` returned HTTP 200 with the spinner
copy and manual option present and the URL field absent from the initial render.
Server/schema checks were skipped because no server or storage code changed.
Browser visual interaction QA was not run. Changes remain uncommitted on `dev`
with unrelated working-tree changes preserved; no commit, push, tag,
publication, or deployment was performed.

## Quiet default sort state in track tables

Inactive track-table sort headers and the default sort state no longer show the
neutral sort glyph. A sorted column shows only its ascending or descending
caret. Removed the now-unused `basil:sort-outline` import from the bundled icon
registry and added regression coverage for the conditional direction icons.

All 79 web tests, web typecheck, targeted ESLint and Prettier checks, the web
production build, and `git diff --check` passed. Server checks and database
schema validation were skipped because no server or storage code changed.
Browser visual QA was not run. Changes remain uncommitted on `dev`; no commit,
push, tag, publication, or deployment was performed.

## Silent source and provider reordering

Dragging library sources or metadata providers into a new order no longer emits
a success toast after the server saves the order. The new row order is visible
immediately, and failed order requests still show their existing inline error.
Add and remove toasts remain unchanged.

Updated the notification wiring coverage to require the order APIs but reject
success-toast calls from both reorder handlers. All 78 web tests, web typecheck,
targeted ESLint and Prettier checks, the web production build, and
`git diff --check` passed. Server checks and database schema validation were
skipped because no server or storage code changed. Browser interaction QA was
not run. Changes remain uncommitted on `dev`; no commit, push, tag, publication,
or deployment was performed.

## Bulk track metadata reset

The Metadata settings page now has a confirmed Reset metadata action. It clears
automatic and manual metadata matches for every catalog track, restores the
display to original file tags, reloads the browser catalog, and leaves
configured providers and audio files unchanged. The reset also clears attempted
match signatures, provider provenance, MusicBrainz recording/release IDs,
numbering, and match timestamps. The action is unavailable while a library
operation is active, and the server returns `409` if one is already running.

Added `POST /api/admin/metadata/reset` and a shared reset response contract. The
server endpoint is administrator-only. Behavioral coverage verifies successful
clearing of automatic and manual modes, file-tag fallback, provider retention,
and member/anonymous rejection. Web coverage verifies the authenticated client
call, confirmation dialog, catalog reload, and success-toast wiring.

Verified all 58 server tests, all 78 web tests, workspace type checking,
`pnpm check`, the full production `pnpm build`, and Prettier formatting. Database
schema validation was skipped because no schema or migration changed. Browser
visual and interaction QA was not run. Changes remain uncommitted on `dev` and
existing concurrent work was preserved; no commit, push, tag, publication, or
deployment was performed. Next: visually verify the destructive confirmation
and reset the real Tron: Legacy catalog to confirm it returns to one album.

## Playback across fullscreen layouts

Audio playback is now owned by the persistent Nuxt application root instead of
the main layout. Opening fullscreen Settings no longer tears down the native
audio element, so the current track keeps playing and its shared position,
volume, and queue remain intact while the player controls are hidden. Returning
to the main shell reconnects the controls to the same audio manager.

Updated the player lifecycle regression test to require root ownership and
prevent `default.vue` from creating a second audio manager. Checks and browser
verification results will be recorded after validation. Changes remain
uncommitted on `dev`; no commit, push, publication, or deployment was performed.

## Like success toasts

Liking a track, album, or artist now shows a five-second success toast after
the server confirms the like. Track likes use a generic confirmation because
the like target carries only the catalog ID; album and artist confirmations
include their trimmed display name. Heart buttons, context menus, cards, and
detail headers all inherit the behavior from the shared optimistic likes
composable. Unlikes remain silent on success and retain the existing rollback
error toast on failure.

Added pure target-specific toast content and a wiring regression test. All 78
web tests, web typecheck, workspace `pnpm check`, the full production
`pnpm build`, and `git diff --check` passed. Browser visual QA was not run.
Server behavioral tests, database schema validation, and server-specific type
checks were skipped because no server or storage code changed. Changes remain
uncommitted on `dev` alongside the existing library, metadata, playback, likes,
queue, and artwork work; no commit, push, tag, publication, or deployment was
performed.

## Album and artist card context menus

Album and artist cards now expose Reka UI context menus on right-click and touch
long-press across the complete card, including their artwork and title links.
The menus provide collection-aware Play, Like/Unlike, and Open actions. Play
replaces the persistent queue with the collection order through the shared
player, likes use the existing optimistic synchronized store, and Open uses the
existing encoded album and artist routes.

Added `AlbumContextMenu` and `ArtistContextMenu` wrappers and composed them into
the shared cards so home, Albums, and artist detail surfaces inherit the same
behavior. Added context-menu interaction coverage and included both components
in the styling-authority scan.

`pnpm --filter @peridot/web typecheck`, targeted ESLint and Prettier, all 77 web
tests, the production web build, and `git diff --check` passed. Browser pointer,
touch long-press, and keyboard visual QA was not run. Database/schema checks were
skipped because no server or storage code changed. Changes remain uncommitted on
`dev` with the existing work preserved; no commit, push, tag, publication, or
deployment was performed. Next: visually exercise right-click and touch
long-press on both card types and confirm menu actions against a real library.

## Folder-based album metadata matching

Automatic metadata enrichment now treats every containing folder as an album.
Tracks are grouped by source and directory, remain grouped when album tags are
missing or inconsistent, and use the folder name as the release title fallback.
This ensures tracks in an untagged album folder go through shared release search
and lookup instead of being treated as unrelated recording searches. Tracks in
a source root fall back to the source directory's name.

Added a behavioral test with two untagged MP3s in a `Night Sessions` folder,
asserting one release search for that folder title and two successful matches.
The targeted server test run passed all 57 server tests, and the server
typecheck, server build, workspace `pnpm check`, targeted ESLint, targeted
Prettier, and `git diff --check` checks passed.

Changes remain uncommitted on `dev` alongside the existing library, metadata,
playback, likes, queue, and artwork work. No commit, push, tag, publication, or
deployment was performed. Next: exercise the folder-based group against a real
untagged album and confirm releases with inconsistent per-track artist credits
are matched as expected.

## Local album artwork and signed cover URLs

The scanner now extracts preferred embedded front-cover artwork and falls back to
same-folder JPEG, PNG, or WebP files named `cover`, `folder`, `front`, or
`albumart`. Covers are capped at 5 MiB, hashed by content, deduplicated in the
new `TrackCover` table, and associated with tracks through `coverId`. Metadata
version 3 makes the next scan backfill covers for existing rows.

Track responses now include a relative cover URL with a four-hour HMAC token
scoped to that track's cover image. The scanner, player, and catalog do not
expose the user session to image requests. Album cards, album detail headers,
and the fixed player render the actual image and keep the semantic music-note
placeholder whenever no usable cover exists or the image request fails.

Added migration `20261110280000_track_covers`, cover-token authorization and log
redaction, embedded/folder artwork extraction, deduplication, authenticated
image serving, album grouping cover selection, and UI regression coverage for
the image/fallback branches.

## Metadata providers and dedicated source management

Settings now has dedicated administrator-only Sources and Metadata pages.
Sources retains add, drag-to-sort, and confirmed deletion, and each local source
row has a three-dot action menu for a source-scoped rescan or removal. Remote URL
and integration sources show Rescan disabled until those source kinds become
indexable. Administration now contains only the connected-server control and
server log; the former Library status and global Rescan library panel is gone.

Added the `POST /api/admin/sources/:id/scans` endpoint and nullable source
context on scans. Scoped scans read only the selected local path and only mark
missing tracks from that source unavailable. Global scan behavior remains for
compatibility and tests.

Added administrator-managed MusicBrainz providers with list, create, reorder,
delete, contact validation, duplicate protection, credential secrecy, and a
reserved encrypted credential column for future providers. MusicBrainz uses no
API key, so the UI collects a contact email or URL for the required User-Agent.
The Add provider dialog uses a Sources-style two-step flow: selectable cards for
MusicBrainz and a disabled Spotify coming-soon placeholder, followed by a
contact-only MusicBrainz form without a display-name option.
Configured kinds are disabled in the picker and the server uniqueness constraint
prevents duplicate MusicBrainz providers. The Metadata page also exposes a
Refresh metadata action backed by `POST /api/admin/metadata/refresh`, which
re-runs automatic matching for current tracks without scanning files or touching
manual/file-mode overrides.
The fixed-origin client serializes requests to one per second, applies timeouts,
response-size limits, retry backoff, and rate-limit handling.

Library scans now continue into background metadata matching after local file
scanning completes. New or changed tracks are grouped for release matching or
queried as recordings, and matching metadata is stored as an overlay with a
provider snapshot, recording/release MBIDs, match mode, time, and MusicBrainz
link. Local tags remain the fallback. Successful unchanged matches and prior
no-match signatures are not polled again; transient failures remain retryable.
Track context menus expose provenance, MusicBrainz candidate search, manual
correction, and return-to-file-metadata actions for signed-in members. Reverting
selects file mode so the next scan does not immediately restore the same
automatic match.

Added migration `20261110270000_metadata_providers` for provider configuration,
track overlay fields, and scan metadata/source context. Behavioral coverage now
includes provider CRUD and authorization, contact and CORS validation,
MusicBrainz request headers/origin/rate limiting, automatic matching, no-match
and unchanged skipping, manual correction/reversion, source-scoped scan
isolation, dedicated Settings pages, context-menu correction, metadata toast
progress, and styling authority.

Verified `pnpm check`, full workspace typecheck, all 138 tests (76 web, 57
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all twelve
migrations against a disposable SQLite database, and `git diff --check`; all
passed. A browser visual/interaction pass was not run.

Known limits: MusicBrainz is the only provider; URL and integration source types
remain stored but not indexable; matching is deterministic best-match rather than
a confidence-review queue; any signed-in member can change shared catalog
metadata; several tracks in one album share a release search/lookup but manual
searches remain per track; and creating a provider that requires an API key is
not exposed until such a provider is implemented. Album artwork only uses
embedded pictures and four well-known same-folder filenames; it does not search
parent directories or fetch remote Cover Art Archive images.

Changes remain uncommitted on `dev` alongside the existing album, artist,
playback, likes, queue, and library work. No commit, push, tag, publication, or
deployment was performed. Next: visually review the two new Settings pages,
three-dot menus, provider dialog, metadata correction dialog, and toast phases at
desktop and mobile widths; then exercise a real MusicBrainz match against a
small tagged album.

## Sortable Reka track tables

Library, album, and artist track lists now use one shared real-DOM table that
follows the Reka UI data-table example for client-side sorting and row
interaction composition. The visible Track number, Title, Artist, Album, and
Duration fields expose accessible sort buttons with `aria-sort`, bundled Basil
sort-direction icons, and a three-state cycle through ascending, descending,
and default. Library tables return to Title ascending in their default state;
album and artist tables return to track number ascending so their existing
album/disc semantics remain the default.
Missing text, duration, and track-number values sort last in both directions.

The refactor centralizes row rendering for playback, liking, double-click, album
and artist links, and the existing Reka context menu. Added behavioral coverage
for case-insensitive text sorting, the three-state toggle cycle, null placement,
numeric duration sorting, album/disc/track ordering, and non-mutating input.
Updated component regression coverage to verify all three screens use the
shared table.

The tri-state sorting regression test, web typecheck, `pnpm check` (workspace
lint and formatting), production web build, and `git diff --check` passed. The
full web run passed 74 of 75 tests; the remaining unrelated album-cover fixture
expects a cover URL that its catalog fixture does not define. Database/schema
checks were skipped because no server or storage code changed. Browser visual,
pointer, and keyboard interaction QA was not run. Changes remain uncommitted on
`dev` alongside the existing work; no commit, push, tag, publication, or
deployment was performed. Next: visually verify the sortable headers at desktop
and mobile widths, then exercise default, ascending, descending, reset, and
keyboard activation in a browser.

## Durable player queue and right-side queue drawer

The player now uses one ordered, per-user queue with the first available track
as the active item. Individual track playback moves that track to the front;
album and artist Play actions replace the queue with the ordered collection.
Next and natural completion consume the active item and stop at the end.
Previous restores an in-memory history entry and puts the displaced current
track back at the front of upcoming. Add to queue inserts directly after the
active track without duplicating an existing entry. The action remains enabled
for queued tracks and re-adding one normalizes and repositions it rather than
creating a duplicate.

Queue order is stored relationally in the new `QueueItem` model and migration
`20261110260000_user_queue`. Authenticated `GET /api/queue` and
`PUT /api/queue` expose an ordered track-ID snapshot; PUT rejects duplicates
and unknown tracks and atomically replaces the user's queue. Browser mutations
are serialized, auth-scope guarded, and last-write-wins. Queue loading restores
the first available track paused at the start without auto-play.

The fixed player includes randomize-upcoming and queue controls. Randomize
shuffles only upcoming entries and preserves the active track and playback
state. The queue opens in a player-clearing, width-constrained custom right-side
panel with a pinned now-playing row, drag-sorted upcoming rows, playback
context, artist links, delete actions, and retryable loading errors. Upcoming
queue rows are not playback controls. The panel and overlay stop at the top of
the fixed player, so neither overlaps or blocks player interaction. The queue
button directly toggles the panel. Entire queue rows are sortable with
SortableJS. The new order is calculated from its old and new indexes before
persistence. Close-button, Escape, and backdrop dismissal are handled by the
custom panel. The panel is non-modal so the fixed player remains interactive
while it is open. The now-playing row cannot be reordered or removed.
Queue drag handles use the bundled `akar-icons:drag-vertical` glyph, imported
offline through `@iconify-icons/akar-icons`.

Added server coverage for ordering, validation, per-user privacy,
authentication, restart persistence, and cascade deletion. Added pure queue
logic, authenticated client, context-menu, control-placement, custom drawer, and
styling coverage. Full workspace lint, formatting, typecheck, tests, schema
validation, production build, and deployment of all ten migrations passed
before the final drawer layout adjustments. Web typecheck and all 69 web tests
passed after changing the drawer to a right-side panel and then constraining
its width. Browser visual/interaction QA remains unavailable because Computer
Use could not verify the active Brave URL.

Changes remain uncommitted on `dev` alongside concurrent work, including the
shared track-table refactor and player seek hit-area change. No commit, push,
tag, publication, deployment, or credentials were created. Next: visually
verify the full-screen drawer controls and a real drag sort at desktop and
mobile widths when browser automation is available.

## Sidebar brand logo

The main sidebar now displays the bundled shared Peridot logo immediately before
the lowercase “peridot” title. The image is decorative because the adjacent text
already names the home link, and it uses the existing Button gap with a standard
Tailwind `size-6` scale. A regression assertion covers the logo placement.

Verified the web typecheck, all 65 web tests, targeted Prettier, the production
web build, and `git diff --check`; all passed. Targeted ESLint still reports the
preexisting unused `queueTracks` binding in `default.vue`; that unrelated
uncommitted code was preserved. No browser visual pass was run. Changes remain
uncommitted on `dev`; no commit, push, publication, or deployment was performed.

## Durable track, album, and artist likes

Track, album, and artist favorites now persist per signed-in user in SQLite.
The migration adds separate track, album, and artist like models. Track likes
reference catalog IDs and cascade with user or track deletion; derived album and
artist likes store trimmed display labels plus normalized identities so they
match the existing case-insensitive projections. The authenticated likes API is
an aggregate `GET /api/likes` plus idempotent `POST` and `DELETE` mutations with
a discriminated target.

The web app now loads likes once into shared Nuxt state and uses it from the
fixed player, every track heart and context menu, the Liked songs view and count,
album cards, artist cards, and both detail headers. Mutations are optimistic,
per-target pending operations ignore duplicate clicks, failures roll back and
surface an app toast, and state resets when the connected server or user changes.
Album and artist cards separate their navigation links from like buttons so
interactive controls are not nested. Likes never cascade from albums or artists
to tracks. No new liked-album or liked-artist browsing page was added.

Added migration `20261110250000_user_likes` and behavioral coverage for
normalization and idempotency, identity independence, per-user privacy,
authentication, validation, missing tracks, persistence across restart, and
cascade deletion. Added client coverage for authenticated API calls, JSON
bodies, identity helpers, the shared state wiring, Liked songs filtering, and all
album/artist card and detail controls.

Verified `pnpm check`, full workspace typecheck, all 101 tests (59 web, 37
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all nine
migrations against a disposable database, and `git diff --check`; all passed. No
browser visual or interaction pass was run.

Known limits: existing in-memory likes cannot be migrated because they were
never persisted; unavailable track likes remain stored but are hidden from the
available catalog; retagging an album or artist to a new normalized identity
leaves the prior like stored but unmatched. Changes remain uncommitted on `dev`
alongside the existing work; no commit, push, tag, publication, or deployment
was performed.

## Track context menus, downloads, and multiple artist credits

Track rows in the library, album detail, and artist detail now share a Reka UI
context menu built on new shadcn-style wrappers in `@peridot/ui`. Right-clicking
or long-pressing a row offers Play, Like/Unlike, Download, Go to album, and Go
to artist. Tracks with multiple credits use a Go to artists submenu. Menu
playback preserves each screen's existing queue, and downloads use a
short-lived playback token plus a temporary blob URL with a safe filename based
on the track title and MIME type.

The catalog contract now includes an artist-credit array while retaining the
combined display artist string. The scanner retains every metadata artist and
recognizes common single-field separators. A new optional `artistCredits`
column stores the array as JSON, and metadata version 2 triggers one backfill
scan for existing rows. Artist browsing now places a collaboration track under
each credited artist and renders individual artist links.

Verified `pnpm check`, full workspace typecheck, all 101 tests (59 web, 37
server, 5 shared UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`;
all passed. The server tests apply all migration files to disposable databases,
including the new artist-credit migration. No browser visual/interaction pass
was run.

Changes remain uncommitted on `dev` alongside the existing album, artist,
playback, library, source, likes, and settings work. No commit, push, tag,
publication, or deployment was performed. Known limits: existing tracks receive
separate artist credits after their next scan, and downloads buffer the complete
audio file in browser memory before saving. Next: right-click and long-press
rows at desktop and mobile widths, test the multi-artist submenu with real
tagged files, and confirm a download in a browser.

## Functional native audio playback

The fixed player now streams real tracks through an `HTMLAudioElement` instead
of advancing a simulated timer. Play/pause, previous/next, restart, seek,
volume, native media time, track duration, loading, and retryable error states
are connected to the shared player state. Album and artist queues advance
automatically when audio ends, while a single library-track choice returns to
the full catalog queue. Switching tracks aborts stale setup work and preserves
the intended play/pause state.

The browser cannot attach the session bearer header to a native media request,
so available tracks now issue a four-hour HMAC-signed token scoped to that track
and audio route. The token is supplied only in the audio URL, never replaces the
user session, and is redacted from request logs. Audio continues through the
existing authenticated HTTP range endpoint, so original formats stream and seek
without full-file downloads or transcoding.

Added server coverage for scoped tokens, expiry, tampering, route/method
restrictions, log redaction, token issuance, and unauthenticated ranged audio
streaming. Added web coverage for token issuance and the native audio/player
wiring. Updated README and DECISIONS.md.

Verified `pnpm check`, full workspace typecheck, all 87 tests (50 web, 32 server,
5 shared UI), `pnpm db:validate`, `pnpm build`, and `git diff --check`; all
passed. A browser runtime playback pass was not completed because Computer Use
stopped when it could not verify the current browser URL. Changes remain
uncommitted on `dev` alongside the existing artist, album, library, source, and
settings work; no commit, push, tag, publication, or deployment was performed.

Known limits: selected-track and favorite state still reset on reload; playback
tokens are process-local and expire after four hours; fullscreen Settings
unmounts the audio element, so playback resumes at the saved position after
returning to the main layout. Next: manually play, pause, seek, change volume,
and exercise next/end-of-track behavior against a tagged local library in Brave.

## Artist browsing, detail, and artist queues

Added an Artists navigation destination and responsive artist grid derived from
every non-empty track artist in the loaded catalog, including albumless tracks
and Unknown Artist. Each card opens an artist detail route with album cards, a
complete artist track list, search, individual favorites/playback, and a Play
artist action. Artist tracks are ordered by album, disc, and track number, with
albumless tracks last. Both Play artist and individual artist-track actions use
an artist-scoped queue; album playback retains its existing album-scoped queue.

Artist names in the shared library track list and album detail now link to the
artist page, and the Artists navigation item remains active on detail routes.
The grouping helpers are case-insensitive and remain a client-side projection
with no server endpoint, schema change, or migration.

Verified `pnpm check`, full workspace typecheck, all 87 workspace tests (50 web,
32 server, 5 shared UI), the web production build, and `git diff --check`; all
passed. Database validation was unnecessary because no schema or server code
changed. No browser visual/interaction pass was run.

Changes remain uncommitted on `dev` alongside the existing album, playback,
library, source, and settings work. No commit, push, tag, publication, or
deployment was performed. Next: visually review the artist grid/detail and
artist links at desktop and mobile widths.

## Track-row double-click playback

Double-clicking a row in the shared library track list or an album detail track
list now starts that track. Row playback keeps the existing queue semantics:
library rows play from the full catalog and album rows remain inside the album.
Double-clicks on the title button, favorite control, and album link stop at those
controls so they do not trigger a second row action.

Added component regression assertions for both row handlers and the child-event
guard. Verified all 43 web tests, the web typecheck, targeted ESLint and Prettier
checks, the production web build, and `git diff --check`; all passed. Database
validation was skipped because no schema or server code changed, and no browser
interaction pass was run. Changes remain uncommitted on `dev` alongside the
existing album-browsing work; no commit, push, tag, publication, or deployment
was performed.

Next: exercise row double-click playback in the library and an album at desktop
widths, including double-clicks over title, favorite, and album controls.

## Track-list album links

Album names in the shared track list now link to the album detail route using
the same trimmed album title and artist identity as the Albums index. Tracks
without album or artist metadata continue to show the existing dash instead of
linking to an unavailable album.

Added route-identity coverage for trimmed track album metadata and a component
regression assertion for the track-list link. Verified all 43 web tests, the web
typecheck, targeted ESLint and Prettier checks, the production web build, and
`git diff --check`; all passed. Database validation was skipped because no
schema or server code changed, and no browser visual pass was run. Changes
remain uncommitted on `dev` alongside the existing album-browsing work; no
commit, push, tag, publication, or deployment was performed.

Next: visually confirm the album link's hover and keyboard-focus states at
desktop widths, where the track-list Album column is visible.

## Album browsing, detail, and album queues

Added an Albums navigation destination and responsive album grid derived from
the loaded track catalog. Albums group by case-insensitive artist and title;
albumless tracks remain in the normal library and are excluded from album
browsing. Each card opens a detail route with placeholder artwork, track and
total-duration summaries, search, per-track playback/favorites, and a Play album
action. The navigation highlights the Albums section on detail routes.

The player now supports an ordered album queue. Album actions keep previous,
next, and automatic advancement inside the album, while choosing a library track
resets the active queue to the full catalog. The persistent layout is now the
sole owner of the simulated playback timer, avoiding duplicate clocks when
screens also consume player state.

Extended the Track catalog with nullable disc and track numbers plus a private
metadata version. The scanner reads positive `disk.no` and `track.no` metadata;
the next scan reparses legacy rows once to backfill them, then marks tagless
files current so unchanged scans remain cheap. `TrackResponse` exposes the two
public ordering fields. Added migration
`20261110230000_track_album_order`.

Verified `pnpm check`, full workspace typecheck, all 77 tests (43 web, 29 server,
5 shared UI), `pnpm db:validate`, `pnpm build`, deployment of all seven
migrations against a disposable database, and `git diff --check`; all passed.
No browser visual/interaction pass was run.

Known limits: album artwork remains a semantic placeholder because cover
extraction/serving is deferred; albums are still a client-side projection with
no album entity or `/api/albums` endpoint; existing catalogs receive disc/track
metadata only after their next scan; and playback remains simulated. Changes
remain uncommitted on `dev` alongside the existing library, source, settings,
and documentation work. No commit, push, tag, publication, or deployment was
performed.

Next: run a scan against a tagged multi-disc library, then visually review the
album grid/detail at desktop and mobile widths. A later artwork slice should
extract embedded covers or folder images and expose a bounded image endpoint.

## Real scanned tracks in the library

The Home, Library, and Liked songs views now read the authenticated
`GET /api/tracks` catalog instead of the former five fictional records. A shared
Nuxt state loads the catalog once, exposes loading and retry states, supports
title/artist/album search and in-memory favorite filtering, and reloads
automatically when the global scan watcher reports a completed scan. The fixed
player now displays selected real track metadata; its timer and transport remain
simulated until the audio engine is connected.

Removed `demo-library.ts`, `use-demo-player.ts`, and their tests. Added pure
library filtering/duration tests and client coverage that verifies the bearer
token and `/api/tracks` endpoint. A read-only check of the active local database
confirmed real catalog rows such as Daft Punk's TRON soundtrack tracks.

Verified `pnpm check`, all 37 web tests, web typecheck, production web build, the
full 70-test monorepo suite (37 web, 28 server, 5 UI), and `git diff --check`;
all passed. Database schema validation was skipped because no schema or server
route changed. A browser visual pass could not run because Computer Use stopped
when it could not confidently determine Brave's current URL.

Changes remain uncommitted on `dev` alongside the existing source, disconnect,
logging, and documentation work; unrelated changes were preserved. No commit,
push, tag, publication, or deployment was performed. Known limits: likes are
in-memory, the track list uses the server's default available-only ordering,
and playback remains simulated. Next: visually verify the table at desktop and
mobile sizes, then connect the authenticated `/api/tracks/:id/audio` endpoint.

## Fullscreen toast anchoring

Fixed app-level toast placement in the playerless fullscreen Settings layout.
The shared toast viewport now follows the active Nuxt layout: it keeps the
existing player clearance in the main shell and anchors to the bottom edge in
fullscreen routes. A focused placement test covers default, Settings, false,
and custom layouts.

Verified all 37 web tests, web typecheck, targeted lint and formatting, the web
production build, and `git diff --check`; all passed. Database validation was
skipped because the schema is unchanged. No browser visual pass was run. Next:
trigger a toast in Settings at desktop and mobile widths to confirm the final
spacing against the viewport edge.

Changes remain uncommitted on `dev` alongside the existing library-player and
server work; unrelated files were preserved. No commit, push, tag, publication,
or deployment was performed.

## Server disconnect control

Added a Disconnect button to the right of the connected-server card in
Administration. It uses the bundled Basil logout icon, stacks below the address
on narrow screens, opens a Reka UI confirmation dialog naming the connected
server, and becomes disabled with a disconnecting label while the action runs.
Canceling the dialog preserves the current browser identity. Confirming clears
the server, session, and profile cookies, attempts to revoke the server-side
session, and returns to onboarding.

Added client coverage for `DELETE /api/auth/session`, icon pre-bundling coverage,
and settings regression assertions for card placement, confirmation-dialog
wiring, and local credential cleanup. Verified `pnpm check`, web typecheck, all
35 web tests, and `git diff --check`; all passed. A production build was
attempted but Nuxt reported that the checkout's active dev server already owns
the build lock, so it was skipped to avoid disrupting that process. Database
validation was skipped because the schema is unchanged. No browser
visual/interaction pass was run.

Changes remain uncommitted on `dev` alongside concurrent unrelated changes in
`apps/server/src/app.ts` and `apps/server/test/sources.test.ts`; those files were
preserved. No commit, push, tag, publication, or deployment was performed.
Known limit: if the server cannot be reached during disconnect, local identity
is still cleared but that remote session cannot be revoked and remains valid
until expiry. Next: visually verify the desktop and mobile card layouts and
exercise the server-unreachable path in a browser.

## Source deletion request and warning logs

Fixed the follow-up source-deletion failure after CORS was corrected. The shared
web API client was adding `Content-Type: application/json` to `DELETE` requests
that had no body, so Fastify rejected them with `FST_ERR_CTP_EMPTY_JSON_BODY`.
The client now adds the JSON content type only when a body is present; source
removal and session revocation remain authenticated requests without a content
type.

The server previously logged every completed response at `info`. Successful
HTTP requests are now logged at `debug`, while failed HTTP responses are
logged at `warn`; request method, URL, status, and response time remain
available in the Administration log. The log view now starts with `debug`,
`warn`, `error`, and `fatal` selected, hiding `trace` and `info` by default.
Added client assertions for headers with and without bodies, server coverage
for both request-log levels, and a settings assertion for the default filter.

Verified all 28 server tests, all 35 web tests, `pnpm check`, `pnpm typecheck`,
`pnpm db:validate`, `pnpm build`, and `git diff --check`; all passed. Changes
remain uncommitted on `dev` alongside concurrent disconnect work; no commit,
push, tag, publication, or deployment was performed.

## Source mutation CORS fix

Fixed source removal and drag-to-reorder from Settings when the web app and API
are on different development origins. The server previously relied on
`@fastify/cors` defaults, which advertise only `GET`, `HEAD`, and `POST`; browsers
therefore rejected the `DELETE` source-removal request and `PUT` order request
before either reached Fastify. The CORS policy now explicitly advertises `GET`,
`HEAD`, `POST`, `PUT`, `DELETE`, and `OPTIONS` while retaining the configured
origin and authorization/content/range header allowlists.

Added behavioral preflight coverage for both source mutations. Verified
`pnpm --filter @peridot/server test` (27 tests), `pnpm check`, `pnpm typecheck`,
`pnpm db:validate`, and `pnpm build`; all passed. `git diff --check` is recorded
after the final documentation edit. No browser interaction pass was repeated,
and the schema is unchanged. Changes remain uncommitted on `dev`; unrelated web
changes that appeared during verification were preserved. No commit, push, tag,
publication, or deployment was performed.

## Source change toasts

Added success toasts for source lifecycle changes in Administration. Adding or
removing a source includes the configured folder, URL, or integration label;
dragging to save a new order originally reported “Source order updated.”
Reordering is now silent and confirmed by the visible row order; add and remove
notifications remain. Notifications are emitted only after the corresponding
server request succeeds and use the shared app-level Reka toast manager.

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

Added a reusable `PeridotSpinner` component to the shared UI package around the owner's
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

## 2026-11-10: Larger player progress hit target

Added a 44px minimum-height invisible hit area to the bottom player's progress
slider while preserving the existing 6px track and 16px thumb. The shared
Slider component and volume control are unchanged. A player regression assertion
now covers the player-only target class.

All 59 web tests, web typecheck, targeted ESLint/Prettier checks, the production
web build, and `git diff --check` passed. Schema/server checks were skipped
because no server or storage code changed. Browser visual QA was not run.
Changes remain uncommitted on `dev` with unrelated work preserved. No commit,
push, publication, or deployment was performed. Next: visually confirm pointer
seeking near the top and bottom edges of the progress row.
