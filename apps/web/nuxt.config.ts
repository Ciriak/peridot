import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";

const webPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };
const appEnvironment =
  process.env.PERIDOT_ENVIRONMENT?.trim() ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const capacitorBuild = process.env.PERIDOT_CAPACITOR === "1";

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
  "@iconify-icons/basil/info-triangle-outline",
  "@iconify-icons/basil/logout-outline",
  "@iconify-icons/basil/menu-outline",
  "@iconify-icons/basil/move-outline",
  "@iconify-icons/basil/music-outline",
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
  "@peridot/ui/components/ui/spinner",
  "@peridot/ui/components/ui/switch",
  "@vueuse/core",
  "class-variance-authority",
  "cn",
  "reka-ui",
  "ts-md5",
  "@tanstack/vue-query",
  "@tanstack/query-persist-client-core",
  "idb-keyval",
];
const pwaBuildRevision = new Date().toISOString();

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-11-10",
  devtools: { enabled: false },
  runtimeConfig: {
    public: {
      appVersion: webPackage.version,
      environment: appEnvironment,
    },
  },
  modules: ["@nuxtjs/i18n", "@vite-pwa/nuxt"],
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
          enabled: true,
        },
        manifest: {
          name: "Peridot",
          short_name: "Peridot",
          description: "Your music. Your space.",
          theme_color: "#0A0A0A",
          background_color: "#000000",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          additionalManifestEntries: [{ url: "/", revision: pwaBuildRevision }],
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//],
        },
      },
});
