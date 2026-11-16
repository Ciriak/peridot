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

     watchtower:
       image: nickfedor/watchtower:1.24.0
       restart: unless-stopped
       command: >-
         --label-enable
         --http-api-endpoints update
         --cleanup
       depends_on:
         peridot:
           condition: service_healthy
       environment:
         WATCHTOWER_HTTP_API_TOKEN: /data/watchtower-token
       volumes:
         - peridot-data:/data:ro
         - /var/run/docker.sock:/var/run/docker.sock

   volumes:
     peridot-data:
   ```

   *Note: `master` and `dev` channels are also available*

2. **Start it**

   Run this from the folder with your Compose file.

   ```sh
   docker compose up -d
   ```

3. **Open Peridot**

   Go to **http://YOUR_SERVER_IP:17430** in your browser.

## Updates and database backups

Peridot checks the public GitHub repository automatically every six hours, but
server images are installed only when an administrator selects **Install
update** in Settings → Server. Browser, desktop, and Android web assets update
silently in the background without a GitHub sign-in.

Peridot applies committed database migrations automatically before the server
starts after an image update. When migrations are pending, it first writes a
consistent SQLite snapshot to the `backups` directory beside the database. The
container path is `/data/backups`, and the five newest snapshots are retained.

If a migration fails, Peridot does not start the server. Review the container
logs and keep the reported snapshot together with `peridot.db.key` or your
configured `PERIDOT_CREDENTIAL_KEY`; provider credentials in database snapshots
cannot be decrypted without the matching key. To roll back, stop the container,
restore the database snapshot and its key on the same `/data` volume, then run
the previous Peridot image.

## Features

- ### 🗂️ Local-first catalog
- ### 🛜 Offline play
- ### 🧩 Automatic metadata association


## 🚀 Coming soon

- ### 🔄 Playlists import
- ### ✨ AI suggestion *(But only if you want it !)*
