import {
  DEFAULT_SCAN_WORKER_COUNT,
  MAX_SCAN_WORKER_COUNT,
  type MessageDescriptor,
  type UpdateServerSettingsRequest,
} from "@peridot/contracts";
import { CronPattern } from "croner";
import type { Database } from "./database.js";
import { message } from "./messages.js";

export const SERVER_SETTING_ID = "server";
export const DEFAULT_SOURCE_REFRESH_CRON = "0 3 * * *";

export interface SourceRefreshSettings {
  enabled: boolean;
  cron: string;
}

export interface FileLoggingSettings {
  enabled: boolean;
}

export interface ScanWorkerSettings {
  workerCount: number;
}

export class ServerSettingsError extends Error {
  readonly messageDescriptor: MessageDescriptor;

  constructor(
    messageText: string,
    messageDescriptor = message("api.message.invalidServerSettings"),
  ) {
    super(messageText);
    this.name = "ServerSettingsError";
    this.messageDescriptor = messageDescriptor;
  }
}

export function validateSourceRefreshSettings(
  input: UpdateServerSettingsRequest["sourceRefresh"] | undefined,
): SourceRefreshSettings {
  if (!input || typeof input.enabled !== "boolean") {
    throw new ServerSettingsError(
      "Choose whether automatic source refresh is enabled.",
      message("api.message.invalidSourceRefreshSettings"),
    );
  }
  const cron = typeof input.cron === "string" ? input.cron.trim() : "";
  if (!cron || cron.length > 100) {
    throw new ServerSettingsError(
      "Enter a valid cron expression.",
      message("api.message.invalidSourceRefreshSettings"),
    );
  }
  try {
    new CronPattern(cron, undefined, { mode: "5-or-6-parts" });
  } catch {
    throw new ServerSettingsError(
      "Enter a valid cron expression.",
      message("api.message.invalidSourceRefreshSettings"),
    );
  }
  return { enabled: input.enabled, cron };
}

export function validateFileLoggingSettings(
  input: UpdateServerSettingsRequest["fileLogging"] | undefined,
): FileLoggingSettings {
  if (!input || typeof input.enabled !== "boolean") {
    throw new ServerSettingsError(
      "Choose whether server logs are kept in a file.",
    );
  }
  return { enabled: input.enabled };
}

export function validateScanWorkerSettings(
  input: UpdateServerSettingsRequest["scanning"] | undefined,
): ScanWorkerSettings {
  if (
    !input ||
    !Number.isSafeInteger(input.workerCount) ||
    input.workerCount < 1 ||
    input.workerCount > MAX_SCAN_WORKER_COUNT
  ) {
    throw new ServerSettingsError(
      `Use between 1 and ${MAX_SCAN_WORKER_COUNT} scan worker threads.`,
      message("api.message.invalidScanWorkerSettings"),
    );
  }
  return { workerCount: input.workerCount };
}

export async function ensureServerSettings(
  database: Database,
  seedLibraryRoot: string,
): Promise<{
  scanning: ScanWorkerSettings;
  sourceRefresh: SourceRefreshSettings;
  fileLogging: FileLoggingSettings;
}> {
  let existing = await database.orm.ServerSetting.first({
    id: SERVER_SETTING_ID,
  });
  if (!existing) {
    existing = await database.orm.ServerSetting.create({
      id: SERVER_SETTING_ID,
      libraryRoot: seedLibraryRoot,
    });
  }
  return {
    scanning: {
      workerCount:
        existing.scanWorkerCount >= 1 &&
        existing.scanWorkerCount <= MAX_SCAN_WORKER_COUNT
          ? existing.scanWorkerCount
          : DEFAULT_SCAN_WORKER_COUNT,
    },
    sourceRefresh: {
      enabled: Boolean(existing.sourceRefreshEnabled),
      cron: existing.sourceRefreshCron,
    },
    fileLogging: {
      enabled: Boolean(existing.fileLoggingEnabled),
    },
  };
}

