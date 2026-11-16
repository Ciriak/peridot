import assert from "node:assert/strict";
import test from "node:test";
import {
  detectMediaType,
  effectiveMediaType,
} from "../src/media-classification.js";

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

test("Jellyfin item and library metadata is classified with Jellyfin provenance", () => {
  assert.deepEqual(detectMediaType({ jellyfinItemType: "AudioBook" }), {
    mediaType: "audiobook",
    origin: "jellyfin",
  });
  assert.deepEqual(
    detectMediaType({ jellyfinLibraryCollectionType: "books" }),
    { mediaType: "audiobook", origin: "jellyfin" },
  );
  assert.deepEqual(detectMediaType({ jellyfinTags: ["Podcast"] }), {
    mediaType: "podcast",
    origin: "jellyfin",
  });
});

test("podcast evidence wins when other audiobook evidence is also present", () => {
  assert.deepEqual(
    detectMediaType({
      extension: ".m4b",
      jellyfinLibraryCollectionType: "books",
      jellyfinTags: ["podcast"],
    }),
    { mediaType: "podcast", origin: "jellyfin" },
  );
});

test("unmatched tracks fall back to music", () => {
  assert.deepEqual(detectMediaType({ extension: ".mp3" }), {
    mediaType: "music",
    origin: "fallback",
  });
});

test("manual override wins over a fixed source and detected type", () => {
  const detected = {
    mediaType: "audiobook" as const,
    origin: "embedded" as const,
  };
  assert.deepEqual(
    effectiveMediaType(detected, {
      override: "podcast",
      classificationMode: "fixed",
      fixedMediaType: "music",
    }),
    { mediaType: "podcast", origin: "manual" },
  );
  assert.deepEqual(
    effectiveMediaType(detected, {
      override: null,
      classificationMode: "fixed",
      fixedMediaType: "music",
    }),
    { mediaType: "music", origin: "source" },
  );
  assert.deepEqual(
    effectiveMediaType(detected, {
      override: null,
      classificationMode: "auto",
      fixedMediaType: null,
    }),
    detected,
  );
});
