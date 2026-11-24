import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { sqliteFilePath, type Database } from "./database.js";
import type {
  ArtworkTransformRequest,
  ArtworkTransformResponse,
  ArtworkTransformResult,
} from "./artwork-worker-protocol.js";

export const ARTWORK_MIME_TYPE = "image/webp";

const ARTWORK_HASH = /^[a-f0-9]{64}$/;

interface PendingTransform {
  data: Uint8Array;
  id: number;
  reject(error: Error): void;
  resolve(result: ArtworkTransformResult): void;
}

function abortError(): Error {
  return new Error("The artwork worker has stopped.");
}

function workerUrl(): URL {
  const sourcePath = fileURLToPath(import.meta.url);
  return new URL(
    sourcePath.endsWith(".ts") ? "./artwork-worker.ts" : "./artwork-worker.js",
    import.meta.url,
  );
}

export function artworkCacheDirectory(databaseUrl: string): string {
  return path.join(path.dirname(sqliteFilePath(databaseUrl)), "artwork");
}

export async function pruneReferencedArtwork(
  database: Database,
  cache: ArtworkCache,
): Promise<number> {
  const [covers, portraits] = await Promise.all([
    database.orm.Cover.select("hash").all(),
    database.orm.ArtistImage.select("hash").all(),
  ]);
  return cache.prune(
    new Set([...covers, ...portraits].map((artwork) => artwork.hash)),
  );
}

export class ArtworkCache {
  private active: PendingTransform | null = null;
  private readonly directory: string;
  private readonly queue: PendingTransform[] = [];
  private worker: Worker | null = null;
  private nextId = 1;
  private closed = false;
  private directoryReady: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.directory = artworkCacheDirectory(databaseUrl);
  }

  async store(data: Uint8Array): Promise<string> {
    const result = await this.transform(data);
    const hash = createHash("sha256").update(result.data).digest("hex");
    await this.write(hash, result.data);
    return hash;
  }

  async read(hash: string): Promise<{ path: string; size: number } | null> {
    if (!ARTWORK_HASH.test(hash)) return null;
    const filePath = this.filePath(hash);
    try {
      const file = await stat(filePath);
      return file.isFile() ? { path: filePath, size: file.size } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async prune(referencedHashes: ReadonlySet<string>): Promise<number> {
    await this.ensureDirectory();
    let removed = 0;
    for (const entry of await readdir(this.directory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
      const hash = entry.name.slice(0, -".webp".length);
      if (!ARTWORK_HASH.test(hash) || referencedHashes.has(hash)) continue;
      await rm(path.join(this.directory, entry.name), { force: true });
      removed += 1;
    }
    return removed;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const error = abortError();
    this.active?.reject(error);
    this.active = null;
    for (const pending of this.queue.splice(0)) pending.reject(error);
    const worker = this.worker;
    this.worker = null;
    await worker?.terminate();
  }

  private transform(data: Uint8Array): Promise<ArtworkTransformResult> {
    if (this.closed) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      this.queue.push({
        data,
        id: this.nextId++,
        reject,
        resolve,
      });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.closed || this.active) return;
    const pending = this.queue.shift();
    if (!pending) return;
    this.active = pending;
    const worker = this.ensureWorker();
    worker.postMessage({
      data: pending.data,
      id: pending.id,
    } satisfies ArtworkTransformRequest);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const source = fileURLToPath(import.meta.url).endsWith(".ts");
    const worker = new Worker(workerUrl(), {
      execArgv: source ? ["--import", "tsx"] : [],
    });
    worker.on("message", (response: ArtworkTransformResponse) => {
      const pending = this.active;
      if (!pending || pending.id !== response.id) return;
      this.active = null;
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error));
      this.schedule();
    });
    worker.on("error", (error) => this.failWorker(worker, error));
    worker.on("exit", (code) => {
      if (!this.closed && this.worker === worker) {
        this.failWorker(
          worker,
          new Error(`The artwork worker stopped with exit code ${code}.`),
        );
      }
    });
    this.worker = worker;
    return worker;
  }

  private failWorker(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.active?.reject(error);
    this.active = null;
    void worker.terminate();
    this.schedule();
  }

  private async write(hash: string, data: Uint8Array): Promise<void> {
    await this.ensureDirectory();
    const target = this.filePath(hash);
    try {
      await stat(target);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      try {
        await stat(target);
      } catch {
        throw error;
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private filePath(hash: string): string {
    return path.join(this.directory, `${hash}.webp`);
  }

  private ensureDirectory(): Promise<void> {
    this.directoryReady ??= mkdir(this.directory, {
      mode: 0o700,
      recursive: true,
    }).then(() => undefined);
    return this.directoryReady;
  }
}
