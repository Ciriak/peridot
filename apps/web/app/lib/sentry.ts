export interface BrowserSentryInput {
  dsn: string;
  environment: string;
  release: string;
}

export interface BrowserSentryOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
}

export function resolveBrowserSentryOptions(
  input: BrowserSentryInput,
): BrowserSentryOptions | null {
  const dsn = input.dsn.trim();
  if (!dsn) return null;

  const isProduction = input.environment === "production";
  return {
    dsn,
    environment: input.environment,
    release: input.release,
    tracesSampleRate: isProduction ? 0.1 : 1,
    replaysSessionSampleRate: isProduction ? 0.1 : 1,
    replaysOnErrorSampleRate: 1,
  };
}
