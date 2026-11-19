# Bundled plugins

Official plugins are independently versioned workspace packages registered by
the server's trusted plugin host. Each package declares a manifest and one or
more contribution kinds: library sources, recommendation providers, display
extensions, playlist generation, or data processing. The current host executes
source, recommendation-provider, and playlist-generator contributions. Display
is the remaining reserved contribution surface. Data processors expose named
jobs through the shared task system.

`@peridot/plugin-jellyfin` provides the Jellyfin source adapter, including
library discovery, scan records, artwork, playback, configuration validation,
and protocol-specific errors. The core server owns persistence, tasks, catalog
projection updates, credential encryption, and HTTP/file access.

Plugins are installed or uninstalled from Settings → Plugins. Installation state
and source provenance are stored separately so a future trusted package loader
can install a version from GitHub without changing source or lifecycle models.
This milestone deliberately loads only bundled executable code. Never load
untrusted plugin code into the Fastify process; remote installation requires a
sandboxed runtime and package verification first.

Non-source service plugins use plugin-level settings rather than a library
source. Secret settings are encrypted with the server credential key and are
never returned to browser code. Recommendation results identify catalog tracks
by exact source ID plus external track ID; Peridot does not fall back to title
or artist matching.

## Adding a source plugin

1. Add a workspace package with an Apache-2.0 license and depend on
   `@peridot/plugin-sdk`.
2. Export a `PluginDefinition` with a manifest, declarative source fields, and a
   source adapter.
3. Register the definition in the server's bundled plugin list.
4. Add its message descriptors to the fixed web locale.
5. Test discovery, configuration validation, scanning, artwork, playback
   ranges, task cancellation, and uninstall cleanup through the generic plugin
   APIs.

## Adding a recommendation or playlist plugin

1. Declare `recommendation-provider`, `playlist-generator`, or both in the
   manifest and contributions.
2. Add `settingsFields` for plugin-level connection settings. Mark passwords
   and tokens as `secret`.
3. Implement `recommendationProvider.similar`, `forYou`, or both. Implement
   `playlistGenerator.generate` for prompt or seed-based generated playlists.
4. Return exact `sourceId` and `externalId` track references. The core resolves
   those references against available catalog tracks and reports unmatched
   candidates without guessing.
5. Configure and test the plugin through the generic Settings → Plugins form and
   authenticated provider APIs. No contribution-specific server route or
   context-menu integration is required for a new provider.

## Adding a data processor

Declare `data-processor` tasks in the contribution and implement a matching
`dataProcessor.tasks` entry for each ID. The host registers each task as
`plugin:<plugin-id>:<task-id>`, supplies encrypted connection settings,
cancellation, and progress updates, and exposes the run through Settings and the
shared task API.
