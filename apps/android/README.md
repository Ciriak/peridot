# Peridot Android

The Android application packages the generated Nuxt client in Capacitor and
uses a native Media3 `MediaLibraryService` for background playback and Android
Auto.

Liked tracks, Albums, Playlists, Artists, and the current Queue are browsable
from Android Auto. Albums, playlists, and artists play as complete collections.
The car UI requires an authenticated phone session and a reachable Peridot
server; credentials are read only by native Android code.

Prerequisites:

- Android Studio with Android SDK 36 and build tools installed.
- A JDK supported by the generated Android Gradle project.
- Android Auto and the Desktop Head Unit for car-app testing.
- Android Auto developer mode with unknown sources enabled when testing a
  directly installed APK.

Common commands:

```sh
pnpm android:sync
pnpm android:dev
pnpm android:auto
pnpm android:test
pnpm android:build
pnpm android:bundle
```

The root `pnpm test` command covers the cross-platform workspace tests.
`pnpm android:test` runs Capacitor sync and the Android Kotlin tests with the
Android/Java prerequisites above.

Run `pnpm android:instrument` with a device or emulator connected for the
MediaBrowser fixture tests. For the Desktop Head Unit, start Android Auto's head
unit server, forward port `5277`, install the debug APK, sign in on the phone,
and open Peridot from the car media launcher.

`pnpm android:auto` launches or reuses an Android emulator, waits for boot,
forwards the DHU port, and opens the Desktop Head Unit. A connected device with
full Android Auto is preferred over a stub emulator image; use `--avd` when the
emulator must be selected explicitly. When more than one AVD is installed,
select one with `PERIDOT_AVD` or `--avd`. Use `PERIDOT_DHU_PORT` or `--port`
when port `5277` is unavailable.

Release signing reads `android/signing.properties`, which is ignored by Git.
The local release key is stored under `.peridot/android/` and must be backed
up before submitting a build to Google Play.
