# Peridot Android

The Android application packages the generated Nuxt client in Capacitor and
uses a native Media3 `MediaLibraryService` for background playback and Android
Auto.

Prerequisites:

- Android Studio with Android SDK 36 and build tools installed.
- A JDK supported by the generated Android Gradle project.
- Android Auto and the Desktop Head Unit for car-app testing.

Common commands:

```sh
pnpm android:sync
pnpm android:dev
pnpm android:test
pnpm android:build
pnpm android:bundle
```

The root `pnpm test` command covers the cross-platform workspace tests.
`pnpm android:test` runs Capacitor sync and the Android Kotlin tests with the
Android/Java prerequisites above.

Release signing reads `android/signing.properties`, which is ignored by Git.
The local release key is stored under `.peridot/android/` and must be backed
up before submitting a build to Google Play.
