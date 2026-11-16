import type { UpdateService } from "./updates.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface UpdateCheckSchedulerOptions {
  initialDelayMs?: number;
  initialJitterMs?: number;
  intervalMs?: number;
  jitterMs?: number;
  random?: () => number;
}

export class UpdateCheckScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private stopped = false;
  private readonly initialDelayMs: number;
  private readonly initialJitterMs: number;
  private readonly intervalMs: number;
  private readonly jitterMs: number;
  private readonly random: () => number;

  constructor(
    private readonly updates: UpdateService,
    private readonly logWarning: (message: string) => void,
    options: UpdateCheckSchedulerOptions = {},
  ) {
    this.initialDelayMs = Math.max(0, options.initialDelayMs ?? 60_000);
    this.initialJitterMs = Math.max(0, options.initialJitterMs ?? 60_000);
    this.intervalMs = Math.max(1, options.intervalMs ?? SIX_HOURS_MS);
    this.jitterMs = Math.max(0, options.jitterMs ?? FIVE_MINUTES_MS);
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    if (this.updates.status().channel === "local") return;
    this.schedule(this.initialDelayMs + this.jitter(this.initialJitterMs));
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runCheck();
    }, delayMs);
    this.timer.unref?.();
  }

  private async runCheck(): Promise<void> {
    try {
      await this.updates.check();
    } catch (error) {
      this.logWarning(
        `Automatic update check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      if (!this.stopped) {
        this.schedule(
          Math.max(
            1,
            this.intervalMs - this.jitterMs + this.jitter(this.jitterMs * 2),
          ),
        );
      }
    }
  }

  private jitter(maximum: number): number {
    return maximum > 0 ? Math.floor(this.random() * maximum) : 0;
  }
}
