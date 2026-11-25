import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverAudioFileBatches } from "../src/library-scanner.js";
import { ScanWorkerPool } from "../src/scan-worker-pool.js";
import { createWav } from "./helpers.js";

test("scan workers discover directories and parse local metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-scan-workers-"));
  const nested = path.join(root, "Artist", "Album");
  const trackPath = path.join(nested, "track.wav");
  const pool = new ScanWorkerPool(2);
  try {
    await mkdir(nested, { recursive: true });
    await writeFile(trackPath, createWav(250));

    const rootListing = await pool.listDirectory(root);
    assert.deepEqual(rootListing.directories, [path.join(root, "Artist")]);
    assert.deepEqual(rootListing.audioFiles, []);

    const albumListing = await pool.listDirectory(nested);
    assert.deepEqual(albumListing.directories, []);
    assert.equal(albumListing.audioFiles.length, 1);
    assert.equal(albumListing.audioFiles[0]?.absolutePath, trackPath);
    assert.equal(albumListing.audioFiles[0]?.mimeType, "audio/wav");

    const metadata = await pool.parseFile(trackPath);
    assert.equal(metadata.container, "WAVE");
    assert.ok((metadata.durationSeconds ?? 0) >= 0.2);
    assert.equal(metadata.title, null);
  } finally {
    await pool.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("closing a scan worker pool rejects active and future work", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "peridot-scan-workers-"));
  const trackPath = path.join(root, "track.wav");
  const pool = new ScanWorkerPool(1);
  try {
    await writeFile(trackPath, createWav(250));
    const pending = pool.parseFile(trackPath);
    const closing = pool.close();
    await assert.rejects(pending, { name: "AbortError" });
    await closing;
    await assert.rejects(pool.listDirectory(root), { name: "AbortError" });
  } finally {
    await pool.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("folder discovery yields a bounded batch before later directories finish", async () => {
  const root = path.resolve("streamed-library");
  const later = path.join(root, "later");
  let releaseLater!: () => void;
  const laterReady = new Promise<void>((resolve) => {
    releaseLater = resolve;
  });
  let laterRequested = false;
  const audioFiles = Array.from({ length: 500 }, (_, index) => ({
    absolutePath: path.join(root, `${index}.mp3`),
    mimeType: "audio/mpeg",
    size: "10",
    modifiedAtMs: 1,
  }));
  const workerPool = {
    async listDirectory(directory: string) {
      if (directory === root) {
        return {
          directories: [later],
          audioFiles,
        };
      }
      laterRequested = true;
      await laterReady;
      return {
        directories: [],
        audioFiles: [
          {
            absolutePath: path.join(later, "last.mp3"),
            mimeType: "audio/mpeg",
            size: "10",
            modifiedAtMs: 1,
          },
        ],
      };
    },
  } as unknown as ScanWorkerPool;
  const iterator = discoverAudioFileBatches(
    root,
    workerPool,
    1,
    new AbortController().signal,
  );

  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value.length, 500);
  assert.equal(laterRequested, false);

  const next = iterator.next();
  const requestedAt = Date.now();
  while (!laterRequested && Date.now() - requestedAt < 2_000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(laterRequested, true);
  releaseLater();
  const second = await next;
  assert.equal(second.done, false);
  assert.equal(second.value.length, 1);
  assert.equal(second.value[0]?.absolutePath, path.join(later, "last.mp3"));
  assert.equal((await iterator.next()).done, true);
});
