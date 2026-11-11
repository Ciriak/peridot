# Official plugins

MusicBrainz and Discogs metadata matching are implemented as trusted core
provider integrations behind a shared resolver registry. Providers have
declarative configuration, per-track provenance, encrypted credentials, and
provider-specific matching policies. Planned official connectors: Spotify,
Deezer, SoundCloud, and YouTube Music playlist sync, plus an AudioMuse-AI
connector.
Each will be an independently versioned package. No plugin loader is
implemented. Never load untrusted plugin code into the core server process.
