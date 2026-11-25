import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";

const rootPackage = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const appEnvironment =
  process.env.PERIDOT_ENVIRONMENT?.trim() ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const capacitorBuild = process.env.PERIDOT_CAPACITOR === "1";
const clientUpdateChannel =
  process.env.PERIDOT_CLIENT_CHANNEL?.trim() || "local";
const clientVersion =
  process.env.PERIDOT_CLIENT_VERSION?.trim() ||
  `${rootPackage.version}-local.0`;
const releaseRepository = "Ciriak/peridot";
const releaseAssetBase =
  clientUpdateChannel === "stable"
    ? `https://github.com/${releaseRepository}/releases/latest/download`
    : clientUpdateChannel === "dev" || clientUpdateChannel === "beta"
      ? `https://github.com/${releaseRepository}/releases/download/client-${clientUpdateChannel}`
      : "";

const optimizedDependencies = [
  "@iconify-icons/akar-icons/drag-vertical",
  "@iconify-icons/akar-icons/arrow-up-right",
  "@iconify-icons/basil/apps-outline",
  "@iconify-icons/basil/caret-down-outline",
  "@iconify-icons/basil/caret-left-outline",
  "@iconify-icons/basil/caret-right-outline",
  "@iconify-icons/basil/caret-up-outline",
  "@iconify-icons/basil/check-outline",
  "@iconify-icons/basil/cloud-check-outline",
  "@iconify-icons/basil/cloud-download-outline",
  "@iconify-icons/basil/cloud-off-outline",
  "@iconify-icons/basil/cross-outline",
  "@iconify-icons/basil/download-outline",
  "@iconify-icons/basil/filter-outline",
  "@iconify-icons/basil/folder-outline",
  "@iconify-icons/basil/heart-outline",
  "@iconify-icons/basil/heart-solid",
  "@iconify-icons/basil/home-outline",
  "@iconify-icons/basil/info-circle-outline",
  "@iconify-icons/basil/info-triangle-outline",
  "@iconify-icons/basil/logout-outline",
  "@iconify-icons/basil/menu-outline",
  "@iconify-icons/basil/move-outline",
  "@iconify-icons/basil/music-outline",
  "@iconify-icons/basil/apps-outline",
  "@iconify-icons/basil/pause-solid",
  "@iconify-icons/basil/plus-outline",
  "@iconify-icons/basil/play-solid",
  "@iconify-icons/basil/refresh-outline",
  "@iconify-icons/basil/rows-outline",
  "@iconify-icons/basil/search-outline",
  "@iconify-icons/basil/server-outline",
  "@iconify-icons/basil/settings-outline",
  "@iconify-icons/basil/shuffle-outline",
  "@iconify-icons/basil/sort-outline",
  "@iconify-icons/basil/skip-next-solid",
  "@iconify-icons/basil/skip-prev-solid",
  "@iconify-icons/basil/stack-outline",
  "@iconify-icons/basil/user-outline",
  "@iconify-icons/basil/volume-up-outline",
  "@iconify-icons/mdi/cd-rom",
  "@iconify-icons/ooui/network-off",
  "@iconify-icons/simple-icons/discogs",
  "@iconify-icons/simple-icons/musicbrainz",
  "@iconify/vue/offline",
  "@lucide/vue",
  "@peridot/ui/components/ui/badge",
  "@peridot/ui/components/ui/button",
  "@peridot/ui/components/ui/context-menu",
  "@peridot/ui/components/ui/gradient",
  "@peridot/ui/components/ui/input",
  "@peridot/ui/components/ui/kbd",
  "@peridot/ui/components/ui/progress-circle",
  "@peridot/ui/components/ui/scrolling-text",
  "@peridot/ui/components/ui/slider",
  "@peridot/ui/components/ui/sonner",
  "@peridot/ui/components/ui/spinner",
  "@peridot/ui/components/ui/switch",
  "@peridot/ui/components/ui/tabs",
  "@tanstack/vue-virtual",
  "@vueuse/core",
  "@xyflow/vue",
  "class-variance-authority",
  "cn",
  "reka-ui",
  "ts-md5",
  "vue-sonner",
  "@tanstack/vue-query",
  "@tanstack/query-persist-client-core",
  "idb-keyval",
];
const pwaBuildRevision = new Date().toISOString();

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-11-10",
  devtools: {
    enabled: true,
    vueDevTools: true,
    mcp: false,
  },
  runtimeConfig: {
    public: {
      appVersion: rootPackage.version,
      environment: appEnvironment,
      clientVersion,
      clientUpdateChannel,
      androidWebReleaseApiUrl:
        clientUpdateChannel === "stable"
          ? `https://api.github.com/repos/${releaseRepository}/releases/latest`
          : clientUpdateChannel === "dev" || clientUpdateChannel === "beta"
            ? `https://api.github.com/repos/${releaseRepository}/releases/tags/client-${clientUpdateChannel}`
            : "",
      desktopUpdateManifestUrl: releaseAssetBase
        ? `${releaseAssetBase}/latest.json`
        : "",
    },
  },
  modules: ["@nuxtjs/i18n", "@vite-pwa/nuxt"],
  nitro: {
    devProxy: {
      "/api": {
        target: "http://127.0.0.1:17431/api",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  i18n: {
    defaultLocale: "en-US",
    strategy: "no_prefix",
    locales: [
      {
        code: "en-US",
        language: "en-US",
        name: "English",
        dir: "ltr",
        file: "en-US.json",
      },
    ],
    langDir: "locales",
    detectBrowserLanguage: false,
    experimental: {
      typedOptionsAndMessages: "all",
    },
  },
  css: ["~/assets/css/tailwind.css"],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { include: optimizedDependencies },
  },
  app: {
    head: {
      title: "Peridot",
      htmlAttrs: { class: "dark", lang: "en-US" },
      link: [{ rel: "manifest", href: "/manifest.webmanifest" }],
    },
  },
  pwa: capacitorBuild
    ? { disable: true }
    : {
        registerType: "autoUpdate",
        client: {
          installPrompt: false,
        },
        devOptions: {
          enabled: false,
        },
        manifest: false,
        workbox: {
          additionalManifestEntries: [{ url: "/", revision: pwaBuildRevision }],
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//],
        },
      },
});
