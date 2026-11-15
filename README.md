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
   services:
     peridot:
       image: ghcr.io/ciriak/peridot:${PERIDOT_CHANNEL:-stable}
       restart: unless-stopped
       ports:
         - "${PERIDOT_API_PORT:-17430}:17430"
         - "${PERIDOT_WEB_PORT:-17431}:17431"
       volumes:
         - peridot-data:/data
         - ./music:/music:ro

     watchtower:
       image: nickfedor/watchtower:1.24.0
       restart: unless-stopped
       command: >-
         --label-enable
         --http-api-endpoints update
         --http-api-periodic-polls
         --cleanup
         --interval 21600
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

2. **Start it**

   Run this from the folder with your Compose file.

   ```sh
   docker compose up -d
   ```

3. **Open Peridot**

   Go to **http://YOUR_SERVER_IP:17431** in your browser.

## Features

- ### 🗂️ Local-first catalog
- ### 🛜 Offline play
- ### 🧩 Automatic metadata association


## 🚀 Coming soon

- ### 🔄 Playlists import
- ### ✨ AI suggestion *(But only if you want it !)*
