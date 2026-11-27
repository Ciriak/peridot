import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as Sentry from "@sentry/node";
import { serializeError, summarizeError } from "./error-format.js";

const SENTRY_FLUSH_TIMEOUT_MS = 2_000;
const PINO_ERROR_LEVEL = 50;

export interface SentryCaptureContext {
  level: "error" | "fatal";
  tags: Record<string, string>;
  contexts: Record<string, Record<string, unknown>>;
}

interface SentryDependencies {
  isInitialized(): boolean;
  captureException(
    error: unknown,
    context: SentryCaptureContext,
  ): string | undefined;
  captureMessage(
    message: string,
    context: SentryCaptureContext,
  ): string | undefined;
  flush(timeout: number): PromiseLike<boolean>;
}

interface FailureLogDependencies {
  writeStderr(value: string): void;
  appendFile(filePath: string, value: string): Promise<void>;
}

interface FailureReportingDependencies {
  sentry: SentryDependencies;
  log: FailureLogDependencies;
}

export interface FatalFailureOptions {
  message: string;
  component: "database" | "server";
  operation: "migration" | "restart" | "startup";
  fields?: Record<string, unknown>;
  logFilePath?: string;
}

const defaultDependencies: FailureReportingDependencies = {
  sentry: {
    isInitialized: () => Sentry.isInitialized(),
    captureException: (error, context) =>
      Sentry.captureException(error, context),
    captureMessage: (message, context) =>
      Sentry.captureMessage(message, context),
    flush: (timeout) => Sentry.flush(timeout),
  },
  log: {
    writeStderr: (value) => {
      process.stderr.write(value);
    },
    appendFile: async (filePath, value) => {
      await mkdir(path.dirname(filePath), {
        recursive: true,
        mode: 0o700,
      });
      await appendFile(filePath, value, {
        encoding: "utf8",
        mode: 0o600,
      });
    },
  },
};

function captureContext(
  level: "error" | "fatal",
  component: FatalFailureOptions["component"] | "background-worker",
  operation: string,
  fields: Record<string, unknown> = {},
): SentryCaptureContext {
  return {
    level,
    tags: {
      component,
      operation,
      service: "peridot-server",
    },
    contexts: {
      failure: fields,
    },
  };
}

function reportingErrorMessage(error: unknown): string {
  return summarizeError(error) ?? "Unknown Sentry reporting error.";
}

function writeStderr(
  dependencies: FailureReportingDependencies,
  value: string,
): void {
  try {
    dependencies.log.writeStderr(value);
  } catch {
    // The original fatal error must remain the process outcome.
  }
}

export async function reportFatalFailure(
  error: unknown,
  options: FatalFailureOptions,
  dependencies: FailureReportingDependencies = defaultDependencies,
): Promise<void> {
  const summary = summarizeError(error);
  const message = summary ? `${options.message} ${summary}` : options.message;
  let sentryEnabled = false;
  let eventId: string | undefined;
  let captureError: string | undefined;
  let flushed: boolean | null = null;
  let flushError: string | undefined;

  try {
    sentryEnabled = dependencies.sentry.isInitialized();
  } catch (reportingError) {
    captureError = reportingErrorMessage(reportingError);
  }

  if (sentryEnabled) {
    try {
      eventId = dependencies.sentry.captureException(
        error,
        captureContext(
          "fatal",
          options.component,
          options.operation,
          options.fields,
        ),
      );
    } catch (reportingError) {
      captureError = reportingErrorMessage(reportingError);
    }

    if (eventId) {
      try {
        flushed = await dependencies.sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
      } catch (reportingError) {
        flushError = reportingErrorMessage(reportingError);
      }
    }
  }

  const baseRecord = {
    ...options.fields,
    time: Date.now(),
    level: PINO_ERROR_LEVEL,
    pid: process.pid,
    msg: message,
    service: "peridot-server",
    component: options.component,
    operation: options.operation,
    error: serializeError(error),
    sentry: {
      enabled: sentryEnabled,
      eventId: eventId ?? null,
      flushRequested: eventId !== undefined,
      flushed,
      ...(captureError ? { captureError } : {}),
      ...(flushError ? { flushError } : {}),
    },
  };
  function serializeLine(record: Record<string, unknown>): string {
    try {
      return `${JSON.stringify(record)}\n`;
    } catch (serializationError) {
      return `${JSON.stringify({
        time: baseRecord.time,
        level: baseRecord.level,
        pid: baseRecord.pid,
        msg: baseRecord.msg,
        service: baseRecord.service,
        component: baseRecord.component,
        operation: baseRecord.operation,
        error: baseRecord.error,
        sentry: baseRecord.sentry,
        serializationError: reportingErrorMessage(serializationError),
      })}\n`;
    }
  }

  const line = serializeLine(baseRecord);
  let fileError: string | undefined;
  if (options.logFilePath) {
    try {
      await dependencies.log.appendFile(options.logFilePath, line);
    } catch (loggingError) {
      fileError = reportingErrorMessage(loggingError);
    }
  }

  if (fileError) {
    writeStderr(
      dependencies,
      serializeLine({
        ...baseRecord,
        logging: { fileError },
      }),
    );
    return;
  }
  writeStderr(dependencies, line);
}

export function captureBackgroundError(
  message: string,
  operation: "source-refresh" | "task" | "update-check",
  fields: Record<string, unknown> = {},
  sentry: SentryDependencies = defaultDependencies.sentry,
): string | undefined {
  try {
    if (!sentry.isInitialized()) return undefined;
    return sentry.captureMessage(
      message,
      captureContext("error", "background-worker", operation, fields),
    );
  } catch {
    return undefined;
  }
}

export async function flushSentry(
  sentry: Pick<
    SentryDependencies,
    "isInitialized" | "flush"
  > = defaultDependencies.sentry,
): Promise<boolean> {
  try {
    if (!sentry.isInitialized()) return true;
    return await sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
  } catch {
    return false;
  }
}
