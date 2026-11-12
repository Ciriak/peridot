import assert from "node:assert/strict";
import { test } from "node:test";
import { DiscogsClient, DiscogsResolver } from "../src/discogs.js";
import type { MetadataProviderContext } from "../src/metadata-resolver.js";

const provider: MetadataProviderContext = {
  id: "provider-discogs",
  kind: "discogs",
  name: "Discogs",
  configuration: {},
  credential: "discogs-secret-token",
};

function release(id: number, position: string, title = "Blue Hours") {
  return {
    id,
    title: "Night Sessions",
    year: 1999,
    country: "UK",
    labels: [{ name: "Night Records", catno: `NIGHT-${id}` }],
    formats: [{ name: "Vinyl", descriptions: ["LP", "Album"] }],
    artists: [{ name: "Elliot Lake" }],
    tracklist: [
      {
        position,
        type_: "heading",
        title: "Side A",
      },
      {
        position,
        type_: "track",
        title,
        duration: "2:05",
      },
    ],
  };
}

test("Discogs validates identity, preserves details, caches releases, and spaces requests", async () => {
  const requests: Array<{ url: URL; authorization: string | null }> = [];
  const delays: number[] = [];
  const client = new DiscogsClient({
    requestIntervalMs: 1_000,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({
        url,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      if (url.pathname.endsWith("/oauth/identity")) {
        return Response.json({ username: "peridot-owner" });
      }
      if (url.pathname.endsWith("/database/search")) {
        return Response.json({ results: [{ id: 101 }, { id: 102 }] });
      }
      if (url.pathname.endsWith("/releases/101")) {
        return Response.json(release(101, "A1"));
      }
      if (url.pathname.endsWith("/releases/102")) {
        return Response.json(release(102, "B2"));
      }
      return new Response("not found", { status: 404 });
    },
  });

  assert.deepEqual(await client.identity("discogs-secret-token"), {
    username: "peridot-owner",
  });

  const target = {
    id: "track-1",
    title: "Blue Hours",
    artist: "Elliot Lake",
    album: "Night Sessions",
    discNumber: 1,
    trackNumber: 1,
    durationMs: 125_000,
  };
  const resolver = new DiscogsResolver(client);
  const first = await resolver.findCandidates(provider, target);
  const second = await resolver.findCandidates(provider, target);

  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.equal(first[0]?.trackNumber, 1);
  assert.equal(
    first[0]?.details.find((detail) => detail.key === "trackPosition")?.value,
    "A1",
  );
  assert.equal(
    first[0]?.details.find((detail) => detail.key === "catalogNumber")?.value,
    "NIGHT-101",
  );
  assert.equal(
    requests.filter((request) => request.url.pathname.includes("/releases/"))
      .length,
    2,
  );
  assert.ok(delays.some((delay) => delay > 0));
  for (const request of requests) {
    assert.equal(request.url.origin, "https://api.discogs.com");
    assert.equal(request.authorization, "Discogs token=discogs-secret-token");
    assert.doesNotMatch(request.url.toString(), /discogs-secret-token/);
  }

  assert.equal(resolver.automaticMatch(target, first).status, "ambiguous");
});

test("Discogs retries rate-limit responses and rejects invalid tokens", async () => {
  let attempts = 0;
  const retrying = new DiscogsClient({
    requestIntervalMs: 0,
    sleep: async () => undefined,
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("busy", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return Response.json({ username: "retry-owner" });
    },
  });
  assert.deepEqual(await retrying.identity("valid-token"), {
    username: "retry-owner",
  });
  assert.equal(attempts, 2);

  const rejected = new DiscogsClient({
    requestIntervalMs: 0,
    fetch: async () => new Response("unauthorized", { status: 401 }),
  });
  await assert.rejects(() => rejected.identity("bad-token"), /rejected/);
});

test("Discogs finds artist profiles and exposes a safe portrait URL", async () => {
  const requests: URL[] = [];
  const image = "https://i.discogs.com/artist-primary.jpg";
  const client = new DiscogsClient({
    requestIntervalMs: 0,
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/database/search")) {
        assert.equal(url.searchParams.get("type"), "artist");
        return Response.json({ results: [{ id: 501 }] });
      }
      if (url.pathname.endsWith("/artists/501")) {
        return Response.json({
          id: 501,
          name: "Elliot Lake",
          images: [
            {
              type: "primary",
              uri: image,
              uri150: "http://insecure.example/image.jpg",
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const candidates = await client.findArtistCandidates(
    provider,
    "discogs-secret-token",
    "Elliot Lake",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.externalArtistId, "501");
  assert.equal(candidates[0]?.portraitAvailable, true);
  assert.equal(candidates[0]?.imageUrl, image);
  assert.equal(candidates[0]?.sourceUrl, "https://www.discogs.com/artist/501");

  const resolved = await client.resolveArtistCandidate(
    provider,
    "discogs-secret-token",
    "501",
  );
  assert.equal(resolved?.name, "Elliot Lake");
  assert.equal(
    requests.filter((url) => url.pathname === "/artists/501").length,
    1,
  );
});