export async function readScanWorkerSettings(
  database: Database,
): Promise<ScanWorkerSettings> {
  const settings = await database.orm.ServerSetting.first({
    id: SERVER_SETTING_ID,
  });
  const workerCount = settings?.scanWorkerCount;
  return {
    workerCount:
      workerCount !== undefined &&
      Number.isSafeInteger(workerCount) &&
      workerCount >= 1 &&
      workerCount <= MAX_SCAN_WORKER_COUNT
        ? workerCount
        : DEFAULT_SCAN_WORKER_COUNT,
  };
}

export async function readSourceRefreshSettings(
  database: Database,
): Promise<SourceRefreshSettings> {
  const settings = await database.orm.ServerSetting.firstOrThrow({
    id: SERVER_SETTING_ID,
  });
  return {
    enabled: Boolean(settings.sourceRefreshEnabled),
    cron: settings.sourceRefreshCron,
  };
}

export async function updateSourceRefreshSettings(
  database: Database,
  input: UpdateServerSettingsRequest["sourceRefresh"] | undefined,
): Promise<SourceRefreshSettings> {
  const settings = validateSourceRefreshSettings(input);
  await database.orm.ServerSetting.where({ id: SERVER_SETTING_ID }).update({
    sourceRefreshEnabled: settings.enabled ? 1 : 0,
    sourceRefreshCron: settings.cron,
  });
  return settings;
}

export async function readFileLoggingSettings(
  database: Database,
): Promise<FileLoggingSettings> {
  const settings = await database.orm.ServerSetting.firstOrThrow({
    id: SERVER_SETTING_ID,
  });
  return { enabled: Boolean(settings.fileLoggingEnabled) };
}

export async function updateFileLoggingSettings(
  database: Database,
  input: UpdateServerSettingsRequest["fileLogging"] | undefined,
): Promise<FileLoggingSettings> {
  const settings = validateFileLoggingSettings(input);
  await database.orm.ServerSetting.where({ id: SERVER_SETTING_ID }).update({
    fileLoggingEnabled: settings.enabled ? 1 : 0,
  });
  return settings;
}

export async function updateServerSettings(
  database: Database,
  input: UpdateServerSettingsRequest | undefined,
): Promise<{
  scanning?: ScanWorkerSettings;
  sourceRefresh?: SourceRefreshSettings;
  fileLogging?: FileLoggingSettings;
}> {
  const scanning = input?.scanning
    ? validateScanWorkerSettings(input.scanning)
    : undefined;
  const sourceRefresh = input?.sourceRefresh
    ? validateSourceRefreshSettings(input.sourceRefresh)
    : undefined;
  const fileLogging = input?.fileLogging
    ? validateFileLoggingSettings(input.fileLogging)
    : undefined;
  if (!scanning && !sourceRefresh && !fileLogging) {
    throw new ServerSettingsError("Choose a server setting to update.");
  }

  await database.transaction(async (transaction) => {
    if (scanning) {
      await transaction.orm.ServerSetting.where({
        id: SERVER_SETTING_ID,
      }).update({
        scanWorkerCount: scanning.workerCount,
      });
    }
    if (sourceRefresh) {
      await transaction.orm.ServerSetting.where({
        id: SERVER_SETTING_ID,
      }).update({
        sourceRefreshEnabled: sourceRefresh.enabled ? 1 : 0,
        sourceRefreshCron: sourceRefresh.cron,
      });
    }
    if (fileLogging) {
      await transaction.orm.ServerSetting.where({
        id: SERVER_SETTING_ID,
      }).update({
        fileLoggingEnabled: fileLogging.enabled ? 1 : 0,
      });
    }
  });
  return {
    ...(scanning ? { scanning } : {}),
    ...(sourceRefresh ? { sourceRefresh } : {}),
    ...(fileLogging ? { fileLogging } : {}),
  };
}
