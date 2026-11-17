# Bundled plugins

Official plugins are independently versioned workspace packages registered by
the server's trusted plugin host. Each package declares a manifest and one or
more contribution kinds: library sources, display extensions, playlist
generation, or data processing. The current host executes source contributions;
the other kinds are reserved contract surfaces.

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
