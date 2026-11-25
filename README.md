<p align="center">
  <img
    src="packages/ui/src/assets/brand/logo-title.png"
    height="128"
    alt="Peridot app icon"
  />
</p>

<h3 align="center">Your self-hosted music platform</h3>

<p align="center">
  <strong>Peridot gives you total control over your music library.</strong><br />
  No ads. No paywall. You have control.
</p>

<img
  src="packages/ui/src/assets/ui-demo.png"
  width="800"
  alt="Peridot library interface"
/>

## Install with Docker

1. **Create a Compose file**

   Save this as `compose.yaml`.

   ```yaml
   name: peridot

   services:
     peridot:
       image: ghcr.io/ciriak/peridot:${PERIDOT_CHANNEL:-stable}
       restart: unless-stopped
       ports:
         - "17430:17430"
       volumes:
         - peridot-data:/data
         - ./music:/music:ro

   volumes:
     peridot-data:
   ```

   *Note: `beta` and `dev` channels are also available*

2. **Start it**

   Run this from the folder with your Compose file.

   ```sh
   docker compose up -d
   ```

3. **Open Peridot**

   Go to **http://YOUR_SERVER_IP:17430** in your browser.

## Updates and database backups

Peridot checks the public GitHub repository automatically every six hours.
Settings → Server shows when a newer image is available. To apply it, pull the
new image and recreate the container:

```sh
docker compose pull peridot
docker compose up -d peridot
```

Browser, desktop, and Android web assets update silently in the background
without a GitHub sign-in.

Peridot applies committed database migrations automatically before the server
starts after an image update. When migrations are pending, it first writes a
consistent SQLite snapshot to the `backups` directory beside the database. The
container path is `/data/backups`, and the three newest snapshots are retained.
Artwork is normalized separately into `/data/artwork` as deduplicated WebP
files, so migration snapshots contain only catalog metadata.

If a migration fails, Peridot does not start the server. Review the container
logs and keep the reported snapshot together with `peridot.db.key` or your
configured `PERIDOT_CREDENTIAL_KEY`; provider credentials in database snapshots
cannot be decrypted without the matching key. To roll back, stop the container,
restore the database snapshot and its key on the same `/data` volume, then run
the previous Peridot image.

This Media and Connectors refactor is a pre-release schema reset. Existing
Track/Source databases are not migrated. Back up the existing database, remove
it from `/data`, and restart Peridot to initialize the new schema. Peridot will
not delete or recreate an old database automatically.

Album covers and artist portraits are regenerated from their configured sources
after upgrading to the external artwork cache. To reclaim old SQLite BLOB pages
after a migration, stop the server and run:

```sh
docker compose stop peridot
docker compose run --rm --no-deps --entrypoint pnpm peridot db:vacuum
docker compose up -d peridot
```

The process requires free disk space at least 20% larger than the database.

## Features

- ### 🗂️ Local-first catalog
- ### 🛜 Offline play
- ### 🧩 Automatic metadata association


## 🚀 Coming soon

- ### 🔄 Playlists import
- ### ✨ AI suggestion *(But only if you want it !)*

## Concepts

### Files, Data & Hosting

Peridot do NOT host or download audio files by itself.

### Media

<u>A media is **NOT** a file</u>

Can be a music track, an audiobook or a podcast episode.

A media can have multiple files associated to it (If provided from multiple data-source for example), if a data source is unreachable, another data-source can be used as a backup.

### Library source

A reachable location that provide the raw audio files for medias

### Download client

An external client that can be used to download files, a BitTorrent client for example.

Download clients are **NOT** data source.

Each download client stores the library source where its completed files are imported. A client can be saved before its service is reachable; connection discovery and testing are optional.

### Metadata provider

An external metadata source that can provide additional data about a media (artists, albums, cover art...)

### Connectors

Various services that can be integrated into Peridot to provide additional fonctionnality (Torrent search, playlist sync...)

Connectors have explicit roles:

- **Library source**: provides playable files, such as a folder or Jellyfin.
- **Release indexer**: searches external releases, currently Torznab.
- **Download client**: transfers a selected release, currently qBittorrent.
- **Metadata provider**: enriches media with MusicBrainz or Discogs.
- **Playlist account**: links and synchronizes a remote playlist. The contract
  exists, but production playlist adapters are not included in this milestone.

The settings sidebar keeps these roles separate with direct Library sources,
Release indexers, Download clients, and Metadata providers destinations.
Torznab is not a library source, and qBittorrent is not a media library.

### Tasks

Internal tasks that are run by the Peridot instance, like media scanning, metadata sync...


