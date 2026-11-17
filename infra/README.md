# Infrastructure

Self-hosted deployment configuration lives here. The root `Dockerfile` builds
the contracts, server, and static web application into one Node image.
`compose.yaml` serves the web application on port 80 and the API on port 17430,
persists application data in the `peridot-data` Docker volume, and mounts
`./music` read-only.
The root README documents installation and production-channel defaults.

No Peridot-operated API or credential proxy is required.
