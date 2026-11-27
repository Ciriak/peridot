import { PERIDOT_VERSION } from "./version.js";

export interface SentryRuntimeOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
}

export function resolveSentryRuntimeOptions(
  environment: NodeJS.ProcessEnv,
): SentryRuntimeOptions | null {
  const dsn = environment.SENTRY_DSN?.trim();
  if (!dsn) return null;

  const runtimeEnvironment =
    environment.SENTRY_ENVIRONMENT?.trim() ||
    environment.PERIDOT_ENVIRONMENT?.trim() ||
    environment.NODE_ENV?.trim() ||
    "development";
  const release =
    environment.SENTRY_RELEASE?.trim() ||
    environment.PERIDOT_BUILD_TAG?.trim() ||
    `peridot-server@${PERIDOT_VERSION}`;

  return {
    dsn,
    environment: runtimeEnvironment,
    release,
    tracesSampleRate: runtimeEnvironment === "production" ? 0.1 : 1,
  };
}
