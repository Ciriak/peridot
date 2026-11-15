import assert from "node:assert/strict";
import test from "node:test";
import type { AlbumSummaryResponse, TrackResponse } from "@peridot/contracts";
import { artistLikeKey } from "../app/lib/library.ts";
import {
  selectHomeAlbumSuggestions,
  selectHomeTrackSuggestions,
} from "../app/lib/home-suggestions.ts";

function album(
  id: string,
  artist: string,
  options: { liked?: boolean; artists?: string[] } = {},
): AlbumSummaryResponse {
  return {
    id,
    title: id,
    artist,
    artists: options.artists ?? [artist],
    coverUrl: null,
    trackCount: 1,
    durationMs: 60_000,
    releaseYear: null,
    liked: options.liked ?? false,
  };
}

function track(
  id: string,
  artist: string,
  options: { liked?: boolean; artists?: string[] } = {},
): TrackResponse {
  return {
    id,
    title: id,
    artist,
    artists: options.artists ?? [artist],
    album: null,
    albumId: null,
    discNumber: null,
    trackNumber: null,
    durationMs: 60_000,
    mimeType: "audio/mpeg",
    available: true,
    coverUrl: null,
    metadata: null,
    liked: options.liked ?? false,
  };
}

test("home suggestions keep liked albums and tracks visible", () => {
  const likedArtistKeys = [
    artistLikeKey("Liked artist"),
    artistLikeKey("Other artist"),
  ];
  const albums = selectHomeAlbumSuggestions({
    albums: [
      album("liked-album", "Liked artist", { liked: true }),
      album("explicitly-liked-album", "Other artist"),
      album("fresh-album", "Fresh artist"),
    ],
    likedArtistKeys,
  });
  const tracks = selectHomeTrackSuggestions({
    tracks: [
      track("liked-track", "Liked artist", { liked: true }),
      track("explicitly-liked-track", "Other artist"),
      track("fresh-track", "Fresh artist"),
    ],
    likedArtistKeys,
  });

  assert.deepEqual(
    albums.map((candidate) => candidate.id),
    ["liked-album", "explicitly-liked-album", "fresh-album"],
  );
  assert.deepEqual(
    tracks.map((candidate) => candidate.id),
    ["liked-track", "explicitly-liked-track", "fresh-track"],
  );
});

test("home suggestions prioritize liked artists and stay bounded", () => {
  const likedArtistKeys = [
    artistLikeKey("Favorite artist"),
    artistLikeKey("Another favorite"),
  ];
  const albums = selectHomeAlbumSuggestions({
    albums: [
      album("alphabetical-first", "Someone else"),
      album("from-liked-artist", "Favorite artist"),
      album("also-from-liked-artist", "Another favorite", {
        artists: ["Another favorite", "Favorite artist"],
      }),
    ],
    likedArtistKeys,
    limit: 2,
  });
  const tracks = selectHomeTrackSuggestions({
    tracks: [
      track("alphabetical-first", "Someone else"),
      track("from-liked-artist", "Favorite artist"),
      track("also-from-liked-artist", "Another favorite", {
        artists: ["Another favorite", "Favorite artist"],
      }),
    ],
    likedArtistKeys,
    limit: 2,
  });

  assert.deepEqual(
    albums.map((candidate) => candidate.id),
    ["from-liked-artist", "also-from-liked-artist"],
  );
  assert.deepEqual(
    tracks.map((candidate) => candidate.id),
    ["from-liked-artist", "also-from-liked-artist"],
  );
});
