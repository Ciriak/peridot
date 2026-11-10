# Official plugins

MusicBrainz metadata matching is implemented as a core provider integration with
administrator-managed configuration, per-track provenance, and manual
corrections. Planned official connectors: Spotify, Deezer, SoundCloud, and
YouTube Music playlist sync; Discogs metadata; and an AudioMuse-AI connector.
Each will be an independently versioned package. No plugin loader is
implemented. Never load untrusted plugin code into the core server process.
