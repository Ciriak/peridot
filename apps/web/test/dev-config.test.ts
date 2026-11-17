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
    "nuxt dev --host 127.0.0.1 --port 80",
    "Nuxt development must use the default web port",
  );
  assert.match(source, /devProxy:/);
  assert.match(source, /"\/api":\s*\{/);
  assert.match(source, /target: "http:\/\/127\.0\.0\.1:17430\/api"/);
  const rootPackage = JSON.parse(rootPackageSource) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    rootPackage.scripts?.dev ?? "",
    /PORT=17430 PERIDOT_SERVE_WEB=false/,
    "The development API must remain on the server port",
  );
  assert.match(
    rootPackage.scripts?.["dev:server"] ?? "",
    /PORT=17430 PERIDOT_SERVE_WEB=false/,
    "Standalone development server startup must use the server port",
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
