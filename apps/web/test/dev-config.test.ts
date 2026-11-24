import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nuxt pre-bundles dependencies discovered by the first onboarding render", async () => {
  const [source, packageSource, rootPackageSource] = await Promise.all([
    readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ]);
  for (const dependency of [
    "@iconify/vue/offline",
    "@iconify-icons/basil/caret-down-outline",
    "@iconify-icons/basil/caret-right-outline",
    "@iconify-icons/basil/filter-outline",
    "@iconify-icons/basil/folder-outline",
    "@iconify-icons/basil/logout-outline",
    "@iconify-icons/basil/move-outline",
    "@iconify-icons/basil/refresh-outline",
    "@iconify-icons/basil/server-outline",
    "@iconify-icons/basil/settings-outline",
    "@iconify-icons/basil/user-outline",
    "@iconify-icons/basil/volume-up-outline",
    "@iconify-icons/mdi/cd-rom",
    "@peridot/ui/components/ui/badge",
    "@peridot/ui/components/ui/button",
    "@peridot/ui/components/ui/gradient",
    "@peridot/ui/components/ui/input",
    "@peridot/ui/components/ui/scrolling-text",
    "@peridot/ui/components/ui/slider",
    "@vueuse/core",
    "class-variance-authority",
    "cn",
    "reka-ui",
    "ts-md5",
  ]) {
    assert.match(source, new RegExp(dependency.replace("/", "\\/")));
  }
  assert.match(source, /optimizeDeps: \{ include: optimizedDependencies \}/);

  const packageJson = JSON.parse(packageSource) as {
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.dev,
    "nuxt dev --host 127.0.0.1 --port 17430",
    "Nuxt development must use the public Peridot port",
  );
  assert.match(source, /devProxy:/);
  assert.match(source, /"\/api":\s*\{/);
  assert.match(source, /target: "http:\/\/127\.0\.0\.1:17431\/api"/);
  const rootPackageJson = JSON.parse(rootPackageSource) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    rootPackageJson.scripts?.dev ?? "",
    /cross-env PORT=17431 PERIDOT_SERVE_WEB=false/,
    "The development API must use the private port targeted by Nuxt's /api proxy",
  );
  assert.match(
    rootPackageJson.scripts?.["dev:server"] ?? "",
    /cross-env PORT=17431 PERIDOT_SERVE_WEB=false/,
    "The standalone development API must use the same private proxy port",
  );
  assert.equal(
    packageJson.scripts?.build,
    "nuxt generate",
    "The standard web build must emit the static shell served by the server",
  );
  assert.equal(
    packageJson.devDependencies?.["@lucide/vue"],
    "^1.71.0",
    "@lucide/vue must resolve from the web workspace for Vite optimization",
  );
});

test("Nuxt development exposes Vue DevTools through DevTools v4", async () => {
  const [source, workspace] = await Promise.all([
    readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8"),
  ]);

  assert.match(
    source,
    /devtools: \{\s*enabled: true,\s*vueDevTools: true,\s*mcp: false,\s*\}/,
  );
  assert.match(workspace, /overrides:\s*\n\s*"@nuxt\/devtools": 4\.2\.0/);
});
