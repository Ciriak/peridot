# Infrastructure

Self-hosted deployment configuration lives here. The root `Dockerfile` builds
the contracts, server, and static web application into one Node image.
`compose.yaml` runs the API on port 17430 and the embedded web listener on port
17431, persists application data in `./data`, and mounts `./music` read-only.
The root README documents installation and production-channel defaults.

No Peridot-operated API or credential proxy is required.
