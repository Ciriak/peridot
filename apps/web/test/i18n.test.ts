import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createI18n } from "vue-i18n";

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
    else if (/\.(ts|vue)$/.test(entry.name)) files.push(file);
  }
  return files;
}

test("en-US is the fixed, unprefixed locale", async () => {
  const [config, english] = await Promise.all([
    readFile(new URL("../nuxt.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../i18n/locales/en-US.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /modules: \["@nuxtjs\/i18n", "@vite-pwa\/nuxt"\]/);
  assert.match(config, /defaultLocale: "en-US"/);
  assert.match(config, /strategy: "no_prefix"/);
  assert.match(config, /detectBrowserLanguage: false/);
  assert.match(config, /htmlAttrs: \{ class: "dark", lang: "en-US" \}/);
  assert.deepEqual(Object.keys(JSON.parse(english)).length > 0, true);
});

test("en-US messages interpolate and pluralize", () => {
  const english = JSON.parse(
    readFileSync(
      new URL("../i18n/locales/en-US.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  const i18n = createI18n({
    legacy: false,
    locale: "en-US",
    messages: { "en-US": english },
  });

  assert.equal(i18n.global.t("count.track", 1, { count: 1 }), "1 track");
  assert.equal(i18n.global.t("count.track", 3, { count: 3 }), "3 tracks");
  assert.equal(
    i18n.global.t("settings.tasks.progress", {
      percent: 67,
      completed: 8,
      total: 12,
    }),
    "67% (8 of 12)",
  );
  assert.equal(
    i18n.global.t("provider.musicbrainz.contact.placeholder"),
    "you@example.com",
  );
  assert.equal(
    i18n.global.t("player.scanLibrary"),
    "Select a track to get started",
  );
  assert.equal(i18n.global.t("player.openFullscreen"), "Open full player");
  assert.equal(i18n.global.t("player.closeFullscreen"), "Close full player");
  assert.equal(
    i18n.global.t("settings.sources.path"),
    "Server internal folder",
  );
  assert.equal(i18n.global.t("settings.sources.jellyfin"), "Jellyfin instance");
  assert.equal(
    i18n.global.t("trackTable.genres", { genres: "Electronic, Ambient" }),
    "Genres: Electronic, Ambient",
  );
  assert.equal(i18n.global.t("count.file", { count: 1 }, 1), "1 file");
  assert.equal(i18n.global.t("count.file", { count: 2 }, 2), "2 files");
  assert.equal(
    i18n.global.t("settings.sources.lastSync", { date: "Nov 13, 2026" }),
    "Last sync Nov 13, 2026",
  );
  assert.equal(i18n.global.te("settings.sources.externalUrl"), false);
  assert.equal(i18n.global.te("settings.sources.integrationsPending"), false);
});

test("every en-US message compiles", () => {
  const english = JSON.parse(
    readFileSync(
      new URL("../i18n/locales/en-US.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  const i18n = createI18n({
    legacy: false,
    locale: "en-US",
    messages: { "en-US": english },
  });
  const translate = i18n.global.t as (
    key: string,
    plural?: number | Record<string, string | number>,
    named?: Record<string, string | number>,
  ) => string;

  for (const [key, message] of Object.entries(english)) {
    assert.doesNotThrow(
      () =>
        message.includes("|")
          ? translate(key, 1, { count: 1 })
          : translate(key),
      key,
    );
  }
});

test("all runtime message keys resolve to en-US resources", async () => {
  const english = JSON.parse(
    await readFile(
      new URL("../i18n/locales/en-US.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;
  const roots = [
    fileURLToPath(new URL("../app", import.meta.url)),
    fileURLToPath(new URL("../../server/src", import.meta.url)),
  ];
  const keys = new Set<string>();

  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
        keys.add(match[1]!);
      }
      for (const match of source.matchAll(
        /(?:message|localizedError)\(\s*["']([^"']+)["']/g,
      )) {
        keys.add(match[1]!);
      }
    }
  }

  const missing = [...keys].filter(
    (key) => !english[key] && !english[`${key}_one`],
  );
  assert.deepEqual(missing, []);
});

test("en-US date formatting uses an explicit locale", async () => {
  const config = await readFile(
    new URL("../i18n/i18n.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(config, /"en-US": \{/);
  assert.match(config, /dateStyle: "medium"/);
  assert.match(config, /timeStyle: "short"/);
  assert.equal(
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).resolvedOptions()
      .locale,
    "en-US",
  );
});
