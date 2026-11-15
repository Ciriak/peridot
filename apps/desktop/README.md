# Peridot Desktop

The initial Tauri 2 prototype wraps the shared Nuxt client in a native desktop
window. It does not embed the Fastify server yet. Launch the complete
development stack and native window with:

```sh
pnpm desktop:dev
```

The Tauri development command starts the normal database update, Nuxt server,
and Fastify server, then loads `http://127.0.0.1:17431`. It exercises the same
web application, API, realtime connection, and playback path as the browser.

Build a runnable desktop executable without creating an installer:

```sh
pnpm desktop:build
```

This statically generates the web client, embeds the resulting assets in the
Tauri executable, and stores the output under
`apps/desktop/src-tauri/target/release/`. The packaged application still
connects to a separately running Peridot server.

`pnpm --filter @peridot/desktop bundle` creates a platform installer once code
signing and release packaging are configured. The prototype does not publish,
sign, or auto-update releases.

The desktop shell currently exposes the Tauri core capability only. It has no
filesystem, shell, HTTP, credential, or plugin permissions beyond that default.
Session persistence currently uses the webview's application storage; moving
credentials to native secure storage is a follow-up desktop milestone.

The embedded client supports manual server entry. Network discovery remains a
Nuxt-server feature and is not yet available in the packaged application.
