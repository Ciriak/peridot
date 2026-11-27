# Peridot Desktop

The initial Tauri 2 prototype wraps the shared Nuxt client in a native desktop
window. It does not embed the Fastify server yet. Launch the complete
development stack and native window with:

```sh
pnpm desktop:dev
```

The Tauri development command applies normal database migrations, starts the
Nuxt and Fastify servers, then loads `http://127.0.0.1:17430`. It exercises the
same web application, API, realtime connection, and playback path as the
browser.

Build the desktop installer:

```sh
pnpm desktop:build
```

This statically generates the web client and packages it for the current
platform. Windows produces only an NSIS installer at
`apps/desktop/src-tauri/target/release/bundle/nsis/Peridot_<version>_x64-setup.exe`.
The local installer omits updater signatures because it does not have the
release private key. Linux and macOS continue to use their native Tauri bundle
targets. The packaged application still connects to a separately running
Peridot server.

Build only the runnable desktop executable with:

```sh
pnpm --filter @peridot/desktop package
```

Desktop channel releases publish the Windows NSIS installer and its updater
signature with the other platform artifacts.

The desktop shell currently exposes the Tauri core capability only. It has no
filesystem, shell, HTTP, credential, or plugin permissions beyond that default.
Session persistence currently uses the webview's application storage; moving
credentials to native secure storage is a follow-up desktop milestone.

The embedded client supports manual server entry. Network discovery remains a
Nuxt-server feature and is not yet available in the packaged application.
