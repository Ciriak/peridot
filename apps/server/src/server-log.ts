import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { sqliteFilePath } from "./database.js";

const MAX_ENTRIES = 500;

export interface ServerLogEntry {
  id: number;
  time: string;
  level: string;
  message: string;
}

const PINO_LEVELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

function levelName(level: unknown): string {
  return typeof level === "number" ? (PINO_LEVELS[level] ?? "log") : "log";
}

function describe(record: Record<string, unknown>): string {
  if (
    record.msg === "request completed" &&
    typeof record.req === "object" &&
    record.req !== null &&
    typeof record.res === "object" &&
    record.res !== null
  ) {
    const request = record.req as Record<string, unknown>;
    const response = record.res as Record<string, unknown>;
    const responseTime =
      typeof record.responseTime === "number" ? record.responseTime : "?";
    return `${String(request.method ?? "")} ${String(request.url ?? "")} ${String(response.statusCode ?? "")} (${responseTime}ms)`;
  }
  return typeof record.msg === "string" ? record.msg : "";
}

export class ServerLogBuffer {
  private entries: ServerLogEntry[] = [];
  private nextId = 1;
  private entryListener: ((entry: ServerLogEntry) => void) | null = null;
  private fileStream: WriteStream | null = null;
  readonly stream: Writable;

  constructor(readonly filePath = path.resolve("peridot.log")) {
    this.stream = new Writable({
      write: (chunk, _encoding, callback) => {
        const text = chunk.toString();
        process.stdout.write(text);
        this.fileStream?.write(text);
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const record = JSON.parse(trimmed) as Record<string, unknown>;
            this.push({
              id: this.nextId++,
              time: new Date(Number(record.time) || Date.now()).toISOString(),
              level: levelName(record.level),
              message: describe(record),
            });
          } catch {
            // Ignore non-JSON log lines.
          }
        }
        callback();
      },
    });
  }

  add(level: string, message: string): ServerLogEntry {
    const entry: ServerLogEntry = {
      id: this.nextId++,
      time: new Date().toISOString(),
      level,
      message,
    };
    this.push(entry);
    this.fileStream?.write(
      `${JSON.stringify({
        time: Date.parse(entry.time),
        level,
        msg: message,
      })}\n`,
    );
    return entry;
  }

  async configureFileLogging(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.closeFileLogging();
      return;
    }
    if (this.fileStream) return;

    await mkdir(path.dirname(this.filePath), { recursive: true });
    const stream = createWriteStream(this.filePath, {
      flags: "a",
      encoding: "utf8",
    });
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        stream.off("error", onError);
        resolve();
      };
      const onError = (error: Error) => {
        stream.off("open", onOpen);
        reject(error);
      };
      stream.once("open", onOpen);
      stream.once("error", onError);
    });
    stream.on("error", (error) => {
      if (this.fileStream === stream) this.fileStream = null;
      process.stderr.write(`Peridot log file error: ${error.message}\n`);
    });
    this.fileStream = stream;
  }

  async close(): Promise<void> {
    await this.closeFileLogging();
  }

  onEntry(listener: ((entry: ServerLogEntry) => void) | null) {
    this.entryListener = listener;
  }

  list(afterId = 0): ServerLogEntry[] {
    return this.entries.filter((entry) => entry.id > afterId);
  }

  private push(entry: ServerLogEntry) {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.entryListener?.(entry);
  }

  private async closeFileLogging(): Promise<void> {
    const stream = this.fileStream;
    this.fileStream = null;
    if (!stream) return;
    await new Promise<void>((resolve) => stream.end(resolve));
  }
}

export function serverLogFilePath(databaseUrl: string): string {
  return path.join(path.dirname(sqliteFilePath(databaseUrl)), "peridot.log");
}
