<p align="center">
  <img
    src="packages/ui/src/assets/brand/logo-nop.png"
    width="64"
    alt="Peridot app icon"
  />
</p>

<h1 align="center">Peridot</h1>

<h2 align="center">Your self-hosted music platform</h2>

<!--  Insert screencap of the app here -->

<p align="center">
  Peridot is a self-hosted music platform, giving you total control over your
  music library.
  <br />
  No ads, no paywall. You have control.
</p>

## ✨ Features

### 🎵 Library and discovery

- 🗂️ **Local-first catalog** — add one or more music folders on your own server
  and scan them into a private library.
- 🎧 **Broad audio support** — catalog and stream MP3, M4A/AAC, OGG/Opus, WAV,
  and FLAC files without transcoding.
- 💿 **Albums and artists** — browse release-first album groups, disc and track
  ordering, artist pages, album cards, and locally cached artwork.
- 🔎 **Fast library search** — search tracks and albums, filter results, and
  revisit recently searched albums.
- 🏠 **Personal suggestions** — discover albums and tracks from your library on
  the home screen, alongside your playlists.
- ❤️ **Private favorites** — like tracks, albums, artists, and playlists
  independently for each account.

### ▶️ Playback

- 🎚️ **Full-featured player** — play, pause, seek, change volume, skip tracks,
  and automatically advance through the queue.
- 🔀 **Persistent queue** — keep one queue per user, reorder or remove upcoming
  tracks, and choose randomized playback.
- 🕘 **Resume playback** — restore the last active track, queue, and position
  after a reload without starting playback automatically.
- ✨ **Quick Picks** — get an automatically ranked selection of frequently
  played tracks and albums, refreshed with time-based scoring.
- ⬇️ **Authenticated downloads** — download original audio files directly from
  your server.
- ⌨️ **Keyboard and media controls** — open search with `Ctrl+K` or `Cmd+K`,
  and use native media keys in the desktop app.

### 📚 Playlists

- 🛠️ **Full playlist management** — create, rename, and delete private
  playlists.
- ➕ **Flexible track selection** — add tracks from the library, the track
  context menu, or the playlist picker.
- ↕️ **Ordering and cleanup** — reorder tracks by dragging, remove entries, and
  prevent duplicate additions.
- 🧩 **Generated 3×3 covers** — build each playlist image from its first nine
  distinct track covers, with theme placeholders for missing artwork.
- 🫥 **Unavailable references** — keep imported external tracks visible in
  playlist order until an exact provider or external ID match makes them
  playable; the browser never guesses from title or artist.
- 💾 **Offline playlists** — save every available track in a playlist for
  offline playback.
- ❤️ **Playlist favorites** — like playlists from their cards or detail pages.

### 🧠 Metadata

- 🎼 **MusicBrainz and Discogs** — enrich tracks, releases, and artist profiles
  with metadata from configurable providers.
- 🧩 **Automatic and manual matching** — resolve unmatched tracks automatically,
  choose another candidate, or restore the original file tags at any time.
- 🖼️ **Artwork enrichment** — use embedded covers, folder artwork, and cached
  artist portraits with accessible placeholders.
- 🧾 **Metadata provenance** — keep provider details and release information
  distinct from the original audio tags.
- 🔐 **Encrypted credentials** — store provider tokens locally with a
  user-supplied encryption key and never send credentials to browser code.

### 📶 Offline and apps

- 📱 **Installable PWA** — install Peridot as an app with an offline application
  shell.
- 💾 **Explicit offline saves** — keep chosen tracks, albums, and playlists
  available without a server connection.
- 🔄 **Resilient queue edits** — preserve queue changes locally and retry them
  after reconnecting.
- 🌐 **Server onboarding** — discover Peridot servers on the local network or
  connect manually, then create the first administrator or sign in.
- 🖥️ **Desktop prototype** — run the shared web client in a Tauri 2 shell with
  native history controls and media-key support.
- 🔔 **Realtime status** — receive live task, catalog, and connection updates.

### 🔐 Administration and privacy

- 👥 **Multi-user access** — create administrator and member accounts with
  expiring sessions and secure password hashing.
- 🧑‍💼 **User management** — edit account details and roles, revoke access, and
  manage users without leaving the app.
- ⚙️ **Library administration** — manage ordered music sources, rescans,
  metadata providers, and scan activity.
- 📈 **Task monitoring** — follow active progress and review interrupted,
  failed, or completed work.
- 🧾 **Server logs** — inspect and filter live server events from an
  administrator-only view.
- 🛡️ **Local by default** — no ads, hosted account requirement, embedded
  provider keys, or mandatory cloud service.

### 🚧 Planned

- 🤖 **Automatic playlists** — generate smart collections automatically; the
  current release provides manually managed playlists.
- 🧩 **Plugin marketplace** — discovery, permissions, installation, and updates
  through an isolated plugin runtime.
- 🔗 **Streaming-service sync** — connect Spotify, Deezer, SoundCloud, and
  YouTube Music while retaining unmatched local references.
- 🎛️ **More integrations** — AudioMuse-AI connectors and OpenSubsonic
  compatibility.
- 📦 **Production desktop releases** — installers, signing, automatic updates,
  and a bundled server.
