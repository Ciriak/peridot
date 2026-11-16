import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type {
  ScanDirectoryResult,
  ScanWorkerMetadata,
  ScanWorkerPayload,
  ScanWorkerRequest,
  ScanWorkerResponse,
} from "./scan-worker-protocol.js";

interface PendingJob {
  id: number;
  request: ScanWorkerPayload;
  resolve(value: ScanDirectoryResult | ScanWorkerMetadata): void;
  reject(reason: Error): void;
}

interface WorkerSlot {
  worker: Worker;
  job: PendingJob | null;
}

function abortError(): DOMException {
  return new DOMException("The scan worker pool was stopped.", "AbortError");
}

function workerUrl(): URL {
  const sourcePath = fileURLToPath(import.meta.url);
  return new URL(
    sourcePath.endsWith(".ts") ? "./scan-worker.ts" : "./scan-worker.js",
    import.meta.url,
  );
}

export class ScanWorkerPool {
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private nextId = 1;
  private closed = false;
  private closePromise: Promise<void> | null = null;

  constructor(workerCount: number) {
    const count = Math.max(1, Math.floor(workerCount));
    for (let index = 0; index < count; index += 1) {
      this.workers.push(this.createWorker());
    }
  }

  listDirectory(directory: string): Promise<ScanDirectoryResult> {
    return this.run({
      type: "listDirectory",
      directory,
    }) as Promise<ScanDirectoryResult>;
  }

  parseFile(filePath: string): Promise<ScanWorkerMetadata> {
    return this.run({
      type: "parseFile",
      filePath,
    }) as Promise<ScanWorkerMetadata>;
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    const error = abortError();
    for (const job of this.queue.splice(0)) job.reject(error);
    for (const slot of this.workers) {
      slot.job?.reject(error);
      slot.job = null;
    }
    this.closePromise = Promise.allSettled(
      this.workers.map((slot) => slot.worker.terminate()),
    ).then(() => undefined);
    return this.closePromise;
  }

  private createWorker(): WorkerSlot {
    const source = fileURLToPath(import.meta.url).endsWith(".ts");
    const slot = {
      worker: new Worker(workerUrl(), {
        execArgv: source ? ["--import", "tsx"] : [],
      }),
      job: null,
    } satisfies WorkerSlot;
    slot.worker.on("message", (response: ScanWorkerResponse) => {
      this.complete(slot, response);
    });
    slot.worker.on("error", (error) => {
      this.failWorker(slot, error);
    });
    slot.worker.on("exit", (code) => {
      if (!this.closed) {
        this.failWorker(
          slot,
          new Error(`The scan worker stopped with exit code ${code}.`),
        );
      }
    });
    return slot;
  }

  private run(
    request: ScanWorkerPayload,
  ): Promise<ScanDirectoryResult | ScanWorkerMetadata> {
    if (this.closed) return Promise.reject(abortError());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.queue.push({ id, request, resolve, reject });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.closed) return;
    for (const slot of this.workers) {
      if (slot.job) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      slot.worker.postMessage({
        ...job.request,
        id: job.id,
      } satisfies ScanWorkerRequest);
    }
  }

  private complete(slot: WorkerSlot, response: ScanWorkerResponse): void {
    const job = slot.job;
    if (!job || job.id !== response.id) return;
    slot.job = null;
    if (response.ok) {
      job.resolve(response.result);
    } else {
      job.reject(new Error(response.error));
    }
    this.schedule();
  }

  private failWorker(slot: WorkerSlot, error: Error): void {
    if (!this.workers.includes(slot)) return;
    const index = this.workers.indexOf(slot);
    if (index >= 0) this.workers.splice(index, 1);
    slot.job?.reject(error);
    slot.job = null;
    void slot.worker.terminate();
    if (!this.closed && this.workers.length === 0) {
      for (const job of this.queue.splice(0)) job.reject(error);
    }
  }
}
