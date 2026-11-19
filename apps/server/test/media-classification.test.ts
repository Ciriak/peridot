import assert from "node:assert/strict";
import test from "node:test";
import { detectMediaType } from "../src/media-classification.js";

test("embedded podcast metadata is classified as a podcast", () => {
  assert.deepEqual(
    detectMediaType({
      podcast: true,
      podcastId: "show-id",
      podcastUrl: "https://example.test/feed.xml",
    }),
    { mediaType: "podcast", origin: "embedded" },
  );
});

test("audiobook file and release metadata is classified as an audiobook", () => {
  for (const input of [
    { extension: ".m4b" },
    { iTunesMediaType: 2 },
    { releaseTypes: ["Audiobook"] },
  ]) {
    assert.deepEqual(detectMediaType(input), {
      mediaType: "audiobook",
      origin: "embedded",
    });
  }
});

test("podcast evidence wins when other audiobook evidence is also present", () => {
  assert.deepEqual(
    detectMediaType({
      extension: ".m4b",
      releaseTypes: ["Audiobook"],
      podcast: true,
    }),
    { mediaType: "podcast", origin: "embedded" },
  );
});

test("unmatched tracks fall back to music", () => {
  assert.deepEqual(detectMediaType({ extension: ".mp3" }), {
    mediaType: "music",
    origin: "fallback",
  });
});
