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
  assert.match(onboarding, /<img :src="logo" :alt="t\('app\.name'\)"/);
});

test("startup shows the shared brand spinner on a full black splash screen", async () => {
  const [app, splash, preHydrationSplash, spinner, logo, config] =
    await Promise.all([
      readFile(new URL("../app/app.vue", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/AppSplashScreen.vue", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/spa-loading-template.html", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../packages/ui/src/assets/brand/spinner.svg",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../packages/ui/src/assets/brand/logo.svg",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    ]);

  assert.match(
    app,
    /<AppSplashScreen \/>[\s\S]*?<NuxtLayout>/,
    "The splash mounts before the application shell",
  );
  assert.match(
    splash,
    /class="fixed inset-0 z-50 grid place-items-center bg-black"/,
    "The splash covers the viewport with a black background",
  );
  assert.match(
    splash,
    /<PeridotSpinner :label="t\('common\.loading'\)" class="size-20" \/>/,
    "The shared Peridot spinner is centered during startup",
  );
  assert.match(
    splash,
    /const splashVisible = ref\(true\)/,
    "The splash is visible on the first application render",
  );
  assert.match(
    splash,
    /setTimeout\(\(\) => \{\s+splashVisible\.value = false;\s+\}, SPLASH_DURATION_MS\)/,
    "The mounted application clears the splash after its startup interval",
  );
  assert.match(
    preHydrationSplash,
    /class="fixed inset-0 z-50 grid place-items-center bg-black"/,
    "The initial HTML covers the viewport before Vue loads",
  );
  assert.match(
    preHydrationSplash,
    /role="status"\s+aria-label="Loading"/,
    "The pre-hydration splash exposes a loading status",
  );
  assert.doesNotMatch(
    preHydrationSplash,
    /<style\b|\sstyle=/i,
    "The static startup template uses no custom styling",
  );

  const preHydrationPaths = [
    ...preHydrationSplash.matchAll(
      /<path\s+fill="currentColor"\s+d="([^"]+)"/g,
    ),
  ].map((match) => match[1]);
  assert.equal(
    preHydrationPaths[0],
    spinner.match(/<path\s+fill="#00a63e"\s+d="([^"]+)"/)?.[1],
    "The pre-hydration mark matches the shared Peridot spinner geometry",
  );
  assert.equal(
    preHydrationPaths[1],
    logo.match(/<path\s+fill="currentColor"\s+d="([^"]+)"/)?.[1],
    "The reduced-motion pre-hydration mark matches the shared static logo",
  );
  assert.match(
    config,
    /background_color: "#000000"/,
    "The installed app uses the same black background before the client paints",
  );
});
