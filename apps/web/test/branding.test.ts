import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the web app uses the shared favicon and onboarding logo", async () => {
  await access(
    new URL(
      "../../../packages/ui/src/assets/brand/favicon.png",
      import.meta.url,
    ),
  );
  await access(
    new URL("../../../packages/ui/src/assets/brand/logo.svg", import.meta.url),
  );
  const app = await readFile(
    new URL("../app/app.vue", import.meta.url),
    "utf8",
  );
  const onboarding = await readFile(
    new URL("../app/pages/onboarding.vue", import.meta.url),
    "utf8",
  );
  assert.match(app, /@peridot\/ui\/assets\/brand\/favicon\.png/);
  assert.match(app, /rel: "icon", type: "image\/png"/);
  assert.match(onboarding, /@peridot\/ui\/assets\/brand\/logo\.svg/);
  assert.match(onboarding, /<img :src="logo" alt="Peridot"/);
});
