import assert from "node:assert/strict";
import test from "node:test";
import { resolveServerRuntimeOptions } from "../src/start.js";

const defaultWebRoot = "/srv/peridot/web";

test("server runtime serves the web application on its default port", () => {
  assert.deepEqual(resolveServerRuntimeOptions({}, defaultWebRoot), {
    port: 17430,
    host: "127.0.0.1",
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
        PERIDOT_SERVE_WEB: "false",
        PERIDOT_WEB_DIST: "/tmp/peridot-web",
      },
      defaultWebRoot,
    ),
    {
      port: 18430,
      host: "0.0.0.0",
      serveWeb: false,
      webRoot: "/tmp/peridot-web",
    },
  );
});
