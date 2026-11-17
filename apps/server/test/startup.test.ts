import assert from "node:assert/strict";
import test from "node:test";
import { resolveServerRuntimeOptions } from "../src/start.js";

const defaultWebRoot = "/srv/peridot/web";

test("server runtime serves the web application on its default port", () => {
  assert.deepEqual(resolveServerRuntimeOptions({}, defaultWebRoot), {
    port: 17430,
    webPort: 80,
    host: "127.0.0.1",
    webHost: "127.0.0.1",
    serveWeb: true,
    webRoot: defaultWebRoot,
  });
});

test("server runtime honors explicit listener and web settings", () => {
  assert.deepEqual(
    resolveServerRuntimeOptions(
      {
        HOST: "0.0.0.0",
        PORT: "18430",
        WEB_HOST: "::",
        WEB_PORT: "18431",
        PERIDOT_SERVE_WEB: "false",
        PERIDOT_WEB_DIST: "/tmp/peridot-web",
      },
      defaultWebRoot,
    ),
    {
      port: 18430,
      webPort: 18431,
      host: "0.0.0.0",
      webHost: "::",
      serveWeb: false,
      webRoot: "/tmp/peridot-web",
    },
  );
});
