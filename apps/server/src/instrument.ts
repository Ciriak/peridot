import * as Sentry from "@sentry/node";
import { resolveSentryRuntimeOptions } from "./sentry-options.js";

const options = resolveSentryRuntimeOptions(process.env);

if (options) {
  Sentry.init({
    ...options,
    integrations: [
      Sentry.pinoIntegration({
        log: { levels: ["error", "fatal"] },
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
      tags: { service: "peridot-server" },
    },
  });
}
