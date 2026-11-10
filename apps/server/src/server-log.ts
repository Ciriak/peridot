import { Writable } from "node:stream";

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
  readonly stream: Writable;

  constructor() {
    this.stream = new Writable({
      write: (chunk, _encoding, callback) => {
        const text = chunk.toString();
        process.stdout.write(text);
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const record = JSON.parse(trimmed) as Record<string, unknown>;
            this.entries.push({
              id: this.nextId++,
              time: new Date(Number(record.time) || Date.now()).toISOString(),
              level: levelName(record.level),
              message: describe(record),
            });
            if (this.entries.length > MAX_ENTRIES) {
              this.entries.splice(0, this.entries.length - MAX_ENTRIES);
            }
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
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    return entry;
  }

  list(afterId = 0): ServerLogEntry[] {
    return this.entries.filter((entry) => entry.id > afterId);
  }
}
