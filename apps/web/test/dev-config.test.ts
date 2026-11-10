import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nuxt pre-bundles dependencies discovered by the first onboarding render", async () => {
  const source = await readFile(
    new URL("../nuxt.config.ts", import.meta.url),
    "utf8",
  );
  for (const dependency of [
    "@iconify/vue/offline",
    "@iconify-icons/basil/caret-down-outline",
    "@iconify-icons/basil/caret-right-outline",
    "@iconify-icons/basil/filter-outline",
    "@iconify-icons/basil/folder-outline",
    "@iconify-icons/basil/move-outline",
    "@iconify-icons/basil/refresh-outline",
    "@iconify-icons/basil/server-outline",
    "@iconify-icons/basil/settings-outline",
    "@iconify-icons/basil/user-outline",
    "@peridot/ui/components/ui/badge",
    "@peridot/ui/components/ui/button",
    "@peridot/ui/components/ui/gradient",
    "@peridot/ui/components/ui/input",
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
});
