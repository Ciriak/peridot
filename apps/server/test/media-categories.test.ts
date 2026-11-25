import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type {
  AlbumListResponse,
  AudiobookListResponse,
  CreateLibrarySourceResponse,
  LikeListResponse,
  PodcastListResponse,
  MediaListResponse,
} from "@peridot/contracts";
import {
  createTaggedMp3,
  createTestContext,
  createWav,
  startScan,
  waitForTask,
  waitForScan,
} from "./helpers.js";

test("one automatic source separates mixed music, audiobooks, and podcasts", async () => {
  const context = await createTestContext();
  const mixedRoot = path.join(context.root, "mixed-library");
  try {
    await mkdir(path.join(mixedRoot, "Book One"), { recursive: true });
    await mkdir(path.join(mixedRoot, "Show One"), { recursive: true });
    await writeFile(
      path.join(mixedRoot, "music.mp3"),
      createTaggedMp3({
        title: "Music Track",
        artist: "Music Artist",
        album: "Music Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(mixedRoot, "Book One", "chapter.mp3"),
      createTaggedMp3({
        title: "Chapter One",
        artist: "Book Author",
        album: "Book One",
        releaseTypes: ["Audiobook"],
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(
      path.join(mixedRoot, "Show One", "episode.mp3"),
      createTaggedMp3({
        title: "Episode One",
        artist: "Show Publisher",
        album: "Show One",
        podcast: true,
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await writeFile(path.join(mixedRoot, "untagged.wav"), createWav());

    const response = await context.app.inject({
      method: "POST",
      url: "/api/admin/library-sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: mixedRoot,
        classificationMode: "fixed",
        fixedMediaType: "music",
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    const source = response.json<CreateLibrarySourceResponse>();
    assert.ok(source.task);
    await waitForTask(context, source.task.id);

    const tracks = await context.database.orm.Media.all();
    const byTitle = new Map(tracks.map((track) => [track.title, track]));
    assert.equal(byTitle.get("Music Track")?.mediaType, "music");
    assert.equal(byTitle.get("Chapter One")?.mediaType, "audiobook");
    assert.equal(byTitle.get("Chapter One")?.mediaTypeOrigin, "embedded");
    assert.equal(byTitle.get("Episode One")?.mediaType, "podcast");
    assert.equal(byTitle.get("Episode One")?.mediaTypeOrigin, "embedded");
    assert.equal(byTitle.get("untagged")?.mediaType, "music");
    assert.equal(byTitle.get("untagged")?.mediaTypeOrigin, "fallback");

    const audiobooks = (
      await context.app.inject({
        method: "GET",
        url: "/api/audiobooks",
        headers: context.authorization,
      })
    ).json<AudiobookListResponse>();
    assert.deepEqual(
      audiobooks.items.map((book) => book.title),
      ["Book One"],
    );
    const podcasts = (
      await context.app.inject({
        method: "GET",
        url: "/api/podcasts",
        headers: context.authorization,
      })
    ).json<PodcastListResponse>();
    assert.deepEqual(
      podcasts.items.map((show) => show.title),
      ["Show One"],
    );
  } finally {
    await context.close();
  }
});

test("automatic detection keeps books and shows separate from music", async () => {
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
        releaseTypes: ["Audiobook"],
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
        releaseTypes: ["Audiobook"],
        discNumber: 1,
        trackNumber: 2,
      }),
    );

    const bookSourceResponse = await context.app.inject({
      method: "POST",
      url: "/api/admin/library-sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: booksRoot,
      },
    });
    assert.equal(bookSourceResponse.statusCode, 201);
    const bookSource = bookSourceResponse.json<CreateLibrarySourceResponse>();
    assert.ok(bookSource.task);
    await waitForScan(context, bookSource.task.id);

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
        podcast: true,
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
        podcast: true,
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    const podcastSourceResponse = await context.app.inject({
      method: "POST",
      url: "/api/admin/library-sources",
      headers: context.authorization,
      payload: {
        kind: "path",
        path: showsRoot,
      },
    });
    assert.equal(podcastSourceResponse.statusCode, 201);
    const podcastSource =
      podcastSourceResponse.json<CreateLibrarySourceResponse>();
    assert.ok(podcastSource.task);
    await waitForScan(context, podcastSource.task.id);

    const albumsResponse = await context.app.inject({
      method: "GET",
      url: "/api/albums",
      headers: context.authorization,
    });
    const albums = albumsResponse.json<AlbumListResponse>();
    assert.equal(albums.totalCount, 1);
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
    assert.equal(audiobooks.totalCount, 1);
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
    assert.equal(matchingAudiobooks.totalCount, 1);
    assert.deepEqual(
      matchingAudiobooks.items.map((book) => book.title),
      ["Book One"],
    );

    const chaptersResponse = await context.app.inject({
      method: "GET",
      url: `/api/audiobooks/${audiobook.id}/chapters`,
      headers: context.authorization,
    });
    const chapters = chaptersResponse.json<MediaListResponse>();
    assert.equal(chapters.totalCount, 2);
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
    assert.equal(podcasts.totalCount, 1);
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
    assert.equal(matchingPodcasts.totalCount, 1);
    assert.deepEqual(
      matchingPodcasts.items.map((show) => show.title),
      ["Show One"],
    );

    const episodesResponse = await context.app.inject({
      method: "GET",
      url: `/api/podcasts/${podcast.id}/episodes`,
      headers: context.authorization,
    });
    const episodes = episodesResponse.json<MediaListResponse>();
    assert.equal(episodes.totalCount, 2);
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
  } finally {
    await context.close();
  }
});

test("media classification mutation routes are not exposed", async () => {
  const context = await createTestContext();
  try {
    const source = await context.database.orm.LibrarySource.firstOrThrow();
    const sourceUpdate = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/library-sources/${source.id}`,
      headers: context.authorization,
      payload: { classificationMode: "fixed", fixedMediaType: "audiobook" },
    });
    assert.equal(sourceUpdate.statusCode, 404);

    const trackUpdate = await context.app.inject({
      method: "PUT",
      url: "/api/admin/tracks/any-id/media-type",
      headers: context.authorization,
      payload: { mediaType: "podcast" },
    });
    assert.equal(trackUpdate.statusCode, 404);

    const collectionUpdate = await context.app.inject({
      method: "PUT",
      url: "/api/admin/media-collections/any-id/media-type",
      headers: context.authorization,
      payload: { mediaType: "audiobook" },
    });
    assert.equal(collectionUpdate.statusCode, 404);
  } finally {
    await context.close();
  }
});
