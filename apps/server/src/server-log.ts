import {
  createReadStream,
  createWriteStream,
  type WriteStream,
} from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { DEFAULT_FILE_LOG_RETENTION_DAYS } from "@peridot/contracts";
import { sqliteFilePath } from "./database.js";

const MAX_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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

const PINO_LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function levelName(level: unknown): string {
  if (typeof level === "number") return PINO_LEVELS[level] ?? "log";
  if (typeof level === "string" && level.trim()) {
    return level.trim().toLowerCase();
  }
  return "log";
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

function recordTime(record: Record<string, unknown>): number | null {
  if (typeof record.time === "number" && Number.isFinite(record.time)) {
    return record.time;
  }
  if (typeof record.time === "string") {
    const parsed = Date.parse(record.time);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function entryFromRecord(
  record: Record<string, unknown>,
): Omit<ServerLogEntry, "id"> | null {
  const time = recordTime(record);
  const message = describe(record).trim();
  if (time === null || !message) return null;
  return {
    time: new Date(time).toISOString(),
    level: levelName(record.level),
    message,
  };
}

function fileRecord(entry: ServerLogEntry): string {
  return `${JSON.stringify({
    time: Date.parse(entry.time),
    level: PINO_LEVEL_VALUES[entry.level] ?? PINO_LEVEL_VALUES.info,
    msg: entry.message,
  })}\n`;
}

function isLogLineWithinRetention(line: string, cutoff: number): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  try {
    const record = JSON.parse(trimmed) as Record<string, unknown>;
    const time = recordTime(record);
    return time === null || time >= cutoff;
  } catch {
    return true;
  }
}

export async function pruneFileLog(
  filePath: string,
  retentionDays: number,
  now = Date.now(),
): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!content) return false;

  const cutoff = now - retentionDays * DAY_MS;
  const lines = content.split(/\r?\n/);
  const retained = lines.filter((line) =>
    isLogLineWithinRetention(line, cutoff),
  );
  if (retained.length === lines.length) return false;

  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, retained.join("\n"), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return true;
}

export class ServerLogBuffer {
  private entries: ServerLogEntry[] = [];
  private nextId = Date.now();
  private entryListener: ((entry: ServerLogEntry) => void) | null = null;
  private fileStream: WriteStream | null = null;
  private fileLoggingEnabled = false;
  private fileLogRetentionDays = DEFAULT_FILE_LOG_RETENTION_DAYS;
  private pendingFileText = "";
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private historyLoaded = false;
  readonly stream: Writable;

  constructor(readonly filePath = path.resolve("peridot.log")) {
    this.stream = new Writable({
      write: (chunk, _encoding, callback) => {
        const text = chunk.toString();
        process.stdout.write(text);
        this.writeToFile(text);
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const record = JSON.parse(trimmed) as Record<string, unknown>;
            const entry = entryFromRecord(record);
            if (entry) this.push({ id: this.allocateId(), ...entry });
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
      id: this.allocateId(),
      time: new Date().toISOString(),
      level,
      message,
    };
    this.push(entry);
    this.writeToFile(fileRecord(entry));
    return entry;
  }

  async loadPersistedHistory(): Promise<number> {
    if (this.historyLoaded) return 0;
    this.historyLoaded = true;

    const recovered: Array<Omit<ServerLogEntry, "id">> = [];
    try {
      const lines = createInterface({
        input: createReadStream(this.filePath, { encoding: "utf8" }),
        crlfDelay: Number.POSITIVE_INFINITY,
      });
      for await (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as Record<string, unknown>;
          const entry = entryFromRecord(record);
          if (!entry) continue;
          recovered.push(entry);
          if (recovered.length > MAX_ENTRIES) recovered.shift();
        } catch {
          // Ignore legacy or interleaved non-JSON output.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }

    if (!recovered.length) return 0;
    const entries = [
      ...recovered,
      ...this.entries.map(({ time, level, message }) => ({
        time,
        level,
        message,
      })),
    ].slice(-MAX_ENTRIES);
    this.entries = entries.map((entry) => ({
      id: this.allocateId(),
      ...entry,
    }));
    return recovered.length;
  }

  async configureFileLogging(
    enabled: boolean,
    retentionDays = DEFAULT_FILE_LOG_RETENTION_DAYS,
  ): Promise<void> {
    this.fileLoggingEnabled = enabled;
    this.fileLogRetentionDays = retentionDays;
    this.clearRetentionTimer();
    await this.closeFileLogging();
    if (!enabled) {
      this.pendingFileText = "";
      return;
    }

    await pruneFileLog(this.filePath, retentionDays);
    await this.openFileLogging();
    this.retentionTimer = setInterval(() => {
      void this.pruneAndReopenFileLogging().catch((error: unknown) => {
        process.stderr.write(
          `Peridot log retention error: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      });
    }, RETENTION_CHECK_INTERVAL_MS);
    this.retentionTimer.unref();
  }

  async close(): Promise<void> {
    this.fileLoggingEnabled = false;
    this.pendingFileText = "";
    this.clearRetentionTimer();
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

  private allocateId(): number {
    const id = this.nextId;
    this.nextId = Math.max(this.nextId + 1, Date.now());
    return id;
  }

  private writeToFile(text: string) {
    if (this.fileStream) {
      this.fileStream.write(text);
    } else if (this.fileLoggingEnabled) {
      this.pendingFileText += text;
    }
  }

  private async openFileLogging(): Promise<void> {
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
    if (this.pendingFileText) {
      stream.write(this.pendingFileText);
      this.pendingFileText = "";
    }
  }

  private async pruneAndReopenFileLogging(): Promise<void> {
    if (!this.fileLoggingEnabled) return;
    await this.closeFileLogging();
    try {
      await pruneFileLog(this.filePath, this.fileLogRetentionDays);
    } finally {
      await this.openFileLogging();
    }
  }

  private async closeFileLogging(): Promise<void> {
    const stream = this.fileStream;
    this.fileStream = null;
    if (!stream) return;
    await new Promise<void>((resolve) => stream.end(resolve));
  }

  private clearRetentionTimer() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    this.retentionTimer = null;
  }
}

export function serverLogFilePath(databaseUrl: string): string {
  return path.join(path.dirname(sqliteFilePath(databaseUrl)), "peridot.log");
}
