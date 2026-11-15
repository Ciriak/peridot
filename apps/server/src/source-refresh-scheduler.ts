import type { SourceRefreshSettingsResponse } from "@peridot/contracts";
import { Cron } from "croner";
import type { Database } from "./database.js";
import {
  readSourceRefreshSettings,
  type SourceRefreshSettings,
} from "./server-settings.js";
import type { TaskLogPublisher, TaskService } from "./tasks.js";
import { queueLibraryScan } from "./tasks.js";

const ACTIVE_SCAN_STATUSES = ["queued", "running"] as const;

export class SourceRefreshScheduler {
  private job: Cron | null = null;
  private startupRefresh: ReturnType<typeof setImmediate> | null = null;
  private settings: SourceRefreshSettings | null = null;
  private closed = false;

  constructor(
    private readonly database: Database,
    private readonly tasks: TaskService,
    private readonly log?: TaskLogPublisher,
  ) {}

  async initialize(active: boolean): Promise<SourceRefreshSettingsResponse> {
    this.settings = await readSourceRefreshSettings(this.database);
    if (active) this.apply(this.settings, true);
    return this.status();
  }

  async reconfigure(
    settings: SourceRefreshSettings,
  ): Promise<SourceRefreshSettingsResponse> {
    this.settings = settings;
    if (!this.closed) this.apply(settings, false);
    return this.status();
  }

  status(): SourceRefreshSettingsResponse {
    const settings = this.settings ?? {
      enabled: false,
      cron: "",
    };
    const nextRun = this.job?.nextRun();
    return {
      enabled: settings.enabled,
      cron: settings.cron,
      nextRunAt: settings.enabled ? (nextRun?.toISOString() ?? null) : null,
    };
  }

  close(): void {
    this.closed = true;
    this.cancelStartupRefresh();
    this.job?.stop();
    this.job = null;
  }

  private apply(settings: SourceRefreshSettings, startup: boolean): void {
    this.cancelStartupRefresh();
    this.job?.stop();
    this.job = null;
    if (!settings.enabled) return;

    if (startup) {
      this.startupRefresh = setImmediate(() => {
        this.startupRefresh = null;
        void this.queueRefresh();
      });
      this.startupRefresh.unref?.();
    }

    this.job = new Cron(
      settings.cron,
      {
        mode: "5-or-6-parts",
        protect: true,
        unref: true,
        catch: (error) => {
          this.log?.(
            "warn",
            `Automatic source refresh could not be scheduled: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        },
      },
      async () => {
        await this.queueRefresh();
      },
    );
  }

  private async queueRefresh(): Promise<void> {
    if (this.closed) return;
    try {
      const active = await this.database.orm.Task.where({
        kind: "library_scan",
      })
        .where((task) => task.status.in([...ACTIVE_SCAN_STATUSES]))
        .first();
      if (active || this.closed) return;
      await queueLibraryScan(this.tasks);
    } catch (error) {
      this.log?.(
        "warn",
        `Automatic source refresh could not be queued: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private cancelStartupRefresh(): void {
    if (!this.startupRefresh) return;
    clearImmediate(this.startupRefresh);
    this.startupRefresh = null;
  }
}
