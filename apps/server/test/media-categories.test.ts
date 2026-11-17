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
  createMemberSession,
  createTestContext,
  createWav,
  startScan,
  waitForTask,
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
      url: "/api/admin/sources",
      headers: context.authorization,
      payload: { kind: "path", path: mixedRoot },
    });
    assert.equal(response.statusCode, 201, response.body);
    const source = response.json<CreateSourceResponse>();
    assert.equal(source.classificationMode, "auto");
    assert.equal(source.fixedMediaType, null);
    assert.ok(source.task);
    await waitForTask(context, source.task.id);

    const tracks = await context.database.orm.Track.all();
    const byTitle = new Map(tracks.map((track) => [track.title, track]));
    assert.equal(byTitle.get("Music Track")?.mediaType, "music");
    assert.equal(byTitle.get("Chapter One")?.mediaType, "audiobook");
    assert.equal(
      byTitle.get("Chapter One")?.detectedMediaTypeOrigin,
      "embedded",
    );
    assert.equal(byTitle.get("Episode One")?.mediaType, "podcast");
    assert.equal(
      byTitle.get("Episode One")?.detectedMediaTypeOrigin,
      "embedded",
    );
    assert.equal(byTitle.get("untagged")?.mediaType, "music");
    assert.equal(byTitle.get("untagged")?.mediaTypeOrigin, "fallback");
    assert.equal(byTitle.get("untagged")?.detectedMediaTypeOrigin, "fallback");

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
        classificationMode: "fixed",
        fixedMediaType: "audiobook",
      },
    });
    assert.equal(bookSourceResponse.statusCode, 201);
    const bookSource = bookSourceResponse.json<CreateSourceResponse>();
    assert.equal(bookSource.classificationMode, "fixed");
    assert.equal(bookSource.fixedMediaType, "audiobook");
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
        classificationMode: "fixed",
        fixedMediaType: "podcast",
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
    const chapters = chaptersResponse.json<TrackListResponse>();
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
    const episodes = episodesResponse.json<TrackListResponse>();
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

    const updateResponse = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/sources/${bookSource.id}`,
      headers: context.authorization,
      payload: { classificationMode: "fixed", fixedMediaType: "music" },
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
      payload: { classificationMode: "fixed", fixedMediaType: "radio" },
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

test("administrators can correct track and collection media types", async () => {
  const context = await createTestContext();
  try {
    await writeFile(
      path.join(context.libraryRoot, "correction.mp3"),
      createTaggedMp3({
        title: "Correction Track",
        artist: "Correction Creator",
        albumArtist: "Correction Creator",
        album: "Correction Album",
        discNumber: 1,
        trackNumber: 1,
      }),
    );
    await startScan(context);
    const track = await context.database.orm.Track.firstOrThrow();
    const albums = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    const collectionId = albums.items[0]?.id;
    assert.ok(collectionId);

    const member = await createMemberSession(context);
    const forbidden = await context.app.inject({
      method: "PUT",
      url: `/api/admin/tracks/${track.id}/media-type`,
      headers: { authorization: member.authorization },
      payload: { mediaType: "podcast" },
    });
    assert.equal(forbidden.statusCode, 403);

    const trackUpdate = await context.app.inject({
      method: "PUT",
      url: `/api/admin/tracks/${track.id}/media-type`,
      headers: context.authorization,
      payload: { mediaType: "podcast" },
    });
    assert.equal(trackUpdate.statusCode, 204, trackUpdate.body);
    let corrected = await context.database.orm.Track.firstOrThrow({
      id: track.id,
    });
    assert.equal(corrected.mediaType, "podcast");
    assert.equal(corrected.mediaTypeOrigin, "manual");
    assert.equal(corrected.mediaTypeOverride, "podcast");

    const trackReset = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/tracks/${track.id}/media-type`,
      headers: context.authorization,
    });
    assert.equal(trackReset.statusCode, 204);
    corrected = await context.database.orm.Track.firstOrThrow({ id: track.id });
    assert.equal(corrected.mediaType, "music");
    assert.equal(corrected.mediaTypeOrigin, "fallback");
    assert.equal(corrected.mediaTypeOverride, null);

    const collectionUpdate = await context.app.inject({
      method: "PUT",
      url: `/api/admin/media-collections/${collectionId}/media-type`,
      headers: context.authorization,
      payload: { mediaType: "audiobook" },
    });
    assert.equal(collectionUpdate.statusCode, 204, collectionUpdate.body);
    const audiobooks = (
      await context.app.inject({
        method: "GET",
        url: "/api/audiobooks",
        headers: context.authorization,
      })
    ).json<AudiobookListResponse>();
    assert.deepEqual(
      audiobooks.items.map((book) => book.title),
      ["Correction Album"],
    );
    const audiobookId = audiobooks.items[0]?.id;
    assert.ok(audiobookId);

    const collectionReset = await context.app.inject({
      method: "DELETE",
      url: `/api/admin/media-collections/${audiobookId}/media-type`,
      headers: context.authorization,
    });
    assert.equal(collectionReset.statusCode, 204);
    const albumsAfterReset = (
      await context.app.inject({
        method: "GET",
        url: "/api/albums",
        headers: context.authorization,
      })
    ).json<AlbumListResponse>();
    assert.deepEqual(
      albumsAfterReset.items.map((album) => album.title),
      ["Correction Album"],
    );

    const source = await context.database.orm.Source.firstOrThrow({
      id: track.sourceId!,
    });
    const fixedResponse = await context.app.inject({
      method: "PATCH",
      url: `/api/admin/sources/${source.id}`,
      headers: context.authorization,
      payload: { classificationMode: "fixed", fixedMediaType: "audiobook" },
    });
    assert.equal(fixedResponse.statusCode, 200);
    const fixedSource = fixedResponse.json<CreateSourceResponse>();
    assert.ok(fixedSource.task);
    await waitForTask(context, fixedSource.task.id);
    corrected = await context.database.orm.Track.firstOrThrow({ id: track.id });
    assert.equal(corrected.mediaType, "audiobook");
    assert.equal(corrected.mediaTypeOrigin, "source");

    const manualResponse = await context.app.inject({
      method: "PUT",
      url: `/api/admin/tracks/${track.id}/media-type`,
      headers: context.authorization,
      payload: { mediaType: "podcast" },
    });
    assert.equal(manualResponse.statusCode, 204);
    const rescanResponse = await context.app.inject({
      method: "POST",
      url: `/api/admin/sources/${source.id}/scans`,
      headers: context.authorization,
    });
    assert.equal(rescanResponse.statusCode, 202);
    await waitForTask(context, rescanResponse.json<{ id: string }>().id);
    corrected = await context.database.orm.Track.firstOrThrow({ id: track.id });
    assert.equal(corrected.mediaType, "podcast");
    assert.equal(corrected.mediaTypeOrigin, "manual");
  } finally {
    await context.close();
  }
});
