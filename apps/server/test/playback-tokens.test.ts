import assert from "node:assert/strict";
import test from "node:test";
import {
  PlaybackTokenService,
  redactPlaybackToken,
} from "../src/playback-tokens.js";

const secret = Buffer.alloc(32, 7);

test("playback tokens authorize only their track's audio stream", () => {
  const service = new PlaybackTokenService(secret);
  const issued = service.issue("track-1", 1_000);
  const token = issued.token;

  assert.equal(issued.expiresAt.getTime(), 1_000 + 4 * 60 * 60 * 1000);
  assert.equal(service.verify(token, "track-1", "audio", 1_001), true);
  assert.equal(service.verify(token, "track-2", "audio", 1_001), false);
  assert.equal(service.verify(token, "track-1", "cover", 1_001), false);
  assert.equal(
    service.authorizeRequest(
      "GET",
      `/api/tracks/track-1/audio?playbackToken=${encodeURIComponent(token)}`,
      1_001,
    ),
    true,
  );
  assert.equal(
    service.authorizeRequest(
      "POST",
      `/api/tracks/track-1/audio?playbackToken=${encodeURIComponent(token)}`,
      1_001,
    ),
    false,
  );
  assert.equal(
    service.authorizeRequest(
      "GET",
      `/api/tracks/track-2/audio?playbackToken=${encodeURIComponent(token)}`,
      1_001,
    ),
    false,
  );
});

test("playback tokens reject expiry, malformed values, and tampering", () => {
  const service = new PlaybackTokenService(secret);
  const issued = service.issue("track-1", 1_000);

  assert.equal(
    service.verify(
      issued.token,
      "track-1",
      "audio",
      1_000 + 4 * 60 * 60 * 1000,
    ),
    false,
  );
  assert.equal(service.verify("not-a-token", "track-1", "audio", 1_001), false);
  assert.equal(
    service.verify(`${issued.token}.extra`, "track-1", "audio", 1_001),
    false,
  );

  const [payload] = issued.token.split(".");
  assert.ok(payload);
  const tampered = `${payload}.${Buffer.alloc(32).toString("base64url")}`;
  assert.equal(service.verify(tampered, "track-1", "audio", 1_001), false);
});

test("cover tokens authorize only cover images for their track", () => {
  const service = new PlaybackTokenService(secret);
  const issued = service.issueCover("track-1", 1_000);

  assert.equal(
    service.authorizeRequest(
      "GET",
      `/api/tracks/track-1/cover?coverToken=${encodeURIComponent(issued.token)}`,
      1_001,
    ),
    true,
  );
  assert.equal(
    service.authorizeRequest(
      "GET",
      `/api/tracks/track-2/cover?coverToken=${encodeURIComponent(issued.token)}`,
      1_001,
    ),
    false,
  );
  assert.equal(
    service.authorizeRequest(
      "GET",
      `/api/tracks/track-1/audio?playbackToken=${encodeURIComponent(issued.token)}`,
      1_001,
    ),
    false,
  );
});

test("playback tokens are removed from request log URLs", () => {
  assert.equal(
    redactPlaybackToken(
      "/api/tracks/track-1/audio?playbackToken=secret-value&other=kept",
    ),
    "/api/tracks/track-1/audio?playbackToken=%5Bredacted%5D&other=kept",
  );
  assert.equal(
    redactPlaybackToken("/api/tracks/track-1/audio"),
    "/api/tracks/track-1/audio",
  );
  assert.equal(
    redactPlaybackToken(
      "/api/tracks/track-1/cover?coverToken=secret-value&other=kept",
    ),
    "/api/tracks/track-1/cover?coverToken=%5Bredacted%5D&other=kept",
  );
});
