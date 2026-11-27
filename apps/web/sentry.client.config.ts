import * as Sentry from "@sentry/nuxt";
import { useRuntimeConfig } from "#imports";
import { resolveBrowserSentryOptions } from "./app/lib/sentry";

const runtimeConfig = useRuntimeConfig();
const options = resolveBrowserSentryOptions({
  dsn: String(runtimeConfig.public.sentry.dsn ?? ""),
  environment: String(runtimeConfig.public.environment),
  release: String(runtimeConfig.public.clientVersion),
});

if (options) {
  Sentry.init({
    ...options,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
      Sentry.consoleLoggingIntegration({
        levels: ["warn", "error"],
      }),
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    initialScope: {
      tags: { service: "peridot-web" },
    },
  });
}
