import assert from "node:assert/strict";
import { test } from "node:test";
import type { MetadataProviderContext } from "../src/metadata-resolver.js";
import { MusicBrainzClient } from "../src/musicbrainz.js";

const provider: MetadataProviderContext = {
  id: "provider-1",
  kind: "musicbrainz",
  name: "MusicBrainz",
  configuration: { contact: "owner@example.com" },
  credential: null,
};

test("MusicBrainz client uses the official origin, contact User-Agent, and request spacing", async () => {
  const requests: URL[] = [];
  const delays: number[] = [];
  const client = new MusicBrainzClient({
    requestIntervalMs: 1_000,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetch: async (input, init) => {
      requests.push(new URL(String(input)));
      assert.equal(
        new Headers(init?.headers).get("User-Agent"),
        "Peridot/0.1.0 (owner@example.com)",
      );
      if (new URL(String(input)).pathname.endsWith("/release")) {
        return Response.json({
          releases: [
            {
              id: "release-1",
              title: "Night Sessions",
              "artist-credit": [
                {
                  name: "Elliot Lake",
                  artist: { name: "Elliot Lake" },
                },
              ],
            },
          ],
        });
      }
      return Response.json({
        id: "release-1",
        title: "Night Sessions",
        media: [
          {
            position: 1,
            tracks: [
              {
                position: 1,
                recording: {
                  id: "recording-1",
                  title: "Blue Hours",
                  length: 125000,
                  "artist-credit": [
                    {
                      name: "Elliot Lake",
                      artist: { name: "Elliot Lake" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
    },
  });

  const matches = await client.findAlbumMatches(provider, "owner@example.com", [
    {
      id: "track-1",
      title: "Blue Hours",
      artist: "Elliot Lake",
      album: "Night Sessions",
      discNumber: 1,
      trackNumber: 1,
      durationMs: 125000,
    },
  ]);

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.origin, "https://musicbrainz.org");
    assert.equal(request.searchParams.get("fmt"), "json");
  }
  assert.ok(delays.length >= 1);
  assert.ok(delays[0]! > 0);
  assert.equal(matches.get("track-1")?.[0]?.externalTrackId, "recording-1");
  assert.equal(matches.get("track-1")?.[0]?.trackNumber, 1);
  assert.deepEqual(matches.get("track-1")?.[0]?.albumArtists, ["Elliot Lake"]);
});

test("MusicBrainz client retries rate limits before succeeding", async () => {
  let attempts = 0;
  const client = new MusicBrainzClient({
    requestIntervalMs: 0,
    sleep: async () => undefined,
    fetch: async () => {
      attempts += 1;
      if (attempts < 2) {
        return new Response("busy", {
          status: 503,
          headers: { "Retry-After": "1" },
        });
      }
      return Response.json({ recordings: [] });
    },
  });

  const items = await client.findCandidates(provider, "owner@example.com", {
    id: "track-1",
    title: "Blue Hours",
    artist: "Elliot Lake",
    album: null,
    discNumber: null,
    trackNumber: null,
    durationMs: 125000,
  });
  assert.deepEqual(items, []);
  assert.equal(attempts, 2);
});

test("MusicBrainz finds and resolves exact artist identities", async () => {
  const requests: URL[] = [];
  const client = new MusicBrainzClient({
    requestIntervalMs: 0,
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/ws/2/artist/artist-1")) {
        return Response.json({
          id: "artist-1",
          name: "Elliot Lake",
          disambiguation: "electronic musician",
          score: 100,
        });
      }
      return Response.json({
        artists: [
          {
            id: "artist-1",
            name: "Elliot Lake",
            disambiguation: "electronic musician",
            score: 100,
          },
          {
            id: "artist-2",
            name: "Elliot Lake",
            disambiguation: "session group",
            score: 95,
          },
        ],
      });
    },
  });

  const candidates = await client.findArtistCandidates(
    provider,
    "owner@example.com",
    "Elliot Lake",
  );
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.externalArtistId, "artist-1");
  assert.equal(candidates[0]?.portraitAvailable, false);
  assert.equal(candidates[0]?.imageUrl, null);
  assert.equal(
    candidates[0]?.sourceUrl,
    "https://musicbrainz.org/artist/artist-1",
  );

  const resolved = await client.resolveArtistCandidate(
    provider,
    "owner@example.com",
    "artist-1",
  );
  assert.equal(resolved?.name, "Elliot Lake");
  assert.equal(resolved?.disambiguation, "electronic musician");
  assert.equal(requests.at(-1)?.searchParams.get("fmt"), "json");
});
