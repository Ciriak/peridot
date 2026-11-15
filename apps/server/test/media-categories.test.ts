import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type {
  AlbumListResponse,
  AudiobookListResponse,
  CreateSourceResponse,
  LikeListResponse,
  PodcastListResponse,
  TrackListResponse,
} from "@peridot/contracts";
import {
  createTaggedMp3,
  createTestContext,
  startScan,
  waitForTask,
} from "./helpers.js";

test("audiobook and podcast sources stay separate from music collections", async () => {
  const context = await createTestContext();
  try {
    await writeFile(
      path.join(context.libraryRoot, "music.mp3"),
      createTaggedMp3({
        title: "Music Track",
        artist: "Music Artist",
        albumArtist: "Music Artist",
        album: "Music Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await startScan(context);

    const booksRoot = path.join(context.root, "books", "Book One");
    await mkdir(booksRoot, { recursive: true });
    await writeFile(
      path.join(booksRoot, "01.mp3"),
      createTaggedMp3({
        title: "Chapter One",
        artist: "Author One",
        albumArtist: "Author One",
        album: "Book One",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(booksRoot, "02.mp3"),
      createTaggedMp3({
        title: "Chapter Two",
        artist: "Author One",
        albumArtist: "Author One",
        album: "Book One",
        discNumber: 1,
        trackNumber: 2,
      }),
    );

    const bookSourceResponse = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: booksRoot,
        mediaType: "audiobook",
      },
    });
    assert.equal(bookSourceResponse.statusCode, 201);
    const bookSource = bookSourceResponse.json<CreateSourceResponse>();
    assert.equal(bookSource.mediaType, "audiobook");
    assert.ok(bookSource.task);
    await waitForTask(context, bookSource.task.id);

    const showsRoot = path.join(context.root, "podcasts", "Show One");
    await mkdir(showsRoot, { recursive: true });
    await writeFile(
      path.join(showsRoot, "episode.mp3"),
      createTaggedMp3({
        title: "Newest Episode",
        artist: "Publisher One",
        albumArtist: "Publisher One",
        album: "Show One",
        date: "2026-11-15",
        discNumber: 1,
        trackNumber: 2,
      }),
    );
    await writeFile(
      path.join(showsRoot, "older.mp3"),
      createTaggedMp3({
        title: "Older Episode",
        artist: "Publisher One",
        albumArtist: "Publisher One",
        album: "Show One",
        date: "2025-01-01",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const podcastSourceResponse = await context.app.inject({
      method: "POST",
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: showsRoot,
        mediaType: "podcast",
      },
    });
    assert.equal(podcastSourceResponse.statusCode, 201);
    const podcastSource = podcastSourceResponse.json<CreateSourceResponse>();
    assert.ok(podcastSource.task);
    await waitForTask(context, podcastSource.task.id);

    const albumsResponse = await context.app.inject({
      method: "GET",
      url: "/api/albums",
      headers: context.authorization,
    });
    const albums = albumsResponse.json<AlbumListResponse>();
    assert.deepEqual(
      albums.items.map((album) => album.title),
      ["Music Album"],
    );

    const audiobooksResponse = await context.app.inject({
      method: "GET",
      url: "/api/audiobooks",
      headers: context.authorization,
    });
    const audiobooks = audiobooksResponse.json<AudiobookListResponse>();
    assert.equal(audiobooks.items.length, 1);
    const audiobook = audiobooks.items[0]!;
    assert.equal(audiobook.title, "Book One");
    assert.equal(audiobook.author, "Author One");
    assert.equal(audiobook.chapterCount, 2);
    const matchingAudiobooks = (
      await context.app.inject({
        method: "GET",
        url: "/api/audiobooks?query=author%20one",
        headers: context.authorization,
      })
    ).json<AudiobookListResponse>();
    assert.deepEqual(
      matchingAudiobooks.items.map((book) => book.title),
      ["Book One"],
    );

    const chaptersResponse = await context.app.inject({
      method: "GET",
      url: `/api/audiobooks/${audiobook.id}/chapters`,
      headers: context.authorization,
    });
    const chapters = chaptersResponse.json<TrackListResponse>();
    assert.deepEqual(
      chapters.items.map((track) => track.title),
      ["Chapter One", "Chapter Two"],
    );
    assert.ok(chapters.items.every((track) => track.mediaType === "audiobook"));

    const podcastsResponse = await context.app.inject({
      method: "GET",
      url: "/api/podcasts",
      headers: context.authorization,
    });
    const podcasts = podcastsResponse.json<PodcastListResponse>();
    assert.equal(podcasts.items.length, 1);
    const podcast = podcasts.items[0]!;
    assert.equal(podcast.title, "Show One");
    assert.equal(podcast.publisher, "Publisher One");
    assert.equal(podcast.episodeCount, 2);
    const matchingPodcasts = (
      await context.app.inject({
        method: "GET",
        url: "/api/podcasts?query=publisher%20one",
        headers: context.authorization,
      })
    ).json<PodcastListResponse>();
    assert.deepEqual(
      matchingPodcasts.items.map((show) => show.title),
      ["Show One"],
    );

    const episodesResponse = await context.app.inject({
      method: "GET",
      url: `/api/podcasts/${podcast.id}/episodes`,
      headers: context.authorization,
    });
    const episodes = episodesResponse.json<TrackListResponse>();
    assert.deepEqual(
      episodes.items.map((track) => track.title),
      ["Newest Episode", "Older Episode"],
    );

    for (const target of [
      {
        kind: "audiobook",
        audiobookId: audiobook.id,
        title: audiobook.title,
        author: audiobook.author,
      },
      {
        kind: "podcast",
        podcastId: podcast.id,
        title: podcast.title,
        publisher: podcast.publisher,
      },
    ]) {
      const likeResponse = await context.app.inject({
        method: "POST",
        url: "/api/likes",
        headers: context.authorization,
        payload: target,
      });
      assert.equal(likeResponse.statusCode, 200);
    }
    const likesResponse = await context.app.inject({
      method: "GET",
      url: "/api/likes",
      headers: context.authorization,
    });
    const likes = likesResponse.json<LikeListResponse>();
    assert.equal(likes.audiobooks[0]?.title, "Book One");
    assert.equal(likes.podcasts[0]?.title, "Show One");

    const updateResponse = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/sources/${bookSource.id}`,
      headers: context.authorization,
      payload: { mediaType: "music" },
    });
    assert.equal(updateResponse.statusCode, 200);
    const updated = updateResponse.json<CreateSourceResponse>();
    assert.ok(updated.task);
    await waitForTask(context, updated.task.id);

    const reclassifiedAlbums = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums?query=Book%20One",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.equal(reclassifiedAlbums.items[0]?.title, "Book One");
    const remainingAudiobooks = (
      await context.app.inject({
        method: "GET",
        url: "/api/audiobooks",
        headers: context.authorization,
      })
    ).json<AudiobookListResponse>();
    assert.equal(remainingAudiobooks.items.length, 0);
  } finally {
    await context.close();
  }
});

test("source media type validation rejects unsupported values", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.Source.first({
      kind: "path",
    });
    assert.ok(source);
    const response = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/sources/${source.id}`,
      headers: context.authorization,
      payload: { mediaType: "radio" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.json<{ error: { code: string } }>().error.code,
      "invalid_source",
    );
  } finally {
    await context.close();
  }
});
